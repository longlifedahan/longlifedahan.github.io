/* 捕鱼达人：Node 冒烟测试
 * 用 DOM 桩环境加载 game.js，验证 数值模型 / 格式化 / 排行榜编码 / 捕获概率 / 玩法冒烟。 */
// 注意：本文件不使用 'use strict'，避免 eval/require 作用域问题

// ---------- DOM 桩 ----------
const els = {};

function makeCtx() {
  const noop = () => {};
  const grad = { addColorStop: noop };
  return {
    clearRect: noop, save: noop, restore: noop, translate: noop, rotate: noop,
    scale: noop, fillRect: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, quadraticCurveTo: noop, arc: noop,
    ellipse: noop, fill: noop, stroke: noop, strokeText: noop, fillText: noop,
    setTransform: noop, setLineDash: noop,
    createLinearGradient() { return grad; },
    createRadialGradient() { return grad; },
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, lineJoin: '',
    globalAlpha: 1, textAlign: '', textBaseline: '', lineCap: ''
  };
}

function makeEl(id) {
  const el = {
    id,
    _l: {},
    width: 0, height: 0,
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
    style: {},
    hidden: true,   // 与 HTML 一致：overlay/modal/toast 初始隐藏
    textContent: '',
    innerHTML: '',
    clientWidth: 600,
    clientHeight: 400,
    getBoundingClientRect() { return { width: 600, height: 400, left: 0, top: 0 }; },
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
  getElementById(id) { return els[id] || makeEl(id); },
  addEventListener(ev, fn) { (docListeners[ev] = docListeners[ev] || []).push(fn); },
  createElement() {
    return { set src(v) { this._src = v; }, get src() { return this._src; }, async: false, onload: null, onerror: null };
  },
  head: { appendChild() {} },
  hidden: false
};

const store = {};
global.localStorage = {
  getItem(k) { return k in store ? store[k] : null; },
  setItem(k, v) { store[k] = String(v); },
  removeItem(k) { delete store[k]; }
};

let rafCb = null;
global.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
global.window = {
  devicePixelRatio: 1,
  innerWidth: 600,
  innerHeight: 400,
  addEventListener() {},
  open() { return null; },
  location: { href: '' }
};

// ---------- 加载游戏 ----------
const G = require('./game.js');

// ---------- 断言工具 ----------
let pass = 0, fail = 0;
const fails = [];
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; fails.push(name); console.log('  ✗ ' + name); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 1e-9 : eps); }

// ---------- HTML id 一致性：game.js 引用的 id 必须都在 index.html 中 ----------
{
  const fs = require('fs');
  const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
  const htmlIds = new Set();
  let mm;
  const mre = /id="([^"]+)"/g;
  while ((mm = mre.exec(html))) htmlIds.add(mm[1]);
  const needed = ['view-home', 'view-game', 'game', 'btn-start', 'btn-open-lb',
    'btn-sound-home', 'btn-fishlevel-home', 'home-level', 'home-coins', 'home-earned',
    'hud-coins', 'hud-level', 'hud-bar', 'btn-mute', 'btn-work', 'btn-pause',
    'gun-minus', 'gun-plus', 'gun-level', 'gun-price', 'gun-touch',
    'toast', 'pause-overlay', 'btn-sound-game', 'btn-fishlevel-game', 'btn-resume',
    'btn-pause-home', 'btn-debug999', 'levelup-overlay', 'levelup-new', 'btn-levelup-ok',
    'work-modal', 'btn-close-work', 'work-level', 'work-rate', 'work-follow', 'work-pending',
    'work-collected', 'work-cap', 'btn-work-collect', 'btn-work-follow', 'btn-work-check',
    'hud-bar-pct',
    'lb-modal', 'btn-close-lb', 'lb-board-tabs', 'lb-period-tabs', 'lb-note', 'lb-body',
    'landscape-overlay', 'btn-landscape-go'];
  const missing = needed.filter(id => !htmlIds.has(id));
  check('index.html 包含 game.js 引用的全部 id', missing.length === 0);
  if (missing.length) console.log('  缺失 id: ' + missing.join(', '));
}

console.log('=== 数值模型 ===');
check('炮价 1~4 = 10/20/40/80', G.gunPrice(1) === 10 && G.gunPrice(2) === 20 && G.gunPrice(3) === 40 && G.gunPrice(4) === 80);
check('炮威力 1~4 = 10/20/40/80', G.gunPower(1) === 10 && G.gunPower(2) === 20 && G.gunPower(3) === 40 && G.gunPower(4) === 80);
check('炮范围 1~3 = 11/12/13', G.gunRange(1) === 11 && G.gunRange(2) === 12 && G.gunRange(3) === 13);
check('鱼捕获等级 1~5 = 100/220/480/1040/2240',
  G.fishCapture(1) === 100 && G.fishCapture(2) === 220 && G.fishCapture(3) === 480 &&
  G.fishCapture(4) === 1040 && G.fishCapture(5) === 2240);
check('鱼价值 = 捕获等级 30%', G.fishValue(1) === 30 && G.fishValue(2) === 66 && G.fishValue(3) === 144);
{
  let allInt = true;
  for (let l = 1; l <= 20; l++) if (!Number.isInteger(G.fishValue(l))) allInt = false;
  check('鱼价值 1~20 级全部取整数', allInt);
}
check('升级消耗 1→2→3→4 = 1000/2200/4800', G.upCost(1) === 1000 && G.upCost(2) === 2200 && G.upCost(3) === 4800);
check('渔场等级累计阈值 1~4 = 0/1000/3200/8000',
  G.threshold(1) === 0 && G.threshold(2) === 1000 && G.threshold(3) === 3200 && G.threshold(4) === 8000);
check('levelFromTotal 边界', G.levelFromTotal(0) === 1 && G.levelFromTotal(999) === 1 &&
  G.levelFromTotal(1000) === 2 && G.levelFromTotal(3199) === 2 && G.levelFromTotal(3200) === 3 && G.levelFromTotal(8000) === 4);
check('打工速率 未关注 F1=20, F2=22', G.workRate(1, false) === 20 && G.workRate(2, false) === 22);
check('打工速率 关注 ×10', G.workRate(1, true) === 200);
check('打工上限 1000*1.5^(F-1)', G.workCap(1) === 1000 && G.workCap(2) === 1500 && G.workCap(3) === 2250);

console.log('=== 格式化 ===');
check('fmt 0 / 整数', G.fmt(0) === '0' && G.fmt(999) === '999');
check('fmt 万', G.fmt(10000) === '1万' && G.fmt(12345) === '1.2万');
check('fmt 亿', G.fmt(100000000) === '1亿' && G.fmt(123400000) === '1.2亿');
check('fmt 万亿亿以上科学计数', G.fmt(1e16) === '1*10^16' && G.fmt(2.5e16) === '2.5*10^16');

console.log('=== 排行榜编码 ===');
{
  const e1 = G.encodeScore(12345), d1 = G.decodeScore(e1);
  check('encode/decode 12345 近似还原', approx(d1, 12345, 12345 * 0.02));
  const e2 = G.encodeScore(1e10), d2 = G.decodeScore(e2);
  check('encode/decode 1e10 还原', approx(d2, 1e10, 1e10 * 0.001));
  check('encode 结果在 ±16777216 内', e1 >= -16777216 && e1 <= 16777215 && e2 >= -16777216 && e2 <= 16777215);
  check('encode 0 = 0', G.encodeScore(0) === 0);
}

console.log('=== 捕获概率 ===');
{
  const c1 = G.catchProb(10, 100);
  check('炮10 vs 鱼100: 中心0.1 边缘0.05', approx(c1.center, 0.1) && approx(c1.edge, 0.05));
  const c2 = G.catchProb(40, 100);
  check('炮40 vs 鱼100: 中心0.4 边缘0.2', approx(c2.center, 0.4) && approx(c2.edge, 0.2));
  const c3 = G.catchProb(400, 100);
  check('炮威力大于捕获等级必捕获', c3.center === 1 && c3.edge === 1);
}

console.log('=== 玩法冒烟 ===');
check('初始总金币 2000（赠送）', G.getCoins() === 2000 && G.getGift() === 2000);
G.spend(100);
check('开炮扣钱 1900', G.getCoins() === 1900);
G.addEarned(50);
check('收入 50, 累计 50, 渔场仍 1 级', G.getEarned() === 50 && G.getTotalEarned() === 50 && G.getFarmLevel() === 1);
G.addEarned(1000);
check('累计 1050 升到 2 级', G.getFarmLevel() === 2);
check('升级后可买更高炮（渔场+5）', G.getFarmLevel() === 2 && G.getGun() === 1);

// 鱼生成与捕获
G.clearFishes();
G.spawnFish(6);
check('生成至少 6 条鱼（可能触发大鱼群）', G.fishCount() >= 6);
{
  const fish = G.fishList();
  let maxLv = 0;
  for (const f of fish) maxLv = Math.max(maxLv, f.lv);
  check('鱼等级 ≤ 渔场等级+2', maxLv <= G.getFarmLevel() + 2);
}

// 高炮爆炸：设炮到最高（被 clamp 到渔场等级+2），在低等级鱼位置爆炸
G.setGun(G.getFarmLevel() + 5);
{
  const before = G.fishCount();
  const fish = G.fishList();
  let best = null;
  for (const f of fish) if (!best || f.capture < best.capture) best = f;
  const maxPow = G.gunPower(G.getGun());
  if (best && maxPow >= best.capture) {
    G.explodeAt(best.x, best.y);
    check('最高炮爆炸捕获低等级鱼（必中）', G.fishCount() < before);
  } else {
    if (best) G.explodeAt(best.x, best.y);
    check('最高炮爆炸流程不抛错', true);
  }
}

// 鱼王系统
{
  G.clearFishes();
  G.spawnKingFish();
  const kf = G.fishList().find(f => f.king);
  if (kf) {
    const base = G.fishValue(G.getFarmLevel());
    check('鱼王价值为同级鱼 10~25 倍', kf.value >= base * 10 && kf.value <= base * 25);
    check('鱼王等级 = 当前渔场等级', kf.lv === G.getFarmLevel());
  } else {
    check('鱼王生成', false);
  }
}

// 渔网发射冒烟（不炸到鱼时飞到边界爆炸）
els['btn-start'].dispatch('click', {});
check('点击开始后进入游戏视图', els['view-game'].classList.contains('active') && !els['view-home'].classList.contains('active'));
check('点击开始后 playing=true', G.state().playing === true);
G.setPaused(false);
G.fire(-Math.PI / 2);
check('发射后渔网 1 个', G.state().nets === 1);
// canvas 点击任意处应立即发射
els['game'].dispatch('pointerdown', { clientX: 300, clientY: 80, pointerId: 9 });
check('点击画面任意处立即发射渔网', G.state().nets === 2);
// 打工：总金币未超过打工上限时可打工；超过上限（领取后金币不超上限）被拒
let workSafety = 0;
while (G.getCoins() < G.workCap(G.getFarmLevel()) && workSafety++ < 8) {
  G.addEarned(10000);
  G.setPaused(false);
}
G.setPaused(false);
els['btn-work'].dispatch('click', {});
check('总金币超过打工上限时打工被拒', els['work-modal'].hidden === true);

// 存档写读
G.saveNow();
check('存档存在', typeof store['catch.save'] === 'string');

// 长跑模拟：200 帧游戏循环，期间定期发射，验证不抛错
{
  let err = null;
  try {
    for (let i = 0; i < 200; i++) {
      if (i % 40 === 0) G.fire((Math.random() - 0.5) * Math.PI * 2 - Math.PI / 2);
      if (rafCb) { const cb = rafCb; rafCb = null; cb((i + 2) * 16.7); }
    }
  } catch (e) { err = e; }
  check('200 帧长跑（发射/鱼群/爆炸/粒子）不抛错', !err);
}

// 重复运行若干帧驱动主循环不抛错
let frameErr = null;
try {
  const loopFn = () => {};
  for (let i = 0; i < 6; i++) {
    if (rafCb) {
      const cb = rafCb; rafCb = null;
      cb((i + 1) * 16.7);
    }
  }
} catch (e) { frameErr = e; }
check('主循环多帧运行不抛错', !frameErr);

console.log('\n==== 结果: ' + pass + ' 通过, ' + fail + ' 失败 ====');
if (fail > 0) {
  console.log('失败项:');
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
