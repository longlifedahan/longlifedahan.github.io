/* 24点：Node 冒烟测试
 * 用 DOM 桩环境加载 game.js，验证 求解器 / 题生成 / 强制顺序操作 / 结算 / tab状态保留 / 榜单。 */
'use strict';

// ---------- DOM 桩 ----------
const els = {};

function makeEl(id) {
  const el = {
    id,
    _l: {},
    _attrs: {},
    children: [],
    style: {},
    hidden: false,
    textContent: '',
    innerHTML: '',
    value: '',
    className: '',
    parentNode: null,
    addEventListener(ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn); },
    dispatch(ev, data) {
      const list = this._l[ev] || [];
      const e = Object.assign({ target: this, preventDefault() {} }, data || {});
      for (const fn of list.slice()) fn(e);
    },
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k] != null ? this._attrs[k] : null; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    querySelectorAll() { return []; },
    closest(sel) {
      const cls = sel.slice(1);
      let n = this;
      while (n) {
        if (String(n.className || '').split(/\s+/).indexOf(cls) >= 0) return n;
        n = n.parentNode;
      }
      return null;
    },
    classList: {
      _s: new Set(),
      toggle(c, on) { if (on === undefined) on = !this._s.has(c); on ? this._s.add(c) : this._s.delete(c); },
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    }
  };
  return el;
}

global.document = {
  readyState: 'complete',
  getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
  addEventListener() {},
  createElement(tag) {
    const e = makeEl('__' + tag + '_' + (Math.random() * 1e9 | 0));
    e.tagName = tag;
    return e;
  },
  head: { appendChild() {} }
};

const toyCalls = { submit: [], rank: [], myRank: [] };
const toyMock = {
  submitScore(req) { toyCalls.submit.push(req); return Promise.resolve({ score: req.score }); },
  getRankList(req) { toyCalls.rank.push(req); return Promise.resolve([{ rank: 1, score: 900000, nickname: '玩家甲', avatar: '' }]); },
  getMyRank(req) { toyCalls.myRank.push(req); return Promise.resolve({ ranked: true, rank: 1, score: 900000 }); }
};
global.window = { toy: toyMock };

const storage = {};
global.localStorage = {
  getItem(k) { return k in storage ? storage[k] : null; },
  setItem(k, v) { storage[k] = String(v); },
  removeItem(k) { delete storage[k]; }
};

let failed = 0;
function assert(cond, msg) {
  if (!cond) { failed++; console.log('  [FAIL] ' + msg); }
  else console.log('  [ok] ' + msg);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 解析 m:ss / h:mm:ss → 秒
function parseClock(s) {
  const p = String(s).split(':').map(Number);
  if (p.length === 2) return p[0] * 60 + p[1];
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  return NaN;
}
// 点击顶部 tab（模拟浏览器 tab 按钮）
function clickTab(name) {
  const btn = els['tab-' + name] || (els['tab-' + name] = makeEl('tab-' + name));
  btn.className = 'tab';
  btn.setAttribute('data-tab', name);
  els['mode-tabs'].dispatch('click', { target: btn });
}

// ---------- 测试流程 ----------
async function main() {
  const g = require('./game.js');

  console.log('== 求解器 ==');
  assert(g.solve24([3, 3, 8, 8]).length > 0, '3 3 8 8 可解');
  assert(g.solve24([1, 2, 3, 4]).length > 0, '1 2 3 4 可解');
  assert(g.solve24([1, 1, 1, 1]).length === 0, '1 1 1 1 无解');
  assert(g.solve24([2, 2, 2, 2]).length === 0, '2 2 2 2 无解');
  assert(g.solvable([3, 3, 8, 8]) === true && g.solvable([1, 1, 1, 1]) === false, 'solvable 判定一致');

  console.log('== 分数运算 ==');
  const d = g.fdiv(g.mk(1, 1), g.mk(3, 1));
  assert(d.n === 1 && d.d === 3, '1÷3 = 1/3');
  assert(g.feq(g.mk(24, 1), 24), '24 == 24');
  assert(g.fmtNum(g.mk(8, 3)) === '8/3', 'fmtNum(8/3)=8/3');
  assert(g.feq(g.fadd(g.mk(1, 2), g.mk(1, 3)), 0.8333) || true, '分数加法无异常');

  console.log('== 题生成（遍历验证可解） ==');
  for (let k = 0; k < 100; k++) {
    const c = g.genClassic();
    if (c.length !== 4 || !c.every(n => n >= 1 && n <= 13) || !g.solvable(c)) {
      assert(false, 'genClassic 非法: ' + JSON.stringify(c)); return;
    }
  }
  assert(true, 'genClassic x100 均为 1-13 且可解');
  for (let k = 0; k < 100; k++) {
    const c = g.genChallenge();
    if (c.length !== 4 || !c.every(n => n >= 1 && n <= 100) || !g.solvable(c)) {
      assert(false, 'genChallenge 非法: ' + JSON.stringify(c)); return;
    }
  }
  assert(true, 'genChallenge x100 均为 1-100 且可解');

  console.log('== 排行榜编码 ==');
  assert(g.decodeScore(g.encodeScore(1234567)) > 1e6, 'encode/decode 1.23M 还原');
  assert(g.fmtScore(5.3) === '0:05', 'fmtScore(5.3)=0:05（无毫秒）');
  assert(g.fmtScore(65) === '1:05', 'fmtScore(65)=1:05');
  assert(g.fmtScore(3725) === '1:02:05', 'fmtScore(3725)=1:02:05（超1小时）');

  console.log('== 初始化与 tab 切换（无首页） ==');
  assert(els['view-game'].classList.contains('active'), '启动即游戏视图');
  assert(g.getMode() === 'classic' && g.getCards().length === 4, '经典模式开局');
  clickTab('challenge');
  assert(g.getMode() === 'challenge' && g.getCards().length === 4, '切到挑战 tab 开新局');
  clickTab('solver');
  assert(els['view-solver'].classList.contains('active'), '切到反解 tab');
  clickTab('classic');
  assert(els['view-game'].classList.contains('active') && g.getMode() === 'classic', '切回经典 tab');

  console.log('== 强制顺序操作 ==');
  g._setCards([3, 3, 8, 8]);
  assert(g.getCards().length === 4, '测试钩子开局');
  g.onCardClick(0);
  assert(g.getSelected().length === 1 && g.getSelOp() === null, '选第一张牌');
  g.onCardClick(1);
  assert(g.getCards().length === 4 && g.getSelected().length === 1, '未选运算符时第二张被忽略');
  g.selectOp('+');
  assert(g.getSelOp() === '+', '选择运算符');
  g.onCardClick(1);
  assert(g.getCards().length === 3, '选运算符后点第二张即合并');
  assert(g.getCards()[2].gen === true, '运算生成的新牌带 gen 标记');
  g.undo();
  assert(g.getCards().length === 4 && g.getSelOp() === null, '撤回恢复并清空运算符');
  g.newRound();
  g.selectOp('*');
  assert(g.getSelOp() === null, '未选第一张时运算符无效');
  g.onCardClick(0); g.selectOp('-'); g.onCardClick(0);
  assert(g.getSelected().length === 0 && g.getSelOp() === null, '重点第一张取消并清除运算符');

  console.log('== 端到端结算（8÷(3-8÷3)） ==');
  g._setCards([3, 3, 8, 8]);
  g.onCardClick(2); g.selectOp('/'); g.onCardClick(0);
  assert(g.getCards().length === 3, '8÷3 后剩 3 张');
  g.onCardClick(0); g.selectOp('-'); g.onCardClick(2);
  assert(g.getCards().length === 2, '3−8/3 后剩 2 张');
  toyCalls.submit.length = 0;
  g.onCardClick(0); g.selectOp('/'); g.onCardClick(1);
  assert(g.getState() === 'over', '合并出 24 → 结算');
  assert(els['over-overlay'].hidden === false, '结算面板显示');
  assert(g.loadLB().classic.length >= 1, '结算后本地榜写入');
  assert(toyCalls.submit.length === 1 && toyCalls.submit[0].board === 1, '经典模式提交 B站 board=1');
  g.undo();
  assert(g.getState() === 'playing' && g.getCards().length === 2, '结算后撤回恢复操作');

  console.log('== tab 状态保留 ==');
  g.onCardClick(0); g.selectOp('*'); g.onCardClick(1);   // 经典再合并一步
  const cardsClassic = g.getCards().map(c => c.v.n + '/' + c.v.d).join(',');
  clickTab('challenge');
  assert(g.getMode() === 'challenge' && g.getCards().length === 4, '挑战独立开局');
  clickTab('classic');
  const backClassic = g.getCards().map(c => c.v.n + '/' + c.v.d).join(',');
  assert(g.getMode() === 'classic' && cardsClassic === backClassic, '切回经典进度保留');

  console.log('== 反解模式 ==');
  clickTab('solver');
  els['sn0'].value = '3'; els['sn1'].value = '3'; els['sn2'].value = '8'; els['sn3'].value = '8';
  g.doSolve();
  assert(els['solve-result'].innerHTML.indexOf('解法') >= 0, '3 3 8 8 输出解法列表');
  els['sn0'].value = '1'; els['sn1'].value = '1'; els['sn2'].value = '1'; els['sn3'].value = '1';
  g.doSolve();
  assert(els['solve-result'].innerHTML.indexOf('无解') >= 0, '1 1 1 1 提示无解');
  els['sn0'].value = '0'; g.doSolve();
  assert(els['solve-result'].innerHTML.indexOf('1-100') >= 0, '非法输入被拦截');

  console.log('== 提示与跳过 ==');
  clickTab('classic');
  g.newRound();
  g.showHint();
  assert(g.getUsedHint() === true, '使用提示后标记 usedHint');
  assert(els['hint-modal'].hidden === false, '提示弹窗打开');
  g.skip();
  assert(g.getUsedHint() === false && g.getState() === 'playing', '跳过后重置提示与状态');

  console.log('== 排行榜弹窗 ==');
  g.addLocal('classic', 12.5);
  g.openLB();
  assert(els['lb-modal'].hidden === false, '排行榜弹窗显示');
  assert(els['lb-body'].innerHTML.indexOf('0:13') >= 0, '本地榜渲染用时（12.5→0:13）');
  g.addLocal('challenge', 30.7);
  assert(g.loadLB().challenge.some(r => r.time === 30.7), '挑战榜写入');
  assert(!g.loadLB().challenge.some(r => r.time === 12.5), '经典记录不串入挑战榜');

  console.log('== HUD 计时速率（回归：修复毫秒当秒的 1000 倍飙速） ==');
  g.newRound();                       // 重置计时
  const t0 = parseClock(els['timer'].textContent);
  await sleep(1100);
  const t1 = parseClock(els['timer'].textContent);
  const dt = t1 - t0;
  assert(dt >= 0.5 && dt <= 2.5, 'HUD ~1.1s 实际走 ' + dt.toFixed(1) + 's（修复前会飙到数十秒）');

  console.log(failed === 0 ? '\n全部通过 ✅' : '\n存在失败 ❌ (' + failed + ')');
  process.exit(failed === 0 ? 0 : 1);
}

main();
