/* ==========================================================================
   moments.js - 朋友圈功能
   梦角与用户均可发布/编辑朋友圈（用户可带图片），支持评论、点赞、红点提醒、
   后台通知。梦角每天自动发帖（至少 2 条），文案来自朋友圈文案库（首次使用时
   注入系统预置文案，可自行修改）与可选的多个字卡库组别，各来源同概率随机；
   评论/回复内容来自朋友圈回复库（同样首次注入、可自行维护）。
   依赖全局（state.js/core.js）：settings, momentsPosts, momentsTexts,
   momentsReplies, momentsSettings, customReplies, window.customReplyGroups,
   optimizeImage, APP_PREFIX, SESSION_ID
   ========================================================================== */
(function () {
    'use strict';

    /* ---------- 常量 ---------- */
    const MAX_IMAGES = 4;
    // 仅用于首次注入朋友圈文案库的预置文案；注入后可在
    // 「设置 → 高级功能 → 回复库管理 → 朋友圈相关 → 朋友圈文案」中随意修改/删除
    const SEED_TEXTS = [
        '今天的风很温柔，像你说话的语气。',
        '午后阳光下打了个盹，梦里全是你。',
        '路过一家咖啡店，闻到拿铁的味道，突然好想和你一起坐坐。',
        '把房间收拾干净了，给你留了一个小小的位置。',
        '晚霞很好看，拍下来想第一时间分享给你。',
        '听了一首老歌，想起我们第一次聊天的样子。',
        '今天有点想你，比昨天多一点，比明天少一点。',
        '月亮升起来了，替我跟你说晚安。'
    ];
    // 仅用于首次注入朋友圈回复库的预置回复；注入后可在
    // 「朋友圈相关 → 朋友圈回复」中随意修改/删除
    const SEED_REPLIES = [
        // 他来评论你发的朋友圈
        '第一条朋友圈就来捧场啦，以后这里也是我们的小天地。',
        '写得好认真，我看了好几遍。',
        '嗯嗯，我在的，一直都在。',
        '看到你发的这些，我今天的心情都变好了。',
        '下次这种事要第一时间告诉我哦。',
        '照片拍得真好看，不过本人更好看。',
        // 他回复你的评论
        '嗯！被你发现了。',
        '你一评论我就想多写一点。',
        '嘻嘻，那你要常来看呀。',
        '好呀，都听你的。',
        '你也在的话，这里才热闹。',
        // 他在自己朋友圈下补充评论
        '发完才发现好像没说清楚，算了，你懂我就好。',
        '补一句：今天也很想你。',
        '这条是顺手记下来的，被你看到也没关系。',
        '写的时候窗外正好有风，就多写了两句。',
        '以后翻到这里的时候，希望我们还是这样。'
    ];

    /* ---------- 内部状态 ---------- */
    let _panel = null;
    let _settingsPop = null;
    let _composerPop = null;
    let _lightbox = null;
    let _composerImages = [];   // 发布弹层中待发送的图片（base64）
    let _unread = 0;
    let _inited = false;

    /* ---------- 工具 ---------- */
    const _esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const _rand = (min, max) => Math.floor(min + Math.random() * (max - min));
    const _pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    function _pName() { return (typeof settings !== 'undefined' && settings.partnerName) || '梦角'; }
    function _mName() { return (typeof settings !== 'undefined' && settings.myName) || '我'; }

    // 多梦角（人设）支持：partnerPersonas 为 [{name, avatar}]
    function _partners() {
        return (typeof partnerPersonas !== 'undefined' && Array.isArray(partnerPersonas))
            ? partnerPersonas : [];
    }
    // 群组模式：开启后朋友圈的全部「梦角行为」（自动发帖、点赞、评论、回复）
    // 都由群组成员执行，名称与头像同步群组成员预设；关闭时维持原有梦角体系
    function _groupMembers() {
        if (typeof groupChatSettings === 'undefined' || !groupChatSettings || !groupChatSettings.enabled) return [];
        return (Array.isArray(groupChatSettings.members) ? groupChatSettings.members : [])
            .filter(m => m && m.name);
    }
    // 随机取一位梦角的名字；群组模式下从群组成员中取，单人（或未配置人设）时就是当前梦角
    function _pickPartnerName() {
        const gm = _groupMembers();
        if (gm.length) return _pick(gm).name;
        const list = _partners().filter(x => x && x.name);
        return list.length ? _pick(list).name : _pName();
    }
    // 帖子归属的梦角名（发布时快照优先，兼容旧数据）
    function _postOwnerName(p) { return (p && p.partnerName) || _pName(); }
    // 评论归属的梦角名（评论快照 → 帖子主人 → 当前梦角）
    function _commentPartnerName(p, c) {
        return (c && c.partnerName) || (p && p.partnerName) || _pName();
    }

    function _avatarSrc(who, partnerName) {
        if (who === 'partner') {
            if (partnerName) {
                // 群组模式：优先用群组成员预设的头像
                const gm = _groupMembers().find(x => x.name === partnerName);
                if (gm && gm.avatar) return gm.avatar;
                // 多人设时按名字找到对应头像
                const hit = _partners().find(x => x && x.name === partnerName);
                if (hit && hit.avatar) return hit.avatar;
            }
            const img = document.querySelector('#partner-avatar img');
            return (img && img.src) ? img.src : null;
        }
        const img = document.querySelector('#my-avatar img');
        return (img && img.src) ? img.src : null;
    }

    function _avatarHtml(who, partnerName) {
        const src = _avatarSrc(who, partnerName);
        if (src) return `<img src="${_esc(src)}" alt="">`;
        return `<i class="fas fa-user"></i>`;
    }

    function _save() {
        try {
            if (typeof throttledSaveData === 'function') throttledSaveData();
            else if (typeof saveData === 'function') saveData();
        } catch (e) { console.warn('[moments] 保存失败', e); }
    }

    function _fmtTime(ts) {
        const d = new Date(ts);
        const now = new Date();
        const diff = (now - d) / 1000;
        const pad = (n) => (n < 10 ? '0' : '') + n;
        if (diff < 60) return '刚刚';
        if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
        if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
        const sameYear = d.getFullYear() === now.getFullYear();
        const md = `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        return sameYear ? md : `${d.getFullYear()}年${md}`;
    }

    /* ---------- 数据 ---------- */
    function _ensureDayCounter() {
        const today = new Date().toDateString();
        if (momentsSettings.lastAutoDate !== today) {
            momentsSettings.lastAutoDate = today;
            momentsSettings.postedToday = 0;
            _save();
        }
    }

    function _hasTalked() {
        // 用户与梦角开始对话后才允许梦角发朋友圈
        return typeof messages !== 'undefined' && Array.isArray(messages) && messages.length > 0;
    }

    function _clearSeedPosts() {
        // 清除早期版本自动播种的样例帖子，朋友圈从空白开始
        const before = momentsPosts.length;
        momentsPosts = momentsPosts.filter(p => !p || typeof p.id !== 'string' || !p.id.startsWith('seed-'));
        if (momentsPosts.length !== before) _save();
    }

    function _ensureSeedTexts() {
        // 首次升级：把系统预置文案并入朋友圈文案库，之后由用户自己维护；
        // 用户删光后不会再次注入（原地写入，保持与存档/管理页同一数组引用）
        if (momentsSettings.seedTextsInited) return;
        SEED_TEXTS.forEach(t => { if (!momentsTexts.includes(t)) momentsTexts.push(t); });
        momentsSettings.seedTextsInited = true;
        _save();
    }

    function _ensureSeedReplies() {
        // 同上：预置回复并入朋友圈回复库，只注入一次
        if (momentsSettings.seedRepliesInited) return;
        SEED_REPLIES.forEach(t => { if (!momentsReplies.includes(t)) momentsReplies.push(t); });
        momentsSettings.seedRepliesInited = true;
        _save();
    }

    // 朋友圈回复库为空时返回 null，调用方应放弃自动评论
    function _pickReplyText() {
        return momentsReplies.length ? _pick(momentsReplies) : null;
    }

    /* ---------- 红点与通知 ---------- */
    function _markUnread() {
        if (_panel && _panel.classList.contains('active')) return;
        _unread++;
        _renderBadge();
    }
    function _clearUnread() {
        _unread = 0;
        _renderBadge();
    }
    function _renderBadge() {
        const badge = document.getElementById('moments-badge');
        if (!badge) return;
        if (_unread > 0) {
            badge.style.display = 'block';
            badge.textContent = _unread > 99 ? '99+' : String(_unread);
        } else {
            badge.style.display = 'none';
        }
    }
    function _notify(text, whoName) {
        try {
            if (typeof window._sendPartnerNotification === 'function') {
                window._sendPartnerNotification(`${whoName || _pName()}的朋友圈`, text);
            }
        } catch (e) {}
    }

    /* ---------- 渲染 ---------- */
    function _renderFeed() {
        if (!_panel) return;
        const feed = _panel.querySelector('.moments-feed');
        if (!feed) return;
        const posts = momentsPosts.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (!posts.length) {
            feed.innerHTML = `
                <div class="moments-empty">
                    <div style="position:relative;margin-bottom:20px;">
                        <i class="fas fa-heart" style="font-size:52px;opacity:0.55;color:var(--accent-color);"></i>
                        <i class="fas fa-comment-dots" style="position:absolute;bottom:-6px;right:-10px;font-size:26px;opacity:0.65;color:var(--accent-color);"></i>
                    </div>
                    <p style="font-size:15px;font-weight:600;color:var(--accent-color);opacity:0.9;letter-spacing:1px;">✦ 暂时还没有朋友圈 ✦</p>
                    <p style="font-size:12px;margin-top:8px;opacity:0.65;letter-spacing:0.5px;color:var(--text-secondary);">快去和他说话吧</p>
                </div>`;
            return;
        }

        feed.innerHTML = posts.map(p => _renderCard(p)).join('');
        _bindCardEvents(feed);
    }

    function _renderCard(p) {
        const ownerName = p.author === 'partner' ? _postOwnerName(p) : _mName();
        const likedByMe = p.likes && p.likes.includes(_mName());
        const imagesHtml = (p.images && p.images.length)
            ? `<div class="moment-images">${p.images.map(src =>
                `<img class="moment-image" src="${_esc(src)}" alt="">`
              ).join('')}</div>`
            : '';
        const commentsHtml = (p.comments && p.comments.length)
            ? `<div class="moment-comments">${p.comments.map(c => {
                // 自己的评论随时可删；他的评论仅在自己的朋友圈下可删（楼主管理）
                const canDelete = c.author === 'user' || p.author === 'user';
                const delBtn = canDelete
                    ? `<button class="moment-comment-delbtn" data-delcid="${_esc(c.id)}" title="删除评论"><i class="fas fa-trash"></i></button>` : '';
                if (c.author === 'partner' && c.replyTo) {
                    // 某位梦角回复用户的评论：显示「XX回复了我：内容」，用户也可以继续回复他
                    const cPName = _commentPartnerName(p, c);
                    return `<div class="moment-comment" data-cid="${_esc(c.id)}"><span class="moment-comment-name partner-reply-name">${_esc(cPName)}回复了我</span>：${_esc(c.text)}<button class="moment-comment-replybtn" data-replyname="${_esc(cPName)}">回复</button>${delBtn}</div>`;
                }
                const cName = c.author === 'partner' ? _commentPartnerName(p, c) : _mName();
                const replyTo = c.replyTo ? `<span class="moment-comment-reply">回复</span><span class="moment-comment-name">${_esc(c.replyTo)}</span>` : '';
                const replyBtn = c.author === 'partner'
                    ? `<button class="moment-comment-replybtn" data-replyname="${_esc(cName)}">回复</button>` : '';
                return `<div class="moment-comment" data-cid="${_esc(c.id)}"><span class="moment-comment-name">${_esc(cName)}</span>${replyTo}：${_esc(c.text)}${replyBtn}${delBtn}</div>`;
            }).join('')}</div>`
            : '';
        const likesHtml = (p.likes && p.likes.length)
            ? `<div class="moment-likes"><i class="fas fa-heart"></i><span class="moment-like-names">${p.likes.map(_esc).join('、')}</span>觉得很赞</div>`
            : '';
        // 编辑/删除仅对自己发的朋友圈开放
        const ownerActs = p.author === 'user'
            ? `<button class="moment-act" data-act="edit"><i class="fas fa-pen"></i></button>
               <button class="moment-act" data-act="del"><i class="fas fa-trash"></i></button>`
            : '';

        return `
        <div class="moment-card" data-id="${_esc(p.id)}">
            <div class="moment-avatar">${_avatarHtml(p.author, p.partnerName)}</div>
            <div class="moment-body">
                <div class="moment-name">${_esc(ownerName)}</div>
                <div class="moment-text">${_esc(p.text)}</div>
                ${imagesHtml}
                <div class="moment-meta">
                    <span class="moment-time">${_fmtTime(p.timestamp)}${p.edited ? ' · 已编辑' : ''}</span>
                    <div class="moment-actions">
                        <button class="moment-act" data-act="like"><i class="${likedByMe ? 'fas' : 'far'} fa-heart"></i>${likedByMe ? '已赞' : '赞'}</button>
                        ${ownerActs}
                    </div>
                </div>
                ${likesHtml}
                ${commentsHtml}
                <div class="moment-comment-bar">
                    <button class="moment-reply-chip" data-act="cancel-reply" style="display:none;"></button>
                    <input type="text" placeholder="评论…" maxlength="200">
                    <button data-act="send">发送</button>
                </div>
            </div>
        </div>`;
    }

    function _setReplyTarget(card, name) {
        const input = card.querySelector('.moment-comment-bar input');
        const chip = card.querySelector('.moment-reply-chip');
        if (!input) return;
        if (name) {
            input.dataset.replyTo = name;
            input.placeholder = `回复 ${name}…`;
            if (chip) { chip.style.display = 'inline-flex'; chip.innerHTML = `<i class="fas fa-times"></i> 回复 ${_esc(name)}`; }
        } else {
            delete input.dataset.replyTo;
            input.placeholder = '评论…';
            if (chip) chip.style.display = 'none';
        }
    }

    function _bindCardEvents(feed) {
        feed.querySelectorAll('.moment-card').forEach(card => {
            const id = card.dataset.id;
            const post = momentsPosts.find(x => x.id === id);
            if (!post) return;

            card.querySelectorAll('[data-act]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const act = btn.dataset.act;
                    if (act === 'like') _toggleLike(post);
                    else if (act === 'edit') _startEdit(card, post);
                    else if (act === 'del') _deletePost(post);
                    else if (act === 'cancel-reply') _setReplyTarget(card, null);
                    else if (act === 'send') {
                        const input = card.querySelector('.moment-comment-bar input');
                        const val = (input.value || '').trim();
                        if (val) {
                            _userCommentOn(post, val, input.dataset.replyTo || null);
                            _setReplyTarget(card, null);
                            input.value = '';
                        }
                    }
                });
            });

            const input = card.querySelector('.moment-comment-bar input');
            if (input) input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const val = (input.value || '').trim();
                    if (val) {
                        _userCommentOn(post, val, input.dataset.replyTo || null);
                        _setReplyTarget(card, null);
                        input.value = '';
                    }
                }
            });

            // 回复梦角的评论
            card.querySelectorAll('.moment-comment-replybtn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const name = btn.dataset.replyname;
                    _setReplyTarget(card, input && input.dataset.replyTo === name ? null : name);
                    if (input) input.focus();
                });
            });

            // 删除评论（自己的评论，或自己朋友圈下的评论）
            card.querySelectorAll('.moment-comment-delbtn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    _deleteComment(post, btn.dataset.delcid);
                });
            });

            // 图片点击放大
            card.querySelectorAll('.moment-image').forEach(img => {
                img.addEventListener('click', () => _openLightbox(img.src));
            });
        });
    }

    /* ---------- 图片灯箱 ---------- */
    function _openLightbox(src) {
        if (!_lightbox) {
            _lightbox = document.createElement('div');
            _lightbox.className = 'moment-lightbox';
            _lightbox.innerHTML = `<img alt="">`;
            _lightbox.addEventListener('click', () => _lightbox.classList.remove('active'));
            document.body.appendChild(_lightbox);
        }
        _lightbox.querySelector('img').src = src;
        _lightbox.classList.add('active');
    }

    /* ---------- 操作 ---------- */
    function _toggleLike(post) {
        post.likes = post.likes || [];
        const i = post.likes.indexOf(_mName());
        if (i >= 0) post.likes.splice(i, 1);
        else post.likes.push(_mName());
        _save(); _renderFeed();
    }

    async function _deletePost(post) {
        if (!(await uiConfirm({ title: '删除朋友圈', message: '确定删除这条朋友圈吗？其下的评论与点赞也会一起删除。', danger: true }))) return;
        const i = momentsPosts.indexOf(post);
        if (i >= 0) momentsPosts.splice(i, 1);
        _save(); _renderFeed();
        showNotification('已删除', 'info', 1500);
    }

    async function _deleteComment(post, cid) {
        if (!post || !Array.isArray(post.comments)) return;
        const c = post.comments.find(x => x.id === cid);
        if (!c) return;
        // 权限二次校验：只能删自己的评论，或自己朋友圈下的任何评论
        const allowed = c.author === 'user' || post.author === 'user';
        if (!allowed) return;
        if (!(await uiConfirm({ title: '删除评论', message: '确定删除这条评论吗？', danger: true }))) return;
        post.comments = post.comments.filter(x => x.id !== cid);
        _save(); _renderFeed();
        showNotification('评论已删除', 'info', 1500);
    }

    function _startEdit(card, post) {
        const body = card.querySelector('.moment-body');
        const old = post.text;
        body.innerHTML = `
            <div class="moment-edit-area">
                <textarea maxlength="1000">${_esc(old)}</textarea>
                <div class="moment-edit-btns">
                    <button class="moment-mini-btn" data-e="cancel">取消</button>
                    <button class="moment-mini-btn primary" data-e="save">保存</button>
                </div>
            </div>`;
        const ta = body.querySelector('textarea');
        ta.focus();
        body.querySelector('[data-e="cancel"]').onclick = () => _renderFeed();
        body.querySelector('[data-e="save"]').onclick = () => {
            const val = (ta.value || '').trim();
            if (!val) { showNotification('内容不能为空', 'warning'); return; }
            post.text = val;
            post.edited = true;
            _save(); _renderFeed();
            showNotification('已保存', 'success', 1500);
        };
    }

    function _addComment(post, author, text, replyTo, partnerName) {
        post.comments = post.comments || [];
        const comment = {
            id: 'c-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            author, text, replyTo: replyTo || null,
            timestamp: new Date().toISOString()
        };
        // 梦角评论时快照是哪位梦角说的，多人设各归各
        if (author === 'partner') {
            comment.partnerName = partnerName || post.partnerName || _pName();
        }
        post.comments.push(comment);
        _save();
        if (author === 'partner') _markUnread();
        _renderFeed();
    }

    function _userCommentOn(post, text, replyToName) {
        _addComment(post, 'user', text, replyToName || null);
        // 允许「已读不回」时，他有概率不回复；默认关闭则必定回复
        if (momentsSettings.allowReadNoReply && Math.random() < 0.4) return;
        // 回复库为空（内容都被删光）时不回复
        const reply = _pickReplyText();
        if (!reply) return;
        // 由被回复的那位梦角回应；直接评论时，梦角的帖子由主人回应、用户的帖子随机一位梦角回应
        const responderName = replyToName
            || (post.author === 'partner' ? (post.partnerName || _pName()) : _pickPartnerName());
        const delay = _rand(1500, 4000);
        setTimeout(() => {
            if (!momentsPosts.includes(post)) return;
            _addComment(post, 'partner', reply, _mName(), responderName);
            _notify(reply, responderName);
        }, delay);
    }

    /* ---------- 发布 ---------- */
    function _publishUserPost(text, images) {
        const post = {
            id: 'p-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            author: 'user',
            text,
            images: Array.isArray(images) ? images.slice(0, MAX_IMAGES) : [],
            timestamp: new Date().toISOString(),
            comments: [], likes: []
        };
        momentsPosts.push(post);
        _save(); _renderFeed();

        // 每位梦角都有可能来互动；点赞与评论相互独立，可能不是同一位
        const liker = _pickPartnerName();
        const commenter = _pickPartnerName();

        // 梦角来点赞
        setTimeout(() => {
            if (Math.random() < 0.6) {
                post.likes = post.likes || [];
                if (!post.likes.includes(liker)) {
                    post.likes.push(liker);
                    _save();
                    if (_panel && _panel.classList.contains('active')) {
                        _renderFeed();
                    } else {
                        _markUnread();
                        _notify(`${liker}赞了你的朋友圈`, liker);
                    }
                }
            }
        }, _rand(1200, 2500));
        setTimeout(() => {
            if (!momentsPosts.includes(post)) return;
            const c = _pickReplyText();
            if (!c) return;
            _addComment(post, 'partner', c, null, commenter);
            _notify(c, commenter);
        }, _rand(2500, 6000));
    }

    function _publishPartnerPost(text, whoName) {
        const partnerName = whoName || _pickPartnerName();
        const post = {
            id: 'p-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            author: 'partner',
            partnerName,
            text,
            timestamp: new Date().toISOString(),
            comments: [], likes: []
        };
        momentsPosts.push(post);
        _save(); _renderFeed();
        _markUnread();
        _notify(text.length > 40 ? text.slice(0, 40) + '…' : text, partnerName);

        // 他有时会给自己的朋友圈点赞（不计未读，发帖本身已提示过）
        if (Math.random() < 0.5) {
            setTimeout(() => {
                if (!momentsPosts.includes(post)) return;
                post.likes = post.likes || [];
                if (!post.likes.includes(partnerName)) {
                    post.likes.push(partnerName);
                    _save();
                    if (_panel && _panel.classList.contains('active')) _renderFeed();
                }
            }, _rand(3000, 9000));
        }

        // 梦角有时会在自己朋友圈底下主动补充评论
        if (Math.random() < 0.4) {
            setTimeout(() => {
                if (!momentsPosts.includes(post)) return;
                const c = _pickReplyText();
                if (!c) return;
                _addComment(post, 'partner', c, null, partnerName);
            }, _rand(4000, 12000));
        }
    }

    /* ---------- 自动发帖 ---------- */
    function _selectedGroupNames() {
        // 旧版单选字段 fromGroup 一次性迁移为多选数组
        if (!Array.isArray(momentsSettings.fromGroups)) {
            momentsSettings.fromGroups = momentsSettings.fromGroup ? [momentsSettings.fromGroup] : [];
            delete momentsSettings.fromGroup;
        }
        return momentsSettings.fromGroups;
    }

    function _autoPostPool() {
        // 朋友圈文案库（含系统预置文案，可在回复库管理中修改）与全部所选字卡组
        // 完全同优先级：合并去重后等概率随机
        const pool = [];
        const pushUnique = (items) => {
            if (!Array.isArray(items)) return;
            items.forEach(t => { if (t && !pool.includes(t)) pool.push(t); });
        };
        pushUnique(momentsTexts);
        if (momentsSettings.fromCardLib) {
            const groups = (typeof customReplyGroups !== 'undefined' && Array.isArray(customReplyGroups)) ? customReplyGroups : [];
            _selectedGroupNames().forEach(name => {
                const g = groups.find(x => x.name === name);
                if (g) pushUnique(g.items);
            });
        }
        return pool;
    }

    function _autoPostOnce() {
        _ensureDayCounter();
        if (!_hasTalked()) return; // 未开始对话，梦角不发朋友圈
        const pool = _autoPostPool();
        if (!pool.length) { _scheduleNext(); return; }  // 文案库与所选组别都为空：稍后再试
        // 避免和最近几条重复
        const recent = momentsPosts.filter(p => p.author === 'partner').slice(-3).map(p => p.text);
        let text = _pick(pool);
        let tries = 0;
        while (recent.includes(text) && tries < 6) { text = _pick(pool); tries++; }

        _publishPartnerPost(text);
        momentsSettings.postedToday = (momentsSettings.postedToday || 0) + 1;
        _save();
        _scheduleNext();
    }

    function _scheduleNext() {
        _ensureDayCounter();
        if (momentsSettings.autoPostEnabled === false) return;
        const remaining = 2 - (momentsSettings.postedToday || 0);
        if (remaining <= 0) return;
        const delay = remaining >= 2 ? _rand(60, 180) * 1000 : _rand(30, 120) * 1000;
        setTimeout(() => {
            _ensureDayCounter();
            if (momentsSettings.autoPostEnabled !== false && (momentsSettings.postedToday || 0) < 2) {
                if (_hasTalked()) {
                    _autoPostOnce();
                } else {
                    _scheduleNext(); // 还没开始对话，继续等待
                }
            }
        }, delay);
    }

    /* ---------- UI 构建 ---------- */
    function _ensureUI() {
        if (_panel) return;

        _panel = document.createElement('div');
        _panel.className = 'moments-panel';
        _panel.id = 'moments-panel';
        _panel.innerHTML = `
            <div class="moments-header">
                <button class="moments-icon-btn" id="moments-back"><i class="fas fa-arrow-left"></i></button>
                <div class="moments-header-title">朋友圈</div>
                <div class="moments-header-actions">
                    <button class="moments-icon-btn" id="moments-settings-open" title="朋友圈设置"><i class="fas fa-sliders-h"></i></button>
                    <button class="moments-icon-btn primary" id="moments-compose-open" title="发朋友圈"><i class="fas fa-pen"></i></button>
                </div>
            </div>
            <div class="moments-feed"></div>`;

        _composerPop = document.createElement('div');
        _composerPop.className = 'moments-composer-pop';
        _composerPop.innerHTML = `
            <div class="moments-composer-card">
                <textarea id="moments-composer-text" placeholder="这一刻的想法…" maxlength="1000"></textarea>
                <div class="moments-composer-previews" id="moments-composer-previews"></div>
                <div class="moments-composer-tools">
                    <button class="moments-btn" id="moments-composer-img" title="添加图片"><i class="fas fa-image"></i> 图片</button>
                    <span class="moments-hint">最多 ${MAX_IMAGES} 张</span>
                </div>
                <div class="moments-composer-btns">
                    <button class="moments-btn" id="moments-composer-cancel">取消</button>
                    <button class="moments-btn primary" id="moments-composer-send">发布</button>
                </div>
                <input type="file" id="moments-composer-file" accept="image/*" multiple style="display:none;">
            </div>`;

        _settingsPop = document.createElement('div');
        _settingsPop.className = 'moments-settings-pop';
        _settingsPop.innerHTML = `
            <div class="moments-settings-card">
                <div class="moments-settings-title"><i class="fas fa-sliders-h"></i> 朋友圈设置</div>
                <div class="moments-setting-row">
                    <label for="ms-auto">梦角自动发朋友圈<br><span class="moments-hint">开启后每天至少自动发送两条</span></label>
                    <input type="checkbox" id="ms-auto" style="width:18px;height:18px;accent-color:var(--accent-color);">
                </div>
                <div class="moments-setting-row">
                    <label for="ms-sync">梦角发圈使用字卡库文案<br><span class="moments-hint">开启后，下方所选组别中的字卡会并入发帖文案，与朋友圈文案库中的内容同概率随机使用</span></label>
                    <input type="checkbox" id="ms-sync" style="width:18px;height:18px;accent-color:var(--accent-color);">
                </div>
                <div class="moments-setting-row">
                    <label for="ms-readnoreply">允许他已读不回<br><span class="moments-hint">开启后你评论他时，他有可能只是看了却不回复；默认关闭，他总会回复你</span></label>
                    <input type="checkbox" id="ms-readnoreply" style="width:18px;height:18px;accent-color:var(--accent-color);">
                </div>
                <div class="moments-setting-row" id="ms-groups-row">
                    <div style="width:100%;">选取的字卡组别（可多选）
                        <div id="ms-groups-chips" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;"></div>
                    </div>
                </div>
                <div class="moments-hint" style="margin-top:10px;">
                    朋友圈文案与回复在「设置 → 高级功能 → 回复库管理 → 朋友圈相关」中维护，分为「朋友圈文案」「朋友圈回复」两个门类，系统预置内容也在那里，可以直接修改或删除；勾选上方字卡库组别后，所选各组字卡会与文案库内容以相同概率一起参与随机。
                </div>
                <div class="moment-edit-btns">
                    <button class="moment-mini-btn" id="ms-close">完成</button>
                </div>
            </div>`;

        document.body.appendChild(_panel);
        document.body.appendChild(_composerPop);
        document.body.appendChild(_settingsPop);

        // ---- 事件 ----
        _panel.querySelector('#moments-back').addEventListener('click', _closePanel);
        _panel.querySelector('#moments-compose-open').addEventListener('click', () => {
            _composerPop.classList.add('active');
            const ta = _composerPop.querySelector('#moments-composer-text');
            ta.value = '';
            _composerImages = [];
            _renderComposerPreviews();
            setTimeout(() => ta.focus(), 80);
        });
        _panel.querySelector('#moments-settings-open').addEventListener('click', () => {
            _syncSettingsUI();
            _settingsPop.classList.add('active');
        });

        _composerPop.addEventListener('click', (e) => { if (e.target === _composerPop) _composerPop.classList.remove('active'); });
        _composerPop.querySelector('#moments-composer-cancel').addEventListener('click', () => _composerPop.classList.remove('active'));
        _composerPop.querySelector('#moments-composer-img').addEventListener('click', () => {
            _composerPop.querySelector('#moments-composer-file').click();
        });
        _composerPop.querySelector('#moments-composer-file').addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = '';
            if (!files.length) return;
            const room = MAX_IMAGES - _composerImages.length;
            if (room <= 0) { showNotification(`最多 ${MAX_IMAGES} 张图片`, 'warning'); return; }
            const use = files.slice(0, room);
            if (use.length < files.length) showNotification(`最多 ${MAX_IMAGES} 张，已截取前 ${use.length} 张`, 'warning');
            showNotification('正在处理图片…', 'info', 1200);
            for (const f of use) {
                try {
                    const b64 = await optimizeImage(f, 800, 0.75);
                    _composerImages.push(b64);
                } catch (err) { console.warn('[moments] 图片处理失败', err); }
            }
            _renderComposerPreviews();
        });
        _composerPop.querySelector('#moments-composer-send').addEventListener('click', () => {
            const ta = _composerPop.querySelector('#moments-composer-text');
            const val = (ta.value || '').trim();
            if (!val && !_composerImages.length) { showNotification('说点什么或配张图再发吧', 'warning'); return; }
            const imgs = _composerImages.slice();
            _composerPop.classList.remove('active');
            _publishUserPost(val || '分享图片', imgs);
            showNotification('已发布', 'success', 1500);
        });
        // 预览区删除按钮（事件委托）
        _composerPop.querySelector('#moments-composer-previews').addEventListener('click', (e) => {
            const del = e.target.closest('[data-del]');
            if (del) {
                _composerImages.splice(parseInt(del.dataset.del, 10), 1);
                _renderComposerPreviews();
            }
        });

        _settingsPop.addEventListener('click', (e) => { if (e.target === _settingsPop) _settingsPop.classList.remove('active'); });
        _settingsPop.querySelector('#ms-close').addEventListener('click', () => _settingsPop.classList.remove('active'));
        _settingsPop.querySelector('#ms-auto').addEventListener('change', (e) => {
            momentsSettings.autoPostEnabled = e.target.checked;
            _save();
            if (e.target.checked) _scheduleNext();
            showNotification(e.target.checked ? '已开启自动发朋友圈' : '已关闭自动发朋友圈', 'success', 1500);
        });
        _settingsPop.querySelector('#ms-sync').addEventListener('change', (e) => {
            momentsSettings.fromCardLib = e.target.checked;
            _save();
            _toggleGroupRow();
        });
        _settingsPop.querySelector('#ms-readnoreply').addEventListener('change', (e) => {
            momentsSettings.allowReadNoReply = e.target.checked;
            _save();
            showNotification(e.target.checked ? '已允许他已读不回' : '他会一直回复你', 'success', 1500);
        });
        _settingsPop.querySelector('#ms-groups-chips').addEventListener('click', (e) => {
            const chip = e.target.closest('[data-chip]');
            if (!chip) return;
            const name = chip.dataset.chip;
            const selected = _selectedGroupNames();
            const i = selected.indexOf(name);
            if (i >= 0) selected.splice(i, 1); else selected.push(name);
            _save();
            _renderGroupChips();
        });
    }

    function _renderComposerPreviews() {
        const box = _composerPop.querySelector('#moments-composer-previews');
        if (!box) return;
        box.innerHTML = _composerImages.map((src, i) => `
            <div class="moments-composer-preview">
                <img src="${src}" alt="">
                <button data-del="${i}"><i class="fas fa-times"></i></button>
            </div>`).join('');
        box.style.display = _composerImages.length ? 'flex' : 'none';
    }

    function _renderGroupChips() {
        const box = _settingsPop.querySelector('#ms-groups-chips');
        if (!box) return;
        const groups = (typeof customReplyGroups !== 'undefined' && Array.isArray(customReplyGroups)) ? customReplyGroups : [];
        const selected = _selectedGroupNames();
        const chip = (label, name, on, color) => {
            const border = on ? 'var(--accent-color)' : 'var(--border-color)';
            const bg = on ? 'var(--accent-color)' : 'var(--primary-bg)';
            const fg = on ? '#fff' : 'var(--text-secondary)';
            const mark = on ? '<i class="fas fa-check" style="font-size:10px;margin-right:4px;"></i>' : '';
            const colorDot = color && !on ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${color};margin-right:5px;"></span>` : '';
            return `<button type="button" data-chip="${_esc(name)}" style="padding:6px 12px;border:1px solid ${border};border-radius:999px;background:${bg};color:${fg};font-size:12px;font-family:inherit;cursor:pointer;white-space:nowrap;">${mark}${colorDot}${_esc(label)}</button>`;
        };
        if (!groups.length) {
            box.innerHTML = '<span style="font-size:12px;color:var(--text-secondary);">字卡库中还没有分组，请先在回复库管理 → 字卡里创建分组</span>';
            return;
        }
        box.innerHTML = groups.map(g => chip(g.name, g.name, selected.includes(g.name), g.color)).join('');
    }

    function _toggleGroupRow() {
        const show = !!momentsSettings.fromCardLib;
        _settingsPop.querySelector('#ms-groups-row').style.display = show ? 'flex' : 'none';
        if (show) _renderGroupChips();
    }

    function _syncSettingsUI() {
        _settingsPop.querySelector('#ms-auto').checked = momentsSettings.autoPostEnabled !== false;
        _settingsPop.querySelector('#ms-sync').checked = !!momentsSettings.fromCardLib;
        _settingsPop.querySelector('#ms-readnoreply').checked = momentsSettings.allowReadNoReply === true;
        _toggleGroupRow();
    }

    function _openPanel() {
        _ensureUI();
        _renderFeed();
        _panel.classList.add('active');
        _clearUnread();
    }
    function _closePanel() {
        if (_panel) _panel.classList.remove('active');
    }

    /* ---------- 初始化 ---------- */
    function initMoments() {
        if (_inited) return;
        _inited = true;

        _ensureDayCounter();
        _ensureSeedTexts();
        _ensureSeedReplies();
        _selectedGroupNames(); // 迁移旧版单选组别设置
        _clearSeedPosts();

        const btn = document.getElementById('moments-btn');
        if (btn) btn.addEventListener('click', (e) => {
            e.stopPropagation();
            _openPanel();
        });

        _scheduleNext();
        _renderBadge();
    }

    window.initMoments = initMoments;
    window._momentsDebug = { _autoPostOnce, _publishPartnerPost: () => _publishPartnerPost('测试朋友圈'), _publishUserPost };
})();
