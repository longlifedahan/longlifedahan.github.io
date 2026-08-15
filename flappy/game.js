/* ================= 菲比啾比 · Flappy =================
   横版 flappy bird：点按上冲、重力下落，穿管道、吃金币。
   飞得越远分数越高，管道越密、缺口越小（连续渐变，无跳变）。
   每次点击随机播放 audios 下的一个啾比音效（WebAudio 解码）。
   本地榜 + B站榜（日/周/月/总），断点续玩，音量可调，M 静音，P 暂停。
   注意：本文件不用 'use strict'（便于冒烟测试）。
   ====================================================== */

/* ---------------- 常量 ---------------- */
var W = 858, H = 504;          // 逻辑分辨率（横版，匹配背景图）
var GROUND_H = 40;             // 底部地面带高度（视觉，也是碰撞地面）
var BIRD = 48;                 // 鸟直径
var BIRD_R = 19;               // 鸟碰撞半径（略宽松）
var BIRD_X = 240;              // 鸟固定横坐标
var G = 1600;                  // 重力 px/s^2（中等偏重，手感偏硬 = 难度中上）
var FLAP = -430;               // 每次点击上冲速度 px/s（较低跳跃，操控更精细）
var MAX_FALL = 880;            // 下落速度上限
var SPEED = 240;               // 场景左移速度 px/s
var PIPE_W = 74;               // 管道宽
var CAP_W = 92, CAP_H = 26;    // 帽沿宽高
var MIN_TOP = 46;              // 顶部管道最小高度（缺口避免贴顶）
var GAP_0 = 205, GAP_1 = 126;  // 缺口高：初始 → 满难度
var SPACING_0 = 330, SPACING_1 = 200;  // 管道周期：初始 → 满难度
var DIFF_N = 28;               // 28 根管道后难度拉满
var COIN_R = 13;               // 金币半径
var PICKUP = 50;               // 普通金币拾取距离（靠得近即可）
var PICKUP_MAGNET = 120;       // 吸铁石道具的金币拾取距离（磁吸）
var SCORE_PIPE = 5;            // 过管道 +5
var SCORE_COIN = 10;           // 金币基础分（双倍道具时 ×2）
var DIST_RATE_0 = 0.8;         // 距离分基础速率 分/秒
var DIST_RATE_K = 0.002;       // 距离分增速：每前进 1px，每秒多加分 0.002
var BASE_LIVES = 1;            // 默认生命值（商城可购买第 2、3 条命）
var INVINCIBLE = 1.3;          // 扣命后无敌秒数
var AUDIO_COUNT = 8;           // audios 音效数量

/* ---------------- 商城道具 ---------------- */
var SHOP_ITEMS = [
  { key: 'magnet', icon: '🧲', name: '吸铁石', desc: '游戏中自动吸附金币，拾取范围大幅扩大', cost: 500 },
  { key: 'life2', icon: '❤️', name: '第二条命', desc: '最大生命提升到 2 条', cost: 1000 },
  { key: 'double', icon: '💎', name: '金币双倍', desc: '拾取金币的得分翻倍', cost: 2500 },
  { key: 'life3', icon: '💖', name: '第三条命', desc: '最大生命提升到 3 条', cost: 10000 }
];
var CFG_KEY = 'fl_fluppy_cfg';
var LB_KEY = 'fl_fluppy_lb';
var CP_KEY = 'fl_fluppy_cp';

/* ---------------- 工具 ---------------- */
function $(id) { return document.getElementById(id); }
function num(v, d) { v = Number(v); return isFinite(v) && v >= 0 ? Math.floor(v) : d; }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function lerp(a, b, t) { return a + (b - a) * t; }

/* ---------------- 难度曲线（连续渐变，无跳变） ---------------- */
function diffT(n) { return Math.max(0, Math.min(1, n / DIFF_N)); }
function gapAt(n) { return lerp(GAP_0, GAP_1, diffT(n)); }
function spacingAt(n) { return lerp(SPACING_0, SPACING_1, diffT(n)); }

/* ---------------- 存储 ---------------- */
var S = { hi: 0, games: 0, muted: false, volume: 0.8, balance: 0, items: {} };

function readCfg() {
  try { var r = localStorage.getItem(CFG_KEY); if (r) { var d = JSON.parse(r); if (d && typeof d === 'object') return d; } } catch (e) {}
  return null;
}
function saveCfg() {
  var d = { hi: S.hi, games: S.games, muted: S.muted, volume: S.volume, balance: S.balance, items: S.items };
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
    S.balance = num(d.balance, 0);
    if (typeof d.muted === 'boolean') S.muted = d.muted;
    if (isFinite(Number(d.volume))) S.volume = Math.max(0, Math.min(1, Number(d.volume)));
    if (d.items && typeof d.items === 'object') mergeItems(d.items);
  }
}
function mergeItems(from) {
  for (var i = 0; i < SHOP_ITEMS.length; i++) {
    if (from[SHOP_ITEMS[i].key] === true) S.items[SHOP_ITEMS[i].key] = true;
  }
}
/* 云存储优先：启动时从 B站 K-V 合并较大的 hi/games/balance + 道具并集，localCache 兜底 */
function mergeCloud() {
  if (!sdkReady()) return;
  window.toy.getCloudStorage([CFG_KEY]).then(function (data) {
    try {
      var c = data && data[CFG_KEY] ? JSON.parse(data[CFG_KEY]) : null;
      if (c && typeof c === 'object') {
        var changed = false;
        if (num(c.hi, 0) > S.hi) { S.hi = num(c.hi, 0); changed = true; }
        if (num(c.games, 0) > S.games) { S.games = num(c.games, 0); changed = true; }
        if (num(c.balance, 0) > S.balance) { S.balance = num(c.balance, 0); changed = true; }
        if (c.items && typeof c.items === 'object') {
          var before = JSON.stringify(S.items);
          mergeItems(c.items);
          if (before !== JSON.stringify(S.items)) changed = true;
        }
        if (changed) saveCfg();
      }
    } catch (e) {}
  }).catch(function () {});
}

/* 本地榜：分数（前 100 条） */
function readLB() {
  try { var r = localStorage.getItem(LB_KEY); if (r) { var d = JSON.parse(r); if (d && d.list) return d; } } catch (e) {}
  return { list: [] };
}
function writeLB(d) { try { localStorage.setItem(LB_KEY, JSON.stringify(d)); } catch (e) {} }
function addLocalScore(s) {
  var lb = readLB();
  lb.list.push({ s: Math.floor(s), ts: Date.now() });
  lb.list.sort(function (a, b) { return b.s - a.s; });
  if (lb.list.length > 100) lb.list.length = 100;
  writeLB(lb);
}

/* ---------------- B站 SDK（异步懒加载，永不阻塞页面） ---------------- */
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
function submitBiliScore(final) {
  if (!sdkReady()) return;
  var sc = Math.max(0, Math.min(16777215, Math.floor(final)));
  try { window.toy.submitScore({ board: 1, score: sc }).catch(function () {}); } catch (e) {}
}

/* ---------------- 音效（WebAudio：随机啾比音 + 合成金币/死亡音） ---------------- */
var AM = {
  els: [], act: null, master: null,
  /* 预加载 8 个 mp3 到 <audio> 元素：file:// 与 http 均无 CORS 限制，点击随机播一个 */
  preload: function () {
    if (this.els.length || typeof Audio === 'undefined') return;
    for (var i = 0; i < AUDIO_COUNT; i++) {
      var a = new Audio('audios/phoebe_chubby_' + i + '.mp3');
      a.preload = 'auto';
      this.els.push(a);
    }
  },
  playHit: function () {
    if (S.muted) return;
    if (!this.els.length) this.preload();
    var pool = [];
    var n = Math.min(7, this.els.length);   // 点击只用 0-6，7 号留给碰撞/死亡
    for (var i = 0; i < n; i++) if (this.els[i].readyState >= 2) pool.push(this.els[i]);
    if (!pool.length) { for (var j = 0; j < n; j++) pool.push(this.els[j]); }
    if (!pool.length) return;
    var a = pool[Math.floor(Math.random() * pool.length)];
    a.volume = S.volume;
    try { a.currentTime = 0; a.play().catch(function () {}); } catch (e) {}
  },
  playChubby7: function () {
    if (S.muted) return;
    var a = this.els[7];
    if (!a) return;
    a.volume = S.volume;
    try { a.currentTime = 0; a.play().catch(function () {}); } catch (e) {}
  },
  playCoin: function () { this.tone(1250, 0.07, 'sine', 0.5, 0); this.tone(1660, 0.12, 'sine', 0.4, 0.05); },
  /* 合成音（金币/受伤/死亡）需 AudioContext，惰性创建并在手势内自动 resume */
  tone: function (freq, dur, type, vol, delay) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      var ctx = this.act || (this.act = new AC());
      if (ctx.state === 'suspended') ctx.resume();
      if (!this.master) {
        this.master = ctx.createGain();
        this.master.gain.value = S.muted ? 0 : S.volume;
        this.master.connect(ctx.destination);
      }
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      var t0 = ctx.currentTime + (delay || 0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + dur + 0.05);
    } catch (e) {}
  },
  apply: function () {
    if (this.master) this.master.gain.value = S.muted ? 0 : S.volume;
    var v = S.muted ? 0 : S.volume;
    for (var i = 0; i < this.els.length; i++) this.els[i].volume = v;
  },
  setVol: function (v) { S.volume = v; this.apply(); },
  setMuted: function (m) { S.muted = m; this.apply(); }
};

/* ---------------- 图片加载 ---------------- */
var bgImg = null, bgBlur = null, birdRound = null;
function blurBackground(img) {
  try {
    var c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    var x = c.getContext('2d');
    if (x.filter === undefined) return null;   // 不支持 filter 时退回原图
    x.filter = 'blur(10px)';
    x.drawImage(img, 0, 0);
    x.filter = 'none';
    return c;
  } catch (e) { return null; }
}
function loadImages() {
  var b = new Image();
  b.onload = function () { bgImg = b; bgBlur = blurBackground(b); };
  b.src = 'background.png';
  var f = new Image();
  f.onload = function () {
    birdRound = makeRound(f, BIRD);
    drawHomeIcon();
  };
  f.src = 'feibi.png';
}
function makeRound(img, size) {
  try {
    var srcW = img.width, srcH = img.height;
    var c = document.createElement('canvas');
    c.width = srcW; c.height = srcH;
    var x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    /* 去白底：可能因 canvas 污染（file:///CORS）抛 SecurityError，
       失败则保留白底仅做圆形裁切，保证鸟始终可见 */
    try {
      var id = x.getImageData(0, 0, srcW, srcH);
      var d = id.data;
      var N = srcW * srcH;
      function isWhite(i) { return d[i] > 245 && d[i + 1] > 240 && d[i + 2] > 228; }
      var visited = new Uint8Array(N);
      var queue = [];
      function push(p) {
        if (p >= 0 && p < N && !visited[p]) {
          visited[p] = 1;
          if (isWhite(p * 4)) queue.push(p);
        }
      }
      var t;
      for (t = 0; t < srcW; t++) { push(t); push((srcH - 1) * srcW + t); }
      for (t = 0; t < srcH; t++) { push(t * srcW); push(t * srcW + srcW - 1); }
      var qi = 0;
      while (qi < queue.length) {
        var p = queue[qi++];
        d[p * 4 + 3] = 0;
        var px = p % srcW, py = (p - px) / srcW;
        if (px > 0) push(p - 1);
        if (px < srcW - 1) push(p + 1);
        if (py > 0) push(p - srcW);
        if (py < srcH - 1) push(p + srcW);
      }
      x.putImageData(id, 0, 0);
    } catch (e2) {}
    /* 圆形裁切到鸟尺寸 */
    var c2 = document.createElement('canvas');
    c2.width = c2.height = size;
    var x2 = c2.getContext('2d');
    x2.save();
    x2.beginPath();
    x2.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    x2.closePath();
    x2.clip();
    x2.drawImage(c, 0, 0, size, size);
    x2.restore();
    return c2;
  } catch (e) { return null; }
}
function drawHomeIcon() {
  var cv = $('home-bird');
  if (!cv || !birdRound) return;
  var x = cv.getContext('2d');
  x.clearRect(0, 0, cv.width, cv.height);
  x.drawImage(birdRound, 0, 0, cv.width, cv.height);
}

/* ---------------- 游戏状态 ---------------- */
var run = null;

function spawnPipe() {
  var n = run.passed;
  var gap = gapAt(n);
  var maxTop = H - GROUND_H - gap - MIN_TOP;
  if (maxTop < MIN_TOP) maxTop = MIN_TOP;
  var topH = MIN_TOP + Math.random() * (maxTop - MIN_TOP);
  var last = run.pipes[run.pipes.length - 1];
  var x = last ? last.x + spacingAt(n) : W + 120;
  run.pipes.push({ x: x, topH: topH, gap: gap, passed: false, coinTaken: false });
}
function livesMax() {
  var m = BASE_LIVES;
  if (S.items.life2) m = Math.max(m, 2);
  if (S.items.life3) m = Math.max(m, 3);
  return m;
}
function newRun() {
  run = {
    state: 'playing', y: H / 2, vy: 0, score: 0, dist: 0, coins: 0, passed: 0, lives: livesMax(), invT: 0,
    pipes: [], time: 0, deadT: 0
  };
  spawnPipe();
}
function flap() {
  if (!run) return;
  if (run.state === 'paused') { resumeGame(); return; }
  if (run.state !== 'playing') return;
  run.vy = FLAP;
  AM.playHit();
}
function circleRect(cx, cy, rx, ry, rw, rh, r) {
  var nx = Math.max(rx, Math.min(cx, rx + rw));
  var ny = Math.max(ry, Math.min(cy, ry + rh));
  var dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
function hitPipe(p) {
  if (circleRect(BIRD_X, run.y, p.x, 0, PIPE_W, p.topH, BIRD_R)) return true;
  var y2 = p.topH + p.gap;
  if (y2 < H - GROUND_H && circleRect(BIRD_X, run.y, p.x, y2, PIPE_W, H - GROUND_H - y2, BIRD_R)) return true;
  return false;
}
function coinDist(p) {
  var dx = BIRD_X - (p.x + PIPE_W / 2);
  var dy = run.y - (p.topH + p.gap / 2);
  return Math.sqrt(dx * dx + dy * dy);
}
function update(dt) {
  if (!run) return;
  if (run.state === 'playing') {
    run.time += dt;
    run.dist += SPEED * dt;
    run.score += dt * (DIST_RATE_0 + run.dist * DIST_RATE_K);   // 距离越远，每秒加分越多
    run.vy = Math.min(run.vy + G * dt, MAX_FALL);
    run.y += run.vy * dt;
    if (run.invT > 0) run.invT -= dt;
    var pickup = S.items.magnet ? PICKUP_MAGNET : PICKUP;
    var coinPts = S.items.double ? SCORE_COIN * 2 : SCORE_COIN;
    var i, p;
    for (i = 0; i < run.pipes.length; i++) run.pipes[i].x -= SPEED * dt;
    var last = run.pipes[run.pipes.length - 1];
    while (last && last.x < W + 40) { spawnPipe(); last = run.pipes[run.pipes.length - 1]; }
    if (run.pipes.length && run.pipes[0].x < -PIPE_W * 2) run.pipes.shift();
    for (i = 0; i < run.pipes.length; i++) {
      p = run.pipes[i];
      if (!p.passed && p.x + PIPE_W < BIRD_X) {
        p.passed = true; run.passed++; run.score += SCORE_PIPE;
        saveCheckpoint();
      }
      if (!p.coinTaken && coinDist(p) < pickup) {
        p.coinTaken = true; run.coins++; run.score += coinPts;
        AM.playCoin();
      }
      if (run.invT <= 0 && hitPipe(p)) { hit('pipe'); return; }
    }
    if (run.invT <= 0) {
      if (run.y < BIRD_R) { run.y = BIRD_R; hit('ceiling'); return; }
      if (run.y > H - GROUND_H - BIRD_R) { run.y = H - GROUND_H - BIRD_R; hit('ground'); return; }
    }
    updateHud();
  } else if (run.state === 'dying') {
    run.deadT += dt;
    run.vy = Math.min(run.vy + G * dt, MAX_FALL);
    run.y += run.vy * dt;
    if (run.y > H - GROUND_H) run.y = H - GROUND_H;
    if (run.deadT > 0.85) gameOver();
  }
}
function hit(src) {
  if (!run || run.state !== 'playing') return;
  run.lives--;
  run.invT = INVINCIBLE;
  AM.playChubby7();   // 碰撞扣血统一播 7 号音
  flashRed();         // 全屏红闪特效
  if (src === 'ground') { run.y = H / 2; run.vy = 0; }            // 撞地弹回画面中心继续（不出地面）
  else if (src === 'ceiling') { run.y = BIRD_R; run.vy = MAX_FALL * 0.35; }
  else if (run.vy < 0) { run.vy = 0; }
  if (run.lives <= 0) die();
}
var flashTimer = 0;
function flashRed() {
  var el = $('flash');
  if (!el) return;
  clearTimeout(flashTimer);
  el.hidden = false;
  el.style.opacity = '1';
  void el.offsetWidth;
  el.style.opacity = '0';
  flashTimer = setTimeout(function () { el.hidden = true; }, 520);
}
function die() {
  if (!run || run.state !== 'playing') return;
  run.state = 'dying';
  run.deadT = 0;
  if (run.vy < 0) run.vy = 0;
  clearCheckpoint();
}
function gameOver() {
  if (!run || run.state === 'over') return;
  run.state = 'over';
  var final = Math.floor(run.score);
  var isNew = final > S.hi;
  if (final > S.hi) S.hi = final;
  S.games += 1;
  S.balance += run.coins;   // 本局拾取金币并入当前金币余额
  saveCfg();
  addLocalScore(final);
  submitBiliScore(final);
  $('over-score').textContent = final;
  $('over-pipes').textContent = run.passed + ' 根';
  $('over-coins').textContent = run.coins + ' 枚';
  $('over-hi').textContent = S.hi;
  $('over-new').hidden = !isNew;
  $('over-overlay').hidden = false;
  if (sdkReady()) toast('成绩已同步到 B站榜');
  else toast('成绩已记录到本地榜');
}

/* ---------------- 断点续玩 ---------------- */
function saveCheckpoint() {
  if (!run || run.state === 'over') return;
  try {
    var cp = {
      score: run.score, dist: run.dist, coins: run.coins, passed: run.passed, lives: run.lives,
      y: run.y, vy: run.vy, time: run.time,
      pipes: run.pipes.map(function (p) {
        return { x: p.x, topH: p.topH, gap: p.gap, passed: p.passed, coinTaken: p.coinTaken };
      }),
      ts: Date.now()
    };
    localStorage.setItem(CP_KEY, JSON.stringify(cp));
  } catch (e) {}
}
function hasCheckpoint() {
  try { return !!localStorage.getItem(CP_KEY); } catch (e) { return false; }
}
function clearCheckpoint() {
  try { localStorage.removeItem(CP_KEY); } catch (e) {}
}
function continueRun() {
  try {
    var raw = localStorage.getItem(CP_KEY);
    if (!raw) return false;
    var cp = JSON.parse(raw);
    if (!cp || !cp.pipes || !cp.pipes.length) return false;
    run = {
      state: 'playing', y: cp.y, vy: cp.vy, score: cp.score, dist: cp.dist, coins: cp.coins || 0, passed: cp.passed,
      lives: cp.lives || livesMax(), invT: 0,
      pipes: cp.pipes, time: cp.time, deadT: 0
    };
    return true;
  } catch (e) { return false; }
}

/* ---------------- 渲染 ---------------- */
var ctx = null;
function draw() {
  if (!ctx || !run) return;
  ctx.clearRect(0, 0, W, H);
  if (bgBlur) ctx.drawImage(bgBlur, 0, 0, W, H);
  else if (bgImg) ctx.drawImage(bgImg, 0, 0, W, H);
  else { ctx.fillStyle = '#86b9f0'; ctx.fillRect(0, 0, W, H); }
  drawGround();
  drawPipes();
  drawBird();
}
function drawGround() {
  var y0 = H - GROUND_H;
  var g = ctx.createLinearGradient(0, y0, 0, H);
  g.addColorStop(0, 'rgba(42,58,78,0)');
  g.addColorStop(0.35, 'rgba(42,58,78,0.92)');
  g.addColorStop(1, 'rgba(24,36,52,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, W, GROUND_H);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(0, y0, W, 2);
}
function drawPipes() {
  for (var i = 0; i < run.pipes.length; i++) {
    var p = run.pipes[i];
    drawPipeBody(p.x, 0, p.topH, true);
    var y2 = p.topH + p.gap;
    var h2 = H - GROUND_H - y2;
    if (h2 > 0) drawPipeBody(p.x, y2, h2, false);
    if (!p.coinTaken) drawCoin(p.x + PIPE_W / 2, p.topH + p.gap / 2);
  }
}
function drawPipeBody(x, y, h, isTop) {
  var g = ctx.createLinearGradient(x, 0, x + PIPE_W, 0);
  g.addColorStop(0, '#2f7a24'); g.addColorStop(0.45, '#6bc74d'); g.addColorStop(1, '#2f7a24');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, PIPE_W, h);
  var capH = Math.min(CAP_H, h);
  var capX = x - (CAP_W - PIPE_W) / 2;
  var capY = isTop ? (y + h - capH) : y;
  var g2 = ctx.createLinearGradient(capX, 0, capX + CAP_W, 0);
  g2.addColorStop(0, '#3c9430'); g2.addColorStop(0.5, '#7ed463'); g2.addColorStop(1, '#3c9430');
  ctx.fillStyle = g2;
  ctx.fillRect(capX, capY, CAP_W, capH);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, PIPE_W, h);
}
function drawCoin(cx, cy) {
  var r = COIN_R;
  var sx = Math.abs(Math.cos(run.time * 3 + cx * 0.02));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(0.35 + 0.65 * sx, 1);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffb800';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#c77a00';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.58, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffd76a';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd76a';
  ctx.fill();
  ctx.restore();
}
function birdAngle() {
  var a = run.vy * 0.0011;
  return Math.max(-0.55, Math.min(1.25, a));
}
function drawBird() {
  if (!birdRound) return;
  ctx.save();
  ctx.translate(BIRD_X, run.y);
  ctx.rotate(birdAngle());
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;
  ctx.drawImage(birdRound, -BIRD / 2, -BIRD / 2, BIRD, BIRD);
  ctx.restore();
}

/* ---------------- 视图 ---------------- */
var VIEWS = ['home', 'game', 'rank', 'shop', 'settings', 'help'];
function showView(name) {
  for (var i = 0; i < VIEWS.length; i++) {
    var v = document.getElementById('view-' + VIEWS[i]);
    if (v) v.hidden = (VIEWS[i] !== name);
  }
  if (name === 'home') renderHome();
  else if (name === 'shop') renderShop();
}
function renderHome() {
  $('home-hi').textContent = S.hi;
  $('home-games').textContent = S.games + ' 局';
  $('home-coins').textContent = S.balance;
  $('btn-continue').hidden = !hasCheckpoint();
  drawHomeIcon();
}
function livesText(n, max) {
  var s = '';
  for (var i = 0; i < max; i++) s += (i < n ? '❤️' : '🤍');
  return s;
}
function updateHud() {
  var mu = $('btn-mute');
  if (mu) mu.textContent = S.muted ? '🔇' : '🔊';
  if (!run) return;
  $('hud-score').textContent = Math.floor(run.score);
  $('hud-coins').textContent = run.coins;
  $('hud-lives').textContent = livesText(run.lives, livesMax());
  $('hud-hi').textContent = S.hi;
}

/* ---------------- 商城 ---------------- */
var pendingShop = null;
function renderShop() {
  $('shop-balance').textContent = S.balance;
  var html = '';
  for (var i = 0; i < SHOP_ITEMS.length; i++) {
    var it = SHOP_ITEMS[i];
    var owned = S.items[it.key];
    html += '<div class="shop-item' + (owned ? ' owned' : '') + '">' +
      '<div class="shop-icon">' + it.icon + '</div>' +
      '<div class="shop-info"><div class="shop-name">' + it.name + '</div>' +
      '<div class="shop-desc">' + it.desc + '</div></div>' +
      (owned
        ? '<button class="btn shop-buy" disabled>已拥有</button>'
        : '<button class="btn shop-buy" data-key="' + it.key + '"><span class="coin"></span>' + it.cost + '</button>') +
      '</div>';
  }
  $('shop-list').innerHTML = html;
  var btns = document.querySelectorAll('.shop-buy');
  for (var j = 0; j < btns.length; j++) {
    btns[j].addEventListener('click', function () { openShopConfirm(this.getAttribute('data-key')); });
  }
}
function findItem(key) {
  for (var i = 0; i < SHOP_ITEMS.length; i++) if (SHOP_ITEMS[i].key === key) return SHOP_ITEMS[i];
  return null;
}
function openShopConfirm(key) {
  var it = findItem(key);
  if (!it) return;
  if (S.items[key]) return;
  if (S.balance < it.cost) { toast('金币不足'); return; }
  pendingShop = key;
  $('shop-confirm-desc').innerHTML = '购买 <b>' + it.name + '</b>（' + it.cost + ' 金币）？';
  $('shop-confirm').hidden = false;
}
function tryBuy(key) {
  var it = findItem(key);
  if (!it || S.items[key] || S.balance < it.cost) return false;
  S.balance -= it.cost;
  S.items[key] = true;
  saveCfg();
  return true;
}
function doBuy() {
  if (pendingShop && tryBuy(pendingShop)) {
    var it = findItem(pendingShop);
    toast('已购买 ' + it.name);
  }
  pendingShop = null;
  $('shop-confirm').hidden = true;
  renderShop();
  renderHome();
}
function cancelBuy() {
  pendingShop = null;
  $('shop-confirm').hidden = true;
}
function startRun() {
  newRun();
  $('pause-overlay').hidden = true;
  $('over-overlay').hidden = true;
  lastT = 0;
  updateHud();
  showView('game');
}

/* ---------------- 暂停 / 结算 / 退出 ---------------- */
function pauseGame() {
  if (!run || run.state !== 'playing') return;
  run.state = 'paused';
  $('pause-score').textContent = run.score;
  $('pause-overlay').hidden = false;
}
function resumeGame() {
  if (!run || run.state === 'over') return;
  run.state = 'playing';
  $('pause-overlay').hidden = true;
  lastT = 0;
}
function togglePause() {
  if (!run) return;
  if (run.state === 'playing') pauseGame();
  else if (run.state === 'paused') resumeGame();
}
function settleGame() {
  if (!run || run.state === 'over') return;
  $('pause-overlay').hidden = true;
  gameOver();
}
function exitToHome() {
  if (run && (run.state === 'playing' || run.state === 'paused')) saveCheckpoint();
  run = null;
  $('pause-overlay').hidden = true;
  $('over-overlay').hidden = true;
  renderHome();
  showView('home');
}
var settingsFromPause = false;
function openSettingsFromPause() {
  if (!run || run.state !== 'paused') return;
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

/* ---------------- 排行榜 ---------------- */
var rk = { src: 'local', period: 'all' };
function periodName(p) { return p === 'all' ? '总榜' : p === 'month' ? '月榜' : p === 'week' ? '周榜' : '日榜'; }
function switchSrc(src) {
  rk.src = src;
  var tabs = document.querySelectorAll('#rank-src .tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-src') === src);
  $('rank-period').hidden = (src !== 'bili');
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
  var list = (lb.list || []).slice(0, 100);
  $('rank-note').textContent = '本机最高分（前 100 条）';
  if (!list.length) { $('rank-body').innerHTML = '<div class="lb-tip">暂无成绩，去飞一局吧</div>'; return; }
  var html = '';
  for (var i = 0; i < list.length; i++) {
    html += '<div class="lb-row"><span class="lb-rank' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</span>' +
      '<span class="lb-user"><span class="lb-avatar">🐦</span><span class="lb-name">我</span></span>' +
      '<span class="lb-score">' + list[i].s + ' 分</span></div>';
  }
  $('rank-body').innerHTML = html;
}
function loadBiliRank() {
  if (!sdkReady()) {
    $('rank-note').textContent = '请在 B站 App 内打开查看 B站榜';
    $('rank-body').innerHTML = '<div class="lb-tip">当前环境不支持加载 B站 排行榜</div>';
    return;
  }
  $('rank-note').textContent = periodName(rk.period) + ' · 最高分（前 100 名）';
  $('rank-body').innerHTML = '<div class="lb-tip">加载中…</div>';
  window.toy.getRankList({ board: 1, period: rk.period, limit: 100 }).then(function (list) {
    renderBili(list);
  }).catch(function () { $('rank-body').innerHTML = '<div class="lb-tip">加载失败</div>'; });
  window.toy.getMyRank({ board: 1, period: rk.period }).then(function (me) {
    if (me && me.ranked) $('rank-note').textContent += ' · 我的排名：第 ' + me.rank + ' 名';
  }).catch(function () {});
}
function renderBili(list) {
  if (!list || !list.length) { $('rank-body').innerHTML = '<div class="lb-tip">暂无上榜数据</div>'; return; }
  var html = '';
  for (var i = 0; i < list.length; i++) {
    var it = list[i];
    html += '<div class="lb-row"><span class="lb-rank' + (it.rank <= 3 ? ' top' : '') + '">' + it.rank + '</span>' +
      '<span class="lb-user"><img class="lb-avatar" src="' + esc(it.avatar) + '" alt="" onerror="this.style.visibility=\'hidden\'"><span class="lb-name">' + esc(it.nickname) + '</span></span>' +
      '<span class="lb-score">' + it.score + ' 分</span></div>';
  }
  $('rank-body').innerHTML = html;
}

/* ---------------- 设置 ---------------- */
function applySettings() {
  $('set-muted').checked = !S.muted;
  var sv = Math.round(S.volume * 100);
  $('set-volume').value = sv;
  $('set-volume-val').textContent = sv + '%';
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
function touchTap() {
  AM.preload();
  flap();
}
function toggleMute() {
  S.muted = !S.muted;
  AM.setMuted(S.muted);
  saveCfg();
  var mu = $('btn-mute');
  if (mu) mu.textContent = S.muted ? '🔇' : '🔊';
}
function bindCanvas() {
  var wrap = $('game-wrap');
  function down(e) { e.preventDefault(); touchTap(); }
  if ('PointerEvent' in window) {
    wrap.addEventListener('pointerdown', down);
  } else {
    wrap.addEventListener('touchstart', down, { passive: false });
    wrap.addEventListener('mousedown', down);
  }
}
function bindKeyboard() {
  window.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    if (k === ' ' || k === 'arrowup' || k === 'w') {
      if (!e.repeat) { e.preventDefault(); touchTap(); }
    } else if (k === 'p' || k === 'escape') { e.preventDefault(); togglePause(); }
    else if (k === 'm') { e.preventDefault(); toggleMute(); }
  });
}
function bindUI() {
  $('btn-continue').addEventListener('click', function () { AM.preload(); if (continueRun()) { $('pause-overlay').hidden = true; $('over-overlay').hidden = true; lastT = 0; updateHud(); showView('game'); } });
  $('btn-start').addEventListener('click', function () { AM.preload(); startRun(); });
  $('btn-rank').addEventListener('click', function () { loadRank(); showView('rank'); });
  $('btn-shop').addEventListener('click', function () { showView('shop'); });
  $('btn-settings').addEventListener('click', function () { applySettings(); showView('settings'); });
  $('btn-help').addEventListener('click', function () { showView('help'); });
  $('btn-pause').addEventListener('click', function () { pauseGame(); });
  $('btn-mute').addEventListener('click', function () { toggleMute(); });
  $('btn-resume').addEventListener('click', function () { resumeGame(); });
  $('btn-restart').addEventListener('click', function () { startRun(); });
  $('btn-pause-settings').addEventListener('click', function () { openSettingsFromPause(); });
  $('btn-settle').addEventListener('click', function () { settleGame(); });
  $('btn-exit').addEventListener('click', function () { exitToHome(); });
  $('btn-again').addEventListener('click', function () { startRun(); });
  $('btn-ranko').addEventListener('click', function () { loadRank(); showView('rank'); });
  $('btn-home').addEventListener('click', function () { exitToHome(); });
  $('btn-back-rank').addEventListener('click', function () { showView('home'); });
  $('btn-back-shop').addEventListener('click', function () { showView('home'); });
  $('btn-shop-buy').addEventListener('click', doBuy);
  $('btn-shop-cancel').addEventListener('click', cancelBuy);
  $('btn-back-settings').addEventListener('click', backFromSettings);
  $('btn-back-help').addEventListener('click', function () { showView('home'); });
  $('set-muted').addEventListener('change', function () { AM.setMuted(!this.checked); saveCfg(); });
  $('set-volume').addEventListener('input', function () {
    var v = Number(this.value) / 100;
    AM.setVol(v);
    $('set-volume-val').textContent = this.value + '%';
    saveCfg();
  });
  var srcTabs = document.querySelectorAll('#rank-src .tab');
  for (var i = 0; i < srcTabs.length; i++) srcTabs[i].addEventListener('click', function () { switchSrc(this.getAttribute('data-src')); });
  var pTabs = document.querySelectorAll('#rank-period .ptab');
  for (var j = 0; j < pTabs.length; j++) pTabs[j].addEventListener('click', function () { switchPeriod(this.getAttribute('data-p')); });
}

/* ---------------- 主循环 ---------------- */
var lastT = 0;
function tick(dt) {
  update(dt);
  if (run) draw();
}
function loop(ts) {
  var dt = Math.min(0.033, (ts - lastT) / 1000 || 0.016);
  lastT = ts;
  tick(dt);
  requestAnimationFrame(loop);
}

/* ---------------- 初始化 ---------------- */
function init() {
  ctx = $('game').getContext('2d');
  loadCfg();
  loadImages();
  AM.preload();
  loadSDK();
  bindCanvas();
  bindKeyboard();
  bindUI();
  renderHome();
  showView('home');
  requestAnimationFrame(loop);
}
init();
