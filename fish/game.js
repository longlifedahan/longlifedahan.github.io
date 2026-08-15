/* 大鱼吃小鱼：游戏逻辑 + UI（首页 / 游戏 / 暂停结算 / 本地与 B站 双榜） */
(function () {
  'use strict';

  // ---------- 常量 ----------
  var START_NUM = 10;           // 玩家初始数字
  var SCI_THRESHOLD = 1e16;     // 超过亿亿（1e16）用 A.BC*10^K 形式
  var PLAYER_SPEED_MULT = 1.2;  // 玩家速度 = 基础速度 × 1.2
  var MAX_FISH = 15;            // 画面同时最多 15 条鱼
  var TIMID_RATIO = 0.2;        // 20% 胆小型（远离你）
  var BRAVE_RATIO = 0.1;        // 10% 攻击倾向（靠近你），其余随机游动
  var BRAVE_DROP_CHANCE = 0.2;  // 攻击倾向每 3s 有 20% 概率失去，变为随机
  var BRAVE_MAX_AGE = 15;       // 存活超 15s 自动变为随机
  var KEY_LB = 'fish.lb';
  var KEY_MUTE = 'fish.muted';
  var KEY_DIFF = 'fish.diff';
  var LOCAL_TOP = 20;
  var GLOBAL_TOP = 100;
  // 难度配置：scale = 被敌方吃时的判定箱比例；board = B站榜位（0 表示无 B站 榜）
  var DIFFS = {
    easy:   { name: '简单', scale: 0.50, board: 0 },
    normal: { name: '普通', scale: 0.70, board: 1 },
    hard:   { name: '困难', scale: 0.85, board: 2 },
    hell:   { name: '地狱', scale: 1.00, board: 3 }
  };
  var DIFF_ORDER = ['easy', 'normal', 'hard', 'hell'];
  var PERIODS = ['all', 'month', 'week', 'day'];
  var PERIOD_NAMES = { all: '总榜', month: '月榜', week: '周榜', day: '日榜' };

  // ---------- 状态 ----------
  var state = 'menu';           // menu | playing | paused | dying | over
  var W = 0, H = 0, dpr = 1;
  var player = null;
  var fishes = [];
  var particles = [];
  var floaters = [];
  var bubbles = [];
  var worldDots = [];           // 世界空间装饰（随镜头滚动，提供移动反馈）
  var pointer = { down: false, x: 0, y: 0, id: null, kind: 'touch' };
  var joy = { active: false, dx: 0, dy: 0, mag: 0, id: null };   // 底部摇杆
  var elapsed = 0;
  var last = 0;
  var death = null;             // 死亡动画 { t, killer }
  var hurtFlash = 0;            // 掉血红屏
  var toyReady = false;
  var muted = false;
  var difficulty = 'hard';      // 当前挑战难度（默认困难）
  var lbSource = 'local';       // 排行榜：本地/B站
  var lbDiff = 'hard';          // 排行榜查看的难度
  var lbPeriod = 'all';         // 排行榜周期
  var hintT = null;

  // ---------- DOM ----------
  function $(id) { return document.getElementById(id); }
  var canvas, ctx;
  var viewHome, viewGame;
  var hudScore, hudTime;
  var gameHint;
  var pauseOverlay, overOverlay;
  var overScore, overSub;
  var lbModal, lbNote, lbBody, lbSourceTabs, lbDiffTabs, lbPeriodTabs;
  var joyEl, joyKnob;
  var bestRow;
  if (typeof document !== 'undefined') {
    canvas = $('game'); ctx = canvas.getContext('2d');
    viewHome = $('view-home'); viewGame = $('view-game');
    hudScore = $('hud-score'); hudTime = $('hud-time');
    gameHint = $('game-hint');
    pauseOverlay = $('pause-overlay'); overOverlay = $('over-overlay');
    overScore = $('over-score'); overSub = $('over-sub');
    lbModal = $('lb-modal'); lbNote = $('lb-note'); lbBody = $('lb-body');
    lbSourceTabs = $('lb-source-tabs'); lbDiffTabs = $('lb-diff-tabs'); lbPeriodTabs = $('lb-period-tabs');
    joyEl = $('joy'); joyKnob = $('joy-knob');
    bestRow = $('best-row');
  }

  // ---------- 工具 ----------
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function normAng(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function minDim() { return Math.min(W, H); }
  // 基础体型（数字=10 时的半径），与画布成比例
  function baseR() { return Math.max(14, minDim() * 0.055); }
  // 数字每增大 10 倍，体型 +5%（线性累加：5%、10%、15%…），上限为基础体型 2 倍
  function sizeFor(n) {
    var b = baseR();
    var k = Math.log10(Math.max(1, n) / START_NUM);
    return b * Math.min(2, 1 + 0.05 * k);
  }
  // 玩家最大速度（像素/秒）
  function baseP() { return minDim() * 0.62; }
  function targetCount() { return clamp(Math.round(minDim() / 30), 12, MAX_FISH); }

  // 科学计数分解：n = c * 10^e（1<=c<10）
  function sciParts(n) {
    if (!(n > 0)) return { c: 1, e: 0 };
    var e = Math.floor(Math.log10(n));
    return { c: n / Math.pow(10, e), e: e };
  }
  // 数字格式化：万 / 亿 / 万亿；超过亿亿（1e16）用 A.BC*10^K 形式
  function fmt(n) {
    if (!(n > 0)) return '0';
    if (n >= SCI_THRESHOLD) {
      var s = sciParts(n);
      return s.c.toFixed(2).replace(/\.?0+$/, '') + '*10^' + s.e;
    }
    var unit, base;
    if (n >= 1e12) { unit = '万亿'; base = 1e12; }
    else if (n >= 1e8) { unit = '亿'; base = 1e8; }
    else if (n >= 1e4) { unit = '万'; base = 1e4; }
    else return String(Math.round(n));   // 鱼身上的数字均为整数
    var w = n / base;
    var ws = (w >= 100 ? String(Math.round(w)) : (w % 1 === 0 ? String(w) : w.toFixed(1)));
    return ws + unit;
  }
  function fmtTime(sec) {
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
    return m + ':' + pad(s);
  }
  function fmtDate(ts) {
    try {
      var d = new Date(ts);
      return (d.getMonth() + 1) + '-' + d.getDate();
    } catch (e) { return ''; }
  }
  // 颜色明暗调整（factor 负变暗、正变亮）
  function shade(hex, f) {
    var c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(function (x) { return x + x; }).join('');
    var n = parseInt(c, 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgb(' + clamp(Math.round(r + r * f), 0, 255) + ',' +
      clamp(Math.round(g + g * f), 0, 255) + ',' +
      clamp(Math.round(b + b * f), 0, 255) + ')';
  }

  // ---------- 排行榜编码（B站 分数有 ±16777216 限制，拆分存储） ----------
  // 存储 = 指数(e) × 10000 + 尾数(mant)；前 1~4 位是科学计数位数，后 4 位是有效数字。
  // 展示时用 decodeScore 还原真实分数（科学计数）。
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

  // ---------- 实体 ----------
  var FISH_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9',
    '#4dabf7', '#748ffc', '#9775fa', '#f06595', '#e599f7'];

  function makePlayer() {
    var r = sizeFor(START_NUM);
    return {
      x: W / 2, y: H / 2, vx: 0, vy: 0,
      num: START_NUM, score: 0,   // 分数独立：吃鱼累加，与数字无关、只增不减
      ang: -Math.PI / 2,
      r: r, displayR: r, inv: 0
    };
  }
  // 敌人只在画面边缘生成，从边缘游进画面，不会在中间突然出现
  function spawnPos() {
    var side = Math.floor(Math.random() * 4), m = 30;
    if (side === 0) return { x: rand(0, W), y: -m };        // 上边外
    if (side === 1) return { x: rand(0, W), y: H + m };     // 下边外
    if (side === 2) return { x: -m, y: rand(0, H) };        // 左边外
    return { x: W + m, y: rand(0, H) };                     // 右边外
  }
  // 场上可吞噬小鱼（≤你）占比不足 20% 时，新生成的鱼必须是小鱼
  function needSmallFromNums(nums, playerNum) {
    var total = nums.length;
    if (total < 6) return false;   // 鱼太少时不强行干预（开局除外）
    var eatable = 0;
    for (var i = 0; i < total; i++) {
      if (nums[i] <= playerNum) eatable++;
    }
    return (eatable / total) < 0.2;
  }
  function needSmallFish() {
    var nums = [];
    for (var i = 0; i < fishes.length; i++) nums.push(fishes[i].num);
    return needSmallFromNums(nums, player.num);
  }
  function makeFish(playerNum) {
    // 难度随玩家数字递增：开局 50% 小鱼 / 30% 中鱼 / 20% 大鱼（数字均为整数），越强中鱼占比越高
    var k = clamp(Math.log10(Math.max(1, playerNum) / START_NUM) / 6, 0, 1);
    var rSmall = 0.50 - 0.25 * k;
    var rMid = 0.30 + 0.25 * k;
    var droll = Math.random();
    var num;
    if (needSmallFish() || droll < rSmall) {
      num = Math.max(1, Math.floor(playerNum * rand(0.55, 0.98)));     // 小鱼：< 你，可吞噬
    } else if (droll < rSmall + rMid) {
      num = Math.ceil(playerNum * rand(1.02, 2.0));                    // 中鱼：> 你 且 ≤2倍
    } else {
      num = Math.ceil(playerNum * rand(2.02, 4.0));                    // 大鱼：>2倍 且 ≤4倍
    }
    var roll = Math.random();
    var type = roll < TIMID_RATIO ? 'timid' : (roll < TIMID_RATIO + BRAVE_RATIO ? 'brave' : 'rand');
    var sp = spawnPos();
    var f = {
      x: sp.x,
      y: sp.y,
      num: num,
      r: sizeFor(num),
      ang: Math.random() * Math.PI * 2,
      speed: baseP() * 0.63 * rand(0.8, 1.0),   // 以 63% 为基数，出生时定该基数的 80%~100%，之后不变
      type: type,
      chasing: true,               // 攻击型鱼：追逐/休息交替
      modeT: rand(1.5, 4),
      age: 0,                      // 存活时间（攻击型超时自动变随机）
      checkT: 3,                   // 每 3s 判定一次是否失去攻击倾向
      born: 0.6,                   // 出生保护期：刚在边缘出生时不被离屏判死
      cd: 0,                       // 碰撞冷却，避免连续结算
      turn: Math.random() * Math.PI * 2,
      turnTimer: rand(1, 3),
      color: FISH_COLORS[Math.floor(Math.random() * FISH_COLORS.length)]
    };
    return f;
  }

  // ---------- 游戏逻辑 ----------
  function updatePlayer(dt) {
    var P = baseP() * PLAYER_SPEED_MULT;   // 玩家速度 = 基础 × 1.2
    // 统一「跟随」：鼠标移动即跟随；手指按住时跟随手指位置
    var joystickOn = joy.active && joy.mag > 0.18;   // 死区：小幅推动不转向
    var follow = (pointer.kind === 'mouse') || (pointer.kind === 'touch' && pointer.down);
    if (joystickOn) {
      // 摇杆：方向 × 幅度给目标速度，并做平滑，避免过度灵活跑偏
      var jspd = P * joy.mag;
      player.vx += (joy.dx * jspd - player.vx) * Math.min(1, dt * 8);
      player.vy += (joy.dy * jspd - player.vy) * Math.min(1, dt * 8);
    } else if (follow) {
      // 直接速度控制：速度实时指向手指，无惯性、转身即变，自由灵活
      var dx = pointer.x - player.x, dy = pointer.y - player.y;
      var dist = Math.hypot(dx, dy);
      if (dist > 4) {
        var spd = Math.min(P, dist * 10);   // 距离越近越慢，收敛不超调
        var k = spd / dist;
        player.vx = dx * k;
        player.vy = dy * k;
      } else {
        player.vx = 0; player.vy = 0;
      }
    } else {
      player.vx *= Math.max(0, 1 - dt * 8);   // 松开后快速停下，不留惯性
      player.vy *= Math.max(0, 1 - dt * 8);
    }
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    // 固定屏幕为活动区域：玩家被边界约束，不能游出画面
    player.x = clamp(player.x, player.displayR, Math.max(player.displayR, W - player.displayR));
    player.y = clamp(player.y, player.displayR, Math.max(player.displayR, H - player.displayR));
    var sp = Math.hypot(player.vx, player.vy);
    if (sp > 1) player.ang = Math.atan2(player.vy, player.vx);
    // 快速游动时身后喷出气泡尾迹，强化"我在动"的反馈
    if (sp > 70) {
      var ta = player.ang + Math.PI;
      particles.push({
        x: player.x + Math.cos(ta) * player.displayR * 0.85 + rand(-3, 3),
        y: player.y + Math.sin(ta) * player.displayR * 0.85 + rand(-3, 3),
        vx: -player.vx * 0.15 + rand(-8, 8),
        vy: -player.vy * 0.15 + rand(-16, -4),
        r: rand(1.5, 3.5), t: 0, life: 0.45, color: '#d6ebff'
      });
    }
    if (player.inv > 0) player.inv -= dt;
    var tr = sizeFor(player.num);
    player.displayR += (tr - player.displayR) * Math.min(1, dt * 6);
  }

  function updateFish(dt) {
    var P = baseP() * PLAYER_SPEED_MULT;   // 胆小鱼加速逃离的上限（仍慢于玩家）
    for (var i = 0; i < fishes.length; i++) {
      var f = fishes[i];
      f.age += dt;
      if (f.cd > 0) f.cd -= dt;
      if (f.born > 0) f.born -= dt;
      var dx = player.x - f.x, dy = player.y - f.y;
      var dist = Math.hypot(dx, dy) || 1;
      var toP = Math.atan2(dy, dx);
      var want;
      if (f.type === 'timid') {
        want = toP + Math.PI + (Math.random() - 0.5) * 0.6;   // 远离你
      } else if (f.type === 'brave') {
        // 攻击倾向：每 3s 有 20% 概率失去；存活超 15s 自动变为随机，避免一直追你
        f.checkT -= dt;
        var lost = false;
        if (f.checkT <= 0) {
          f.checkT = 3;
          if (Math.random() < BRAVE_DROP_CHANCE) lost = true;
        }
        if (f.age > BRAVE_MAX_AGE) lost = true;
        if (lost) {
          f.type = 'rand';
          f.turn = Math.random() * Math.PI * 2;
          want = f.turn;
        } else {
          // 仍具攻击倾向：追逐一段时间后休息、随机游动
          f.modeT -= dt;
          if (f.modeT <= 0) {
            f.chasing = !f.chasing;
            f.modeT = f.chasing ? rand(1.5, 4) : rand(2, 5);
            f.turn = Math.random() * Math.PI * 2;
          }
          want = f.chasing ? (toP + (Math.random() - 0.5) * 0.4) : f.turn;
        }
      } else {
        f.turnTimer -= dt;
        if (f.turnTimer <= 0) { f.turn = Math.random() * Math.PI * 2; f.turnTimer = rand(1.5, 4); }
        want = f.turn;                                        // 随机游动
      }
      f.ang += normAng(want - f.ang) * Math.min(1, dt * 1.5);
      var spd = f.speed;
      // 胆小型在玩家逼近时加速逃离（仍不超过玩家速度）
      if (f.type === 'timid' && dist < minDim() * 0.7) spd = Math.min(spd * 1.25, P * 0.95);
      f.x += Math.cos(f.ang) * spd * dt;
      f.y += Math.sin(f.ang) * spd * dt;
      f.r = sizeFor(f.num);   // 体型根据数字实时计算
    }
  }

  // 整条鱼完全离开画面 → 死亡消失；补充到目标数量
  function maintain() {
    for (var i = fishes.length - 1; i >= 0; i--) {
      var f = fishes[i];
      if (f.born > 0) continue;   // 出生保护期内不判离屏
      if (f.x + f.r < 0 || f.x - f.r > W || f.y + f.r < 0 || f.y - f.r > H) {
        fishes.splice(i, 1);
      }
    }
    while (fishes.length < targetCount()) fishes.push(makeFish(player.num));
  }

  function checkCollisions() {
    var p = player;
    var hitThisFrame = false;
    for (var i = fishes.length - 1; i >= 0; i--) {
      var f = fishes[i];
      if (f.cd > 0) continue;
      var dx = f.x - p.x, dy = f.y - p.y;
      var d2 = dx * dx + dy * dy;
      var rr = p.displayR + f.r;        // 吃敌方：完整判定箱（保持现状）
      var rrD = rr * DIFFS[difficulty].scale;   // 被敌方吃：判定箱按难度缩放
      if (f.num <= p.num) {             // 数字相同也可吞噬对方
        if (d2 < rr * rr) eatFish(i, f);
      } else if (d2 < rrD * rrD) {
        // 被敌方吃（判定箱更小：略降难度、避免被卡死）
        if (f.num / p.num <= 2) {
          if (p.inv > 0) continue;      // 受伤后的短暂无敌，避免连续掉血
          loseHalf(i, f);
          hitThisFrame = true;
        } else {
          dieByFish(f);
          return;
        }
      }
    }
    if (hitThisFrame) { p.inv = 1.0; }   // 被中鱼减半后 1s 无敌
  }

  function eatFish(i, f) {
    // 数字吸收被吃鱼的数字用于成长；分数独立累加（吃鱼加分，与数字无关）
    player.num = Math.min(player.num + f.num, 1e300);
    player.score += f.num;
    burst(f.x, f.y, f.color, 10);
    addFx(f.x, f.y, '+' + fmt(f.num), '#8dffb0');
    play('eat');
    fishes.splice(i, 1);
  }

  function loseHalf(i, f) {
    // 数字减半（分数不受影响，保持历史最高）
    player.num = Math.max(1, Math.round(player.num / 2));
    f.cd = 0.9;
    var dx = f.x - player.x, dy = f.y - player.y;
    var d = Math.hypot(dx, dy) || 1;
    f.x = player.x + dx / d * (player.displayR + f.r + 6);
    f.y = player.y + dy / d * (player.displayR + f.r + 6);
    f.ang = Math.atan2(dy, dx);
    addFx(f.x, f.y, '-' + fmt(player.num), '#ff7a7a');
    hurtFlash = 0.45;
    play('hurt');
  }

  function dieByFish(f) {
    state = 'dying';
    death = { t: 0, killer: f };
    hurtFlash = 0.6;
    play('die');
  }

  function finishGame() {
    state = 'over';
    var finalScore = player.score;   // 用分数（历史最高数字），减半不会扣分
    var finalTime = elapsed;
    overScore.textContent = fmt(finalScore);
    overSub.textContent = '存活 ' + fmtTime(finalTime);
    overOverlay.hidden = false;
    addLocal(finalScore, finalTime);
    submitGlobal(finalScore);
  }

  // ---------- 特效 ----------
  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = rand(30, 110);
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rand(2, 5), t: 0, life: rand(0.3, 0.6), color: color });
    }
  }
  function addFx(x, y, text, color) {
    floaters.push({ x: x, y: y, text: text, color: color, t: 0, life: 0.9 });
  }
  function updateEffects(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 40 * dt;
      if (p.t > p.life) particles.splice(i, 1);
    }
    for (var j = floaters.length - 1; j >= 0; j--) {
      var fl = floaters[j];
      fl.t += dt; fl.y -= 26 * dt;
      if (fl.t > fl.life) floaters.splice(j, 1);
    }
  }
  function initBubbles() {
    bubbles = [];
    var n = Math.round(minDim() / 55) + 6;
    for (var i = 0; i < n; i++) {
      bubbles.push({ x: Math.random() * W, y: Math.random() * H, r: rand(2, 7), s: rand(8, 26), a: rand(0.06, 0.18) });
    }
  }
  function updateBubbles(dt) {
    for (var i = 0; i < bubbles.length; i++) {
      var b = bubbles[i];
      b.y -= b.s * dt;
      b.x += Math.sin(b.y * 0.02) * dt * 6;
      if (b.y < -12) { b.y = H + 12; b.x = Math.random() * W; }
    }
  }

  // 静态海底装饰（沙点/碎石/海草，固定画面坐标）
  function initWorldDots() {
    worldDots = [];
    var n = Math.round((W * H) / 9000) + 8;
    for (var i = 0; i < n; i++) {
      worldDots.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: rand(1, 3),
        a: rand(0.04, 0.14),
        seaweed: Math.random() < 0.06,
        ph: Math.random() * Math.PI * 2
      });
    }
  }
  function drawWorldDots() {
    for (var i = 0; i < worldDots.length; i++) {
      var d = worldDots[i];
      if (d.seaweed) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(96,200,150,' + (d.a * 1.6).toFixed(3) + ')';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.quadraticCurveTo(d.x + Math.sin(d.ph) * 8, d.y - 16, d.x + Math.cos(d.ph * 0.7) * 4, d.y - 26);
        ctx.stroke();
      } else {
        ctx.globalAlpha = d.a;
        ctx.fillStyle = '#bfe0ff';
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 绘制 ----------
  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawWorldDots();
    if (!player) return;
    var all = fishes.slice().sort(function (a, b) { return a.r - b.r; });
    for (var i = 0; i < all.length; i++) drawFish(all[i], false);
    drawFish(player, true);
    drawFloaters();
    drawParticles();

    if (state === 'dying') drawVignette(0.35 + death.t);
    else drawVignette(0);
    if (hurtFlash > 0) {
      ctx.fillStyle = 'rgba(255,40,60,' + (hurtFlash * 0.55).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawBackground() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#144d7a');
    g.addColorStop(0.55, '#0d3b66');
    g.addColorStop(1, '#081a33');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 光柱
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#bfeaff';
    for (var i = 0; i < 3; i++) {
      var bx = W * (0.2 + i * 0.3) + Math.sin(performance.now() / 2000 + i) * 20;
      ctx.beginPath();
      ctx.moveTo(bx, -20);
      ctx.lineTo(bx + 40, H + 20);
      ctx.lineTo(bx + 110, H + 20);
      ctx.lineTo(bx + 70, -20);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // 气泡
    for (var j = 0; j < bubbles.length; j++) {
      var b = bubbles[j];
      ctx.globalAlpha = b.a;
      ctx.strokeStyle = '#dff2ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFish(f, isPlayer) {
    var baseColor = isPlayer ? '#c8d2e6' : f.color;
    var fade = 1, scale = 1;
    if (isPlayer && state === 'dying') {
      fade = Math.max(0, 1 - death.t / 0.85);
      scale = Math.max(0.05, 1 - death.t / 0.85);
    }
    var r = isPlayer ? player.displayR * scale : f.r;

    ctx.save();
    ctx.globalAlpha = fade;
    if (isPlayer && state === 'playing') {
      // 玩家银色光晕
      ctx.fillStyle = 'rgba(210,225,255,0.10)';
      ctx.beginPath();
      ctx.arc(f.x, f.y, r * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.translate(f.x, f.y);
    ctx.rotate(f.ang);

    // 尾鳍
    ctx.fillStyle = shade(baseColor, -0.25);
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, -r * 0.48);
    ctx.lineTo(-r * 1.35, 0);
    ctx.lineTo(-r * 0.55, r * 0.48);
    ctx.closePath();
    ctx.fill();
    // 鱼鳍
    ctx.fillStyle = shade(baseColor, 0.12);
    ctx.beginPath();
    ctx.moveTo(-r * 0.12, r * 0.08);
    ctx.quadraticCurveTo(-r * 0.32, r * 0.9, r * 0.28, r * 0.6);
    ctx.quadraticCurveTo(r * 0.1, r * 0.34, -r * 0.12, r * 0.08);
    ctx.closePath();
    ctx.fill();
    // 身体
    var g = ctx.createLinearGradient(-r, 0, r, 0);
    g.addColorStop(0, shade(baseColor, -0.18));
    g.addColorStop(0.55, baseColor);
    g.addColorStop(1, shade(baseColor, 0.15));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // 银色高光
    if (isPlayer) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.18, -r * 0.22, r * 0.5, r * 0.16, -0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    // 眼睛
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(r * 0.42, -r * 0.2, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16233a';
    ctx.beginPath();
    ctx.arc(r * 0.48, -r * 0.2, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 数字（不随鱼旋转，保持可读）
    drawNumber(f.x, f.y - r - 7, f.num, r, isPlayer);
  }

  function drawText(txt, x, y, fs, isPlayer, baseline) {
    ctx.font = '700 ' + fs + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = baseline || 'bottom';
    ctx.lineWidth = Math.max(2, fs / 4.5);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(4,10,24,0.9)';
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = isPlayer ? '#ffe9a8' : '#ffffff';
    ctx.fillText(txt, x, y);
  }
  function drawNumber(x, y, n, r, isPlayer) {
    var fs = clamp(r * 0.95, 10, 24);
    if (n >= SCI_THRESHOLD) {
      // 超大数字（≥1e16）：头顶 a.bc，鱼身 d，不显示 *10^ 符号
      var s = sciParts(n);
      var a = s.c.toFixed(2).replace(/\.?0+$/, '');
      drawText(a, x, y, fs, isPlayer);                          // 头顶
      drawText(String(s.e), x, y + r + 7, fs * 0.75, isPlayer, 'middle');  // 鱼身
    } else {
      drawText(fmt(n), x, y, fs, isPlayer);                     // 普通数字：头顶
    }
  }

  function drawFloaters() {
    for (var i = 0; i < floaters.length; i++) {
      var f = floaters[i];
      var a = 1 - f.t / f.life;
      var fs = 16 + Math.min(10, f.t * 8);
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.font = '800 ' + fs + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(4,10,24,0.9)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var a = 1 - p.t / p.life;
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.5 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawVignette(extra) {
    var g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(2,8,18,' + (0.28 + extra * 0.35).toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // ---------- HUD ----------
  function updateHUD() {
    hudScore.textContent = fmt(player.score);   // HUD 显示分数（历史最高），数字见鱼身
    hudTime.textContent = fmtTime(elapsed);
  }

  // ---------- 本地排行榜（按难度分榜，周期仅过滤） ----------
  function emptyLB() {
    var lb = {};
    for (var i = 0; i < DIFF_ORDER.length; i++) lb[DIFF_ORDER[i]] = [];
    return lb;
  }
  function loadLB() {
    try {
      var raw = localStorage.getItem(KEY_LB);
      if (raw) {
        var lb = JSON.parse(raw);
        if (lb && typeof lb === 'object') {
          if (Array.isArray(lb)) {
            // 旧版是无难度区分的数组 → 迁移到普通难度，避免新记录写入后丢失
            var m = emptyLB();
            m.normal = lb;
            return m;
          }
          for (var i = 0; i < DIFF_ORDER.length; i++) {
            if (!Array.isArray(lb[DIFF_ORDER[i]])) lb[DIFF_ORDER[i]] = [];
          }
          return lb;
        }
      }
    } catch (e) { /* 忽略 */ }
    return emptyLB();
  }
  function saveLB(lb) {
    try { localStorage.setItem(KEY_LB, JSON.stringify(lb)); } catch (e) { /* 忽略 */ }
  }
  function addLocal(score, time) {
    var lb = loadLB();
    var arr = lb[difficulty] || [];
    arr.push({ score: score, time: time, ts: Date.now() });
    arr.sort(function (a, b) { return b.score - a.score; });
    if (arr.length > LOCAL_TOP) arr.length = LOCAL_TOP;
    lb[difficulty] = arr;
    saveLB(lb);
    renderBest();
  }

  // ---------- Toy SDK（异步非阻塞加载） ----------
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
        if (typeof window.toy !== 'undefined' && window.toy) toyReady = true;
      };
      document.head.appendChild(s);
    } catch (e) { /* 非浏览器环境忽略 */ }
  }
  function submitGlobal(score) {
    if (!toyReady || !window.toy || typeof window.toy.submitScore !== 'function') return;
    var b = DIFFS[difficulty].board;
    if (!b) return;   // 简单模式无 B站 榜
    var enc = encodeScore(score);
    // submitScore 接口只有 board + score（无 period），周期由 B站 按提交时间自动归入
    try { window.toy.submitScore({ board: b, score: enc }).catch(function () { /* 忽略 */ }); }
    catch (e) { /* 忽略 */ }
  }
  function loadGlobalList(cb) {
    if (!toyReady || !window.toy) { cb(null, null); return; }
    var b = DIFFS[lbDiff].board;
    if (!b) { cb(null, null); return; }
    try {
      Promise.all([
        window.toy.getRankList({ board: b, period: lbPeriod, limit: GLOBAL_TOP }).catch(function () { return null; }),
        window.toy.getMyRank({ board: b, period: lbPeriod }).catch(function () { return null; })
      ]).then(function (res) { cb(res[0], res[1]); });
    } catch (e) { cb(null, null); }
  }

  // ---------- 首页 ----------
  function showView(id) {
    viewHome.classList.toggle('active', id === 'view-home');
    viewGame.classList.toggle('active', id === 'view-game');
  }
  function renderBest() {
    var lb = loadLB();
    var best = null;
    for (var i = 0; i < DIFF_ORDER.length; i++) {
      var arr = lb[DIFF_ORDER[i]] || [];
      if (arr.length && (!best || arr[0].score > best.score)) best = arr[0];
    }
    if (!best) {
      bestRow.innerHTML = '<span class="best-empty">暂无记录，快去开局</span>';
      return;
    }
    bestRow.innerHTML = '<span class="best-score">' + fmt(best.score) + '</span>' +
      '<span class="best-empty"> · 存活 ' + fmtTime(best.time) + '</span>';
  }

  // ---------- 游戏流程 ----------
  function resetGame() {
    player = makePlayer();
    initWorldDots();
    fishes = [];
    particles = [];
    floaters = [];
    elapsed = 0;
    death = null;
    hurtFlash = 0;
    pointer.down = false;
    pointer.kind = 'touch';
    pointer.x = W / 2; pointer.y = H / 2;
    joyReset();
    for (var i = 0; i < targetCount(); i++) fishes.push(makeFish(player.num));
    state = 'playing';
    pauseOverlay.hidden = true;
    overOverlay.hidden = true;
    updateHUD();
    startHint();
  }
  function startGame() {
    showView('view-game');
    // 切换到游戏页后确保布局已就绪再取画布尺寸
    setTimeout(function () { resize(); resetGame(); }, 0);
  }
  function startHint() {
    gameHint.classList.add('show');
    clearTimeout(hintT);
    hintT = setTimeout(function () { gameHint.classList.remove('show'); }, 2500);
  }
  function doPause() {
    if (state !== 'playing') return;
    state = 'paused';
    pauseOverlay.hidden = false;
    play('click');
  }
  function doResume() {
    if (state !== 'paused') return;
    state = 'playing';
    pauseOverlay.hidden = true;
    play('click');
  }
  function goHome() {
    state = 'menu';
    pauseOverlay.hidden = true;
    overOverlay.hidden = true;
    lbModal.hidden = true;
    showView('view-home');
    renderBest();
  }

  // ---------- 排行榜弹窗（来源 / 难度 / 周期） ----------
  function openLB() {
    lbSource = 'local';
    lbDiff = difficulty;
    lbPeriod = 'all';
    lbModal.hidden = false;
    renderLBTabs();
    renderLB();
    play('click');
  }
  function closeLB() { lbModal.hidden = true; }
  function renderLBTabs() {
    // 来源
    var sBtns = lbSourceTabs.querySelectorAll('.tab');
    for (var i = 0; i < sBtns.length; i++) {
      sBtns[i].classList.toggle('active', sBtns[i].getAttribute('data-source') === lbSource);
    }
    // 难度（本地 4 档 / B站 3 档，简单无 B站 榜）
    var diffList = lbSource === 'local' ? DIFF_ORDER : ['normal', 'hard', 'hell'];
    if (diffList.indexOf(lbDiff) < 0) lbDiff = diffList[0];
    var html = '';
    for (var j = 0; j < diffList.length; j++) {
      var id = diffList[j];
      html += '<button class="tab' + (id === lbDiff ? ' active' : '') + '" data-diff="' + id + '">' + DIFFS[id].name + '</button>';
    }
    lbDiffTabs.innerHTML = html;
    // 周期（本地榜只有总榜，不显示周期页签）
    lbPeriodTabs.style.display = lbSource === 'global' ? '' : 'none';
    var pBtns = lbPeriodTabs.querySelectorAll('.tab');
    for (var k = 0; k < pBtns.length; k++) {
      pBtns[k].classList.toggle('active', pBtns[k].getAttribute('data-period') === lbPeriod);
    }
  }
  function setTip(html) { lbBody.innerHTML = '<div class="lb-tip">' + html + '</div>'; }
  function renderLB() {
    if (lbSource === 'local') renderLocalLB();
    else renderGlobalLB();
  }
  function renderLocalLB() {
    var list = loadLB()[lbDiff] || [];   // 本地榜只有总榜
    lbNote.textContent = '本地榜 · ' + DIFFS[lbDiff].name + ' · TOP ' + LOCAL_TOP;
    if (!list.length) { setTip('暂无记录，快去开局挑战吧'); return; }
    var rows = '';
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      rows += '<div class="lb-row">' +
        '<span class="lb-rank' + (i < 3 ? ' t' + (i + 1) : '') + '">' + (i + 1) + '</span>' +
        '<span class="lb-score">' + fmt(it.score) + '</span>' +
        '<span class="lb-meta">' + fmtTime(it.time) + ' · ' + fmtDate(it.ts) + '</span>' +
        '</div>';
    }
    lbBody.innerHTML = '<div class="lb-head"><span>名次</span><span>数字</span><span>时间 · 日期</span></div>' + rows;
  }
  function renderGlobalLB() {
    var b = DIFFS[lbDiff].board;
    var title = 'B站榜 · ' + DIFFS[lbDiff].name + ' · ' + PERIOD_NAMES[lbPeriod] + ' · TOP ' + GLOBAL_TOP;
    if (!b) {
      lbNote.textContent = title;
      setTip('简单模式不参与 B站 排行榜，请选择 普通 / 困难 / 地狱');
      return;
    }
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
    loadGlobalList(function (list, mine) {
      if (!list) { setTip('加载失败，请稍后重试'); return; }
      if (!list.length) { setTip('暂无上榜记录，去创造奇迹吧'); return; }
      var rows = '';
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        rows += '<div class="lb-row global">' +
          '<span class="lb-rank' + (it.rank <= 3 ? ' t' + it.rank : '') + '">' + it.rank + '</span>' +
          '<span class="lb-user">' +
            (it.avatar ? '<img class="lb-avatar" src="' + esc(it.avatar) + '" alt="" referrerpolicy="no-referrer">' : '<span class="lb-avatar"></span>') +
            '<span class="lb-name">' + esc(it.nickname) + '</span>' +
          '</span>' +
          '<span class="lb-score">' + fmt(decodeScore(it.score)) + '</span>' +
          '</div>';
      }
      if (mine && mine.ranked) {
        rows += '<div class="lb-row global mine"><span class="lb-rank">' + mine.rank + '</span>' +
          '<span class="lb-user"><span class="lb-avatar"></span><span class="lb-name">我</span></span>' +
          '<span class="lb-score">' + fmt(decodeScore(mine.score)) + '</span></div>';
      }
      lbBody.innerHTML = '<div class="lb-head global"><span>名次</span><span>玩家</span><span>数字</span></div>' + rows;
    });
  }

  // ---------- 音频 ----------
  var AC = null;
  function audioInit() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
    if (AC && AC.state === 'suspended') AC.resume();
  }
  function beep(freq, dur, type, vol, when) {
    if (!AC || muted) return;
    var t = AC.currentTime + (when || 0);
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(t); o.stop(t + dur);
  }
  function play(name) {
    if (muted) return;
    switch (name) {
      case 'eat': beep(660, 0.08, 'triangle', 0.2); beep(880, 0.1, 'triangle', 0.16, 0.05); break;
      case 'hurt': beep(220, 0.2, 'sawtooth', 0.18); break;
      case 'die': beep(392, 0.18, 'sawtooth', 0.16); beep(262, 0.24, 'sawtooth', 0.14, 0.12); beep(196, 0.3, 'sawtooth', 0.12, 0.28); break;
      case 'click': beep(520, 0.05, 'square', 0.08); break;
    }
  }

  // ---------- 画布尺寸 ----------
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = viewGame.getBoundingClientRect();
    W = Math.max(200, Math.round(rect.width));
    H = Math.max(200, Math.round(rect.height));
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    initBubbles();
    initWorldDots();
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', function () {
      if (viewGame.classList.contains('active')) resize();
    });
    window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
  }

  // ---------- 输入（跟随控制，pointer 优先 + touch/mouse 回退） ----------
  var hasPointer = typeof window !== 'undefined' && ('PointerEvent' in window);
  function getPos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function onDown(e) {
    audioInit();
    if (state !== 'playing') return;
    pointer.kind = e.pointerType === 'mouse' ? 'mouse' : 'touch';
    pointer.down = true;
    pointer.id = e.pointerId;
    var p = getPos(e);
    pointer.x = p.x; pointer.y = p.y;
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { } }
    e.preventDefault();
  }
  function onMove(e) {
    if (e.pointerType === 'mouse') {
      // 电脑端：跟踪鼠标位置，移动即跟随（无需按住）
      var p = getPos(e);
      pointer.x = p.x; pointer.y = p.y;
      pointer.kind = 'mouse';
      return;
    }
    if (!pointer.down || e.pointerId !== pointer.id) return;
    var p = getPos(e);
    pointer.x = p.x; pointer.y = p.y;
  }
  function onUp(e) {
    if (e.pointerId === pointer.id) { pointer.down = false; pointer.id = null; }
  }
  // touch 回退（某些 WebView 不触发 pointer 事件）
  function touchXY(e) {
    var t = e.touches[0];
    if (!t) return null;
    var r = canvas.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  function onTouchStart(e) {
    if (hasPointer) return;
    audioInit();
    if (state !== 'playing') return;
    pointer.kind = 'touch';
    pointer.down = true;
    var p = touchXY(e);
    if (p) { pointer.x = p.x; pointer.y = p.y; }
    e.preventDefault();
  }
  function onTouchMove(e) {
    if (hasPointer || !pointer.down) return;
    var p = touchXY(e);
    if (p) { pointer.x = p.x; pointer.y = p.y; }
    e.preventDefault();
  }
  function onTouchEnd(e) {
    if (hasPointer) return;
    pointer.down = false;
  }
  // mouse 回退
  function onMouseDown(e) {
    if (hasPointer) return;
    audioInit();
    if (state !== 'playing') return;
    pointer.kind = 'mouse';
    pointer.down = true;
    var p = getPos(e);
    pointer.x = p.x; pointer.y = p.y;
  }
  function onMouseMove(e) {
    if (hasPointer) return;
    pointer.kind = 'mouse';
    var p = getPos(e);
    pointer.x = p.x; pointer.y = p.y;
  }
  function onMouseUp() {
    if (hasPointer) return;
    pointer.down = false;
  }

  // ---------- 底部半透明摇杆 ----------
  function joyCenter() {
    var r = joyEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function joyUpdate(clientX, clientY) {
    var c = joyCenter();
    var dx = clientX - c.x, dy = clientY - c.y;
    var baseR = joyEl.clientWidth / 2;   // 底座半径
    var knobR = 23;                      // 旋钮半径（与 CSS 一致）
    var maxR = Math.max(8, baseR - knobR);  // 旋钮中心最大行程，保证旋钮不超出底座
    var dist = Math.hypot(dx, dy);
    var mag = Math.min(1, dist / maxR);
    var inv = dist > 0.001 ? 1 / dist : 0;
    // 旋钮位置夹取在底座圆内，拖出底座也不会跑飞
    var cx = dx * inv * maxR * mag;
    var cy = dy * inv * maxR * mag;
    joy.dx = dx * inv; joy.dy = dy * inv; joy.mag = mag;
    if (joyKnob) joyKnob.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
  }
  function joyReset() {
    joy.active = false; joy.dx = 0; joy.dy = 0; joy.mag = 0; joy.id = null;
    if (joyKnob) joyKnob.style.transform = 'translate(0,0)';
  }
  function onJoyDown(e) {
    audioInit();
    if (state !== 'playing') return;
    joy.active = true; joy.id = e.pointerId;
    joyUpdate(e.clientX, e.clientY);
    if (joyEl.setPointerCapture) { try { joyEl.setPointerCapture(e.pointerId); } catch (err) { } }
    e.preventDefault();
  }
  function onJoyMove(e) {
    if (!joy.active || e.pointerId !== joy.id) return;
    joyUpdate(e.clientX, e.clientY);
    e.preventDefault();
  }
  function onJoyUp(e) {
    if (e.pointerId === joy.id) joyReset();
  }
  if (typeof document !== 'undefined') {
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
  }

  // 设置：音效 + 难度（本地持久化，即时生效，无需手动保存）
  function loadMuted() {
    try { muted = localStorage.getItem(KEY_MUTE) === '1'; } catch (e) { }
    try { difficulty = localStorage.getItem(KEY_DIFF) || 'hard'; } catch (e) { }
    if (!DIFFS[difficulty]) difficulty = 'hard';
    updateMuteBtn();
    updateDiffBtn();
  }
  function saveMuted() {
    try { localStorage.setItem(KEY_MUTE, muted ? '1' : '0'); } catch (e) { }
    updateMuteBtn();
  }
  function saveDifficulty(d) {
    difficulty = d;
    try { localStorage.setItem(KEY_DIFF, d); } catch (e) { }
    updateDiffBtn();
  }
  function toggleMute() {
    audioInit();
    muted = !muted;
    saveMuted();
  }
  function updateMuteBtn() {
    if (typeof document !== 'undefined') {
      $('btn-mute').textContent = muted ? '🔇' : '🔊';
      var sh = $('btn-sound-home');
      sh.textContent = muted ? '关' : '开';
      sh.classList.toggle('on', !muted);
    }
  }
  function updateDiffBtn() {
    if (typeof document !== 'undefined') {
      var segs = $('diff-seg').querySelectorAll('.seg');
      for (var i = 0; i < segs.length; i++) {
        segs[i].classList.toggle('active', segs[i].getAttribute('data-diff') === difficulty);
      }
    }
  }

  if (typeof document !== 'undefined') {
    // ---------- 按钮绑定 ----------
    $('btn-start').addEventListener('click', function () { audioInit(); startGame(); });
    $('btn-open-lb').addEventListener('click', openLB);
    $('btn-pause').addEventListener('click', function () { audioInit(); doPause(); });
    $('btn-resume').addEventListener('click', doResume);
    $('btn-restart').addEventListener('click', function () { audioInit(); resetGame(); });
    $('btn-pause-home').addEventListener('click', goHome);
    $('btn-again').addEventListener('click', function () { audioInit(); resetGame(); });
    $('btn-over-lb').addEventListener('click', openLB);
    $('btn-over-home').addEventListener('click', goHome);
    $('btn-close-lb').addEventListener('click', closeLB);
    $('btn-mute').addEventListener('click', toggleMute);
    $('btn-sound-home').addEventListener('click', toggleMute);
    $('diff-seg').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.seg') : null;
      if (!b) return;
      var d = b.getAttribute('data-diff');
      if (DIFFS[d]) { saveDifficulty(d); play('click'); }
    });
    lbSourceTabs.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.tab') : null;
      if (!b) return;
      lbSource = b.getAttribute('data-source');
      renderLBTabs();
      renderLB();
    });
    lbDiffTabs.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.tab') : null;
      if (!b) return;
      lbDiff = b.getAttribute('data-diff');
      renderLBTabs();
      renderLB();
    });
    lbPeriodTabs.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.tab') : null;
      if (!b) return;
      lbPeriod = b.getAttribute('data-period');
      renderLBTabs();
      renderLB();
    });
    lbModal.addEventListener('click', function (e) { if (e.target === lbModal) closeLB(); });

    // 摇杆输入
    joyEl.addEventListener('pointerdown', onJoyDown);
    joyEl.addEventListener('pointermove', onJoyMove);
    joyEl.addEventListener('pointerup', onJoyUp);
    joyEl.addEventListener('pointercancel', onJoyUp);
    joyEl.addEventListener('touchstart', function (e) {
      if (hasPointer) return;
      var t = e.touches[0]; if (!t) return;
      audioInit();
      if (state !== 'playing') return;
      joy.active = true; joy.id = -1;
      joyUpdate(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });
    joyEl.addEventListener('touchmove', function (e) {
      if (hasPointer || !joy.active) return;
      var t = e.touches[0]; if (!t) return;
      joyUpdate(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });
    joyEl.addEventListener('touchend', function () { if (hasPointer) return; joyReset(); });

    // 电脑端空格暂停/恢复
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (state === 'playing') doPause();
        else if (state === 'paused') doResume();
      }
    });

    // 切后台自动暂停
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state === 'playing') doPause();
    });
  }

  // ---------- 主循环 ----------
  function loop(now) {
    var dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (state === 'playing') {
      elapsed += dt;
      updatePlayer(dt);
      updateFish(dt);
      maintain();
      checkCollisions();
      updateHUD();
    } else if (state === 'dying') {
      death.t += dt;
      if (death.t >= 0.85) finishGame();
    }
    if (state !== 'paused') updateEffects(dt);
    updateBubbles(dt);
    if (hurtFlash > 0) hurtFlash = Math.max(0, hurtFlash - dt * 2.5);
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- 启动 ----------
  function init() {
    player = makePlayer();   // 让菜单页背景也有画面
    resize();
    showView('view-home');
    renderBest();
    loadMuted();
    loadSDK();
    last = performance.now();
    requestAnimationFrame(loop);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  // Node 单测导出（浏览器环境 module 未定义，不影响）
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      START_NUM: START_NUM, SCI_THRESHOLD: SCI_THRESHOLD,
      fmt: fmt, fmtTime: fmtTime, sciParts: sciParts,
      encodeScore: encodeScore, decodeScore: decodeScore, sizeFor: sizeFor,
      DIFFS: DIFFS, PERIODS: PERIODS, needSmallFromNums: needSmallFromNums,
      getState: function () { return state; },
      getDifficulty: function () { return difficulty; },
      saveDifficulty: saveDifficulty,
      loadLB: loadLB, saveLB: saveLB, addLocal: addLocal, submitGlobal: submitGlobal,
      playerPos: function () { return player ? { x: player.x, y: player.y } : null; },
      playerInfo: function () { return player ? { num: player.num, score: player.score } : null; },
      fishList: function () { return fishes.map(function (f) { return { x: f.x, y: f.y, born: f.born }; }); }
    };
  }
})();
