/* ============ 中国人能飞 冒烟测试：模拟 window.toy + 最小 DOM ============ */
var fs = require('fs');
var path = require('path');

/* ---- 最小 DOM 桩 ---- */
function ctxStub() {
  var c = {};
  ['clearRect','beginPath','arc','arcTo','fill','stroke','moveTo','lineTo','quadraticCurveTo',
   'clip','drawImage','fillRect','save','restore','fillText','setTransform','translate','rotate',
   'scale','setLineDash','closePath'].forEach(function (m) { c[m] = function () {}; });
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
function frames(n, dt) {
  dt = dt || 1 / 60;
  for (var i = 0; i < n; i++) tick(dt);
}

eval(code);

(async function () {
  /* ---------- 难度曲线 ---------- */
  check('50m(500px)难度系数0', diffT(SAFE_PX) === 0);
  check('1000m难度系数1', diffT(SAFE_PX + MAX_T_M * ALT_PX) === 1);
  check('难度单调不减', diffT(500) <= diffT(3000) && diffT(3000) <= diffT(8000));
  check('缺口下限>=3倍玩家宽66', gapAt(999999) >= 3 * PLAYER_W && gapAt(SAFE_PX) > gapAt(999999));
  check('柱间距下限>=3倍玩家高84', spacingAt(999999) >= 3 * PLAYER_H && spacingAt(SAFE_PX) > spacingAt(999999));
  check('撞柱惩罚 基础6m→最大22m', penaltyAt(SAFE_PX) === KILL_HIT_BASE && Math.abs(penaltyAt(SAFE_PX + MAX_T_M * ALT_PX) - (KILL_HIT_BASE + KILL_HIT_RANGE)) < 0.001);
  check('高处惩罚大于低处', penaltyAt(5000) > penaltyAt(1100));

  /* ---------- 玩家上升速度模型 ---------- */
  startRun();
  var v0 = R.vy;
  check('初始不点击悬停(vy=0)', v0 === 0);
  frames(30);
  check('不点击高度不涨', R.alt === 0);
  for (var i = 0; i < 5; i++) tapUp();
  check('连点提升速度', R.vy > v0 + 4 * TAP_IMPULSE - 1);
  for (i = 0; i < 30; i++) tapUp();
  check('上升速度封顶20m/s', R.vy === MAX_VY);
  frames(300);
  check('停止点击后速度回归0', R.vy < 10);

  /* ---------- 停止点击后惯性滑行 ---------- */
  startRun();
  R.vy = 200;
  frames(5);    // 0.083s
  check('停止后仍带惯性飞行', R.vy > 150);
  frames(120);  // 再2s
  check('惯性过后速度衰减', R.vy < 30);

  /* ---------- 左右移位 ---------- */
  startRun();
  tapLeft();
  check('左移产生负向速度', R.vx < 0);
  tapRight(); tapRight();
  check('右移抵消并转正', R.vx > 0);
  check('水平速度封顶', (function () { for (var j = 0; j < 20; j++) tapRight(); return R.vx <= MAX_HV; })());

  /* ---------- 画布连击=上升、滑动=移动 ---------- */
  startRun();
  bindCanvasTouch();
  var cv = $('game');
  cv._h.pointerdown[0]({ clientX: 100, clientY: 200, preventDefault: function () {} });
  cv._h.pointerup[0]({ clientX: 102, clientY: 200, preventDefault: function () {} });
  check('点击屏幕=上升', R.vy > 0);
  R.vy = 0; R.vx = 0;
  cv._h.pointerdown[0]({ clientX: 200, clientY: 200, preventDefault: function () {} });
  cv._h.pointermove[0]({ clientX: 230, clientY: 200, preventDefault: function () {} });
  cv._h.pointermove[0]({ clientX: 245, clientY: 200, preventDefault: function () {} });
  cv._h.pointerup[0]({ clientX: 245, clientY: 200, preventDefault: function () {} });
  check('滑动屏幕=右移', R.vx > 0);
  check('滑动不触发上升', R.vy === 0);

  /* ---------- 斩杀线启动：5s倒计时 且 过50m，初始位于玩家下方75m ---------- */
  startRun();
  frames(60);
  R.seconds = 4; R.alt = 600;
  updateKillLine(1 / 60);
  check('倒计时未结束不启动', R.klActive === false && R.kl === 0);
  check('倒计时未结束不死', R.state === 'playing');
  R.seconds = 6; R.alt = 400;
  updateKillLine(1 / 60);
  check('过5s但未过50m不启动', R.klActive === false);
  R.seconds = 6; R.alt = 1500;
  updateKillLine(1 / 60);
  check('过5s且过50m斩杀线启动', R.klActive === true);
  check('H≥75m斩杀线从0m开始', Math.abs((R.kl - R.klV / 60) - 0) < 0.01);
  check('启动横幅出现', FXD.banners.length >= 1);

  /* ---------- 50m≤H<75m：斩杀线初始落后玩家75m ---------- */
  startRun();
  R.alt = 600; R.seconds = 6;
  updateKillLine(1 / 60);
  check('50m≤H<75m斩杀线初始落后75m', R.klActive === true && Math.abs((R.kl - R.klV / 60) - (600 - 75 * ALT_PX)) < 0.01);

  /* ---------- 斩杀线公式与追得快慢 ---------- */
  check('斩杀线公式 满速20m/s→18m/s(留余量)', klSpeedFor(200) === 180);
  check('斩杀线公式 悬停→14m/s(最慢)', klSpeedFor(0) === 140);
  check('斩杀线公式 10m/s→16m/s(被追)', klSpeedFor(100) === 160);
  startRun();
  R.klActive = true; R.klV = 0; R.alt = 1500; R.kl = 1400; R.vy = 200;
  updateKillLine(1);
  check('满速时斩杀线比玩家慢(有余量)', R.klV < R.vy);
  R.kl = 1400; R.klV = 0; R.vy = 100;
  updateKillLine(1);
  check('慢速时斩杀线比玩家快(被追)', R.klV > R.vy);

  /* ---------- 斩杀线追上即死 ---------- */
  startRun();
  R.alt = 1500; R.klActive = true; R.kl = R.alt - PLAYER_H / 2 - 1;
  checkKillDeath();
  check('未追上不死', R.state === 'playing');
  R.kl = R.alt - PLAYER_H / 2;
  checkKillDeath();
  check('斩杀线触底即死', R.state === 'over');
  check('结束弹窗显示', $('over-overlay').hidden === false);

  /* ---------- 斩杀线追上：完整tick路径 ---------- */
  startRun();
  R.alt = 1500; R.kl = 1490; R.klActive = true; R.klV = klSpeedFor(30); R.vy = 30;
  frames(60);   // 斩杀线按156px/s 逼近，玩家仅30px/s → 追上
  check('tick中斩杀线追上判负', R.state === 'over');

  /* ---------- 柱子生成约束 ---------- */
  startRun();
  R.alt = 6000; R.nextSpawnAlt = SAFE_PX;
  spawnPillars();
  check('高处生成多根柱子', R.pillars.length > 3);
  var ok = true, gapOK = true;
  for (i = 1; i < R.pillars.length; i++) {
    var p = R.pillars[i];
    var half = p.gapW / 2;
    if (p.gapC - half < 0 || p.gapC + half > W) ok = false;
    if (p.gapW < 3 * PLAYER_W) gapOK = false;
    var sp = p.alt - R.pillars[i - 1].alt;
    if (sp < 3 * PLAYER_H) ok = false;
  }
  check('柱子缺口在画布内且间距/缺口达标', ok && gapOK);
  var wordOK = R.pillars.every(function (p) { return WORDS.indexOf(p.label) >= 0; });
  check('柱子上文字取自主题词库', wordOK);
  check('词库数量≥20', WORDS.length >= 20);
  check('词库长度2-4字', WORDS.every(function (w) { return w.length >= 2 && w.length <= 4; }));
  check('保留高考/秋招', WORDS.indexOf('高考') >= 0 && WORDS.indexOf('秋招') >= 0);
  check('已去末尾淘汰/中年危机', WORDS.indexOf('末尾淘汰') < 0 && WORDS.indexOf('中年危机') < 0);
  check('换词到位(流浪/三高/迟到)', WORDS.indexOf('流浪') >= 0 && WORDS.indexOf('三高') >= 0 && WORDS.indexOf('迟到') >= 0);
  check('不再有倒闭/房租/通勤', WORDS.indexOf('倒闭') < 0 && WORDS.indexOf('房租') < 0 && WORDS.indexOf('通勤') < 0);

  /* ---------- 柱子段宽能横排放下文字 ---------- */
  var segOK = R.pillars.every(function (p) {
    var half = p.gapW / 2;
    return (p.gapC - half) >= 90 && (W - (p.gapC + half)) >= 90;
  });
  check('每根柱子段宽≥90可横排文字', segOK);

  /* ---------- 柱子碰撞：斩杀线暴涨 ---------- */
  startRun();
  R.alt = 1500; R.invuln = 0;
  R.pillars = [{ id: 1, alt: 1500, gapC: W / 2, gapW: 60, thick: 24, label: '房贷', hit: false }];
  R.x = 100;   // 玩家压在左侧柱子段上
  var kl0 = R.kl;
  checkPillarHit();
  check('撞柱判定命中', R.hits === 1 && R.invuln > 0);
  check('撞柱斩杀线跳升', R.kl > kl0);
  check('撞柱出现惩罚飘字/横幅', FXD.texts.length >= 1 && FXD.banners.length >= 1);
  check('撞柱飘字为整数米', FXD.texts.length > 0 && /^-[0-9]+m$/.test(FXD.texts[0].text));
  check('撞柱不死', R.state === 'playing');

  /* ---------- 撞柱后无敌期不再重复判定 ---------- */
  R.invuln = 0.5;
  var hits1 = R.hits;
  checkPillarHit();
  check('无敌期内不重复撞柱', R.hits === hits1);

  /* ---------- 低速撞柱敲退减速（不下坠） ---------- */
  startRun();
  R.alt = 1500; R.invuln = 0; R.vy = 100;
  R.pillars = [{ id: 9, alt: 1500, gapC: W / 2, gapW: 60, thick: 24, label: '996', hit: false }];
  R.x = 100;
  checkPillarHit();
  check('撞柱敲退减速(不下坠)', R.vy < 100 && R.vy >= 0);

  /* ---------- 不能向后飞 ---------- */
  startRun();
  R.alt = 500; R.vy = 0;
  for (i = 0; i < 20; i++) tapDown();
  check('S/↓ 减速到0不下坠', R.vy === 0);
  frames(30);
  check('高度不倒退', R.alt === 500);

  /* ---------- 苦难词库梯度：低处只有前2词 ---------- */
  startRun();
  R.alt = SAFE_PX; R.nextSpawnAlt = SAFE_PX; R.prevGapC = null;
  spawnPillars();
  check('最低处柱子仅前2词(高考/秋招)', R.pillars.length > 0 && WORDS.indexOf(R.pillars[0].label) < 2);

  /* ---------- 道具：500m 后每100m一个 ---------- */
  startRun();
  R.alt = 10000; R.nextBonusAlt = BONUS_START_M * ALT_PX;
  spawnBonuses();
  check('高处生成多个道具', R.bonuses.length > 3);
  var bAltOK = true, prevB = BONUS_START_M * ALT_PX;
  for (i = 0; i < R.bonuses.length; i++) {
    if (R.bonuses[i].alt < BONUS_START_M * ALT_PX) bAltOK = false;
    if (i > 0 && (R.bonuses[i].alt - prevB) !== BONUS_EVERY_M * ALT_PX) bAltOK = false;
    prevB = R.bonuses[i].alt;
  }
  check('道具从500m起每100m一个', bAltOK);
  check('道具位置在画布内', R.bonuses.every(function (b) { return b.x >= 30 && b.x <= W - 30; }));

  /* ---------- 捡道具降低斩杀线3-5m ---------- */
  startRun();
  R.klActive = true; R.kl = 1500; R.alt = 5000; R.x = 200;
  R.bonuses = [{ alt: 5000, x: 200, got: false }];
  checkBonus();
  check('捡到道具降低斩杀线3-5m', R.kl >= 1500 - 5 * ALT_PX && R.kl <= 1500 - 3 * ALT_PX);
  check('道具标记已拾取', R.bonuses[0].got === true);

  /* ---------- 拾取半径 ---------- */
  startRun();
  R.klActive = true; R.kl = 1500; R.alt = 5000; R.x = 200;
  R.bonuses = [{ alt: 5000, x: 231, got: false }];
  checkBonus();
  check('半径内可捡到(Δx31)', R.bonuses[0].got === true);
  startRun();
  R.klActive = true; R.kl = 1500; R.alt = 5000; R.x = 200;
  R.bonuses = [{ alt: 5000, x: 245, got: false }];
  checkBonus();
  check('半径外不拾取(Δx45)', R.bonuses[0].got === false);

  /* ---------- 道具避开柱子 ---------- */
  startRun();
  R.alt = 6000; R.nextSpawnAlt = SAFE_PX;
  spawnPillars();
  R.bonuses = []; R.nextBonusAlt = BONUS_START_M * ALT_PX;
  spawnBonuses();
  var bNoClash = R.bonuses.every(function (b) {
    for (var i = 0; i < R.pillars.length; i++) {
      var p = R.pillars[i];
      if (Math.abs(p.alt - b.alt) > 60) continue;
      var gl = p.gapC - p.gapW / 2, gr = p.gapC + p.gapW / 2;
      if (b.x < gl - 8 || b.x > gr + 8) return false;   // 道具应落在缺口附近，不压柱子段
    }
    return true;
  });
  check('道具不落在柱子上', bNoClash);

  /* ---------- 撞柱涨幅不超过斩杀线剩余距离80% ---------- */
  startRun();
  R.alt = 1500; R.klActive = true; R.kl = 1470; R.invuln = 0;
  R.pillars = [{ id: 2, alt: 1500, gapC: W / 2, gapW: 60, thick: 24, label: '35岁危机', hit: false }];
  R.x = 100;
  var safety = (R.alt - PLAYER_H / 2) - R.kl;
  checkPillarHit();
  var rise = R.kl - 1470;
  check('撞柱涨幅受限且不致死', R.state === 'playing' && rise <= safety * 0.8 + 0.01 && R.kl < R.alt - PLAYER_H / 2);

  /* ---------- 计分与排行榜 ---------- */
  global.localStorage._d = {};
  S.hi = 0; S.games = 0;
  startRun();
  R.alt = 1234; R.klActive = true; R.kl = 1230;
  var g0 = S.games;
  gameOver();
  check('飞行高度为得分', $('over-alt').textContent === '123m');
  check('结束斩杀线高度显示', $('over-kl').textContent === '123m');
  check('最高飞高更新', S.hi === 123);
  check('局数+1', S.games === g0 + 1);
  check('本地榜记录123', readLB().hi[0].s === 123);
  check('B站榜已提交123', sdk._scores[1] === 123);
  check('结束弹窗显示', $('over-overlay').hidden === false);

  /* ---------- 本地榜排序与100上限 ---------- */
  global.localStorage._d = {};
  for (i = 0; i < 150; i++) addLocalScore(i);
  var lb = readLB();
  check('本地榜上限100', lb.hi.length === 100);
  check('本地榜降序(前2)', lb.hi[0].s === 149 && lb.hi[1].s === 148);

  /* ---------- HUD ---------- */
  startRun();
  updateHud();
  check('HUD初始高度0m', $('hud-alt').textContent === '0m');
  check('HUD斩杀线倒计时显示', $('hud-kl').textContent.indexOf('s 后启动') >= 0);
  R.alt = 1600; R.klActive = true; R.kl = 1400;
  updateHud();
  check('HUD斩杀线逼近文案', $('hud-kl').textContent.indexOf('逼近') >= 0);
  R.kl = 1590;
  updateHud();
  check('HUD斩杀线近在咫尺文案', $('hud-kl').textContent.indexOf('近在咫尺') >= 0);

  /* ---------- 渲染冒烟：各绘制函数不抛错 ---------- */
  startRun();
  R.alt = 3000; R.klActive = true; R.kl = 2950; R.x = 200; R.vx = 60;
  R.pillars = [{ id: 3, alt: 2600, gapC: 200, gapW: 100, thick: 24, label: '裁员', hit: false }];
  var err = null;
  try { render(); drawBG(); drawPillars(); drawKillLine(); drawPlayer(200, playerScreenY()); drawGauge(); drawFX(); } catch (e) { err = e; }
  check('canvas 渲染不抛错', err === null);

  /* ---------- 完整tick：50m下悬停斩杀线不启动 ---------- */
  startRun();
  frames(540);   // 9s 完全不点击（alt=0 < 50m）
  check('50m下悬停斩杀线不启动', R.state === 'playing' && R.klActive === false);
  check('安全期不点击高度不涨', R.alt === 0);
  tapUp();
  frames(30);
  check('点击后开始上升', R.alt > 0);

  /* ---------- 完整tick：持续连点10s斩杀线追不上（无柱） ---------- */
  startRun();
  R.alt = 1500; R.pillars = []; R.nextSpawnAlt = 9999999;
  for (i = 0; i < 600; i++) { if (i % 8 === 0) tapUp(); tick(1 / 60); }   // ~7.5次/秒
  check('持续连点10s斩杀线追不上', R.state === 'playing');
  check('持续连点高度显著增长', R.alt > 3000);

  /* ---------- 暂停/继续 ---------- */
  startRun();
  R.state = 'playing';
  pauseGame();
  check('暂停状态paused', R.state === 'paused' && $('pause-overlay').hidden === false);
  resumeGame();
  check('继续状态playing', R.state === 'playing' && $('pause-overlay').hidden === true);
  pauseGame();
  exitToHome();
  check('退出回首页', $('view-home').hidden === false && R.state === 'paused');

  /* ---------- 暂停进入设置再返回 ---------- */
  startRun();
  R.state = 'playing';
  pauseGame();
  bindUI();
  $('btn-pause-settings')._h.click[0]();
  check('暂停弹窗设置进入设置页', settingsFromPause === true && $('view-settings').hidden === false && R.state === 'paused');
  $('btn-back-settings')._h.click[0]();
  check('设置返回回到暂停弹窗', settingsFromPause === false && $('view-game').hidden === false && $('pause-overlay').hidden === false && R.state === 'paused');

  /* ---------- 全面静音按钮 ---------- */
  startRun();
  bindUI();
  S.muted = false;
  updateHud();
  check('静音按钮初始为🔊', $('btn-mute').textContent === '🔊');
  $('btn-mute')._h.click[0]();
  check('点击开启全面静音', S.muted === true);
  updateHud();
  check('静音按钮变为🔇', $('btn-mute').textContent === '🔇');
  $('btn-mute')._h.click[0]();
  check('再点取消静音', S.muted === false);
  S.muted = false;   // 恢复

  /* ---------- 设置持久化 ---------- */
  S.muted = false;
  saveCfg();
  var d = JSON.parse(global.localStorage.getItem('fl_fly_cfg'));
  check('音效设置保存', d.muted === false);
  S.muted = true;
  loadCfg();
  check('音效设置读取回false', S.muted === false);
  S.muted = false;   // 恢复

  /* ---------- BGM 设置持久化与开关 ---------- */
  S.bgm = false;
  saveCfg();
  var db = JSON.parse(global.localStorage.getItem('fl_fly_cfg'));
  check('BGM设置保存', db.bgm === false);
  S.bgm = true;
  loadCfg();
  check('BGM设置读取回false', S.bgm === false);
  S.bgm = true;
  applySettings();
  check('设置页BGM开关同步', $('set-bgm').checked === true);

  console.log('---- 冒烟测试结束 ----');
})().catch(function (e) { console.error('TEST ERROR', e); process.exitCode = 1; });
