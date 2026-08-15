/* ============ 菲比啾比 Flappy 冒烟测试：模拟 window.toy + 最小 DOM ============ */
var fs = require('fs');
var path = require('path');

/* ---- 最小 DOM 桩 ---- */
function ctxStub() {
  var c = {};
  ['clearRect','beginPath','arc','arcTo','fill','stroke','moveTo','lineTo','quadraticCurveTo',
   'clip','drawImage','fillRect','save','restore','fillText','setTransform','translate','rotate',
   'scale','setLineDash','closePath','strokeRect'].forEach(function (m) { c[m] = function () {}; });
  c.createLinearGradient = function () { return { addColorStop: function () {} }; };
  c.measureText = function () { return { width: 10 }; };
  c.canvas = { width: 0, height: 0 };
  return c;
}
function makeEl() {
  return {
    _h: {},
    addEventListener: function (t, fn, o) { (this._h[t] = this._h[t] || []).push(fn); },
    classList: {
      _s: [],
      add: function (c) { if (this._s.indexOf(c) < 0) this._s.push(c); },
      remove: function (c) { var i = this._s.indexOf(c); if (i >= 0) this._s.splice(i, 1); },
      toggle: function (c, f) { var has = this._s.indexOf(c) >= 0; if (f === undefined) { has ? this.remove(c) : this.add(c); } else { f ? this.add(c) : this.remove(c); } },
      contains: function (c) { return this._s.indexOf(c) >= 0; }
    },
    style: {}, hidden: false, textContent: '', innerHTML: '', value: '', checked: true, src: '', width: 0, height: 0,
    appendChild: function () {}, setAttribute: function () {}, remove: function () {},
    getContext: function () { return ctxStub(); },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 858, height: 504 }; },
    closest: function () { return null; },
    _attrs: {}, getAttribute: function (a) { return this._attrs ? this._attrs[a] : null; }
  };
}

global.document = {
  readyState: 'complete',
  _els: {},
  getElementById: function (id) { if (!this._els[id]) this._els[id] = makeEl(); return this._els[id]; },
  addEventListener: function () {},
  createElement: function () { return makeEl(); },
  querySelectorAll: function () { return []; },
  head: { appendChild: function () {} },
  body: { appendChild: function () {} }
};
global.localStorage = {
  _d: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; }
};
Object.defineProperty(global, 'navigator', { value: { userAgent: 'test', clipboard: {} }, configurable: true });
global.window = { toy: null, addEventListener: function () {}, innerWidth: 400, innerHeight: 800, devicePixelRatio: 1, location: { href: '' } };
global.setInterval = function () { return 1; };
global.setTimeout = function (fn, t) { fn(); return 1; };
global.requestAnimationFrame = function () {};   // 不驱动主循环，测试手动 tick
global.Image = function () { return makeEl(); }; // 不触发 onload，bgImg/birdRound 保持 null

/* ---- 模拟 B站 SDK ---- */
function makeSDK() {
  var scores = {};
  var cloud = {};
  return {
    getRankList: function (req) { return Promise.resolve([]); },
    getMyRank: function (req) { return Promise.resolve({ ranked: false, rank: 0, score: 0 }); },
    submitScore: function (req) { scores[req.board] = req.score; return Promise.resolve({ score: req.score }); },
    getCloudStorage: function (keys) {
      var out = {};
      (keys && keys.length ? keys : Object.keys(cloud)).forEach(function (k) { if (cloud[k] !== undefined) out[k] = cloud[k]; });
      return Promise.resolve(out);
    },
    setCloudStorage: function (obj) { Object.keys(obj).forEach(function (k) { cloud[k] = obj[k]; }); return Promise.resolve(); },
    removeCloudStorage: function () { return Promise.resolve(); },
    _scores: scores,
    _cloud: cloud
  };
}

var sdk = makeSDK();
global.window.toy = sdk;

var code = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
function flush() { return new Promise(function (r) { setTimeout(r, 30); }); }
function check(name, cond) {
  if (cond) console.log('PASS  ' + name);
  else { console.log('FAIL  ' + name); process.exitCode = 1; }
}
function frames(n, dt) {
  dt = dt || 1 / 60;
  for (var i = 0; i < n; i++) tick(dt);
}

eval(code);

(async function () {
  /* ---------- 难度曲线：连续渐变、无跳变 ---------- */
  check('初始缺口205 > 满难度126', gapAt(0) === GAP_0 && gapAt(DIFF_N) === GAP_1);
  check('缺口下限可过鸟(直径38)', GAP_1 > BIRD_R * 2 + 6);
  check('间距初始>满难度', spacingAt(0) > spacingAt(DIFF_N));
  check('难度单调递减', gapAt(0) >= gapAt(14) && gapAt(14) >= gapAt(DIFF_N));
  check('无跳变(相邻差值小)', Math.abs(gapAt(0) - gapAt(1)) < 3 && Math.abs(spacingAt(0) - spacingAt(1)) < 6);
  check('难度封顶不越界', gapAt(DIFF_N + 9) === GAP_1 && spacingAt(DIFF_N + 9) === SPACING_1);

  /* ---------- 跳跃高度降低（精细操控） ---------- */
  check('跳跃高度更低(<70px)', (FLAP * FLAP) / (2 * G) < 70);
  check('默认生命1条', BASE_LIVES === 1 && livesMax() === 1);
  check('鸟图无getImageData时安全回退(不消失)', makeRound({ width: 48, height: 48 }, 48) !== null);

  /* ---------- 鸟物理 ---------- */
  startRun();
  check('初始在画面中线', run.y === H / 2 && run.vy === 0);
  flap();
  check('点击上冲 vy<0', run.vy < 0);
  frames(20);
  check('重力作用 vy 回升', run.vy > FLAP + 100);
  flap();
  check('再次点击加速上冲', run.vy < 0);

  /* ---------- 距离分：越远每秒加分越多 ---------- */
  startRun();
  run.lives = 99;   // 防止测试期间命耗尽影响分数累加
  run.invT = 0;
  frames(30);
  var s1 = run.score;
  frames(30);
  var s2 = run.score - s1;
  check('距离分随飞行持续累加', s1 > 0 && s2 > 0);
  check('距离越远每秒加分越多', s2 > s1);
  check('累计前进距离在增长', run.dist > 0);

  /* ---------- 过管道 +5、金币 +10 ---------- */
  startRun();
  run.pipes = [{ x: 100, topH: 80, gap: 205, passed: false, coinTaken: false }];  // 金币距鸟>50 只加管道分
  run.y = 80 + 205 / 2;
  var before = run.score;
  frames(1);
  check('穿过管道 +5', run.score - before >= 5 && run.passed === 1 && !run.pipes[0].coinTaken);

  startRun();
  run.pipes = [{ x: BIRD_X - PIPE_W / 2, topH: 90, gap: 205, passed: false, coinTaken: false }];
  run.y = 90 + 205 / 2;   // 鸟在金币中心
  var b2 = run.score;
  frames(1);
  check('拾取金币 +10 且计数', run.score - b2 >= 10 && run.pipes[0].coinTaken && run.coins === 1);

  /* ---------- 金币放宽拾取距离（靠得近即可） ---------- */
  startRun();
  run.pipes = [{ x: BIRD_X - PIPE_W / 2, topH: 90, gap: 205, passed: false, coinTaken: false }];
  run.y = 90 + 205 / 2 + 45;   // 距中心45px：原32吃不到，现50能拾取
  var b3 = run.score;
  frames(1);
  check('放宽拾取距离(45px)', run.pipes[0].coinTaken && run.score - b3 >= 10);

  /* ---------- 生命：碰撞扣一命，生命耗尽才输（道具解锁到 3 条） ---------- */
  S.items.life2 = true; S.items.life3 = true;   // 解锁最大生命 3
  startRun();
  run.pipes = [{ x: BIRD_X - 5, topH: 100, gap: 205, passed: false, coinTaken: false }];
  run.y = 10;             // 缺口上方，撞上管
  frames(1);
  check('撞管道扣一命(不死)', run.lives === livesMax() - 1 && run.state === 'playing');

  startRun();
  run.y = BIRD_R - 1;     // 贴顶
  run.invT = 0; run.vy = 0;
  frames(1);
  check('碰顶扣一命(不死)', run.lives === livesMax() - 1 && run.state === 'playing');

  startRun();
  run.y = H - GROUND_H - BIRD_R + 1;   // 贴地
  run.invT = 0; run.vy = 0;
  frames(1);
  check('碰地扣一命且回画面中心', run.lives === livesMax() - 1 && run.state === 'playing' && run.y === H / 2);

  startRun();
  run.lives = livesMax();
  for (var h = 0; h < 3; h++) { run.invT = 0; run.vy = 0; run.y = BIRD_R - 1; frames(1); }
  check('生命耗尽死亡', run.state === 'dying');

  /* ---------- 断点续玩 ---------- */
  startRun();
  run.score = 5; run.passed = 2; run.dist = 1234; run.lives = 1; run.coins = 3;
  run.pipes = [{ x: 300, topH: 80, gap: 180, passed: true, coinTaken: false }];
  saveCheckpoint();
  check('有断点', hasCheckpoint());
  check('续玩成功', continueRun() === true);
  check('恢复分数/生命/距离/金币', run.score === 5 && run.passed === 2 && run.lives === 1 && run.dist === 1234 && run.coins === 3);
  check('恢复管道状态', run.pipes.length === 1 && run.pipes[0].x === 300 && run.pipes[0].passed);
  clearCheckpoint();
  check('死亡清断点', !hasCheckpoint());

  /* ---------- 本地榜排序截断 ---------- */
  writeLB({ list: [] });
  addLocalScore(3); addLocalScore(10); addLocalScore(7);
  var lb = readLB();
  check('本地榜降序', lb.list[0].s === 10 && lb.list[1].s === 7 && lb.list[2].s === 3);

  /* ---------- B站提交：分数封顶 ---------- */
  startRun();
  run.score = 100000000;
  gameOver();
  check('B站提交分数封顶 16777215', sdk._scores[1] === 16777215);
  check('结算后清断点', !hasCheckpoint());

  /* ---------- 当前金币余额：结算并入 + 云优先本地兜底 ---------- */
  startRun();
  run.coins = 3;
  var beforeBalance = S.balance;
  run.score = 100;
  gameOver();
  check('结算并入当前金币', S.balance === beforeBalance + 3);
  check('金币已写入本地缓存', readCfg().balance === beforeBalance + 3);
  check('金币已写入云存储', sdk._cloud[CFG_KEY] && JSON.parse(sdk._cloud[CFG_KEY]).balance === beforeBalance + 3);

  /* ---------- 商城购买 ---------- */
  S.balance = 2500;
  S.items.life2 = false; S.items.life3 = false; S.items.magnet = false; S.items.double = false;
  check('购买第二条命', tryBuy('life2') === true && S.balance === 1500 && S.items.life2 && livesMax() === 2);
  check('金币不足不能购买', tryBuy('life3') === false && S.balance === 1500);
  check('已拥有不重复扣金币', tryBuy('life2') === false && S.balance === 1500);

  /* ---------- 吸铁石：扩大拾取范围 ---------- */
  S.items.magnet = true;
  startRun();
  run.pipes = [{ x: BIRD_X - PIPE_W / 2, topH: 90, gap: 205, passed: false, coinTaken: false }];
  run.y = 90 + 205 / 2 + 75;   // 距中心75px：普通50吃不到，磁吸120能拾取
  var bm = run.score;
  frames(1);
  check('吸铁石磁吸(75px)', run.pipes[0].coinTaken && run.score - bm >= SCORE_COIN);

  /* ---------- 金币双倍：得分翻倍 ---------- */
  S.items.double = true;
  startRun();
  run.pipes = [{ x: BIRD_X - PIPE_W / 2, topH: 90, gap: 205, passed: false, coinTaken: false }];
  run.y = 90 + 205 / 2;
  var bd = run.score;
  frames(1);
  check('金币双倍计分(+20)', run.pipes[0].coinTaken && run.score - bd >= SCORE_COIN * 2);

  console.log('\n完成。');
})().catch(function (e) { console.error('测试异常', e); process.exitCode = 1; });
