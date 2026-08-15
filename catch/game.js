/* 捕鱼达人：B站 Toy 捕鱼游戏（炮 / 渔网 / 渔场升级 / 打工 / B站双榜） */
(function () {
  'use strict';

  // ---------- 常量 ----------
  var KEY_SAVE = 'catch.save';
  var MAX_FISH = 100;          // 场上鱼上限
  var MAX_GUN = 60;            // 炮等级绝对上限（防数值爆炸）
  var MAX_LEVEL = 120;         // 渔场等级上限
  var SCI_THRESHOLD = 1e16;    // 超过万亿亿用科学计数
  var GLOBAL_TOP = 100;
  var AUTHOR_UID = '13450091'; // UP 主 mid（打工关注跳转 / 作者本人测试福利）
  var PERIODS = ['all', 'month', 'week', 'day'];
  var PERIOD_NAMES = { all: '总榜', month: '月榜', week: '周榜', day: '日榜' };
  var FISH_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9',
    '#4dabf7', '#748ffc', '#9775fa', '#f06595', '#e599f7', '#8ce99a', '#ffd8a8'];

  // ---------- 数值模型 ----------
  // 炮等级 lv：价格 / 捕获等级 X = 10*2^(lv-1)；捕获范围 = 10+lv
  function gunPrice(lv) { return 10 * Math.pow(2, lv - 1); }
  function gunPower(lv) { return 10 * Math.pow(2, lv - 1); }
  function gunRange(lv) { return 10 + lv; }
  // 鱼等级 lv：捕获等级 Y = 100*2^(lv-1)*(1+0.1*(lv-1))；价值 = 30% 捕获等级
  function fishCapture(lv) { return Math.round(100 * Math.pow(2, lv - 1) * (1 + 0.1 * (lv - 1))); }
  function fishValue(lv) { return Math.round(0.3 * fishCapture(lv)); }
  // 渔场等级：升到 L+1 级需要额外累计收入 upCost(L) = 1000*2^(L-1)*(1+0.1*(L-1))
  function upCost(k) { return 1000 * Math.pow(2, k - 1) * (1 + 0.1 * (k - 1)); }
  function threshold(L) {
    if (L <= 1) return 0;
    var acc = 0;
    for (var k = 1; k < L; k++) acc += upCost(k);
    return acc;
  }
  function levelFromTotal(t) {
    if (!(t > 0)) return 1;
    var L = 1, acc = 0;
    while (L < MAX_LEVEL) {
      var next = acc + upCost(L);
      if (t >= next) { acc = next; L++; }
      else break;
    }
    return L;
  }
  // 打工：速率 = 20*(1+(F-1)*0.1) / 秒；关注 ×10；累计上限 = 1000*1.5^(F-1)
  function workRate(F, followed) {
    var base = 20 * (1 + (F - 1) * 0.1);
    return Math.round(base * (followed ? 10 : 1) * 100) / 100;
  }
  function workCap(F) { return Math.round(1000 * Math.pow(1.5, F - 1)); }
  // 捕获概率：中心 50% = X/Y，边缘 = 0.5X/Y（>1 时必捕获）
  function catchProb(gunP, cap) {
    return { center: Math.min(1, gunP / cap), edge: Math.min(1, 0.5 * gunP / cap) };
  }

  // ---------- 工具 ----------
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function sciParts(n) {
    if (!(n > 0)) return { c: 1, e: 0 };
    var e = Math.floor(Math.log10(n));
    return { c: n / Math.pow(10, e), e: e };
  }
  function fmt(n) {
    if (!(n > 0)) return '0';
    if (n >= SCI_THRESHOLD) {
      var s = sciParts(n);
      return s.c.toFixed(2).replace(/\.?0+$/, '') + '*10^' + s.e;
    }
    var unit2, base;
    if (n >= 1e8) { unit2 = '亿'; base = 1e8; }
    else if (n >= 1e4) { unit2 = '万'; base = 1e4; }
    else return String(Math.round(n));
    var w = n / base;
    var ws = (w >= 100 ? String(Math.round(w)) : (w % 1 === 0 ? String(w) : w.toFixed(1)));
    return ws + unit2;
  }
  function shade(hex, f) {
    var c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(function (x) { return x + x; }).join('');
    var n = parseInt(c, 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgb(' + clamp(Math.round(r + r * f), 0, 255) + ',' +
      clamp(Math.round(g + g * f), 0, 255) + ',' +
      clamp(Math.round(b + b * f), 0, 255) + ')';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------- 排行榜编码（B站 分数 ±16777216 限制，拆分存储） ----------
  function encodeScore(n) {
    if (!(n > 0) || !isFinite(n)) return 0;
    var s = sciParts(n);
    var mant = Math.round(s.c * 1000);
    var e = s.e;
    if (mant >= 10000) { mant = 1000; e += 1; }
    return clamp(e * 10000 + mant, -16777216, 16777215);
  }
  function decodeScore(enc) {
    if (enc <= 0) return 0;
    var e = Math.floor(enc / 10000);
    var mant = enc % 10000;
    return mant * Math.pow(10, e - 3);
  }

  // ---------- 状态 ----------
  var S = {
    gift: 2000, earned: 0, totalEarned: 0,
    gun: 1, settings: { sound: true, showLevel: true }
  };
  var farmLevel = 1;
  var following = false;
  var paused = false;
  var playing = false;
  var toyReady = false;
  var landscapeDismissed = false;
  var debugUnlocked = false;   // 作者本人 / 本地(file|localhost) 解锁测试福利

  // 本地测试判定：file 打开或 localhost 域名
  function isFileMode() {
    try {
      if (typeof location === 'undefined') return false;
      if (location.protocol === 'file:') return true;
      return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(location.href);
    } catch (e) { return false; }
  }
  // 作者本人判定（异步，SDK 就绪后）：getAuthorRelation().isAuthor
  function refreshDebug() {
    if (debugUnlocked) {
      $('btn-debug999').hidden = false;
      return;
    }
    if (toyReady && window.toy && typeof window.toy.getAuthorRelation === 'function') {
      window.toy.getAuthorRelation().then(function (res) {
        if (res && res.status === 'ok' && res.data && res.data.isAuthor) {
          debugUnlocked = true;
          $('btn-debug999').hidden = false;
        }
      }).catch(function () {});
    }
  }

  var W = 0, H = 0, dpr = 1, unit = 1;
  var time = 0, last = 0;
  var fishes = [], nets = [], explosions = [], parts = [];
  var bubbles = [], seaweed = [];
  var popTarget = 14;
  var spawnCount = 0;   // 累计生成鱼数，用于鱼王触发
  var aiming = false, aimAng = -Math.PI / 2, lastAng = -Math.PI / 2, aimStartX = 0, aimStartY = 0;

  // ---------- DOM ----------
  var el = {};
  function $d(id) { return document.getElementById(id); }
  function grab() {
    ['view-home', 'view-game', 'game', 'btn-start', 'btn-open-lb',
      'btn-sound-home', 'btn-fishlevel-home', 'home-level', 'home-coins', 'home-earned',
      'hud-coins', 'hud-level', 'hud-bar', 'btn-mute', 'btn-work', 'btn-pause',
      'gun-minus', 'gun-plus', 'gun-level', 'gun-price', 'gun-touch',
      'toast', 'pause-overlay', 'btn-sound-game', 'btn-fishlevel-game', 'btn-resume',
      'btn-pause-home', 'btn-debug999', 'levelup-overlay', 'levelup-new', 'btn-levelup-ok',
      'work-modal', 'btn-close-work', 'work-level', 'work-rate', 'work-follow', 'work-pending',
      'work-collected', 'work-cap', 'btn-work-collect', 'btn-work-follow', 'btn-work-check',
      'lb-modal', 'btn-close-lb', 'lb-board-tabs', 'lb-period-tabs', 'lb-note', 'lb-body',
      'landscape-overlay', 'btn-landscape-go'
    ].forEach(function (id) { el[id] = $d(id); });
  }
  function $(id) { return el[id] || (el[id] = $d(id)); }

  // ---------- 存档 ----------
  var saveTimer = null;
  function saveThrottle() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }
  function saveNow() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      localStorage.setItem(KEY_SAVE, JSON.stringify({
        gift: S.gift, earned: S.earned, totalEarned: S.totalEarned,
        gun: S.gun,
        sound: S.settings.sound, showLevel: S.settings.showLevel
      }));
    } catch (e) {}
  }
  function loadSave() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      var raw = localStorage.getItem(KEY_SAVE);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (typeof d.gift === 'number') S.gift = d.gift;
      if (typeof d.earned === 'number') S.earned = d.earned;
      if (typeof d.totalEarned === 'number') S.totalEarned = d.totalEarned;
      if (typeof d.sound === 'boolean') S.settings.sound = d.sound;
      if (typeof d.showLevel === 'boolean') S.settings.showLevel = d.showLevel;
      if (typeof d.gun === 'number') S.gun = d.gun;
    } catch (e) {}
    farmLevel = levelFromTotal(S.totalEarned);
    S.gun = clamp(S.gun, 1, maxGunLevel());
  }
  function resetGame() {
    fishes.length = 0; nets.length = 0; explosions.length = 0; parts.length = 0;
    farmLevel = levelFromTotal(S.totalEarned);
    S.gun = clamp(S.gun, 1, maxGunLevel());
    popTarget = clamp(26, 22, maxPopTarget());
    spawnFish(Math.min(popTarget, 16));
    playing = true;
    paused = false;
    updateHUD();
    updateGunUI();
    updateSettingsUI();
  }

  function maxGunLevel() { return clamp(farmLevel + 2, 1, MAX_GUN); }
  function maxFishLevel() { return farmLevel + 2; }
  function maxPopTarget() { return 40; }
  function totalCoins() { return S.gift + S.earned; }

  // ---------- 经济 ----------
  function spend(v) {
    if (S.gift >= v) S.gift -= v;
    else { v -= S.gift; S.gift = 0; S.earned -= v; if (S.earned < 0) S.earned = 0; }
    saveThrottle();
  }
  function addEarned(v) {
    S.earned += v;
    S.totalEarned += v;
    var nl = levelFromTotal(S.totalEarned);
    if (nl > farmLevel) {
      farmLevel = nl;
      if (S.gun > maxGunLevel()) { S.gun = maxGunLevel(); updateGunUI(); }
      scheduleLevelSubmit(nl);
      showLevelup(nl);
      playLevelup();
    }
    scheduleCoinSubmit();
    updateHUD();
    saveThrottle();
  }
  function farmProgress() {
    var a = threshold(farmLevel), b = threshold(farmLevel + 1);
    return clamp((S.totalEarned - a) / (b - a), 0, 1);
  }

  // ---------- SDK 懒加载（异步非阻塞） ----------
  function loadSDK() {
    try {
      if (typeof window !== 'undefined' && window.toy && typeof window.toy.getRankList === 'function') {
        toyReady = true;
        return;
      }
      var s = document.createElement('script');
      s.src = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
      s.async = true;
      s.onload = function () {
        if (typeof window.toy !== 'undefined' && window.toy) {
          toyReady = true;
          refreshDebug();
        }
      };
      s.onerror = function () { toyReady = false; };
      document.head.appendChild(s);
    } catch (e) {}
  }
  var coinSubmitTimer = null, levelSubmitTimer = null;
  function submitGlobal(board, score) {
    if (!toyReady || !window.toy || typeof window.toy.submitScore !== 'function') return;
    try { window.toy.submitScore({ board: board, score: score }).catch(function () {}); }
    catch (e) {}
  }
  function scheduleCoinSubmit() {
    clearTimeout(coinSubmitTimer);
    coinSubmitTimer = setTimeout(function () { submitGlobal(1, encodeScore(S.totalEarned)); }, 2500);
  }
  function scheduleLevelSubmit(lv) {
    clearTimeout(levelSubmitTimer);
    levelSubmitTimer = setTimeout(function () { submitGlobal(2, lv); }, 1000);
  }

  // ---------- 鱼群 ----------
  function weightedLevel(maxLv) {
    // 75% 普通鱼（低级，新手保底）+ 25% 精英鱼（接近渔场上限，高手目标）
    // 保证高级炮有同级目标，避免"等级越高越难回本"
    var lowHi = Math.max(3, maxLv - 4);
    if (Math.random() < 0.25 && maxLv > lowHi) {
      return lowHi + 1 + Math.floor(Math.random() * (maxLv - lowHi));
    }
    return 1 + Math.floor(Math.random() * lowHi);
  }
  // 体型随等级线性增长，lv20 才到最大体型（放缓梯度）
  function sizeFor(lv) {
    return Math.min(15 + (lv - 1) * 1.6, 46) * unit;
  }
  var fishGrpSeq = 0;
  // 群聚生成：鱼成组从边缘进入，组内速度相近，保持聚团（高手打鱼群）
  function spawnGroup(size, maxLv, grp) {
    var side = Math.floor(Math.random() * 4);
    var m = 60 * unit;
    var bx, by, dir;
    if (side === 0) { bx = Math.random() * W; by = -m; dir = Math.PI / 2; }
    else if (side === 1) { bx = Math.random() * W; by = H + m; dir = -Math.PI / 2; }
    else if (side === 2) { bx = -m; by = Math.random() * H; dir = 0; }
    else { bx = W + m; by = Math.random() * H; dir = Math.PI; }
    var perp = dir + Math.PI / 2;
    var baseSpeed = (55 + Math.random() * 25) * unit;
    var k = 0;
    for (var i = 0; i < size; i++) {
      var lv = weightedLevel(maxLv);
      var cap = fishCapture(lv);
      var r = sizeFor(lv);
      var off = (k - (size - 1) / 2) * (r * 1.8);
      fishes.push({
        x: bx + Math.cos(perp) * off, y: by + Math.sin(perp) * off,
        ang: dir + (Math.random() - 0.5) * 0.4,
        speed: baseSpeed * (1 + (Math.random() - 0.5) * 0.16) * (1 - Math.min(0.45, (lv - 1) * 0.04)),
        turn: 0.3 + Math.random() * 0.9,
        r: r, lv: lv, capture: cap, value: fishValue(lv),
        color: FISH_COLORS[Math.floor(Math.random() * FISH_COLORS.length)],
        grp: grp
      });
      k++;
      spawnCount++;
    }
  }
  // 大鱼群：20~30 条聚团涌入，是玩家一炮多鱼的高回报目标
  function spawnBigGroup(size, maxLv) {
    var side = Math.floor(Math.random() * 4);
    var m = 60 * unit;
    var bx, by, dir;
    if (side === 0) { bx = Math.random() * W; by = -m; dir = Math.PI / 2; }
    else if (side === 1) { bx = Math.random() * W; by = H + m; dir = -Math.PI / 2; }
    else if (side === 2) { bx = -m; by = Math.random() * H; dir = 0; }
    else { bx = W + m; by = Math.random() * H; dir = Math.PI; }
    var perp = dir + Math.PI / 2;
    var baseSpeed = (50 + Math.random() * 22) * unit;
    var grp = ++fishGrpSeq;
    var cols = Math.ceil(Math.sqrt(size * 1.35));
    for (var i = 0; i < size; i++) {
      var lv = weightedLevel(maxLv);
      var cap = fishCapture(lv);
      var r = sizeFor(lv);
      var row = Math.floor(i / cols), col = i % cols;
      var offP = (col - (cols - 1) / 2) * (r * 2.3);
      var offD = (row - 0.5) * (r * 2.3);
      fishes.push({
        x: bx + Math.cos(perp) * offP + Math.cos(dir) * offD,
        y: by + Math.sin(perp) * offP + Math.sin(dir) * offD,
        ang: dir + (Math.random() - 0.5) * 0.3,
        speed: baseSpeed * (1 + (Math.random() - 0.5) * 0.12) * (1 - Math.min(0.45, (lv - 1) * 0.04)),
        turn: 0.2 + Math.random() * 0.6,
        r: r, lv: lv, capture: cap, value: fishValue(lv),
        color: FISH_COLORS[Math.floor(Math.random() * FISH_COLORS.length)],
        grp: grp
      });
      spawnCount++;
    }
  }
  // 鱼王触发：累计生成 300~1000 条，越多几率越高，1000 条必出
  function tryKingSpawn() {
    if (spawnCount < 300) return;
    var p = (spawnCount - 300) / 700;
    if (Math.random() < p) {
      spawnKingFish();
      spawnCount = 0;
    }
  }
  // 鱼王：金色通体 + 特效，等级=当前渔场等级，价值=同级鱼 10~25 倍，固定从左向右游
  function spawnKingFish() {
    if (fishes.length >= MAX_FISH) return;
    var lv = farmLevel;
    var cap = fishCapture(lv);
    var r = Math.min(sizeFor(lv) * 1.35, 52 * unit);
    var y = 50 * unit + Math.random() * Math.max(40 * unit, H - 100 * unit);
    var mult = 10 + Math.floor(Math.random() * 16);   // 10~25 倍
    var value = fishValue(lv) * mult;
    showToast('💰 鱼王出现！价值 ' + fmt(value));
    spawnKingFx(30 * unit, y);
    fishes.push({
      x: -60 * unit, y: y, ang: 0,
      speed: (65 + Math.random() * 25) * unit,
      turn: 0, r: r, lv: lv, capture: cap, value: value,
      color: '#ffd700', king: true, grp: -1
    });
  }
  // 鱼王出现提示特效：金币粒子环绕 + 大字
  function spawnKingFx(x, y) {
    for (var i = 0; i < 14; i++) {
      var a = i / 14 * Math.PI * 2;
      parts.push({
        x: x + Math.cos(a) * 12 * unit, y: y + Math.sin(a) * 12 * unit,
        vx: Math.cos(a) * 70 * unit, vy: Math.sin(a) * 70 * unit,
        life: 0, dur: 0.8, coin: true, color: '#ffe08a', r: 4 * unit
      });
    }
    parts.push({ x: x, y: y - 24 * unit, vy: 45 * unit, life: 0, dur: 1.3, text: '鱼王出现！', color: '#ffd700', fs: 26 });
  }
  function spawnFish(count) {
    var maxLv = maxFishLevel();
    // 10% 概率生成大鱼群（20~30 条）
    if (Math.random() < 0.1 && fishes.length + 20 < MAX_FISH) {
      spawnBigGroup(20 + Math.floor(Math.random() * 11), maxLv);
      tryKingSpawn();
      return;
    }
    for (var g = 0; g < count;) {
      var size = Math.min(2 + Math.floor(Math.random() * 5), count - g);
      spawnGroup(size, maxLv, ++fishGrpSeq);
      g += size;
    }
    tryKingSpawn();
  }
  // 把角度 ang 向 target 旋转不超过 maxStep
  function rotateToward(ang, target, maxStep) {
    var d = target - ang;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) <= maxStep) return target;
    return ang + (d > 0 ? maxStep : -maxStep);
  }
  function updateFish(dt) {
    var m = 80 * unit;
    for (var i = fishes.length - 1; i >= 0; i--) {
      var f = fishes[i];
      // 群聚：偏离同组太远时微转向靠近，保持鱼群形态
      if (f.grp >= 0) {
        var nn = null, nd = Infinity;
        for (var j = 0; j < fishes.length; j++) {
          var o = fishes[j];
          if (o === f || o.grp !== f.grp) continue;
          var qx = o.x - f.x, qy = o.y - f.y;
          var qd = qx * qx + qy * qy;
          if (qd < nd) { nd = qd; nn = o; }
        }
        if (nn && nd > 0) {
          var d = Math.sqrt(nd);
          var keep = (f.r + nn.r) * 3.4;
          if (d > keep) {
            f.ang = rotateToward(f.ang, Math.atan2(nn.y - f.y, nn.x - f.x), 0.9 * dt);
          } else if (d < keep * 0.5) {
            f.ang = rotateToward(f.ang, f.ang + Math.PI, 0.5 * dt); // 太近略散开
          }
        }
      }
      f.ang += (Math.random() - 0.5) * 2 * f.turn * dt;
      f.x += Math.cos(f.ang) * f.speed * dt;
      f.y += Math.sin(f.ang) * f.speed * dt;
      if (f.x < -m || f.x > W + m || f.y < -m || f.y > H + m) fishes.splice(i, 1);
    }
    var minP = 22, maxP = maxPopTarget();
    popTarget += (Math.random() - 0.5) * 0.12;
    popTarget = clamp(popTarget, minP, maxP);
    if (fishes.length < popTarget && fishes.length < MAX_FISH && Math.random() < 0.06) {
      spawnFish(2 + Math.floor(Math.random() * 3));
    }
  }

  // ---------- 炮 / 渔网 ----------
  function gunPos() { return { x: W / 2, y: H - 44 - gunR() }; }  // 贴底，位于炮等级控件上方
  function gunR() { return Math.min(30, 18 + S.gun * 1.2) * unit; }
  // 爆炸半径：低级炮渔网更大（初期好回本），随等级收敛到 50，封顶 150*unit
  function explosionR() {
    var k = Math.max(50, 62 - (S.gun - 1) * 1.5);
    return Math.min(k * Math.pow(fishCapture(S.gun) / 100, 0.33), 150) * unit;
  }
  function fire(ang) {
    if (paused || !playing) return;
    var price = gunPrice(S.gun);
    if (totalCoins() < price) {
      showToast('金币不足，去打工赚钱吧');
      playDeny();
      return;
    }
    spend(price);
    var p = gunPos();
    nets.push({ x: p.x, y: p.y, ang: ang, speed: 1250 * unit, r: 5 * unit, traveled: 0, max: 2600 * unit });
    playFire();
    updateHUD();
  }
  function updateNets(dt) {
    var step = 0;
    for (var i = nets.length - 1; i >= 0; i--) {
      var n = nets[i];
      step = n.speed * dt;
      var segs = Math.max(1, Math.ceil(step / (7 * unit)));
      var sx = n.x, sy = n.y, done = false;
      for (var s = 0; s < segs; s++) {
        var px = sx + Math.cos(n.ang) * step / segs;
        var py = sy + Math.sin(n.ang) * step / segs;
        n.traveled += step / segs;
        for (var j = fishes.length - 1; j >= 0; j--) {
          var f = fishes[j];
          var dx = px - f.x, dy = py - f.y;
          if (dx * dx + dy * dy < (f.r + n.r) * (f.r + n.r)) {
            explodeAt(px, py);
            done = true;
            break;
          }
        }
        if (done) break;
        sx = px; sy = py;
      }
      if (done) { nets.splice(i, 1); continue; }
      if (n.traveled >= n.max) {
        explodeAt(sx, sy);
        nets.splice(i, 1);
        continue;
      }
      n.x = sx; n.y = sy;
    }
  }
  function explodeAt(x, y) {
    explosions.push({ x: x, y: y, r: explosionR(), life: 0, dur: 0.5 });
    var R = explosionR();
    var gunP = gunPower(S.gun);
    for (var i = fishes.length - 1; i >= 0; i--) {
      var f = fishes[i];
      var dx = f.x - x, dy = f.y - y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d <= R + f.r * 0.5) {
        var center = d <= R * 0.5;
        var prob = center ? Math.min(1, gunP / f.capture) : Math.min(1, 0.5 * gunP / f.capture);
        if (Math.random() < prob) {
          fishes.splice(i, 1);
          addEarned(f.value);
          spawnCoinFx(f.x, f.y, f.value, !!f.king);
          playCoin();
        }
      }
    }
  }
  function updateExplosions(dt) {
    for (var i = explosions.length - 1; i >= 0; i--) {
      explosions[i].life += dt;
      if (explosions[i].life >= explosions[i].dur) explosions.splice(i, 1);
    }
  }
  function spawnCoinFx(x, y, val, big) {
    parts.push({
      x: x, y: y, vy: 60 * unit, life: 0, dur: big ? 1.3 : 0.9,
      text: '+' + fmt(val), color: '#ffd66b', fs: big ? 36 : 24
    });
    for (var i = 0; i < (big ? 12 : 6); i++) {
      parts.push({
        x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 30,
        vy: (40 + Math.random() * 40) * unit, life: 0, dur: 0.6 + Math.random() * 0.3,
        coin: true, color: '#ffe08a', r: 3 * unit
      });
    }
  }
  function updateParticles(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life += dt;
      p.x += (p.vx || 0) * dt;
      p.y -= p.vy * dt;
      if (p.life > p.dur) parts.splice(i, 1);
    }
  }

  // ---------- 打工 ----------
  var workTimer = null, workPending = 0;
  function openWork() {
    // 总金币未超过打工上限即可打工（领取后总金币不得超过上限）
    if (totalCoins() >= workCap(farmLevel)) {
      showToast('你的金币充足，继续捕鱼吧！');
      playDeny();
      return;
    }
    workPending = 0;
    $('work-modal').hidden = false;
    paused = true;
    updateWorkUI();
    clearInterval(workTimer);
    workTimer = setInterval(workTick, 200);
  }
  function closeWork() {
    clearInterval(workTimer);
    workTimer = null;
    workPending = 0;
    $('work-modal').hidden = true;
    paused = false;
  }
  function workTick() {
    var cap = workCap(farmLevel);
    var left = cap - totalCoins();   // 领取后总金币不得超过上限
    if (left <= 0) { updateWorkUI(); return; }
    var gain = workRate(farmLevel, following) * 0.2;
    if (gain > left) gain = left;
    workPending += gain;
    updateWorkUI();
  }
  function collectWork() {
    if (workPending <= 0) { showToast('还没有可领取的金币'); return; }
    S.gift += workPending;
    workPending = 0;
    playUI();
    updateWorkUI();
    updateHUD();
    saveThrottle();
    showToast('领取成功');
  }
  function checkFollow() {
    if (!toyReady || !window.toy || typeof window.toy.getAuthorRelation !== 'function') {
      showToast('B站环境不可用，无法检测关注');
      return;
    }
    window.toy.getAuthorRelation().then(function (res) {
      if (res && res.status === 'ok' && res.data) {
        following = !!res.data.isFollowing;
      }
      updateWorkUI();
      showToast(following ? '已关注，领取×10' : '未检测到关注');
    }).catch(function () {
      updateWorkUI();
      showToast('检测失败，请重试');
    });
  }
  function jumpToSpace() {
    function fallback() {
      var url = 'https://space.bilibili.com/' + AUTHOR_UID;
      try {
        if (window.open) {
          var win = window.open(url, '_blank');
          if (win) return;
        }
        window.location.href = url;
      } catch (e) { try { window.location.href = url; } catch (e2) {} }
    }
    if (toyReady && window.toy && typeof window.toy.navigate === 'function') {
      window.toy.navigate({ type: 'space', id: AUTHOR_UID }).catch(fallback);
    } else {
      fallback();
    }
  }
  function updateWorkUI() {
    var rate = workRate(farmLevel, following);
    var cap = workCap(farmLevel);
    var left = Math.max(0, cap - totalCoins());
    $('work-level').textContent = farmLevel;
    $('work-rate').textContent = fmt(rate);
    $('work-follow').textContent = following ? '已关注（领取×10）' : '未关注';
    $('work-follow').classList.toggle('followed', following);
    $('work-pending').textContent = fmt(Math.floor(workPending));
    $('work-collected').textContent = fmt(Math.floor(left));
    $('work-cap').textContent = fmt(cap);
  }

  // ---------- 音效（WebAudio 合成） ----------
  var actx = null, master = null;
  function isMuted() { return !S.settings.sound; }
  function ensureAudio() {
    if (isMuted()) return;
    if (!actx) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          actx = new AC();
          master = actx.createGain();
          master.gain.value = 0.35;
          master.connect(actx.destination);
        }
      } catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') actx.resume().catch(function () {});
  }
  function noiseBurst(dur, freq, vol) {
    if (!actx || !master) return;
    var n = actx.createBufferSource();
    var len = Math.floor(actx.sampleRate * dur);
    var buf = actx.createBuffer(1, len, actx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    n.buffer = buf;
    var f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    var g = actx.createGain(); g.gain.value = vol;
    n.connect(f); f.connect(g); g.connect(master);
    n.start();
  }
  function tone(freq, t0, dur, vol) {
    if (!actx || !master) return;
    var o = actx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    var g = actx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function playFire() { noiseBurst(0.22, 480, 0.8); }
  function playCoin() {
    if (!actx) return;
    [880, 1174, 1568].forEach(function (fq, i) { tone(fq, actx.currentTime + i * 0.07, 0.24, 0.11); });
  }
  function playLevelup() {
    if (!actx) return;
    [523, 659, 784, 1046].forEach(function (fq, i) { tone(fq, actx.currentTime + i * 0.1, 0.3, 0.13); });
  }
  function playDeny() { noiseBurst(0.18, 170, 0.6); }
  function playUI() {
    if (!actx) return;
    tone(660, actx.currentTime, 0.08, 0.08);
  }

  // ---------- UI ----------
  var toastTimer = null;
  function showToast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 1800);
  }
  function showView(id) {
    $('view-home').classList.toggle('active', id === 'view-home');
    $('view-game').classList.toggle('active', id === 'view-game');
    if (id === 'view-home') refreshHome();
  }
  function refreshHome() {
    $('home-level').textContent = farmLevel + ' 级';
    $('home-coins').textContent = fmt(totalCoins());
    $('home-earned').textContent = fmt(S.totalEarned);
    updateSettingsUI();
  }
  function updateHUD() {
    $('hud-coins').textContent = fmt(totalCoins());
    $('hud-level').textContent = farmLevel;
    $('hud-bar').style.width = (farmProgress() * 100).toFixed(1) + '%';
    $('hud-bar-pct').textContent = Math.round(farmProgress() * 100) + '%';
    $('gun-level').textContent = S.gun;
    $('gun-price').textContent = fmt(gunPrice(S.gun));
    $('btn-mute').textContent = isMuted() ? '🔇' : '🔊';
    refreshHome();
  }
  function updateGunUI() {
    $('gun-level').textContent = S.gun;
    $('gun-price').textContent = fmt(gunPrice(S.gun));
  }
  function updateSettingsUI() {
    var s = S.settings;
    $('btn-sound-home').textContent = s.sound ? '开' : '关';
    $('btn-sound-home').classList.toggle('on', s.sound);
    $('btn-sound-game').textContent = s.sound ? '开' : '关';
    $('btn-sound-game').classList.toggle('on', s.sound);
    $('btn-fishlevel-home').textContent = s.showLevel ? '开' : '关';
    $('btn-fishlevel-home').classList.toggle('on', s.showLevel);
    $('btn-fishlevel-game').textContent = s.showLevel ? '开' : '关';
    $('btn-fishlevel-game').classList.toggle('on', s.showLevel);
  }
  function toggleSound() {
    S.settings.sound = !S.settings.sound;
    if (S.settings.sound) ensureAudio();
    updateSettingsUI();
    updateHUD();
    saveThrottle();
  }
  function toggleShowLevel() {
    S.settings.showLevel = !S.settings.showLevel;
    updateSettingsUI();
    saveThrottle();
  }
  function showLevelup(nl) {
    $('levelup-new').textContent = nl;
    $('levelup-overlay').hidden = false;
    paused = true;
  }

  // ---------- 排行榜 ----------
  var lbBoard = 1, lbPeriod = 'all';
  function loadLB(cb) {
    if (!toyReady || !window.toy) { cb(null, null); return; }
    try {
      Promise.all([
        window.toy.getRankList({ board: lbBoard, period: lbPeriod, limit: GLOBAL_TOP }).catch(function () { return null; }),
        window.toy.getMyRank({ board: lbBoard, period: lbPeriod }).catch(function () { return null; })
      ]).then(function (res) { cb(res[0], res[1]); });
    } catch (e) { cb(null, null); }
  }
  function openLB() {
    $('lb-modal').hidden = false;
    paused = true;
    renderLBTabs();
    $('lb-body').innerHTML = '<div class="lb-tip">加载中…</div>';
    $('lb-note').textContent = '';
    loadLB(function (list, my) {
      renderLB(list, my);
    });
  }
  function closeLB() {
    $('lb-modal').hidden = true;
    paused = false;
  }
  function renderLBTabs() {
    var bs = $('lb-board-tabs').querySelectorAll('.tab');
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('active', Number(bs[i].getAttribute('data-board')) === lbBoard);
    var ps = $('lb-period-tabs').querySelectorAll('.tab');
    for (var j = 0; j < ps.length; j++) ps[j].classList.toggle('active', ps[j].getAttribute('data-period') === lbPeriod);
  }
  function renderLB(list, my) {
    if (!list) {
      $('lb-body').innerHTML = '<div class="lb-tip">B站排行榜暂不可用（SDK 未就绪）</div>';
      $('lb-note').textContent = '';
      return;
    }
    if (!list.length) {
      $('lb-body').innerHTML = '<div class="lb-tip">暂无上榜玩家</div>';
      $('lb-note').textContent = '';
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var sc = (lbBoard === 1) ? fmt(decodeScore(it.score)) : String(it.score);
      var isMe = my && my.ranked && it.rank === my.rank;
      html += '<div class="lb-row' + (isMe ? ' me' : '') + '">' +
        '<div class="lb-rank r' + (it.rank <= 3 ? it.rank : '') + '">' + it.rank + '</div>' +
        '<div class="lb-avatar">' + (it.avatar ? '<img src="' + esc(it.avatar) + '" alt="">' : '') + '</div>' +
        '<div class="lb-name">' + esc(it.nickname) + '</div>' +
        '<div class="lb-score">' + sc + '</div></div>';
    }
    $('lb-body').innerHTML = html;
    $('lb-note').textContent = my && my.ranked ? ('我的排名：第 ' + my.rank + ' 名') : '';
  }

  // ---------- 渲染 ----------
  function drawBackground() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b3d63');
    g.addColorStop(0.62, '#07345a');
    g.addColorStop(1, '#052a4c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 海底沙带
    var sand = ctx.createLinearGradient(0, H - 12 * unit, 0, H);
    sand.addColorStop(0, 'rgba(210,185,120,0)');
    sand.addColorStop(1, 'rgba(200,172,105,0.4)');
    ctx.fillStyle = sand;
    ctx.fillRect(0, H - 12 * unit, W, 12 * unit);
    // 海草
    for (var i = 0; i < seaweed.length; i++) {
      var s = seaweed[i];
      ctx.strokeStyle = 'rgba(40,140,80,0.5)';
      ctx.lineWidth = 2.5 * unit;
      ctx.lineCap = 'round';
      ctx.beginPath();
      var py = H - 4 * unit;
      ctx.moveTo(s.x, py);
      var segs = 6;
      for (var j = 1; j <= segs; j++) {
        var yy = py - (s.h * j / segs);
        var xx = s.x + Math.sin(time * s.spd + s.phase + j * 0.9) * s.h * 0.09 * j / segs;
        ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
    // 气泡
    for (var k = 0; k < bubbles.length; k++) {
      var b = bubbles[k];
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(190,225,255,0.32)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  function updateBubbles(dt) {
    for (var i = 0; i < bubbles.length; i++) {
      var b = bubbles[i];
      b.y -= b.spd * dt;
      b.x += Math.sin(time * 1.5 + b.phase) * 5 * unit * dt;
      if (b.y < -12) { b.y = H + 12; b.x = Math.random() * W; }
    }
  }
  function drawFish(f) {
    var bc = f.color;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.ang);
    // 鱼王金色光晕（闪烁特效）
    if (f.king) {
      ctx.fillStyle = 'rgba(255,215,0,' + (0.12 + 0.08 * Math.sin(time * 6)) + ')';
      ctx.beginPath();
      ctx.arc(0, 0, f.r * 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // 尾鳍（深色三角）
    ctx.fillStyle = shade(bc, -0.25);
    ctx.beginPath();
    ctx.moveTo(-f.r * 0.55, -f.r * 0.48);
    ctx.lineTo(-f.r * 1.35, 0);
    ctx.lineTo(-f.r * 0.55, f.r * 0.48);
    ctx.closePath();
    ctx.fill();
    // 下鱼鳍（曲线）
    ctx.fillStyle = shade(bc, 0.12);
    ctx.beginPath();
    ctx.moveTo(-f.r * 0.12, f.r * 0.08);
    ctx.quadraticCurveTo(-f.r * 0.32, f.r * 0.9, f.r * 0.28, f.r * 0.6);
    ctx.quadraticCurveTo(f.r * 0.1, f.r * 0.34, -f.r * 0.12, f.r * 0.08);
    ctx.closePath();
    ctx.fill();
    // 背鳍（曲线）
    ctx.fillStyle = shade(bc, 0.05);
    ctx.beginPath();
    ctx.moveTo(f.r * 0.05, -f.r * 0.4);
    ctx.quadraticCurveTo(f.r * 0.3, -f.r * 1.05, f.r * 0.75, -f.r * 0.32);
    ctx.closePath();
    ctx.fill();
    // 身体（渐变：尾深头亮）
    var g = ctx.createLinearGradient(-f.r, 0, f.r, 0);
    g.addColorStop(0, shade(bc, -0.18));
    g.addColorStop(0.55, bc);
    g.addColorStop(1, shade(bc, 0.15));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, f.r, f.r * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    // 眼睛
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(f.r * 0.42, -f.r * 0.2, f.r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16233a';
    ctx.beginPath();
    ctx.arc(f.r * 0.48, -f.r * 0.2, f.r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 等级数字（不随鱼旋转，鱼头上方描边文字）
    if (S.settings.showLevel) {
      ctx.save();
      ctx.font = '700 ' + Math.max(11, Math.round(f.r * 0.72)) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = Math.max(2, f.r * 0.16);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(4,10,24,0.85)';
      ctx.strokeText(f.lv, f.x, f.y - f.r - 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(f.lv, f.x, f.y - f.r - 4);
      ctx.restore();
    }
  }
  function drawNet(n) {
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  function drawExplosion(ex) {
    var p = clamp(ex.life / ex.dur, 0, 1);
    var R = ex.r * (0.3 + 0.7 * p);
    ctx.save();
    ctx.globalAlpha = 1 - p * 0.85;
    ctx.strokeStyle = 'rgba(215,240,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, R * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, R * 0.32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(ex.x + Math.cos(a) * R * 0.32, ex.y + Math.sin(a) * R * 0.32);
      ctx.lineTo(ex.x + Math.cos(a) * R, ex.y + Math.sin(a) * R);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawGun() {
    var g = gunPos(), r = gunR();
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(aimAng);
    // 炮管（短一些）
    ctx.beginPath();
    ctx.moveTo(r * 0.2, -r * 0.34);
    ctx.lineTo(r * 1.6, -r * 0.18);
    ctx.lineTo(r * 1.6, r * 0.18);
    ctx.lineTo(r * 0.2, r * 0.34);
    ctx.closePath();
    ctx.fillStyle = '#3d566e';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 炮口
    ctx.beginPath();
    ctx.arc(r * 1.6, 0, r * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = '#5d7d9a';
    ctx.fill();
    // 底座
    var grad = ctx.createRadialGradient(0, -r * 0.3, 0, 0, 0, r);
    grad.addColorStop(0, '#5d8fb0');
    grad.addColorStop(1, '#1d3f5c');
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 等级
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.66, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.max(11, Math.round(r * 0.72)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(S.gun, 0, 0);
    ctx.restore();
  }
  function drawAim() {
    if (!aiming) return;
    var g = gunPos();
    ctx.save();
    ctx.setLineDash([6, 9]);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.x, g.y);
    ctx.lineTo(g.x + Math.cos(aimAng) * (W + H), g.y + Math.sin(aimAng) * (W + H));
    ctx.stroke();
    ctx.restore();
  }
  function drawParticles() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var a = 1 - clamp(p.life / p.dur, 0, 1);
      ctx.globalAlpha = a;
      if (p.coin) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      } else {
        var fs = p.fs || 22;
        ctx.font = '700 ' + fs + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(3, fs / 4);
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(60,25,0,0.85)';
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 主循环 ----------
  function update(dt) {
    time += dt;
    updateBubbles(dt);
    updateFish(dt);
    updateNets(dt);
    updateExplosions(dt);
    updateParticles(dt);
  }
  function render() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    for (var i = 0; i < fishes.length; i++) drawFish(fishes[i]);
    for (var j = 0; j < nets.length; j++) drawNet(nets[j]);
    for (var k = 0; k < explosions.length; k++) drawExplosion(explosions[k]);
    drawGun();
    drawAim();
    drawParticles();
  }
  function loop(t) {
    var dt = Math.min(0.05, (t - last) / 1000 || 0);
    last = t;
    if (!paused) update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ---------- 画布 / 尺寸 ----------
  function resize() {
    W = window.innerWidth || 320;
    H = window.innerHeight || 480;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    var c = $('game');
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    unit = Math.min(W, H) / 540;
    positionGunTouch();
    seaweed.length = 0;
    var n = Math.max(8, Math.floor(W / 90));
    for (var i = 0; i < n; i++) {
      seaweed.push({
        x: 20 + Math.random() * (W - 40), h: (22 + Math.random() * 46) * unit,
        phase: Math.random() * Math.PI * 2, spd: 0.6 + Math.random() * 1.2
      });
    }
    bubbles.length = 0;
    var nb = Math.floor(W * H / 26000);
    for (var k = 0; k < nb; k++) {
      bubbles.push({
        x: Math.random() * W, y: Math.random() * H,
        r: (1.5 + Math.random() * 3) * unit, spd: (10 + Math.random() * 20) * unit,
        phase: Math.random() * Math.PI * 2
      });
    }
    checkLandscape();
  }
  function positionGunTouch() {
    var g = gunPos();
    var tr = Math.max(gunR() * 1.6, 36 * unit);
    var t = $('gun-touch');
    t.style.left = (g.x - tr) + 'px';
    t.style.top = (g.y - tr) + 'px';
    t.style.width = t.style.height = (tr * 2) + 'px';
  }
  function checkLandscape() {
    var isTouch = false;
    try { isTouch = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0; } catch (e) {}
    if (!landscapeDismissed && W < H && W < 640 && isTouch) $('landscape-overlay').hidden = false;
    else $('landscape-overlay').hidden = true;
  }

  // ---------- 事件 ----------
  function onGunDown(e) {
    e.preventDefault();
    aiming = true;
    aimStartX = e.clientX || 0;
    aimStartY = e.clientY || 0;
    var r = aimDir(e.clientX || 0, e.clientY || 0);
    aimAng = r.ang;
    ensureAudio();
    try { $('gun-touch').setPointerCapture(e.pointerId); } catch (e2) {}
  }
  function onGunMove(e) {
    if (!aiming) return;
    var dx = (e.clientX || 0) - aimStartX, dy = (e.clientY || 0) - aimStartY;
    if (dx * dx + dy * dy > 140) {
      var r = aimDir(e.clientX || 0, e.clientY || 0);
      if (!r.near) aimAng = r.ang;
    }
  }
  function onGunUp(e) {
    if (!aiming) return;
    aiming = false;
    fire(aimAng);
    lastAng = aimAng;
  }
  function aimDir(px, py) {
    var g = gunPos();
    var dx = px - g.x, dy = py - g.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < gunR() * 1.1) return { ang: lastAng, near: true };
    return { ang: Math.atan2(dy, dx), near: false };
  }
  function bindEvents() {
    // 点击画面任意处 → 朝点击方向发射渔网（炮口瞄准拖动仍可用）
    $('game').addEventListener('pointerdown', function (e) {
      if (paused || !playing) return;
      var p = gunPos();
      var ang = Math.atan2((e.clientY || 0) - p.y, (e.clientX || 0) - p.x);
      lastAng = ang;
      aimAng = ang;   // 炮口跟随点击方向
      fire(ang);
      ensureAudio();
    });
    var t = $('gun-touch');
    t.addEventListener('pointerdown', onGunDown);
    t.addEventListener('pointermove', onGunMove);
    t.addEventListener('pointerup', onGunUp);
    t.addEventListener('pointercancel', onGunUp);

    $('btn-start').addEventListener('click', function () {
      ensureAudio();
      resetGame();
      showView('view-game');
    });
    $('btn-open-lb').addEventListener('click', openLB);
    $('btn-close-lb').addEventListener('click', closeLB);
    $('btn-sound-home').addEventListener('click', toggleSound);
    $('btn-sound-game').addEventListener('click', toggleSound);
    $('btn-fishlevel-home').addEventListener('click', toggleShowLevel);
    $('btn-fishlevel-game').addEventListener('click', toggleShowLevel);
    $('btn-mute').addEventListener('click', toggleSound);
    $('btn-work').addEventListener('click', openWork);
    $('btn-close-work').addEventListener('click', closeWork);
    $('btn-work-collect').addEventListener('click', collectWork);
    $('btn-work-follow').addEventListener('click', jumpToSpace);
    $('btn-work-check').addEventListener('click', checkFollow);
    $('btn-pause').addEventListener('click', function () {
      if (!playing) return;
      paused = true;
      $('pause-overlay').hidden = false;
      updateSettingsUI();
      refreshDebug();
    });
    $('btn-debug999').addEventListener('click', function () {
      addEarned(99999);
      updateGunUI();
      showToast('测试福利：+99999 捕鱼收入');
    });
    $('btn-resume').addEventListener('click', function () {
      $('pause-overlay').hidden = true;
      paused = false;
    });
    $('btn-pause-home').addEventListener('click', function () {
      $('pause-overlay').hidden = true;
      playing = false;
      paused = false;
      saveNow();
      showView('view-home');
    });
    $('btn-levelup-ok').addEventListener('click', function () {
      $('levelup-overlay').hidden = true;
      paused = false;
    });
    $('gun-plus').addEventListener('click', function () {
      var mx = maxGunLevel();
      if (S.gun >= mx) { showToast('已达渔场最高炮等级'); return; }
      S.gun++;
      updateGunUI();
      updateHUD();
      saveThrottle();
      playUI();
    });
    $('gun-minus').addEventListener('click', function () {
      if (S.gun <= 1) return;
      S.gun--;
      updateGunUI();
      updateHUD();
      saveThrottle();
      playUI();
    });
    $('btn-landscape-go').addEventListener('click', function () {
      landscapeDismissed = true;
      $('landscape-overlay').hidden = true;
    });

    // 排行榜 tab
    var btns = $('lb-board-tabs').querySelectorAll('.tab');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          lbBoard = Number(b.getAttribute('data-board'));
          renderLBTabs();
          $('lb-body').innerHTML = '<div class="lb-tip">加载中…</div>';
          loadLB(function (list, my) { renderLB(list, my); });
        });
      })(btns[i]);
    }
    var pts = $('lb-period-tabs').querySelectorAll('.tab');
    for (var j = 0; j < pts.length; j++) {
      (function (b) {
        b.addEventListener('click', function () {
          lbPeriod = b.getAttribute('data-period');
          renderLBTabs();
          $('lb-body').innerHTML = '<div class="lb-tip">加载中…</div>';
          loadLB(function (list, my) { renderLB(list, my); });
        });
      })(pts[j]);
    }

    window.addEventListener('resize', function () { resize(); });
    window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
    document.addEventListener('pointerdown', ensureAudio, true);
  }

  // ---------- 初始化 ----------
  function init() {
    var c = $('game');
    ctx = c.getContext('2d');
    grab();
    debugUnlocked = isFileMode();
    refreshDebug();
    loadSave();
    resize();
    updateSettingsUI();
    updateHUD();
    bindEvents();
    loadSDK();
    last = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    requestAnimationFrame(loop);
  }
  var ctx = null;

  if (typeof document !== 'undefined' && document.getElementById) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  // ---------- Node 单测导出 ----------
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      gunPrice: gunPrice, gunPower: gunPower, gunRange: gunRange,
      fishCapture: fishCapture, fishValue: fishValue,
      upCost: upCost, threshold: threshold, levelFromTotal: levelFromTotal,
      workRate: workRate, workCap: workCap,
      fmt: fmt, sciParts: sciParts, encodeScore: encodeScore, decodeScore: decodeScore,
      sizeFor: sizeFor, catchProb: catchProb, weightedLevel: weightedLevel,
      MAX_FISH: MAX_FISH,
      getCoins: function () { return totalCoins(); },
      getGift: function () { return S.gift; },
      getEarned: function () { return S.earned; },
      getTotalEarned: function () { return S.totalEarned; },
      getFarmLevel: function () { return farmLevel; },
      getGun: function () { return S.gun; },
      setGun: function (l) { S.gun = clamp(l, 1, maxGunLevel()); updateGunUI(); },
      fishCount: function () { return fishes.length; },
      fishList: function () { return fishes.map(function (f) { return { x: f.x, y: f.y, lv: f.lv, capture: f.capture, value: f.value, r: f.r, king: !!f.king }; }); },
      spawnKingFish: spawnKingFish,
      addEarned: addEarned, spend: spend, fire: fire, explodeAt: explodeAt,
      spawnFish: spawnFish, clearFishes: function () { fishes.length = 0; },
      saveNow: saveNow, resetGame: resetGame,
      setPaused: function (v) { paused = !!v; },
      getAimAng: function () { return aimAng; },
      state: function () { return { paused: paused, playing: playing, fish: fishes.length, nets: nets.length, ex: explosions.length }; }
    };
  }
})();
