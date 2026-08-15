/* =========================================================
 * 射箭大师（Archery Master）
 * 横屏射击：调整角度+力度，翻越障碍命中标靶
 * 纯 canvas 绘制 + WebAudio 音效，B站 Toy 平台适配
 * ========================================================= */
(function () {
  'use strict';

  // ---------- 常量 ----------
  var LW = 800, LH = 450;            // 逻辑画布尺寸（横屏）
  var PX = 70, PY = 225;             // 玩家位置（左中）
  var VMAX = 500;                    // 力度 100 的初速度 px/s
  var G = 150;                       // 重力 px/s²（力度 100 为直射，不受重力）
  var CHARGE_HOLD = 1.0;             // 蓄力到 100 后的停顿时长（秒）
  var ARROWS_TOTAL = 7;
  var TARGET_COUNT = 5;
  var ANGLE_MIN = -90, ANGLE_MAX = 90;
  var BOARD_LEVEL = 1, BOARD_STAR = 2;
  var GLOBAL_TOP = 100;
  var SAVE_KEY = 'shoot_save_v1';
  var MUTE_KEY = 'shoot_mute_v1';

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var viewHome = $('view-home'), viewGame = $('view-game');
  var hudEl = $('hud');
  var hudLevel = $('hud-level'), hudStars = $('hud-stars'), hudArrows = $('hud-arrows'),
      hudScore = $('hud-score'), hudTotal = $('hud-total');
  var homeLevel = $('home-level'), homeStars = $('home-stars'), btnStart = $('btn-start');
  var btnMute = $('btn-mute'), btnHome = $('btn-home'), btnHelp = $('btn-help'), helpLeft = $('help-left');
  var angleSlider = $('angle-slider'), angleKnob = $('angle-knob'), angleInput = $('angle-input');
  var btnCharge = $('btn-charge'), btnCancel = $('btn-cancel'), powerVal = $('power-val'), powerFill = $('power-fill');
  var powerBar = $('power-bar'), powerMarker = $('power-marker'), powerTarget = $('power-target');
  var powerMarkerTag = $('power-marker-tag'), powerTargetTag = $('power-target-tag');
  var helpOverlay = $('help-overlay'), helpAngle = $('help-angle'), helpBody = $('help-body');
  var settingsOverlay = $('settings-overlay'), soundToggle = $('btn-sound-toggle');
  var chargeRateInput = $('charge-rate'), chargeRateVal = $('charge-rate-val');
  var resultOverlay = $('result-overlay'), resultTitle = $('result-title'), resultStars = $('result-stars'),
      resultScore = $('result-score'), resultInfo = $('result-info'), btnResultNext = $('btn-result-next');
  var lbModal = $('lb-modal'), lbBoardTabs = $('lb-board-tabs'), lbPeriodTabs = $('lb-period-tabs'),
      lbNote = $('lb-note'), lbBody = $('lb-body');
  var canvas = $('game'), stage = $('stage');
  var ctx = canvas.getContext('2d');

  // ---------- 状态 ----------
  var state = 'menu';                // 'menu' | 'playing' | 'done'
  var save = null;
  var targets = [], obstacles = [], totalValue = 0;
  var arrowsLeft = 0, score = 0, hitFlags = [], helpUsed = false;
  var angle = 0;                     // 度数，-90 ~ +90
  var charging = false, power = 0, overCancel = false, lastTick = 0, chargePhase = 'rising', holdTimer = 0;
  var lastPower = null;              // 上一箭的力度（蓄力条刻度参考）
  var targetPower = null;            // 目标刻度（用户在力度条上拖出来的参考力度）
  var chargeRate = 40;               // 充能速度 /s（可在设置中调节）
  var CHARGE_SPEED_KEY = 'shoot_charge_v1';
  var activeArrows = [], effects = [];
  var muted = false, toyReady = false;
  var lbBoard = 'level', lbPeriod = 'all';
  var scale = 1, offX = 0, offY = 0, dpr = 1;
  var lastTs = 0;

  // ---------- 工具 ----------
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function starStr(n) {
    n = Math.max(0, Math.min(3, n));
    return '★'.repeat(n) + '☆'.repeat(3 - n);
  }
  // 线段与轴对齐矩形相交（Liang-Barsky）
  function segRect(x1, y1, x2, y2, r) {
    var t0 = 0, t1 = 1, dx = x2 - x1, dy = y2 - y1;
    var p = [-dx, dx, -dy, dy];
    var q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
    for (var i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-9) {
        if (q[i] < 0) return false;
      } else {
        var t = q[i] / p[i];
        if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
        else { if (t < t0) return false; if (t < t1) t1 = t; }
      }
    }
    return true;
  }
  function rectsOverlap(a, b, m) {
    return a.x < b.x + b.w + m && a.x + a.w + m > b.x &&
           a.y < b.y + b.h + m && a.y + a.h + m > b.y;
  }
  // 有效重力：90 以下保持满重力；90→100 平滑衰减至 0（抛物线渐变为直箭，不突兀）
  function gravFor(power) {
    if (power >= 100) return 0;
    if (power <= 90) return G;
    return G * Math.pow((100 - power) / 10, 1.5);
  }

  // ---------- 音频 ----------
  var AC = null;
  function audioInit() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
    if (AC && AC.state === 'suspended') { try { AC.resume(); } catch (e) { } }
  }
  function beep(freq, dur, type, vol, when) {
    if (!AC || muted) return;
    var t = AC.currentTime + (when || 0);
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (dur > 0.05) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.6), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(t); o.stop(t + dur);
  }
  function play(name) {
    if (muted) return;
    switch (name) {
      case 'click': beep(520, 0.06, 'square', 0.08); break;
      case 'shoot': beep(340, 0.16, 'sawtooth', 0.14); beep(180, 0.18, 'sawtooth', 0.1, 0.03); break;
      case 'hit': beep(880, 0.09, 'triangle', 0.2); beep(1320, 0.12, 'triangle', 0.16, 0.05); break;
      case 'block': beep(150, 0.14, 'square', 0.16); break;
      case 'charge': beep(440 + power * 3, 0.03, 'sine', 0.05); break;
      case 'win': beep(523, 0.12, 'triangle', 0.18); beep(659, 0.12, 'triangle', 0.16, 0.1); beep(784, 0.2, 'triangle', 0.16, 0.2); break;
      case 'fail': beep(392, 0.15, 'sawtooth', 0.14); beep(330, 0.16, 'sawtooth', 0.13, 0.14); beep(262, 0.28, 'sawtooth', 0.12, 0.3); break;
    }
  }

  // ---------- Toy SDK（异步非阻塞加载） ----------
  function loadSDK() {
    try {
      if (typeof window !== 'undefined' && window.toy && typeof window.toy.getRankList === 'function') {
        toyReady = true; return;
      }
      var s = document.createElement('script');
      s.src = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
      s.async = true;
      s.onload = function () { if (typeof window.toy !== 'undefined' && window.toy) toyReady = true; };
      s.onerror = function () { /* 忽略，排行榜降级为提示 */ };
      document.head.appendChild(s);
    } catch (e) { /* 非浏览器环境忽略 */ }
  }
  function submitGlobal(board, score) {
    if (!toyReady || !window.toy || typeof window.toy.submitScore !== 'function') return;
    try { window.toy.submitScore({ board: board, score: score }).catch(function () { }); }
    catch (e) { }
  }
  function submitScores() {
    submitGlobal(BOARD_LEVEL, save.level);
    submitGlobal(BOARD_STAR, save.stars);
  }

  // ---------- 存档 ----------
  function defaultSave() {
    return { level: 1, stars: 0, playing: false, arrows: ARROWS_TOTAL, score: 0, hit: [false, false, false, false, false], targets: [], obstacles: [], totalValue: 0, helpUsed: false };
  }
  function loadSave() {
    try {
      var s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s.level === 'number' && s.level >= 1) return s;
    } catch (e) { }
    return defaultSave();
  }
  function saveGame() {
    save.arrows = arrowsLeft;
    save.score = score;
    save.hit = hitFlags.slice();
    save.targets = targets;
    save.obstacles = obstacles;
    save.totalValue = totalValue;
    save.helpUsed = helpUsed;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { }
  }
  function loadMute() { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; } }

  // ---------- 视图切换 ----------
  function showView(id) {
    viewHome.classList.toggle('active', id === 'view-home');
    viewGame.classList.toggle('active', id === 'view-game');
  }
  function goHome() {
    if (state === 'playing') saveGame();   // 保留关卡进度，可继续
    state = 'menu';
    charging = false; overCancel = false;
    helpOverlay.hidden = true; resultOverlay.hidden = true; lbModal.hidden = true; settingsOverlay.hidden = true;
    showView('view-home');
    renderHome();
  }
  function renderHome() {
    var hasLevel = save.playing && save.targets && save.targets.length;
    homeLevel.textContent = '第 ' + save.level + ' 关';
    homeStars.textContent = '★ ' + save.stars;
    btnStart.textContent = hasLevel ? '继续游戏' : '开始游戏';
    btnMute.textContent = muted ? '🔇' : '🔊';
  }

  // ---------- 关卡生成 ----------
  function genObstacles(nObs, level) {
    var list = [];
    var tries = 0;
    while (list.length < nObs && tries++ < 220) {
      var w = rand(40, 92), h = rand(16, 34);
      var ob = { x: rand(150, LW - 120 - w), y: rand(80, LH - 90 - h), w: w, h: h };
      var bad = rectsOverlap(ob, { x: PX - 26, y: PY - 30, w: 52, h: 60 }, 6);        // 避开玩家
      bad = bad || rectsOverlap(ob, { x: LW - 30, y: 0, w: 30, h: LH }, 0);            // 避开右侧墙
      bad = bad || rectsOverlap(ob, { x: 0, y: LH - 20, w: LW, h: 20 }, 0);            // 避开底部地面
      for (var i = 0; i < list.length; i++) {
        if (rectsOverlap(ob, list[i], 8)) { bad = true; break; }
      }
      if (!bad) list.push(ob);
    }
    return list;
  }
  // 玩家→标靶 连线是否畅通（可直射）
  function lineClearTo(t, obs) {
    for (var i = 0; i < obs.length; i++) {
      if (segRect(PX, PY, t.x, t.y, obs[i])) return false;
    }
    return true;
  }
  // 给定角度+力度，模拟能否命中该标靶（不撞障碍）
  function simulateHit(t, angleDeg, power, obs, maxT) {
    var a = angleDeg * Math.PI / 180;
    var v0 = power / 100 * VMAX;
    var vx = v0 * Math.cos(a), vy = -v0 * Math.sin(a);
    var x = PX, y = PY, px = x, py = y, el = 0, dt = 1 / 120;
    var tr = t.r, tx = t.x, ty = t.y;
    var g = gravFor(power);
    while (el < (maxT || 8)) {
      vy += g * dt;
      x += vx * dt; y += vy * dt; el += dt;
      for (var i = 0; i < obs.length; i++) {
        if (segRect(px, py, x, y, obs[i])) return false;
      }
      var dx = x - tx, dy = y - ty;
      if (dx * dx + dy * dy <= tr * tr) return true;
      if (y > LH + 60 || x > LW + 40 || x < -40) return false;
      if (y < -520) return false;
      px = x; py = y;
    }
    return false;
  }
  // 标靶是否至少一条路径可达（考虑障碍）
  function targetReachable(t, obs) {
    if (lineClearTo(t, obs)) return true;
    for (var ai = -85; ai <= 85; ai += 5) {
      for (var p = 25; p <= 100; p += 4) {
        if (simulateHit(t, ai, p, obs, 8)) return true;
      }
    }
    return false;
  }
  function placeTargets(obs) {
    // 大小分三类：常规 / 大（+10~20%）/ 小（-10~20%），保证每关至少一个大靶、一个小靶
    var sizes = [1, 1, 1, 1, 1];
    var i1 = randInt(0, TARGET_COUNT - 1), i2;
    do { i2 = randInt(0, TARGET_COUNT - 1); } while (i2 === i1);
    sizes[i1] = 2; sizes[i2] = 3;
    var list = [];
    var tries = 0;
    while (list.length < TARGET_COUNT && tries++ < 320) {
      var cls = sizes[list.length];
      var sizeMul = 1;
      if (cls === 2) sizeMul = rand(1.1, 1.2);
      else if (cls === 3) sizeMul = rand(0.8, 0.9);
      var t = { x: rand(270, LW - 75), y: rand(70, LH - 80), r: 23 * sizeMul, sizeMul: sizeMul };
      var bad = false;
      for (var i = 0; i < obs.length; i++) {
        if (rectsOverlap({ x: t.x - t.r, y: t.y - t.r, w: t.r * 2, h: t.r * 2 }, obs[i], -2)) { bad = true; break; }
      }
      for (var j = 0; j < list.length; j++) {
        var o = list[j];
        if ((t.x - o.x) * (t.x - o.x) + (t.y - o.y) * (t.y - o.y) < (t.r + o.r + 40) * (t.r + o.r + 40)) { bad = true; break; }
      }
      var dp = Math.hypot(t.x - PX, t.y - PY);
      if (dp < t.r + 42) bad = true;
      if (bad) continue;
      if (!targetReachable(t, obs)) continue;
      list.push(t);
    }
    return list.length === TARGET_COUNT ? list : null;
  }
  function obstructionCount(t, obs) {
    var c = 0;
    for (var i = 0; i < obs.length; i++) if (segRect(PX, PY, t.x, t.y, obs[i])) c++;
    return c;
  }
  // 体积越大分数越低：大靶基础分×0.8~0.9，小靶×1.1~1.2，取整（范围 4~20）
  function calcValueFor(sizeMul, base) {
    var v;
    if (sizeMul >= 1.1) v = Math.round(base * rand(0.8, 0.9));
    else if (sizeMul <= 0.9) v = Math.round(base * rand(1.1, 1.2));
    else v = base;
    return clamp(v, 4, 20);
  }
  function assignValues(ts, obs) {
    var total = 0;
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i];
      var c = obstructionCount(t, obs);
      var base = c <= 0 ? 5 + randInt(0, 2) : clamp(5 + c * 4 + randInt(0, 2), 7, 20);
      t.value = calcValueFor(t.sizeMul, base);
      total += t.value;
    }
    return total;
  }
  // 各关至少 N 个标靶"直线不可达"（需抛物线翻越，仍可通过弧线命中）
  function minBlockedFor(level) {
    if (level <= 10) return 1;
    if (level <= 100) return 2;
    if (level <= 1000) return 3;
    return 4;
  }
  // 障碍物数量随关卡增长（平方根曲线，越后面越多）
  function obstacleCountFor(level) {
    return clamp(Math.floor(2 + Math.sqrt(level) * 1.8), 1, 24);
  }
  function countBlocked(ts, obs) {
    var c = 0;
    for (var i = 0; i < ts.length; i++) if (!lineClearTo(ts[i], obs)) c++;
    return c;
  }
  // 在玩家→标靶连线上补一个障碍：遮挡直线但仍保留弧线路径
  function blockDirectOf(t, obstacles) {
    for (var attempt = 0; attempt < 40; attempt++) {
      var frac = rand(0.4, 0.8);
      var cx = PX + (t.x - PX) * frac;
      var cy = PY + (t.y - PY) * frac;
      var ob = { x: cx - rand(18, 26), y: cy - rand(7, 10), w: rand(36, 52), h: rand(14, 20) };
      var bad = rectsOverlap(ob, { x: PX - 24, y: PY - 30, w: 48, h: 60 }, 4) ||
                rectsOverlap(ob, { x: t.x - t.r, y: t.y - t.r, w: t.r * 2, h: t.r * 2 }, 3);
      for (var i = 0; i < obstacles.length; i++) if (rectsOverlap(ob, obstacles[i], 6)) { bad = true; break; }
      if (bad) continue;
      obstacles.push(ob);
      if (!lineClearTo(t, obstacles) && targetReachable(t, obstacles)) return true;
      obstacles.pop();
    }
    return false;
  }
  // 一次布局尝试：放障碍→放靶→补齐直线不可达标靶数→校验全部弧线可达
  function tryBuild(level, nObs) {
    var obs = genObstacles(nObs, level);
    var ts = placeTargets(obs);
    if (!ts) return null;
    var need = minBlockedFor(level);
    var blocked = countBlocked(ts, obs);
    while (blocked < need) {
      var cand = null;
      for (var i = 0; i < ts.length; i++) if (lineClearTo(ts[i], obs)) { cand = ts[i]; break; }
      if (!cand) break;
      if (blockDirectOf(cand, obs)) blocked++;
      else break;
    }
    if (blocked < need) return null;
    for (var j = 0; j < ts.length; j++) if (!targetReachable(ts[j], obs)) return null;
    return { obstacles: obs, targets: ts };
  }
  function generateLevel(level) {
    var result = null;
    for (var attempt = 0; attempt < 10; attempt++) {
      result = tryBuild(level, clamp(obstacleCountFor(level) - attempt * 3, 1, 24));
      if (result) break;
    }
    if (!result) {
      for (var a = 0; a < 8; a++) {
        result = tryBuild(level, clamp(4 - Math.floor(a / 2), 1, 4));
        if (result) break;
      }
    }
    if (!result) {
      result = { obstacles: [{ x: 330, y: 190, w: 70, h: 22 }, { x: 480, y: 250, w: 60, h: 20 }], targets: [
        { x: 430, y: 110, r: 24, sizeMul: 1 }, { x: 570, y: 140, r: 22, sizeMul: 1 },
        { x: 640, y: 210, r: 24, sizeMul: 1 }, { x: 560, y: 320, r: 22, sizeMul: 1 }, { x: 680, y: 330, r: 24, sizeMul: 1 }
      ] };
    }
    var total = assignValues(result.targets, result.obstacles);
    return { obstacles: result.obstacles, targets: result.targets, totalValue: total };
  }

  // ---------- 关卡流程 ----------
  function newLevelState(level) {
    var g = generateLevel(level);
    targets = g.targets;
    obstacles = g.obstacles;
    totalValue = g.totalValue;
    arrowsLeft = ARROWS_TOTAL;
    score = 0;
    hitFlags = [false, false, false, false, false];
    helpUsed = false;
    power = 0; charging = false; overCancel = false; lastPower = null; targetPower = null;
    activeArrows = []; effects = [];
    save.playing = true;
    saveGame();
  }
  function loadLevelState() {
    targets = save.targets || [];
    obstacles = save.obstacles || [];
    totalValue = save.totalValue || 0;
    arrowsLeft = typeof save.arrows === 'number' ? save.arrows : ARROWS_TOTAL;
    score = save.score || 0;
    hitFlags = (save.hit || []).slice();
    while (hitFlags.length < TARGET_COUNT) hitFlags.push(false);
    helpUsed = !!save.helpUsed;
    power = 0; charging = false; overCancel = false; lastPower = null; targetPower = null;
    activeArrows = []; effects = [];
  }
  function startOrResume() {
    showView('view-game');
    if (save.playing && save.targets && save.targets.length) loadLevelState();
    else newLevelState(save.level);
    state = 'playing';
    resultOverlay.hidden = true; helpOverlay.hidden = true;
    updateHUD();
    resize();
    setTimeout(resize, 0);
  }

  // ---------- 射击（蓄力：上升→100停顿→衰减→归0自动结束） ----------
  function startCharge() {
    if (state !== 'playing' || arrowsLeft <= 0 || charging) return;
    audioInit();
    charging = true; power = 0; overCancel = false; lastTick = 0;
    chargePhase = 'rising'; holdTimer = 0;
    btnCharge.classList.add('charging');
  }
  function endChargeAuto() {
    // 衰减归 0：本次蓄力结束（不发射），需重新按键
    charging = false; power = 0; overCancel = false;
    btnCharge.classList.remove('charging');
    btnCancel.classList.remove('hot');
    updateHUD();
  }
  function cancelCharge() {
    charging = false; power = 0; overCancel = false;
    chargePhase = 'rising'; holdTimer = 0;
    btnCharge.classList.remove('charging');
    btnCancel.classList.remove('hot');
    updateHUD();
  }
  function releaseCharge(canceled) {
    charging = false;
    btnCharge.classList.remove('charging');
    btnCancel.classList.remove('hot');
    if (canceled || power <= 0.5) { power = 0; updateHUD(); return; }  // 放弃 或 归0 → 不发射
    fireArrow(power);
  }
  function fireArrow(p) {
    var a = angle * Math.PI / 180;
    var v0 = p / 100 * VMAX;
    var straight = p >= 99.5;
    activeArrows.push({ x: PX, y: PY, vx: v0 * Math.cos(a), vy: -v0 * Math.sin(a), straight: straight, g: gravFor(p), t: 0, dead: false });
    arrowsLeft--;
    power = 0;
    lastPower = p;   // 记录上一箭力度刻度
    play('shoot');
    saveGame();
    updateHUD();
  }

  function stepArrow(ar, dt) {
    var straight = ar.straight;
    var spd = Math.hypot(ar.vx, ar.vy);
    var steps = 1;
    var dist = spd * dt;
    if (dist > 4) steps = Math.ceil(dist / 4);
    var sdt = dt / steps;
    for (var s = 0; s < steps; s++) {
      var px = ar.x, py = ar.y;
      if (ar.g) ar.vy += ar.g * sdt;
      ar.x += ar.vx * sdt;
      ar.y += ar.vy * sdt;
      ar.t += sdt;
      for (var i = 0; i < obstacles.length; i++) {
        if (segRect(px, py, ar.x, ar.y, obstacles[i])) {
          ar.dead = true;
          addBurst(ar.x, ar.y, '#a9713f');
          play('block');
          return;
        }
      }
      for (var j = 0; j < targets.length; j++) {
        if (hitFlags[j]) continue;
        var t = targets[j];
        var dx = ar.x - t.x, dy = ar.y - t.y;
        if (dx * dx + dy * dy <= t.r * t.r) {
          hitFlags[j] = true;
          ar.dead = true;
          score += t.value;
          addBurst(t.x, t.y, '#e63946');
          play('hit');
          saveGame();
          updateHUD();   // 射中即刷新计分，不等下一箭
          return;
        }
      }
      if (ar.x > LW + 50 || ar.x < -50 || ar.y > LH + 90) { ar.dead = true; return; }
      if (straight && ar.y < -20) { ar.dead = true; return; }   // 直箭飞出顶部即消失
      if (ar.y < -700) { ar.dead = true; return; }              // 抛物线过高的极端上限
    }
  }

  // ---------- 特效 ----------
  function addBurst(x, y, color) { effects.push({ x: x, y: y, color: color, t: 0 }); }
  function updateEffects(dt) {
    for (var i = effects.length - 1; i >= 0; i--) {
      effects[i].t += dt;
      if (effects[i].t > 0.5) effects.splice(i, 1);
    }
  }

  // ---------- 关卡结算 ----------
  function checkEnd() {
    if (state !== 'playing') return;
    var allHit = true;
    for (var i = 0; i < hitFlags.length; i++) if (!hitFlags[i]) { allHit = false; break; }
    if (allHit) { endLevel(true); return; }
    if (arrowsLeft <= 0 && activeArrows.length === 0) endLevel(false);
  }
  function calcEarned(allHit, hitValue, totalValue) {
    if (allHit) return 3;
    if (hitValue >= totalValue * 0.8) return 2;
    if (hitValue >= totalValue * 0.6) return 1;
    return -1;
  }
  function endLevel(allHit) {
    state = 'done';
    var hitValue = 0;
    for (var i = 0; i < targets.length; i++) if (hitFlags[i]) hitValue += targets[i].value;
    var earned = calcEarned(allHit, hitValue, totalValue);
    var cleared = earned > 0;
    if (cleared) { save.stars += earned; save.level += 1; }
    else { save.stars = Math.max(0, save.stars - 1); }
    save.playing = false;
    saveGame();
    submitScores();
    showResult({ earned: earned, cleared: cleared, hitValue: hitValue, totalValue: totalValue, allHit: allHit });
  }
  function showResult(r) {
    resultTitle.textContent = r.cleared ? '本关通过' : '本关失败';
    resultStars.textContent = r.earned >= 0 ? starStr(r.earned) : '☆☆☆';
    resultStars.style.opacity = r.earned >= 0 ? '1' : '.4';
    resultScore.textContent = '命中价值 ' + r.hitValue + ' / 总价值 ' + r.totalValue;
    resultInfo.textContent = r.cleared
      ? '累计星数 ★ ' + save.stars + '，即将进入第 ' + save.level + ' 关'
      : '累计星数 -1（不低于 0）';
    btnResultNext.textContent = r.cleared ? '下一关' : '再试一次';
    resultOverlay.hidden = false;
    play(r.cleared ? 'win' : 'fail');
  }

  // ---------- 求助（先选单个标靶，不可达不扣次数） ----------
  function computeTargetHelp(i, angleDeg) {
    var t = targets[i];
    var lo = -1, hi = -1;
    for (var p = 5; p <= 100; p += 1) {
      if (simulateHit(t, angleDeg, p, obstacles, 8)) { if (lo < 0) lo = p; hi = p; }
    }
    return { lo: lo, hi: hi };
  }
  function renderHelpTargets() {
    var html = '';
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      var tag;
      if (hitFlags[i]) tag = '<span class="help-tag hit">已命中</span>';
      else if (helpUsed) tag = '<span class="help-tag">已使用</span>';
      else tag = '<span class="help-tag">选择</span>';
      html += '<button type="button" class="help-target" data-i="' + i + '"' + (helpUsed ? ' disabled' : '') + '>' +
        '标靶#' + (i + 1) + '（值' + t.value + '）' + tag + '</button>';
    }
    html += '<div class="help-result" id="help-result" hidden></div>';
    helpBody.innerHTML = html;
    var btns = helpBody.querySelectorAll('.help-target');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', function () {
        var i = parseInt(this.getAttribute('data-i'), 10);
        onHelpPick(i);
      });
    }
  }
  function showHelpResult(i, r, noReach) {
    var box = $('help-result');
    if (r && r.hit) {
      box.className = 'help-result';
      box.innerHTML = '该标靶已命中，无需再求助';
    } else if (noReach || r.lo < 0) {
      box.className = 'help-result no';
      box.innerHTML = '当前角度下标靶#' + (i + 1) + ' <b>不可达</b>，未扣除求助次数';
    } else {
      box.className = 'help-result';
      box.innerHTML = '标靶#' + (i + 1) + '（值' + targets[i].value + '）→ 力度 <b>' +
        Math.round(r.lo) + ' ~ ' + Math.round(r.hi) + '</b>';
    }
    box.hidden = false;
  }
  function onHelpPick(i) {
    if (state !== 'playing' || helpUsed) return;
    if (hitFlags[i]) { showHelpResult(i, { hit: true }, false); play('click'); return; }
    var r = computeTargetHelp(i, angle);
    if (r.lo < 0) {
      showHelpResult(i, r, true);   // 不可达：不扣除
      play('click');
    } else {
      showHelpResult(i, r, false);  // 可达：给出力度区间并扣除
      helpUsed = true;
      play('hit');
      updateHUD();
      saveGame();
    }
  }
  function useHelp() {
    if (state !== 'playing' || !targets.length) return;
    helpAngle.textContent = '当前角度 ' + Math.round(angle) + '°';
    renderHelpTargets();
    helpOverlay.hidden = false;
    play('click');
  }

  // ---------- 排行榜 ----------
  var PERIOD_NAMES = { all: '总榜', month: '月榜', week: '周榜', day: '日榜' };
  function openLB() {
    lbBoard = 'level'; lbPeriod = 'all';
    lbModal.hidden = false;
    renderLBTabs();
    renderGlobalLB();
    play('click');
  }
  function renderLBTabs() {
    var bBtns = lbBoardTabs.querySelectorAll('.tab');
    for (var i = 0; i < bBtns.length; i++) {
      bBtns[i].classList.toggle('active', bBtns[i].getAttribute('data-board') === lbBoard);
    }
    var pBtns = lbPeriodTabs.querySelectorAll('.tab');
    for (var j = 0; j < pBtns.length; j++) {
      pBtns[j].classList.toggle('active', pBtns[j].getAttribute('data-period') === lbPeriod);
    }
  }
  function fmtBoardScore(board, sc) { return board === 'level' ? '第 ' + sc + ' 关' : '★ ' + sc; }
  function setTip(html) { lbBody.innerHTML = '<div class="lb-tip">' + html + '</div>'; }
  function renderGlobalLB() {
    var board = lbBoard === 'level' ? BOARD_LEVEL : BOARD_STAR;
    var title = 'B站榜 · ' + (lbBoard === 'level' ? '等级榜' : '星数榜') + ' · ' + PERIOD_NAMES[lbPeriod] + ' · TOP 100';
    if (!toyReady) {
      lbNote.textContent = title;
      setTip('正在加载 B站 数据…');
      var attempts = 0;
      (function waitSDK() {
        if (toyReady) { renderGlobalLB(); return; }
        if (attempts++ > 25) { setTip('SDK 加载失败，请在 B站 App 内查看'); return; }
        setTimeout(waitSDK, 200);
      })();
      return;
    }
    lbNote.textContent = title;
    setTip('加载中…');
    try {
      Promise.all([
        window.toy.getRankList({ board: board, period: lbPeriod, limit: GLOBAL_TOP }).catch(function () { return null; }),
        window.toy.getMyRank({ board: board, period: lbPeriod }).catch(function () { return null; })
      ]).then(function (res) {
        var list = res[0], mine = res[1];
        if (!list || !list.length) { setTip('暂无上榜记录，快去创造奇迹吧'); return; }
        var rows = '';
        for (var i = 0; i < list.length; i++) {
          var it = list[i];
          rows += '<div class="lb-row global">' +
            '<span class="lb-rank' + (it.rank <= 3 ? ' t' + it.rank : '') + '">' + it.rank + '</span>' +
            '<span class="lb-user">' +
            (it.avatar ? '<img class="lb-avatar" src="' + esc(it.avatar) + '" alt="" referrerpolicy="no-referrer">' : '<span class="lb-avatar"></span>') +
            '<span class="lb-name">' + esc(it.nickname) + '</span>' +
            '</span>' +
            '<span class="lb-score">' + fmtBoardScore(lbBoard, it.score) + '</span></div>';
        }
        if (mine && mine.ranked) {
          rows += '<div class="lb-row global mine"><span class="lb-rank">' + mine.rank + '</span>' +
            '<span class="lb-user"><span class="lb-avatar"></span><span class="lb-name">我</span></span>' +
            '<span class="lb-score">' + fmtBoardScore(lbBoard, mine.score) + '</span></div>';
        }
        lbBody.innerHTML = '<div class="lb-head"><span class="lb-rank">名次</span><span class="lb-user">玩家</span><span class="lb-score">成绩</span></div>' + rows;
      }).catch(function () { setTip('加载失败，请稍后重试'); });
    } catch (e) { setTip('加载失败，请稍后重试'); }
  }

  // ---------- 点击标靶自动瞄准 ----------
  function aimAtTarget(i) {
    var t = targets[i];
    angle = clamp(Math.atan2(-(t.y - PY), t.x - PX) * 180 / Math.PI, ANGLE_MIN, ANGLE_MAX);
    updateAngleUI();
    play('click');
  }
  function onCanvasTap(e) {
    if (state !== 'playing' || !targets.length) return;
    var r = canvas.getBoundingClientRect();
    var sx = e.clientX - r.left, sy = e.clientY - r.top;
    var lx = (sx - offX) / scale, ly = (sy - offY) / scale;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      var dx = lx - t.x, dy = ly - t.y;
      if (dx * dx + dy * dy <= (t.r + 14) * (t.r + 14)) { aimAtTarget(i); return; }
    }
  }

  // ---------- 角度 UI ----------
  function updateAngleUI() {
    angleKnob.style.left = ((angle - ANGLE_MIN) / (ANGLE_MAX - ANGLE_MIN) * 100) + '%';
    if (!angleInput || document.activeElement !== angleInput) angleInput.value = Math.round(angle);
  }
  function setAngleFromClientX(cx) {
    var r = angleSlider.getBoundingClientRect();
    var frac = clamp((cx - r.left) / r.width, 0, 1);
    angle = ANGLE_MIN + frac * (ANGLE_MAX - ANGLE_MIN);
    updateAngleUI();
  }

  // ---------- HUD ----------
  // 星级进度：优先显示当前冲击的星级所需分数（1星→60%，2星→80%，3星→全中）
  function scoreDenom() {
    var t1 = Math.ceil(totalValue * 0.6);
    var t2 = Math.ceil(totalValue * 0.8);
    if (score < t1) return { denom: t1, stars: 1 };
    if (score < t2) return { denom: t2, stars: 2 };
    return { denom: totalValue, stars: 3 };
  }
  function updatePowerMarkers() {
    if (lastPower === null) { powerMarker.hidden = true; }
    else {
      powerMarker.hidden = false;
      powerMarker.style.left = lastPower + '%';
      if (powerMarkerTag) powerMarkerTag.textContent = String(Math.round(lastPower));
    }
    if (targetPower === null) { powerTarget.hidden = true; }
    else {
      powerTarget.hidden = false;
      powerTarget.style.left = targetPower + '%';
      if (powerTargetTag) powerTargetTag.textContent = String(Math.round(targetPower));
    }
  }
  function updateHUD() {
    hudLevel.textContent = save.level;
    hudStars.textContent = save.stars;
    hudArrows.textContent = arrowsLeft;
    var sd = scoreDenom();
    hudScore.textContent = score;
    hudTotal.textContent = sd.denom + ' ' + '★'.repeat(sd.stars);
    hudEl.classList.toggle('crowded', sd.stars === 3);   // 冲击 3 星时横幅更挤，字体略缩
    if (helpUsed) { helpLeft.textContent = '0'; helpLeft.classList.add('off'); }
    else { helpLeft.textContent = '1'; helpLeft.classList.remove('off'); }
    if (charging) {
      powerVal.textContent = Math.round(power);
      powerFill.style.width = power + '%';
    } else {
      powerVal.textContent = '0';
      powerFill.style.width = '0%';
    }
    updatePowerMarkers();
  }

  // ---------- 画布尺寸 ----------
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = stage.getBoundingClientRect();
    var cw = Math.max(200, rect.width);
    var ch = Math.max(200, rect.height);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    scale = Math.min(cw / LW, ch / LH);
    offX = (cw - LW * scale) / 2;
    offY = (ch - LH * scale) / 2;
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', function () {
      if (viewGame.classList.contains('active')) resize();
    });
    window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
  }

  // ---------- 绘制 ----------
  function drawBackground() {
    var sky = ctx.createLinearGradient(0, 0, 0, LH);
    sky.addColorStop(0, '#8fd0ee');
    sky.addColorStop(0.72, '#cfeffd');
    sky.addColorStop(1, '#e8f7ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, LW, LH);
    // 远景山丘
    ctx.fillStyle = 'rgba(122,176,140,.55)';
    ctx.beginPath(); ctx.ellipse(180, LH, 360, 130, 0, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(600, LH, 380, 110, 0, Math.PI, 0); ctx.fill();
    // 地面
    ctx.fillStyle = '#4e8f3f';
    ctx.fillRect(0, LH - 34, LW, 34);
    ctx.fillStyle = '#5aa44a';
    ctx.fillRect(0, LH - 34, LW, 12);
  }
  function drawObstacle(ob) {
    ctx.fillStyle = '#a9713f';
    ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
    ctx.strokeStyle = '#6b4423';
    ctx.lineWidth = 2;
    ctx.strokeRect(ob.x + 1, ob.y + 1, ob.w - 2, ob.h - 2);
    ctx.beginPath();
    ctx.moveTo(ob.x, ob.y); ctx.lineTo(ob.x + ob.w, ob.y + ob.h);
    ctx.moveTo(ob.x + ob.w, ob.y); ctx.lineTo(ob.x, ob.y + ob.h);
    ctx.stroke();
  }
  function drawTarget(t, hit) {
    ctx.save();
    ctx.globalAlpha = hit ? 0.35 : 1;
    ctx.translate(t.x, t.y);
    ctx.fillStyle = '#3d5a80';
    ctx.beginPath(); ctx.arc(0, 0, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2f6fa';
    ctx.beginPath(); ctx.arc(0, 0, t.r * 0.72, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e63946';
    ctx.beginPath(); ctx.arc(0, 0, t.r * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.max(13, t.r * 0.85) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(hit ? '✓' : t.value, 0, 1);
    ctx.restore();
  }
  function drawPlayer() {
    ctx.save();
    ctx.translate(PX, PY);
    // 腿
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(-9, 7, 7, 13);
    ctx.fillRect(2, 7, 7, 13);
    // 身体
    ctx.fillStyle = '#3498db';
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
    // 腰带
    ctx.fillStyle = '#e67e22';
    ctx.fillRect(-13, -1, 26, 5);
    // 头
    ctx.fillStyle = '#f6cfa8';
    ctx.beginPath(); ctx.arc(0, -16, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5d4037';
    ctx.beginPath(); ctx.arc(0, -18, 8, Math.PI, Math.PI * 2); ctx.fill();
    // 弓：随角度倾斜（正角朝上，与指示线一致）
    ctx.save();
    ctx.rotate(-angle * Math.PI / 180);
    ctx.strokeStyle = '#8b5a2b';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(22, 0, 19, -1.15, 1.15); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(22, -18.5); ctx.lineTo(18, 0); ctx.lineTo(22, 18.5); ctx.stroke();
    ctx.restore();
    ctx.restore();
  }
  function drawGhost() {
    var a = angle * Math.PI / 180;
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(PX, PY);
    ctx.lineTo(PX + Math.cos(a) * 96, PY - Math.sin(a) * 96);
    ctx.stroke();
    ctx.setLineDash([]);
    // 蓄力时的抛物线预览
    if (state === 'playing' && power > 0.5) {
      var pts = previewPoints(angle, power, 170);
      if (pts.length > 1) {
        ctx.strokeStyle = 'rgba(255,209,102,.8)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([10, 7]);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
  function previewPoints(angleDeg, power, maxPts) {
    var pts = [];
    var a = angleDeg * Math.PI / 180;
    var v0 = power / 100 * VMAX;
    var vx = v0 * Math.cos(a), vy = -v0 * Math.sin(a);
    var x = PX, y = PY, px = x, py = y, t = 0, dt = 1 / 90;
    var g = gravFor(power);
    pts.push({ x: x, y: y });
    while (t < 8 && pts.length < (maxPts || 170)) {
      vy += g * dt;
      x += vx * dt; y += vy * dt; t += dt;
      pts.push({ x: x, y: y });
      var blocked = false;
      for (var i = 0; i < obstacles.length; i++) {
        if (segRect(px, py, x, y, obstacles[i])) { blocked = true; break; }
      }
      if (blocked) break;
      if (y > LH + 40 || x > LW + 30 || x < -30) break;
      px = x; py = y;
    }
    return pts;
  }
  function drawArrow(ar) {
    var ang = Math.atan2(ar.vy, ar.vx);
    ctx.save();
    ctx.translate(ar.x, ar.y);
    ctx.rotate(ang);
    ctx.strokeStyle = '#5d4037';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(6, 0); ctx.stroke();
    ctx.fillStyle = '#c0392b';
    ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(4, -3.2); ctx.lineTo(4, 3.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f39c12';
    ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-13, -3.5); ctx.lineTo(-13, 3.5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawEffects() {
    for (var i = 0; i < effects.length; i++) {
      var e = effects[i];
      ctx.globalAlpha = 1 - e.t / 0.5;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.t * 62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  function draw() {
    // 整画布清空（含信箱黑边），避免箭/蓄力预览线出界残留残影
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offX * dpr, offY * dpr);
    drawBackground();
    for (var i = 0; i < obstacles.length; i++) drawObstacle(obstacles[i]);
    for (var j = 0; j < targets.length; j++) drawTarget(targets[j], hitFlags[j]);
    drawPlayer();
    drawGhost();
    for (var k = 0; k < activeArrows.length; k++) drawArrow(activeArrows[k]);
    drawEffects();
  }

  // ---------- 主循环 ----------
  function loop(ts) {
    var dt = lastTs ? Math.min(0.035, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;
    if (state === 'playing') {
      if (charging && !overCancel) {
        if (chargePhase === 'rising') {
          power += chargeRate * dt;
          if (power >= 100) { power = 100; chargePhase = 'hold'; holdTimer = 0; }
        } else if (chargePhase === 'hold') {
          holdTimer += dt;
          if (holdTimer >= CHARGE_HOLD) chargePhase = 'falling';
        } else if (chargePhase === 'falling') {
          power -= chargeRate * dt;
          if (power <= 0) endChargeAuto();   // 归 0：结束本次蓄力（继续循环）
        }
        var band = Math.floor(power / 5);
        if (band !== lastTick) { lastTick = band; if (power > 1 && power < 99) play('charge'); }
        updateHUD();
      }
      for (var i = activeArrows.length - 1; i >= 0; i--) {
        stepArrow(activeArrows[i], dt);
        if (activeArrows[i].dead) activeArrows.splice(i, 1);
      }
      updateEffects(dt);
      checkEnd();
    }
    if (viewGame.classList.contains('active')) draw();
    requestAnimationFrame(loop);
  }

  // ---------- 输入：角度滑动条 ----------
  var hasPointer = typeof window !== 'undefined' && ('PointerEvent' in window);
  var sliderDrag = false;
  function bindSlider() {
    if (hasPointer) {
      angleSlider.addEventListener('pointerdown', function (e) {
        sliderDrag = true;
        setAngleFromClientX(e.clientX);
        if (angleSlider.setPointerCapture) { try { angleSlider.setPointerCapture(e.pointerId); } catch (err) { } }
        e.preventDefault();
      });
      angleSlider.addEventListener('pointermove', function (e) { if (sliderDrag) setAngleFromClientX(e.clientX); });
      angleSlider.addEventListener('pointerup', function () { sliderDrag = false; });
      angleSlider.addEventListener('pointercancel', function () { sliderDrag = false; });
    } else {
      angleSlider.addEventListener('mousedown', function (e) { sliderDrag = true; setAngleFromClientX(e.clientX); });
      window.addEventListener('mousemove', function (e) { if (sliderDrag) setAngleFromClientX(e.clientX); });
      window.addEventListener('mouseup', function () { sliderDrag = false; });
      angleSlider.addEventListener('touchstart', function (e) { sliderDrag = true; var t = e.touches[0]; if (t) setAngleFromClientX(t.clientX); e.preventDefault(); });
      angleSlider.addEventListener('touchmove', function (e) { if (sliderDrag) { var t = e.touches[0]; if (t) setAngleFromClientX(t.clientX); } e.preventDefault(); });
      angleSlider.addEventListener('touchend', function () { sliderDrag = false; });
    }
    // 数值输入
    if (angleInput) {
      angleInput.addEventListener('input', function () {
        var v = parseFloat(angleInput.value);
        if (!isNaN(v)) { angle = clamp(v, ANGLE_MIN, ANGLE_MAX); updateAngleUI(); }
      });
      angleInput.addEventListener('change', function () {
        var v = parseFloat(angleInput.value);
        angle = clamp(isNaN(v) ? angle : v, ANGLE_MIN, ANGLE_MAX);
        angleInput.value = Math.round(angle);
        updateAngleUI();
      });
    }
  }

  // ---------- 输入：力度条目标刻度（点击/拖动） ----------
  var barDrag = false;
  function powerFromClientX(cx) {
    var r = powerBar.getBoundingClientRect();
    return clamp((cx - r.left) / r.width * 100, 0, 100);
  }
  function bindPowerBar() {
    function setFrom(cx) { targetPower = powerFromClientX(cx); updatePowerMarkers(); }
    if (hasPointer) {
      powerBar.addEventListener('pointerdown', function (e) {
        barDrag = true;
        setFrom(e.clientX);
        if (powerBar.setPointerCapture) { try { powerBar.setPointerCapture(e.pointerId); } catch (err) { } }
        e.preventDefault();
        play('click');
      });
      powerBar.addEventListener('pointermove', function (e) { if (barDrag) setFrom(e.clientX); });
      powerBar.addEventListener('pointerup', function () { barDrag = false; });
      powerBar.addEventListener('pointercancel', function () { barDrag = false; });
    } else {
      powerBar.addEventListener('mousedown', function (e) { barDrag = true; setFrom(e.clientX); e.preventDefault(); });
      window.addEventListener('mousemove', function (e) { if (barDrag) setFrom(e.clientX); });
      window.addEventListener('mouseup', function () { barDrag = false; });
      powerBar.addEventListener('touchstart', function (e) { barDrag = true; var t = e.touches[0]; if (t) setFrom(t.clientX); e.preventDefault(); });
      powerBar.addEventListener('touchmove', function (e) { if (barDrag) { var t = e.touches[0]; if (t) setFrom(t.clientX); } e.preventDefault(); });
      powerBar.addEventListener('touchend', function () { barDrag = false; });
    }
  }

  // ---------- 输入：蓄力 / 放弃 ----------
  function pointIn(el, cx, cy) {
    var r = el.getBoundingClientRect();
    return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  }
  function bindCharge() {
    if (hasPointer) {
      btnCharge.addEventListener('pointerdown', function (e) {
        audioInit();
        startCharge();
        if (btnCharge.setPointerCapture) { try { btnCharge.setPointerCapture(e.pointerId); } catch (err) { } }
        e.preventDefault();
      });
      btnCharge.addEventListener('pointermove', function (e) {
        if (!charging) return;
        overCancel = pointIn(btnCancel, e.clientX, e.clientY);
        btnCancel.classList.toggle('hot', overCancel);
      });
      btnCharge.addEventListener('pointerup', function (e) {
        releaseCharge(overCancel);
      });
      btnCharge.addEventListener('pointercancel', function () { cancelCharge(); });
    } else {
      btnCharge.addEventListener('mousedown', function (e) {
        audioInit();
        startCharge();
        e.preventDefault();
        btnCharge._down = true;
      });
      window.addEventListener('mousemove', function (e) {
        if (!btnCharge._down || !charging) return;
        overCancel = pointIn(btnCancel, e.clientX, e.clientY);
        btnCancel.classList.toggle('hot', overCancel);
      });
      window.addEventListener('mouseup', function () {
        if (btnCharge._down) { btnCharge._down = false; releaseCharge(overCancel); }
      });
      btnCharge.addEventListener('touchstart', function (e) {
        audioInit();
        startCharge();
        btnCharge._down = true;
        e.preventDefault();
      });
      document.addEventListener('touchmove', function (e) {
        if (!btnCharge._down || !charging) return;
        var t = e.touches[0];
        if (t) { overCancel = pointIn(btnCancel, t.clientX, t.clientY); btnCancel.classList.toggle('hot', overCancel); }
      }, { passive: true });
      document.addEventListener('touchend', function (e) {
        if (!btnCharge._down) return;
        btnCharge._down = false;
        // 松开时若仍按在放弃按钮上，视为放弃
        var t = e.changedTouches[0];
        if (t && overCancel) releaseCharge(true); else releaseCharge(false);
      });
    }
  }

  // ---------- 键盘 ----------
  function bindKeys() {
    window.addEventListener('keydown', function (e) {
      var code = e.code;
      // 角度输入框聚焦时：↑/↓ 交给原生输入微调（step=2），W/S 不参与，避免与游戏按键打架
      if (typeof document !== 'undefined' && document.activeElement === angleInput &&
          (code === 'ArrowUp' || code === 'ArrowDown' || code === 'KeyW' || code === 'KeyS')) {
        return;
      }
      if (code === 'ArrowUp' || code === 'KeyW') { angle = clamp(angle + 2, ANGLE_MIN, ANGLE_MAX); updateAngleUI(); e.preventDefault(); }
      else if (code === 'ArrowDown' || code === 'KeyS') { angle = clamp(angle - 2, ANGLE_MIN, ANGLE_MAX); updateAngleUI(); e.preventDefault(); }
      else if (code === 'Space') {
        if (!e.repeat && state === 'playing' && !charging && arrowsLeft > 0) { startCharge(); }
        e.preventDefault();
      }
      else if (code === 'Escape') { if (charging) cancelCharge(); }
    });
    window.addEventListener('keyup', function (e) {
      if (e.code === 'Space' && charging) releaseCharge(false);
    });
  }

  // ---------- 通用按钮 ----------
  function syncSoundToggle() {
    if (!soundToggle) return;
    soundToggle.textContent = muted ? '关' : '开';
    soundToggle.classList.toggle('off', muted);
  }
  function syncChargeUI() {
    if (!chargeRateInput) return;
    chargeRateInput.value = chargeRate;
    chargeRateVal.textContent = chargeRate;
  }
  function loadChargeRate() {
    try {
      var v = parseInt(localStorage.getItem(CHARGE_SPEED_KEY), 10);
      if (v >= 25 && v <= 70) return v;
    } catch (e) { }
    return 40;
  }
  function toggleMute() {
    audioInit();
    muted = !muted;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { }
    btnMute.textContent = muted ? '🔇' : '🔊';
    syncSoundToggle();
    play('click');
  }
  function bindButtons() {
    btnStart.addEventListener('click', function () { audioInit(); play('click'); startOrResume(); });
    btnHome.addEventListener('click', function () { audioInit(); play('click'); goHome(); });
    btnMute.addEventListener('click', toggleMute);
    btnHelp.addEventListener('click', function () { useHelp(); });
    $('btn-close-help').addEventListener('click', function () { helpOverlay.hidden = true; });
    btnResultNext.addEventListener('click', function () { resultOverlay.hidden = true; startOrResume(); });
    $('btn-result-lb').addEventListener('click', function () { openLB(); });
    $('btn-close-lb').addEventListener('click', function () { lbModal.hidden = true; });
    $('btn-lb').addEventListener('click', function () { openLB(); });
    // 设置（开关声音 / 蓄力速度）
    $('btn-settings').addEventListener('click', function () { audioInit(); settingsOverlay.hidden = false; syncSoundToggle(); syncChargeUI(); play('click'); });
    $('btn-close-settings').addEventListener('click', function () { settingsOverlay.hidden = true; });
    soundToggle.addEventListener('click', toggleMute);
    // 蓄力中点击「放弃」也可取消（键盘蓄力场景）
    btnCancel.addEventListener('click', function () { if (charging) cancelCharge(); });
    if (chargeRateInput) {
      chargeRateInput.addEventListener('input', function () {
        chargeRate = parseInt(chargeRateInput.value, 10) || 40;
        try { localStorage.setItem(CHARGE_SPEED_KEY, String(chargeRate)); } catch (e) { }
        chargeRateVal.textContent = chargeRate;
      });
    }
    // 排行榜页签
    lbBoardTabs.addEventListener('click', function (e) {
      var b = e.target.getAttribute && e.target.getAttribute('data-board');
      if (!b) return;
      lbBoard = b; renderLBTabs(); renderGlobalLB(); play('click');
    });
    lbPeriodTabs.addEventListener('click', function (e) {
      var p = e.target.getAttribute && e.target.getAttribute('data-period');
      if (!p) return;
      lbPeriod = p; renderLBTabs(); renderGlobalLB(); play('click');
    });
    // 点遮罩关闭
    helpOverlay.addEventListener('click', function (e) { if (e.target === helpOverlay) helpOverlay.hidden = true; });
    resultOverlay.addEventListener('click', function (e) { if (e.target === resultOverlay) resultOverlay.hidden = true; });
    lbModal.addEventListener('click', function (e) { if (e.target === lbModal) lbModal.hidden = true; });
    settingsOverlay.addEventListener('click', function (e) { if (e.target === settingsOverlay) settingsOverlay.hidden = true; });
  }

  // ---------- 启动 ----------
  function init() {
    if (typeof window === 'undefined') return;
    save = loadSave();
    muted = loadMute();
    chargeRate = loadChargeRate();
    bindSlider();
    bindPowerBar();
    bindCharge();
    bindKeys();
    bindButtons();
    // 点击画布标靶 → 自动调整角度（含被障碍挡住的靶）
    if (hasPointer) canvas.addEventListener('pointerdown', onCanvasTap);
    else canvas.addEventListener('click', onCanvasTap);
    resize();
    updateAngleUI();
    renderHome();
    loadSDK();
    window.addEventListener('beforeunload', saveGame);
    window.addEventListener('pagehide', saveGame);
    requestAnimationFrame(loop);
  }

  init();

  // 测试导出（Node 冒烟测试用）
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      LW: LW, LH: LH, PX: PX, PY: PY, VMAX: VMAX, G: G,
      ARROWS_TOTAL: ARROWS_TOTAL, TARGET_COUNT: TARGET_COUNT,
      simulateHit: simulateHit, generateLevel: generateLevel,
      targetReachable: targetReachable, gravFor: gravFor, calcValueFor: calcValueFor,
      lineClearTo: lineClearTo, minBlockedFor: minBlockedFor, countBlocked: countBlocked,
      obstacleCountFor: obstacleCountFor,
      targetHelpRange: computeTargetHelp, pickHelpTarget: onHelpPick,
      calcEarned: calcEarned,
      getState: function () { return state; },
      getSave: function () { return JSON.parse(JSON.stringify(save)); },
      getTargets: function () { return targets.map(function (t) { return { x: t.x, y: t.y, r: t.r, sizeMul: t.sizeMul, value: t.value }; }); },
      getObstacles: function () { return obstacles.map(function (o) { return { x: o.x, y: o.y, w: o.w, h: o.h }; }); },
      getTotalValue: function () { return totalValue; },
      getArrowsLeft: function () { return arrowsLeft; },
      getActiveArrows: function () { return activeArrows.length; },
      getScore: function () { return score; },
      getHitFlags: function () { return hitFlags.slice(); },
      getAngle: function () { return angle; },
      getPower: function () { return power; },
      getCharging: function () { return charging; },
      getChargeRate: function () { return chargeRate; },
      getLastPower: function () { return lastPower; },
      getTargetPower: function () { return targetPower; },
      aimAtTarget: aimAtTarget,
      getLayout: function () { return { scale: scale, offX: offX, offY: offY }; },
      getHelpUsed: function () { return helpUsed; },
      setAngle: function (v) { angle = clamp(v, ANGLE_MIN, ANGLE_MAX); updateAngleUI(); },
      debugFire: function (a, p) { angle = clamp(a, ANGLE_MIN, ANGLE_MAX); fireArrow(clamp(p, 0, 100)); },
      debugReset: function () { save = defaultSave(); saveGame(); renderHome(); },
      openHelp: useHelp
    };
  }
})();
