/* 大鱼吃小鱼：Node 冒烟测试
 * 用 DOM 桩环境加载 game.js，驱动游戏循环运行若干帧，
 * 验证 初始化 / 开始游戏 / 指针控制 / 碰撞结算 不抛异常。 */
'use strict';

// ---------- DOM 桩 ----------
const els = {};

// 2D 上下文桩：记录所有调用，模拟渐变对象
function makeCtx() {
  const noop = () => {};
  const grad = { addColorStop: noop };
  return {
    clearRect: noop, save: noop, restore: noop, translate: noop, rotate: noop,
    scale: noop, fillRect: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, quadraticCurveTo: noop, arc: noop,
    ellipse: noop, fill: noop, stroke: noop, strokeText: noop, fillText: noop,
    setTransform: noop,
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
    style: {},
    hidden: false,
    textContent: '',
    innerHTML: '',
    clientWidth: 112,
    clientHeight: 112,
    getBoundingClientRect() { return { width: 375, height: 667, left: 0, top: 0 }; },
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
    return { set src(v) { this._src = v; }, get src() { return this._src; }, async: false, onload: null, onerror: null, head: null };
  },
  head: { appendChild() {} },
  hidden: false
};
function keySpace() {
  (docListeners['keydown'] || []).forEach(fn => fn({ code: 'Space', key: ' ', preventDefault() {} }));
}

const toyCalls = { submit: [], rank: [], myRank: [] };
const toyMock = {
  submitScore(req) { toyCalls.submit.push(req); return Promise.resolve({ score: req.score }); },
  getRankList(req) { toyCalls.rank.push(req); return Promise.resolve([{ rank: 1, score: 81000, nickname: '玩家甲', avatar: '' }]); },
  getMyRank(req) { toyCalls.myRank.push(req); return Promise.resolve({ ranked: true, rank: 1, score: 81000 }); }
};
global.window = {
  devicePixelRatio: 1,
  innerWidth: 375,
  innerHeight: 667,
  addEventListener() {},
  toy: toyMock
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

// 假时钟：模拟 60fps 真实流逝
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

let failed = 0;
function assert(cond, msg) {
  if (!cond) { failed++; console.log('  [FAIL] ' + msg); }
  else console.log('  [ok] ' + msg);
}

// ---------- 测试流程 ----------
async function main() {
  console.log('== 模块加载与初始化 ==');
  const g = require('./game.js');
  assert(!!g && typeof g.encodeScore === 'function', 'game.js 导出纯函数');
  assert(typeof rafCb === 'function', '游戏主循环已启动');
  frames(5);

  console.log('== 开始游戏 ==');
  els['btn-start'].dispatch('click');
  await tick();          // 等 setTimeout(resize+resetGame) 执行
  assert(els['view-game'].classList.contains('active'), '已切换到游戏页');
  assert(els['over-overlay'].hidden === true, '结算面板隐藏');
  frames(2);             // 开局仅 2 帧，尽量避开死亡后再测暂停

  console.log('== 敌人只在边缘生成 ==');
  const fl = g.fishList();
  const centerOk = fl.every(f =>
    !(f.x > 375 * 0.25 && f.x < 375 * 0.75 && f.y > 667 * 0.25 && f.y < 667 * 0.75));
  assert(centerOk, '无鱼在画面中央区域生成（' + fl.length + ' 条均在边缘）');

  console.log('== 暂停 / 恢复（开局即测） ==');
  els['btn-pause'].dispatch('click');
  assert(els['pause-overlay'].hidden === false, '暂停面板显示');
  const t1 = els['hud-time'].textContent;
  frames(120);           // 暂停 2s，计时应冻结
  const t2 = els['hud-time'].textContent;
  assert(t1 === t2, '暂停期间计时停止 (' + t1 + ' -> ' + t2 + ')');
  els['btn-resume'].dispatch('click');
  assert(els['pause-overlay'].hidden === true, '恢复后隐藏');
  frames(120);           // 恢复 2s，计时应继续
  const t3 = els['hud-time'].textContent;
  assert(t3 !== t2 || els['over-overlay'].hidden === false, '恢复后计时继续 (' + t2 + ' -> ' + t3 + ')');

  console.log('== 空格暂停 / 恢复 ==');
  const aliveS = g.getState() === 'playing';
  keySpace();
  assert(!aliveS || els['pause-overlay'].hidden === false, '空格暂停' + (aliveS ? '' : '（已死亡跳过）'));
  if (aliveS) {
    keySpace();
    assert(els['pause-overlay'].hidden === true, '空格恢复');
  }

  // 辅助：用鼠标把鱼拉到指定位置附近
  function nudge(x, y) {
    els['game'].dispatch('pointermove', { pointerType: 'mouse', clientX: x, clientY: y });
    frames(30);
  }

  console.log('== 鼠标跟随指针（移动即跟随） ==');
  nudge(100, 400);                    // 先把鱼拉到左侧
  const f0 = g.playerPos();
  els['game'].dispatch('pointermove', { pointerType: 'mouse', clientX: 330, clientY: 400 });
  frames(15);
  const f1 = g.playerPos();
  const aliveF = g.getState() === 'playing';
  assert(!aliveF || f1.x > f0.x + 3, '鼠标右移后鱼向右跟随 (' + f0.x.toFixed(1) + ' -> ' + f1.x.toFixed(1) + ')' + (aliveF ? '' : '（已死亡跳过）'));

  console.log('== 触屏跟随手指 ==');
  nudge(300, 300);                    // 拉到右侧
  const m0 = g.playerPos();
  els['game'].dispatch('pointerdown', { pointerId: 9, clientX: 100, clientY: 300 });
  els['game'].dispatch('pointermove', { pointerId: 9, clientX: 100, clientY: 300 });  // 目标在左侧
  frames(15);
  const m1 = g.playerPos();
  const aliveM = g.getState() === 'playing';
  assert(!aliveM || m1.x < m0.x, '触屏按住时鱼向左跟随 (' + m0.x.toFixed(1) + ' -> ' + m1.x.toFixed(1) + ')' + (aliveM ? '' : '（已死亡跳过）'));
  els['game'].dispatch('pointerup', { pointerId: 9 });
  frames(3);

  console.log('== touch 事件回退（无 pointer 事件时） ==');
  nudge(300, 300);
  const tp0 = g.playerPos();
  els['game'].dispatch('touchstart', { touches: [{ clientX: 100, clientY: 300 }] });
  els['game'].dispatch('touchmove', { touches: [{ clientX: 100, clientY: 300 }] });
  frames(15);
  const tp1 = g.playerPos();
  const aliveT = g.getState() === 'playing';
  assert(!aliveT || tp1.x < tp0.x, 'touchstart/move 后鱼向左跟随 (' + tp0.x.toFixed(1) + ' -> ' + tp1.x.toFixed(1) + ')' + (aliveT ? '' : '（已死亡跳过）'));
  els['game'].dispatch('touchend', { touches: [] });
  frames(3);

  console.log('== 底部摇杆控制 ==');
  nudge(330, 300);
  const j0 = g.playerPos();
  els['joy'].dispatch('pointerdown', { pointerId: 5, clientX: 200, clientY: 300 });
  els['joy'].dispatch('pointermove', { pointerId: 5, clientX: 120, clientY: 300 });   // 向左推
  frames(15);
  const j1 = g.playerPos();
  const aliveJ = g.getState() === 'playing';
  assert(!aliveJ || j1.x < j0.x, '摇杆向左推后鱼向左移动 (' + j0.x.toFixed(1) + ' -> ' + j1.x.toFixed(1) + ')' + (aliveJ ? '' : '（已死亡跳过）'));
  els['joy'].dispatch('pointerup', { pointerId: 5 });
  frames(3);

  console.log('== 指针控制 ==');
  els['game'].dispatch('pointerdown', { pointerId: 1, clientX: 320, clientY: 120 });
  els['game'].dispatch('pointermove', { pointerId: 1, clientX: 330, clientY: 140 });
  frames(30);
  els['game'].dispatch('pointerup', { pointerId: 1 });
  frames(5);

  console.log('== 边界约束（玩家不能游出画面） ==');
  els['game'].dispatch('pointerdown', { pointerId: 11, clientX: 200, clientY: 300 });
  els['game'].dispatch('pointermove', { pointerId: 11, clientX: 520, clientY: 300 });  // 向右狂拖
  frames(90);
  const pe = g.playerPos();
  assert(pe.x <= 370 && pe.x >= 5, '玩家被边界约束 (x=' + pe.x.toFixed(1) + ')');
  els['game'].dispatch('pointerup', { pointerId: 11 });

  console.log('== 排行榜弹窗 ==');
  els['btn-open-lb'].dispatch('click');
  assert(els['lb-modal'].hidden === false, '排行榜弹窗显示');
  els['btn-close-lb'].dispatch('click');
  assert(els['lb-modal'].hidden === true, '排行榜弹窗关闭');

  console.log('== 长时间运行（碰撞/死亡路径 + 分数只增不减） ==');
  try {
    // 驱动 40s 的帧（每帧 ~16.7ms），期间可能触发吞噬/减半/死亡结算
    const FPS = 60, SECONDS = 40;
    let prevScore = -Infinity;
    for (let s = 0; s < SECONDS; s++) {
      frames(FPS);
      if (s % 5 === 0) {
        const pi = g.playerInfo();
        if (pi.score < prevScore) {
          failed++;
          console.log('  [FAIL] 分数递减 ' + prevScore + ' -> ' + pi.score);
        }
        prevScore = pi.score;
      }
    }
    assert(true, '40s 帧循环无异常');
    if (els['over-overlay'].hidden === false) {
      // 已游戏结束：本地榜应已写入
      const raw = storage['fish.lb'];
      assert(!!raw, '游戏结束已写入本地榜');
      if (raw) {
        const arr = JSON.parse(raw);
        const list = arr[g.getDifficulty()] || [];
        assert(list.length >= 1 && list[0].score >= 0, '本地榜含分数 ' + list[0].score);
        const pi = g.playerInfo();
        assert(list[0].score === pi.score, '排行榜分数=结算分数（吃鱼累加） ' + pi.score);
      }
    } else {
      console.log('  [info] 40s 内未触发死亡（此局存活较久）');
    }
  } catch (e) {
    failed++;
    console.log('  [FAIL] 运行异常: ' + e.message);
  }

  console.log('== 难度分榜与周期过滤 ==');
  const saveDiff = g.getDifficulty();
  g.saveDifficulty('hell');
  g.addLocal(888, 1);
  g.saveDifficulty('easy');
  g.addLocal(7, 2);
  const lb2 = g.loadLB();
  assert(lb2.hell.some(r => r.score === 888), '地狱榜写入 hell');
  assert(lb2.easy.some(r => r.score === 7), '简单榜写入 easy');
  assert(!lb2.easy.some(r => r.score === 888), '分数不串榜');
  g.saveDifficulty(saveDiff);
  assert(g.DIFFS.easy.scale === 0.50 && g.DIFFS.normal.scale === 0.70 &&
         g.DIFFS.hard.scale === 0.85 && g.DIFFS.hell.scale === 1.00, '难度判定箱配置正确(50/70/85/100)');
  assert(g.needSmallFromNums([11, 12, 13, 14, 15, 16], 10) === true, '无小鱼时强制补小鱼');
  assert(g.needSmallFromNums([1, 2, 3, 11, 12, 13], 10) === false, '小鱼占比足则不强制');
  assert(g.needSmallFromNums([11, 12, 13], 10) === false, '鱼太少不干预');

  console.log('== 本地榜旧格式迁移 ==');
  // 模拟旧版无难度区分的数组格式
  storage['fish.lb'] = JSON.stringify([{ score: 50, time: 10, ts: Date.now() }]);
  g.saveDifficulty('normal');
  g.addLocal(999, 20);
  const lbAfter = JSON.parse(storage['fish.lb']);
  assert(!Array.isArray(lbAfter), '保存为对象结构（非旧数组）');
  assert(lbAfter.normal.some(r => r.score === 999), '新记录已写入 normal');
  assert(lbAfter.normal.some(r => r.score === 50), '旧记录迁移保留在 normal');

  console.log('== B站 算法（提交 / 展示还原） ==');
  toyCalls.submit.length = 0;
  g.saveDifficulty('normal');
  g.submitGlobal(123456);
  assert(toyCalls.submit.length === 1, 'submitScore 只调用一次');
  const sub = toyCalls.submit[0];
  assert(sub.board === 1, '普通难度 board=1');
  assert(sub.score === g.encodeScore(123456), '分数已编码 ' + sub.score);
  assert(!('period' in sub), 'submitScore 不传 period（SDK 无此字段）');
  g.saveDifficulty('hell');
  g.submitGlobal(99);
  assert(toyCalls.submit.length === 2 && toyCalls.submit[1].board === 3, '地狱难度 board=3');
  g.saveDifficulty('easy');
  g.submitGlobal(99);
  assert(toyCalls.submit.length === 2, '简单模式不提交 B站');
  g.saveDifficulty(saveDiff);
  // 展示还原：编码分 81000 = 1e8
  assert(g.decodeScore(81000) === 1e8, 'decodeScore(81000)=1e8');
  assert(g.fmt(g.decodeScore(81000)) === '1亿', 'B站榜展示还原为 1亿');

  console.log('== 纯函数回归 ==');
  assert(g.encodeScore(1e8) === 81000, 'encodeScore(1e8)=' + g.encodeScore(1e8));
  assert(g.decodeScore(81000) === 1e8, 'decodeScore(81000)=' + g.decodeScore(81000));
  assert(g.fmt(12345) === '1.2万', 'fmt(12345)=' + g.fmt(12345));
  assert(g.fmt(1.5e8) === '1.5亿', 'fmt(1.5e8)=' + g.fmt(1.5e8));
  assert(g.fmt(1.5e15) === '1500万亿', 'fmt(1.5e15)=' + g.fmt(1.5e15));
  assert(g.fmt(2e17) === '2*10^17', 'fmt(2e17)=' + g.fmt(2e17));

  console.log(failed === 0 ? '\n全部通过 ✅' : '\n存在失败 ❌ (' + failed + ')');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
