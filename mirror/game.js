/* ================= 万花筒 =================
   圆形画面。两种模式：
   1) 随机模式：N 扇区对称万花筒，小而密、形状随机的玻璃碎片。
   2) 图片模式：上传后显示完整原图居中；点打散，图片碎裂成大量随机碎片飞散；
      点复原，碎片飞回原位拼回完整原图。
   交互：
     - 💫打散：可无限次点击，每次重新随机飞散 + 碎片各自随机翻转
     - 🔁复原：随机模式回对称；图片模式重新拼回原图
     - 🔀转动：碎片围绕万花筒中心公转，同时随机抖动/震动/旋转/移位（不是整体绕轴、没有重力）
     - 自动旋转：碎片持续各自随机翻转
     - 拖动画面整体旋转（仅手动浏览）
   导出：App 内走 B站 SDK 保存相册，Web 端 <a download> 下载 PNG。
   注意：本文件不使用 'use strict'，便于冒烟测试 eval 后暴露顶层函数。
   ================================================ */

/* ---------------- 全局状态 ---------------- */
var canvas, ctx, L = 0, R = 0, DPR = 1;
var sectorCount = 8;     // 扇区数
var fragments = [];      // 随机模式基础碎片（位于第一扇区内）
var instances = [];      // 渲染实例（对称 N×F 或 图片碎裂 shards）
var viewRot = 0;         // 整体旋转角（仅拖动）
var autoSpin = false;
var scatterP = 0;        // 散开程度 0=聚合 1=散开（同时控制镜像渐隐）
var scatterTgt = 0;      // 目标散开程度
var scatterTween = null; // {from,to,t0,dur,items:[{fx,fy,frot,tx,ty,trot}]}
var spinAnim = null;     // 转动动画：碎片围绕中心公转 + 抖动 {t0,dur,items}
var autoSpinNext = 0;    // 自动旋转：下次自动触发转动的时间戳
var mode = 'rand';       // 'rand' | 'img'
var imgMode = 'whole';   // 图片模式：'whole' 完整原图 | 'shattered' 已碎裂
var userImg = null;
var STARS = [];
var last = 0;
var dragRotLast = null;
var EXPORT_SIZE = 1024;

/* ---------------- 工具 ---------------- */
function $(id) { return document.getElementById(id); }
function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAng(a, b, t) {
  var d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function toast(msg) {
  var el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { el.hidden = true; }, 1800);
}
/* 对数分布随机尺寸：小而密、大小差异明显（≈0.03R~0.28R） */
function randSize() {
  return R * Math.pow(10, -1.5 + Math.random() * 1.0);
}

/* ---------------- 随机碎片生成 ---------------- */
var SHAPES = ['tri', 'circle', 'ring', 'rect', 'diamond', 'star', 'poly', 'heart', 'sector', 'rays'];
function randColor() {
  var h = Math.floor(Math.random() * 360);
  var s = 72 + Math.floor(Math.random() * 24);
  var l = 52 + Math.floor(Math.random() * 24);
  return {
    c: 'hsla(' + h + ',' + s + '%,' + l + '%,0.8)',
    c2: 'hsla(' + ((h + 36) % 360) + ',' + s + '%,' + (l + 26) + '%,0.92)',
    cD: 'hsla(' + h + ',' + s + '%,' + (l - 24) + '%,0.94)'
  };
}
function makeRandFrag() {
  var col = randColor();
  var step = Math.PI * 2 / sectorCount;
  return {
    type: pick(SHAPES),
    r: 0.06 + Math.random() * 0.88,
    theta: Math.random() * step,
    rot: Math.random() * Math.PI * 2,
    size: randSize(),
    color: col.c, color2: col.c2, colorD: col.cD,
    img: null
  };
}
function genFragmentsRand() {
  var n;
  if (sectorCount >= 12) n = randInt(30, 40);
  else if (sectorCount >= 8) n = randInt(42, 60);
  else n = randInt(50, 70);
  fragments = [];
  for (var i = 0; i < n; i++) fragments.push(makeRandFrag());
}

/* ---------------- 随机模式对称实例 ---------------- */
function buildInstances() {
  var N = sectorCount, step = Math.PI * 2 / N;
  instances = [];
  for (var i = 0; i < fragments.length; i++) {
    var f = fragments[i];
    for (var k = 0; k < N; k++) {
      var mirror = k % 2 === 1;
      var ang = f.theta + k * step;
      var sx = R + f.r * R * Math.cos(ang);
      var sy = R + f.r * R * Math.sin(ang);
      var srot = k * step + (mirror ? -f.rot : f.rot);
      instances.push({
        f: f, mirror: mirror,
        sym: { x: sx, y: sy, rot: srot },
        free: { x: sx, y: sy, rot: srot },
        cur: { x: sx, y: sy, rot: srot }
      });
    }
  }
}

/* ---------------- 图片模式：整图 & 碎裂 shards ---------------- */
function drawWholeImage(c) {
  var img = userImg;
  var s = Math.max(L / img.width, L / img.height); // cover 铺满圆形画面
  var dw = img.width * s, dh = img.height * s;
  c.save();
  c.drawImage(img, R - dw / 2, R - dh / 2, dw, dh);
  // 玻璃反光
  c.globalAlpha = 0.14; c.fillStyle = '#fff';
  c.save(); c.translate(-L * 0.05, L * 0.02); c.rotate(-0.5);
  c.fillRect(-L * 0.6, -L * 0.1, L * 1.2, L * 0.08);
  c.restore();
  c.globalAlpha = 0.1;
  c.beginPath(); c.arc(R - L * 0.18, R - L * 0.2, L * 0.12, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 1;
  c.restore();
}
/* ---------- Delaunay 三角剖分（Bowyer-Watson）：图片碎裂成大小不一的三角形 ---------- */
function circumCircleContains(a, b, c, p) {
  var ax = a.x - b.x, ay = a.y - b.y;
  var bx = c.x - b.x, by = c.y - b.y;
  var d = 2 * (ax * by - ay * bx);
  if (Math.abs(d) < 1e-9) return false;
  var ux = (by * (ax * ax + ay * ay) - ay * (bx * bx + by * by)) / d;
  var uy = (ax * (bx * bx + by * by) - bx * (ax * ax + ay * ay)) / d;
  var rad = Math.hypot(ux, uy);
  var dx = p.x - (ux + b.x), dy = p.y - (uy + b.y);
  return Math.hypot(dx, dy) <= rad;
}
function dedupeEdges(edges) {
  // Bowyer-Watson：bad 三角形共享的内部边出现 2 次应删除，只保留出现奇数次的凸包边（每条留一份）
  var count = {}, out = [], seen = {};
  for (var i = 0; i < edges.length; i++) {
    var e = edges[i];
    var key = (e[0] < e[1] ? e[0] + '_' + e[1] : e[1] + '_' + e[0]);
    count[key] = (count[key] || 0) + 1;
  }
  for (var i = 0; i < edges.length; i++) {
    var e = edges[i];
    var key = (e[0] < e[1] ? e[0] + '_' + e[1] : e[1] + '_' + e[0]);
    if (count[key] % 2 === 1 && !seen[key]) { out.push(e); seen[key] = true; }
  }
  return out;
}
function delaunay(pts) {
  var n = pts.length;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (var i = 0; i < n; i++) {
    var p = pts[i];
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  var dmax = Math.max(maxX - minX, maxY - minY) || 1;
  var midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
  pts.push({ x: midX - 20 * dmax, y: midY - dmax },
           { x: midX, y: midY + 20 * dmax },
           { x: midX + 20 * dmax, y: midY - dmax }); // super-triangle
  var tris = [[n, n + 1, n + 2]];
  for (var i = 0; i < n; i++) {
    var p = pts[i], bad = [], edges = [];
    for (var t = 0; t < tris.length; t++) {
      var tri = tris[t];
      if (circumCircleContains(pts[tri[0]], pts[tri[1]], pts[tri[2]], p)) bad.push(t);
    }
    for (var t = 0; t < bad.length; t++) {
      var tri = tris[bad[t]];
      edges.push([tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]);
    }
    for (var t = bad.length - 1; t >= 0; t--) tris.splice(bad[t], 1);
    edges = dedupeEdges(edges);
    for (var e = 0; e < edges.length; e++) tris.push([edges[e][0], edges[e][1], i]);
  }
  var result = [];
  for (var t = 0; t < tris.length; t++) {
    var tri = tris[t];
    if (tri[0] < n && tri[1] < n && tri[2] < n) result.push(tri);
  }
  pts.length = n; // 移除 super-triangle
  return result;
}

/* ---------- 图片碎裂：Delaunay 三角网格 + 随机把相邻三角形合并成四边形 ----------
   得到三角形/四边形混合的随机形状碎片，无缝、互不重叠、铺满整个圆，复原完整。
   沿圆周撒均匀边界点保证覆盖整个画面。 */
function polyCentroid(v) {
  var A = 0, cx = 0, cy = 0;
  for (var i = 0; i < v.length; i++) {
    var p = v[i], q = v[(i + 1) % v.length];
    var cr = p.x * q.y - q.x * p.y;
    A += cr; cx += (p.x + q.x) * cr; cy += (p.y + q.y) * cr;
  }
  A *= 0.5;
  if (Math.abs(A) < 1e-9) return { x: v[0].x, y: v[0].y };
  return { x: cx / (6 * A), y: cy / (6 * A) };
}
function isConvexPoly(poly) {
  var sign = 0;
  for (var i = 0; i < poly.length; i++) {
    var a = poly[i], b = poly[(i + 1) % poly.length], c = poly[(i + 2) % poly.length];
    var cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) < 1e-9) continue;
    var s = cr > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (sign !== s) return false;
  }
  return true;
}

function buildImageShards() {
  var img = userImg;
  var pts = [];
  var rim = 36; // 圆周边界点（保证覆盖整个画面）
  for (var i = 0; i < rim; i++) {
    var a = i / rim * Math.PI * 2;
    var rr = R * (0.985 + Math.random() * 0.015); // 半径微抖动：避免边界点共圆导致 Delaunay 数值爆炸
    pts.push({ x: R + Math.cos(a) * rr, y: R + Math.sin(a) * rr });
  }
  var n = randInt(45, 60); // 内部随机点（产生各种大小）
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2;
    var d = R * Math.sqrt(Math.random()) * 0.94;
    pts.push({ x: R + Math.cos(a) * d, y: R + Math.sin(a) * d });
  }
  var tris = delaunay(pts);
  // 边 → 相邻三角形
  function edgeKey(a, b) { return (a < b ? a + '_' + b : b + '_' + a); }
  var edgeMap = {};
  for (var t = 0; t < tris.length; t++) {
    var tri = tris[t];
    for (var k = 0; k < 3; k++) {
      var ek = edgeKey(tri[k], tri[(k + 1) % 3]);
      (edgeMap[ek] = edgeMap[ek] || []).push(t);
    }
  }
  // 随机把相邻三角形合并成凸四边形（保留一部分三角形 → 形状混合）
  var used = [];
  for (var t = 0; t < tris.length; t++) used.push(false);
  var polys = [];
  for (var t = 0; t < tris.length; t++) {
    if (used[t]) continue;
    var tri = tris[t], merged = false;
    for (var k = 0; k < 3 && !merged; k++) {
      var neighs = edgeMap[edgeKey(tri[k], tri[(k + 1) % 3])];
      for (var ni = 0; ni < neighs.length; ni++) {
        var t2 = neighs[ni];
        if (t2 === t || used[t2]) continue;
        var p1 = tri[k], p2 = tri[(k + 1) % 3], third1 = tri[(k + 2) % 3];
        var third2 = tris[t2][0];
        if (third2 === p1 || third2 === p2) third2 = tris[t2][1];
        if (third2 === p1 || third2 === p2) third2 = tris[t2][2];
        var quad = [pts[p1], pts[third1], pts[p2], pts[third2]];
        if (isConvexPoly(quad)) {
          used[t] = used[t2] = true;
          polys.push({ verts: quad });
          merged = true;
          break;
        }
      }
    }
  }
  for (var t = 0; t < tris.length; t++) {
    if (used[t]) continue;
    var tri = tris[t];
    polys.push({ verts: [pts[tri[0]], pts[tri[1]], pts[tri[2]]] });
  }
  var shards = [];
  for (var i = 0; i < polys.length; i++) {
    var poly = polys[i].verts;
    var cent = polyCentroid(poly);
    shards.push({
      f: { type: 'imgPoly', img: img, verts: poly,
           color: '#fff', color2: 'rgba(255,255,255,0.5)', colorD: 'rgba(0,0,0,0.2)' },
      mirror: false,
      sym: { x: cent.x, y: cent.y, rot: 0 },
      free: { x: cent.x, y: cent.y, rot: 0 },
      cur: { x: cent.x, y: cent.y, rot: 0 }
    });
  }
  instances = shards;
  imgMode = 'shattered';
}

/* ---------------- 每次打散重新随机：圆面内均匀散布 + 各自随机翻转 ---------------- */
function randomScatter() {
  for (var i = 0; i < instances.length; i++) {
    var inst = instances[i];
    var ang = Math.random() * Math.PI * 2;
    var dist = R * Math.sqrt(Math.random());
    inst.free.x = R + Math.cos(ang) * dist;
    inst.free.y = R + Math.sin(ang) * dist;
    inst.free.rot = Math.random() * Math.PI * 2;
  }
}

/* ---------------- 绘制路径 ---------------- */
function roundRectPath(c, x, y, w, h, rad) {
  rad = Math.min(rad, w / 2, h / 2);
  c.moveTo(x + rad, y);
  c.lineTo(x + w - rad, y);
  c.quadraticCurveTo(x + w, y, x + w, y + rad);
  c.lineTo(x + w, y + h - rad);
  c.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  c.lineTo(x + rad, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - rad);
  c.lineTo(x, y + rad);
  c.quadraticCurveTo(x, y, x + rad, y);
  c.closePath();
}
function starPath(c, Rr, r, points) {
  c.beginPath();
  for (var i = 0; i < points * 2; i++) {
    var rad = i % 2 === 0 ? Rr : r;
    var a = -Math.PI / 2 + i * Math.PI / points;
    var x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
}
function beginShape(c, f) {
  var s = f.size;
  switch (f.type) {
    case 'tri':
      c.beginPath();
      for (var i = 0; i < 3; i++) {
        var a = -Math.PI / 2 + i * Math.PI * 2 / 3;
        var x = Math.cos(a) * s / 2, y = Math.sin(a) * s / 2;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath(); break;
    case 'circle':
      c.beginPath(); c.arc(0, 0, s / 2, 0, Math.PI * 2); break;
    case 'rect':
      c.beginPath(); roundRectPath(c, -s / 2, -s / 2, s, s, s * 0.18); break;
    case 'diamond':
      c.beginPath();
      c.moveTo(0, -s * 0.55); c.lineTo(s * 0.55, 0); c.lineTo(0, s * 0.55); c.lineTo(-s * 0.55, 0);
      c.closePath(); break;
    case 'star':
      starPath(c, s * 0.55, s * 0.24, 5); break;
    case 'poly':
      c.beginPath();
      for (var i = 0; i < 6; i++) {
        var a = -Math.PI / 2 + i * Math.PI * 2 / 6;
        var x = Math.cos(a) * s / 2, y = Math.sin(a) * s / 2;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath(); break;
    case 'heart':
      c.beginPath();
      c.moveTo(0, s * 0.42);
      c.bezierCurveTo(-s * 0.55, 0, -s * 0.4, -s * 0.5, 0, -s * 0.15);
      c.bezierCurveTo(s * 0.4, -s * 0.5, s * 0.55, 0, 0, s * 0.42);
      c.closePath(); break;
    case 'sector':
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, s / 2, -0.9, 0.9); c.closePath(); break;
  }
}
/* 玻璃质感：通透渐变填充 + 斜向高光带 + 高光点 + 1px 细白边（剥离感） */
function glassFill(c, f) {
  var s = f.size;
  c.save();
  c.globalAlpha = 0.82;
  if (s > R * 0.12) {
    var g = c.createLinearGradient(0, -s / 2, 0, s / 2);
    g.addColorStop(0, f.color2);
    g.addColorStop(0.5, f.color);
    g.addColorStop(1, f.colorD);
    c.fillStyle = g;
  } else {
    c.fillStyle = f.color;
  }
  beginShape(c, f);
  c.fill();
  c.save();
  c.clip();
  if (s > R * 0.05) {
    c.globalAlpha = 0.2;
    c.fillStyle = '#fff';
    c.save(); c.translate(-s * 0.05, s * 0.05); c.rotate(-0.65);
    c.fillRect(-s * 0.7, -s * 0.16, s * 1.4, s * 0.11);
    c.restore();
    c.globalAlpha = 0.32;
    c.beginPath(); c.arc(-s * 0.27, -s * 0.3, s * 0.12, 0, Math.PI * 2); c.fill();
  }
  c.restore();
  c.globalAlpha = 0.55;
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.lineWidth = 1;
  beginShape(c, f);
  c.stroke();
  c.restore();
}
function drawShape(c, f, cur) {
  var s = f.size;
  if (f.type === 'imgPoly') {
    // 多边形碎片（三角形/四边形/五边形…）：clip 多边形 → 只画包围盒内的图片小块（性能关键）→ 白边 + 高光
    var img = f.img, v = f.verts;
    var cx = cur ? cur.x : f.cx, cy = cur ? cur.y : f.cy;
    var sc = Math.max(L / img.width, L / img.height);
    var imgX0 = R - img.width * sc / 2, imgY0 = R - img.height * sc / 2;
    var minX = v[0].x, maxX = v[0].x, minY = v[0].y, maxY = v[0].y;
    for (var vi = 1; vi < v.length; vi++) {
      if (v[vi].x < minX) minX = v[vi].x;
      if (v[vi].x > maxX) maxX = v[vi].x;
      if (v[vi].y < minY) minY = v[vi].y;
      if (v[vi].y > maxY) maxY = v[vi].y;
    }
    c.save();
    c.beginPath();
    c.moveTo(v[0].x - cx, v[0].y - cy);
    for (var vi = 1; vi < v.length; vi++) c.lineTo(v[vi].x - cx, v[vi].y - cy);
    c.closePath();
    c.save(); c.clip();
    c.drawImage(img,
      (minX - imgX0) / sc, (minY - imgY0) / sc, (maxX - minX) / sc, (maxY - minY) / sc,
      minX - cx, minY - cy, maxX - minX, maxY - minY);
    c.restore();
    c.globalAlpha = 0.6; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1;
    c.stroke();
    c.save(); c.clip();
    c.globalAlpha = 0.2; c.fillStyle = '#fff';
    c.beginPath();
    c.arc((minX + maxX) / 2 - cx, (minY + maxY) / 2 - cy,
          Math.min(maxX - minX, maxY - minY) * 0.08, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.restore();
    return;
  }
  if (f.type === 'img') {
    var aspect = clamp(f.sw / f.sh, 0.6, 1.6);
    var w = s, h = s * aspect;
    c.save();
    roundRectPath(c, -w / 2, -h / 2, w, h, 4);
    c.save(); c.clip();
    c.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, -w / 2, -h / 2, w, h);
    c.restore();
    if (w > R * 0.05) {
      c.save(); c.clip();
      c.globalAlpha = 0.18; c.fillStyle = '#fff';
      c.save(); c.translate(-w * 0.1, h * 0.05); c.rotate(-0.65);
      c.fillRect(-w * 0.7, -h * 0.16, w * 1.4, h * 0.11);
      c.restore();
      c.restore();
    }
    c.globalAlpha = 0.55; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1;
    roundRectPath(c, -w / 2, -h / 2, w, h, 4); c.stroke();
    c.restore();
    return;
  }
  if (f.type === 'ring') {
    c.save();
    c.globalAlpha = 0.85;
    c.strokeStyle = f.color; c.lineWidth = s * 0.12;
    c.beginPath(); c.arc(0, 0, s * 0.3, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 0.5; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1;
    c.beginPath(); c.arc(0, 0, s * 0.3, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 0.55; c.strokeStyle = f.color2; c.lineWidth = 1;
    c.beginPath(); c.arc(0, 0, s * 0.55, 0, Math.PI * 2); c.stroke();
    c.restore();
    return;
  }
  if (f.type === 'rays') {
    c.save();
    c.strokeStyle = f.color; c.lineCap = 'round'; c.lineWidth = 1;
    var rn = 6;
    for (var i = 0; i < rn; i++) {
      var a = i * (Math.PI * 2 / rn) + f.rot * 0.5;
      c.beginPath();
      c.moveTo(Math.cos(a) * s * 0.1, Math.sin(a) * s * 0.1);
      c.lineTo(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5);
      c.stroke();
    }
    c.globalAlpha = 0.5; c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.arc(0, 0, s * 0.5, 0, Math.PI * 2); c.stroke();
    c.restore();
    return;
  }
  glassFill(c, f);
}

/* ---------------- 渲染 ---------------- */
function genStars() {
  STARS = [];
  var n = 60 + Math.floor(Math.random() * 30);
  for (var i = 0; i < n; i++) {
    STARS.push({ x: Math.random() * L, y: Math.random() * L,
                 r: Math.random() * 1.4 + 0.3, a: Math.random() * 0.35 + 0.08 });
  }
}
function drawBackground(c) {
  var g = c.createRadialGradient(R, R, R * 0.1, R, R, R * 1.02);
  g.addColorStop(0, '#151735'); g.addColorStop(0.55, '#0b0c20'); g.addColorStop(1, '#05060f');
  c.fillStyle = g;
  c.fillRect(0, 0, L, L);
  c.save();
  c.globalCompositeOperation = 'lighter';
  var h = c.createRadialGradient(R, R, R * 0.02, R, R, R * 0.7);
  h.addColorStop(0, 'rgba(200,220,255,0.10)'); h.addColorStop(1, 'rgba(200,220,255,0)');
  c.fillStyle = h; c.fillRect(0, 0, L, L);
  for (var i = 0; i < STARS.length; i++) {
    var st = STARS[i];
    c.globalAlpha = st.a;
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(st.x, st.y, st.r, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;
  c.restore();
}
function drawInstance(c, inst) {
  var cur = inst.cur;
  c.save();
  c.translate(R, R); c.rotate(viewRot); c.translate(-R, -R);
  c.translate(cur.x, cur.y);
  c.rotate(cur.rot);
  var mc = inst.mirror ? (1 - scatterP) : 0;
  if (mc > 0.001) c.scale(1, 1 - 2 * mc);
  drawShape(c, inst.f, inst.cur);
  c.restore();
}
function renderTo(c) {
  c.save();
  c.beginPath(); c.arc(R, R, R * 0.995, 0, Math.PI * 2); c.clip(); // 圆形
  drawBackground(c);
  if (mode === 'img' && userImg && imgMode === 'whole' && instances.length === 0) {
    drawWholeImage(c);           // 图片模式：完整原图
  } else {
    for (var i = 0; i < instances.length; i++) drawInstance(c, instances[i]);
  }
  c.restore();
}
function render() { if (ctx) renderTo(ctx); }

/* ---------------- 动画：打散/复原 tween ---------------- */
function setScatter(to) {
  scatterTgt = to;
  spinAnim = null;
  if (to > 0.5) {
    if (mode === 'img' && imgMode === 'whole') buildImageShards(); // 图片模式：先碎裂成碎片
    randomScatter(); // 每次打散都重新随机（无限次）
  }
  var t = now();
  scatterTween = { from: scatterP, to: to, t0: t, dur: 850, items: [] };
  var toScatter = to > 0.5;
  for (var i = 0; i < instances.length; i++) {
    var inst = instances[i];
    scatterTween.items.push({
      fx: inst.cur.x, fy: inst.cur.y, frot: inst.cur.rot,
      tx: toScatter ? inst.free.x : inst.sym.x,
      ty: toScatter ? inst.free.y : inst.sym.y,
      trot: toScatter ? inst.free.rot : inst.sym.rot
    });
  }
  updateUI();
}
function updateScatter(nowMs) {
  if (!scatterTween) return;
  var e = clamp((nowMs - scatterTween.t0) / scatterTween.dur, 0, 1);
  var k = e * e * (3 - 2 * e);
  scatterP = scatterTween.from + (scatterTween.to - scatterTween.from) * k;
  for (var i = 0; i < instances.length; i++) {
    var it = scatterTween.items[i], inst = instances[i];
    inst.cur.x = lerp(it.fx, it.tx, k);
    inst.cur.y = lerp(it.fy, it.ty, k);
    inst.cur.rot = lerpAng(it.frot, it.trot, k);
  }
  if (e >= 1) scatterTween = null;
}

/* ---------------- 动画：转动 = 围绕中心公转 + 随机抖动/震动/旋转/移位 ---------------- */
function doSpin() {
  autoSpinNext = now() + randInt(2500, 3500); // 自动旋转的节拍（手动转动也会重置）
  var t = now();
  spinAnim = { t0: t, dur: 1500, items: [] };
  for (var i = 0; i < instances.length; i++) {
    var inst = instances[i];
    var dx = inst.cur.x - R, dy = inst.cur.y - R;
    var dist = Math.hypot(dx, dy) || 1;
    var ang = Math.atan2(dy, dx);
    var orbit = (Math.random() - 0.5) * Math.PI * 1.6;       // 围绕中心公转幅度
    var tx = R + Math.cos(ang + orbit) * dist + (Math.random() - 0.5) * R * 0.35; // 随机移位
    var ty = R + Math.sin(ang + orbit) * dist + (Math.random() - 0.5) * R * 0.35;
    var trot = inst.cur.rot + (Math.random() - 0.5) * Math.PI * 3; // 自身旋转
    spinAnim.items.push({
      fx: inst.cur.x, fy: inst.cur.y, frot: inst.cur.rot,
      tx: clamp(tx, 0, L), ty: clamp(ty, 0, L), trot: trot,
      shake: Math.random() * R * 0.12 + 4,   // 抖动/震动振幅
      freq: 10 + Math.random() * 14,          // 震动频率
      phase: Math.random() * Math.PI * 2
    });
  }
  updateUI();
}
function updateSpin(nowMs) {
  if (!spinAnim) return;
  var e = clamp((nowMs - spinAnim.t0) / spinAnim.dur, 0, 1);
  var k = e * e * (3 - 2 * e);
  var damp = 1 - k; // 震动随动画衰减
  for (var i = 0; i < instances.length; i++) {
    var it = spinAnim.items[i], inst = instances[i];
    var bx = lerp(it.fx, it.tx, k);
    var by = lerp(it.fy, it.ty, k);
    var sh = damp * it.shake;
    inst.cur.x = bx + Math.sin(nowMs * 0.001 * it.freq + it.phase) * sh;
    inst.cur.y = by + Math.cos(nowMs * 0.001 * it.freq * 1.3 + it.phase) * sh;
    inst.cur.rot = lerpAng(it.frot, it.trot, k);
  }
  if (e >= 1) spinAnim = null;
}

/* ---------------- 主循环 ---------------- */
function loop(nowMs) {
  requestAnimationFrame(loop);
  var dt = Math.min((nowMs - (last || nowMs)) / 1000 || 0, 0.05);
  last = nowMs;
  if (spinAnim) updateSpin(nowMs);
  // 自动旋转 = 每隔几秒自动触发一次普通「转动」（围绕中心公转+抖动），不是碎片自转
  if (autoSpin && !scatterTween && !spinAnim && instances.length && nowMs >= autoSpinNext) {
    doSpin();
  }
  updateScatter(nowMs);
  render();
}

/* ---------------- 画布尺寸 ---------------- */
function resize() {
  if (!canvas) return;
  var css = canvas.clientWidth || 320;
  DPR = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
  canvas.width = Math.round(css * DPR);
  canvas.height = Math.round(css * DPR);
  ctx = canvas.getContext('2d');
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  L = css; R = L / 2;
  genStars();
  buildInstances();
}

/* ---------------- 拖动：仅整体旋转（手动浏览） ---------------- */
function localXY(e) {
  var rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * (L / rect.width), y: (e.clientY - rect.top) * (L / rect.height) };
}
function onDown(e) {
  e.preventDefault();
  var p = localXY(e);
  dragRotLast = p.x;
  if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) {} }
}
function onMove(e) {
  if (dragRotLast === null) return;
  var p = localXY(e);
  viewRot += (p.x - dragRotLast) * 0.006;
  dragRotLast = p.x;
}
function onUp() { dragRotLast = null; }

/* ---------------- 上传图片 ---------------- */
function onFile(e) {
  var file = e.target.files && e.target.files[0];
  e.target.value = '';
  loadImageFile(file);
}
function loadImageFile(file) {
  if (!file) return;
  if (!/^image\//.test(file.type || '')) { toast('请选择图片文件'); return; }
  toast('正在读取图片…');
  var img = new Image();
  img.onload = function () {
    userImg = img;
    imgMode = 'whole';
    fragments = [];
    instances = [];
    setMode('img');
    updateUI();
    toast('已上传，点💫打散让图片碎裂');
  };
  img.onerror = function () { toast('图片加载失败，换个图片试试'); };
  var fr = new FileReader();
  fr.onload = function () { img.src = fr.result; };
  fr.onerror = function () { toast('读取文件失败'); };
  fr.readAsDataURL(file);
}

/* ---------------- B站 SDK 懒加载（永不阻塞页面） ---------------- */
var sdkLoading = null;
function ensureSdk() {
  if (typeof window === 'undefined' || window.toy) return Promise.resolve();
  // file:// 等非 http(s) 环境不加载 SDK（否则 `//s1.hdslb.com` 解析成本地路径触发安全报错），
  // 导出等自动回退 Web 下载。B站 Toy 部署为 https 不受影响。
  if (window.location && window.location.protocol && !/^https?:$/.test(window.location.protocol)) {
    return Promise.resolve();
  }
  if (!sdkLoading) {
    sdkLoading = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js'; // 绝对 https，避免 file:// 解析错乱
      s.async = true;
      s.onload = resolve;
      s.onerror = resolve;
      document.head.appendChild(s);
    });
  }
  return sdkLoading;
}

/* ---------------- 导出 ---------------- */
async function exportImage() {
  ensureSdk();
  try {
    var out = document.createElement('canvas');
    out.width = EXPORT_SIZE; out.height = EXPORT_SIZE;
    var oc = out.getContext('2d');
    if (!oc) { toast('导出失败'); return; }
    oc.setTransform(EXPORT_SIZE / L, 0, 0, EXPORT_SIZE / L, 0, 0);
    renderTo(oc);
    var url = out.toDataURL('image/png');
    if (typeof window !== 'undefined' && window.toy) {
      var ok = false;
      try { ok = await window.toy.isSupport('saveImageToAlbum').catch(function () { return false; }); }
      catch (err) { ok = false; }
      if (ok) {
        await window.toy.saveImageToAlbum({
          base64Data: url.replace(/^data:image\/png;base64,/, ''),
          hintMsg: '需要相册权限保存万花筒图片'
        });
        toast('已保存到相册 📤');
        return;
      }
    }
    var a = document.createElement('a');
    a.download = 'kaleidoscope_' + Date.now() + '.png';
    a.href = url;
    if (a.click) a.click();
    toast('已导出 PNG 📤');
  } catch (err) {
    toast('导出失败：' + err.message);
  }
}

/* ---------------- UI 绑定 ---------------- */
function setMode(m) {
  mode = m;
  var btns = document.querySelectorAll('.mode-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].getAttribute('data-mode') === m);
  }
  $('btn-random').hidden = m !== 'rand';
  $('btn-upload').hidden = m !== 'img'; // 上传 = label 包裹原生 file input
  if (m === 'img') {
    // 切到图片模式：清空所有碎片，只留整图（或等上传）
    fragments = [];
    instances = [];
    imgMode = 'whole';
    scatterP = 0; scatterTgt = 0; scatterTween = null; spinAnim = null;
    if (!userImg) toast('请先上传一张图片');
  }
  if (m === 'rand') {
    // 切到随机模式：强制重新生成一组全新随机碎片（从图片切回也必须重新生成）
    sectorCount = pick([6, 8, 12]);
    genFragmentsRand();
    buildInstances();
    setScatter(0);
  }
  updateUI();
}
function updateUI() {
  var scattered = scatterTgt > 0.5 || scatterP > 0.05;
  var bs = $('btn-scatter'), br = $('btn-restore'), hint = $('hint');
  if (bs) bs.disabled = false;              // 打散可无限次点击
  if (br) br.disabled = !scattered;         // 复原在散开后可用
  if (hint) {
    if (mode === 'img') {
      hint.textContent = scattered
        ? '🔀转动围绕中心转+抖动 · 可再💫打散 · 点🔁复原拼回原图'
        : '点💫打散，让图片碎裂成大量碎片';
    } else {
      hint.textContent = scattered
        ? '可继续💫打散或🔀转动 · 🔀碎片绕中心转+抖动 · 点🔁复原'
        : '💫打散无限次晃动 · 🔀碎片绕中心转+抖动 · 开启自动旋转更炫';
    }
  }
}
function bindUI() {
  $('btn-random').addEventListener('click', function () {
    sectorCount = pick([6, 8, 12]);
    genFragmentsRand();
    buildInstances();
    setScatter(0);
    toast('新图案 ✨');
  });
  // 上传：label 点击由 JS 接管打开文件选择器（showPicker 现代 API + click 兜底），另支持拖拽图片
  $('file-img').addEventListener('change', onFile);
  $('btn-upload').addEventListener('click', function (e) {
    e.preventDefault(); // 不依赖 label for 原生转发，统一走 JS
    var lab = $('btn-upload');
    lab.textContent = '⏳ 正在打开…';   // 可见反馈：若文字变化说明点击确实命中按钮
    setTimeout(function () { lab.textContent = '📷 上传图片'; }, 1500);
    var inp = $('file-img');
    inp.value = '';
    try {
      if (typeof inp.showPicker === 'function') { inp.showPicker(); return; }
    } catch (err) {}
    inp.click();
  });
  if (canvas) {
    canvas.addEventListener('dragover', function (e) { e.preventDefault(); });
    canvas.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadImageFile(f);
    });
  }
  $('btn-scatter').addEventListener('click', function () {
    setScatter(1); // 图片模式：整图→碎裂成大量碎片；随机模式：无限次晃动
    toast(mode === 'img' ? '图片碎裂 💥' : '晃动万花筒 💫');
  });
  $('btn-restore').addEventListener('click', function () {
    setScatter(0);
    toast(mode === 'img' ? '复原图片 🔁' : '复原 🔁');
  });
  $('btn-spin').addEventListener('click', function () {
    doSpin(); // 碎片围绕中心公转 + 随机抖动/震动/旋转/移位
    toast('围绕中心转动 🔀');
  });
  $('btn-export').addEventListener('click', exportImage);
  $('chk-auto').addEventListener('change', function () {
    autoSpin = this.checked;
    autoSpinNext = 0; // 开启后下一帧立即自动转一次
    updateUI();
  });
  var mbs = document.querySelectorAll('.mode-btn');
  for (var i = 0; i < mbs.length; i++) {
    mbs[i].addEventListener('click', function () { setMode(this.getAttribute('data-mode')); });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); $('btn-spin').click(); }
      else if (e.key === 'ArrowLeft') viewRot -= 0.15;
      else if (e.key === 'ArrowRight') viewRot += 0.15;
    });
  }
}

/* ---------------- 初始化 ---------------- */
function init() {
  canvas = $('kaleid');
  if (!canvas) return;
  // file:// 环境诊断：上传等可能受限，提示改用本地 http 服务器
  if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
    toast('⚠️ file:// 模式：上传可能受限，请用 http://localhost:8123 打开');
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  bindUI();
  ensureSdk();
  resize();
  genFragmentsRand();
  buildInstances();
  if (typeof window !== 'undefined') window.addEventListener('resize', resize);
}
if (typeof requestAnimationFrame !== 'undefined' &&
    typeof document !== 'undefined' && document.getElementById) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); requestAnimationFrame(loop); });
  } else {
    init();
    requestAnimationFrame(loop);
  }
}
