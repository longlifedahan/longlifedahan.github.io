/* ============ 万花筒 冒烟测试：模拟 window.toy + 最小 DOM ============ */
/* 注意：本文件不使用 'use strict'，否则 eval 后的 var/function 不会暴露到模块作用域。 */
var fs = require('fs');
var path = require('path');

/* ---- 最小 canvas 2d 上下文桩 ---- */
var _clicks = [];
function ctxStub() {
  var c = {};
  ['clearRect','beginPath','arc','fill','stroke','moveTo','lineTo','closePath','quadraticCurveTo',
   'bezierCurveTo','fillRect','save','restore','clip','setTransform','translate','rotate','scale',
   'drawImage','fillText','strokeText'].forEach(function (m) { c[m] = function () {}; });
  c.createLinearGradient = function () { return { addColorStop: function () {} }; };
  c.createRadialGradient = function () { return { addColorStop: function () {} }; };
  c.measureText = function () { return { width: 10 }; };
  c.canvas = { width: 0, height: 0 };
  return c;
}
function makeEl() {
  return {
    _h: {},
    addEventListener: function (t, fn, o) { (this._h[t] = this._h[t] || []).push(fn); },
    classList: {
      _s: [],
      add: function (c) { if (this._s.indexOf(c) < 0) this._s.push(c); },
      remove: function (c) { var i = this._s.indexOf(c); if (i >= 0) this._s.splice(i, 1); },
      toggle: function (c, f) { var has = this._s.indexOf(c) >= 0; if (f === undefined) { has ? this.remove(c) : this.add(c); } else { f ? this.add(c) : this.remove(c); } },
      contains: function (c) { return this._s.indexOf(c) >= 0; }
    },
    style: {}, hidden: false, textContent: '', innerHTML: '', value: '', checked: false, src: '',
    width: 0, height: 0,
    appendChild: function () {}, setAttribute: function () {},
    remove: function () {}, click: function () { _clicks.push(this); },
    getContext: function () { return ctxStub(); },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 400, height: 620 }; },
    closest: function () { return null; },
    setPointerCapture: function () {}, releasePointerCapture: function () {},
    toDataURL: function () { return 'data:image/png;base64,QUJD'; },
    getAttribute: function (a) { return this._attrs ? this._attrs[a] : null; },
    _attrs: {}
  };
}

global.document = {
  readyState: 'complete',
  _els: {},
  getElementById: function (id) { if (!this._els[id]) this._els[id] = makeEl(); return this._els[id]; },
  addEventListener: function () {},
  createElement: function (tag) {
    var el = makeEl();
    if (tag === 'canvas') { el.getContext = function () { return ctxStub(); }; }
    return el;
  },
  querySelectorAll: function () { return []; },
  head: { appendChild: function () {} },
  body: { appendChild: function () {} }
};
global.localStorage = {
  _d: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; }
};
Object.defineProperty(global, 'navigator', { value: { userAgent: 'test' }, configurable: true });

/* ---- 模拟 B站 SDK：isSupport / saveImageToAlbum ---- */
var sdk = {
  _saved: null,
  isSupport: function (ability) { return Promise.resolve(ability === 'saveImageToAlbum'); },
  saveImageToAlbum: function (req) { this._saved = req; return Promise.resolve({ localPath: '/tmp/x.png' }); }
};
global.window = { toy: sdk, addEventListener: function () {}, devicePixelRatio: 1 };
global.setTimeout = function (fn, t) { fn(); return 1; };

var code = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
function flush() { return new Promise(function (r) { setTimeout(r, 30); }); }
function check(name, cond) {
  if (cond) console.log('PASS  ' + name);
  else { console.log('FAIL  ' + name); process.exitCode = 1; }
}

eval(code);

/* ---- 手工设定逻辑画布（浏览器 resize 才计算，测试直接赋值） ---- */
L = 400; R = 200; sectorCount = 8;
var STEP = Math.PI * 2 / sectorCount;

(async function () {
  /* ---------- 随机碎片生成 ---------- */
  genFragmentsRand();
  check('随机碎片数量 42-60（扇区 8）', fragments.length >= 42 && fragments.length <= 60);
  var typesOk = true, thetaOk = true;
  fragments.forEach(function (f) {
    if (SHAPES.indexOf(f.type) < 0) typesOk = false;
    if (f.theta < 0 || f.theta > STEP + 1e-6) thetaOk = false;
    if (!f.color || !f.size || f.size <= 0) typesOk = false;
  });
  check('碎片类型全部合法', typesOk);
  check('碎片 theta 均在第一扇区内', thetaOk);
  var sizes = fragments.map(function (f) { return f.size; });
  var maxS = Math.max.apply(null, sizes), minS = Math.min.apply(null, sizes);
  check('碎片大小差异明显（max/min > 3）', maxS / minS > 3);
  check('碎片数量多（够打散覆盖画面）', fragments.length * sectorCount >= 250);

  /* ---------- 对称实例 ---------- */
  buildInstances();
  check('实例数 = 碎片数 × 扇区数', instances.length === fragments.length * sectorCount);
  var mirrorCount = instances.filter(function (i) { return i.mirror; }).length;
  check('镜像实例占一半（k 奇数镜像）', mirrorCount === instances.length / 2);
  var symOk = instances.every(function (i) {
    return isFinite(i.sym.x) && isFinite(i.sym.y) && i.sym.x > 0 && i.sym.x < L && i.sym.y > 0 && i.sym.y < L;
  });
  check('对称位姿均落在画布内', symOk);

  /* ---------- 渲染不抛错（对称态 + 散开态） ---------- */
  var c = ctxStub();
  renderTo(c);
  check('对称态渲染不抛错', true);
  setScatter(1);
  updateScatter(scatterTween.t0 + scatterTween.dur); // 直接跳完
  renderTo(c);
  check('散开态渲染不抛错（scatterP=1）', Math.abs(scatterP - 1) < 1e-6);

  /* ---------- 每次打散随机：目标遍布整个圆面 ---------- */
  randomScatter();
  var coverOk = instances.every(function (i) {
    var d = Math.hypot(i.free.x - R, i.free.y - R);
    return d <= R + 0.5; // 圆内均匀分布，覆盖大部分画面
  });
  check('打散目标均在圆内、覆盖整个圆面', coverOk);

  /* ---------- 打散/复原动画插值 ---------- */
  setScatter(0);
  updateScatter(scatterTween.t0 + scatterTween.dur); // 先确保 p=0
  randomScatter();              // 打散前重新随机，保证 free≠sym
  setScatter(1);
  var t0 = scatterTween.t0;
  updateScatter(t0);            // e=0 → p=from=0
  check('打散动画起点 p=0', Math.abs(scatterP) < 1e-6);
  updateScatter(t0 + scatterTween.dur / 2); // e=0.5 → ease=0.5
  check('打散中途 0<p<1', scatterP > 0 && scatterP < 1);
  renderTo(ctxStub());          // drawInstance 会刷新各实例 cur 位姿
  var f0 = instances[0];
  check('中途位姿在对称与散开之间',
    Math.abs(f0.cur.x - (f0.sym.x + f0.free.x) / 2) < 1e-6 &&
    Math.abs(f0.cur.y - (f0.sym.y + f0.free.y) / 2) < 1e-6);
  updateScatter(t0 + scatterTween.dur);
  check('打散动画终点 p=1', Math.abs(scatterP - 1) < 1e-6);

  setScatter(0);
  updateScatter(scatterTween.t0 + scatterTween.dur);
  check('复原动画回到 p=0', Math.abs(scatterP) < 1e-6);

  /* ---------- 打散可无限次 ---------- */
  setScatter(1);
  updateScatter(scatterTween.t0 + scatterTween.dur);
  setScatter(1); // 再打散一次（模拟再次晃动）
  check('打散可无限次点击（重新随机）', scatterTween !== null && scatterTgt > 0.5);
  updateScatter(scatterTween.t0 + scatterTween.dur);
  check('再次打散后 scatterP 仍=1', Math.abs(scatterP - 1) < 1e-6);

  /* ---------- 转动：围绕中心公转 + 随机抖动/震动/旋转/移位 ---------- */
  doSpin();
  check('转动触发公转+抖动动画', spinAnim && spinAnim.items.length === instances.length);
  var hasOrbit = spinAnim.items.some(function (it) {
    return Math.abs(it.tx - it.fx) > 0.5 || Math.abs(it.ty - it.fy) > 0.5;
  });
  check('碎片围绕中心公转并移位', hasOrbit);
  check('碎片带随机抖动振幅', spinAnim.items.every(function (it) { return it.shake > 0; }));
  var spinItems = spinAnim.items;
  var rots0 = instances.map(function (i) { return i.cur.rot; });
  updateSpin(spinAnim.t0);   // e=0
  check('自转起点角度不变',
    instances.every(function (i, idx) { return Math.abs(i.cur.rot - rots0[idx]) < 1e-6; }));
  updateSpin(spinAnim.t0 + spinAnim.dur); // 跳完（spinAnim 会置空）
  var rots1 = instances.map(function (i) { return i.cur.rot; });
  check('转动后碎片角度确有变化',
    instances.some(function (i, idx) { return Math.abs(i.cur.rot - rots0[idx]) > 0.1; }));
  check('转动结束落在公转目标附近',
    instances.every(function (i, idx) {
      return Math.abs(i.cur.x - spinItems[idx].tx) < 0.5 && Math.abs(i.cur.y - spinItems[idx].ty) < 0.5;
    }));
  setScatter(0);
  updateScatter(scatterTween.t0 + scatterTween.dur);
  check('转动后仍可复原回对称', Math.abs(scatterP) < 1e-6);

  /* ---------- 所有形状绘制不抛错 ---------- */
  var shapeOk = true;
  SHAPES.forEach(function (t) {
    try {
      drawShape(ctxStub(), { type: t, size: 40, color: '#f80', color2: '#ff0',
                             sw: 100, sh: 100, sx: 0, sy: 0, img: { width: 100, height: 100 },
                             rot: 0.5 });
    } catch (e) { shapeOk = false; }
  });
  check('10 种形状绘制均不抛错', shapeOk);

  /* ---------- 图片模式：整图 → 三角形碎裂 → 复原 ---------- */
  userImg = { width: 400, height: 300 };
  mode = 'img';
  imgMode = 'whole';
  fragments = [];
  instances = [];
  renderTo(ctxStub());
  check('图片模式整图渲染不抛错', true);
  buildImageShards();
  check('图片碎裂成大量多边形（Delaunay+合并）', instances.length >= 60);
  var shardOk = instances.every(function (i) {
    return i.f.type === 'imgPoly' && i.f.img === userImg && i.f.verts && i.f.verts.length >= 3 &&
           i.sym.rot === 0 && isFinite(i.sym.x) && isFinite(i.sym.y);
  });
  check('碎片均为多边形、位于原图位置', shardOk);
  var hasEdge = instances.some(function (i) {
    return i.f.verts.some(function (v) {
      return Math.hypot(v.x - R, v.y - R) > R * 0.97; // 边界点存在 → 多边形铺满整个圆
    });
  });
  check('多边形铺满整个圆（含边缘，复原完整）', hasEdge);
  var shapes = instances.map(function (i) { return i.f.verts.length; });
  var hasTri = shapes.some(function (n) { return n === 3; });
  var hasQuadPlus = shapes.some(function (n) { return n >= 4; });
  check('碎片形状多样（三角形+四边形及以上混合）', hasTri && hasQuadPlus);
  var areas = instances.map(function (i) {
    var v = i.f.verts, a = 0;
    for (var k = 0; k < v.length; k++) {
      var p = v[k], q = v[(k + 1) % v.length];
      a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a) / 2;
  });
  check('碎片大小不一（max/min > 2）',
    Math.max.apply(null, areas) / Math.min.apply(null, areas) > 2);
  setScatter(1);
  updateScatter(scatterTween.t0 + scatterTween.dur);
  renderTo(ctxStub());
  check('图片碎裂渲染不抛错（scatterP=1）', Math.abs(scatterP - 1) < 1e-6);
  setScatter(0);
  updateScatter(scatterTween.t0 + scatterTween.dur);
  var restored = instances.every(function (i) {
    return Math.abs(i.cur.x - i.sym.x) < 1e-6 &&
           Math.abs(i.cur.y - i.sym.y) < 1e-6 &&
           Math.abs(i.cur.rot - i.sym.rot) < 1e-6;
  });
  check('复原后碎片拼回原图位置', restored);
  mode = 'rand';

  /* ---------- 自动旋转 = 自动触发普通转动（非碎片自转） ---------- */
  autoSpin = true;
  autoSpinNext = 0;
  doSpin();
  check('doSpin 会重置自动旋转节拍 autoSpinNext', autoSpinNext > 0);
  autoSpin = false;
  var g2 = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
  check('自动旋转走 doSpin 而非碎片自转',
    g2.indexOf('autoSpinNext') >= 0 &&
    g2.indexOf('cur.rot += (Math.random() - 0.5) * 5') === -1);

  /* ---------- 从图片切回随机：强制重新生成碎片 ---------- */
  mode = 'img';
  fragments = [];
  instances = [];
  imgMode = 'whole';
  setMode('rand');
  check('切回随机强制重新生成碎片',
    fragments.length >= 30 &&
    instances.length === fragments.length * sectorCount &&
    fragments.every(function (f) { return f.type && f.size > 0; }));

  /* ---------- 导出：SDK 保存相册 ---------- */
  sdk._saved = null;
  _clicks.length = 0;
  await exportImage();
  await flush();
  check('导出走 SDK 保存相册', sdk._saved && typeof sdk._saved.base64Data === 'string');

  /* ---------- 导出：Web 端浏览器下载 ---------- */
  sdk.isSupport = function () { return Promise.resolve(false); };
  _clicks.length = 0;
  await exportImage();
  await flush();
  check('SDK 不支持时回退 <a download>', _clicks.length === 1);
  sdk.isSupport = function (a) { return Promise.resolve(a === 'saveImageToAlbum'); };

  /* ---------- 角度插值 ---------- */
  check('lerpAng 最短路径插值', Math.abs(lerpAng(0, Math.PI * 1.5, 0.5) - (-Math.PI * 0.25)) < 1e-6);

  /* ---------- B站 SDK 永不阻塞页面（防回归） ---------- */
  var html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  check('index.html 不再有同步 SDK script', html.indexOf('toy-sdk.js') === -1);
  var gcode = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
  check('game.js 用 async 动态加载 SDK', gcode.indexOf('s.async = true') >= 0);
  check('SDK 加载失败不阻塞（onerror 兜底）', gcode.indexOf('s.onerror = resolve') >= 0);

  /* ---------- file:// 本地打开跳过 SDK（避免安全报错） ---------- */
  window.toy = null;
  window.location = { protocol: 'file:' };
  sdkLoading = null;
  ensureSdk();
  check('file:// 下不创建 SDK 脚本（sdkLoading 保持 null）', sdkLoading === null);
  window.location = { protocol: 'https:' };
  sdkLoading = null;
  ensureSdk();
  check('https:// 下创建 SDK 脚本（sdkLoading 已设置）', sdkLoading !== null);
  window.toy = sdk;

  console.log('--- 万花筒冒烟测试完成 ---');
})().catch(function (e) { console.error('测试异常:', e); process.exitCode = 1; });
