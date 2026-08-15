/* 射箭大师：Node 冒烟测试
 * 用 DOM 桩环境加载 game.js，驱动游戏循环运行若干帧，
 * 验证 初始化 / 关卡生成与可达性 / 滑动条与键盘 / 蓄力发射与放弃 /
 * 物理仿真 / 全靶三星过关 / SDK 上报 / 求助 / 全空箭失败不扣负 / 存档 / 排行榜。 */
'use strict';

// ---------- DOM 桩 ----------
const els = {};
const RECTS = {
  'btn-charge': { left: 210, right: 320, top: 617, bottom: 667, width: 110, height: 50 },
  'btn-cancel': { left: 320, right: 375, top: 620, bottom: 667, width: 55, height: 47 },
  'angle-slider': { left: 0, right: 375, top: 20, bottom: 60, width: 375, height: 40 }
};

function makeCtx() {
  const noop = () => {};
  const grad = { addColorStop: noop };
  return {
    clearRect: noop, save: noop, restore: noop, translate: noop, rotate: noop,
    scale: noop, fillRect: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, quadraticCurveTo: noop, arc: noop,
    ellipse: noop, fill: noop, stroke: noop, strokeRect: noop,
    strokeText: noop, fillText: noop, setTransform: noop, setLineDash: noop,
    createLinearGradient() { return grad; },
    createRadialGradient() { return grad; },
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, lineJoin: '',
    globalAlpha: 1, textAlign: '', textBaseline: ''
  };
}

function makeEl(id) {
  const el = {
    id,
    _l: {},
    addEventListener(ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn); },
    dispatch(ev, data) {
      const list = this._l[ev] || [];
      for (const fn of list) fn(Object.assign({ target: this, preventDefault() {} }, data || {}));
    },
    classList: {
      _s: new Set(),
      toggle(c, on) { if (on === undefined) on = !this._s.has(c); on ? this._s.add(c) : this._s.delete(c); },
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    style: { setProperty() {}, getPropertyValue() { return ''; } },
    hidden: false,
    textContent: '',
    innerHTML: '',
    value: '',
    clientWidth: 112,
    clientHeight: 112,
    getBoundingClientRect() {
      return RECTS[id] || { left: 0, right: 375, top: 0, bottom: 667, width: 375, height: 667 };
    },
    setPointerCapture() {},
    getContext() { return this._ctx || (this._ctx = makeCtx()); },
    querySelectorAll() { return []; }
  };
  els[id] = el;
  return el;
}

const docListeners = {};
global.document = {
  readyState: 'complete',
  activeElement: null,
  getElementById(id) { return els[id] || makeEl(id); },
  addEventListener(ev, fn) { (docListeners[ev] = docListeners[ev] || []).push(fn); },
  createElement() {
    return { set src(v) { this._src = v; }, get src() { return this._src; }, async: false, onload: null, onerror: null, head: null };
  },
  head: { appendChild() {} },
  hidden: false
};

const winListeners = {};
const toyCalls = { submit: [], rank: [], myRank: [] };
const toyMock = {
  submitScore(req) { toyCalls.submit.push(req); return Promise.resolve({ score: req.score }); },
  getRankList(req) { toyCalls.rank.push(req); return Promise.resolve([{ rank: 1, score: 12, nickname: '玩家甲', avatar: '' }, { rank: 2, score: 30, nickname: '射手乙', avatar: '' }]); },
  getMyRank(req) { toyCalls.myRank.push(req); return Promise.resolve({ ranked: true, rank: 3, score: 8 }); }
};
global.window = {
  devicePixelRatio: 1,
  innerWidth: 375,
  innerHeight: 667,
  PointerEvent: function () {},
  toy: toyMock,
  addEventListener(ev, fn) { (winListeners[ev] = winListeners[ev] || []).push(fn); }
};

const storage = {};
global.localStorage = {
  getItem(k) { return k in storage ? storage[k] : null; },
  setItem(k, v) { storage[k] = String(v); },
  removeItem(k) { delete storage[k]; }
};

let rafCb = null;
global.requestAnimationFrame = function (fn) { rafCb = fn; return 1; };
global.cancelAnimationFrame = function () { rafCb = null; };

let clock = 0;
global.performance = { now: () => clock };

// ---------- 驱动帧循环 ----------
function frames(n) {
  for (let i = 0; i < n; i++) {
    if (!rafCb) return;
    const cb = rafCb;
    rafCb = null;
    clock += 1000 / 60;
    cb(clock);
  }
}
const tick = () => new Promise(r => setTimeout(r, 8));
function fireKey(type, code, extra) {
  (winListeners[type] || []).forEach(fn => fn(Object.assign({ code: code, key: code === 'Space' ? ' ' : '', preventDefault() {} }, extra || {})));
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) { failed++; console.log('  [FAIL] ' + msg); }
  else console.log('  [ok] ' + msg);
}

// 找一个标靶的可命中组合（尽量选力度窗口最宽的角度）
function findHit(t, obs, sim) {
  let best = null;
  const ex = Math.atan2(-(t.y - 225), t.x - 70) * 180 / Math.PI;   // PX=70 PY=225
  if (sim(t, ex, 100, obs, 8)) best = { ai: ex, lo: 100, hi: 100 };
  for (let ai = -85; ai <= 85; ai += 5) {
    let lo = -1, hi = -1;
    for (let p = 20; p <= 100; p += 2) {
      if (sim(t, ai, p, obs, 8)) { if (lo < 0) lo = p; hi = p; }
    }
    if (lo >= 0 && (best === null || (hi - lo) > (best.hi - best.lo))) best = { ai, lo, hi };
  }
  if (!best) return null;
  if (best.lo === 100 && best.hi === 100) return { angle: best.ai, power: 100 };
  let lo = -1, hi = -1;
  for (let p = 1; p <= 100; p++) {
    if (sim(t, best.ai, p, obs, 8)) { if (lo < 0) lo = p; hi = p; }
  }
  return { angle: best.ai, power: (lo + hi) / 2 };
}

// ---------- 测试流程 ----------
async function main() {
  console.log('== 模块加载与初始化 ==');
  const g = require('./game.js');
  assert(!!g && typeof g.simulateHit === 'function', 'game.js 已加载并导出内部函数');
  assert(typeof rafCb === 'function', '游戏主循环已启动');
  frames(5);

  console.log('== 开始游戏与关卡生成 ==');
  els['btn-start'].dispatch('click');
  await tick();
  assert(els['view-game'].classList.contains('active'), '已切换到游戏页');
  assert(g.getState() === 'playing', '进入游戏中状态');
  const ts = g.getTargets();
  const obs = g.getObstacles();
  assert(ts.length === 5, '生成 5 个标靶');
  assert(ts.every(t => t.value >= 4 && t.value <= 20), '标靶价值在 4~20 之间');
  assert(ts.every(t => t.r >= 23 * 0.8 - 1e-6 && t.r <= 23 * 1.2 + 1e-6), '标靶大小在 ±20% 范围');
  assert(ts.some(t => t.sizeMul >= 1.1), '存在大标靶');
  assert(ts.some(t => t.sizeMul <= 0.9), '存在小标靶');
  assert(ts.every(t => g.targetReachable(t, obs)), '所有标靶至少一种路径可达（弧线）');
  assert(g.minBlockedFor(10) === 1 && g.minBlockedFor(11) === 2 &&
         g.minBlockedFor(100) === 2 && g.minBlockedFor(101) === 3 &&
         g.minBlockedFor(1000) === 3 && g.minBlockedFor(1001) === 4, '不可达标靶数量分级正确');
  const blockedCnt = ts.filter(t => !g.lineClearTo(t, obs)).length;
  assert(blockedCnt >= g.minBlockedFor(1), '至少 ' + g.minBlockedFor(1) + ' 个标靶直线不可达（实际 ' + blockedCnt + '）');
  let spacingOk = true;
  for (let a2 = 0; a2 < ts.length; a2++) for (let b2 = a2 + 1; b2 < ts.length; b2++) {
    const dd = Math.hypot(ts[a2].x - ts[b2].x, ts[a2].y - ts[b2].y);
    if (dd < ts[a2].r + ts[b2].r + 40 - 1e-6) spacingOk = false;
  }
  assert(spacingOk, '标靶之间保持间距（≥ 半径和 + 40）');
  assert(g.obstacleCountFor(50) > g.obstacleCountFor(1), '障碍物数量公式随关卡增多');
  assert(g.generateLevel(50).obstacles.length > g.generateLevel(1).obstacles.length, '实际生成障碍物随关卡增多');
  assert(g.getTotalValue() > 0, '总价值 > 0');
  assert(g.getArrowsLeft() === 7, '初始 7 支箭');
  assert(g.getHitFlags().every(h => !h), '初始无命中');
  const exp1 = Math.ceil(g.getTotalValue() * 0.6);
  assert(els['hud-total'].textContent === exp1 + ' ★', 'HUD 优先显示 1 星所需分数（' + els['hud-total'].textContent + '）');

  console.log('== 角度滑动条 ==');
  els['angle-slider'].dispatch('pointerdown', { pointerId: 2, clientX: 375, clientY: 40 });
  assert(g.getAngle() > 80, '滑动条最右 → 接近 +90°');
  els['angle-slider'].dispatch('pointermove', { pointerId: 2, clientX: 0, clientY: 40 });
  assert(g.getAngle() < -80, '滑动条最左 → 接近 -90°');
  els['angle-slider'].dispatch('pointerup', { pointerId: 2, clientX: 0, clientY: 40 });

  console.log('== 角度数值输入 ==');
  els['angle-input'].value = '45';
  els['angle-input'].dispatch('input');
  assert(g.getAngle() === 45, '输入 45 → 角度 45');
  els['angle-input'].value = '200';
  els['angle-input'].dispatch('input');
  assert(g.getAngle() === 90, '输入越界 200 → 钳制到 90');
  els['angle-input'].value = '-200';
  els['angle-input'].dispatch('input');
  assert(g.getAngle() === -90, '输入越界 -200 → 钳制到 -90');
  els['angle-input'].value = '0';
  els['angle-input'].dispatch('change');
  assert(g.getAngle() === 0, 'change 提交后回写 0');

  console.log('== 键盘角度调整 ==');
  g.setAngle(0);
  fireKey('keydown', 'ArrowUp'); fireKey('keydown', 'KeyW');
  assert(g.getAngle() === 4, 'W/↑ 各 +2° → ' + g.getAngle() + '°');
  fireKey('keydown', 'ArrowDown'); fireKey('keydown', 'KeyS');
  assert(g.getAngle() === 0, 'S/↓ 各 -2° → ' + g.getAngle() + '°');

  console.log('== 角度输入框聚焦时不与按键冲突 ==');
  global.document.activeElement = els['angle-input'];
  g.setAngle(5);
  fireKey('keydown', 'ArrowUp');
  assert(g.getAngle() === 5, '聚焦输入框时 ↑ 不再重复改角度（交原生）');
  fireKey('keydown', 'ArrowDown');
  assert(g.getAngle() === 5, '聚焦输入框时 ↓ 不再重复改角度（交原生）');
  global.document.activeElement = null;
  fireKey('keydown', 'ArrowUp');
  assert(g.getAngle() === 7, '离开输入框后 ↑ 正常 +2°（5→7）');
  fireKey('keydown', 'ArrowDown');
  assert(g.getAngle() === 5, '离开输入框后 ↓ 正常 -2°（7→5）');

  console.log('== 点击标靶自动瞄准 ==');
  const aimT = g.getTargets()[0];
  const aimExp = Math.atan2(-(aimT.y - 225), aimT.x - 70) * 180 / Math.PI;
  g.aimAtTarget(0);
  assert(Math.abs(g.getAngle() - aimExp) < 0.01, '瞄准标靶 → 角度对准（' + g.getAngle().toFixed(1) + '°）');
  const lay = g.getLayout();
  g.setAngle(0);
  els['game'].dispatch('pointerdown', { pointerId: 3, clientX: aimT.x * lay.scale + lay.offX, clientY: aimT.y * lay.scale + lay.offY });
  assert(Math.abs(g.getAngle() - aimExp) < 0.01, '点按画布标靶坐标 → 角度对准（' + g.getAngle().toFixed(1) + '°）');
  g.setAngle(0);

  console.log('== 蓄力 / 拖到放弃不发射 ==');
  const beforeArrows = g.getArrowsLeft();
  els['btn-charge'].dispatch('pointerdown', { pointerId: 1, clientX: 265, clientY: 640 });
  frames(30);
  const pCharged = g.getPower();
  assert(pCharged > 10, '蓄力数字增长 (' + pCharged.toFixed(1) + ')');
  els['btn-charge'].dispatch('pointermove', { pointerId: 1, clientX: 350, clientY: 640 });
  els['btn-charge'].dispatch('pointerup', { pointerId: 1, clientX: 350, clientY: 640 });
  assert(g.getArrowsLeft() === beforeArrows, '拖到放弃按钮松开 → 不发射（箭数不变）');
  assert(g.getState() === 'playing', '仍在游戏中');

  console.log('== 蓄力周期：上升→100停顿→衰减→归0自动结束 ==');
  els['btn-charge'].dispatch('pointerdown', { pointerId: 5, clientX: 265, clientY: 640 });
  let saw100 = false, holdCnt = 0, sawHold = false, sawFall = false, autoEnd = false;
  for (let i = 0; i < 320 && !autoEnd; i++) {
    frames(3);
    const p = g.getPower();
    if (p >= 99) saw100 = true;
    if (p >= 99) holdCnt++; else holdCnt = 0;
    if (holdCnt >= 3) sawHold = true;
    if (saw100 && p < 99 && p > 1) sawFall = true;
    if (sawFall && p === 0) autoEnd = true;
  }
  assert(saw100, '蓄力冲到 100');
  assert(sawHold, '到 100 后暂停一段时间（≥3 帧停在 100）');
  assert(sawFall, '暂停后开始衰减');
  assert(autoEnd, '归 0 后本次蓄力自动结束');
  assert(!g.getCharging(), '蓄力会话已结束');
  assert(g.getArrowsLeft() === beforeArrows, '自动结束后未发射（箭数不变）');
  els['btn-charge'].dispatch('pointerup', { pointerId: 5, clientX: 265, clientY: 640 });  // 收尾

  console.log('== 空格蓄力到 0 自动停止（长按不重开） ==');
  fireKey('keydown', 'Space');
  let spDone = false;
  for (let i = 0; i < 400 && !spDone; i++) { frames(3); if (!g.getCharging()) spDone = true; }
  fireKey('keyup', 'Space');
  assert(spDone && !g.getCharging(), '空格蓄力完整周期后自动结束');
  const spArrows = g.getArrowsLeft();
  fireKey('keydown', 'Space', { repeat: true });
  frames(30);
  assert(!g.getCharging(), '长按空格不因 key repeat 重新蓄力');
  assert(g.getArrowsLeft() === spArrows, '长按未发射新箭');
  fireKey('keyup', 'Space', { repeat: true });
  fireKey('keydown', 'Space');
  frames(10);
  assert(g.getCharging(), '松开重按空格可重新蓄力');
  fireKey('keydown', 'Escape');
  assert(!g.getCharging(), 'Esc 取消蓄力');

  console.log('== 蓄力中点击「放弃」取消 ==');
  const cancelArrows = g.getArrowsLeft();
  fireKey('keydown', 'Space');
  frames(20);
  assert(g.getCharging(), '空格蓄力中');
  els['btn-cancel'].dispatch('click');
  assert(!g.getCharging(), '点击放弃取消蓄力');
  assert(g.getArrowsLeft() === cancelArrows, '取消后未发射');
  fireKey('keyup', 'Space');

  console.log('== 力度条点击/拖动设目标刻度 ==');
  els['power-bar'].dispatch('pointerdown', { pointerId: 7, clientX: 0, clientY: 10 });
  assert(g.getTargetPower() === 0, '点击力度条最左 → 目标力度 0');
  els['power-bar'].dispatch('pointermove', { pointerId: 7, clientX: 187.5, clientY: 10 });
  assert(Math.abs(g.getTargetPower() - 50) < 1, '拖到中间 → 目标力度约 50');
  els['power-bar'].dispatch('pointermove', { pointerId: 7, clientX: 375, clientY: 10 });
  assert(Math.abs(g.getTargetPower() - 100) < 1, '拖到最右 → 目标力度约 100');
  els['power-bar'].dispatch('pointerup', { pointerId: 7, clientX: 375, clientY: 10 });
  assert(els['power-target-tag'].textContent === '100', '目标刻度标签显示力度 100');
  assert(parseFloat(els['power-target'].style.left) > 90, '目标刻度定位到右侧');

  console.log('== 键盘空格蓄力发射 ==');
  const beforeArrows2 = g.getArrowsLeft();
  fireKey('keydown', 'Space');
  frames(30);
  fireKey('keyup', 'Space');
  assert(g.getArrowsLeft() === beforeArrows2 - 1, '空格蓄力后松开 → 发射（箭 -1）');
  assert(g.getLastPower() > 0, '记录上一箭力度刻度（' + g.getLastPower().toFixed(1) + '）');
  assert(parseFloat(els['power-marker'].style.left) > 0, '蓄力条上刻度标记已定位');
  assert(els['power-marker-tag'].textContent === String(Math.round(g.getLastPower())), '上一箭刻度标签标注力度（' + els['power-marker-tag'].textContent + '）');
  while (g.getActiveArrows() > 0) frames(5);   // 等上一支箭落地

  console.log('== 大小标靶价值反向（大靶低分、小靶高分） ==');
  let sizeOk = true;
  for (let t2 = 0; t2 < 20; t2++) {
    const big = g.calcValueFor(1.15, 10);
    const med = g.calcValueFor(1, 10);
    const small = g.calcValueFor(0.85, 10);
    if (!(big < med && med < small)) sizeOk = false;
  }
  assert(sizeOk, '同基础分 10：大靶 < 中靶 < 小靶（20 轮全成立）');

  console.log('== 重力平滑（抛物线→直箭过渡） ==');
  assert(g.gravFor(100) === 0, '力度 100 → 重力 0（直箭）');
  assert(g.gravFor(50) === g.G, '力度 50 → 满重力');
  assert(g.gravFor(90) === g.G, '力度 90 → 仍满重力');
  assert(g.gravFor(95) < g.gravFor(90), '95 重力低于 90（开始趋直）');
  assert(g.gravFor(99) < g.gravFor(95), '99 重力低于 95（更接近直箭）');
  assert(g.gravFor(99) < 10, '99 重力几乎为 0（' + g.gravFor(99).toFixed(2) + '）');

  console.log('== 星级判定 ==');
  assert(g.calcEarned(true, 0, 0) === 3, '全中 → 3 星');
  assert(g.calcEarned(false, 80, 100) === 2, '命中价值 80% → 2 星');
  assert(g.calcEarned(false, 61, 100) === 1, '命中价值 61% → 1 星');
  assert(g.calcEarned(false, 60, 100) === 1, '恰好 60% → 1 星');
  assert(g.calcEarned(false, 59, 100) === -1, '59% → 失败');

  console.log('== 逐靶命中 → 三星过关 ==');
  const beforeLevel = g.getSave().level;
  const beforeStars = g.getSave().stars;
  let guard = 0;
  while (!g.getHitFlags().every(Boolean) && guard++ < 40 && g.getState() === 'playing') {
    const ti = g.getHitFlags().findIndex(h => !h);
    const combo = findHit(g.getTargets()[ti], g.getObstacles(), g.simulateHit);
    assert(!!combo, '标靶#' + ti + ' 找到可命中组合');
    if (!combo) break;
    g.debugFire(combo.angle, combo.power);
    const hitsBefore = g.getHitFlags().filter(Boolean).length;
    let waited = 0;
    while (g.getHitFlags().filter(Boolean).length === hitsBefore && waited < 700 && g.getState() === 'playing') {
      frames(5); waited += 5;
    }
  }
  assert(g.getHitFlags().every(Boolean), '所有标靶均已命中');
  assert(g.getState() === 'done', '关卡已结束');
  assert(els['result-overlay'].hidden === false, '结算面板弹出');
  assert(els['result-stars'].textContent === '★★★', '三星通过');
  const afterLevel = g.getSave().level;
  const afterStars = g.getSave().stars;
  assert(afterLevel === beforeLevel + 1, '关卡 +1 (' + beforeLevel + '→' + afterLevel + ')');
  assert(afterStars === beforeStars + 3, '星数 +3 (' + beforeStars + '→' + afterStars + ')');

  console.log('== SDK 上报 ==');
  assert(toyCalls.submit.some(r => r.board === 1 && r.score === afterLevel), '上报等级榜（第 ' + afterLevel + ' 关）');
  assert(toyCalls.submit.some(r => r.board === 2 && r.score === afterStars), '上报星数榜（★' + afterStars + '）');

  console.log('== 求助（选单个标靶，不可达不扣次数） ==');
  els['btn-result-next'].dispatch('click');
  await tick();
  assert(g.getState() === 'playing', '进入下一关');
  assert(!g.getHelpUsed(), '新关卡求助未使用');
  g.openHelp();
  assert(els['help-overlay'].hidden === false, '求助面板显示');
  assert(els['help-body'].innerHTML.indexOf('标靶#1') >= 0, '求助列出标靶供选择');
  // 不可达不扣次数：把角度调到极端，找一个当前角度不可达的标靶
  g.setAngle(-85);
  let unIdx = -1;
  for (let i = 0; i < 5; i++) {
    const r = g.targetHelpRange(i, -85);
    if (r.lo < 0) { unIdx = i; break; }
  }
  if (unIdx >= 0) {
    g.pickHelpTarget(unIdx);
    assert(!g.getHelpUsed(), '选不可达标靶 → 不扣求助次数');
    assert(els['help-result'].innerHTML.indexOf('不可达') >= 0, '提示不可达且未扣次数');
  } else {
    console.log('  [skip] 该角度全可达，跳过不可达验证');
  }
  // 选一个可达标靶 → 扣次数并给出力度区间（扫描角度，找一个有靶可达的角度）
  let consumed = false;
  for (let a = -85; a <= 85 && !consumed; a += 5) {
    g.setAngle(a);
    for (let i = 0; i < 5; i++) {
      if (g.getHitFlags()[i]) continue;
      const r = g.targetHelpRange(i, a);
      if (r.lo >= 0) { g.pickHelpTarget(i); consumed = true; break; }
    }
  }
  assert(consumed, '存在可达标靶（角度 ' + Math.round(g.getAngle()) + '°）');
  assert(g.getHelpUsed(), '选可达标靶 → 扣除求助次数');
  assert(els['help-result'].innerHTML.indexOf('力度') >= 0, '给出力度区间');
  els['btn-close-help'].dispatch('click');
  assert(els['help-overlay'].hidden === true, '关闭求助面板');

  console.log('== 全空箭失败 → 星数不扣负 ==');
  g.debugReset();
  await tick();
  els['btn-start'].dispatch('click');
  await tick();
  assert(g.getSave().stars === 0, '重置后星数为 0');
  assert(g.getSave().level === 1, '重置后关卡为 1');
  for (let i = 0; i < 7; i++) g.debugFire(90, 100);   // 垂直向上直箭必不中
  let waitFail = 0;
  while (g.getState() === 'playing' && waitFail < 600) { frames(5); waitFail += 5; }
  assert(g.getState() === 'done', '箭尽后关卡结束');
  assert(els['result-overlay'].hidden === false, '失败结算弹出');
  assert(els['result-stars'].textContent === '☆☆☆', '失败显示空星');
  assert(g.getSave().stars === 0, '星数不为负（仍为 0）');
  assert(g.getSave().level === 1, '失败后关卡不变（仍第 1 关）');

  console.log('== 存档持久化 ==');
  const savedRaw = JSON.parse(storage['shoot_save_v1']);
  assert(typeof savedRaw.level === 'number' && typeof savedRaw.stars === 'number', '存档已写入 localStorage');
  assert(Array.isArray(savedRaw.targets), '存档包含标靶布局');

  console.log('== 首页设置（开关声音） ==');
  els['btn-home'].dispatch('click');
  await tick();
  els['btn-settings'].dispatch('click');
  await tick();
  assert(els['settings-overlay'].hidden === false, '设置面板打开');
  assert(els['btn-sound-toggle'].textContent === '开', '初始音效为开');
  els['btn-sound-toggle'].dispatch('click');
  assert(els['btn-sound-toggle'].textContent === '关', '点击后音效关闭');
  assert(storage['shoot_mute_v1'] === '1', '静音状态已持久化');
  els['btn-close-settings'].dispatch('click');
  assert(els['settings-overlay'].hidden === true, '关闭设置面板');
  els['btn-settings'].dispatch('click');
  els['btn-sound-toggle'].dispatch('click');
  els['btn-close-settings'].dispatch('click');
  assert(els['btn-sound-toggle'].textContent === '开', '再次切换回开');
  // 蓄力速度设置
  els['btn-settings'].dispatch('click');
  await tick();
  els['charge-rate'].value = '60';
  els['charge-rate'].dispatch('input');
  assert(g.getChargeRate() === 60, '调节蓄力速度到 60');
  assert(storage['shoot_charge_v1'] === '60', '蓄力速度已持久化');
  els['btn-close-settings'].dispatch('click');

  console.log('== 排行榜（B站榜） ==');
  els['btn-lb'].dispatch('click');
  await tick();
  assert(toyCalls.rank.length >= 1, '调用 getRankList');
  assert(els['lb-body'].innerHTML.indexOf('玩家甲') >= 0, '榜单渲染出玩家昵称');
  assert(els['lb-body'].innerHTML.indexOf('我') >= 0, '我的排名高亮显示');

  console.log(failed === 0 ? '\n全部通过 ✔' : '\n有 ' + failed + ' 项失败 ✘');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
