/* ================================================================
   旋转画板 game.js（B站 Toy，手机端为主兼容电脑端）

   玩法：
   - 画面中间一个圆盘，默认不停旋转，可按"暂停"停住。
   - 在圆盘上按下即落笔：只要按住，笔尖就随圆盘转动持续书写，
     手指不动也会画出一个圆环；手指移动则画出螺旋/花朵般的图案。
   - 可切换圆盘底色（默认白）与画笔颜色（默认黑），均支持预置色块 + 吸色盘。
   - 撤销：撤销上一笔（从落笔到提笔的整条笔迹）。
   - 导出：App 内走 B站 SDK 保存相册，Web 端回退 <a download> 下载 PNG。

   坐标约定：
   - 所有几何一律使用 canvas 物理像素坐标（canvas.width/canvas.height），
     指针坐标按 CSS/物理尺寸比例映射，避免缩放环境下落点偏移。
   - 世界坐标以圆盘中心为原点，范围 -R..R。
   - 离屏 ink 画布边长 S=2R，中心在 (R,R)，累积所有笔迹。
   - 显示时把 ink 画布绕圆盘中心旋转当前角 theta 绘制。

   注意：本文件不使用 'use strict'，便于冒烟测试 eval 后暴露顶层函数。
   ================================================================ */

var TAU = Math.PI * 2;
var OUTER_BG = '#0d0f1c';       // 圆盘外的页面背景色（导出同色）
var DEF_BG = '#ffffff';
var DEF_INK = '#111111';
var EXPORT_SIZE = 1024;
var ROT_SPEED = 1.0;            // 默认转速（弧度/秒）

var rotSpeed = ROT_SPEED;       // 当前转速（可拖动调节）
var dir = 1;                    // 旋转方向：1 逆时针，-1 顺时针
var sizeLevel = 5.5;            // 笔触粗细等级（相对 R 的百分比）
var bgImage = null;             // 上传的底图（作为圆盘背景，固定不随盘转）

var $ = function (id) { return document.getElementById(id); };

/* ---------------- 画布与几何 ---------------- */
var canvas, ctx;                // 显示画布
var svg, arrowPath;             // 旋转方向箭头（SVG 覆盖层）
var ink, inkCtx;                // 离屏笔迹层
var W = 0, H = 0, R = 0;        // 显示画布物理尺寸与圆盘半径
var cx = 0, cy = 0;             // 圆盘中心（物理坐标）
var S = 0;                      // ink 边长 = 2R
var dpr = 1;

var theta = 0;                  // 当前圆盘旋转角
var spinning = true;            // 是否持续旋转
var strokes = [];               // 已完成笔画历史：{color, width, pts:[{x,y}]}
var curStroke = null;           // 进行中的笔画
var drawing = false;
var activePointerId = null;
var curPointer = null;          // 笔尖最近一次已知的屏幕物理坐标

var bgColor = DEF_BG;
var inkColor = DEF_INK;
var lineWidth = 8;

var lastTs = 0;
var toastTimer = null;

/* ---------------- 尺寸 ---------------- */
function resize() {
  var prevR = R;
  var rect = canvas.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  W = Math.max(1, Math.round(rect.width * dpr));
  H = Math.max(1, Math.round(rect.height * dpr));
  canvas.width = W;
  canvas.height = H;
  if (svg) svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  R = Math.min(W, H) / 2 - 10 * dpr;
  if (R < 10 * dpr) R = 10 * dpr;
  cx = W / 2; cy = H / 2;
  S = Math.ceil(2 * R);
  lineWidth = Math.max(2, Math.round(R * sizeLevel / 100));

  if (!ink) { ink = document.createElement('canvas'); inkCtx = ink.getContext('2d'); }
  ink.width = S;
  ink.height = S;

  // 尺寸变化时按比例映射已有笔迹，避免错位
  if (prevR > 0 && Math.abs(prevR - R) > 0.5 && (strokes.length || curStroke)) {
    var k = R / prevR;
    var scale = function (pts) {
      for (var i = 0; i < pts.length; i++) { pts[i].x *= k; pts[i].y *= k; }
    };
    for (var i = 0; i < strokes.length; i++) scale(strokes[i].pts);
    if (curStroke) scale(curStroke.pts);
  }
  renderInk();
  updateArrowPath();
}

/* ---------------- 坐标转换 ---------------- */
// 指针事件坐标 -> canvas 物理像素坐标（按 CSS/物理尺寸比例映射，杜绝 dpr 偏差）
function canvasPos(e) {
  var rect = canvas.getBoundingClientRect();
  var kx = canvas.width / rect.width;
  var ky = canvas.height / rect.height;
  return { sx: (e.clientX - rect.left) * kx, sy: (e.clientY - rect.top) * ky };
}

// 屏幕物理坐标 -> 世界坐标（以圆盘中心为原点，逆旋转当前角）。
// 圆外屏幕点 clamp 到圆周，保证拖出边缘时笔迹顺滑贴边。
function screenToWorld(sx, sy) {
  var dx = sx - cx, dy = sy - cy;
  var r = Math.hypot(dx, dy);
  if (r > R) { dx = dx / r * R; dy = dy / r * R; }
  var cos = Math.cos(theta), sin = Math.sin(theta);
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}

function pointInDisc(sx, sy) {
  var dx = sx - cx, dy = sy - cy;
  return Math.hypot(dx, dy) <= R + 1;
}

/* ---------------- 笔画绘制（世界坐标，物理像素） ---------------- */
function beginStroke(p) {
  inkCtx.lineCap = 'round';
  inkCtx.lineJoin = 'round';
  inkCtx.strokeStyle = inkColor;
  inkCtx.fillStyle = inkColor;
  inkCtx.lineWidth = lineWidth;
  curStroke = { color: inkColor, width: lineWidth, pts: [p] };
  // 落笔立即落一个墨点，笔尖精准出现在按下位置
  inkCtx.beginPath();
  inkCtx.arc(p.x + R, p.y + R, lineWidth / 2, 0, TAU);
  inkCtx.fill();
  inkCtx.beginPath();
  inkCtx.moveTo(p.x + R, p.y + R);
}

function moveStroke(p) {
  if (!curStroke) return;
  var prev = curStroke.pts[curStroke.pts.length - 1];
  inkCtx.beginPath();
  inkCtx.moveTo(prev.x + R, prev.y + R);
  inkCtx.lineTo(p.x + R, p.y + R);
  inkCtx.stroke();
  curStroke.pts.push(p);
}

function endStroke() {
  if (!curStroke) return;
  var st = curStroke;
  curStroke = null;
  // 单点落笔的墨点在 beginStroke 已画，这里只需入库
  strokes.push(st);
  $('btn-undo').disabled = false;
}

// 笔尖持续采样：手指不动时，随圆盘旋转每帧把新笔尖位置画上去，
// 形成圆环/螺旋轨迹。只有笔尖确有位移才落笔，避免无谓重复点。
function sampleCursor() {
  if (!drawing || !curStroke || !curPointer) return;
  var w = screenToWorld(curPointer.sx, curPointer.sy);
  var last = curStroke.pts[curStroke.pts.length - 1];
  if (Math.hypot(w.x - last.x, w.y - last.y) > 0.5) {
    moveStroke(w);
  }
}

/* ---------------- 重绘笔迹层（撤销用） ---------------- */
function renderInk() {
  var c = inkCtx;
  c.clearRect(0, 0, S, S);
  for (var i = 0; i < strokes.length; i++) {
    var st = strokes[i];
    if (st.pts.length === 1) {
      c.fillStyle = st.color;
      c.beginPath();
      c.arc(st.pts[0].x + R, st.pts[0].y + R, st.width / 2, 0, TAU);
      c.fill();
    } else {
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = st.color; c.lineWidth = st.width;
      c.beginPath();
      c.moveTo(st.pts[0].x + R, st.pts[0].y + R);
      for (var j = 1; j < st.pts.length; j++) c.lineTo(st.pts[j].x + R, st.pts[j].y + R);
      c.stroke();
    }
  }
}

/* ---------------- 撤销 ---------------- */
function undo() {
  if (!strokes.length) return;
  strokes.pop();
  renderInk();
  $('btn-undo').disabled = !strokes.length;
}

/* ---------------- 自定义确认弹层（Toy WebView 弹不出原生 confirm） ---------------- */
var confirmCallback = null;
function showConfirm(text, onOk) {
  confirmCallback = onOk;
  $('confirm-text').textContent = text;
  $('confirm-mask').hidden = false;
}
function closeConfirm() {
  $('confirm-mask').hidden = true;
  confirmCallback = null;
}

/* ---------------- 清空画布（需确认） ---------------- */
function clearAll() {
  if (!strokes.length && !curStroke) {
    toast('画布已经是空的');
    return;
  }
  showConfirm('确定清空全部笔迹吗？', function () {
    strokes = [];
    curStroke = null;
    drawing = false;
    renderInk();
    $('btn-undo').disabled = true;
    toast('已清空 🗑');
  });
}

/* ---------------- 帧循环 ---------------- */
function tick(dt) {
  if (spinning) theta += rotSpeed * dir * dt;
  sampleCursor();
}

// 以 cover 方式把底图铺满半径为 rad 的圆盘（保持比例居中裁切）
function drawBgImage(c, rad) {
  var iw = bgImage.width || 1, ih = bgImage.height || 1;
  var s = Math.max(2 * rad / iw, 2 * rad / ih);
  var dw = iw * s, dh = ih * s;
  c.drawImage(bgImage, -dw / 2, -dh / 2, dw, dh);
}

function draw() {
  var c = ctx;
  c.clearRect(0, 0, W, H);
  c.fillStyle = OUTER_BG;
  c.fillRect(0, 0, W, H);

  c.save();
  c.translate(cx, cy);
  c.beginPath();
  c.arc(0, 0, R, 0, TAU);
  c.clip();
  // 圆盘底色（独立层，换底色不清空笔迹）
  c.fillStyle = bgColor;
  c.fillRect(-R, -R, 2 * R, 2 * R);
  // 底图固定铺满圆盘（不随盘转）
  if (bgImage) drawBgImage(c, R);
  // 笔迹层随圆盘旋转
  c.rotate(theta);
  c.drawImage(ink, -R, -R);
  c.restore();

  // 圆盘边框
  c.beginPath();
  c.arc(cx, cy, R, 0, TAU);
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.lineWidth = 2 * dpr;
  c.stroke();
}

// 旋转方向箭头：固定在圆盘顶部外侧（不随圆盘旋转、不与圆环相交），
// 尖端指向实际旋转方向。canvas 坐标系 y 向下，theta 增加 = 视觉顺时针，
// 故 dir=1（顺时针）尖端朝右 +x，dir=-1（逆时针）尖端朝左 -x。
function updateArrowPath() {
  if (!arrowPath || !R) return;
  var s = dir === 1 ? 1 : -1;   // 尖端方向：顺时针朝 +x（右）
  // 圆盘外侧仅 10dpr 空间，箭头做成细长小箭头：中轴 y0=cy-R-6dpr，
  // 半高 4dpr（高 8dpr，不超出画布顶），底边距圆环 2dpr 不相交。
  var y0 = cy - R - 6 * dpr;
  var halfH = 4 * dpr;
  var tx = cx + s * 12 * dpr;
  var ux = cx + s * -18 * dpr;
  var mx = cx + s * -6 * dpr;
  var d = 'M' + tx + ',' + y0 +
          ' L' + ux + ',' + (y0 - halfH) +
          ' L' + mx + ',' + y0 +
          ' L' + ux + ',' + (y0 + halfH) + ' Z';
  arrowPath.setAttribute('d', d);
}

function loop(ts) {
  var dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0;
  lastTs = ts;
  tick(dt);
  draw();
  requestAnimationFrame(loop);
}

/* ---------------- 颜色 ---------------- */
function setBgColor(color) {
  bgColor = color;
  updateSwatches('bg', color);
}
function setInkColor(color) {
  inkColor = color;
  updateSwatches('ink', color);
}
function updateSwatches(group, color) {
  var nodes = document.querySelectorAll('.swatch[data-group="' + group + '"]');
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].classList.toggle('active', nodes[i].getAttribute('data-color').toLowerCase() === color.toLowerCase());
  }
}

/* ---------------- 转速 / 方向 / 笔触 ---------------- */
function setSpeed(v) {
  rotSpeed = v;
  var val = $('speed-val');
  if (val) val.textContent = String(Math.round(v * 10) / 10);
}
function toggleDir() {
  dir = -dir;
  var btn = $('btn-dir');
  btn.textContent = dir === 1 ? '↻ 顺时针' : '↺ 逆时针';
  btn.classList.toggle('active', dir === 1);
  updateArrowPath();
}
function setSize(v) {
  sizeLevel = v;
  lineWidth = Math.max(2, Math.round(R * v / 100));
  var val = $('size-val');
  if (val) val.textContent = String(Math.round(v * 10) / 10);
}

/* ---------------- 旋转控制 ---------------- */
function toggleSpin() {
  spinning = !spinning;
  var btn = $('btn-spin');
  btn.textContent = spinning ? '⏸ 暂停' : '▶ 旋转';
  btn.classList.toggle('active', spinning);
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
    var rOut = EXPORT_SIZE / 2 - 6;

    oc.fillStyle = OUTER_BG;
    oc.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
    oc.save();
    oc.translate(EXPORT_SIZE / 2, EXPORT_SIZE / 2);
    oc.beginPath();
    oc.arc(0, 0, rOut, 0, TAU);
    oc.clip();
    oc.fillStyle = bgColor;
    oc.fillRect(-rOut, -rOut, 2 * rOut, 2 * rOut);
    if (bgImage) drawBgImage(oc, rOut);
    oc.rotate(theta);
    oc.drawImage(ink, -rOut, -rOut, 2 * rOut, 2 * rOut);
    oc.restore();
    oc.beginPath();
    oc.arc(EXPORT_SIZE / 2, EXPORT_SIZE / 2, rOut, 0, TAU);
    oc.strokeStyle = 'rgba(255,255,255,0.35)';
    oc.lineWidth = 3;
    oc.stroke();

    var url = out.toDataURL('image/png');
    if (typeof window !== 'undefined' && window.toy) {
      var ok = false;
      try { ok = await window.toy.isSupport('saveImageToAlbum').catch(function () { return false; }); }
      catch (err) { ok = false; }
      if (ok) {
        await window.toy.saveImageToAlbum({
          base64Data: url.replace(/^data:image\/png;base64,/, ''),
          hintMsg: '需要相册权限保存圆盘画作'
        });
        toast('已保存到相册 📤');
        return;
      }
    }
    var a = document.createElement('a');
    a.download = 'paint_' + Date.now() + '.png';
    a.href = url;
    if (a.click) a.click();
    toast('已导出 PNG 📤');
  } catch (err) {
    toast('导出失败：' + err.message);
  }
}

/* ---------------- Toast ---------------- */
function toast(msg) {
  var el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.hidden = true; }, 1800);
}

/* ---------------- 交互 ---------------- */
function onDown(e) {
  var pos = canvasPos(e);
  if (!pointInDisc(pos.sx, pos.sy)) return;
  drawing = true;
  activePointerId = e.pointerId;
  curPointer = pos;
  beginStroke(screenToWorld(pos.sx, pos.sy));
}

function onMove(e) {
  if (!drawing || e.pointerId !== activePointerId) return;
  var pos = canvasPos(e);
  curPointer = pos;
  moveStroke(screenToWorld(pos.sx, pos.sy));
}

function onUp(e) {
  if (!drawing || e.pointerId !== activePointerId) return;
  drawing = false;
  activePointerId = null;
  curPointer = null;
  endStroke();
}

function openFilePicker(inputId) {
  var inp = $(inputId);
  if (inp.showPicker) { try { inp.showPicker(); return; } catch (e) {} }
  inp.click();
}

/* ---------------- 初始化 ---------------- */
function bindUI() {
  document.querySelectorAll('.swatch').forEach(function (el) {
    el.addEventListener('click', function () {
      var group = el.getAttribute('data-group');
      var color = el.getAttribute('data-color');
      if (group === 'bg') setBgColor(color); else setInkColor(color);
    });
  });
  $('bg-picker').addEventListener('input', function () { setBgColor(this.value); });
  $('ink-picker').addEventListener('input', function () { setInkColor(this.value); });

  $('speed-slider').addEventListener('input', function () { setSpeed(parseFloat(this.value)); });
  $('btn-dir').addEventListener('click', toggleDir);
  $('size-slider').addEventListener('input', function () { setSize(parseFloat(this.value)); });

  // 底图上传：WebView 里必须用 button 显式触发隐藏 file input
  $('btn-bgimg').addEventListener('click', function () { openFilePicker('file-img'); });
  $('btn-bgimg-clear').addEventListener('click', function () {
    bgImage = null;
    $('btn-bgimg-clear').hidden = true;
    toast('已清除底图');
  });
  $('file-img').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        bgImage = img;
        $('btn-bgimg-clear').hidden = false;
        toast('底图已应用 🖼');
      };
      img.onerror = function () { toast('图片加载失败，换个试试'); };
      img.src = fr.result;
    };
    fr.onerror = function () { toast('读取文件失败'); };
    fr.readAsDataURL(file);
    this.value = '';
  });

  $('btn-spin').addEventListener('click', toggleSpin);
  $('btn-undo').addEventListener('click', undo);
  $('btn-clear').addEventListener('click', clearAll);
  $('btn-export').addEventListener('click', exportImage);

  // 确认弹层
  $('confirm-ok').addEventListener('click', function () {
    var cb = confirmCallback;
    closeConfirm();
    if (cb) cb();
  });
  $('confirm-cancel').addEventListener('click', closeConfirm);
  $('confirm-mask').addEventListener('click', function (e) {
    if (e.target === this) closeConfirm(); // 点遮罩空白处关闭
  });

  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('resize', function () { resize(); });
}

function init() {
  canvas = $('board');
  ctx = canvas.getContext('2d');
  svg = $('spin-arrow');
  arrowPath = $('arrow-path');
  resize();
  bindUI();
  ensureSdk();
  requestAnimationFrame(loop);
}

init();
