/* ============ 圆盘作画 冒烟测试：模拟 window.toy + 最小 DOM ============ */
/* 注意：本文件不使用 'use strict'，否则 eval 后的 var/function 不会暴露到模块作用域。 */
var fs = require('fs');
var path = require('path');

/* ---- 最小 canvas 2d 上下文桩 ---- */
var _clicks = [];
function ctxStub() {
  var c = {};
  ['clearRect','beginPath','arc','fill','stroke','moveTo','lineTo','closePath',
   'fillRect','save','restore','clip','setTransform','translate','rotate','scale',
   'drawImage','strokeRect'].forEach(function (m) { c[m] = function () {}; });
  c.createLinearGradient = function () { return { addColorStop: function () {} }; };
  c.createRadialGradient = function () { return { addColorStop: function () {} }; };
  c.measureText = function () { return { width: 10 }; };
  c.canvas = { width: 0, height: 0 };
  return c;
}
function makeEl() {
  return {
    _h: {},
    _attrs: {},
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
    appendChild: function () {}, setAttribute: function (a, v) { this._attrs[a] = v; },
    remove: function () {}, click: function () { _clicks.push(this); },
    getContext: function () { return ctxStub(); },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 400, height: 620 }; },
    closest: function () { return null; },
    setPointerCapture: function () {}, releasePointerCapture: function () {},
    toDataURL: function () { return 'data:image/png;base64,QUJD'; },
    getAttribute: function (a) { return this._attrs ? this._attrs[a] : null; }
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
global.requestAnimationFrame = function () { return 1; };
global.setTimeout = function (fn, t) { fn(); return 1; };
global.clearTimeout = function () {};

/* ---- 模拟 B站 SDK：isSupport / saveImageToAlbum ---- */
var sdk = {
  _saved: null,
  isSupport: function (ability) { return Promise.resolve(ability === 'saveImageToAlbum'); },
  saveImageToAlbum: function (req) { this._saved = req; return Promise.resolve({ localPath: '/tmp/x.png' }); }
};
global.window = { toy: sdk, addEventListener: function () {}, devicePixelRatio: 1,
                  confirm: function () { return true; } };

var code = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
function flush() { return new Promise(function (r) { setTimeout(r, 30); }); }
function check(name, cond) {
  if (cond) console.log('PASS  ' + name);
  else { console.log('FAIL  ' + name); process.exitCode = 1; }
}

eval(code);

/* ---- 手工设定几何（模拟正方形圆盘画布，物理坐标） ---- */
W = 400; H = 400; R = 100; cx = 200; cy = 200; S = 200; dpr = 1;
ink.width = S; ink.height = S;
lineWidth = 10;
strokes = [];
curStroke = null;
theta = 0;
spinning = true;

(async function () {
  /* ---------- 坐标转换 screenToWorld ---------- */
  var p1 = screenToWorld(200, 150); // 圆盘正上方 50
  check('theta=0 上方点映射到世界 (0,-50)',
    Math.abs(p1.x) < 1e-9 && Math.abs(p1.y - (-50)) < 1e-9);
  theta = Math.PI / 2;
  var p2 = screenToWorld(250, 200); // 圆盘正右方 50，逆旋转 π/2 后应落在世界顶部
  check('theta=π/2 右方点逆旋转映射到世界 (0,-50)',
    Math.abs(p2.x) < 1e-9 && Math.abs(p2.y - (-50)) < 1e-9);
  theta = 0;
  var p3 = screenToWorld(200, 400); // 圆外 200，clamp 到圆周
  check('圆外点 clamp 到圆周边缘 (0,100)',
    Math.abs(p3.x) < 1e-9 && Math.abs(p3.y - 100) < 1e-9);
  theta = 0;

  /* ---------- 落笔判定 ---------- */
  check('圆盘中心判定在盘内', pointInDisc(200, 200));
  check('圆盘外判定不在盘内', !pointInDisc(200, 400));

  /* ---------- 旋转 tick ---------- */
  var t0 = theta;
  tick(1);
  check('旋转中 theta 增加 ROT_SPEED', Math.abs(theta - (t0 + ROT_SPEED)) < 1e-9);
  t0 = theta;
  spinning = false;
  tick(1);
  check('暂停时 theta 不变', Math.abs(theta - t0) < 1e-9);
  spinning = true;
  tick(0.5);
  check('恢复旋转后 theta 继续增加', theta > t0);

  /* ---------- 转速 / 方向 ---------- */
  t0 = theta;
  setSpeed(2);
  tick(1);
  check('调快转速后 theta 增加 2 倍', Math.abs(theta - (t0 + 2)) < 1e-9);
  toggleDir();           // 逆时针 -> 顺时针
  check('切换方向后 dir=-1', dir === -1);
  t0 = theta;
  tick(1);
  check('顺时针后 theta 减小', Math.abs(theta - (t0 - 2)) < 1e-9);
  toggleDir();
  setSpeed(1);
  check('恢复默认转速与方向', rotSpeed === 1 && dir === 1);

  /* ---------- 旋转方向箭头路径 ---------- */
  updateArrowPath();
  var d1 = arrowPath._attrs ? arrowPath._attrs.d : null;
  toggleDir();   // 逆时针 -> 顺时针
  updateArrowPath();
  var d2 = arrowPath._attrs ? arrowPath._attrs.d : null;
  check('切换方向后箭头路径重建（尖端反向）', d1 !== d2);
  toggleDir();

  /* ---------- 笔触粗细 ---------- */
  setSize(8);
  check('调粗笔触后 lineWidth = R*8%', lineWidth === Math.max(2, Math.round(R * 8 / 100)));
  setSize(5.5);

  /* ---------- 底图 cover 绘制 ---------- */
  bgImage = { width: 200, height: 100 };
  var bgCtx = ctxStub();
  drawBgImage(bgCtx, 100);
  check('底图 cover 绘制不抛错', true);
  bgImage = null;

  /* ---------- 落笔流程：一笔多点 ---------- */
  strokes = [];
  theta = 0;
  beginStroke({ x: 0, y: 0 });
  moveStroke({ x: 10, y: 0 });
  moveStroke({ x: 20, y: 5 });
  moveStroke({ x: 30, y: -5 });
  endStroke();
  check('拖动落笔产生一笔', strokes.length === 1);
  check('该笔含全部采样点', strokes[0].pts.length === 4);
  check('该笔记录了颜色与线宽', strokes[0].color === inkColor && strokes[0].width === lineWidth);

  /* ---------- 撤销：撤销上一笔 ---------- */
  beginStroke({ x: 0, y: 0 });
  moveStroke({ x: 5, y: 5 });
  endStroke();
  check('两笔后 strokes=2', strokes.length === 2);
  undo();
  check('撤销后剩一笔', strokes.length === 1);
  check('撤销后剩的是第一笔', strokes[0].pts.length === 4);
  undo();
  check('再撤销后为空', strokes.length === 0);
  undo();
  check('空历史撤销不报错、长度保持 0', strokes.length === 0);

  /* ---------- 单点落笔 ---------- */
  beginStroke({ x: -40, y: 30 });
  endStroke();
  check('单点落笔也保留为一笔', strokes.length === 1 && strokes[0].pts.length === 1);
  renderInk();
  check('单点渲染不抛错', true);
  undo();

  /* ---------- 重绘笔迹层 ---------- */
  strokes.push({ color: '#ff4d4f', width: 8,
    pts: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: -20, y: -20 }] });
  strokes.push({ color: '#3b7cff', width: 6, pts: [{ x: -30, y: 40 }] });
  renderInk();
  check('多笔画（含单点）重绘不抛错', true);

  /* ---------- 换底色保留笔迹 ---------- */
  var n = strokes.length;
  setBgColor('#ffe3e9');
  check('换底色后底色生效', bgColor === '#ffe3e9');
  check('换底色不清空笔迹', strokes.length === n);
  setBgColor('#ffffff');

  /* ---------- 旋转 + 落笔构成图案（世界坐标采样随 θ 变化） ---------- */
  // 同一屏幕点在不同 θ 下应得到不同世界坐标 → 证明旋转下能画出展开图案
  theta = 0;
  var q1 = screenToWorld(200, 160);
  theta = 0.5;
  var q2 = screenToWorld(200, 160);
  check('旋转时同一落点世界坐标随时间变化（形成旋转图案）',
    Math.abs(q1.x - q2.x) > 1e-3 || Math.abs(q1.y - q2.y) > 1e-3);
  theta = 0;

  /* ---------- 按住不动：笔尖随盘转持续采样，画出圆环轨迹 ---------- */
  strokes = [];
  theta = 0;
  drawing = true;
  curPointer = { sx: 200, sy: 100 }; // 圆盘正上方按下，手指不动
  beginStroke(screenToWorld(200, 100));
  var n1 = curStroke.pts.length;
  tick(0.5); // theta 增加，笔尖世界坐标变化 → 持续采样
  var n2 = curStroke.pts.length;
  check('按住不动也会画出轨迹（采样点增加）', n2 > n1);
  tick(0.5);
  var n3 = curStroke.pts.length;
  check('轨迹持续增长（形成圆环）', n3 > n2);
  for (var k = 0; k < 8; k++) tick(0.5); // 继续转大半圈
  endStroke();
  var circleStroke = strokes[strokes.length - 1];
  check('该笔含大量采样点（绕盘一周形成环）', circleStroke.pts.length > 5);
  var rMax = 0, rMin = Infinity;
  circleStroke.pts.forEach(function (p) {
    var rr = Math.hypot(p.x, p.y);
    if (rr > rMax) rMax = rr;
    if (rr < rMin) rMin = rr;
  });
  check('轨迹点到盘心距离接近落笔半径（呈环状）', rMax > R * 0.8 && rMin > R * 0.7);
  undo();
  check('撤销后轨迹一笔移除', strokes.length === 0);
  drawing = false;
  curPointer = null;

  /* ---------- 清空画布（自定义确认弹层） ---------- */
  strokes = [];
  beginStroke({ x: 0, y: 0 });
  moveStroke({ x: 10, y: 0 });
  endStroke();
  check('清空前有 1 笔', strokes.length === 1);
  clearAll();
  check('弹出确认弹层', $('confirm-mask').hidden === false);
  $('confirm-cancel')._h.click[0]();
  check('取消不清空', strokes.length === 1);
  check('取消后弹层关闭', $('confirm-mask').hidden === true);
  clearAll();
  $('confirm-ok')._h.click[0]();
  check('确认后清空 strokes', strokes.length === 0);
  check('清空后撤销按钮禁用', $('btn-undo').disabled === true);

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

  console.log('--- 旋转画板冒烟测试完成 ---');
})().catch(function (e) { console.error('测试异常:', e); process.exitCode = 1; });
