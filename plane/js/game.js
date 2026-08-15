/**
 * game.js —— 游戏引擎
 *
 * 依赖：window.PlaneCore（core.js）、window.AudioMgr（audio.js）
 * 职责：canvas 渲染、主循环、飞机控制、自动射击、敌机/BOSS/波次、碰撞、
 *       道具、炸弹、断点快照、结算。
 *
 * 所有图片素材按规格统一「逆时针旋转 90°」绘制（drawImg 默认 rot=-PI/2）。
 */
(function (root) {
  'use strict';

  var Core = root.PlaneCore;
  var CFG = Core.CFG;
  var W = Core.WORLD_W;
  var H = Core.WORLD_H;
  var AudioMgr = root.AudioMgr;

  var canvas = null, ctx = null, wrap = null;
  var state = 'idle';          // idle|playing|paused|dying|over
  var run = null;              // 当前局数据
  var lastT = 0, deathT = 0, hudT = 0;
  var settings = Core.loadSettings();

  // 全屏闪屏：redFlash=BOSS 红色告警，screenFlash=bomb 白色闪光，hurtFlash=被击中红色小闪屏
  var redFlash = 0, screenFlash = 0, hurtFlash = 0;
  var lastHurtFx = 0;   // 受伤爆炸特效节流时间戳
  var bossIntroT = 0;   // BOSS 出现提示剩余时长（3s 内红色闪烁 3 次）

  // 实体容器
  var enemies = [], bullets = [], enemyBullets = [], beams = [];
  var items = [], parts = [], floaters = [], airStrikes = [];
  var boss = null;

  // 输入
  var pointer = { active: false, x: W / 2, y: CFG.plane.startY };
  var keys = {};
  var lastTapT = 0, tapMoved = false;

  // 图片
  var IMG = {};
  var IMG_SRC = {
    background: 'images/background.jpg',
    plane: 'images/plane.png',
    planeDie: 'images/planeDie.png',
    bullet1: 'images/bullet1.png',
    bullet2: 'images/bullet2.png',
    bullet3: 'images/bullet3.png',
    enemy1: 'images/enemy1.png',
    enemy2: 'images/enemy2.png',
    enemy3: 'images/enemy3.png',
    enemy4: 'images/enemy4.png',
    enemyBullet: 'images/enemyBullet.png',
    boss: 'images/boss.png',
    explode: 'images/explode.png',
    bomb: 'images/bomb.png'
  };

  // HUD 元素
  var elScore, elProgress, elTime, elWave, elHp, elBombs, elP1, elP2, elP3;

  /* ========================================================================
   * 工具
   * ====================================================================== */
  function d2(x1, y1, x2, y2) { var dx = x1 - x2, dy = y1 - y2; return dx * dx + dy * dy; }
  function normAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

  /* ========================================================================
   * 初始化
   * ====================================================================== */
  function init(canvasEl, wrapEl) {
    canvas = canvasEl; wrap = wrapEl;
    ctx = canvas.getContext('2d');
    canvas.width = W; canvas.height = H;
    resize();
    loadImages();
    bindInput();
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && run && (state === 'playing' || state === 'paused')) {
        Core.saveCheckpoint(makeSnapshot());
      }
    });
    window.addEventListener('resize', resize);
    requestAnimationFrame(frame);
  }

  // 测量视口顶部被 B站 网页 banner 遮挡的实际高度（无遮挡返回 0）
  function measureTopBanner() {
    try {
      var x = Math.floor(window.innerWidth / 2);
      var el = document.elementFromPoint(x, 2);
      if (el && el !== document.documentElement && el !== document.body && el !== canvas) {
        var r = el.getBoundingClientRect();
        if (r && r.top < 2 && r.bottom > 2 && r.bottom < window.innerHeight * 0.4) {
          return Math.ceil(r.bottom);
        }
      }
    } catch (e) { /* 忽略 */ }
    return 0;
  }

  function resize() {
    if (!canvas || !wrap) return;
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var bannerH = measureTopBanner();              // 动态测量实际 banner 高度
    var availH = Math.max(100, vh - bannerH);      // canvas 可用高度 = 视口 - banner
    var scale = Math.min(vw / W, availH / H);
    var cw = Math.floor(W * scale), ch = Math.floor(H * scale);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    wrap.style.width = cw + 'px';
    wrap.style.height = ch + 'px';
    // 顶部让出 banner 实际高度；canvas 已按剩余高度缩放，底部不会超出视口
    if (wrap.parentElement) wrap.parentElement.style.paddingTop = bannerH + 'px';
  }

  function loadImages() {
    for (var k in IMG_SRC) {
      (function (key) {
        var img = new Image();
        img.onload = function () { IMG[key] = img; };
        img.src = IMG_SRC[key];
      })(k);
    }
  }

  function refreshSettings() { settings = Core.loadSettings(); }

  /* ========================================================================
   * 输入
   * ====================================================================== */
  function toWorld(e) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width * W,
      y: (e.clientY - rect.top) / rect.height * H
    };
  }
  function setPointer(p) {
    pointer.active = true;
    pointer.x = Core.clamp(p.x, 0, W);
    pointer.y = Core.clamp(p.y, 0, H);
  }
  function onMouseMove(e) {
    var p = toWorld(e);
    setPointer(p);
  }
  function onTouchStart(e) {
    var t = e.touches[0];
    setPointer(toWorld(t));
    // 双击判定：300ms 内连续两次轻点且期间未拖动 -> 放炸弹
    var now = Date.now();
    if (now - lastTapT < 300 && !tapMoved && state === 'playing') {
      doBomb();
      lastTapT = 0;
    } else {
      lastTapT = now;
      tapMoved = false;
    }
    if (e.cancelable) e.preventDefault();
  }
  function onTouchMove(e) {
    var t = e.touches[0];
    setPointer(toWorld(t));
    tapMoved = true;
    if (e.cancelable) e.preventDefault();
  }
  function onKeyDown(e) {
    var c = e.key.toLowerCase();
    if (c === 'arrowleft' || c === 'a') keys.left = true;
    else if (c === 'arrowright' || c === 'd') keys.right = true;
    else if (c === 'arrowup' || c === 'w') keys.up = true;
    else if (c === 'arrowdown' || c === 's') keys.down = true;
    if (c === ' ' && state === 'playing') { e.preventDefault(); doBomb(); }
    if (c === 'escape') { root.UI && root.UI.requestPause(); }
  }
  function onKeyUp(e) {
    var c = e.key.toLowerCase();
    if (c === 'arrowleft' || c === 'a') keys.left = false;
    else if (c === 'arrowright' || c === 'd') keys.right = false;
    else if (c === 'arrowup' || c === 'w') keys.up = false;
    else if (c === 'arrowdown' || c === 's') keys.down = false;
  }
  function bindInput() {
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', function () { /* 双击已由 touchstart 处理 */ });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }

  /* ========================================================================
   * 局数据管理
   * ====================================================================== */
  function newRun(jump) {
    jump = jump || 0;
    var up = Core.loadUpgrades();
    var maxHp = Core.armorMaxHp(up.armor);
    var startWave = 1 + jump;
    run = {
      wave: startWave, spawned: 0, score: 0, time: 0,
      up: up,
      maxHp: maxHp, hp: maxHp,
      bombs: CFG.bomb.start + jump,   // 跳关时每跳 1 关额外赠送 1 个炸弹
      b1b: 0, b2b: 0, b3b: 0,          // 本局道具对三种子弹的加成（乘法累进）
      t1: 0, t2: 0, t3: 0,             // 三子弹发射冷却
      spawnT: 0,
      px: W / 2, py: CFG.plane.startY,
      mul: Core.enemyMult(startWave),
      jumpMult: Core.jumpMult(jump)   // 跳关子弹威力加成（1.4、1.45、1.5…连乘）
    };
    enemies = []; bullets = []; enemyBullets = []; beams = [];
    items = []; parts = []; floaters = []; airStrikes = [];
    boss = null;
    pointer.active = false;
    Core.clearCheckpoint();
    return run;
  }

  function bulletDmg(kind) {
    var base = CFG.bullets[kind].base;
    var shopLv = (run.up && run.up[kind]) || 0;
    var runB = run[kind + 'b'] || 0;
    // 商店成长（线性递推）、局内道具 ×1.01/个、跳关加成，独立叠乘
    return Core.bulletDamage(base, shopLv) * Math.pow(CFG.shop.itemGrow, runB) * (run.jumpMult || 1);
  }

  function makeSnapshot() {
    return {
      wave: run.wave, spawned: run.spawned, score: run.score, time: run.time,
      jumpMult: run.jumpMult || 1,
      hp: run.hp, maxHp: run.maxHp, bombs: run.bombs,
      b1b: run.b1b, b2b: run.b2b, b3b: run.b3b,
      px: run.px, py: run.py,
      boss: boss ? { hp: boss.hp, maxHp: boss.maxHp, x: boss.x, y: boss.y, dir: boss.dir,
        specials: boss.specials, specialT: boss.specialT } : null
    };
  }

  function restoreRun(snap) {
    var up = Core.loadUpgrades();
    var maxHp = Core.armorMaxHp(up.armor);
    run = {
      wave: Math.max(1, snap.wave), spawned: snap.spawned || 0, score: snap.score || 0,
      time: snap.time || 0,
      up: up,
      maxHp: maxHp, hp: Core.clamp(snap.hp != null ? snap.hp : maxHp, 1, maxHp),
      bombs: Math.max(0, snap.bombs != null ? snap.bombs : CFG.bomb.start),   // 炸弹无上限
      b1b: snap.b1b || 0, b2b: snap.b2b || 0, b3b: snap.b3b || 0,
      t1: 0, t2: 0, t3: 0, spawnT: 0,
      px: snap.px != null ? snap.px : W / 2,
      py: snap.py != null ? snap.py : CFG.plane.startY,
      mul: Core.enemyMult(snap.wave),
      jumpMult: snap.jumpMult || 1
    };
    enemies = []; bullets = []; enemyBullets = []; beams = [];
    items = []; parts = []; floaters = []; airStrikes = [];
    boss = null;
    if (snap.boss) {
      boss = {
        x: snap.boss.x, y: snap.boss.y, dir: snap.boss.dir || 1,
        hp: snap.boss.hp,
        maxHp: snap.boss.maxHp != null ? snap.boss.maxHp : snap.boss.hp,   // 兼容旧快照：旧版缺 maxHp
        t: 0.3, fireDmg: CFG.boss.fireDmg,
        radius: CFG.boss.radius, sizeW: CFG.boss.sizeW, sizeH: CFG.boss.sizeH,
        specials: snap.boss.specials && snap.boss.specials.length === 3 ? snap.boss.specials : ['laser', 'spread', 'ring'],
        specialT: snap.boss.specialT || Core.rand(8, 10),
        special: '', specialWarn: 0, specialActive: 0, specialTick: 0,
        spreadTick: 0, spreadBatch: 0, barrageTick: 0, barrageCount: 0,
        laserX: 0, laserHit: false
      };
    }
    pointer.active = false;
  }

  /* ========================================================================
   * 生成 / 波次 / BOSS
   * ====================================================================== */
  function spawnEnemy() {
    if (enemies.length >= settings.cap || boss) return;
    var r = Math.random() * 100, acc = 0, def = CFG.enemies[0];
    for (var i = 0; i < CFG.enemies.length; i++) {
      acc += CFG.enemies[i].prob;
      if (r < acc) { def = CFG.enemies[i]; break; }
    }
    var mul = run.mul;
    var e = {
      key: def.key, def: def,
      x: Core.rand(def.radius + 10, W - def.radius - 10),
      y: -def.radius,
      speed: def.speed,
      hp: def.hp * mul, maxHp: def.hp * mul,
      score: def.score * mul,
      radius: def.radius, sizeW: def.sizeW, sizeH: def.sizeH,
      fire: def.fire || 0, fireT: def.fire ? Core.rand(0.2, def.fire * 0.8) : 0,
      bulletDmg: def.bulletDmg
    };
    enemies.push(e);
    run.spawned++;
  }

  function nextWave() {
    run.wave++;
    run.spawned = 0;
    run.mul = Core.enemyMult(run.wave);
    addFloater(Core.waveText(run.wave), W / 2, H * 0.42, '#ffd76a', 30);
  }

  function spawnBoss() {
    // BOSS 血量/分数/BOMB 伤害每关按 bossMul 成长
    var bm = Core.bossMul(run.wave);
    var origHp = Math.floor(CFG.boss.baseHp * bm);
    // 保底机制：BOSS 血量不低于「平均子弹威力 × max(10, 关卡)」；
    // 击杀积分与 BOMB 伤害仍基于原始血量（bossMul），不随保底抬升
    var avgDmg = (bulletDmg('b1') + bulletDmg('b2') + bulletDmg('b3')) / 3;
    var floorHp = Math.floor(avgDmg * Math.max(10, run.wave));
    var hp = Math.max(origHp, floorHp);
    // 从 9 种特殊攻击中随机抽取 3 种（Fisher-Yates 洗牌取前 3）
    var pool = ['laser', 'doubleLaser', 'spread', 'barrage', 'summon', 'heavy', 'ring', 'split', 'airstrike'];
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    boss = {
      x: W / 2, y: CFG.boss.y, dir: 1,
      hp: hp, maxHp: hp,
      t: 0.3, fireDmg: CFG.boss.fireDmg,
      radius: CFG.boss.radius, sizeW: CFG.boss.sizeW, sizeH: CFG.boss.sizeH,   // 缺失会导致命中判定 NaN
      specials: [pool[0], pool[1], pool[2]],   // 本 BOSS 抽取的 3 种特殊攻击
      specialT: Core.rand(8, 10), special: '', specialWarn: 0, specialActive: 0, specialTick: 0,
      spreadTick: 0, spreadBatch: 0, barrageTick: 0, barrageCount: 0,
      laserX: 0, laserHit: false
    };
    // BOSS 出现提示：3s 内红色闪烁 3 次
    bossIntroT = 3;
    AudioMgr.playSfx('boss');
  }

  // BOSS 召唤敌机：每 1-3s 一架，排除资源型(enemy2)，属性与当前关卡一致（不推进波次）
  // 特殊攻击状态机：每 10s 从抽取的 2 种中随机释放 1 种（警告 -> 执行）
  function updateBossSpecial(dt) {
    boss.specialT -= dt;
    if (boss.specialT <= 0 && boss.specialWarn <= 0 && boss.specialActive <= 0) {
      var rr = Math.random();
      boss.special = boss.specials[rr < 1 / 3 ? 0 : (rr < 2 / 3 ? 1 : 2)];
      boss.specialWarn = CFG.boss.specialWarn;        // 警告 1s
      boss.specialT = Core.rand(8, 10);               // 每次独立抽取 8-10s
      boss.spreadTick = 0; boss.spreadBatch = 0;
      boss.barrageTick = 0; boss.barrageCount = 0;
    }
    if (boss.specialWarn > 0) {
      boss.specialWarn -= dt;
      if (boss.specialWarn <= 0) {
        boss.specialActive = specialActiveDur();
        boss.specialTick = 0;
        if (boss.special === 'laser') { boss.laserX = boss.x; boss.laserHit = false; }
        else if (boss.special === 'doubleLaser') {
          boss.laserX = [boss.x - CFG.boss.laserGap, boss.x + CFG.boss.laserGap];
          boss.laserHit = false;
        } else if (boss.special === 'heavy') bossFireHeavy();
        else if (boss.special === 'ring') bossRingFire();
        else if (boss.special === 'split') bossFireSplit();
        else if (boss.special === 'airstrike') bossAirstrike();
        if (boss.special === 'summon') bossSummonSquad();
      }
    }
    if (boss.specialActive > 0) {
      boss.specialActive -= dt;
      boss.specialTick += dt;
      if (boss.special === 'laser') bossLaserDamage();
      else if (boss.special === 'doubleLaser') bossDoubleLaserDamage();
      else if (boss.special === 'spread') bossSpreadFire(dt);
      else if (boss.special === 'barrage') bossBarrageFire(dt);
    }
  }

  function specialActiveDur() {
    if (boss.special === 'laser' || boss.special === 'doubleLaser') return CFG.boss.laserDur;
    if (boss.special === 'spread') return CFG.boss.spreadDur;
    if (boss.special === 'barrage') return CFG.boss.barrageDur;
    if (boss.special === 'heavy' || boss.special === 'ring' || boss.special === 'split' || boss.special === 'airstrike') return CFG.boss.heavyDur;
    return CFG.boss.summonDur;
  }

  // 激光伤害：激活期间玩家在光柱列内且位于 BOSS 下方，单次 200 伤
  function bossLaserDamage() {
    if (!boss.laserHit && run.py > boss.y &&
      Math.abs(run.px - boss.laserX) <= CFG.boss.laserW / 2 + CFG.plane.radius) {
      boss.laserHit = true;
      run.hp -= CFG.boss.laserDmg;
      hurtFeedback();
    }
  }

  // 双重激光伤害：从 BOSS 两侧的两道光柱任一命中玩家即单次 200 伤
  function bossDoubleLaserDamage() {
    if (!boss.laserHit && run.py > boss.y) {
      var xs = boss.laserX;
      for (var k = 0; k < xs.length; k++) {
        if (Math.abs(run.px - xs[k]) <= CFG.boss.laserW / 2 + CFG.plane.radius) {
          boss.laserHit = true;
          run.hp -= CFG.boss.laserDmg;
          hurtFeedback();
          break;
        }
      }
    }
  }

  // 重炮：向前方发射一枚大炮弹（直径 3 倍、速度 75%、伤害 500）
  function bossFireHeavy() {
    enemyBullets.push({
      x: boss.x, y: boss.y + boss.radius + 6,
      vx: 0, vy: CFG.enemyBullet.speed * CFG.boss.heavySpeed,
      dmg: CFG.boss.heavyDmg,
      radius: CFG.enemyBullet.radius * CFG.boss.heavySize
    });
  }

  // 环形弹幕：360° 一次发射 15 发普通子弹
  function bossRingFire() {
    var n = CFG.boss.ringCount;
    var sp = CFG.enemyBullet.speed;
    for (var i = 0; i < n; i++) {
      var ang = (Math.PI * 2 / n) * i;
      enemyBullets.push({
        x: boss.x, y: boss.y + boss.radius,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        dmg: boss.fireDmg, radius: CFG.enemyBullet.bossRadius
      });
    }
  }

  // 分裂弹：发射 1 枚大炮弹，飞行后两段分裂（500 -> 3×250 -> 9×100）
  function bossFireSplit() {
    enemyBullets.push({
      x: boss.x, y: boss.y + boss.radius + 6,
      vx: 0, vy: CFG.enemyBullet.speed,
      dmg: CFG.boss.splitDmg1,
      radius: CFG.enemyBullet.radius * CFG.boss.heavySize,
      split: 0, splitT: CFG.boss.splitDur
    });
  }

  // 定点轰炸：生成 3 个不重叠的预警区域（首个在玩家附近），延迟后打击
  function bossAirstrike() {
    var r = CFG.enemyBullet.radius * CFG.boss.heavySize;
    var spots = [];
    // 首个区域在玩家附近
    var px = Core.clamp(run.px + Core.rand(-60, 60), r + 20, W - r - 20);
    var py = Core.clamp(run.py + Core.rand(-60, 60), r + 20, H - r - 20);
    spots.push({ x: px, y: py });
    // 其余随机且不与已有重叠
    for (var i = 1; i < CFG.boss.airstrikeCount; i++) {
      var sx, sy, ok, attempt = 0;
      do {
        sx = Core.rand(r + 20, W - r - 20);
        sy = Core.rand(r + 20, H - r - 20);
        ok = true;
        for (var j = 0; j < spots.length; j++) {
          if (Math.abs(sx - spots[j].x) < r * 2 + 30 && Math.abs(sy - spots[j].y) < r * 2 + 30) { ok = false; break; }
        }
        attempt++;
      } while (!ok && attempt < 30);
      spots.push({ x: sx, y: sy });
    }
    for (var k = 0; k < spots.length; k++) {
      airStrikes.push({ x: spots[k].x, y: spots[k].y, r: r, t: CFG.boss.airstrikeDelay, dur: CFG.boss.airstrikeDelay });
    }
  }

  // 定点轰炸：预警虚影计时，到点爆炸并结算伤害
  function updateAirStrikes(dt) {
    for (var i = airStrikes.length - 1; i >= 0; i--) {
      var s = airStrikes[i];
      s.t -= dt;
      if (s.t <= 0) {
        spawnExplosion(s.x, s.y, 1.3);
        if (d2(s.x, s.y, run.px, run.py) < (s.r + CFG.plane.radius) * (s.r + CFG.plane.radius)) {
          run.hp -= CFG.boss.airstrikeDmg;
          hurtFeedback();
        }
        airStrikes.splice(i, 1);
      }
    }
  }

  // 定点轰炸：紫色预警圈 + 倒计时
  function drawAirStrikes() {
    for (var i = 0; i < airStrikes.length; i++) {
      var s = airStrikes[i];
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(Date.now() / 90);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(192,107,255,.28)';
      ctx.fill();
      ctx.strokeStyle = '#c06bff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#e8ccff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.ceil(s.t).toString(), s.x, s.y);
      ctx.restore();
    }
  }

  // 散射：1.5s 内 3 批，每批向 5 个方向（覆盖 120°）各发 1 发普通子弹
  function bossSpreadFire(dt) {
    boss.spreadTick -= dt;
    if (boss.spreadTick <= 0 && boss.spreadBatch < 3) {
      boss.spreadBatch++;
      boss.spreadTick = 0.5;
      var sp = CFG.enemyBullet.speed;
      var half = CFG.boss.spreadDeg * Math.PI / 180 / 2;   // 60°
      for (var d = 0; d < 5; d++) {
        var ang = -half + (half * 2) * (d / 4);            // -60°..+60° 五等分
        enemyBullets.push({
          x: boss.x, y: boss.y + boss.radius + 6,
          vx: Math.sin(ang) * sp, vy: Math.cos(ang) * sp,
          dmg: boss.fireDmg, radius: CFG.enemyBullet.bossRadius
        });
      }
    }
  }

  // 弹幕：1.5s 内快速向前方随机区域发射 15 发普通子弹
  function bossBarrageFire(dt) {
    boss.barrageTick -= dt;
    if (boss.barrageTick <= 0 && boss.barrageCount < 15) {
      boss.barrageCount++;
      boss.barrageTick = 0.1;
      var ang = Core.rand(-40, 40) * Math.PI / 180;
      var sp = CFG.enemyBullet.speed;
      enemyBullets.push({
        x: boss.x, y: boss.y + boss.radius + 6,
        vx: Math.sin(ang) * sp, vy: Math.cos(ang) * sp,
        dmg: boss.fireDmg, radius: CFG.enemyBullet.bossRadius
      });
    }
  }

  // 召唤大量：召唤会发射子弹的敌机（enemy3 攻击机），数量受场上上限约束
  function bossSummonSquad() {
    var toSpawn = Math.max(0, Math.min(Math.floor(Core.rand(6, 11)), settings.cap - enemies.length));   // 随机召唤 6-10 架
    var def = CFG.enemies[2];
    var mul = run.mul;
    for (var i = 0; i < toSpawn; i++) {
      enemies.push({
        key: def.key, def: def,
        x: Core.rand(def.radius + 10, W - def.radius - 10),
        y: -def.radius - i * 24,   // 错开高度避免重叠
        speed: def.speed,
        hp: def.hp * mul, maxHp: def.hp * mul,
        score: def.score * mul,
        radius: def.radius, sizeW: def.sizeW, sizeH: def.sizeH,
        fire: def.fire || 0, fireT: Core.rand(0.2, def.fire * 0.8),
        bulletDmg: def.bulletDmg
      });
    }
  }

  function bossDeath() {
    var s = Math.floor(CFG.boss.score * Core.bossMul(run.wave));
    run.score += s;
    addFloater('BOSS 击破 +' + Core.fmtNum(s), boss.x, boss.y, '#ffd76a', 16);
    spawnBossExplosion(boss.x, boss.y);   // 盛大爆炸
    AudioMgr.playSfx('boss');
    boss = null;
    nextWave();
  }

  function checkWave() {
    // 刷满本波数量，且场上敌机全部离开画面/被消灭后才出 BOSS 或进下一波
    if (!boss && run.spawned >= Core.perWaveCount(run.wave) && enemies.length === 0) {
      if (settings.boss) spawnBoss();
      else nextWave();
    }
  }

  /* ========================================================================
   * 射击
   * ====================================================================== */
  function fireFan() {
    var dmg = bulletDmg('b1');
    var cx = run.px, cy = run.py - CFG.plane.fireY;
    var n = CFG.bullets.b1.count;
    var half = CFG.bullets.b1.spreadDeg * Math.PI / 180;
    for (var i = 0; i < n; i++) {
      var ang = -half + (2 * half) * (n === 1 ? 0 : i / (n - 1));
      bullets.push({
        kind: 'b1', x: cx, y: cy,
        vx: Math.sin(ang) * CFG.bullets.b1.speed,
        vy: -Math.cos(ang) * CFG.bullets.b1.speed,
        dmg: dmg, radius: CFG.bullets.b1.radius, t: 0
      });
    }
  }

  function fireLaser() {
    var dmg = bulletDmg('b2');
    var x = run.px;
    // 光束贯穿：命中列内所有敌机（含 BOSS），一次结算
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (e.y < run.py && Math.abs(e.x - x) <= CFG.bullets.b2.beamW / 2 + e.radius) {
        e.hp -= dmg;
        if (e.hp <= 0) killEnemy(e, true);
      }
    }
    if (boss && boss.y < run.py && Math.abs(boss.x - x) <= CFG.bullets.b2.beamW / 2 + boss.radius) {
      boss.hp -= dmg;
      if (boss.hp <= 0) bossDeath();
    }
    beams.push({ x: x, y: run.py, w: CFG.bullets.b2.beamW, t: 0, dur: CFG.bullets.b2.beamDur });
  }

  function findTarget() {
    var best = null, bestHp = Infinity;
    for (var i = 0; i < enemies.length; i++) {
      if (enemies[i].hp < bestHp) { best = enemies[i]; bestHp = enemies[i].hp; }
    }
    if (boss && boss.hp < bestHp) best = boss;   // 可追踪血最低的敌人（含 BOSS）
    return best;
  }

  function fireMissile() {
    var t = findTarget();
    if (!t) return;
    var dmg = bulletDmg('b3');
    var ang = Math.atan2(t.y - (run.py - CFG.plane.fireY), t.x - run.px);
    bullets.push({
      kind: 'b3', x: run.px, y: run.py - CFG.plane.fireY,
      vx: Math.cos(ang) * CFG.bullets.b3.speed,
      vy: Math.sin(ang) * CFG.bullets.b3.speed,
      dmg: dmg, radius: CFG.bullets.b3.radius, target: t, t: 0
    });
  }

  function updateFire(dt) {
    run.t1 -= dt; run.t2 -= dt; run.t3 -= dt;
    if (run.t1 <= 0) { fireFan(); run.t1 = CFG.bullets.b1.interval; }
    if (run.t2 <= 0) { fireLaser(); run.t2 = CFG.bullets.b2.interval; }
    if (run.t3 <= 0 && findTarget()) { fireMissile(); run.t3 = CFG.bullets.b3.interval; }
  }

  function explodeMissile(b) {
    var dmg = b.dmg;
    var aoe2 = CFG.bullets.b3.aoe * CFG.bullets.b3.aoe;
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (d2(b.x, b.y, e.x, e.y) < aoe2) {
        e.hp -= dmg;
        if (e.hp <= 0) killEnemy(e, true);
      }
    }
    if (boss && d2(b.x, b.y, boss.x, boss.y) < aoe2) {
      boss.hp -= dmg;
      if (boss.hp <= 0) bossDeath();
    }
    // 追踪弹爆炸：更大的爆炸特效（大闪光 + 冲击波圆环）
    spawnExplosion(b.x, b.y, 1.8);
    parts.push({ kind: 'shock', x: b.x, y: b.y, t: 0, dur: 0.35, r0: 10, r1: CFG.bullets.b3.aoe });
    AudioMgr.playSfx('enemyExplode');
  }

  /* ========================================================================
   * 敌机
   * ====================================================================== */
  function killEnemy(e, byBullet) {
    spawnExplosion(e.x, e.y, e.radius / 11);   // 敌机被击毁特效（放大，更明显）
    AudioMgr.playSfx('enemyExplode');
    if (byBullet) {
      // 难度额外分数：噩梦 +10%、地狱 +20%
      var gained = Math.floor(e.score * (1 + Core.difficultyInfo(settings.difficulty).bonus));
      run.score += gained;
      addFloater('+' + Core.fmtNum(gained), e.x, e.y - 12, '#ffd76a', 12);
    }
    // 运输机掉道具（无论何种死因）
    if (e.key === 'enemy2') items.push(makeItem(Core.rollDrop(), e.x, e.y));
    var i = enemies.indexOf(e);
    if (i >= 0) enemies.splice(i, 1);
  }

  function makeItem(kind, x, y) {
    // 道具体型较原基准放大 30%
    return { kind: kind, x: x, y: y, vy: CFG.items.speed, sway: Core.rand(0, Math.PI * 2), t: 0, r: Math.round(15 * 1.3) };
  }

  function updateEnemies(dt) {
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      e.y += e.speed * dt;
      if (e.fire) {
        e.fireT -= dt;
        if (e.fireT <= 0) {
          // 敌机子弹：enemy3 子弹固定 50 伤，尺寸 +25%；连射 burst 发后停止 burstPause 秒
          enemyBullets.push(makeEB(e.x, e.y + e.radius, e.bulletDmg || 50, CFG.enemyBullet.enemyRadius));
          e.burstCount = (e.burstCount || 0) + 1;
          if (e.burstCount >= (e.burst || 3)) {
            e.burstCount = 0;
            e.fireT = e.burstPause || 1;
          } else {
            e.fireT = e.fire;
          }
        }
      }
      if (e.y > H + 50) enemies.splice(i, 1);
    }
  }

  /* ========================================================================
   * 子弹
   * ====================================================================== */
  function makeEB(x, y, dmg, radius) {
    return { x: x, y: y, vy: CFG.enemyBullet.speed, dmg: dmg, radius: radius || CFG.enemyBullet.radius };
  }

  function updateBullets(dt) {
    for (var i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
      if (b.kind === 'b1') {
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.y < -20) { bullets.splice(i, 1); continue; }
        var hit = false;
        for (var j = enemies.length - 1; j >= 0; j--) {
          var e = enemies[j];
          if (d2(b.x, b.y, e.x, e.y) < (b.radius + e.radius) * (b.radius + e.radius)) {
            e.hp -= b.dmg;
            spawnHitSpark(b.x, b.y);
            if (e.hp <= 0) killEnemy(e, true);
            hit = true; break;
          }
        }
        if (!hit && boss && d2(b.x, b.y, boss.x, boss.y) < (b.radius + boss.radius) * (b.radius + boss.radius)) {
          boss.hp -= b.dmg;
          spawnHitSpark(b.x, b.y);
          if (boss.hp <= 0) bossDeath();
          hit = true;
        }
        if (hit) bullets.splice(i, 1);
      }
      else if (b.kind === 'b3') {
        var t = b.target;
        var alive = t && (t === boss || enemies.indexOf(t) >= 0);
        if (!alive) { b.target = findTarget(); t = b.target; }
        if (!t) {
          b.y -= CFG.bullets.b3.speed * dt;
          if (b.y < -30) bullets.splice(i, 1);
          continue;
        }
        var ang = Math.atan2(b.vy, b.vx);
        var tAng = Math.atan2(t.y - b.y, t.x - b.x);
        ang += Core.clamp(normAngle(tAng - ang), -CFG.bullets.b3.turnRate * dt, CFG.bullets.b3.turnRate * dt);
        b.vx = Math.cos(ang) * CFG.bullets.b3.speed;
        b.vy = Math.sin(ang) * CFG.bullets.b3.speed;
        b.x += b.vx * dt; b.y += b.vy * dt;
        // 爆炸判定：命中目标，或爆炸范围内有敌人（含 BOSS）即立刻爆炸
        var rr = b.radius + t.radius;
        var explodeNow = d2(b.x, b.y, t.x, t.y) < rr * rr;
        if (!explodeNow) {
          var aoe2 = CFG.bullets.b3.aoe * CFG.bullets.b3.aoe;
          for (var jj = enemies.length - 1; jj >= 0; jj--) {
            if (d2(b.x, b.y, enemies[jj].x, enemies[jj].y) < aoe2) { explodeNow = true; break; }
          }
          if (!explodeNow && boss && d2(b.x, b.y, boss.x, boss.y) < aoe2) explodeNow = true;
        }
        if (explodeNow) {
          explodeMissile(b);
          bullets.splice(i, 1);
        } else if (b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) {
          bullets.splice(i, 1);
        }
      }
    }
  }

  function updateBeams(dt) {
    for (var i = beams.length - 1; i >= 0; i--) {
      beams[i].t += dt;
      if (beams[i].t >= beams[i].dur) beams.splice(i, 1);
    }
  }

  function updateEnemyBullets(dt) {
    for (var i = enemyBullets.length - 1; i >= 0; i--) {
      var b = enemyBullets[i];
      b.x += (b.vx || 0) * dt;   // 支持斜向（BOSS 散射 / 环形弹幕）
      b.y += b.vy * dt;
      // 分裂弹：到点分裂成 3 枚（500 -> 3×250 -> 9×100）
      if (b.split != null && b.split < 2) {
        b.splitT -= dt;
        if (b.splitT <= 0) {
          var baseAng = Math.atan2(b.vy, b.vx);
          var subDmg = b.split === 0 ? CFG.boss.splitDmg2 : CFG.boss.splitDmg3;
          for (var s = -1; s <= 1; s++) {
            var ang = baseAng + s * 30 * Math.PI / 180;
            enemyBullets.push({
              x: b.x, y: b.y,
              vx: Math.cos(ang) * CFG.enemyBullet.speed,
              vy: Math.sin(ang) * CFG.enemyBullet.speed,
              dmg: subDmg,
              radius: b.split === 0 ? CFG.enemyBullet.bossRadius : CFG.enemyBullet.radius,
              split: b.split + 1,
              splitT: CFG.boss.splitDur
            });
          }
          spawnHitSpark(b.x, b.y);
          enemyBullets.splice(i, 1);
          continue;
        }
      }
      if (b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 30) { enemyBullets.splice(i, 1); continue; }
      if (d2(b.x, b.y, run.px, run.py) < (b.radius + CFG.plane.radius) * (b.radius + CFG.plane.radius)) {
        run.hp -= b.dmg;
        hurtFeedback();
        enemyBullets.splice(i, 1);
      }
    }
  }

  /* ========================================================================
   * 道具
   * ====================================================================== */
  var ITEM_MAGNET_R = 340;   // 道具磁吸范围：近距离内才朝玩家移动
  function updateItems(dt) {
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      it.t += dt;
      var dx = run.px - it.x, dy = run.py - it.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (dist < ITEM_MAGNET_R) {
        // 近距离：朝玩家磁吸，越近吸得越快
        var pull = 150 * (1 - dist / ITEM_MAGNET_R) + 40;
        it.x += dx / dist * pull * dt;
        it.y += dy / dist * pull * dt;
      } else {
        // 远处：保持缓慢下落 + 左右摆动
        it.x += Math.sin(it.sway + it.t * 2.2) * 0.8;
        it.y += it.vy * dt;
      }
      if (it.y > H + 30) { items.splice(i, 1); continue; }
      // 拾取判定随道具体型放宽
      var catchR = it.r + 15;
      if (d2(it.x, it.y, run.px, run.py) < catchR * catchR) collectItem(it);
    }
  }

  function collectItem(it) {
    var idx = items.indexOf(it);
    if (idx >= 0) items.splice(idx, 1);
    var txt, col;
    if (it.kind === 'bomb') {
      run.bombs += 1;                              // 炸弹无上限
      txt = '炸弹 +1'; col = '#ff9a8a';
    } else if (it.kind === 'life') {
      var heal = Math.round(run.maxHp * 0.2);
      run.hp = Math.min(run.maxHp, run.hp + heal);
      txt = '生命 +' + heal; col = '#7df0a4';
    } else if (it.kind === 'score') {
      var sc = Math.floor(CFG.items.scoreBase * run.mul);   // 基础 500，随关卡浮动（同敌机生命规则）
      run.score += sc;
      txt = '+' + Core.fmtNum(sc); col = '#ffd700';
    } else {
      run[it.kind + 'b'] += 1;               // b1b / b2b / b3b 累加，伤害 ×1.01
      txt = '威力 +1%'; col = kindColor(it.kind);
    }
    addFloater(txt, it.x, it.y - 14, col, 12);
  }

  function kindColor(kind) {
    if (kind === 'b1') return '#ffd76a';
    if (kind === 'b2') return '#4db8ff';
    if (kind === 'b3') return '#ff6b5a';
    if (kind === 'life') return '#7df0a4';
    if (kind === 'score') return '#ffd700';
    return '#ff9a8a';
  }

  /* ========================================================================
   * 飞机 / BOSS / 碰撞
   * ====================================================================== */
  function updatePlane(dt) {
    var kx = 0, ky = 0;
    if (keys.left) kx -= 1;
    if (keys.right) kx += 1;
    if (keys.up) ky -= 1;
    if (keys.down) ky += 1;
    if (kx !== 0 || ky !== 0) {
      var len = Math.sqrt(kx * kx + ky * ky);
      run.px += kx / len * CFG.plane.speed * dt;
      run.py += ky / len * CFG.plane.speed * dt;
      pointer.active = false;   // 键盘接管后取消指针跟随，避免松开时瞬移
    } else if (pointer.active) {
      run.px = pointer.x;
      run.py = pointer.y;
    }
    // 水平：左右留边；垂直：让出顶部/底部 HUD 区域，避免飞机被遮挡
    run.px = Core.clamp(run.px, CFG.plane.sizeW / 2 + 24, W - CFG.plane.sizeW / 2 - 24);
    run.py = Core.clamp(run.py, CFG.plane.sizeH / 2 + 56, H - CFG.plane.sizeH / 2 - 60);
  }

  function updateBoss(dt) {
    if (!boss) return;
    boss.x += CFG.boss.speed * boss.dir * dt;
    // 左右边界：用绘制半宽而非碰撞半径，确保 BOSS 不超出屏幕
    var halfW = CFG.boss.sizeW / 2;
    if (boss.x < halfW + 4) { boss.x = halfW + 4; boss.dir = 1; }
    if (boss.x > W - halfW - 4) { boss.x = W - halfW - 4; boss.dir = -1; }
    // BOSS 发射子弹：每 fireInterval(0.5s) 一次，随机角度散射（相对正下方 ±35°），子弹尺寸 +50%
    boss.t -= dt;
    if (boss.t <= 0) {
      var spread = 35 * Math.PI / 180;
      var a = Core.rand(-spread, spread);
      var sp = CFG.enemyBullet.speed;
      enemyBullets.push({
        x: boss.x, y: boss.y + boss.radius + 6,
        vx: Math.sin(a) * sp, vy: Math.cos(a) * sp,
        dmg: boss.fireDmg, radius: CFG.enemyBullet.bossRadius
      });
      boss.t = CFG.boss.fireInterval;
    }
    // 特殊攻击状态机（每 10s 随机释放抽取到的 1 种；BOSS 战不再随机刷小怪）
    updateBossSpecial(dt);
    // 重叠：双方每秒受到 100 伤害，直到分开
    if (d2(boss.x, boss.y, run.px, run.py) < (boss.radius + CFG.plane.radius) * (boss.radius + CFG.plane.radius)) {
      run.hp -= CFG.boss.collideDps * dt;
      boss.hp -= CFG.boss.collideDps * dt;
      hurtFeedback();
    }
    if (boss.hp <= 0) bossDeath();
  }

  function updateCollisions() {
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (d2(e.x, e.y, run.px, run.py) < (e.radius + CFG.plane.radius) * (e.radius + CFG.plane.radius)) {
        // 碰撞扣血：所有敌机本体统一 = min(当前剩余生命, 第一波基础生命)，无特殊规则
        var dmg = Math.min(e.hp, e.def.hp);
        run.hp -= dmg;
        hurtFeedback();
        killEnemy(e, false);
      }
    }
  }

  function checkPlayerDeath() {
    if (run.hp <= 0 && state === 'playing') {
      run.hp = 0;
      state = 'dying';
      deathT = 0;
      spawnExplosion(run.px, run.py, 1.4);
      AudioMgr.playSfx('enemyExplode');
    }
  }

  /* ========================================================================
   * 特效
   * ====================================================================== */
  // 敌机击毁爆炸：更大的闪光 + 更多喷溅碎片，保证肉眼可见
  function spawnExplosion(x, y, scale) {
    parts.push({ kind: 'flash', x: x, y: y, t: 0, dur: 0.35, scale: scale, r0: 28 * scale });
    var colors = ['#ffd76a', '#ff9a3d', '#ff6b5a', '#fff', '#ffca28'];
    var n = Math.max(10, Math.round(14 * scale));
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = Core.rand(70, 200);
      parts.push({
        kind: 'debris', x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        t: 0, dur: Core.rand(0.25, 0.55), r: Core.rand(2, 5),
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }
  // BOSS 击杀盛大爆炸：大闪光 + 冲击波 + 多簇爆炸 + 白闪
  function spawnBossExplosion(x, y) {
    spawnExplosion(x, y, 3.4);
    parts.push({ kind: 'shock', x: x, y: y, t: 0, dur: 0.7, r0: 20, r1: Math.max(W, H) * 1.1 });
    for (var i = 0; i < 10; i++) {
      spawnExplosion(x + Core.rand(-70, 70), y + Core.rand(-50, 50), Core.rand(0.8, 1.8));
    }
    screenFlash = 0.5;
  }

  // 炸弹特效：使用 bomb.png 素材的大爆炸（放大渐隐）+ 扩散冲击波圆环
  function spawnShockwave(x, y) {
    parts.push({ kind: 'shock', x: x, y: y, t: 0, dur: 0.55, r0: 16, r1: Math.max(W, H) * 0.9 });
    parts.push({ kind: 'bflash', x: x, y: y, t: 0, dur: 0.5, r0: 26, r1: 175 });
  }
  function spawnHitSpark(x, y) {
    parts.push({ kind: 'debris', x: x, y: y, vx: Core.rand(-60, 60), vy: Core.rand(-60, 60), t: 0, dur: 0.2, r: 2.5, color: '#ffffff' });
  }

  // 飞机被击中反馈：红色闪屏 + 小爆炸特效（爆炸节流，防持续伤害时粒子堆积）
  function hurtFeedback() {
    hurtFlash = 0.5;
    if (Date.now() - lastHurtFx > 250) {
      lastHurtFx = Date.now();
      spawnExplosion(run.px, run.py, 0.9);
    }
    spawnHitSpark(run.px, run.py);
  }

  function addFloater(text, x, y, color, size) {
    floaters.push({ text: text, x: x, y: y, t: 0, dur: 0.9, color: color || '#fff', size: size || 13 });
  }

  function updateParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.t += dt;
      if (p.t >= p.dur) { parts.splice(i, 1); continue; }
      if (p.kind === 'debris') { p.x += p.vx * dt; p.y += p.vy * dt; }
    }
    // 限制粒子总数，防止 BOSS 等大爆炸堆积导致绘制过多
    if (parts.length > 220) parts.splice(0, parts.length - 220);
  }
  function updateFloaters(dt) {
    for (var i = floaters.length - 1; i >= 0; i--) {
      var f = floaters[i];
      f.t += dt; f.y -= 46 * dt;
      if (f.t >= f.dur) floaters.splice(i, 1);
    }
  }

  /* ========================================================================
   * 主循环
   * ====================================================================== */
  function frame(now) {
    if (!lastT) lastT = now;
    var dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    if (state === 'playing' || state === 'dying') update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function update(dt) {
    updateParts(dt);
    updateFloaters(dt);
    // 全屏闪屏渐隐
    if (redFlash > 0) redFlash = Math.max(0, redFlash - dt * 1.3);
    if (screenFlash > 0) screenFlash = Math.max(0, screenFlash - dt * 1.6);
    if (hurtFlash > 0) hurtFlash = Math.max(0, hurtFlash - dt * 1.8);
    if (bossIntroT > 0) bossIntroT = Math.max(0, bossIntroT - dt);
    if (state === 'dying') {
      deathT += dt;
      if (deathT >= CFG.deathDelay) gameOver();
      return;
    }
    if (state !== 'playing' || !run) return;

    updatePlane(dt);
    updateFire(dt);
    run.time += dt;   // 本局计时
    // 敌机刷新：按难度间隔一艘；本波刷满后停止，等场上清空进 BOSS/下一波
    var spawnGap = Core.difficultyInfo(settings.difficulty).spawn;
    run.spawnT += dt;
    if (run.spawnT >= spawnGap) {
      if (enemies.length < settings.cap && !boss && run.spawned < Core.perWaveCount(run.wave)) {
        spawnEnemy();
        run.spawnT -= spawnGap;
      } else {
        run.spawnT = spawnGap;
      }
    }
    updateBullets(dt);
    updateEnemies(dt);
    updateCollisions();
    updateEnemyBullets(dt);
    updateItems(dt);
    updateBoss(dt);
    updateBeams(dt);
    updateAirStrikes(dt);
    checkPlayerDeath();
    checkWave();
    // HUD 文本节流更新（减少 DOM 写入；炸弹等即时场景单独调用 updateHUD）
    hudT += dt;
    if (hudT >= 0.12) { hudT = 0; updateHUD(); }
  }

  /* ========================================================================
   * 渲染
   * ====================================================================== */
  function drawImg(img, cx, cy, w, h, rot) {
    if (!img) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot == null ? -Math.PI / 2 : rot);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawBackground() {
    var img = IMG.background;
    if (!img) { return; }
    // 逆时针旋转后：源宽 -> 屏幕纵向，源高 -> 屏幕横向
    var scale = Math.max(H / img.width, W / img.height);
    var w = img.width * scale, h = img.height * scale;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawHpBar(cx, cy, ratio, w, h) {
    var r = Core.clamp(ratio, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(cx - w / 2, cy, w, h);
    ctx.fillStyle = r > 0.5 ? '#67e08f' : (r > 0.25 ? '#ffd76a' : '#ff6b5a');
    ctx.fillRect(cx - w / 2, cy, w * r, h);
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - w / 2, cy, w, h);
  }

  function drawBossBar() {
    if (!boss) return;
    var bw = 300, bh = 10;
    ctx.save();
    // 血条
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(W / 2 - bw / 2, 56, bw, bh);
    var r = Core.clamp(boss.hp / boss.maxHp, 0, 1);
    var grad = ctx.createLinearGradient(W / 2 - bw / 2, 0, W / 2 + bw / 2, 0);
    grad.addColorStop(0, '#ff6b5a');
    grad.addColorStop(1, '#ff3d2e');
    ctx.fillStyle = grad;
    ctx.fillRect(W / 2 - bw / 2, 56, bw * r, bh);
    ctx.strokeStyle = 'rgba(255,255,255,.4)';
    ctx.strokeRect(W / 2 - bw / 2, 56, bw, bh);
    // BOSS 名称 + 具体血量（当前/总）
    ctx.fillStyle = '#ffd7cc';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BOSS', W / 2 - bw / 2 + 26, 50);
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(Core.fmtNum(Math.ceil(boss.hp)) + ' / ' + Core.fmtNum(Math.ceil(boss.maxHp)), W / 2, 50);
    // 技能条：血条下方，每个技能用与警告闪烁一致的专属颜色
    var labelX = W / 2 - bw / 2 + 8;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    for (var i = 0; i < boss.specials.length; i++) {
      var st = '[' + (SPECIAL_NAMES[boss.specials[i]] || '') + ']';
      ctx.fillStyle = specialColor(boss.specials[i]);
      ctx.fillText(st, labelX, 75);
      labelX += ctx.measureText(st).width + 6;
    }
    ctx.restore();
  }

  // BOSS 特殊技能中文名映射
  var SPECIAL_NAMES = { laser: '激光', doubleLaser: '双重激光', spread: '散射', barrage: '弹幕', summon: '召唤', heavy: '重炮', ring: '环形弹幕', split: '分裂弹', airstrike: '定点轰炸' };
  // 每种技能专属提示色（与 drawBossWarnGlow 警告闪烁一致）
  function specialColor(name) {
    if (name === 'laser' || name === 'doubleLaser') return '#ff4d3d';   // 红
    if (name === 'spread' || name === 'barrage' || name === 'ring') return '#ffd76a';   // 黄
    if (name === 'split') return '#4db8ff';   // 蓝
    if (name === 'summon') return '#7df0a4';   // 绿
    if (name === 'heavy' || name === 'airstrike') return '#c06bff';   // 紫
    return '#9fe0ff';
  }

  // 特殊攻击警告：释放前身体闪烁对应颜色（激光=红 / 散射·弹幕=黄 / 召唤=绿）
  function drawBossWarnGlow() {
    var col = '#ff4d3d';   // 激光 / 双重激光：红
    if (boss.special === 'spread' || boss.special === 'barrage' || boss.special === 'ring') col = '#ffd76a';   // 散射 / 弹幕 / 环形：黄
    if (boss.special === 'split') col = '#4db8ff';    // 分裂弹：蓝
    if (boss.special === 'summon') col = '#7df0a4';   // 召唤：绿
    if (boss.special === 'heavy' || boss.special === 'airstrike') col = '#c06bff';    // 重炮 / 定点轰炸：紫
    var a = 0.3 + 0.2 * Math.sin(Date.now() / 80);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, CFG.boss.radius + 14, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, CFG.boss.radius, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();
  }

  // BOSS 激光：竖直向下的光柱（BOSS 底部到画面底部），laserX 可为单值或两侧数组（双重激光）
  function drawBossLaser() {
    var xs = boss.laserX;
    if (typeof xs === 'number') xs = [xs];
    for (var i = 0; i < xs.length; i++) drawLaserColumn(xs[i]);
  }
  function drawLaserColumn(x) {
    var top = boss.y + boss.radius;
    var len = Math.max(1, H - top);
    ctx.save();
    ctx.translate(x, top + len / 2);
    ctx.rotate(-Math.PI / 2);
    // 外层光晕（沿屏幕横向左右渐隐）
    var glow = ctx.createLinearGradient(0, -(CFG.boss.laserW / 2 + 9), 0, CFG.boss.laserW / 2 + 9);
    glow.addColorStop(0, 'rgba(255,80,60,0)');
    glow.addColorStop(0.5, 'rgba(255,90,70,0.55)');
    glow.addColorStop(1, 'rgba(255,80,60,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-len / 2, -(CFG.boss.laserW / 2 + 9), len, CFG.boss.laserW + 18);
    // 主体
    ctx.fillStyle = 'rgba(255,45,30,0.95)';
    ctx.fillRect(-len / 2, -CFG.boss.laserW / 2, len, CFG.boss.laserW);
    // 白芯
    ctx.fillStyle = 'rgba(255,235,230,0.9)';
    ctx.fillRect(-len / 2, -CFG.boss.laserW * 0.3, len, CFG.boss.laserW * 0.6);
    ctx.restore();
  }

  // 道具绘制：生命=爱心♥，炸弹=B 字母，三子弹=同色向上箭头；均有彩色外圈
  function drawItem(it) {
    ctx.save();
    ctx.translate(it.x, it.y);
    var color = kindColor(it.kind);
    // 深色底圆 + 彩色外圈
    ctx.beginPath();
    ctx.arc(0, 0, it.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,18,34,.85)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (it.kind === 'life') {
      // 爱心（字符渲染）
      ctx.font = 'bold ' + Math.round(it.r * 1.6) + 'px sans-serif';
      ctx.fillStyle = '#ff6b8a';
      ctx.fillText('♥', 0, 1);
    } else if (it.kind === 'bomb') {
      // B 字母（大招）
      ctx.font = 'bold ' + Math.round(it.r * 1.5) + 'px sans-serif';
      ctx.fillStyle = color;
      ctx.fillText('B', 0, 1);
    } else if (it.kind === 'score') {
      // 积分道具：钻石外形
      drawDiamond(it.r);
    } else {
      // 向上箭头：表示子弹威力提升
      drawUpArrow(it.r, color);
    }
    // 浮动光晕
    ctx.globalAlpha = 0.4 + 0.3 * Math.sin(it.t * 6);
    ctx.beginPath();
    ctx.arc(0, 0, it.r + 4, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }
  function drawUpArrow(size, color) {
    var w = size * 0.42, shaft = size * 0.16, head = size * 0.55, tail = size * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -head);               // 尖端朝上
    ctx.lineTo(w, -size * 0.08);
    ctx.lineTo(shaft, -size * 0.08);
    ctx.lineTo(shaft, tail);
    ctx.lineTo(-shaft, tail);
    ctx.lineTo(-shaft, -size * 0.08);
    ctx.lineTo(-w, -size * 0.08);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  // 积分道具：蓝白色钻石（上尖下尖、左右宽，带高光面）
  function drawDiamond(size) {
    var h = size * 1.15, w = size * 0.72;
    ctx.save();
    ctx.translate(0, 1);
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.lineTo(w, 0);
    ctx.lineTo(0, h);
    ctx.lineTo(-w, 0);
    ctx.closePath();
    ctx.fillStyle = '#8fd8ff';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.stroke();
    // 高光切面
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.85);
    ctx.lineTo(w * 0.35, -0);
    ctx.lineTo(0, h * 0.35);
    ctx.lineTo(-w * 0.35, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fill();
    ctx.restore();
  }

  // 激光：向前（竖直）一条光柱，纯纵向辉光，绝无横向"十字"。
  // 注意：rotate(-90°) 后 fillRect 的"宽"沿屏幕纵向、"高"沿屏幕横向，务必对应好。
  function drawBeam(b) {
    var len = b.y;   // 光束长度：屏幕顶部到飞机
    var pulse = 0.6 + 0.4 * Math.sin(b.t * 42 + 0.3);
    ctx.save();
    ctx.translate(b.x, b.y / 2);
    ctx.rotate(-Math.PI / 2);
    // 外层辉光：沿 local y（屏幕横向）做中心亮边缘透明
    var glow = ctx.createLinearGradient(0, -(b.w / 2 + 9), 0, b.w / 2 + 9);
    glow.addColorStop(0, 'rgba(70,150,255,0)');
    glow.addColorStop(0.5, 'rgba(120,190,255,' + (0.55 * pulse) + ')');
    glow.addColorStop(1, 'rgba(70,150,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-len / 2, -(b.w / 2 + 9), len, b.w + 18);
    // 主体激光（中心亮、两侧暗）
    var core = ctx.createLinearGradient(0, -b.w / 2, 0, b.w / 2);
    core.addColorStop(0, 'rgba(50,130,255,' + (0.9 * pulse) + ')');
    core.addColorStop(0.5, 'rgba(120,200,255,0.98)');
    core.addColorStop(1, 'rgba(50,130,255,' + (0.9 * pulse) + ')');
    ctx.fillStyle = core;
    ctx.fillRect(-len / 2, -b.w / 2, len, b.w);
    // 白色亮芯
    ctx.fillStyle = 'rgba(235,248,255,' + (0.9 * pulse) + ')';
    ctx.fillRect(-len / 2, -b.w * 0.28, len, b.w * 0.56);
    ctx.restore();
    // 顶端命中闪光（激光尽头的小亮点）
    ctx.globalAlpha = 0.5 * pulse;
    ctx.beginPath();
    ctx.arc(b.x, 4, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#cdeaff';
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawParts() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.kind === 'flash') {
        var a = 1 - p.t / p.dur;
        var s = p.r0 * (1 + p.t / p.dur * 0.6);
        ctx.save();
        ctx.globalAlpha = a;
        drawImg(IMG.explode, p.x, p.y, s, s);
        ctx.restore();
      } else if (p.kind === 'shock') {
        // 扩散冲击波圆环
        var pr = p.r0 + (p.r1 - p.r0) * (p.t / p.dur);
        var pa = 1 - p.t / p.dur;
        ctx.globalAlpha = pa * 0.85;
        ctx.strokeStyle = '#fff6dd';
        ctx.lineWidth = 7 * pa + 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (p.kind === 'bflash') {
        // bomb.png 素材爆炸：放大渐隐
        var br = p.r0 + (p.r1 - p.r0) * (p.t / p.dur);
        var ba = 1 - p.t / p.dur;
        ctx.save();
        ctx.globalAlpha = ba;
        drawImg(IMG.bomb, p.x, p.y, br, br);
        ctx.restore();
      } else {
        // 碎片用 fillRect 代替 arc（省去路径计算，绘制更快）
        ctx.globalAlpha = 1 - p.t / p.dur;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawFloaters() {
    for (var i = 0; i < floaters.length; i++) {
      var f = floaters[i];
      var a = 1 - f.t / f.dur;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = 'bold ' + f.size + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 深色描边代替 shadowBlur（阴影极耗性能，是卡顿主因之一）
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.65)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  function enemyImg(e) {
    return IMG[e.key] || IMG.enemy1;
  }

  // 运输机高亮：黄色光晕 + 黄色描边，提示它掉落道具
  function drawTransportGlow(e) {
    ctx.save();
    ctx.globalAlpha = 0.32 + 0.15 * Math.sin(Date.now() / 200);
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius + 11, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd76a';
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffd76a';
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    if (!run) return;

    // 道具
    for (var i = 0; i < items.length; i++) {
      if (items[i].y < -40 || items[i].y > H + 40) continue;   // 屏外跳过绘制
      drawItem(items[i]);
    }
    // 激光
    for (var j = 0; j < beams.length; j++) drawBeam(beams[j]);
    // 敌机 + 血条
    for (var k = 0; k < enemies.length; k++) {
      var e = enemies[k];
      if (e.y < -50 || e.y > H + 50) continue;   // 屏外跳过绘制
      if (e.key === 'enemy2') drawTransportGlow(e);   // 运输机高亮提示（会掉道具）
      drawImg(enemyImg(e), e.x, e.y, e.sizeW, e.sizeH);
      if (settings.showHp) drawHpBar(e.x, e.y - e.sizeH / 2 - 8, e.hp / e.maxHp, e.sizeW, 4);
    }
    // BOSS
    if (boss) {
      drawImg(IMG.boss, boss.x, boss.y, CFG.boss.sizeW, CFG.boss.sizeH);
      if (boss.specialWarn > 0) drawBossWarnGlow();   // 特殊攻击警告（红/黄/绿闪烁）
      if ((boss.special === 'laser' || boss.special === 'doubleLaser') && boss.specialActive > 0) drawBossLaser();    // 激光光柱
      if (settings.showHp) drawBossBar();
    }
    // 我方子弹（扇形/追踪）
    for (var m = 0; m < bullets.length; m++) {
      var b = bullets[m];
      if (b.y < -30 || b.y > H + 30) continue;   // 屏外跳过绘制
      if (b.kind === 'b1') drawImg(IMG.bullet1, b.x, b.y, 24, 16);
      else drawImg(IMG.bullet3, b.x, b.y, 18, 18);
    }
    // 我方飞机
    if (state !== 'over') {
      var planeImg = (run.hp <= 0 && IMG.planeDie) ? IMG.planeDie : IMG.plane;
      drawImg(planeImg, run.px, run.py, CFG.plane.sizeW, CFG.plane.sizeH);
    }
    // 敌方子弹（绘制尺寸随碰撞半径比例放大：敌机+25%、BOSS+50%）
    for (var n = 0; n < enemyBullets.length; n++) {
      var eb2 = enemyBullets[n];
      if (eb2.y < -30 || eb2.y > H + 30 || eb2.x < -40 || eb2.x > W + 40) continue;   // 屏外跳过绘制
      var es = eb2.radius / CFG.enemyBullet.radius;
      drawImg(IMG.enemyBullet, eb2.x, eb2.y, 24 * es, 16 * es);
    }
    // 特效与浮字
    drawParts();
    drawFloaters();
    // 定点轰炸预警圈
    drawAirStrikes();
    // 全屏闪屏（最后绘制，盖在画面上层）
    if (hurtFlash > 0) {
      ctx.fillStyle = 'rgba(255,30,20,' + (hurtFlash * 0.9).toFixed(3) + ')';   // 被击中红色闪屏（更明显）
      ctx.fillRect(0, 0, W, H);
    }
    if (redFlash > 0) {
      ctx.fillStyle = 'rgba(255,30,20,' + redFlash.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (screenFlash > 0) {
      ctx.fillStyle = 'rgba(255,244,214,' + screenFlash.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    // BOSS 出现提示：3s 内红色闪烁 3 次（每 1s 一亮，伴红色大字）
    if (bossIntroT > 0) {
      var elapsed = 3 - bossIntroT;          // 0..3
      var cycle = elapsed % 1;               // 每 1s 一个闪烁周期
      if (cycle < 0.6) {
        var ia = 0.45 * (1 - bossIntroT / 3 * 0.4);
        ctx.fillStyle = 'rgba(255,30,20,' + ia.toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ff4d3d';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(0,0,0,.6)';
        ctx.strokeText('⚠ BOSS 出现！', W / 2, H * 0.3);
        ctx.fillText('⚠ BOSS 出现！', W / 2, H * 0.3);
      }
    }
  }

  /* ========================================================================
   * HUD
   * ====================================================================== */
  function updateHUD() {
    if (!run) return;
    elScore.textContent = '分数：' + Core.fmtNum(run.score);
    elTime.textContent = Core.fmtTime(run.time);
    elProgress.textContent = '进度：' + run.spawned + '/' + Core.perWaveCount(run.wave);
    elWave.textContent = Core.waveText(run.wave);
    elHp.textContent = Math.ceil(run.hp) + '/' + run.maxHp;
    elBombs.textContent = run.bombs;
    elP1.textContent = Core.fmtDmg(bulletDmg('b1'));
    elP2.textContent = Core.fmtDmg(bulletDmg('b2'));
    elP3.textContent = Core.fmtDmg(bulletDmg('b3'));
  }

  /* ========================================================================
   * 流程控制（对外）
   * ====================================================================== */
  function doBomb() {
    if (!run || state !== 'playing' || run.bombs <= 0) return;
    run.bombs--;
    AudioMgr.playSfx('bomb');
    // bomb 特效：白色闪屏 + 从飞机位置扩散的大冲击波
    screenFlash = 0.55;
    spawnShockwave(run.px, run.py);
    // 清理所有普通敌机（bomb 击杀：正常得分 + 运输机掉落，汇总一个浮字）
    var gained = 0;
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      spawnExplosion(e.x, e.y, 1.1);
      gained += Math.floor(e.score * (1 + Core.difficultyInfo(settings.difficulty).bonus));
      if (e.key === 'enemy2') {
        items.push(makeItem(Core.rollDrop(), e.x, e.y));
      }
    }
    enemies = [];
    run.score += gained;
    if (gained > 0) addFloater('+' + Core.fmtNum(gained), run.px, run.py - 40, '#ffd76a', 15);
    // 清空所有敌方子弹
    enemyBullets = [];
    // 对 BOSS 造成固定伤害
    if (boss) {
      // BOMB 对 BOSS 伤害：基础 1000，随波次提升 50%
      var bossDmg = Math.floor(CFG.bomb.bossDmg * Core.bossMul(run.wave));
      boss.hp -= bossDmg;
      addFloater('-' + Core.fmtNum(bossDmg), boss.x, boss.y, '#ffd76a', 15);
      if (boss.hp <= 0) bossDeath();
    }
    updateHUD();
  }

  function startRun(jump) {
    newRun(jump);
    state = 'playing';
    AudioMgr.setSuspended(false);
    AudioMgr.playMusic('game');
  }

  function continueRun() {
    var snap = Core.loadCheckpoint();
    if (!snap) return false;
    restoreRun(snap);
    state = 'playing';
    AudioMgr.setSuspended(false);
    AudioMgr.playMusic('game');
    return true;
  }

  function pause() {
    if (state === 'playing') state = 'paused';
    AudioMgr.setSuspended(true);   // 暂停期间静音一切
  }
  function resume() {
    if (state === 'paused') {
      state = 'playing';
      AudioMgr.setSuspended(false);
      AudioMgr.playMusic('game');
      lastT = 0;
    }
  }
  function restart() {
    newRun();
    state = 'playing';
    AudioMgr.setSuspended(false);
    AudioMgr.playMusic('game');
  }
  function toHome() {
    if (run && (state === 'playing' || state === 'paused')) {
      Core.saveCheckpoint(makeSnapshot());
    }
    state = 'idle';
    run = null;
    enemies = []; bullets = []; enemyBullets = []; beams = [];
    items = []; parts = []; floaters = []; airStrikes = [];
    boss = null;
    AudioMgr.setSuspended(false);   // 解除暂停挂起，回首页可播 home
  }

  function gameOver() {
    state = 'over';
    var score = Math.floor(run.score);
    var wave = run.wave;
    var points = Math.floor(score / 100);
    // 本地榜
    Core.addLocalLB(score, wave);
    // 积分入账
    Core.addBalance(points);
    Core.clearCheckpoint();
    AudioMgr.stopBgm();
    // B站 异步提交：board1=高分(编码)，board2=等级
    submitGlobal(score);
    if (root.UI && root.UI.showGameOver) {
      root.UI.showGameOver(score, wave, points);
    }
  }

  function submitGlobal(score) {
    ensureSDK(function (ok) {
      if (!ok || !window.toy) return;
      try {
        window.toy.submitScore({ board: CFG.bScoreBoard, score: Core.encodeScore(score) })
          .catch(function () { /* 忽略 */ });
      } catch (e) { /* 忽略 */ }
      try {
        var lv = Core.playerLevel(Core.loadUpgrades());
        window.toy.submitScore({ board: CFG.bLevelBoard, score: lv })
          .catch(function () { /* 忽略 */ });
      } catch (e) { /* 忽略 */ }
    });
  }

  function ensureSDK(cb) {
    if (typeof window.toy !== 'undefined' && window.toy && typeof window.toy.submitScore === 'function') {
      cb(true); return;
    }
    try {
      var s = document.createElement('script');
      s.src = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
      s.async = true;
      s.onload = function () { cb(!!window.toy); };
      s.onerror = function () { cb(false); };
      document.head.appendChild(s);
    } catch (e) { cb(false); }
  }

  // 暂停中主动结束本局并结算（不走死亡动画，直接结算）
  function endRun() {
    if (!run) return;
    gameOver();
  }

  function isInRun() { return run && (state === 'playing' || state === 'paused' || state === 'dying'); }
  function getState() { return state; }
  function getRunInfo() { return run; }

  /* ========================================================================
   * 对外 API
   * ====================================================================== */
  root.Game = {
    init: init,
    refreshSettings: refreshSettings,
    startRun: startRun,
    continueRun: continueRun,
    pause: pause,
    resume: resume,
    restart: restart,
    endRun: endRun,
    toHome: toHome,
    doBomb: doBomb,
    isInRun: isInRun,
    getState: getState,
    getRunInfo: getRunInfo,
    // 调试/测试访问器
    getBoss: function () { return boss; },
    getEnemyBullets: function () { return enemyBullets; },
    getBullets: function () { return bullets; },
    setHudEls: function (els) {
      elScore = els.score; elProgress = els.progress; elTime = els.time; elWave = els.wave; elHp = els.hp;
      elBombs = els.bombs; elP1 = els.p1; elP2 = els.p2; elP3 = els.p3;
    },
    W: W, H: H
  };
})(typeof self !== 'undefined' ? self : this);
