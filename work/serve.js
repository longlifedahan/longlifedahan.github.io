/* 本地静态服务器：避免 file:// 安全限制（Unsafe attempt to load URL file:///...）
   用法：node serve.js  → 浏览器打开 http://localhost:8124  */
var http = require('http');
var fs = require('fs');
var path = require('path');

var root = __dirname;
var port = 8124;
var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.d.ts': 'text/plain'
};

http.createServer(function (req, res) {
  var urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); } catch (e) { urlPath = req.url.split('?')[0]; }
  if (urlPath === '/') urlPath = '/index.html';
  var filePath = path.join(root, urlPath);
  if (filePath.indexOf(root) !== 0) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(filePath, function (err, st) {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('404 Not Found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}).listen(port, function () {
  console.log('work 本地服务器已启动，请打开：http://localhost:' + port);
});
