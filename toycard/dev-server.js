/*
 * 本地开发服务器（仅开发用，不随项目发布）：
 *  - 静态服务 toycard 目录
 *  - /api/* 代理到 api.bilitoy.beer（绕过浏览器 CORS 限制）
 *  - index.html 注入 window.__TOYCARD_API__，让 game.js 走本地代理
 *
 * 启动：node dev-server.js  （默认 http://localhost:8080）
 */
var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');
var URL = require('url');

var ROOT = __dirname;
var PORT = Number(process.env.PORT) || 8080;
var UPSTREAM = 'https://api.bilitoy.beer';

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.zip': 'application/zip', '.ico': 'image/x-icon'
};

function proxy(p, search, req, res) {
  var target = UPSTREAM + p + (search || '');
  var r = https.request(target, { method: req.method || 'GET' }, function (up) {
    res.writeHead(up.statusCode || 200, {
      'Content-Type': up.headers['content-type'] || 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    });
    up.pipe(res);
  });
  r.on('error', function (e) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('代理错误：' + e.message);
  });
  req.pipe(r);
}

http.createServer(function (req, res) {
  var u = URL.parse(req.url, true);
  var p = decodeURIComponent(u.pathname);

  if (p.startsWith('/api/')) { proxy(p, u.search, req, res); return; }

  var f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }
  var ext = path.extname(f).toLowerCase();
  var body = fs.readFileSync(f);
  if (path.basename(f).toLowerCase() === 'index.html') {
    /* 注入到 </head> 前，保证在 game.js 执行前定义 __TOYCARD_API__（相对路径走本地代理，避免跨域） */
    body = Buffer.from(body.toString().replace('</head>',
      '<script>window.__TOYCARD_API__="/api/toys";</script></head>'));
  }
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store'   /* 避免浏览器缓存旧文件导致注入/逻辑不生效 */
  });
  res.end(body);
}).listen(PORT, function () {
  console.log('TOYSTORE 抽卡 本地预览：http://localhost:' + PORT + '/');
});
