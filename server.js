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
    if (urlPath === '/' || urlPath === '') urlPath = '/suoyin';

    // 安全：阻止路径穿越
    const filePath = path.join(ROOT, urlPath);
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            // 尝试 suoyin 无扩展名 → 当 html
            const tryHtml = filePath;
            fs.access(tryHtml, fs.constants.R_OK, (e2) => {
                if (e2) {
                    res.writeHead(404);
                    res.end('Not Found: ' + urlPath);
                    return;
                }
                serveFile(tryHtml, res);
            });
            return;
        }
        serveFile(filePath, res);
    });
});

function serveFile(filePath, res) {
    const ext = path.extname(filePath).toLowerCase();
    // 无扩展名的文件（如 suoyin）当作 HTML 处理，避免浏览器下载
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

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
