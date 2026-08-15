/* ================= 合成大肥鱼 =================
   参考「合成大西瓜」：点击落鱼、同级碰撞合成、堆顶静止判负。
   本地榜 + B站榜（日/周/月/总），设置：球上显示级别。
   注意：本文件不使用 'use strict'，便于冒烟测试 eval 后暴露顶层函数。
   ================================================ */

/* ---------------- 常量 ---------------- */
var W = 400;                 // 逻辑宽度
var H = 620;                 // 逻辑高度
var FLOOR_Y = 605;           // 地面 y
var dangerY = 46;            // 危险线 y（球顶越过此线且静止 → 判负）
var DROP_Y = 44;             // 待发射球中心 y
var GRAVITY = 1150;          // 重力 px/s²
var MAX_LEVEL = 10;          // 最高等级
var DANGER_TIME = 3;         // 触及危险线持续时长（秒），超时判负
var SUBSTEPS = 3;            // 物理子步
var WALL_E = 0.5;            // 墙反弹恢复系数
var GROUND_E = 0.25;         // 地面反弹恢复系数
var BALL_E = 0.4;            // 球-球恢复系数
var SPAWN_TABLE = [1,1,1,1,1,1,2,2,2,2,2,3,3,3,4,4,5];
var LEVEL_COLORS = ['#ef5b5b','#f08c3a','#f5c63a','#8bd84a','#38c47a','#2eb8c4','#3b86e0','#7a6ae0','#b05ae0','#e0408f'];

/* ---------------- 工具 ---------------- */
function $(id) { return document.getElementById(id); }
function num(v, d) { v = Number(v); return isFinite(v) && v >= 0 ? Math.floor(v) : d; }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function fmtNum(n) {
  n = Math.floor(Number(n) || 0);
  if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1) + 'w';
  return String(n);
}
function fmtTime(ms) {
  var s = Math.floor((ms || 0) / 1000);
  var m = Math.floor(s / 60), ss = s % 60;
  return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
}
function rFor(level) { return 8 + level * 6; }
function colorFor(lv) { return LEVEL_COLORS[lv - 1] || '#888'; }
/* 10 级以上外圈颜色区分（10白 11黄 12紫 13红 14金 …） */
var RING_HIGH = { 10: '#ffffff', 11: '#ffdd00', 12: '#a855f7', 13: '#ef4444', 14: '#d4af37', 15: '#ff9df5', 16: '#4ade80', 17: '#38bdf8', 18: '#fb923c', 19: '#f472b6', 20: '#facc15' };
function ringColor(level) {
  if (level >= MAX_LEVEL) return RING_HIGH[level] || '#d4af37';
  return colorFor(level);
}
/* 合成出 N 级鱼的基础分：2^(N-1)；10 级额外 +1024 */
function scoreFor(level) { return Math.pow(2, level - 1); }
function mergeScore(level) { return level === MAX_LEVEL ? scoreFor(level) + 1024 : scoreFor(level); }

/* ---------------- 图片加载 ---------------- */
var IMGS = [null, null, null, null, null, null, null, null, null, null, null];
function imgSrc(lv) { return 'images/' + lv + (lv === 10 ? '.png' : '.jpg'); }
function loadImages() {
  if (typeof Image === 'undefined') return;
  for (var i = 1; i <= MAX_LEVEL; i++) {
    var img = new Image();
    img.src = imgSrc(i);
    IMGS[i] = img;
  }
}

/* ---------------- 存储 ---------------- */
var CFG_KEY = 'df_fish_cfg';
var LB_KEY = 'df_fish_lb';
var S = { hi: 0, games: 0, showLevel: true, muted: false };

function readCfg() {
  try { var r = localStorage.getItem(CFG_KEY); if (r) { var d = JSON.parse(r); if (d && typeof d === 'object') return d; } } catch (e) {}
  return null;
}
function saveCfg() {
  var d = { hi: S.hi, games: S.games, showLevel: S.showLevel, muted: S.muted };
  try { localStorage.setItem(CFG_KEY, JSON.stringify(d)); } catch (e) {}
  if (sdkReady()) {
    var kv = {}; kv[CFG_KEY] = JSON.stringify(d);
    window.toy.setCloudStorage(kv).catch(function () {});
  }
}
function loadCfg() {
  var d = readCfg();
  if (d) {
    S.hi = num(d.hi, 0);
    S.games = num(d.games, 0);
    if (typeof d.showLevel === 'boolean') S.showLevel = d.showLevel;
    if (typeof d.muted === 'boolean') S.muted = d.muted;
  }
}
function mergeCloud() {
  if (!sdkReady()) return;
  window.toy.getCloudStorage([CFG_KEY]).then(function (data) {
    try {
      var c = data && data[CFG_KEY] ? JSON.parse(data[CFG_KEY]) : null;
      if (c && typeof c === 'object') {
        var changed = false;
        if (num(c.hi, 0) > S.hi) { S.hi = num(c.hi, 0); changed = true; }
        if (num(c.games, 0) > S.games) { S.games = num(c.games, 0); changed = true; }
        if (changed) saveCfg();
      }
    } catch (e) {}
  }).catch(function () {});
}

/* 本地榜：最高分（前 100 条） */
function readLB() {
  try { var r = localStorage.getItem(LB_KEY); if (r) { var d = JSON.parse(r); if (d && d.hi) return d; } } catch (e) {}
  return { hi: [] };
}
function writeLB(d) { try { localStorage.setItem(LB_KEY, JSON.stringify(d)); } catch (e) {} }
function addLocalScore(s) {
  var lb = readLB();
  lb.hi.push({ s: Math.floor(s), ts: Date.now() });
  lb.hi.sort(function (a, b) { return b.s - a.s; });
  if (lb.hi.length > 100) lb.hi.length = 100;
  writeLB(lb);
}

/* ---------------- B站 SDK ---------------- */
function sdkReady() {
  return typeof window !== 'undefined' && window.toy &&
    typeof window.toy.submitScore === 'function' &&
    typeof window.toy.getRankList === 'function';
}
function loadSDK() {
  try {
    if (sdkReady()) { mergeCloud(); return; }
    if (typeof document === 'undefined') return;
    var s = document.createElement('script');
    s.src = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
    s.async = true;
    s.onload = function () { mergeCloud(); };
    document.head.appendChild(s);
  } catch (e) {}
}
function submitHighScore() {
  if (!sdkReady()) return;
  var sc = Math.max(0, Math.min(16777215, Math.floor(S.hi)));
  try { window.toy.submitScore({ board: 1, score: sc }).catch(function () {}); } catch (e) {}
  /* 子榜：一局内合成大肥鱼数量，>0 才上榜 */
  var fc = R ? Math.floor(R.fishCount) : 0;
  if (fc > 0) {
    try { window.toy.submitScore({ board: 2, score: Math.min(16777215, fc) }).catch(function () {}); } catch (e) {}
  }
}

/* ---------------- 音效（极简 WebAudio） ---------------- */
var ACT = null;
function ensureAudio() {
  try {
    if (ACT || typeof window === 'undefined') return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ACT = new AC();
  } catch (e) {}
}
function tone(freq, dur, type, vol, delay) {
  try {
    var o = ACT.createOscillator(), g = ACT.createGain();
    o.type = type; o.frequency.value = freq;
    var t = ACT.currentTime + delay;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(ACT.destination);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}
function sfx(name) {
  try {
    if (!ACT || S.muted) return;
    var defs = {
      drop:  [300, 0.06, 'sine', 0.05],
      merge: [520, 0.10, 'triangle', 0.08],
      big:   [760, 0.18, 'triangle', 0.10],
      over:  [220, 0.40, 'sawtooth', 0.12]
    };
    var d = defs[name]; if (!d) return;
    tone(d[0], d[1], d[2], d[3], 0);
  } catch (e) {}
}

/* ---------------- 特效 ---------------- */
var FXD = { parts: [], texts: [], banners: [] };
function addParticles(x, y, level) {
  var col = colorFor(level);
  for (var i = 0; i < 10; i++) {
    FXD.parts.push({
      x: x, y: y, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200 - 70,
      life: 0.5 + Math.random() * 0.3, t: 0, r: 3 + Math.random() * 4, col: col
    });
  }
}
function addFloat(x, y, text, color, size) {
  FXD.texts.push({ x: x, y: y, text: text, color: color || '#ff7e2d', life: 0.9, t: 0, size: size || 15 });
}
function addBanner(text) {
  FXD.banners.push({ text: text, t: 0, life: 1.5 });
}
function updateFX(dt) {
  var i;
  for (i = FXD.parts.length - 1; i >= 0; i--) {
    var p = FXD.parts[i];
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt;
    if (p.t >= p.life) FXD.parts.splice(i, 1);
  }
  for (i = FXD.texts.length - 1; i >= 0; i--) {
    var tx = FXD.texts[i];
    tx.t += dt; tx.y -= 42 * dt;
    if (tx.t >= tx.life) FXD.texts.splice(i, 1);
  }
  for (i = FXD.banners.length - 1; i >= 0; i--) {
    var bn = FXD.banners[i];
    bn.t += dt;
    if (bn.t >= bn.life) FXD.banners.splice(i, 1);
  }
  /* scale 出生动画趋近 1 */
  var bs = R ? R.balls : [];
  for (i = 0; i < bs.length; i++) {
    var b = bs[i];
    if (b.scale > 1) b.scale += (1 - b.scale) * 0.16;
  }
}

/* ---------------- 球体 ---------------- */
function makeBall(level, x, y) {
  return { id: ++R.ballId, level: level, x: x, y: y, vx: 0, vy: 0, r: rFor(level), cool: 0, scale: 1, removed: false };
}
function randomSpawnLevel() {
  return SPAWN_TABLE[Math.floor(Math.random() * SPAWN_TABLE.length)];
}

/* ---------------- 物理 ---------------- */
function stepPhysics(dt) {
  var h = dt / SUBSTEPS;
  for (var i = 0; i < SUBSTEPS; i++) integrate(h);
  var bs = R.balls;
  for (i = 0; i < bs.length; i++) if (bs[i].cool > 0) bs[i].cool -= 1;
  checkMerges();
}
function integrate(h) {
  var bs = R.balls, n = bs.length, i, j;
  /* 积分 + 边界 */
  for (i = 0; i < n; i++) {
    var b = bs[i];
    if (b.removed) continue;
    b.vy += GRAVITY * h;
    b.x += b.vx * h;
    b.y += b.vy * h;
    if (b.x - b.r < 0) { b.x = b.r; b.vx = -b.vx * WALL_E; }
    else if (b.x + b.r > W) { b.x = W - b.r; b.vx = -b.vx * WALL_E; }
    if (b.y + b.r > FLOOR_Y) {
      b.y = FLOOR_Y - b.r;
      if (b.vy > 0) b.vy = -b.vy * GROUND_E;
      b.vx *= (1 - 0.12);
      if (Math.abs(b.vx) < 1) b.vx = 0;
    }
    if (Math.abs(b.vx) < 0.4) b.vx = 0;
  }
  /* 圆-圆碰撞（AABB 预筛） */
  for (i = 0; i < n; i++) {
    var a = bs[i];
    if (a.removed) continue;
    for (j = i + 1; j < n; j++) {
      var c = bs[j];
      if (c.removed) continue;
      var rr = a.r + c.r;
      var dx = c.x - a.x, dy = c.y - a.y;
      if (Math.abs(dx) >= rr || Math.abs(dy) >= rr) continue;
      var d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      var d = Math.sqrt(d2);
      var nx = dx / d, ny = dy / d;
      var overlap = rr - d;
      var ma = a.r * a.r, mc = c.r * c.r;
      a.x -= nx * overlap * (mc / (ma + mc));
      a.y -= ny * overlap * (mc / (ma + mc));
      c.x += nx * overlap * (ma / (ma + mc));
      c.y += ny * overlap * (ma / (ma + mc));
      var rvx = a.vx - c.vx, rvy = a.vy - c.vy;
      var vn = rvx * nx + rvy * ny;
      if (vn > 0) {
        var jimp = (1 + BALL_E) * vn / (1 / ma + 1 / mc);
        a.vx -= (jimp / ma) * nx; a.vy -= (jimp / ma) * ny;
        c.vx += (jimp / mc) * nx; c.vy += (jimp / mc) * ny;
      }
    }
  }
}
function checkMerges() {
  var bs = R.balls;
  for (var i = 0; i < bs.length; i++) {
    var a = bs[i];
    if (a.removed || a.cool > 0) continue;
    for (var j = i + 1; j < bs.length; j++) {
      var b = bs[j];
      if (b.removed || b.cool > 0) continue;
      if (a.level !== b.level) continue;
      var dx = a.x - b.x, dy = a.y - b.y;
      var rr = a.r + b.r;
      if (dx * dx + dy * dy < rr * rr * 1.02) { mergeBalls(a, b); break; }
    }
  }
}
function mergeBalls(a, b) {
  var lv = a.level + 1;
  var nx = (a.x + b.x) / 2, ny = (a.y + b.y) / 2;
  var nvx = (a.vx + b.vx) / 2, nvy = (a.vy + b.vy) / 2;
  a.removed = true; b.removed = true;
  var nb = makeBall(lv, nx, ny);
  nb.vx = nvx; nb.vy = nvy;
  nb.cool = 15;
  nb.scale = 1.28;
  R.balls.push(nb);
  var pts = mergeScore(lv);
  R.score += pts;
  addParticles(nx, ny, lv);
  addFloat(nx, ny - nb.r, '+' + fmtNum(pts));
  if (lv >= MAX_LEVEL) {
    R.fishCount++;
    addFloat(nx, ny - nb.r - 22, '🐟 合成大肥鱼！', '#e14e1e', 20);
    if (lv === MAX_LEVEL) {
      addBanner('合成大肥鱼！');
      sfx('big');
    } else {
      sfx('merge');
    }
  } else {
    sfx('merge');
  }
}
function checkDanger(dt) {
  if (!R || R.state !== 'playing') return;
  var found = false;
  var bs = R.balls;
  for (var i = 0; i < bs.length; i++) {
    var b = bs[i];
    if (b.removed) continue;
    if (b.y - b.r < dangerY) { found = true; break; }
  }
  if (found) R.dangerTimer += dt;
  else R.dangerTimer = 0;
  if (R.dangerTimer > DANGER_TIME) gameOver();
}

/* ---------------- 渲染 ---------------- */
var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');
var dpr = 1;
function resizeCanvas() {
  if (typeof window === 'undefined') return;
  var vw = window.innerWidth || 400;
  var vh = window.innerHeight || 700;
  var availW = Math.min(vw, 560);
  var availH = vh - 158;
  var scale = Math.max(0.3, Math.min(availW / W, availH / H));
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = (W * scale) + 'px';
  canvas.style.height = (H * scale) + 'px';
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function canvasPos(e) {
  var r = canvas.getBoundingClientRect();
  var cx = e.clientX;
  if (cx === undefined && e.touches && e.touches[0]) cx = e.touches[0].clientX;
  return { x: (cx - r.left) / r.width * W };
}
function drawBG() {
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#eef8ff');
  g.addColorStop(1, '#cdeafb');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(23,110,170,0.15)';
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  ctx.fillStyle = 'rgba(255,60,60,0.08)';
  ctx.fillRect(0, 0, W, dangerY + 4);
  ctx.strokeStyle = 'rgba(255,60,60,0.65)';
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, dangerY);
  ctx.lineTo(W, dangerY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,60,60,0.8)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('⚠', 6, 6);
}
function drawBall(b) {
  var img = IMGS[b.level] || IMGS[MAX_LEVEL];
  var r = b.r * b.scale;
  var x = b.x, y = b.y;
  var rc = ringColor(b.level);
  /* 底色 + 阴影，避免纯白底圆 */
  ctx.save();
  ctx.shadowColor = 'rgba(20,70,120,0.28)';
  ctx.shadowBlur = 9;
  ctx.shadowOffsetY = 3;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = rc;
  ctx.fill();
  ctx.restore();
  /* 图片（略放大，挤出白色背景边） */
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  if (img && img.complete && img.naturalWidth) {
    var zoom = 1.15;
    var s = (r * 2 * zoom) / Math.min(img.width, img.height);
    var dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
  } else {
    ctx.fillStyle = rc;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  if (S.showLevel) {
    var fs = Math.max(8, Math.round(r * 0.5));
    ctx.fillStyle = 'rgba(10,40,70,0.5)';
    ctx.beginPath(); ctx.arc(x, y, fs * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + fs + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.level, x, y + 1);
  }
  ctx.restore();
  if (S.showLevel) {
    /* 细描边，压住图片边缘残留的白边 */
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(30,80,120,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  } else {
    /* 外圈颜色区分等级 */
    ctx.save();
    var rw = Math.max(3, Math.round(r * 0.14));
    ctx.beginPath(); ctx.arc(x, y, r - rw / 2, 0, Math.PI * 2);
    ctx.strokeStyle = rc;
    ctx.lineWidth = rw;
    ctx.stroke();
    ctx.restore();
  }
}
function drawCurrent(c) {
  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = 'rgba(40,120,180,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(c.x, dangerY); ctx.lineTo(c.x, FLOOR_Y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.9;
  drawBall(c);
  ctx.restore();
}
function drawFX() {
  var i;
  for (i = 0; i < FXD.parts.length; i++) {
    var p = FXD.parts[i];
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.col; ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (i = 0; i < FXD.texts.length; i++) {
    var tx = FXD.texts[i];
    ctx.globalAlpha = Math.max(0, 1 - tx.t / tx.life);
    ctx.font = 'bold ' + tx.size + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = tx.color;
    ctx.fillText(tx.text, tx.x, tx.y);
  }
  ctx.globalAlpha = 1;
  /* 大肥鱼横幅（中央大字，稍后消失） */
  for (i = 0; i < FXD.banners.length; i++) {
    var bn = FXD.banners[i];
    var k = bn.t / bn.life;
    var y = H * 0.30 - k * 12;
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.font = 'bold ' + Math.round(30 + k * 26) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(bn.text, W / 2 + 1.5, y + 1.5);
    ctx.fillStyle = '#ff7e2d';
    ctx.fillText(bn.text, W / 2, y);
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#e14e1e';
    ctx.fillText('🐟 奖励 +1024', W / 2, y + 26);
  }
  ctx.globalAlpha = 1;
}
function render() {
  if ($('view-game').hidden) return;
  ctx.clearRect(0, 0, W, H);
  drawBG();
  var bs = R ? R.balls : [];
  for (var i = 0; i < bs.length; i++) if (!bs[i].removed) drawBall(bs[i]);
  if (R && R.current) drawCurrent(R.current);
  drawFX();
}

/* ---------------- 状态机 ---------------- */
var R = null;    // 局内状态
var last = 0;

function aimTo(x) {
  if (!R || !R.current) return;
  var r = R.current.r;
  R.current.x = Math.max(r, Math.min(W - r, x));
}
function setNextImg(lv) {
  var el = $('next-ball');
  if (el) el.src = imgSrc(lv);
}
function startRun() {
  R = { balls: [], current: null, next: 0, score: 0, seconds: 0, state: 'playing', spawnLock: false, dangerTimer: 0, ballId: 1, fishCount: 0 };
  R.current = makeBall(randomSpawnLevel(), W / 2, DROP_Y);
  R.next = randomSpawnLevel();
  setNextImg(R.next);
  FXD.parts.length = 0;
  FXD.texts.length = 0;
  $('pause-overlay').hidden = true;
  $('over-overlay').hidden = true;
  last = 0;
  resizeCanvas();
  showView('game');
}
function dropBall() {
  if (!R || R.state !== 'playing' || R.spawnLock || !R.current) return;
  var c = R.current;
  c.vx = 0; c.vy = 0;
  R.balls.push(c);
  R.current = makeBall(R.next, W / 2, DROP_Y);
  R.next = randomSpawnLevel();
  setNextImg(R.next);
  R.spawnLock = true;
  sfx('drop');
  setTimeout(function () { if (R) R.spawnLock = false; }, 400);
}
function pauseGame() {
  if (!R || R.state !== 'playing') return;
  R.state = 'paused';
  $('pause-score').textContent = fmtNum(Math.floor(R.score));
  $('pause-overlay').hidden = false;
}
function resumeGame() {
  if (!R || R.state === 'over') return;
  R.state = 'playing';
  $('pause-overlay').hidden = true;
  last = 0;
  showView('game');
}
function exitToHome() {
  if (!R) return;
  R.state = 'paused';
  $('pause-overlay').hidden = true;
  $('over-overlay').hidden = true;
  renderHome();
  showView('home');
}
var settingsFromPause = false;
function openSettingsFromPause() {
  if (!R || R.state !== 'paused') return;
  settingsFromPause = true;
  $('pause-overlay').hidden = true;
  applySettings();
  showView('settings');
}
function backFromSettings() {
  if (settingsFromPause) {
    settingsFromPause = false;
    showView('game');
    $('pause-overlay').hidden = false;
  } else {
    showView('home');
  }
}
function settleGame() {
  if (!R || R.state === 'over') return;
  if (R.state === 'playing') R.state = 'paused';
  $('pause-overlay').hidden = true;
  gameOver();
}
function gameOver() {
  if (!R || R.state === 'over') return;
  R.state = 'over';
  sfx('over');
  var final = Math.floor(R.score);
  var isNew = final > S.hi;
  if (final > S.hi) S.hi = final;
  S.games += 1;
  saveCfg();
  addLocalScore(final);
  submitHighScore();
  $('over-score').textContent = fmtNum(final);
  $('over-time').textContent = fmtTime(R.seconds * 1000);
  $('over-fish').innerHTML = '<img class="fish-count-img" src="images/10.png" alt="">×' + R.fishCount + ' 条';
  $('over-hi').textContent = fmtNum(S.hi);
  $('over-new').hidden = !isNew;
  $('over-overlay').hidden = false;
  if (sdkReady()) toast('成绩已同步到 B站榜');
  else toast('成绩已记录到本地榜');
}

/* ---------------- 视图 ---------------- */
var VIEWS = ['home', 'game', 'rank', 'settings', 'help'];
function showView(name) {
  for (var i = 0; i < VIEWS.length; i++) {
    var v = document.getElementById('view-' + VIEWS[i]);
    if (v) v.hidden = (VIEWS[i] !== name);
  }
  if (name === 'home') renderHome();
}
function renderHome() {
  $('home-hi').textContent = fmtNum(S.hi);
  $('home-games').textContent = S.games;
  var cont = $('btn-continue');
  cont.hidden = !(R && R.state === 'paused');
}
function updateHud() {
  if (!R) return;
  $('hud-score').textContent = fmtNum(Math.floor(R.score));
  $('hud-time').textContent = fmtTime(R.seconds * 1000);
  $('hud-hi').textContent = fmtNum(S.hi);
  $('hud-fish').innerHTML = '<img class="fish-count-img" src="images/10.png" alt="">×' + R.fishCount;
}

/* ---------------- 排行榜 ---------------- */
var rk = { src: 'local', board: 1, period: 'all' };
function periodName(p) { return p === 'all' ? '总榜' : p === 'month' ? '月榜' : p === 'week' ? '周榜' : '日榜'; }
function setBtabActive(b) {
  var bts = document.querySelectorAll('#rank-board .btab');
  for (var i = 0; i < bts.length; i++) bts[i].classList.toggle('active', Number(bts[i].getAttribute('data-board')) === b);
}
function switchSrc(src) {
  rk.src = src;
  var tabs = document.querySelectorAll('#rank-src .tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-src') === src);
  var showBili = (src === 'bili');
  $('rank-board').hidden = !showBili;
  $('rank-period').hidden = !showBili;
  if (!showBili) { rk.board = 1; setBtabActive(1); }
  loadRank();
}
function switchBoard(b) {
  rk.board = b;
  setBtabActive(b);
  loadRank();
}
function switchPeriod(p) {
  rk.period = p;
  var tabs = document.querySelectorAll('#rank-period .ptab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-p') === p);
  loadRank();
}
function loadRank() {
  if (rk.src === 'bili') loadBiliRank();
  else loadLocalRank();
}
function loadLocalRank() {
  var lb = readLB();
  var list = (lb.hi || []).slice(0, 100);
  $('rank-note').textContent = '本机最高分（前 100 条）';
  if (!list.length) { $('rank-body').innerHTML = '<div class="lb-tip">暂无成绩，去玩一局吧</div>'; return; }
  var html = '';
  for (var i = 0; i < list.length; i++) {
    html += '<div class="lb-row"><span class="lb-rank' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</span>' +
      '<span class="lb-user"><span class="lb-avatar">🐟</span><span class="lb-name">我</span></span>' +
      '<span class="lb-score">' + fmtNum(list[i].s) + '</span></div>';
  }
  $('rank-body').innerHTML = html;
}
function loadBiliRank() {
  if (!sdkReady()) {
    $('rank-note').textContent = '请在 B站 App 内打开查看 B站榜';
    $('rank-body').innerHTML = '<div class="lb-tip">当前环境不支持加载 B站 排行榜</div>';
    return;
  }
  var label = rk.board === 2 ? '大肥鱼数' : '最高分';
  $('rank-note').textContent = periodName(rk.period) + ' · ' + label + '（前 100 名）';
  $('rank-body').innerHTML = '<div class="lb-tip">加载中…</div>';
  window.toy.getRankList({ board: rk.board, period: rk.period, limit: 100 }).then(function (list) {
    renderBili(list);
  }).catch(function () { $('rank-body').innerHTML = '<div class="lb-tip">加载失败</div>'; });
  window.toy.getMyRank({ board: rk.board, period: rk.period }).then(function (me) {
    if (me && me.ranked) $('rank-note').textContent += ' · 我的排名：第 ' + me.rank + ' 名';
  }).catch(function () {});
}
function renderBili(list) {
  if (!list || !list.length) { $('rank-body').innerHTML = '<div class="lb-tip">暂无上榜数据</div>'; return; }
  var unit = rk.board === 2 ? ' 条' : '';
  var html = '';
  for (var i = 0; i < list.length; i++) {
    var it = list[i];
    html += '<div class="lb-row"><span class="lb-rank' + (it.rank <= 3 ? ' top' : '') + '">' + it.rank + '</span>' +
      '<span class="lb-user"><img class="lb-avatar" src="' + esc(it.avatar) + '" alt="" onerror="this.style.visibility=\'hidden\'"><span class="lb-name">' + esc(it.nickname) + '</span></span>' +
      '<span class="lb-score">' + fmtNum(it.score) + unit + '</span></div>';
  }
  $('rank-body').innerHTML = html;
}

/* ---------------- 设置 ---------------- */
function applySettings() {
  var el = $('set-level');
  if (el) el.checked = S.showLevel;
  var m = $('set-muted');
  if (m) m.checked = !S.muted;
}

/* ---------------- toast ---------------- */
var toastTimer = 0;
function toast(msg) {
  var el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.hidden = true; }, 1800);
}

/* ---------------- 输入 ---------------- */
function bindCanvas() {
  var wrap = $('game-wrap');
  var cv = $('game');
  var move = function (e) { aimTo(canvasPos(e).x); };
  var down = function (e) {
    e.preventDefault();
    move(e);
    dropBall();
  };
  if ('PointerEvent' in window) {
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerdown', down);
  } else {
    cv.addEventListener('touchmove', move, { passive: false });
    cv.addEventListener('touchstart', down, { passive: false });
    cv.addEventListener('mousemove', move);
    cv.addEventListener('mousedown', down);
  }
}
function bindUI() {
  $('btn-start').addEventListener('click', function () { ensureAudio(); startRun(); });
  $('btn-continue').addEventListener('click', function () { ensureAudio(); resumeGame(); });
  $('btn-rank').addEventListener('click', function () { loadRank(); showView('rank'); });
  $('btn-settings').addEventListener('click', function () { applySettings(); showView('settings'); });
  $('btn-help').addEventListener('click', function () { showView('help'); });
  $('btn-pause').addEventListener('click', function () { pauseGame(); });
  $('btn-resume').addEventListener('click', function () { resumeGame(); });
  $('btn-restart').addEventListener('click', function () { startRun(); });
  $('btn-exit').addEventListener('click', function () { exitToHome(); });
  $('btn-pause-settings').addEventListener('click', function () { openSettingsFromPause(); });
  $('btn-settle').addEventListener('click', function () { settleGame(); });
  $('btn-again').addEventListener('click', function () { startRun(); });
  $('btn-ranko').addEventListener('click', function () { loadRank(); showView('rank'); });
  $('btn-home').addEventListener('click', function () { exitToHome(); });
  $('btn-back-rank').addEventListener('click', function () { showView('home'); });
  $('btn-back-settings').addEventListener('click', backFromSettings);
  $('btn-back-help').addEventListener('click', function () { showView('home'); });
  $('set-level').addEventListener('change', function () { S.showLevel = !!this.checked; saveCfg(); });
  $('set-muted').addEventListener('change', function () { S.muted = !this.checked; saveCfg(); });
  $('rank-src').addEventListener('click', function (e) {
    var t = e.target.closest('.tab'); if (!t) return;
    switchSrc(t.getAttribute('data-src'));
  });
  $('rank-period').addEventListener('click', function (e) {
    var t = e.target.closest('.ptab'); if (!t) return;
    switchPeriod(t.getAttribute('data-p'));
  });
  $('rank-board').addEventListener('click', function (e) {
    var t = e.target.closest('.btab'); if (!t) return;
    switchBoard(Number(t.getAttribute('data-board')));
  });
}

/* ---------------- 主循环 ---------------- */
function tick(dt) {
  if (R && R.state === 'playing') {
    R.seconds += dt;
    stepPhysics(dt);
    checkDanger(dt);
    updateFX(dt);
  }
  render();
  updateHud();
}
function loop(ts) {
  requestAnimationFrame(loop);
  var dt = Math.min((ts - (last || ts)) / 1000 || 0, 0.05);
  last = ts;
  tick(dt);
}

/* ---------------- 初始化 ---------------- */
function init() {
  loadImages();
  loadCfg();
  bindCanvas();
  bindUI();
  resizeCanvas();
  applySettings();
  renderHome();
  loadSDK();
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('beforeunload', function () { if (R) saveCfg(); });
  }
}

if (typeof requestAnimationFrame !== 'undefined') {
  init();
  requestAnimationFrame(loop);
}
