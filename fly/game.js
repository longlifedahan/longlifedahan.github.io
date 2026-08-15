/* ================= 中国人能飞 =================
   竖屏点击飞行：连点上升、左右移位，躲开写着生活难题的柱子。
   脚下斩杀线前 100m 不动，之后按「max(15, 0.2×速度+15)m/s」上移，追上即死。
   撞柱不死，但斩杀线会大幅上涨。越高柱子越密、缺口越小、惩罚越大。
   本地榜 + B站榜（日/周/月/总）。注意：本文件不用 'use strict'（便于冒烟测试）。
   ================================================ */

/* ---------------- 常量 ---------------- */
var W = 400;                 // 逻辑宽
var H = 620;                 // 逻辑高
var ALT_PX = 10;             // 每米像素
var PLAYER_W = 22;           // 玩家宽
var PLAYER_H = 28;           // 玩家高
var PLAYER_SCREEN_F = 0.42;  // 玩家在画布上的高度位置（距顶比例）
var BASE_VY = 0;             // 待机悬停：不点击不飞，速度归零
var TAP_IMPULSE = 38;        // 每次点击上升冲量 px/s（配合惯性，8次/s≈20m/s）
var VY_DECAY = 1.5;          // 速度回归系数 /s（停止点击后有一段惯性滑行）
var MAX_VY = 200;            // 上升速度上限 px/s（20 m/s，玩家最高速度不降）
var BONUS_START_M = 500;     // 道具起始高度（米）
var BONUS_EVERY_M = 100;     // 道具间隔（米），500m 后每 100m 一个
var H_IMPULSE = 55;          // 左右冲量 px/s
var H_DECAY = 2.2;           // 左右摩擦
var MAX_HV = 190;            // 左右速度上限 px/s
var SAFE_M = 50;             // 柱子起始高度（米），前50m无障碍
var SAFE_PX = SAFE_M * ALT_PX;         // 500px
var KL_START_TIME = 5;       // 斩杀线启动倒计时（秒）：过5s 且 过50m 才启动
var KL_START_GAP_M = 75;     // 斩杀线启动时位于玩家下方距离（米）
var MAX_T_M = 900;           // 难度在 100m 后再爬 900m（即 1000m）拉满
var KILL_HIT_BASE = 60;      // 撞柱斩杀线基础跳升 px（6m）
var KILL_HIT_RANGE = 160;    // 随难度再增 px（最多 6+16=22m）
var SPACING_0 = 300, SPACING_1 = 116;  // 两对柱子间距 px
var GAP_0 = 170, GAP_1 = 72;           // 柱子缺口宽 px（>3×玩家宽 66）
var THICK_0 = 40, THICK_1 = 48;        // 柱子厚度 px（足够展示文字）
var LB_KEY = 'fl_fly_lb';
var CFG_KEY = 'fl_fly_cfg';
var WORDS = ['高考', '秋招', '迟到', '加班', '内卷', '背锅', '画饼', '调岗', '降薪', '996', 'PUA', 'C绩效',
  '裁员', '欠薪', '失业', '生病', '三高', '房贷', '破产', '流浪'];

/* ---------------- 工具 ---------------- */
function $(id) { return document.getElementById(id); }
function num(v, d) { v = Number(v); return isFinite(v) && v >= 0 ? Math.floor(v) : d; }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function lerp(a, b, t) { return a + (b - a) * t; }
function mOf(px) { return Math.floor(px / ALT_PX); }

/* ---------------- 难度曲线 ---------------- */
/* 高度（px）→ 难度系数 0..1，100m 后 900m 内线性拉满 */
function diffT(altPx) {
  var m = (altPx - SAFE_PX) / ALT_PX;
  return Math.max(0, Math.min(1, m / MAX_T_M));
}
function spacingAt(a) { return lerp(SPACING_0, SPACING_1, diffT(a)); }
function gapAt(a) { return lerp(GAP_0, GAP_1, diffT(a)); }
function thickAt(a) { return lerp(THICK_0, THICK_1, diffT(a)); }
function penaltyAt(a) { return KILL_HIT_BASE + KILL_HIT_RANGE * diffT(a); }
/* 斩杀线上升速度 px/s：max(14, 0.2×速度+14) m/s（默认与满速均较前降1m/s，略降难度） */
function klSpeedFor(vy) { return Math.max(140, 0.2 * vy + 140); }

/* ---------------- 存储 ---------------- */
var S = { hi: 0, games: 0, muted: false, bgm: true };

function readCfg() {
  try { var r = localStorage.getItem(CFG_KEY); if (r) { var d = JSON.parse(r); if (d && typeof d === 'object') return d; } } catch (e) {}
  return null;
}
function saveCfg() {
  var d = { hi: S.hi, games: S.games, muted: S.muted, bgm: S.bgm };
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
    if (typeof d.muted === 'boolean') S.muted = d.muted;
    if (typeof d.bgm === 'boolean') S.bgm = d.bgm;
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

/* 本地榜：最高飞高（前 100 条） */
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
      thrust: [340, 0.05, 'sine', 0.04],
      hit:    [150, 0.22, 'sawtooth', 0.12],
      warn:   [520, 0.25, 'triangle', 0.09],
      bonus:  [660, 0.12, 'sine', 0.07],
      over:   [220, 0.45, 'sawtooth', 0.12]
    };
    var d = defs[name]; if (!d) return;
    tone(d[0], d[1], d[2], d[3], 0);
  } catch (e) {}
}

/* ---------------- BGM（bgm.mp3，需用户手势后播放） ---------------- */
var BGM = null;
function ensureBgm() {
  try {
    if (BGM || typeof document === 'undefined') return;
    BGM = document.createElement('audio');
    BGM.loop = true;
    BGM.src = 'bgm.mp3';
    BGM.preload = 'auto';
    BGM.volume = 0.45;
    document.body.appendChild(BGM);
  } catch (e) {}
}
function playBgm() {
  try {
    if (!BGM) ensureBgm();
    if (!BGM || !S.bgm || S.muted) return;
    BGM.play().catch(function () {});
  } catch (e) {}
}
function stopBgm() {
  try { if (BGM) BGM.pause(); } catch (e) {}
}
/* 全面静音：同时关音效与 BGM */
function toggleMute() {
  S.muted = !S.muted;
  saveCfg();
  if (S.muted) stopBgm();
  else if (R && R.state === 'playing') playBgm();
}

/* ---------------- 特效 ---------------- */
var FXD = { parts: [], texts: [], banners: [] };
function addParticles(x, y, color) {
  for (var i = 0; i < 10; i++) {
    FXD.parts.push({
      x: x, y: y, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220 - 60,
      life: 0.4 + Math.random() * 0.3, t: 0, r: 2.5 + Math.random() * 3, col: color || '#ff6b5e'
    });
  }
}
function addFloat(x, y, text, color, size) {
  FXD.texts.push({ x: x, y: y, text: text, color: color || '#e63b2e', life: 0.9, t: 0, size: size || 15 });
}
function addBanner(text, sub) {
  FXD.banners.push({ text: text, sub: sub || '', t: 0, life: 1.6 });
}
function updateFX(dt) {
  var i;
  for (i = FXD.parts.length - 1; i >= 0; i--) {
    var p = FXD.parts[i];
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt;
    if (p.t >= p.life) FXD.parts.splice(i, 1);
  }
  for (i = FXD.texts.length - 1; i >= 0; i--) {
    var tx = FXD.texts[i];
    tx.t += dt; tx.y -= 40 * dt;
    if (tx.t >= tx.life) FXD.texts.splice(i, 1);
  }
  for (i = FXD.banners.length - 1; i >= 0; i--) {
    var bn = FXD.banners[i];
    bn.t += dt;
    if (bn.t >= bn.life) FXD.banners.splice(i, 1);
  }
}

/* ---------------- 玩家控制 ---------------- */
function tapUp() {
  if (!R || R.state !== 'playing') return;
  R.vy = Math.min(MAX_VY, R.vy + TAP_IMPULSE);
  sfx('thrust');
}
function tapDown() {
  if (!R || R.state !== 'playing') return;
  R.vy = Math.max(0, R.vy - 70);   // S/↓ 减速（不能向后飞，最低 0）
}
function tapLeft() {
  if (!R || R.state !== 'playing') return;
  R.vx = Math.max(-MAX_HV, R.vx - H_IMPULSE);
}
function tapRight() {
  if (!R || R.state !== 'playing') return;
  R.vx = Math.min(MAX_HV, R.vx + H_IMPULSE);
}

/* ---------------- 柱子生成 ---------------- */
function spawnPillars() {
  if (!R) return;
  var guard = 0;
  while (R.nextSpawnAlt <= R.alt + H * 1.4 && guard++ < 40) {
    var alt = R.nextSpawnAlt;
    var t = diffT(alt);
    var gw = gapAt(alt);
    var th = thickAt(alt) * (0.85 + Math.random() * 0.35);   // 粗细随机变化
    var half = gw / 2;
    var MIN_SEG = 100;   // 柱子段至少能横排放下文字
    var minC = half + MIN_SEG, maxC = W - half - MIN_SEG;
    var c;
    if (R.prevGapC === null) {
      c = minC + Math.random() * (maxC - minC);
    } else {
      var maxDelta = lerp(90, 55, t);
      c = R.prevGapC + (Math.random() * 2 - 1) * maxDelta;
      c = Math.max(minC, Math.min(maxC, c));
    }
    R.prevGapC = c;
    /* 苦难词库随高度解锁：先高考/秋招，后裁员/破产 */
    var poolN = Math.min(WORDS.length, 2 + Math.floor(t * (WORDS.length - 2)));
    var wIdx = Math.floor(Math.random() * poolN);
    R.pillars.push({ id: ++R.pid, alt: alt, gapC: c, gapW: gw, thick: th, label: WORDS[wIdx], hit: false });
    /* 间距保底：两柱净空 ≥ 3×玩家高 */
    var sp = spacingAt(alt) * (0.85 + Math.random() * 0.3);
    R.nextSpawnAlt = alt + Math.max(sp, th + 3 * PLAYER_H + 8);
  }
}
function removePassedPillars() {
  for (var i = R.pillars.length - 1; i >= 0; i--) {
    if (R.pillars[i].alt < R.alt - H) R.pillars.splice(i, 1);
  }
  for (var j = R.bonuses.length - 1; j >= 0; j--) {
    if (R.bonuses[j].alt < R.alt - H) R.bonuses.splice(j, 1);
  }
}

/* ---------------- 道具：500m 后每 100m 一个，捡到降低 3-5m 斩杀线 ---------------- */
function spawnBonuses() {
  if (!R) return;
  var guard = 0;
  while (R.nextBonusAlt <= R.alt + H * 1.4 && guard++ < 20) {
    if (R.nextBonusAlt >= BONUS_START_M * ALT_PX) {
      R.bonuses.push({ alt: R.nextBonusAlt, x: bonusX(R.nextBonusAlt), got: false });
    }
    R.nextBonusAlt += BONUS_EVERY_M * ALT_PX;
  }
}
/* 道具 x 生成：候选随机位置若与附近（±100px）柱子段重叠则重掷，兜底放到最近柱子的缺口中心 */
function bonusX(alt) {
  var pad = 26;
  for (var t = 0; t < 12; t++) {
    var x = 30 + Math.random() * (W - 60);
    var ok = true;
    for (var i = 0; i < R.pillars.length; i++) {
      var p = R.pillars[i];
      if (Math.abs(p.alt - alt) > 100) continue;
      var gl = p.gapC - p.gapW / 2, gr = p.gapC + p.gapW / 2;
      if (x + pad > 0 && x - pad < gl) { ok = false; break; }
      if (x - pad < W && x + pad > gr) { ok = false; break; }
    }
    if (ok) return x;
  }
  /* 兜底：放到最近柱子的缺口中心（不落在柱子上） */
  var best = null, bestD = 1e9;
  for (var j = 0; j < R.pillars.length; j++) {
    var pj = R.pillars[j];
    var d = Math.abs(pj.alt - alt);
    if (d < bestD) { bestD = d; best = pj; }
  }
  if (best) return Math.max(30, Math.min(W - 30, best.gapC));
  return W / 2;
}
function checkBonus() {
  if (!R || R.state !== 'playing') return;
  for (var i = 0; i < R.bonuses.length; i++) {
    var b = R.bonuses[i];
    if (b.got) continue;
    if (Math.abs(b.alt - R.alt) > 46 || Math.abs(b.x - R.x) > 32) continue;
    b.got = true;
    var reduce = (3 + Math.floor(Math.random() * 3)) * ALT_PX;   // 3~5m
    R.kl = Math.max(0, R.kl - reduce);
    addParticles(R.x, playerScreenY(), '#38d97a');
    addFloat(R.x, playerScreenY() - 30, '斩杀线 -' + (reduce / ALT_PX) + 'm', '#18a65a', 15);
    sfx('bonus');
  }
}

/* ---------------- 碰撞与斩杀线 ---------------- */
function playerRect() {
  return { x1: R.x - PLAYER_W / 2, x2: R.x + PLAYER_W / 2, y1: R.alt - PLAYER_H / 2, y2: R.alt + PLAYER_H / 2 };
}
function pillarRects(p) {
  var y1 = p.alt - p.thick / 2, y2 = p.alt + p.thick / 2;
  var gl = p.gapC - p.gapW / 2, gr = p.gapC + p.gapW / 2;
  return [
    { x1: 0, y1: y1, x2: gl, y2: y2 },
    { x1: gr, y1: y1, x2: W, y2: y2 }
  ];
}
function rectHit(a, b) { return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1; }

function checkPillarHit() {
  if (!R || R.state !== 'playing' || R.invuln > 0) return;
  var pr = playerRect();
  for (var i = 0; i < R.pillars.length; i++) {
    var p = R.pillars[i];
    if (p.hit) continue;
    if (Math.abs(p.alt - R.alt) > p.thick / 2 + PLAYER_H / 2 + 8) continue;
    var rects = pillarRects(p);
    if (rectHit(pr, rects[0]) || rectHit(pr, rects[1])) {
      p.hit = true;
      R.hits++;
      R.invuln = 0.9;
      var pen = penaltyAt(R.alt);
      /* 涨幅不超过斩杀线剩余距离的 80%（以玩家底线计），不会直接致死 */
      var safety = (R.alt - PLAYER_H / 2) - R.kl;
      var add = Math.min(pen, Math.max(0, safety * 0.8));
      R.kl += add;
      R.vy = Math.max(0, R.vy - 80);   // 敲退：只减速不下降
      R.shake = 0.3;
      addParticles(R.x, playerScreenY(), '#ff6b5e');
      var addM = Math.round(add / ALT_PX);
      addFloat(R.x, playerScreenY() - 34, '-' + addM + 'm', '#e63b2e', 15);
      addBanner(p.label + '！', '斩杀线暴涨 +' + addM + 'm');
      sfx('hit');
      break;
    }
  }
}

function updateKillLine(dt) {
  if (!R || R.state !== 'playing') return;
  if (!R.klActive && R.seconds >= KL_START_TIME && R.alt >= SAFE_PX) {
    R.klActive = true;
    /* 玩家≥75m：斩杀线从0m开始追；玩家<75m：斩杀线初始落后玩家75m（可为负，在画布外） */
    R.kl = Math.min(0, R.alt - KL_START_GAP_M * ALT_PX);
    R.klV = klSpeedFor(R.vy);
    addBanner('⚔ 斩杀线启动！', '倒计时结束，保持速度');
    sfx('warn');
  }
  if (R.klActive) {
    var target = klSpeedFor(R.vy);
    R.klV += (target - R.klV) * Math.min(1, dt * 1.5);
    R.kl += R.klV * dt;
  }
}
function checkKillDeath() {
  if (!R || R.state !== 'playing') return;
  if (R.klActive && R.kl >= R.alt - PLAYER_H / 2) gameOver();
}
/* ---------------- 渲染 ---------------- */
var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');
var dpr = 1;
var CLOUDS = [];
(function initClouds() {
  for (var i = 0; i < 14; i++) {
    CLOUDS.push({ x: 20 + Math.random() * (W - 40), y: Math.random() * H, r: 14 + Math.random() * 26, f: 0.22 + Math.random() * 0.38 });
  }
})();

function resizeCanvas() {
  if (typeof window === 'undefined') return;
  var vw = window.innerWidth || 400;
  var vh = window.innerHeight || 700;
  var availW = Math.min(vw, 560);
  var availH = vh - 215;
  var scale = Math.max(0.3, Math.min(availW / W, availH / H));
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = (W * scale) + 'px';
  canvas.style.height = (H * scale) + 'px';
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function playerScreenY() { return Math.round(H * PLAYER_SCREEN_F); }
function worldYToScreen(altPx) { return playerScreenY() - (altPx - R.alt); }
function rrect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCloud(x, y, r) {
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x - r * 0.8, y + r * 0.2, r * 0.68, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.82, y + r * 0.15, r * 0.78, 0, Math.PI * 2); ctx.fill();
}
function drawBG() {
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#bfe0ff');
  g.addColorStop(0.5, '#d8f0ff');
  g.addColorStop(1, '#eef9ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  /* 100m 刻度线 */
  var step = 100 * ALT_PX;
  var first = Math.ceil((R.alt - H) / step) * step;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.fillStyle = 'rgba(80,140,180,0.4)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  for (var y = first; y <= R.alt + H; y += step) {
    var sy = worldYToScreen(y);
    if (sy < -20 || sy > H + 20) continue;
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
    ctx.fillText(Math.round(y / ALT_PX) + 'm', 6, sy - 6);
  }

  /* 视差云 */
  var scroll = R.alt;
  for (var i = 0; i < CLOUDS.length; i++) {
    var c = CLOUDS[i];
    var cy = (c.y + scroll * c.f) % (H + 100) - 50;
    if (cy < -60 || cy > H + 60) continue;
    drawCloud(c.x, cy, c.r);
  }
}

function drawPillarSeg(x1, x2, y1, y2, label, side) {
  if (x2 <= x1 || y2 <= y1) return;
  /* 柱体 */
  ctx.fillStyle = '#46566b';
  rrect(x1, y1, x2 - x1, y2 - y1, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  rrect(x1, y1, x2 - x1, 4, 2); ctx.fill();
  ctx.fillStyle = 'rgba(20,30,45,0.28)';
  rrect(x1, y2 - 3, x2 - x1, 3, 1); ctx.fill();
  /* 缺口侧警示条纹 */
  var eh = 6, ex = side === 'l' ? x2 - eh : x1;
  ctx.fillStyle = 'rgba(255,205,60,0.55)';
  ctx.fillRect(ex, y1, eh, y2 - y1);
  /* 文字：柱子段已保证足够宽，优先横排，窄段自动竖排兜底 */
  var fs = Math.min(18, Math.max(12, (x2 - x1) / Math.max(1, label.length) * 1.1));
  var cx = (x1 + x2) / 2, cy = (y1 + y2) / 2 + 1;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (fs * label.length <= (x2 - x1) && fs <= (y2 - y1)) {
    ctx.font = 'bold ' + fs + 'px sans-serif';
    ctx.fillText(label, cx, cy);
  } else {
    var chars = label.split('');
    var step = Math.min((y2 - y1 - 4) / chars.length, fs);
    ctx.font = 'bold ' + step + 'px sans-serif';
    for (var i = 0; i < chars.length; i++) ctx.fillText(chars[i], cx, y1 + (i + 0.5) * step + (y2 - y1 - chars.length * step) / 2);
  }
}
function drawPillars() {
  if (!R) return;
  for (var i = 0; i < R.pillars.length; i++) {
    var p = R.pillars[i];
    var sy = worldYToScreen(p.alt);
    if (sy < -40 || sy > H + 40) continue;
    var gl = p.gapC - p.gapW / 2, gr = p.gapC + p.gapW / 2;
    var y1 = sy - p.thick / 2, y2 = sy + p.thick / 2;
    if (gl > 0) drawPillarSeg(0, gl, y1, y2, p.label, 'l');
    if (gr < W) drawPillarSeg(gr, W, y1, y2, p.label, 'r');
  }
}

function drawPlayer(x, y) {
  var s = R ? R.seconds : 0;
  var vyN = R ? Math.max(0, Math.min(1, R.vy / MAX_VY)) : 0;   // 上升强度 0..1
  var vxN = R ? Math.max(-1, Math.min(1, R.vx / MAX_HV)) : 0;  // 水平强度 -1..1
  var tilt = vxN * 0.34;
  var bob = Math.sin(s * (8 + vyN * 10)) * (2 + vyN * 4);      // 上升起伏
  var armFlap = Math.sin(s * (9 + vyN * 12)) * (4 + vyN * 9);  // 双臂扇动
  var lean = -vxN * 3;                                         // 身体随移动侧倾
  ctx.save();
  ctx.translate(x + lean, y + bob);
  ctx.rotate(tilt);
  /* 上升速度线（拖尾） */
  if (R && R.vy > 60) {
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (var v = 0; v < 2 + Math.floor(vyN * 3); v++) {
      var lx = -9 + v * 9, ly = 16 + v * 6;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx, ly + (6 + vyN * 12));
      ctx.stroke();
    }
  }
  /* 红色披风（随速度大幅飘动） */
  ctx.fillStyle = '#e63b2e';
  ctx.beginPath();
  ctx.moveTo(-5, 1);
  ctx.quadraticCurveTo(-14, 12 + armFlap * 0.7, -8, 21 + armFlap * 1.2);
  ctx.quadraticCurveTo(-1, 11, 4, 1);
  ctx.closePath(); ctx.fill();
  /* 身体 */
  ctx.fillStyle = '#2e7bd6';
  rrect(-6, -1, 12, 13, 4); ctx.fill();
  /* 双臂上举、随点击扇动 */
  ctx.strokeStyle = '#f0c8a0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-9, -12 - armFlap * 0.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(9, -12 + armFlap * 0.5); ctx.stroke();
  /* 头 */
  ctx.fillStyle = '#f7cf9e';
  ctx.beginPath(); ctx.arc(0, -8, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath(); ctx.arc(0, -10, 7, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillRect(-7, -11, 14, 3);
  /* 眼睛看向移动方向 */
  var eyeX = vxN * 1.6;
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath(); ctx.arc(-2.6 + eyeX, -7.5, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(2.6 + eyeX, -7.5, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#c25b2b'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.arc(eyeX, -5.4, 2.6, 0.25, Math.PI * 1.45); ctx.stroke();
  ctx.restore();
}

function drawKillLine() {
  if (!R || !R.klActive) return;
  var sy = worldYToScreen(R.kl);
  if (sy < -50 || sy > H + 50) return;
  var danger = (R.alt - R.kl) < 500;
  var a = 0.55 + 0.3 * Math.sin(Date.now() / 120);
  ctx.save();
  var g = ctx.createLinearGradient(0, sy, 0, sy + 18);
  g.addColorStop(0, 'rgba(220,40,40,' + (danger ? 0.92 : 0.7) + ')');
  g.addColorStop(1, 'rgba(220,40,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, sy, W, 18);
  /* 锯齿下沿 */
  ctx.fillStyle = 'rgba(220,40,40,' + (danger ? 0.95 : 0.8) + ')';
  ctx.beginPath();
  ctx.moveTo(0, sy);
  for (var x = 0; x <= W; x += 20) ctx.lineTo(x, sy + ((x / 20) % 2 ? 6 : 0));
  ctx.lineTo(W, sy + 6); ctx.lineTo(W, sy);
  ctx.closePath(); ctx.fill();
  /* 上沿红线（画布内不加文字，逼近提示只走画布外 HUD，避免与画面重叠） */
  ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 + a * 0.3) + ')';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
  ctx.restore();
}

/* 道具：白底绿圈 + 向下箭头（斩杀线下降） */
function drawBonuses() {
  if (!R) return;
  for (var i = 0; i < R.bonuses.length; i++) {
    var b = R.bonuses[i];
    if (b.got) continue;
    var sy = worldYToScreen(b.alt);
    if (sy < -40 || sy > H + 40) continue;
    var pulse = 0.7 + 0.3 * Math.sin(Date.now() / 180 + b.x);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(b.x, sy, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#18a65a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(b.x, sy, 13, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#18a65a';
    ctx.beginPath();
    ctx.moveTo(b.x - 6, sy - 3);
    ctx.lineTo(b.x + 6, sy - 3);
    ctx.lineTo(b.x, sy + 7);
    ctx.closePath(); ctx.fill();
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('-3~5m', b.x, sy - 19);
    ctx.restore();
  }
}

/* 右侧高度槽：玩家蓝点固定不动，斩杀线红点随距离向上追赶 */
function drawGauge() {
  if (!R) return;
  var gw = 9, gx = W - gw - 4;
  var top = 18, bottom = H - 18;
  var span = bottom - top;
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  rrect(gx, top, gw, span, 4); ctx.fill();
  /* 斩杀线红点：从下方追赶蓝点，越逼近越靠上，追上即与蓝点重合 */
  if (R.klActive) {
    var gap = Math.max(0, R.alt - R.kl);
    var ratio = Math.min(1, gap / (200 * ALT_PX));
    var ky = top + ratio * span;   // gap 大(远) → 靠底部；gap 小(逼近) → 靠顶部
    ctx.fillStyle = '#dc2828';
    rrect(gx, ky - 3, gw, 6, 3); ctx.fill();
  }
  /* 玩家蓝点：固定在顶部 */
  ctx.fillStyle = '#2e7bd6';
  ctx.beginPath(); ctx.arc(gx + gw / 2, top, 5, 0, Math.PI * 2); ctx.fill();
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
  for (i = 0; i < FXD.banners.length; i++) {
    var bn = FXD.banners[i];
    var k = bn.t / bn.life;
    var y = 58 - k * 4;
    ctx.globalAlpha = Math.max(0, 1 - k);
    /* 顶部半透明提示条，不与画面中央玩法重叠 */
    var bw = Math.max(120, ctx.measureText(bn.text).width + 40);
    if (bn.sub) bw = Math.max(bw, ctx.measureText(bn.sub).width + 48);
    ctx.fillStyle = 'rgba(13,63,128,0.5)';
    rrect((W - bw) / 2, y - 22, bw, 36, 12); ctx.fill();
    ctx.font = 'bold 19px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(bn.text, W / 2, y);
    if (bn.sub) {
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(bn.sub, W / 2, y + 14);
    }
  }
  ctx.globalAlpha = 1;
}
function render() {
  if (!$('view-game').hidden) {
    ctx.save();
    if (R && R.shake > 0) {
      var k = R.shake / 0.3;
      ctx.translate((Math.random() - 0.5) * 8 * k, (Math.random() - 0.5) * 8 * k);
    }
    ctx.clearRect(-30, -30, W + 60, H + 60);
    drawBG();
    drawPillars();
    drawBonuses();
    drawGauge();
    if (R) drawKillLine();
    if (R) drawPlayer(R.x, playerScreenY());
    drawFX();
    ctx.restore();
  }
}

/* ---------------- 状态机 ---------------- */
var R = null;
var last = 0;

function startRun() {
  R = {
    state: 'playing',
    alt: 0, vy: BASE_VY, x: W / 2, vx: 0,
    kl: 0, klActive: false, klV: 0,
    pillars: [], nextSpawnAlt: SAFE_PX, prevGapC: null, pid: 0,
    bonuses: [], nextBonusAlt: BONUS_START_M * ALT_PX,
    hits: 0, maxAlt: 0, seconds: 0, invuln: 0, shake: 0
  };
  FXD.parts.length = 0;
  FXD.texts.length = 0;
  FXD.banners.length = 0;
  addBanner('✈ 连点 ▲ 上升！', '不点击会悬停，连点越快飞得越高');
  $('pause-overlay').hidden = true;
  $('over-overlay').hidden = true;
  last = 0;
  resizeCanvas();
  playBgm();
  showView('game');
}
function pauseGame() {
  if (!R || R.state !== 'playing') return;
  R.state = 'paused';
  stopBgm();
  $('pause-alt').textContent = mOf(R.alt) + 'm';
  $('pause-overlay').hidden = false;
}
function resumeGame() {
  if (!R || R.state === 'over') return;
  R.state = 'playing';
  playBgm();
  $('pause-overlay').hidden = true;
  last = 0;
  showView('game');
}
function togglePause() {
  if (!R) return;
  if (R.state === 'playing') pauseGame();
  else if (R.state === 'paused') resumeGame();
}
function exitToHome() {
  if (!R) return;
  R.state = 'paused';
  stopBgm();
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
  stopBgm();
  var final = mOf(R.alt);
  var isNew = final > S.hi;
  if (final > S.hi) S.hi = final;
  S.games += 1;
  saveCfg();
  addLocalScore(final);
  submitBiliScore(final);
  $('over-alt').textContent = final + 'm';
  $('over-kl').textContent = mOf(R.kl) + 'm';
  $('over-hits').textContent = R.hits + ' 次';
  $('over-hi').textContent = S.hi + 'm';
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
  $('home-hi').textContent = S.hi + 'm';
  $('home-games').textContent = S.games + ' 局';
}
function updateHud() {
  var mu = $('btn-mute');
  if (mu) mu.textContent = S.muted ? '🔇' : '🔊';
  if (!R) return;
  $('hud-alt').textContent = mOf(R.alt) + 'm';
  $('hud-speed').textContent = Math.floor(R.vy / ALT_PX) + 'm/s';
  $('hud-hi').textContent = S.hi + 'm';
  var distM = Math.max(0, Math.round((R.alt - R.kl) / ALT_PX));
  var klEl = $('hud-kl');
  if (!R.klActive) {
    var remain = Math.max(0, Math.ceil(KL_START_TIME - R.seconds));
    if (remain > 0) { klEl.textContent = remain + 's 后启动'; klEl.className = 'hud-num hud-kl-num warn'; }
    else if (R.alt < SAFE_PX) { klEl.textContent = '飞到50m'; klEl.className = 'hud-num hud-kl-num'; }
    else { klEl.textContent = '启动!'; klEl.className = 'hud-num hud-kl-num urgent'; }
  }
  else if (distM < 20) { klEl.textContent = '近在咫尺!!'; klEl.className = 'hud-num hud-kl-num urgent'; }
  else if (distM < 60) { klEl.textContent = '逼近' + distM + 'm'; klEl.className = 'hud-num hud-kl-num warn'; }
  else { klEl.textContent = '+' + distM + 'm'; klEl.className = 'hud-num hud-kl-num'; }
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
  var list = (lb.hi || []).slice(0, 100);
  $('rank-note').textContent = '本机最高飞高（前 100 条）';
  if (!list.length) { $('rank-body').innerHTML = '<div class="lb-tip">暂无成绩，去飞一局吧</div>'; return; }
  var html = '';
  for (var i = 0; i < list.length; i++) {
    html += '<div class="lb-row"><span class="lb-rank' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</span>' +
      '<span class="lb-user"><span class="lb-avatar">🦸</span><span class="lb-name">我</span></span>' +
      '<span class="lb-score">' + list[i].s + 'm</span></div>';
  }
  $('rank-body').innerHTML = html;
}
function loadBiliRank() {
  if (!sdkReady()) {
    $('rank-note').textContent = '请在 B站 App 内打开查看 B站榜';
    $('rank-body').innerHTML = '<div class="lb-tip">当前环境不支持加载 B站 排行榜</div>';
    return;
  }
  $('rank-note').textContent = periodName(rk.period) + ' · 最高飞高（前 100 名）';
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
      '<span class="lb-score">' + it.score + 'm</span></div>';
  }
  $('rank-body').innerHTML = html;
}

/* ---------------- 设置 ---------------- */
function applySettings() {
  var m = $('set-muted');
  if (m) m.checked = !S.muted;
  var b = $('set-bgm');
  if (b) b.checked = S.bgm;
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
function bindHold(el, onTap) {
  function start(e) { e.preventDefault(); onTap(); }   // 只响应按下那一下，长按不自动连点
  if ('PointerEvent' in window) {
    el.addEventListener('pointerdown', start);
  } else {
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('mousedown', start);
  }
}
/* 手机/桌面直接操作画面：连击屏幕=上升，左右滑动=左右移动 */
function bindCanvasTouch() {
  var cv = $('game');
  var drag = null;
  function down(e) {
    e.preventDefault();
    drag = { x: e.clientX, lastX: e.clientX, dragging: false };
  }
  function move(e) {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x) > 14) drag.dragging = true;
    if (drag.dragging) {
      var ddx = e.clientX - drag.lastX;
      if (Math.abs(ddx) >= 3) {
        if (ddx > 0) tapRight();
        else tapLeft();
        drag.lastX = e.clientX;
      }
    }
  }
  function up(e) {
    e.preventDefault();
    if (drag && !drag.dragging) tapUp();
    drag = null;
  }
  function cancel() { drag = null; }
  cv.addEventListener('pointerdown', down);
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', cancel);
}
function bindKeyboard() {
  window.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    if (k === 'w' || k === 'arrowup') { if (!e.repeat) tapUp(); e.preventDefault(); }
    else if (k === 'a' || k === 'arrowleft') { if (!e.repeat) tapLeft(); e.preventDefault(); }
    else if (k === 'd' || k === 'arrowright') { if (!e.repeat) tapRight(); e.preventDefault(); }
    else if (k === 's' || k === 'arrowdown') { if (!e.repeat) tapDown(); e.preventDefault(); }
    else if (k === 'p' || k === 'escape') { togglePause(); e.preventDefault(); }
  });
}
function bindUI() {
  $('btn-start').addEventListener('click', function () { ensureAudio(); startRun(); });
  $('btn-rank').addEventListener('click', function () { loadRank(); showView('rank'); });
  $('btn-settings').addEventListener('click', function () { applySettings(); showView('settings'); });
  $('btn-help').addEventListener('click', function () { showView('help'); });
  $('btn-pause').addEventListener('click', function () { pauseGame(); });
  $('btn-mute').addEventListener('click', function () { toggleMute(); });
  $('btn-resume').addEventListener('click', function () { resumeGame(); });
  $('btn-restart').addEventListener('click', function () { startRun(); });
  $('btn-settle').addEventListener('click', function () { settleGame(); });
  $('btn-pause-settings').addEventListener('click', function () { openSettingsFromPause(); });
  $('btn-exit').addEventListener('click', function () { exitToHome(); });
  $('btn-again').addEventListener('click', function () { startRun(); });
  $('btn-ranko').addEventListener('click', function () { loadRank(); showView('rank'); });
  $('btn-home').addEventListener('click', function () { exitToHome(); });
  $('btn-back-rank').addEventListener('click', function () { showView('home'); });
  $('btn-back-settings').addEventListener('click', backFromSettings);
  $('btn-back-help').addEventListener('click', function () { showView('home'); });
  $('set-muted').addEventListener('change', function () { S.muted = !this.checked; saveCfg(); if (S.muted) stopBgm(); else if (R && R.state === 'playing') playBgm(); });
  $('set-bgm').addEventListener('change', function () { S.bgm = this.checked; saveCfg(); if (S.bgm) playBgm(); else stopBgm(); });
  bindHold($('btn-up'), tapUp);
  bindHold($('btn-left'), tapLeft);
  bindHold($('btn-right'), tapRight);
  bindCanvasTouch();
  $('rank-src').addEventListener('click', function (e) {
    var t = e.target.closest('.tab'); if (!t) return;
    switchSrc(t.getAttribute('data-src'));
  });
  $('rank-period').addEventListener('click', function (e) {
    var t = e.target.closest('.ptab'); if (!t) return;
    switchPeriod(t.getAttribute('data-p'));
  });
}

/* ---------------- 主循环 ---------------- */
function tick(dt) {
  if (R && R.state === 'playing') {
    R.seconds += dt;
    if (R.invuln > 0) R.invuln -= dt;
    if (R.shake > 0) R.shake -= dt;
    /* 垂直：速度向 0 回归（不点击即悬停） */
    R.vy += (BASE_VY - R.vy) * Math.min(1, VY_DECAY * dt);
    R.alt += R.vy * dt;
    if (R.alt < 0) R.alt = 0;
    /* 水平：摩擦 + 移位 */
    R.vx *= Math.max(0, 1 - H_DECAY * dt);
    R.x += R.vx * dt;
    R.x = Math.max(PLAYER_W / 2, Math.min(W - PLAYER_W / 2, R.x));
    R.maxAlt = Math.max(R.maxAlt, R.alt);

    updateKillLine(dt);
    spawnPillars();
    spawnBonuses();
    checkPillarHit();
    checkBonus();
    removePassedPillars();
    updateFX(dt);
    checkKillDeath();
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
  loadCfg();
  bindUI();
  bindKeyboard();
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
