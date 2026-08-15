/**
 * core.js —— 纯逻辑与数据层（与 DOM 无关，可在 Node 中做单元测试）
 *
 * 职责：
 *  1. 数值常量定义（世界、飞机、子弹、敌机、BOSS、波次、道具、商店）
 *  2. 纯函数（格式化、科学计数编码/解码、商店花费、伤害累乘等）
 *  3. 本地存储（设置、商店等级、积分、本地排行榜、局内断点）
 *
 * UMD 包装：浏览器挂到 window.PlaneCore，Node 中 module.exports，方便 test.js 引用。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.PlaneCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ========================================================================
   * 基础工具
   * ====================================================================== */
  var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var randInt = function (a, b) { return Math.floor(rand(a, b + 1)); };

  /* ========================================================================
   * 常量定义
   * ====================================================================== */

  // 逻辑世界尺寸（canvas 固定逻辑分辨率，CSS 缩放适配屏幕）
  var WORLD_W = 450;
  var WORLD_H = 800;

  var CFG = {
    world: { w: WORLD_W, h: WORLD_H },

    // 我方飞机
    plane: {
      speed: 200,        // 键盘/方向键移动速度（像素/秒），手指/鼠标为绝对跟手（基础速度已翻倍）
      baseHp: 1000,      // 默认生命值
      armorHpPer: 10,    // 机体升级每级 +10 基础生命
      sizeW: 68,         // 展示尺寸（旋转后）
      sizeH: 68,
      radius: 26,        // 碰撞半径
      margin: 34,        // 距屏幕边缘的最小距离
      startY: WORLD_H - 140,
      fireY: 34          // 子弹发射点相对飞机中心的上方偏移
    },

    // 三种子弹（shopLv 为商店等级，run 为本局道具加成，均为乘法累进）
    bullets: {
      b1: { base: 20,   interval: 0.2, count: 5, spreadDeg: 30, speed: 300, radius: 7,  pierce: false }, // 黄色扇形：频率减半(0.2s)但伤害+100%(20)，防晃眼
      b2: { base: 100,  interval: 1.0, beamW: 22, beamDur: 0.2 },                                     // 蓝色激光（更粗更亮）
      b3: { base: 50,   interval: 0.5, speed: 299, radius: 7, aoe: 100, turnRate: 4.2 }                // 红色追踪弹（速度较原 230 提升 30%）
    },

    // 敌机定义：prob=刷新概率%，hp/score 为第 1 波基础值，随波次 ×1.1^(wave-1)。
    // 速度与生命值均已按需求翻倍。
    enemies: [
      { key: 'enemy1', prob: 60, speed: 80, hp: 200, score: 10, sizeW: 56, sizeH: 56, radius: 22, fire: 0 },
      { key: 'enemy2', prob: 10, speed: 60, hp: 400, score: 100, sizeW: 60, sizeH: 60, radius: 24, fire: 0 }, // 运输机·掉落道具
      { key: 'enemy3', prob: 10, speed: 40, hp: 150, score: 50, sizeW: 56, sizeH: 56, radius: 22, fire: 2, burst: 3, burstPause: 5, bulletDmg: 50 }, // 攻击机（每2s一发，连射3发后停5s）
      { key: 'enemy4', prob: 20, speed: 120, hp: 100, score: 20, sizeW: 50, sizeH: 50, radius: 19, fire: 0 }  // 快速机
    ],

    // 敌方子弹
    enemyBullet: {
      speed: 150,      // 敌方子弹移动速度
      radius: 9,       // 基础碰撞半径
      enemyRadius: Math.round(9 * 1.25),   // 敌机子弹 +25%
      bossRadius: Math.round(9 * 1.5)      // BOSS 子弹 +50%
    },

    // BOSS
    boss: {
      baseHp: 10000,   // 基础生命
      hpMul: 1.5,      // （废弃，改用 growBase/growStep）
      growBase: 6.75,  // BOSS 成长基准（普通敌机 4.5 的 1.5 倍）
      growStep: 0.75,  // BOSS 成长步进（普通敌机 0.5 的 1.5 倍）
      score: 2500,     // 基础击杀分数
      speed: 62,       // 左右移动速度
      fireInterval: 0.5,   // BOSS 射击间隔（每 0.5s 一发）
      fireDmg: 100,    // BOSS 子弹碰撞我方飞机伤害
      collideDps: 100, // 与飞机重叠时双方每秒受到的伤害
      // 特殊攻击：生成时从 4 种中随机抽 2 种，每 10s 随机释放 1 种
      specialInterval: 10,   // 特殊攻击间隔
      specialWarn: 1,        // 释放前警告时长 1s
      spreadDur: 1.5,        // 散射持续 1.5s
      spreadDeg: 120,        // 散射扇形角度
      barrageDur: 1.5,       // 弹幕持续 1.5s
      summonDur: 0.5,        // 召唤执行时长
      summonCount: 12,       // 召唤大量敌机数量
      laserInterval: 10,     // 激光：警告时长 1s（laserWarn）、持续 0.5s
      laserWarn: 1,
      laserDur: 0.5,
      laserDmg: 200,         // 单次造成 200 伤害
      laserW: 20,            // 激光光柱宽度
      laserGap: 55,          // 双重激光：两侧相对 BOSS 中心的偏移
      heavyDur: 0.2,         // 重炮执行时长（发射瞬间）
      heavyDmg: 500,         // 重炮伤害
      heavySize: 3,          // 重炮直径倍数（普通子弹的 3 倍）
      heavySpeed: 0.75,      // 重炮移动速度倍数（普通子弹的 75%）
      ringCount: 15,         // 环形弹幕：360° 发射 15 发（每发=普通子弹伤害）
      splitDmg1: 500,        // 分裂弹：初始伤害
      splitDmg2: 250,        // 第一次分裂伤害
      splitDmg3: 100,        // 第二次分裂伤害
      splitDur: 0.8,         // 分裂间隔
      airstrikeCount: 3,     // 定点轰炸区域数（不重叠，首个在玩家附近）
      airstrikeDmg: 300,     // 轰炸伤害
      airstrikeDelay: 2,     // 虚影到打击降临延迟（s）
      sizeW: 124, sizeH: 124,
      radius: 48,
      y: 150           // 默认出现高度
    },

    // 波次：每波敌机数量 200 起、每轮 +20；属性成长见 enemyMult（第 N 轮相对上轮 ×(4.5+0.5(N-1))%，为原 1/10 收敛）
    wave: { perWave: 200, countGrow: 20, spawnInterval: 0.3,
      enemyGrowBase: 4.5, enemyGrowStep: 0.5 },

    // 游戏难度：spawn=敌机刷新间隔(秒)，bonus=击杀额外分数倍率；默认困难
    difficulty: {
      easy: { spawn: 0.5, bonus: 0 },
      normal: { spawn: 0.3, bonus: 0 },
      hard: { spawn: 0.2, bonus: 0 },
      nightmare: { spawn: 0.1, bonus: 0.10 },
      hell: { spawn: 0.05, bonus: 0.20 }
    },
    defaultDifficulty: 'hard',

    // 炸弹：初始 3 枚，无上限
    bomb: { start: 3, bossDmg: 1000 },

    // 跳关：机体每 10 级可跳 1 关（低于 10 级不可跳）；跳第 k 关威力 ×(1.04+0.001×(k-1))，累计连乘（数值收敛）
    jump: { perLevels: 10, mult: 1.04, step: 0.001 },

    // 道具
    items: { speed: 70, scoreBase: 500 },

    // 运输机掉落权重（总和 100%）：生命15/大招5/黄20/蓝20/红20/积分20
    dropWeights: { life: 0.15, bomb: 0.05, b1: 0.20, b2: 0.20, b3: 0.20, score: 0.20 },

    // 商店：基础价（机体1000/机关枪40/激光30/高爆弹30）；商店子弹伤害线性递推 (dmg+0.1×base)×1.001/级、价格成长 ×1.1/级、局内道具 ×1.01（降数值膨胀）
    shop: { dmgStep: 0.1, dmgCoef: 1.001, priceGrow: 1.1, itemGrow: 1.01, initCosts: { armor: 1000, b1: 40, b2: 30, b3: 30 } },

    // 死亡动画时长（秒），之后进入结算
    deathDelay: 1.4,

    // 排行榜
    rankTop: 100,
    bScoreBoard: 1,   // B站高分榜 board
    bLevelBoard: 2    // B站等级榜 board
  };

  // 运输机掉落：每种道具在结算时向上取整到百分位
  var DROP_TABLE = ['bomb', 'b1', 'b2', 'b3', 'life'];

  /* ========================================================================
   * 数字工具
   * ====================================================================== */

  // 去掉小数末尾的 0，如 "12.30" -> "12.3"，"8.00" -> "8"，"8.0" -> "8"
  function trimFloat(s) {
    return s.replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1');
  }

  /**
   * 大数友好展示：万/亿/万亿/亿亿/万亿亿/亿亿亿…，超过 1e40 改用 a.bc*10^f。
   * 万用 1 位小数，亿及以上用 2 位（去尾零）。
   */
  var BIG_UNITS = [
    [4, '万'], [8, '亿'], [12, '万亿'], [16, '亿亿'], [20, '万亿亿'],
    [24, '亿亿亿'], [28, '万亿亿亿'], [32, '亿亿亿亿'], [36, '万亿亿亿亿'], [40, '亿亿亿亿亿']
  ];
  function fmtNum(n) {
    if (n <= 0) return '0';
    if (!isFinite(n)) return '∞';   // 溢出防御：不显示 0
    if (n > 1e40) {
      var s = sciParts(n);
      var c = s.c, e = s.e;
      if (c >= 10) { c /= 10; e += 1; }   // 浮点边界：c 略超 10 时归一到 1~10
      return c.toFixed(2) + '*10^' + e;
    }
    for (var i = BIG_UNITS.length - 1; i >= 0; i--) {
      var p = Math.pow(10, BIG_UNITS[i][0]);
      if (n >= p) {
        var v = n / p;
        var str = (BIG_UNITS[i][0] === 4) ? trimFloat(v.toFixed(1)) : trimFloat(v.toFixed(2));
        return str + BIG_UNITS[i][1];
      }
    }
    return trimFloat(n.toFixed(1));
  }

  // 波次文案
  function waveText(w) { return '第 ' + w + ' 波'; }

  // 子弹威力展示：小于一万取整；其余同 fmtNum 大单位（万/亿/万亿/亿亿…），超过 1e40 用科学计数
  function fmtDmg(n) {
    if (n <= 0) return '0';
    if (!isFinite(n)) return '∞';
    if (n > 1e40) {
      var s = sciParts(n);
      var c = s.c, e = s.e;
      if (c >= 10) { c /= 10; e += 1; }
      return c.toFixed(2) + '*10^' + e;
    }
    for (var i = BIG_UNITS.length - 1; i >= 0; i--) {
      var p = Math.pow(10, BIG_UNITS[i][0]);
      if (n >= p) {
        var v = n / p;
        var str = (BIG_UNITS[i][0] === 4) ? trimFloat(v.toFixed(1)) : trimFloat(v.toFixed(2));
        return str + BIG_UNITS[i][1];
      }
    }
    return String(Math.round(n));
  }

  // 秒数 -> mm:ss
  function fmtTime(sec) {
    sec = Math.floor(Math.max(0, sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    function p(x) { return x < 10 ? '0' + x : '' + x; }
    return p(m) + ':' + p(s);
  }

  /**
   * 科学计数法拆解：返回 { c: 尾数(1<=c<10), e: 指数 }
   * 用于把可能超过 SDK 上限的分数压缩编码
   */
  function sciParts(n) {
    var e = Math.floor(Math.log(n) / Math.LN10);
    return { c: n / Math.pow(10, e), e: e };
  }

  /**
   * 把真实分数编码为 SDK 允许的整数（-16777216 ~ 16777215）。
   * 存储 = 指数(e) × 10000 + 尾数(mant)，mant 保留 3 位有效数字。
   * 参考鱼吃鱼项目同款方案；只要 e<=1676 即可安全编码，游戏内分数远达不到。
   */
  function encodeScore(n) {
    if (!(n > 0) || !isFinite(n)) return 0;
    var s = sciParts(n);
    var mant = Math.round(s.c * 1000);
    var e = s.e;
    if (mant >= 10000) { mant = 1000; e += 1; }
    return clamp(e * 10000 + mant, -16777216, 16777215);
  }

  /** 由编码还原真实分数（科学计数）。 */
  function decodeScore(enc) {
    if (enc <= 0) return 0;
    var e = Math.floor(enc / 10000);
    var mant = enc % 10000;
    return (mant / 1000) * Math.pow(10, e);   // mant/1000 = 尾数，×10^e 减少大数浮点误差
  }

  /* ========================================================================
   * 波次 / 商店数值
   * ====================================================================== */

  /** 敌机属性成长倍率：第 N 轮相对第 N-1 轮 ×(35+3(N-1))% 乘法累进；第 1 轮=1。 */
  function enemyMult(wave) {
    var m = 1;
    for (var k = 2; k <= wave; k++) {
      m *= 1 + (CFG.wave.enemyGrowBase + CFG.wave.enemyGrowStep * (k - 1)) / 100;
    }
    return m;
  }

  /** BOSS 专属成长倍率：速率为普通敌机 2 倍，第 N 轮相对上轮 ×(70+6(N-1))%；血量/分数/BOMB 伤害共用。 */
  function bossMul(wave) {
    var m = 1;
    for (var k = 2; k <= wave; k++) {
      m *= 1 + (CFG.boss.growBase + CFG.boss.growStep * (k - 1)) / 100;
    }
    return m;
  }

  /** 第 wave 波需刷新的敌机数量：第一波 200，之后每轮 +20。 */
  function perWaveCount(wave) {
    return CFG.wave.perWave + CFG.wave.countGrow * Math.max(0, wave - 1);
  }

  /** 难度信息：返回 { spawn, bonus }，非法难度回退默认。 */
  function difficultyInfo(name) {
    return CFG.difficulty[name] || CFG.difficulty[CFG.defaultDifficulty];
  }

  /** 从 level 级升到下一级所需的积分（基础价按 kind，每次 ×1.1，向下取整）。 */
  function costForLevel(kind, level) {
    var base = (CFG.shop.initCosts && CFG.shop.initCosts[kind]) || 100;
    return Math.max(1, Math.floor(base * Math.pow(CFG.shop.priceGrow, level)));
  }

  /** 机体等级对应的最大生命值（累加，基础 1000 + 10×级数）。 */
  function armorMaxHp(armorLevel) {
    return CFG.plane.baseHp + CFG.plane.armorHpPer * (armorLevel || 0);
  }

  /** 商店子弹伤害：线性递推，每级（含第 1 级）都 ×(1.001)，每级加 0.1×base；dmg(0)=base。 */
  function bulletDamage(base, level) {
    var d = base;
    for (var i = 1; i <= (level || 0); i++) {
      d = (d + CFG.shop.dmgStep * base) * CFG.shop.dmgCoef;
    }
    return d;
  }

  /** 玩家总升级等级（等级榜用）= 机体 + 三种子弹等级之和。 */
  function playerLevel(up) {
    return (up.armor || 0) + (up.b1 || 0) + (up.b2 || 0) + (up.b3 || 0);
  }

  /** 子弹等级上限：机体等级 + 10（子弹不得高于机体等级+10）。 */
  function bulletLevelCap(armorLv) {
    return (armorLv || 0) + 10;
  }

  /** 跳关威力累计：跳第 k 关 ×(mult+step×(k-1))，跳 n 关为连乘（1.4、1.41、1.42…）。 */
  function jumpMult(n) {
    var m = 1;
    for (var k = 1; k <= n; k++) {
      m *= CFG.jump.mult + CFG.jump.step * (k - 1);
    }
    return m;
  }

  /** 按概率随机出一种运输机掉落物。 */
  function rollDrop() {
    var r = Math.random();
    var acc = 0;
    var table = [['life', CFG.dropWeights.life], ['bomb', CFG.dropWeights.bomb],
      ['b1', CFG.dropWeights.b1], ['b2', CFG.dropWeights.b2],
      ['b3', CFG.dropWeights.b3], ['score', CFG.dropWeights.score]];
    for (var i = 0; i < table.length; i++) {
      acc += table[i][1];
      if (r < acc) return table[i][0];
    }
    return 'score';
  }

  /* ========================================================================
   * 存储层（浏览器 localStorage；Node 测试环境退化为内存对象）
   * ====================================================================== */
  var memStore = {};
  var cloudReady = false;   // B站 云存储可用（SDK 就绪且已登录拉取成功）

  // 读取：localStorage 优先，内存兜底（写入总是先落本地，读本地即最新）
  function storageGet(k) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem) {
        var v = localStorage.getItem(k);
        if (v != null) return v;
      }
    } catch (e) { /* 隐私模式等场景忽略 */ }
    return (k in memStore) ? memStore[k] : null;
  }
  // 写入：先写 localStorage 兜底，再异步同步到 B站 云存储
  function storageSet(k, v) {
    var s = String(v);
    try {
      if (typeof localStorage !== 'undefined' && localStorage.setItem) {
        localStorage.setItem(k, s);
      } else {
        memStore[k] = s;
      }
    } catch (e) { memStore[k] = s; }
    cloudPush(k, s);
  }
  function storageDel(k) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.removeItem) {
        localStorage.removeItem(k);
        return;
      }
    } catch (e) { /* 忽略 */ }
    delete memStore[k];
  }

  // 写一个 key 到 B站 云存储（fire-and-forget，失败静默，本地已兜底）
  function cloudPush(k, v) {
    if (!cloudReady) return;
    try {
      if (typeof window !== 'undefined' && window.toy && typeof window.toy.setCloudStorage === 'function') {
        var obj = {};
        obj[k] = v;
        window.toy.setCloudStorage(obj).catch(function () { /* 忽略 */ });
      }
    } catch (e) { /* 忽略 */ }
  }

  // 启动时从 B站 云存储拉取全部数据，合并覆盖本地（云优先，本地兜底）
  function syncFromCloud(cb) {
    if (typeof window === 'undefined' || !window.toy || typeof window.toy.getCloudStorage !== 'function') {
      if (cb) cb(false);
      return;
    }
    try {
      window.toy.getCloudStorage()
        .then(function (data) {
          if (data && typeof data === 'object') {
            cloudReady = true;
            for (var k in data) {
              try {
                if (typeof localStorage !== 'undefined' && localStorage.setItem) localStorage.setItem(k, data[k]);
                else memStore[k] = data[k];
              } catch (e) { memStore[k] = data[k]; }
            }
          }
          if (cb) cb(cloudReady);
        })
        .catch(function () { if (cb) cb(false); });
    } catch (e) { if (cb) cb(false); }
  }

  var KEYS = {
    settings: 'plane_settings',
    upgrades: 'plane_upgrades',
    balance: 'plane_balance',
    localLB: 'plane_lb_local',
    checkpoint: 'plane_checkpoint'
  };

  /* ---------------- 设置 ---------------- */
  var DEFAULT_SETTINGS = { bgm: true, cap: 20, boss: true, showHp: true, difficulty: 'hard' };
  function loadSettings() {
    var s = DEFAULT_SETTINGS;
    try {
      var raw = storageGet(KEYS.settings);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object') s = o;
      }
    } catch (e) { /* 忽略 */ }
    // 保证字段齐全、敌机上限在 10~50 区间、难度合法
    s.bgm = s.bgm !== false;
    s.boss = s.boss !== false;
    s.showHp = s.showHp !== false;
    s.cap = clamp(parseInt(s.cap, 10) || 20, 10, 50);
    if (!CFG.difficulty[s.difficulty]) s.difficulty = CFG.defaultDifficulty;
    return s;
  }
  function saveSettings(s) {
    storageSet(KEYS.settings, JSON.stringify(s));
  }

  /* ---------------- 商店等级 ---------------- */
  var DEFAULT_UPGRADES = { armor: 0, b1: 0, b2: 0, b3: 0 };
  function loadUpgrades() {
    var u = { armor: 0, b1: 0, b2: 0, b3: 0 };
    try {
      var raw = storageGet(KEYS.upgrades);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object') {
          for (var k in DEFAULT_UPGRADES) {
            var v = parseInt(o[k], 10);
            if (v > 0) u[k] = v;
          }
        }
      }
    } catch (e) { /* 忽略 */ }
    return u;
  }
  function saveUpgrades(u) {
    storageSet(KEYS.upgrades, JSON.stringify(u));
  }

  /* ---------------- 积分 ---------------- */
  function getBalance() {
    var raw = storageGet(KEYS.balance);
    if (raw == null) return 0;
    // 用 Number 而非 parseInt：大数可能存为 "1e+21" 科学计数，parseInt 会截断
    var v = Number(raw);
    return isFinite(v) && v > 0 ? Math.floor(v) : 0;
  }
  function addBalance(delta) {
    var b = Math.max(0, getBalance() + Math.floor(delta || 0));
    storageSet(KEYS.balance, b);
    return b;
  }
  function spendBalance(cost) {
    var b = getBalance();
    if (b < cost) return false;
    storageSet(KEYS.balance, b - cost);
    return true;
  }

  /* ---------------- 本地排行榜（高分榜，Top100） ---------------- */
  function getLocalLB() {
    var arr = [];
    try {
      var raw = storageGet(KEYS.localLB);
      if (raw) {
        var o = JSON.parse(raw);
        if (Array.isArray(o)) arr = o;
      }
    } catch (e) { /* 忽略 */ }
    return arr;
  }
  /** 插入一条本地记录 {score, wave, ts}，排序后截断到 Top100，并返回新榜。 */
  function addLocalLB(score, wave) {
    var arr = getLocalLB();
    arr.push({ score: Math.floor(score), wave: wave, ts: Date.now() });
    arr.sort(function (a, b) { return b.score - a.score; });
    if (arr.length > CFG.rankTop) arr.length = CFG.rankTop;
    storageSet(KEYS.localLB, JSON.stringify(arr));
    return arr;
  }
  /** 本地最佳（首页展示用）。 */
  function bestLocalScore() {
    var arr = getLocalLB();
    return arr.length ? arr[0].score : 0;
  }

  /* ---------------- 局内断点（继续游戏用） ---------------- */
  /** 保存局内快照；boss 存在时一并保存。 */
  function saveCheckpoint(snap) {
    snap.ts = Date.now();
    storageSet(KEYS.checkpoint, JSON.stringify(snap));
  }
  function loadCheckpoint() {
    try {
      var raw = storageGet(KEYS.checkpoint);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* 忽略 */ }
    return null;
  }
  function clearCheckpoint() {
    storageDel(KEYS.checkpoint);
  }
  function hasCheckpoint() {
    return !!loadCheckpoint();
  }

  /* ========================================================================
   * 导出
   * ====================================================================== */
  return {
    CFG: CFG,
    WORLD_W: WORLD_W,
    WORLD_H: WORLD_H,
    DROP_TABLE: DROP_TABLE,
    clamp: clamp,
    rand: rand,
    randInt: randInt,
    trimFloat: trimFloat,
    fmtNum: fmtNum,
    fmtDmg: fmtDmg,
    fmtTime: fmtTime,
    waveText: waveText,
    sciParts: sciParts,
    encodeScore: encodeScore,
    decodeScore: decodeScore,
    enemyMult: enemyMult,
    bossMul: bossMul,
    perWaveCount: perWaveCount,
    difficultyInfo: difficultyInfo,
    costForLevel: costForLevel,
    armorMaxHp: armorMaxHp,
    bulletDamage: bulletDamage,
    playerLevel: playerLevel,
    bulletLevelCap: bulletLevelCap,
    jumpMult: jumpMult,
    rollDrop: rollDrop,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    loadUpgrades: loadUpgrades,
    saveUpgrades: saveUpgrades,
    getBalance: getBalance,
    addBalance: addBalance,
    spendBalance: spendBalance,
    getLocalLB: getLocalLB,
    addLocalLB: addLocalLB,
    bestLocalScore: bestLocalScore,
    saveCheckpoint: saveCheckpoint,
    loadCheckpoint: loadCheckpoint,
    clearCheckpoint: clearCheckpoint,
    hasCheckpoint: hasCheckpoint,
    syncFromCloud: syncFromCloud
  };
});
