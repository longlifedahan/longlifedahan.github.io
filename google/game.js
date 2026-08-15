/* 小恐龙快跑 —— 谷歌浏览器内置小恐龙游戏风格跑酷
 * 移动优先 + 桌面适配；B站 Toy SDK 优先，localStorage 兜底；排行榜 双榜 × 四周期
 */
(function () {
  'use strict';

  /* ================= 常量 ================= */
  var WORLD_H = 360;           // 逻辑世界高
  var LOGICAL_W = 760;         // 逻辑世界宽（等比缩放居中，保证各端可见窗口一致）
  var GROUND_Y = 300;          // 地面高度
  var DINO_X = 90;             // 恐龙固定 x
  var DINO_W = 46, DINO_H = 50;
  var BASE_SPEED = 360;
  var MAX_SPEED = 860;
  var SPEED_SCALE = 7000;      // 速度指数逼近尺度（越大增速越平缓）
  var GRAVITY = 2350;
  var JUMP_V = 800;
  var DJUMP_V = 700;
  var PX_PER_M = 12;           // 1 米 = 12 逻辑像素
  var SCORE_PER_PX = 1 / PX_PER_M;   // 跑分：每米 1 分
  var COIN_BONUS = 5;          // 金币得分加成（+5 分）
  var COIN_GAP_MIN = 55, COIN_GAP_MAX = 85;  // 每 55~85 米一组（一屏约 1 撮，偶见 2 撮）
  var BIRD_SPEED = 160;        // 飞鸟自身飞行速度（对侧飞来；稍慢以允许多只同屏）
  var HIGH_CACTUS_M = 500;     // 500 米后出现更高仙人掌
  var DOUBLE_CACTUS_M = 1000;  // 1000 米后出现连体双仙人掌
  var BIRD_M = 3000;           // 3000 米后出现飞鸟
  var METEOR_M = 10000;        // 10000 米后出现陨石
  var CREVICE_M = 30000;       // 30000 米后地面出现裂缝
  var MAGNET_R = 200;
  var FLY_DUR = 5;             // 飞行技能持续 5s
  var REVIVE_INV = 4;          // 重生守护：复活后无敌 4s
  var INVULN = 0.5;            // 基础受击无敌（防连撞瞬间掉光所有命）
  var SHIELD_DUR = 2, DASH_DUR = 2.5, X2_DUR = 8, SKILL_CD = 60;
  var ROAR_NO_SPAWN = 3;       // 怒吼后 3s 内不生成任何障碍

  var CLOUD_KEY = 'google_save';       // B站云存储 key（与本地同构）
  var SAVE_KEY = 'google_save';        // localStorage key
  var LB_KEY = 'google_lb';            // 本地榜
  var CLOUD_INTERVAL = 30000;
  var PERIODS = ['all', 'month', 'week', 'day'];
  var BOARD_SCORE = 1, BOARD_COIN = 2, BOARD_DIST = 3;

  /* 商店（价格递增） */
  var SHOP = [
    { key: 'dj',     name: '二连跳',     desc: '空中可再跳一次',              price: 100,   icon: '🦘' },
    { key: 'life2',  name: '第二条命',   desc: '额外获得一条生命',            price: 300,   icon: '❤️' },
    { key: 'shield', name: '技能·护罩', desc: '主动技能：2 秒无敌',           price: 500,   icon: '🛡️' },
    { key: 'magnet', name: '吸铁石',     desc: '永久被动：自动吸附金币',      price: 1000,  icon: '🧲' },
    { key: 'dash',   name: '技能·冲刺', desc: '主动技能：猛冲 2.5 秒且无敌',  price: 2500,  icon: '💨' },
    { key: 'life3',  name: '第三条命',   desc: '再额外获得一条生命',          price: 5000,  icon: '🧡' },
    { key: 'x2',     name: '技能·双倍', desc: '主动技能：8 秒内得分 ×2',      price: 7500,  icon: '⚡' },
    { key: 'roar',   name: '技能·怒吼', desc: '主动技能：清空本屏障碍，3 秒内不生成', price: 10000, icon: '🌪️' },
    { key: 'tj',     name: '三连跳',     desc: '空中可再跳两次（叠加二连跳）', price: 12500, icon: '🐇' },
    { key: 'revive', name: '重生守护',   desc: '被动：复活后 4 秒无敌',       price: 15000, icon: '💖' },
    { key: 'fly',    name: '技能·飞行', desc: '主动技能：5 秒无视地面障碍',   price: 17500, icon: '🦅' },
    { key: 'life4',  name: '第四条命',   desc: '再额外获得一条生命',          price: 20000, icon: '💜' }
  ];
  var SKILL_DEF = {
    shield: { icon: '🛡️', name: '护罩' },
    dash:   { icon: '💨', name: '冲刺' },
    roar:   { icon: '🌪️', name: '怒吼' },
    x2:     { icon: '⚡',  name: '双倍' },
    fly:    { icon: '🦅', name: '飞行' }
  };
  var SKILL_ORDER = ['shield', 'dash', 'roar', 'x2', 'fly'];

  var DEFAULT_COLOR = '#6cb544';   // 默认恐龙绿
  var PRESET_COLORS = ['#6cb544', '#4d9de0', '#e05545', '#f28b30', '#9b59b6', '#e05a9e', '#2ba6a0', '#e0b52c', '#5a6b8c', '#8a8a8a'];

  /* ================= 工具 ================= */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function validColor(c) {
    return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null;
  }
  function shadeColor(hex, percent) {
    hex = String(hex || '').replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    var n = parseInt(hex, 16);
    if (isNaN(n)) return DEFAULT_COLOR;
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var t = percent < 0 ? 0 : 255, p = Math.abs(percent) / 100;
    r = Math.round((t - r) * p) + r;
    g = Math.round((t - g) * p) + g;
    b = Math.round((t - b) * p) + b;
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var UNITS = [[1e12, '万亿'], [1e8, '亿'], [1e4, '万']];
  function fmtNum(v) {
    v = Math.floor(Number(v) || 0);
    if (v < 10000) return String(v);
    for (var i = 0; i < UNITS.length; i++) {
      if (v >= UNITS[i][0]) {
        var x = v / UNITS[i][0];
        var s = x >= 100 ? x.toFixed(0) : (x >= 10 ? x.toFixed(1) : x.toFixed(2));
        s = s.replace(/\.?0+$/, '');
        return s + UNITS[i][1];
      }
    }
    return String(v);
  }

  /* B站分数拆位编码（submitScore 限 ±16777216）：
     存 = 指数×10000 + 尾数×1000（4 位有效数字），decode 还原近似真实值 */
  function encodeScore(v) {
    v = Math.floor(Number(v) || 0);
    if (v <= 0) return 0;
    if (v < 10000) return v;                       // 小值直接存，解码仍精确
    var e = Math.floor(Math.log10(v));
    var mant = Math.round(v / Math.pow(10, e - 3));
    if (mant >= 10000) { mant = 1000; e += 1; }
    return clamp(e * 10000 + mant, 0, 16777215);
  }
  function decodeScore(enc) {
    enc = Math.floor(Number(enc) || 0);
    if (enc <= 0) return 0;
    if (enc < 10000) return enc;
    var e = Math.floor(enc / 10000);
    var m = (enc % 10000) / 1000;
    if (m === 0) return 0;
    if (m >= 10) { m /= 10; e++; }
    if (m < 1) { m *= 10; e--; }
    return m * Math.pow(10, e);
  }

  /* 速度曲线：指数逼近上限，增率单调递减、永不停止增长 */
  function speedAt(dist) {
    return BASE_SPEED + (MAX_SPEED - BASE_SPEED) * (1 - Math.exp(-Math.max(0, dist) / SPEED_SCALE));
  }
  /* 障碍间隔（保证反应时间随速度增长；3000 米后逐渐加密，难度递增不减） */
  function gapFor(speed, rnd, m) {
    var dens = 1;
    if (m >= 3000) dens = 0.85;
    if (m >= 10000) dens = 0.75;
    var minG = (speed * 0.55 + 140) * dens;
    var maxG = (speed * 0.55 + 400) * dens;
    return minG + (maxG - minG) * (rnd === undefined ? Math.random() : rnd);
  }

  /* ================= 状态 ================= */
  function defaultSave() {
    return { coins: 0, totalCoins: 0, hi: 0, maxMeters: 0, color: DEFAULT_COLOR, gm: false,
      owns: { dj: false, life2: false, life3: false, life4: false, tj: false, revive: false, fly: false, shield: false, dash: false, magnet: false, roar: false, x2: false },
      muted: false, ts: 0 };
  }
  var S = defaultSave();
  var R = null;          // 局内状态

  function livesTotal() { return 1 + (S.owns.life2 ? 1 : 0) + (S.owns.life3 ? 1 : 0) + (S.owns.life4 ? 1 : 0); }
  /* GM 账号局：未购买也视为拥有全部技能 */
  function ownsSkill(key) {
    return !!(S.owns[key] || (R && R.gm));
  }

  function makeSaveObj() {
    return { coins: S.coins, totalCoins: S.totalCoins, hi: S.hi, maxMeters: S.maxMeters, color: S.color, gm: S.gm,
      owns: JSON.parse(JSON.stringify(S.owns)), muted: S.muted, ts: Date.now() };
  }
  function num(v, d) { v = Number(v); return isFinite(v) && v >= 0 ? Math.floor(v) : d; }
  function adoptState(d) {
    if (!d) return;
    S.coins = num(d.coins, 0);
    S.totalCoins = num(d.totalCoins, 0);
    S.hi = num(d.hi, 0);
    S.maxMeters = num(d.maxMeters, 0);
    S.color = validColor(d.color) || DEFAULT_COLOR;
    S.gm = !!d.gm;
    if (d.owns && typeof d.owns === 'object') for (var k in S.owns) S.owns[k] = !!d.owns[k];
    if (typeof d.muted === 'boolean') S.muted = d.muted;
  }
  /* 本地/云端合并：以总金币高为准（用户指定），购买项并集，最高分/累计取大 */
  function mergeSave(l, c) {
    var a = l || defaultSave(), b = c || defaultSave();
    var out = defaultSave();
    out.coins = Math.max(num(a.coins, 0), num(b.coins, 0));
    out.totalCoins = Math.max(num(a.totalCoins, 0), num(b.totalCoins, 0));
    out.hi = Math.max(num(a.hi, 0), num(b.hi, 0));
    out.maxMeters = Math.max(num(a.maxMeters, 0), num(b.maxMeters, 0));
    for (var k in out.owns) out.owns[k] = !!(a.owns && a.owns[k]) || !!(b.owns && b.owns[k]);
    out.muted = !!(a.muted || b.muted);
    out.color = validColor(a.color) || validColor(b.color) || DEFAULT_COLOR;
    out.gm = !!(a.gm || b.gm);
    return out;
  }

  /* ================= 存储 ================= */
  function readLocal() {
    try { var raw = localStorage.getItem(SAVE_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    return null;
  }
  function load() {
    adoptState(readLocal());
  }
  function save() {
    var d = makeSaveObj();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (e) {}
    var now = Date.now();
    if (sdkReady() && now - lastCloudSave > CLOUD_INTERVAL) {
      lastCloudSave = now;
      var kv = {}; kv[CLOUD_KEY] = JSON.stringify(d);
      window.toy.setCloudStorage(kv).catch(function () {});
    }
  }
  var saveTimer = null;
  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(function () { saveTimer = null; save(); }, 800);
  }
  function writeBoth() {
    var d = makeSaveObj();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (e) {}
    if (sdkReady()) {
      var kv = {}; kv[CLOUD_KEY] = JSON.stringify(d);
      window.toy.setCloudStorage(kv).catch(function () {});
    }
  }
  var lastCloudSave = 0;
  function mergeWithCloud() {
    return new Promise(function (resolve) {
      if (!sdkReady()) { resolve(false); return; }
      try {
        window.toy.getCloudStorage([CLOUD_KEY]).then(function (data) {
          try {
            var c = data && data[CLOUD_KEY] ? JSON.parse(data[CLOUD_KEY]) : null;
            var m = mergeSave(readLocal(), c);
            adoptState(m);
            writeBoth();
            resolve(true);
          } catch (e) { resolve(false); }
        }).catch(function () { resolve(false); });
      } catch (e) { resolve(false); }
    });
  }

  /* ================= 本地榜 ================= */
  function readLB() {
    try { var r = localStorage.getItem(LB_KEY); if (r) { var d = JSON.parse(r); if (d && d.hi) return d; } } catch (e) {}
    return { hi: [], coins: [] };
  }
  function writeLB(d) { try { localStorage.setItem(LB_KEY, JSON.stringify(d)); } catch (e) {} }
  function addLocalScores() {
    var lb = readLB();
    if (!lb.dist) lb.dist = [];
    lb.hi.push({ s: Math.floor(R.score), ts: Date.now() });
    lb.coins.push({ s: S.totalCoins, ts: Date.now() });
    lb.dist.push({ s: R.meters, ts: Date.now() });
    lb.hi.sort(function (a, b) { return b.s - a.s; });
    lb.coins.sort(function (a, b) { return b.s - a.s; });
    lb.dist.sort(function (a, b) { return b.s - a.s; });
    if (lb.hi.length > 100) lb.hi.length = 100;
    if (lb.coins.length > 100) lb.coins.length = 100;
    if (lb.dist.length > 100) lb.dist.length = 100;
    writeLB(lb);
  }

  /* ================= B站 SDK ================= */
  function sdkReady() {
    return typeof window !== 'undefined' && window.toy &&
      typeof window.toy.submitScore === 'function' &&
      typeof window.toy.getRankList === 'function';
  }
  function loadSDK() {
    try {
      if (sdkReady()) { mergeWithCloud().then(function () { submitBoards(true); }); return; }
      var s = document.createElement('script');
      s.src = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
      s.async = true;
      s.onload = function () { mergeWithCloud().then(function () { submitBoards(true); }); };
      document.head.appendChild(s);
    } catch (e) {}
  }
  var lastSubmit = 0;
  /* 注：submitScore 只有 board+score（周期由提交时间自动归入），勿带 period、勿连发 */
  function submitBoards(force) {
    if (!sdkReady()) return;
    var now = Date.now();
    if (!force && now - lastSubmit < 60000) return;
    lastSubmit = now;
    try {
      window.toy.submitScore({ board: BOARD_SCORE, score: encodeScore(S.hi) }).catch(function () {});
      window.toy.submitScore({ board: BOARD_COIN, score: encodeScore(S.totalCoins) }).catch(function () {});
      window.toy.submitScore({ board: BOARD_DIST, score: encodeScore(S.maxMeters) }).catch(function () {});
    } catch (e) {}
  }

  /* ================= 音频（极简 WebAudio） ================= */
  var AudioMgr = { act: null, muted: false };
  function sfx(name) {
    if (AudioMgr.muted || typeof window === 'undefined') return;
    ensureAudio();
    if (!AudioMgr.act) return;
    try {
      var t = AudioMgr.act.currentTime;
      var defs = {
        jump:  [490, 0.09, 'square', 0.09],
        jump2: [640, 0.09, 'square', 0.09],
        coin:  [880, 0.07, 'square', 0.10],
        hit:   [120, 0.20, 'sawtooth', 0.14],
        shield:[420, 0.22, 'triangle', 0.12],
        dash:  [200, 0.28, 'sawtooth', 0.12],
        roar:  [90,  0.30, 'sawtooth', 0.16],
        x2:    [700, 0.18, 'triangle', 0.12],
        fly:   [520, 0.4, 'triangle', 0.10],
        buy:   [660, 0.10, 'square', 0.10],
        over:  [300, 0.35, 'square', 0.12]
      };
      var d = defs[name]; if (!d) return;
      if (name === 'dash') { tone(d[0], d[1], d[2], d[3], 0); tone(260, 0.3, d[2], 0.10, 0.06); }
      else tone(d[0], d[1], d[2], d[3], 0);
    } catch (e) {}
  }
  function ensureAudio() {
    if (AudioMgr.act) return;
    try { var AC = window.AudioContext || window.webkitAudioContext; if (AC) AudioMgr.act = new AC(); } catch (e) {}
  }
  function tone(f, dur, type, vol, delay) {
    try {
      var o = AudioMgr.act.createOscillator(), g = AudioMgr.act.createGain();
      var t = AudioMgr.act.currentTime + (delay || 0);
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(AudioMgr.act.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  function toggleMute() {
    S.muted = !S.muted;
    AudioMgr.muted = S.muted;
    save();
    updateMuteBtn();
    if (!S.muted) sfx('coin');
  }
  function updateMuteBtn() {
    var t = S.muted ? '🔇' : '🔊';
    var h = S.muted ? '🔇 音效' : '🔊 音效';
    if ($('btn-mute-home')) $('btn-mute-home').textContent = h;
    if ($('btn-mute-game')) $('btn-mute-game').textContent = t;
  }

  /* ================= DOM ================= */
  function $(id) { return document.getElementById(id); }
  var canvas = null, ctx = null, dpr = 1;

  function setupCanvas() {
    canvas = $('game');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
  }
  function resize() {
    if (!canvas || canvas.clientWidth <= 0) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
  }
  function cssW() { return canvas ? canvas.clientWidth : 1; }
  function cssH() { return canvas ? canvas.clientHeight : 1; }
  function logicalW() { return LOGICAL_W; }

  /* ================= 局内状态 ================= */
  function newRun() {
    R = {
      state: 'count', countT: 3.0,
      score: 0, runCoins: 0, mult: 1,
      meters: 0, metersFloat: 0, coinAcc: rand(COIN_GAP_MIN, COIN_GAP_MAX),
      gm: !!S.gm, lives: (S.gm ? 4 : livesTotal()),
      speed: BASE_SPEED, dist: 0,
      dino: { y: 0, vy: 0, grounded: true, jumps: 0, runPhase: 0 },
      obs: [], meteors: [], coins: [], parts: [], floaters: [], clouds: [],
      sk: { shield: { t: 0, cd: 0 }, dash: { t: 0, cd: 0 }, roar: { t: 0, cd: 0 }, x2: { t: 0, cd: 0 }, fly: { t: 0, cd: 0 } },
      inv: 0, distToOb: 260, birdT: rand(2, 4), noSpawnT: 0, meteorT: 20, time: 0, shake: 0
    };
    for (var i = 0; i < 5; i++) {
      R.clouds.push({ x: rand(0, 1400), y: rand(30, 150), s: rand(0.6, 1.3), v: rand(8, 20) });
    }
  }
  function startRun() {
    newRun();
    $('pause-overlay').hidden = true;
    $('over-overlay').hidden = true;
    $('count-overlay').hidden = false;
    $('touch-hint').hidden = false;
    renderSkillbar();
    updateHUD();
  }
  function dinoBottomY() { return GROUND_Y + (R ? R.dino.y : 0); }
  function dinoCenterY() { return dinoBottomY() - DINO_H / 2; }

  /* ================= 更新 ================= */
  function update(dt) {
    var d = R.dino;
    R.time += dt;
    R.shake = Math.max(0, R.shake - dt);
    R.noSpawnT = Math.max(0, R.noSpawnT - dt);

    R.speed = speedAt(R.dist);
    /* 冲刺速度：相对当前速度 ×1.6（高速度段也明显），且保底 ≥ 基础 ×2.8，保证"向前冲"效果可感知 */
    if (R.sk.dash.t > 0) R.speed = Math.max(R.speed * 1.6, BASE_SPEED * 2.8);
    R.dist += R.speed * dt;
    R.metersFloat += R.speed * dt / PX_PER_M;
    R.meters = Math.floor(R.metersFloat);

    var mult = R.mult * (R.sk.x2.t > 0 ? 2 : 1);
    var scoreGain = R.speed * dt * SCORE_PER_PX * mult;   // 跑分：每米 1 分
    R.score += scoreGain;
    R.coinAcc -= scoreGain;
    if (R.coinAcc <= 0) { spawnCoins(); R.coinAcc = rand(COIN_GAP_MIN, COIN_GAP_MAX); }

    tickSkill('shield', dt); tickSkill('dash', dt); tickSkill('x2', dt); tickSkill('fly', dt);
    R.sk.roar.cd = Math.max(0, R.sk.roar.cd - dt);
    R.inv = Math.max(0, R.inv - dt);

    /* 恐龙物理 */
    d.runPhase += dt * (10 + R.speed / 60);
    if (d.grounded) { d.y = 0; d.vy = 0; }
    else {
      d.vy += GRAVITY * dt;
      d.y += d.vy * dt;
      if (d.y >= 0) { d.y = 0; d.grounded = true; d.jumps = 0; dust(4); sfx('land'); }
    }

    /* 云（视差） */
    for (var ci = 0; ci < R.clouds.length; ci++) {
      var c = R.clouds[ci];
      c.x -= R.speed * 0.25 * dt + c.v * dt * 0.2;
      if (c.x < -80) { c.x = logicalW() + rand(40, 160); c.y = rand(30, 150); }
    }

    /* 生成 */
    R.distToOb -= R.speed * dt;
    if (R.distToOb <= 0) spawnObstacle();
    /* 飞鸟独立随机出现：允许最多 3 只同屏，但不强制重叠（每只是独立随机变量） */
    R.birdT -= dt;
    if (R.meters >= BIRD_M && R.birdT <= 0) {
      R.birdT = rand(1.2, 3);
      if (R.noSpawnT <= 0 && birdCount() < 3 && R.meteors.length === 0) {
        spawnBird(logicalW() + 60);
      }
    }
    R.meteorT -= dt;
    if (R.meters >= METEOR_M && R.meteorT <= 0) {
      R.meteorT = rand(10, 18);
      if (R.noSpawnT <= 0 && R.meteors.length < 2) spawnMeteor();   // 独立随机出现，最多 2 颗同屏
    }

    moveObstacles(dt);
    updateMeteors(dt);
    updateCoins(dt);
    updateFx(dt);
    checkCollisions();
  }
  function tickSkill(key, dt) {
    var st = R.sk[key];
    if (key === 'dash' && st.t > 0 && st.t - dt <= 0) {
      R.inv = Math.max(R.inv, 0.5);   // 冲刺结束追加 0.5s 无敌
    }
    if (st.t > 0) st.t -= dt;
    if (st.cd > 0) st.cd -= dt;
  }

  function spawnObstacle() {
    if (R.noSpawnT > 0) return;   // 怒吼后 3s 内不生成任何障碍
    var speed = R.speed;
    var x = logicalW() + 60;
    /* 飞鸟不暂停地面障碍：仙人掌正常生成不受鸟影响（用户要求） */
    R.distToOb = gapFor(speed, Math.random(), R.meters);
    if (R.meters >= CREVICE_M && Math.random() < 0.3) { spawnCrevice(x); return; }
    spawnCactus(x, R.meters);
  }
  function birdCount() {
    var n = 0;
    for (var i = 0; i < R.obs.length; i++) if (R.obs[i].type === 'bird') n++;
    return n;
  }
  function anyGroundAhead(x) {
    for (var i = 0; i < R.obs.length; i++) {
      var o = R.obs[i];
      if (o.type !== 'bird' && o.x > DINO_X - 30 && o.x < x) return true;
    }
    return false;
  }
  function spawnCactus(x, m) {
    /* 裂缝上不能有仙人掌：若生成位与已有裂缝重叠则跳过本次 */
    for (var ci = 0; ci < R.obs.length; ci++) {
      if (R.obs[ci].type === 'crevice' && Math.abs(R.obs[ci].x - x) < 40) return;
    }
    var r = Math.random(), v, w, h;
    /* 双连/高仙人掌频次调高（用户要求） */
    if (m >= DOUBLE_CACTUS_M && r < 0.32) { v = 'double'; w = 56; h = 74; }
    else if (r < 0.5)      { v = 'small'; w = 18; h = 44; }
    else if (r < 0.74)     { v = 'med';   w = 24; h = 62; }
    else                   { v = 'tall';  w = 26; h = (m >= HIGH_CACTUS_M ? 100 : 84); }
    R.obs.push({ type: 'cactus', variant: v, x: x, w: w, h: h, y: GROUND_Y });
  }
  function spawnBird(x) {
    var hgt = [120, 145, 170, 195][Math.floor(Math.random() * 4)];
    /* 独立随机出现，但生成前验证：用当前恐龙速度+鸟速度，
       若鸟与前方某地面障碍几乎同时到达恐龙（无法分开跳），把鸟调低到可整跳跳过的高度 */
    var tBird = (x - DINO_X) / (R.speed + BIRD_SPEED);
    for (var i = 0; i < R.obs.length; i++) {
      var o = R.obs[i];
      if (o.type === 'bird' || o.x < DINO_X) continue;
      var tOb = (o.x - DINO_X) / R.speed;
      if (Math.abs(tOb - tBird) < 0.5) { hgt = 120; break; }   // 调低到顶 y≈180，整跳可过
    }
    var by = GROUND_Y - hgt + rand(-4, 4);
    R.obs.push({ type: 'bird', x: x, y: by, baseY: by, w: 52, h: 40, flap: Math.random() * 6 });
  }
  function spawnCrevice(x) {
    R.obs.push({ type: 'crevice', x: x, w: rand(70, 130), h: 0, y: GROUND_Y });
  }
  function spawnMeteor() {
    for (var attempt = 0; attempt < 6; attempt++) {
      var tx = DINO_X + rand(280, logicalW() + 280);
      var clash = false;
      for (var i = 0; i < R.obs.length; i++) {
        var o = R.obs[i];
        if (o.type !== 'bird' && Math.abs(o.x - tx) < 170) { clash = true; break; }
      }
      if (!clash) { R.meteors.push({ type: 'warn', tx: tx, t: 0.8 }); return; }
    }
    R.meteorT = 4;   // 落点附近都有障碍，稍后重试
  }
  function spawnCoins() {
    /* 整体节奏恒定（每 30~50 米一组），组内枚数随距离递增；找清晰位置放置，找不到就跳过、不缩短间隔 */
    for (var attempt = 0; attempt < 4; attempt++) {
      var cx = logicalW() + 40 + attempt * 130;
      var clash = false;
      for (var i = 0; i < R.obs.length; i++) {
        var o = R.obs[i];
        if (o.type !== 'bird' && o.x > cx - 30 && o.x < cx + 190) { clash = true; break; }
      }
      if (!clash) {
        var n = coinCountFor(R.meters);
        for (var j = 0; j < n; j++) {
          R.coins.push({ x: cx + j * 26, y: GROUND_Y - 78, r: 12, phase: rand(0, 6) });
        }
        return;
      }
    }
  }
  /* 后期金币逐渐增多（按米数档位） */
  function coinCountFor(m, r) {
    r = (r === undefined) ? Math.random() : r;
    if (m < 1000) return 1 + Math.floor(r * 3);      // 1~3
    if (m < 3000) return 2 + Math.floor(r * 3);      // 2~4
    if (m < 10000) return 3 + Math.floor(r * 3);     // 3~5
    return 4 + Math.floor(r * 3);                    // 4~6
  }

  function moveObstacles(dt) {
    var speed = R.speed;
    for (var i = R.obs.length - 1; i >= 0; i--) {
      var o = R.obs[i];
      o.x -= speed * dt;
      if (o.type === 'bird') {
        o.flap += dt * 12;
        o.x -= BIRD_SPEED * dt;              // 对侧飞来（相对地面也在飞行）
        o.y = o.baseY + Math.sin(o.flap * 2) * 5;   // 上下起伏更显动态
        if (o.x < DINO_X - 180) R.obs.splice(i, 1);
      } else if (o.x + o.w < -80) R.obs.splice(i, 1);
    }
  }
  function updateMeteors(dt) {
    var speed = R.speed;
    for (var i = R.meteors.length - 1; i >= 0; i--) {
      var m = R.meteors[i];
      m.tx -= speed * dt;                       // 落点随世界滚动
      if (m.type === 'warn') {
        m.t -= dt;
        if (m.t <= 0) { m.type = 'fall'; m.x = m.tx; m.y = -40; m.vy = 0; }
      } else if (m.type === 'fall') {
        m.vy += 2600 * dt;
        m.y += m.vy * dt;
        m.x = m.tx + Math.sin(m.y * 0.05) * 6;
        if (m.y >= GROUND_Y) {
          // 落地瞬间判定：贴近地面且处于落点范围才命中；空中跳过则安全
          var dB = dinoBottomY();
          if (dB > GROUND_Y - 45 && Math.abs(m.x - (DINO_X + DINO_W / 2)) < DINO_W / 2 + 22) hitDino();
          R.obs.push({ type: 'crater', x: m.tx - 22, w: 46, h: 26, y: GROUND_Y });
          explodeFx(m.x, GROUND_Y, 16);
          sfx('roar');
          R.meteors.splice(i, 1);
        }
      }
    }
  }
  function updateCoins(dt) {
    var speed = R.speed;
    var magnet = ownsSkill('magnet') ? MAGNET_R : 0;
    var cx = DINO_X + DINO_W / 2, cy = dinoCenterY();
    for (var i = R.coins.length - 1; i >= 0; i--) {
      var c = R.coins[i];
      c.phase += dt * 6;
      var dx = cx - c.x, dy = cy - c.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (magnet > 0 && dist < magnet && dist > 1) {
        /* 磁吸：朝恐龙高速移动（克服世界滚动），保证自动拾取 */
        var pull = Math.max(640, speed * 1.8);
        c.x += dx / dist * pull * dt;
        c.y += dy / dist * pull * dt;
      } else {
        c.x -= speed * dt;
      }
      if (c.x < -30 || c.y > GROUND_Y + 20) { R.coins.splice(i, 1); continue; }
      if (Math.abs(cx - c.x) < DINO_W / 2 + c.r && Math.abs(cy - c.y) < DINO_H / 2 + c.r) {
        collectCoin(c);
        R.coins.splice(i, 1);
      }
    }
  }
  function collectCoin(c) {
    var doubleActive = R.sk.x2.t > 0;
    var gain = doubleActive ? 2 : 1;   // 双倍得分时金币数量也双倍
    R.runCoins += gain;
    S.coins += gain;
    S.totalCoins += gain;
    var bonus = Math.round(COIN_BONUS * (R.mult * (doubleActive ? 2 : 1)));   // +5/10 分
    R.score += bonus;
    /* 注意：不能 R.coinAcc -= bonus —— 会让拾取金币加快下次生成形成正反馈，后期金币无限连续 */
    floater(c.x, c.y - 16, '+' + bonus, '#e09a1c');
    sfx('coin');
    scheduleSave();
  }
  function updateFx(dt) {
    for (var i = R.parts.length - 1; i >= 0; i--) {
      var p = R.parts[i];
      p.t += dt;
      if (p.t >= p.life) { R.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt;
    }
    for (var j = R.floaters.length - 1; j >= 0; j--) {
      var f = R.floaters[j];
      f.t += dt;
      if (f.t >= f.life) { R.floaters.splice(j, 1); continue; }
      f.y -= 42 * dt;
    }
  }
  function dust(n) {
    n = n || 8;
    for (var i = 0; i < n; i++) {
      R.parts.push({ x: DINO_X + DINO_W / 2 + rand(-8, 8), y: dinoBottomY() - 2,
        vx: rand(-70, 70), vy: rand(-90, -10), r: rand(2, 4), t: 0, life: rand(0.3, 0.5), c: '172,162,140' });
    }
  }
  function explodeFx(x, y, n) {
    for (var i = 0; i < n; i++) {
      R.parts.push({ x: x, y: y, vx: rand(-180, 180), vy: rand(-260, -40), r: rand(3, 7), t: 0, life: rand(0.3, 0.6), c: '150,140,120' });
    }
  }
  function floater(x, y, txt, color) {
    R.floaters.push({ x: x, y: y, txt: txt, color: color || '#fff', t: 0, life: 0.9 });
  }
  function shake() { R.shake = 0.25; }

  /* ================= 碰撞 ================= */
  function checkCollisions() {
    if (R.inv > 0) return;
    var dleft = DINO_X + 4, dtop = dinoBottomY() - DINO_H + 6, dw = DINO_W - 8, dh = DINO_H - 10;
    for (var i = 0; i < R.obs.length; i++) {
      var o = R.obs[i], ox, oy, ow, oh;
      if (o.type === 'crevice') {
        /* 地面裂缝：飞行无视；否则只有贴地落入才命中（跳起越过则安全） */
        if (R.sk.fly.t > 0) continue;
        if (dinoBottomY() >= GROUND_Y - 1 && dleft + dw > o.x + 6 && dleft < o.x + o.w - 6) {
          hitDino(); return;
        }
        continue;
      }
      if (o.type === 'bird') {
        ox = o.x + 6; oy = o.y + 4; ow = o.w - 12; oh = o.h - 8;
        if (dleft + dw > ox && dleft < ox + ow && dtop < oy + oh && dtop + dh * 0.5 > oy) {
          collideObstacle(i); return;
        }
      } else {
        if (R.sk.fly.t > 0) continue;   // 飞行无视地面障碍（仙人掌/陨石坑）
        ox = o.x + 5; oy = o.y - o.h + 5; ow = o.w - 10; oh = o.h - 10;
        if (dleft + dw > ox && dleft < ox + ow && dtop + dh > oy && dtop < oy + oh) {
          collideObstacle(i); return;
        }
      }
    }
  }
  function collideObstacle(i) {
    if (R.sk.dash.t > 0) {
      var o = R.obs[i];
      explodeFx(o.x + o.w / 2, o.y - o.h / 2, 10);
      R.obs.splice(i, 1);
      R.score += 20;
      sfx('hit');
      return;
    }
    if (R.sk.shield.t > 0 || R.inv > 0) return;
    hitDino();
  }
  /* 冲刺触发瞬间摧毁正与恐龙重叠的障碍（否则速度提升会让障碍一帧冲过头、错过碰撞判定） */
  function smashOverlapping() {
    var dl = DINO_X, dr = DINO_X + DINO_W, db = dinoBottomY(), dt = db - DINO_H;
    for (var i = R.obs.length - 1; i >= 0; i--) {
      var o = R.obs[i];
      if (o.type === 'crevice') continue;
      var ot = o.type === 'bird' ? o.y : o.y - o.h;
      var ob = o.y;
      if (o.x < dr && o.x + o.w > dl && ot < db && ob > dt) {
        explodeFx(o.x + o.w / 2, o.type === 'bird' ? o.y + o.h / 2 : o.y - o.h / 2, 8);
        R.obs.splice(i, 1);
        R.score += 20;
      }
    }
  }
  /* 遇到威胁自动触发保命：护盾 -> 冲刺(自带无敌) -> 怒吼；飞行不自动（对鸟无效） */
  function autoSkill() {
    if (ownsSkill('shield') && R.sk.shield.cd <= 0) { useSkill('shield'); return true; }
    if (ownsSkill('dash') && R.sk.dash.cd <= 0) { useSkill('dash'); return true; }
    if (ownsSkill('roar') && R.sk.roar.cd <= 0) { useSkill('roar'); return true; }
    return false;
  }
  function hitDino() {
    if (R.inv > 0 || R.sk.shield.t > 0 || R.sk.dash.t > 0) return;
    if (autoSkill()) return;   // 自动触发技能挡下这次伤害
    if (R.lives > 1) {
      R.lives--;
      /* 基础 0.5s 受击无敌防连撞掉光；重生守护延长到 3s */
      R.inv = ownsSkill('revive') ? REVIVE_INV : INVULN;
      sfx('hit');
      shake();
      floater(DINO_X + DINO_W / 2, dinoBottomY() - 66, '💔', '#e05a4e');
      return;
    }
    gameOver(true);
  }

  /* ================= 技能 ================= */
  /* 数字键 1/2/3/4/5 → 按拥有顺序触发第 N 个主动技能 */
  function useSkillByNumber(n) {
    var cnt = 0;
    for (var i = 0; i < SKILL_ORDER.length; i++) {
      if (ownsSkill(SKILL_ORDER[i])) {
        cnt++;
        if (cnt === n) { useSkill(SKILL_ORDER[i]); return; }
      }
    }
  }
  function useSkill(key) {
    if (!ownsSkill(key) || !R || R.state !== 'running') return;
    var st = R.sk[key];
    if (st.cd > 0) return;
    st.cd = SKILL_CD;
    var cx = DINO_X + DINO_W / 2, cy = dinoBottomY() - 70;
    if (key === 'shield') { st.t = SHIELD_DUR; sfx('shield'); floater(cx, cy, '🛡️ 无敌', '#5c9cff'); }
    else if (key === 'dash') { st.t = DASH_DUR; sfx('dash'); floater(cx, cy, '💨 冲刺', '#ff9a3c'); smashOverlapping(); }
    else if (key === 'roar') { clearObstacles(); R.noSpawnT = ROAR_NO_SPAWN; sfx('roar'); shake(); floater(logicalW() / 2, 150, '吼！！', '#ff6b5a'); }
    else if (key === 'x2') { st.t = X2_DUR; sfx('x2'); floater(cx, cy, '⚡ 得分×2', '#e0c23c'); }
    else if (key === 'fly') { st.t = FLY_DUR; sfx('fly'); floater(cx, cy, '🦅 飞行', '#8ec7ff'); }
    updateHUD();
  }
  function clearObstacles() {
    for (var i = 0; i < R.obs.length; i++) {
      var o = R.obs[i];
      explodeFx(o.x + o.w / 2, o.type === 'bird' ? o.y + o.h / 2 : o.y - o.h / 2, 8);
    }
    for (var j = 0; j < R.meteors.length; j++) {
      var m = R.meteors[j];
      if (m.type === 'fall') explodeFx(m.x, m.y, 8);
    }
    R.obs = [];
    R.meteors = [];
  }
  function doJump() {
    var d = R.dino;
    var maxJumps = 1 + (ownsSkill('dj') ? 1 : 0) + (ownsSkill('tj') ? 1 : 0);
    if (d.grounded) {
      d.grounded = false;
      d.vy = -JUMP_V;
      d.jumps = 1;
      dust();
      sfx('jump');
    } else if (d.jumps < maxJumps) {
      d.jumps++;
      d.vy = -DJUMP_V;
      dust();
      floater(DINO_X + DINO_W / 2, dinoBottomY() - 70, '↗', '#8ad36a');
      sfx('jump2');
    }
  }

  /* ================= 结束 ================= */
  function gameOver(death) {
    if (!R || R.state === 'over') return;
    R.state = 'over';
    R.newRecord = Math.floor(R.score) > S.hi;
    if (R.score > S.hi) S.hi = Math.floor(R.score);
    if (R.meters > S.maxMeters) S.maxMeters = R.meters;
    S.gm = false;   // GM 账号仅持续一局，结算后回归正常
    if (death) sfx('over');
    addLocalScores();
    writeBoth();
    submitBoards(true);
    showOver();
    renderHome();
  }
  function endRun() { if (R && R.state === 'paused') gameOver(false); }
  function showOver() {
    $('over-title').textContent = R.lives > 0 ? '本局结束' : '游戏结束';
    $('over-score').textContent = fmtNum(R.score);
    $('over-meters').textContent = fmtNum(R.meters) + 'm';
    $('over-coins').innerHTML = '+' + R.runCoins + ' <i class="coin"></i>';
    $('over-hi').textContent = fmtNum(S.hi);
    $('over-new').hidden = !R.newRecord;
    $('over-overlay').hidden = false;
  }
  function pauseGame() {
    if (!R || R.state !== 'running') return;
    R.state = 'paused';
    $('pause-score').textContent = fmtNum(R.score);
    $('pause-overlay').hidden = false;
  }
  function resumeGame() {
    if (!R || R.state !== 'paused') return;
    R.state = 'running';
    $('pause-overlay').hidden = true;
  }
  function togglePause() {
    if (!R || R.state === 'count' || R.state === 'over') return;
    if (R.state === 'running') pauseGame(); else resumeGame();
  }

  /* ================= 绘制 ================= */
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function draw() {
    if (!ctx) return;
    var w = cssW(), h = cssH();
    var s = Math.min(w / LOGICAL_W, h / WORLD_H);      // contain 等比缩放
    var ox = (w - LOGICAL_W * s) / 2, oy = (h - WORLD_H * s) / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    if (R && R.shake > 0) ctx.translate(rand(-5, 5), rand(-5, 5));
    drawSky();
    drawClouds();
    drawGround();
    if (R) {
      drawMeteors();
      drawCoins();
      drawObstacles();
      drawParticles();
      drawDino();
      drawFloaters();
    } else {
      drawDinoShape(DINO_X, DINO_W, DINO_H, GROUND_Y, 0, true, 1);
    }
  }
  function drawSky() {
    var g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    g.addColorStop(0, '#bcdcf5'); g.addColorStop(0.6, '#e6f1fb'); g.addColorStop(1, '#f6f6f2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, logicalW(), WORLD_H);
    ctx.fillStyle = 'rgba(255,222,120,0.92)';
    ctx.beginPath(); ctx.arc(logicalW() - 80, 58, 34, 0, 6.283); ctx.fill();
  }
  function drawClouds() {
    if (!R) return;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (var i = 0; i < R.clouds.length; i++) {
      var c = R.clouds[i];
      var cx = c.x, cy = c.y;
      ctx.beginPath();
      ctx.arc(cx, cy, 16 * c.s, 0, 6.283);
      ctx.arc(cx + 18 * c.s, cy + 4 * c.s, 13 * c.s, 0, 6.283);
      ctx.arc(cx - 18 * c.s, cy + 4 * c.s, 13 * c.s, 0, 6.283);
      ctx.fill();
    }
  }
  function drawGround() {
    var lw = logicalW();
    ctx.fillStyle = '#e2dbc8';
    ctx.fillRect(0, GROUND_Y, lw, WORLD_H - GROUND_Y);
    ctx.fillStyle = '#bcb39c';
    ctx.fillRect(0, GROUND_Y, lw, 3);
    ctx.fillStyle = '#d3cbb6';
    var dist = R ? R.dist : 0;
    var off = (-dist) % 90; if (off > 0) off -= 90;
    for (var x = off; x < lw + 90; x += 90) {
      ctx.beginPath(); ctx.moveTo(x + 10, GROUND_Y + 3); ctx.lineTo(x + 22, GROUND_Y + 16); ctx.lineTo(x + 12, GROUND_Y + 19); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 46, GROUND_Y + 3); ctx.lineTo(x + 58, GROUND_Y + 12); ctx.lineTo(x + 50, GROUND_Y + 15); ctx.closePath(); ctx.fill();
    }
  }
  function drawObstacles() {
    for (var i = 0; i < R.obs.length; i++) {
      var o = R.obs[i];
      if (o.type === 'cactus') drawCactus(o);
      else if (o.type === 'bird') drawBird(o);
      else if (o.type === 'crevice') drawCrevice(o);
      else drawCrater(o);
    }
  }
  function drawCactus(o) {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, GROUND_Y, o.w / 2 + 6, 4, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#4c9a3f';
    var x = o.x, w = o.w, y = o.y, h = o.h;
    if (o.variant === 'cluster' || o.variant === 'double') {
      var two = o.variant === 'double';
      var h2 = two ? h * 0.82 : h * 0.75;
      ctx.fillRect(x, y - h, 16, h);
      ctx.fillRect(x + 26, y - h2, 14, h2);
      if (!two) ctx.fillRect(x + 42, y - h * 0.9, 14, h * 0.9);
      ctx.beginPath(); ctx.arc(x + 8, y - h, 8, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 33, y - h2, 7, 0, 6.283); ctx.fill();
      if (!two) { ctx.beginPath(); ctx.arc(x + 49, y - h * 0.9, 7, 0, 6.283); ctx.fill(); }
    } else {
      var bw = w * 0.5;
      ctx.fillRect(x + w / 2 - bw / 2, y - h, bw, h);
      ctx.beginPath(); ctx.arc(x + w / 2, y - h + bw / 2, bw / 2, Math.PI, 0); ctx.fill();
      var ay = y - h * 0.55;
      ctx.fillRect(x + w / 2 - bw / 2 - 9, ay, 9, 5);
      ctx.fillRect(x + w / 2 + bw / 2, ay - 6, 9, 5);
      ctx.beginPath(); ctx.arc(x + w / 2 - bw / 2 - 9, ay + 2, 3, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(x + w / 2 + bw / 2 + 9, ay - 4, 3, 0, 6.283); ctx.fill();
    }
  }
  function drawBird(o) {
    var flap = Math.sin(o.flap * 3);
    var cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    ctx.fillStyle = '#5a5f66';
    ctx.beginPath(); ctx.ellipse(cx, cy, 15, 7, 0, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 13, cy - 3); ctx.lineTo(cx + 25, cy); ctx.lineTo(cx + 13, cy + 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.arc(cx + 12, cy - 2, 3, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#5a5f66';
    var w1 = cy - 6 + flap * 10, w2 = cy - 6 - flap * 10;
    ctx.beginPath(); ctx.moveTo(cx - 4, cy - 3); ctx.lineTo(cx - 24, w1 - 14); ctx.lineTo(cx - 10, cy); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 4, cy + 3); ctx.lineTo(cx - 24, w2 + 14); ctx.lineTo(cx - 10, cy); ctx.closePath(); ctx.fill();
  }
  function drawCrater(o) {
    ctx.fillStyle = '#9b9382';
    ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, GROUND_Y - 4, o.w / 2, 13, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#6f6859';
    ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, GROUND_Y - 7, o.w / 2 - 7, 8, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = 'rgba(120,120,120,0.5)';
    ctx.beginPath(); ctx.arc(o.x + o.w / 2 - 6, GROUND_Y - 18, 4, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(o.x + o.w / 2 + 8, GROUND_Y - 24, 3, 0, 6.283); ctx.fill();
  }
  function drawCrevice(o) {
    var gx = o.x, gw = o.w;
    ctx.fillStyle = '#3f3a30';
    ctx.beginPath();
    ctx.moveTo(gx, GROUND_Y);
    ctx.lineTo(gx + gw * 0.25, GROUND_Y + 34);
    ctx.lineTo(gx + gw * 0.75, GROUND_Y + 34);
    ctx.lineTo(gx + gw, GROUND_Y);
    ctx.lineTo(gx + gw - 2, GROUND_Y + 4);
    ctx.lineTo(gx + 2, GROUND_Y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8a8272';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx, GROUND_Y); ctx.lineTo(gx + 6, GROUND_Y + 10); ctx.lineTo(gx + 12, GROUND_Y);
    ctx.moveTo(gx + gw, GROUND_Y); ctx.lineTo(gx + gw - 6, GROUND_Y + 10); ctx.lineTo(gx + gw - 12, GROUND_Y);
    ctx.stroke();
  }
  function drawMeteors() {
    for (var i = 0; i < R.meteors.length; i++) {
      var m = R.meteors[i];
      if (m.type === 'warn') {
        var pulse = 0.5 + 0.5 * Math.sin(R.time * 12);
        ctx.strokeStyle = 'rgba(255,80,60,' + (0.5 + pulse * 0.5) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(m.tx, GROUND_Y, 26 + pulse * 6, 6, 0, 0, 6.283); ctx.stroke();
        ctx.fillStyle = 'rgba(255,80,60,0.9)';
        ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('!', m.tx, GROUND_Y - 16);
        ctx.textAlign = 'left';
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath(); ctx.ellipse(m.tx, GROUND_Y, 22, 5, 0, 0, 6.283); ctx.fill();
        var trail = ctx.createLinearGradient(0, m.y, 0, m.y + 46);
        trail.addColorStop(0, 'rgba(255,150,60,0.5)');
        trail.addColorStop(1, 'rgba(255,60,40,0)');
        ctx.fillStyle = trail;
        ctx.beginPath(); ctx.moveTo(m.x - 6, m.y); ctx.lineTo(m.x, m.y - 34); ctx.lineTo(m.x + 6, m.y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#7a6f5c';
        ctx.beginPath(); ctx.arc(m.x, m.y, 11, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#9a8f7a';
        ctx.beginPath(); ctx.arc(m.x - 3, m.y - 2, 5, 0, 6.283); ctx.fill();
      }
    }
  }
  function drawCoins() {
    for (var i = 0; i < R.coins.length; i++) {
      var c = R.coins[i];
      var sx = Math.max(0.25, Math.abs(Math.sin(c.phase)));
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(sx, 1);
      ctx.fillStyle = '#f6b73c';
      ctx.beginPath(); ctx.arc(0, 0, c.r, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#fbd97a';
      ctx.beginPath(); ctx.arc(0, 0, c.r * 0.62, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#d99a1e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, c.r - 1, 0, 6.283); ctx.stroke();
      ctx.restore();
    }
  }
  function drawParticles() {
    for (var i = 0; i < R.parts.length; i++) {
      var p = R.parts[i];
      ctx.fillStyle = 'rgba(' + p.c + ',' + (1 - p.t / p.life) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
    }
  }
  function drawDino() {
    var d = R.dino;
    var flashing = R.inv > 0 && Math.floor(R.time * 18) % 2 === 0;
    var alpha = flashing ? 0.45 : (R.sk.fly.t > 0 ? 0.82 : 1);
    drawDinoShape(DINO_X, DINO_W, DINO_H, dinoBottomY(), d.runPhase, d.grounded, alpha);
    var cx = DINO_X + DINO_W / 2, cy = dinoBottomY() - DINO_H / 2;
    if (R.sk.fly.t > 0) {
      ctx.fillStyle = 'rgba(142,199,255,0.16)';
      ctx.beginPath(); ctx.ellipse(cx, cy, DINO_W * 0.95, DINO_H * 0.8, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = 'rgba(142,199,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(cx, cy, DINO_W * 0.95, DINO_H * 0.8, 0, 0, 6.283); ctx.stroke();
    }
    if (R.sk.shield.t > 0 || R.inv > 0) {
      ctx.strokeStyle = 'rgba(64,156,255,0.85)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy, DINO_H * 0.78, 0, 6.283); ctx.stroke();
      ctx.fillStyle = 'rgba(64,156,255,0.10)';
      ctx.beginPath(); ctx.arc(cx, cy, DINO_H * 0.78, 0, 6.283); ctx.fill();
    }
    if (R.sk.dash.t > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (var i = 0; i < 5; i++) {
        var ly = cy - DINO_H * 0.25 + Math.sin(R.time * 22 + i * 1.3) * DINO_H * 0.3;
        ctx.fillRect(DINO_X - 20 - i * 12, ly, 7, 2.5);
      }
    }
  }
  function drawDinoShape(x, w, h, bottom, runPhase, grounded, alpha) {
    var top = bottom - h;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.beginPath(); ctx.ellipse(x + w / 2, GROUND_Y + 2, w * 0.5, 5, 0, 0, 6.283); ctx.fill();
    var body = validColor(S.color) || DEFAULT_COLOR, dark = shadeColor(body, -25);
    ctx.fillStyle = dark;
    if (grounded) {
      var ph = Math.sin(runPhase) * 6;
      ctx.fillRect(x + w * 0.16, bottom - 13, 9, 13 + Math.max(0, ph));
      ctx.fillRect(x + w * 0.6, bottom - 13, 9, 13 + Math.max(0, -ph));
    } else {
      ctx.fillRect(x + w * 0.14, bottom - 10, 9, 10);
      ctx.fillRect(x + w * 0.6, bottom - 10, 9, 10);
    }
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(x - 2, top + h * 0.55); ctx.lineTo(x - 17, top + h * 0.44); ctx.lineTo(x - 2, top + h * 0.72); ctx.closePath(); ctx.fill();
    rr(ctx, x, top + 6, w * 0.72, h - 6, 10); ctx.fill();
    var hx = x + w * 0.68, hy = top - 2, hw = w * 0.36, hh = h * 0.5;
    rr(ctx, hx, hy, hw, hh, 10); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hx + hw - 2, hy + hh - 7); ctx.lineTo(hx + 6, hy + hh - 7); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(hx + hw * 0.45, hy + hh * 0.42, 5.5, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(hx + hw * 0.45 + 1.6, hy + hh * 0.42, 2.6, 0, 6.283); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + w * 0.5, top + h * 0.5); ctx.lineTo(x + w * 0.62, top + h * 0.62); ctx.stroke();
    ctx.restore();
  }
  function drawFloaters() {
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px sans-serif';
    for (var i = 0; i < R.floaters.length; i++) {
      var f = R.floaters[i];
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillText(f.txt, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.txt, f.x, f.y);
    }
    ctx.textAlign = 'left';
  }

  /* ================= HUD / 技能栏 ================= */
  function updateHUD() {
    if (!R) return;
    $('hud-score').textContent = fmtNum(R.score);
    $('hud-meters').textContent = fmtNum(R.meters) + 'm';
    $('hud-coins').innerHTML = '<i class="coin"></i> ' + fmtNum(R.runCoins);   // 局内只显示本局获得
    $('hud-lives').textContent = '❤️ ×' + R.lives;
    var ph = '';
    if (ownsSkill('tj')) ph += '<span class="psv" title="三连跳">🦘×3</span>';
    else if (ownsSkill('dj')) ph += '<span class="psv" title="二连跳">🦘×2</span>';
    if (ownsSkill('magnet')) ph += '<span class="psv" title="吸铁石">🧲</span>';
    if (ownsSkill('revive')) ph += '<span class="psv" title="重生守护">💖</span>';
    $('hud-passives').innerHTML = ph;
    var mult = R.mult * (R.sk.x2.t > 0 ? 2 : 1);
    if (mult > 1) { $('hud-mult').hidden = false; $('hud-mult').textContent = '×' + mult; }
    else $('hud-mult').hidden = true;
  }
  function skillBtnHTML(k, idx) {
    var s = SKILL_DEF[k];
    return '<button class="skill-btn" data-k="' + k + '">' +
      '<span class="sk-num">' + idx + '</span>' +
      '<span class="sk-icon">' + s.icon + '</span>' +
      '<span class="sk-name">' + s.name + '</span>' +
      '<span class="cd-badge" hidden></span></button>';
  }
  function renderSkillbar() {
    var html = '', n = 1;
    for (var i = 0; i < SKILL_ORDER.length; i++) {
      var k = SKILL_ORDER[i];
      if (ownsSkill(k)) html += skillBtnHTML(k, n++);
    }
    $('skill-row').innerHTML = html;
    var btns = document.querySelectorAll('#skill-row .skill-btn');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('pointerdown', function (e) {
        e.stopPropagation(); e.preventDefault();
        useSkill(this.getAttribute('data-k'));
      });
    }
    updateSkillbar();
  }
  function updateSkillbar() {
    var btns = document.querySelectorAll('#skill-row .skill-btn');
    for (var j = 0; j < btns.length; j++) {
      var k = btns[j].getAttribute('data-k');
      var st = R ? R.sk[k] : null;
      var usable = !!st && R.state === 'running';
      var cd = st ? Math.ceil(st.cd) : 0;
      var act = st ? st.t > 0 : false;
      btns[j].classList.toggle('ready', usable && cd <= 0);
      btns[j].classList.toggle('active', act);
      btns[j].classList.toggle('cooling', cd > 0);
      var badge = btns[j].querySelector('.cd-badge');
      if (cd > 0) { badge.hidden = false; badge.textContent = cd + 's'; }
      else badge.hidden = true;
    }
  }

  /* ================= UI 页面 ================= */
  function showView(name) {
    ['home', 'game', 'shop', 'rank', 'help', 'settings'].forEach(function (v) {
      var el = $('view-' + v);
      if (el) el.hidden = (v !== name);
    });
    if (name === 'game') requestAnimationFrame(resize);
  }
  function renderHome() {
    $('home-coins').innerHTML = '<i class="coin"></i> ' + fmtNum(S.coins);
    $('home-total').innerHTML = '<i class="coin"></i> ' + fmtNum(S.totalCoins);
    $('home-hi').textContent = fmtNum(S.hi);
  }
  /* ================= 恐龙颜色设置 ================= */
  function renderColorSettings() {
    var hex = validColor(S.color) || DEFAULT_COLOR;
    $('color-preview').style.background = hex;
    $('color-hex').textContent = hex;
    $('color-input').value = hex;
    var html = '';
    for (var i = 0; i < PRESET_COLORS.length; i++) {
      var c = PRESET_COLORS[i];
      html += '<span class="color-swatch' + (c === hex ? ' active' : '') + '" data-c="' + c +
        '" style="background:' + c + '"></span>';
    }
    $('color-presets').innerHTML = html;
    var swatches = document.querySelectorAll('#color-presets .color-swatch');
    for (var j = 0; j < swatches.length; j++) {
      swatches[j].addEventListener('click', function () { selectColor(this.getAttribute('data-c')); });
    }
  }
  function selectColor(hex) {
    if (!validColor(hex)) return;
    S.color = hex;
    save();
    renderColorSettings();
  }

  /* ================= GM 账号彩蛋（点击首页小恐龙 7 次） ================= */
  var toastTimer = null;
  function showToast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    t.style.opacity = 1;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.style.opacity = 0;
      setTimeout(function () { t.hidden = true; }, 400);
    }, 2600);
  }
  var gmClicks = 0, gmLast = 0;
  function onHomeIconClick() {
    var now = Date.now();
    if (now - gmLast > 1200) gmClicks = 0;   // 间隔超过 1.2s 视为重新计数
    gmLast = now;
    gmClicks++;
    if (gmClicks >= 7) {
      gmClicks = 0;
      S.gm = true;
      save();
      writeBoth();
      showToast('🎮 你已解锁 GM 账号！下局游戏全部技能暂时可用（仅一局）');
      sfx('buy');
    }
  }
  function renderShop() {
    $('shop-coins').innerHTML = '<i class="coin"></i> ' + fmtNum(S.coins);
    var html = '';
    for (var i = 0; i < SHOP.length; i++) {
      var it = SHOP[i];
      var owned = !!S.owns[it.key];
      var afford = S.coins >= it.price;
      html += '<div class="shop-row">' +
        '<span class="shop-icon">' + it.icon + '</span>' +
        '<div class="shop-info"><div class="shop-name">' + it.name + '</div><div class="shop-desc">' + it.desc + '</div></div>' +
        '<button class="shop-buy' + (owned ? ' owned' : '') + '" data-k="' + it.key + '"' +
        (owned || !afford ? ' disabled' : '') + '>' +
        (owned ? '已拥有' : '<i class="coin"></i> ' + fmtNum(it.price)) + '</button></div>';
    }
    $('shop-list').innerHTML = html;
    var btns = document.querySelectorAll('#shop-list .shop-buy:not([disabled])');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', function () { buy(this.getAttribute('data-k')); });
    }
  }
  function buy(key) {
    var it = null;
    for (var i = 0; i < SHOP.length; i++) if (SHOP[i].key === key) it = SHOP[i];
    if (!it || S.owns[key] || S.coins < it.price) return;
    S.coins -= it.price;
    S.owns[key] = true;
    sfx('buy');
    save();
    writeBoth();
    submitBoards(true);
    renderShop();
    renderHome();
    renderSkillbar();
  }

  /* ================= 排行榜 ================= */
  var rk = { src: 'local', board: 1, period: 'all' };
  function periodName(p) { return p === 'all' ? '总榜' : p === 'month' ? '月榜' : p === 'week' ? '周榜' : '日榜'; }
  function switchSrc(src) {
    rk.src = src;
    var tabs = document.querySelectorAll('#rank-src .tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-src') === src);
    $('rank-period').hidden = (src !== 'bili');
    loadRank();
  }
  function switchBoard(b) {
    rk.board = b;
    var tabs = document.querySelectorAll('#rank-board .tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', Number(tabs[i].getAttribute('data-board')) === b);
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
    var list = rk.board === 1 ? (lb.hi || []) : rk.board === 2 ? (lb.coins || []) : (lb.dist || []);
    $('rank-note').textContent = '总榜 · ' + (rk.board === 1 ? '最高分' : rk.board === 2 ? '累计金币' : '最远距离') + '（本机前 100）';
    if (!list.length) { $('rank-body').innerHTML = '<div class="lb-tip">暂无成绩，去跑一局吧</div>'; return; }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      html += '<div class="lb-row">' +
        '<span class="lb-rank' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</span>' +
        '<span class="lb-user"><span class="lb-avatar">🦖</span><span class="lb-name">我</span></span>' +
        '<span class="lb-score">' + fmtNum(list[i].s) + '</span></div>';
    }
    $('rank-body').innerHTML = html;
  }
  function loadBiliRank() {
    if (!sdkReady()) {
      $('rank-note').textContent = '请在 B站 App 内打开以查看 B站榜';
      $('rank-body').innerHTML = '<div class="lb-tip">当前环境不支持加载 B站 排行榜</div>';
      return;
    }
    $('rank-note').textContent = periodName(rk.period) + ' · ' + (rk.board === 1 ? '最高分' : rk.board === 2 ? '累计金币' : '最远距离') + '（历史最高）';
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
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var txt = fmtNum(decodeScore(it.score)) + (rk.board === 3 ? 'm' : '');
      html += '<div class="lb-row">' +
        '<span class="lb-rank' + (it.rank <= 3 ? ' top' : '') + '">' + it.rank + '</span>' +
        '<span class="lb-user"><img class="lb-avatar" src="' + esc(it.avatar) + '" alt="" onerror="this.style.visibility=\'hidden\'"><span class="lb-name">' + esc(it.nickname) + '</span></span>' +
        '<span class="lb-score">' + txt + '</span></div>';
    }
    $('rank-body').innerHTML = html;
  }

  /* ================= 输入 ================= */
  function bindInput() {
    var wrap = $('game-wrap');
    var jump = function (e) { e.preventDefault(); onJump(); };
    if ('PointerEvent' in window) wrap.addEventListener('pointerdown', jump);
    else {
      wrap.addEventListener('touchstart', jump, { passive: false });
      wrap.addEventListener('mousedown', jump);
    }
    window.addEventListener('keydown', function (e) {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); onJump(); }
      else if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); togglePause(); }
      else if (/^(Digit|Numpad)[1-5]$/.test(e.code)) {
        e.preventDefault();
        useSkillByNumber(parseInt(e.code.match(/\d+/)[0], 10));
      }
    });
  }
  function onJump() {
    if (!R) return;
    if (R.state === 'running') doJump();
  }

  /* ================= 绑定 UI ================= */
  function bindUI() {
    $('btn-start').addEventListener('click', function () { ensureAudio(); showView('game'); startRun(); });
    $('btn-shop').addEventListener('click', function () { renderShop(); showView('shop'); });
    $('btn-rank').addEventListener('click', function () { loadRank(); showView('rank'); });
    $('btn-help').addEventListener('click', function () { showView('help'); });
    $('home-icon').addEventListener('click', onHomeIconClick);
    $('btn-settings').addEventListener('click', function () { renderColorSettings(); showView('settings'); });
    $('btn-back-shop').addEventListener('click', function () { showView('home'); });
    $('btn-back-rank').addEventListener('click', function () { showView('home'); });
    $('btn-back-help').addEventListener('click', function () { showView('home'); });
    $('btn-back-settings').addEventListener('click', function () { showView('home'); });
    $('color-input').addEventListener('input', function () { selectColor(this.value); });
    $('btn-color-reset').addEventListener('click', function () { selectColor(DEFAULT_COLOR); });
    $('btn-pause').addEventListener('click', function () { pauseGame(); });
    $('btn-resume').addEventListener('click', function () { resumeGame(); });
    $('btn-endrun').addEventListener('click', function () { endRun(); });
    $('btn-again').addEventListener('click', function () { startRun(); });
    $('btn-home').addEventListener('click', function () { showView('home'); renderHome(); });
    $('btn-shop2').addEventListener('click', function () { renderShop(); showView('shop'); });
    $('btn-mute-home').addEventListener('click', toggleMute);
    $('btn-mute-game').addEventListener('click', toggleMute);

    $('rank-src').addEventListener('click', function (e) {
      var t = e.target.closest('.tab'); if (!t) return;
      switchSrc(t.getAttribute('data-src'));
    });
    $('rank-board').addEventListener('click', function (e) {
      var t = e.target.closest('.tab'); if (!t) return;
      switchBoard(Number(t.getAttribute('data-board')));
    });
    $('rank-period').addEventListener('click', function (e) {
      var t = e.target.closest('.ptab'); if (!t) return;
      switchPeriod(t.getAttribute('data-p'));
    });
  }

  /* ================= 主循环 ================= */
  var last = 0, hudAcc = 0;
  function frame(ts) {
    var now = ts / 1000;
    var dt = Math.min((now - (last || now)) || 0, 0.05);
    last = now;
    if (R) {
      var gameVisible = !$('view-game').hidden;
      if (R.state === 'count' && gameVisible) {
        R.countT -= dt;
        if (R.countT > 0.25) $('count-num').textContent = String(Math.ceil(R.countT));
        else if (R.countT > 0) $('count-num').textContent = '跑！';
        else { R.state = 'running'; $('count-overlay').hidden = true; $('touch-hint').hidden = false; }
      } else if (R.state === 'running') {
        update(dt);
      }
    }
    draw();
    hudAcc += dt;
    if (hudAcc >= 0.15) { hudAcc = 0; updateHUD(); updateSkillbar(); }
    requestAnimationFrame(frame);
  }

  /* ================= 初始化 ================= */
  function init() {
    load();
    AudioMgr.muted = S.muted;
    setupCanvas();
    bindInput();
    bindUI();
    renderHome();
    renderSkillbar();
    updateMuteBtn();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (R && R.state === 'running') pauseGame();
        writeBoth();
      }
    });
    window.addEventListener('beforeunload', function () { writeBoth(); submitBoards(false); });
    loadSDK();
    requestAnimationFrame(frame);
  }

  var API = {
    encodeScore: encodeScore, decodeScore: decodeScore, speedAt: speedAt,
    gapFor: gapFor, coinCountFor: coinCountFor, mergeSave: mergeSave, defaultSave: defaultSave,
    fmtNum: fmtNum, clamp: clamp, livesTotal: livesTotal,
    validColor: validColor, shadeColor: shadeColor, DEFAULT_COLOR: DEFAULT_COLOR,
    BASE_SPEED: BASE_SPEED, MAX_SPEED: MAX_SPEED,
    get R() { return R; }, get S() { return S; },
    startRun: startRun, doJump: doJump, useSkill: useSkill, useSkillByNumber: useSkillByNumber,
    buy: buy, tick: frame
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else window.GoogleGame = API;

  if (typeof document !== 'undefined' && document.getElementById) init();
})();
