const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const ROOT = __dirname;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.webp': 'image/webp',
    '.mp3':  'audio/mpeg',
    '.m4a':  'audio/mp4',
    '.mp4':  'video/mp4',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf':  'font/ttf',
    '.otf':  'font/otf',
    '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

    const filePath = path.join(ROOT, urlPath);
    // 安全：阻止路径穿越
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found: ' + urlPath);
            return;
        }
        serveFile(filePath, res);
    });
});

function serveFile(filePath, res) {
    const ext = path.extname(filePath).toLowerCase();
    // 无扩展名的文件当作 HTML 处理，避免浏览器下载
    const mime = MIME[ext] || (ext === '' ? 'text/html; charset=utf-8' : 'application/octet-stream');
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(500);
            res.end('Internal Server Error');
            return;
        }
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
        res.end(data);
    });
}

// 端口被占用时自动顺延（8000 → 8001 → 8002 …），避免 EADDRINUSE 直接崩溃
let currentPort = PORT;
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && currentPort < PORT + 20) {
        console.log(`端口 ${currentPort} 已被占用，尝试 ${currentPort + 1} …`);
        currentPort++;
        server.listen(currentPort, '0.0.0.0');
    } else {
        console.error('服务器启动失败:', err.message);
        process.exit(1);
    }
});
server.listen(currentPort, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${currentPort}/`);
});
