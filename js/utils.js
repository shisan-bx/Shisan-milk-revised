        function safeGetItem(key) {
            try { return localStorage.getItem(key); }
            catch (e) { console.error('Error getting item:', e); return null; }
        }

        function safeSetItem(key, value) {
            try {
                if (typeof value === 'object') value = JSON.stringify(value);
                localStorage.setItem(key, value);
            } catch (e) { console.error('Error setting item:', e); }
        }

        function safeRemoveItem(key) {
            try { localStorage.removeItem(key); }
            catch (e) { console.error('Error removing item:', e); }
        }

function getRandomItem(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeStringStrict(s) {
    if (typeof s !== 'string') return '';
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function deduplicateContentArray(arr, baseSystemArray = []) {
    const seen = new Set(baseSystemArray.map(normalizeStringStrict));
    const result = [];
    let removedCount = 0;
    for (const item of arr) {
        const norm = normalizeStringStrict(item);
        if (norm !== '' && !seen.has(norm)) {
            seen.add(norm);
            result.push(item);
        } else {
            removedCount++;
        }
    }
    return { result, removedCount };
}

        function cropImageToSquare(file, maxSize = 640) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const minSide = Math.min(img.width, img.height);
                        const sx = (img.width - minSide) / 2;
                        const sy = (img.height - minSide) / 2;
                        const canvas = document.createElement('canvas');
                        canvas.width = maxSize; canvas.height = maxSize;
                        const ctx = canvas.getContext('2d');
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, maxSize, maxSize);
                        resolve(canvas.toDataURL('image/jpeg', 0.95));
                    };
                    img.onerror = reject;
                    img.src = e.target.result;
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        function exportDataToMobileOrPC(dataString, fileName) {
            if (navigator.share && navigator.canShare) {
                try {
                    const blob = new Blob([dataString], { type: 'application/json' });
                    const file = new File([blob], fileName, { type: 'application/json' });
                    if (navigator.canShare({ files: [file] })) {
                        navigator.share({ files: [file], title: '传讯数据备份', text: '请选择"保存到文件"' })
                            .catch(() => downloadFileFallback(blob, fileName));
                        return;
                    }
                } catch (e) {}
            }
            const blob = new Blob([dataString], { type: 'application/json' });
            downloadFileFallback(blob, fileName);
        }

        function downloadFileFallback(blob, fileName) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url; link.download = fileName; link.style.display = 'none';
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        }

        localforage.config({
            driver: [localforage.INDEXEDDB, localforage.WEBSQL, localforage.LOCALSTORAGE],
            name: 'ChatApp_V3', version: 1.0, storeName: 'chat_data',
            description: 'Storage for Chat App V3'
        });

        function showNotification(message, type = 'info', duration = 3000) {
            const existing = document.querySelector('.notification');
            if (existing) existing.remove();
            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            const iconMap = { success:'fa-check-circle', error:'fa-exclamation-circle', info:'fa-info-circle', warning:'fa-exclamation-triangle' };
            notification.innerHTML = `<i class="fas ${iconMap[type] || 'fa-info-circle'}"></i><span>${message}</span>`;
            document.body.appendChild(notification);
            setTimeout(() => {
                notification.classList.add('hiding');
                notification.addEventListener('animationend', () => notification.remove());
            }, duration);
        }

        const playSound = (type) => {
            if (!settings.soundEnabled) return;
            try {
                if (settings.customSoundUrl && settings.customSoundUrl.trim()) {
                    const audio = new Audio(settings.customSoundUrl.trim());
                    audio.volume = Math.min(1, Math.max(0, settings.soundVolume || 0.15));
                    audio.play().catch(() => {});
                    return;
                }
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                oscillator.connect(gainNode); gainNode.connect(audioContext.destination);
                oscillator.type = 'sine';
                const vol = Math.min(0.5, Math.max(0.01, settings.soundVolume || 0.1));
                gainNode.gain.setValueAtTime(vol, audioContext.currentTime);
                if (type === 'send') oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                else if (type === 'favorite') oscillator.frequency.setValueAtTime(1200, audioContext.currentTime);
                else oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
                oscillator.start();
                gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.15);
                oscillator.stop(audioContext.currentTime + 0.15);
            } catch (e) { console.warn("音频播放失败:", e); }
    };

    // 收到消息时按「消息归属的群组成员」播放其自定义提示音；
    // 成员未设置时回退到全局自定义音效，最后是内置蜂鸣（沿用总开关与音量）
    window._playMemberSound = () => {
        if (!settings.soundEnabled) return;
        let url = '';
        try {
            if (typeof groupChatSettings !== 'undefined' && groupChatSettings && groupChatSettings.enabled &&
                typeof window.getGroupMemberForMessage === 'function' &&
                typeof messages !== 'undefined' && messages.length) {
                const member = window.getGroupMemberForMessage(messages[messages.length - 1].id);
                if (member && member.soundUrl && member.soundUrl.trim()) url = member.soundUrl.trim();
            }
        } catch (e) {}
        if (!url && settings.customSoundUrl && settings.customSoundUrl.trim()) url = settings.customSoundUrl.trim();
        if (url) {
            try {
                const audio = new Audio(url);
                audio.volume = Math.min(1, Math.max(0, settings.soundVolume || 0.15));
                audio.play().catch(() => {});
                return;
            } catch (e) {}
        }
        playSound('message');
    };

        const throttledSaveData = () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveData, 500);
        };

async function applyCustomFont(url) {
    if (!url || !url.trim()) {
        document.documentElement.style.removeProperty('--font-family');
        document.documentElement.style.removeProperty('--message-font-family');
        return;
    }
    const fontName = 'UserCustomFont';
    try {
        const font = new FontFace(fontName, `url(${url})`);
        await font.load();
        document.fonts.add(font);
        const fontStack = `"${fontName}", 'Noto Serif SC', serif`;
        document.documentElement.style.setProperty('--font-family', fontStack);
        document.documentElement.style.setProperty('--message-font-family', fontStack);
        if (typeof settings !== 'undefined') settings.messageFontFamily = fontStack;
    } catch (e) {
        console.error('字体加载失败:', e);
        showNotification('字体加载失败，请检查链接是否有效', 'error');
    }
}

function applyCustomBubbleCss(cssCode) {
    const styleId = 'user-custom-bubble-style';
    let styleTag = document.getElementById(styleId);
    if (!cssCode || !cssCode.trim()) { if (styleTag) styleTag.remove(); return; }
    if (!styleTag) { styleTag = document.createElement('style'); styleTag.id = styleId; }
    document.head.appendChild(styleTag);

    function boostSpecificity(css) {
        return css.replace(/([^{}@][^{}]*)\{([^{}]*)\}/g, (match, rawSel, body) => {
            const selectors = rawSel.split(',').map(s => s.trim()).filter(Boolean);
            const boosted = selectors.map(sel => {
                if (sel.startsWith('html') || sel.startsWith('@') || sel.startsWith('from') || sel.startsWith('to') || /^\d/.test(sel)) return sel;
                return `html body ${sel}`;
            });
            return `${boosted.join(', ')} {${body}}`;
        });
    }

    const boostedCss = boostSpecificity(cssCode);

    styleTag.textContent = boostedCss + `
/* image bubble reset — must stay !important */
html[data-theme] .message.message-image-bubble-none,
html body .message.message-image-bubble-none {
    background: transparent !important; border: none !important;
    box-shadow: none !important; padding: 0 !important; border-radius: 0 !important;
}`;

    try {
        const alreadyCustomized = (typeof settings !== 'undefined' && settings.customThemeColors) ? settings.customThemeColors : {};
        const sentMatch  = cssCode.match(/\.message-sent\s*\{([^}]*)\}/);
        const recvMatch  = cssCode.match(/\.message-received\s*\{([^}]*)\}/);
        if (sentMatch && !alreadyCustomized['--message-sent-text']) {
            const colorLine = sentMatch[1].match(/\bcolor\s*:\s*([^;}\n]+)/);
            if (colorLine) {
                const v = colorLine[1].trim().replace(/!important/g,'').trim();
                if (v && !v.startsWith('var(')) {
                    document.documentElement.style.setProperty('--message-sent-text', v);
                }
            }
        }
        if (recvMatch && !alreadyCustomized['--message-received-text']) {
            const colorLine = recvMatch[1].match(/\bcolor\s*:\s*([^;}\n]+)/);
            if (colorLine) {
                const v = colorLine[1].trim().replace(/!important/g,'').trim();
                if (v && !v.startsWith('var(')) {
                    document.documentElement.style.setProperty('--message-received-text', v);
                }
            }
        }
    } catch(e) {}
}

function applyGlobalThemeCss(cssCode) {
    const styleId = 'user-custom-global-theme-style';
    let styleTag = document.getElementById(styleId);
    if (!cssCode || !cssCode.trim()) { if (styleTag) styleTag.remove(); return; }
    if (!styleTag) { styleTag = document.createElement('style'); styleTag.id = styleId; document.head.appendChild(styleTag); }
    styleTag.textContent = cssCode;
}

async function exportAllData() {
    try {
        showNotification('正在收集数据…', 'info', 2000);
        const keys = await localforage.keys();
        const idbData = {};
        for (const k of keys) {
            try { idbData[k] = await localforage.getItem(k); } catch(e) {}
        }
        const lsData = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k) lsData[k] = localStorage.getItem(k);
        }
        const payload = {
            version: '3.1-full', appName: 'ChatApp',
            exportDate: new Date().toISOString(), type: 'full',
            indexedDB: idbData, localStorage: lsData
        };
        const str = JSON.stringify(payload, null, 2);
        const fileName = `chat-full-backup-${new Date().toISOString().slice(0,10)}.json`;
        const blob = new Blob([str], { type: 'application/json' });
        downloadFileFallback(blob, fileName);
    } catch(e) {
        console.error('全量导出失败:', e);
        showNotification('全量导出失败，请重试', 'error');
    }
}

async function importAllData(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            let raw = e.target.result;
            if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
            const data = JSON.parse(raw);
            if (data.type !== 'full') {
                if (typeof importChatHistory === 'function') importChatHistory(file);
                return;
            }
            const ok = await uiConfirm({ title: '全量恢复', message: '全量恢复将覆盖所有现有数据，确认继续？', confirmText: '恢复', danger: true });
            if (!ok) return;
            showNotification('正在恢复数据…', 'info', 3000);
            if (data.indexedDB) {
                for (const [k, v] of Object.entries(data.indexedDB)) {
                    try { await localforage.setItem(k, v); } catch(err) {}
                }
            }
            if (data.localStorage) {
                for (const [k, v] of Object.entries(data.localStorage)) {
                    try { localStorage.setItem(k, v); } catch(err) {}
                }
            }
            showNotification('恢复成功，即将刷新页面…', 'success', 2000);
            setTimeout(() => location.reload(), 2200);
        } catch(e) {
            console.error('全量导入失败:', e);
            showNotification('文件损坏或格式不兼容', 'error');
        }
    };
    reader.readAsText(file);
}

/* ==========================================================================
   自定义弹窗（替代原生 prompt/confirm）
   部分浏览器/内嵌环境不支持原生弹窗（prompt() is not supported），
   全站统一改用以下Promise式弹窗，样式与项目 GS/CSS 保持一致。
   - uiConfirm({ title, message, confirmText, danger })  → Promise<boolean>
   - uiPrompt({ title, label, value, placeholder, multiline })  → Promise<string|null>
   - uiPromptFields({ title, fields: [{ label, value, placeholder }] }) → Promise<string[]|null>
   ========================================================================== */
(function () {
    'use strict';

    function _base(overlay, card) {
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);backdrop-filter:blur(6px);';
        card.style.cssText = 'background:var(--secondary-bg,#fff);border-radius:20px;padding:22px;width:86%;max-width:360px;box-shadow:0 20px 60px rgba(0,0,0,.35);animation:uiDlgIn .2s cubic-bezier(.34,1.56,.64,1);';
        if (!document.getElementById('ui-dlg-style')) {
            const st = document.createElement('style');
            st.id = 'ui-dlg-style';
            st.textContent = '@keyframes uiDlgIn{from{opacity:0;transform:scale(.92) translateY(8px)}to{opacity:1;transform:none}}';
            document.head.appendChild(st);
        }
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        return () => overlay.remove();
    }

    function _btn(text, opts) {
        const b = document.createElement('button');
        b.textContent = text;
        b.style.cssText = `flex:1;padding:11px 0;border-radius:12px;border:1.5px solid ${opts.primary ? 'transparent' : 'var(--border-color,#ddd)'};` +
            `background:${opts.primary ? (opts.danger ? '#e5484d' : 'var(--accent-color,#b48c64)') : 'transparent'};` +
            `color:${opts.primary ? '#fff' : 'var(--text-secondary,#888)'};font-size:14px;font-weight:600;` +
            `cursor:pointer;font-family:inherit;transition:opacity .15s;`;
        return b;
    }

    function _input(value, placeholder) {
        const i = document.createElement('input');
        i.type = 'text';
        i.value = value || '';
        i.placeholder = placeholder || '';
        i.style.cssText = 'width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid var(--border-color,#ddd);border-radius:11px;background:var(--primary-bg,#fafafa);color:var(--text-primary,#333);font-size:14px;font-family:inherit;outline:none;';
        i.addEventListener('focus', () => { i.style.borderColor = 'var(--accent-color,#b48c64)'; });
        i.addEventListener('blur', () => { i.style.borderColor = 'var(--border-color,#ddd)'; });
        return i;
    }

    function _titleEl(text) {
        const t = document.createElement('div');
        t.textContent = text;
        t.style.cssText = 'font-size:15px;font-weight:700;color:var(--text-primary,#333);margin-bottom:6px;';
        return t;
    }

    window.uiConfirm = function (opts) {
        opts = opts || {};
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            const card = document.createElement('div');
            const close = (val) => { cleanup(); resolve(val); };
            const cleanup = _base(overlay, card);

            const msg = document.createElement('div');
            msg.textContent = opts.message || '确定执行该操作吗？';
            msg.style.cssText = 'font-size:13px;line-height:1.7;color:var(--text-secondary,#666);margin-bottom:18px;white-space:pre-line;';
            card.appendChild(_titleEl(opts.title || '提示'));
            card.appendChild(msg);

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:10px;';
            const cancel = _btn(opts.cancelText || '取消', {});
            const ok = _btn(opts.confirmText || '确定', { primary: true, danger: opts.danger });
            cancel.onclick = () => close(false);
            ok.onclick = () => close(true);
            row.appendChild(cancel); row.appendChild(ok);
            card.appendChild(row);
            overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
            ok.focus();
        });
    };

    window.uiPrompt = function (opts) {
        opts = opts || {};
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            const card = document.createElement('div');
            const close = (val) => { cleanup(); resolve(val); };
            const cleanup = _base(overlay, card);

            card.appendChild(_titleEl(opts.title || '请输入'));
            const input = _input(opts.value, opts.placeholder);
            card.appendChild(input);
            if (opts.label) {
                const lb = document.createElement('div');
                lb.textContent = opts.label;
                lb.style.cssText = 'font-size:12px;color:var(--text-secondary,#888);margin-bottom:6px;';
                card.insertBefore(lb, input);
            }
            const err = document.createElement('div');
            err.style.cssText = 'font-size:12px;color:#e5484d;margin-top:6px;display:none;';
            card.appendChild(err);

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:10px;margin-top:16px;';
            const cancel = _btn('取消', {});
            const ok = _btn(opts.confirmText || '确定', { primary: true });
            cancel.onclick = () => close(null);
            ok.onclick = () => {
                const v = (input.value || '').trim();
                if (!v && !opts.allowEmpty) { err.textContent = '内容不能为空'; err.style.display = 'block'; input.focus(); return; }
                close(v);
            };
            row.appendChild(cancel); row.appendChild(ok);
            card.appendChild(row);
            overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !opts.multiline) ok.click();
                if (e.key === 'Escape') close(null);
            });
            setTimeout(() => input.focus(), 60);
        });
    };

    window.uiPromptFields = function (opts) {
        opts = opts || {};
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            const card = document.createElement('div');
            const close = (val) => { cleanup(); resolve(val); };
            const cleanup = _base(overlay, card);

            card.appendChild(_titleEl(opts.title || '请输入'));
            const inputs = [];
            (opts.fields || []).forEach(f => {
                const lb = document.createElement('div');
                lb.textContent = f.label || '';
                lb.style.cssText = 'font-size:12px;color:var(--text-secondary,#888);margin:10px 0 6px;';
                card.appendChild(lb);
                const input = _input(f.value, f.placeholder);
                card.appendChild(input);
                inputs.push(input);
            });
            const err = document.createElement('div');
            err.style.cssText = 'font-size:12px;color:#e5484d;margin-top:6px;display:none;';
            card.appendChild(err);

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:10px;margin-top:16px;';
            const cancel = _btn('取消', {});
            const ok = _btn(opts.confirmText || '确定', { primary: true });
            cancel.onclick = () => close(null);
            ok.onclick = () => {
                const vals = inputs.map(i => (i.value || '').trim());
                if (vals.some(v => !v)) { err.textContent = '各项内容不能为空'; err.style.display = 'block'; return; }
                close(vals);
            };
            row.appendChild(cancel); row.appendChild(ok);
            card.appendChild(row);
            overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
            inputs[inputs.length - 1].addEventListener('keydown', e => { if (e.key === 'Enter') ok.click(); });
            setTimeout(() => inputs[0].focus(), 60);
        });
    };
})();
