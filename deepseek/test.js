/* ============ 合成大肥鱼 冒烟测试：模拟 window.toy + 最小 DOM ============ */
var fs = require('fs');
var path = require('path');

/* ---- 最小 DOM 桩 ---- */
function ctxStub() {
  var c = {};
  ['clearRect','beginPath','arc','fill','stroke','moveTo','lineTo','clip','drawImage',
   'fillRect','save','restore','fillText','setTransform','translate','rotate','scale','setLineDash'].forEach(function (m) { c[m] = function () {}; });
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
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 400, height: 620 }; },
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

eval(code);

(async function () {
  /* ---------- 计分 ---------- */
  check('scoreFor(2)=2', scoreFor(2) === 2);
  check('scoreFor(3)=4', scoreFor(3) === 4);
  check('scoreFor(9)=256', scoreFor(9) === 256);
  check('scoreFor(10)=512', scoreFor(10) === 512);
  check('mergeScore(10)=1536(含1024奖励)', mergeScore(10) === 1536);

  /* ---------- 生成等级 ---------- */
  var ok = true;
  for (var i = 0; i < 200; i++) { var lv = randomSpawnLevel(); if (lv < 1 || lv > 5) ok = false; }
  check('生成球等级 1-5', ok);

  /* ---------- 合并：1+1→2 得2分 ---------- */
  startRun();
  R.balls = [];
  R.balls.push(makeBall(1, 100, 300), makeBall(1, 112, 300));
  R.score = 0;
  checkMerges();
  var left = R.balls.filter(function (x) { return !x.removed; });
  check('同级合成产生新球2级', left.length === 1 && left[0].level === 2 && left[0].cool === 15);
  check('1+1 得分+2', R.score === 2);

  /* ---------- 合并：9+9→10 得1536 ---------- */
  R.balls = [];
  R.balls.push(makeBall(9, 100, 300), makeBall(9, 112, 300));
  R.score = 0;
  checkMerges();
  left = R.balls.filter(function (x) { return !x.removed; });
  check('9+9 合成10级', left.length === 1 && left[0].level === 10);
  check('10级得分 512+1024=1536', R.score === 1536);
  check('合成大肥鱼计数+1', R.fishCount === 1);
  check('合成大肥鱼横幅触发', FXD.banners.length >= 1);

  /* ---------- 不同级不合成 ---------- */
  R.balls = [];
  R.balls.push(makeBall(1, 100, 300), makeBall(2, 110, 300));
  R.score = 0;
  checkMerges();
  left = R.balls.filter(function (x) { return !x.removed; });
  check('不同级不合成', left.length === 2 && R.score === 0);

  /* ---------- 10级以上继续合成 ---------- */
  R.balls = [];
  R.balls.push(makeBall(10, 100, 300), makeBall(10, 112, 300));
  R.score = 0;
  R.fishCount = 0;
  checkMerges();
  left = R.balls.filter(function (x) { return !x.removed; });
  check('10+10→11 继续合成', left.length === 1 && left[0].level === 11);
  check('合成11级得分1024(无bonus)', R.score === 1024);
  check('合成11级肥鱼数+1', R.fishCount === 1);
  check('11级体积大于10级', rFor(11) > rFor(10));

  R.balls = [];
  R.balls.push(makeBall(11, 100, 300), makeBall(11, 112, 300));
  R.score = 0;
  R.fishCount = 0;
  checkMerges();
  left = R.balls.filter(function (x) { return !x.removed; });
  check('11+11→12', left.length === 1 && left[0].level === 12);
  check('合成12级得分2048(无bonus)', R.score === 2048);
  check('合成12级肥鱼数+1', R.fishCount === 1);

  /* ---------- 10级外圈颜色映射 ---------- */
  check('10级外圈白', ringColor(10) === '#ffffff');
  check('11级外圈黄', ringColor(11) === '#ffdd00');
  check('12级外圈紫', ringColor(12) === '#a855f7');
  check('13级外圈红', ringColor(13) === '#ef4444');
  check('14级外圈金', ringColor(14) === '#d4af37');
  check('1级外圈用主题色', ringColor(1) === colorFor(1));

  /* ---------- 触及红线判定 ---------- */
  startRun();
  R.balls = [makeBall(1, 200, 30)];
  for (i = 0; i < 100; i++) checkDanger(0.1);   // 10s > 3s
  check('触及红线超时判负', R.state === 'over');
  check('结束弹窗显示', $('over-overlay').hidden === false);

  // 触及红线不足 3s 不判负，但计时在累计
  startRun();
  R.balls = [makeBall(1, 200, 30)];
  for (i = 0; i < 20; i++) checkDanger(0.1);    // 2s < 3s
  check('触及红线不足3s不判负', R.state === 'playing' && R.dangerTimer > 0);

  // 球离开红线区 → 计时重置
  R.balls[0].y = 400;
  checkDanger(0.1);
  check('离开红线区计时重置', R.dangerTimer === 0 && R.state === 'playing');

  // 下落中的球快速穿过红线区：穿过即离开，累计不足超时 → 不误判
  startRun();
  R.balls = [makeBall(1, 200, 30)];
  R.balls[0].vy = 500;
  for (i = 0; i < 40; i++) { stepPhysics(1 / 60); checkDanger(1 / 60); }
  check('下落球穿过红线不误判', R.state === 'playing');

  /* ---------- 游戏结束：最高分/局数/本地榜/B站 ---------- */
  var gBefore = S.games;
  startRun();
  R.score = 500;
  gameOver();
  check('结束更新最高分', S.hi === 500);
  check('结束局数+1', S.games === gBefore + 1);
  check('本地榜记录500', readLB().hi[0].s === 500);
  check('B站已提交500', sdk._scores[1] === 500);
  check('结束弹窗分数', $('over-score').textContent === '500');
  check('fishCount=0 不上大肥鱼子榜', sdk._scores[2] === undefined);

  /* ---------- 大肥鱼子榜提交 & HUD ---------- */
  startRun();
  R.score = 100;
  R.fishCount = 3;
  updateHud();
  check('HUD显示大肥鱼数(10号球图标)', $('hud-fish').innerHTML.indexOf('images/10.png') >= 0 && $('hud-fish').innerHTML.indexOf('×3') >= 0);
  gameOver();
  check('大肥鱼子榜提交3条', sdk._scores[2] === 3);
  check('结束弹窗显示大肥鱼数(10号球图标)', $('over-fish').innerHTML.indexOf('images/10.png') >= 0 && $('over-fish').innerHTML.indexOf('×3') >= 0);

  /* ---------- 本地榜排序与100上限 ---------- */
  global.localStorage._d = {};
  for (i = 0; i < 150; i++) addLocalScore(i);
  var lb = readLB();
  check('本地榜上限100', lb.hi.length === 100);
  check('本地榜降序(前2)', lb.hi[0].s === 149 && lb.hi[1].s === 148);

  /* ---------- 设置持久化 ---------- */
  S.showLevel = false;
  saveCfg();
  var d = JSON.parse(global.localStorage.getItem('df_fish_cfg'));
  check('设置保存 false', d.showLevel === false);
  S.showLevel = true;
  loadCfg();
  check('设置读取回 false', S.showLevel === false);
  S.showLevel = true;   // 恢复，避免影响后续

  /* ---------- 音效设置 ---------- */
  applySettings();
  check('设置页音效开关初始为开', $('set-muted').checked === true);
  S.muted = true;
  saveCfg();
  var d2 = JSON.parse(global.localStorage.getItem('df_fish_cfg'));
  check('音效设置已保存', d2.muted === true);
  S.muted = false;
  loadCfg();
  check('音效设置已读取', S.muted === true);
  S.muted = true;
  applySettings();
  check('设置页音效开关同步关闭态', $('set-muted').checked === false);
  S.muted = false;   // 恢复

  /* ---------- 暂停/继续/退出保留 ---------- */
  startRun();
  R.state = 'playing';
  pauseGame();
  check('暂停：状态paused', R.state === 'paused' && $('pause-overlay').hidden === false);
  resumeGame();
  check('继续：状态playing', R.state === 'playing' && $('pause-overlay').hidden === true);
  pauseGame();
  exitToHome();
  check('退出后保留并显示继续按钮', R.state === 'paused' && $('btn-continue').hidden === false && $('view-home').hidden === false);

  /* ---------- 暂停退出并结算 ---------- */
  startRun();
  R.state = 'playing';
  pauseGame();
  var g3 = S.games;
  bindUI();
  $('btn-settle')._h.click[0]();
  check('退出并结算进入结束弹窗', R.state === 'over' && $('over-overlay').hidden === false && $('pause-overlay').hidden === true);
  check('结算后局数+1', S.games === g3 + 1);

  /* ---------- 暂停进入设置再返回 ---------- */
  startRun();
  R.state = 'playing';
  pauseGame();
  bindUI();
  $('btn-pause-settings')._h.click[0]();
  check('暂停弹窗设置进入设置页', settingsFromPause === true && $('view-settings').hidden === false && R.state === 'paused');
  $('btn-back-settings')._h.click[0]();
  check('设置返回回到暂停弹窗', settingsFromPause === false && $('view-game').hidden === false && $('pause-overlay').hidden === false && R.state === 'paused');

  /* ---------- 排行榜渲染 ---------- */
  loadLocalRank();
  check('本地榜渲染含分数', $('rank-body').innerHTML.indexOf('149') >= 0);
  renderBili([{ rank: 1, score: 1234, nickname: '小明', avatar: '' }]);
  check('B站榜渲染用户与分数', $('rank-body').innerHTML.indexOf('小明') >= 0 && $('rank-body').innerHTML.indexOf('1234') >= 0);
  switchSrc('bili');
  await flush();
  check('B站榜空数据提示', $('rank-body').innerHTML.indexOf('暂无') >= 0);
  switchPeriod('day');
  check('切换到日榜', rk.period === 'day');
  switchBoard(2);
  check('切到大肥鱼数子榜', rk.board === 2 && $('rank-note').textContent.indexOf('大肥鱼数') >= 0);
  renderBili([{ rank: 1, score: 5, nickname: '甲', avatar: '' }]);
  check('大肥鱼榜显示条单位', $('rank-body').innerHTML.indexOf('5 条') >= 0);
  switchBoard(1);
  check('切回最高分子榜', rk.board === 1);
  switchSrc('local');
  check('本地榜隐藏子榜tab', $('rank-board').hidden === true);

  /* ---------- 完整tick循环：正常连续落球不误判 ---------- */
  startRun();
  for (i = 0; i < 1200; i++) {          // 模拟 20s
    if (i % 90 === 0) dropBall();       // 每 1.5s 落一颗
    tick(1 / 60);
  }
  check('正常连续落球20s不误判负', R.state === 'playing' && R.ballId >= 10);

  /* ---------- 完整tick循环：危险区持续判负 ---------- */
  startRun();
  var savedDT = DANGER_TIME;
  DANGER_TIME = 0.02;   // 临时缩短超时，验证 tick→checkDanger→gameOver 完整路径
  R.balls = [makeBall(1, 200, 30)];     // 球顶 y-r=14 < 红线46
  for (i = 0; i < 10; i++) { R.balls[0].y = 30; tick(1 / 60); }
  DANGER_TIME = savedDT;
  check('tick循环中危险区持续判负', R.state === 'over' && $('over-overlay').hidden === false);

  /* ---------- 物理模拟：单球落下停在地面 ---------- */
  startRun();
  R.balls = [makeBall(3, 200, 100)];
  for (i = 0; i < 720; i++) stepPhysics(1 / 60);
  b = R.balls[0];
  check('单球落至地面静止', Math.abs((b.y + b.r) - FLOOR_Y) < 1 && !b.removed);
  check('单球停在边界内', b.x - b.r >= -0.5 && b.x + b.r <= W + 0.5);

  /* ---------- 物理模拟：多球堆叠不穿透 ---------- */
  startRun();
  R.balls = [makeBall(3, 180, 100), makeBall(3, 220, 100), makeBall(3, 200, 60)];
  for (i = 0; i < 900; i++) stepPhysics(1 / 60);
  var ps = R.balls.filter(function (x) { return !x.removed; });
  var overlap = false;
  for (var m = 0; m < ps.length; m++) for (var n = m + 1; n < ps.length; n++) {
    var ddx = ps[m].x - ps[n].x, ddy = ps[m].y - ps[n].y;
    var dr = ps[m].r + ps[n].r;
    if (ddx * ddx + ddy * ddy < dr * dr * 0.99) overlap = true;
  }
  check('多球堆叠不深度重叠', !overlap);
  check('多球都不穿地面', ps.every(function (x) { return (x.y + x.r) <= FLOOR_Y + 2; }));

  /* ---------- 物理模拟：同级球下落自然合成 ---------- */
  startRun();
  R.balls = [makeBall(2, 190, 50), makeBall(2, 210, 50)];
  for (i = 0; i < 600; i++) stepPhysics(1 / 60);
  ps = R.balls.filter(function (x) { return !x.removed; });
  check('下落接触后自然合成', ps.length === 1 && ps[0].level === 3);

  /* ---------- 发射与下一球 ---------- */
  startRun();
  var n0 = R.next;
  var c0 = R.current;
  dropBall();
  check('落球后当前球进列表', R.balls.length === 1 && R.balls[0] === c0);
  check('落球后新当前球是原下一球', R.current && R.current.level === n0);
  check('下一球预览已更新', $('next-ball').src.indexOf('images/') >= 0);

  /* ---------- 渲染冒烟 ---------- */
  startRun();
  R.balls = [makeBall(3, 200, 300)];
  var renderErr = null;
  try { render(); drawBall(R.balls[0]); drawBG(); } catch (e) { renderErr = e; }
  check('canvas 渲染不抛错', renderErr === null);

  console.log('---- 冒烟测试结束 ----');
})().catch(function (e) { console.error('TEST ERROR', e); process.exitCode = 1; });
