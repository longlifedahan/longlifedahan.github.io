/* 手速测试 · Node 逻辑单测（不需要浏览器） */
'use strict';

// ---- 最小 DOM / localStorage 桩 ----
function makeEl() {
  return {
    hidden: false,
    textContent: '',
    innerHTML: '',
    value: '',
    style: {},
    classList: { toggle: function () {}, add: function () {}, remove: function () {} },
    addEventListener: function () {},
    appendChild: function () {},
    querySelectorAll: function () { return []; },
    getAttribute: function () { return null; },
    setAttribute: function () {}
  };
}
var elCache = {};
var storage = {};
global.document = {
  readyState: 'complete',
  getElementById: function (id) {
    if (!elCache[id]) elCache[id] = makeEl();
    return elCache[id];
  },
  createElement: function () { return makeEl(); },
  head: makeEl(),
  addEventListener: function () {}
};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function (k, v) { storage[k] = String(v); },
  removeItem: function (k) { delete storage[k]; }
};
global.window = {};

var G = require('./game.js');
var assert = require('assert');

// ---- 段位边界 ----
function tRank(errSec, expect, label) {
  assert.strictEqual(G.rankOf(errSec).name, expect, label + '（误差 ' + errSec + 's 应为 ' + expect + '）');
}
tRank(0, '王者', '边界0');
tRank(0.005, '王者', '0-0.01区间');
tRank(0.0099, '王者', '接近0.01');
tRank(0.01, '宗师', '0.01边界');
tRank(0.02, '宗师', '0.01-0.03区间');
tRank(0.03, '大师', '0.03边界');
tRank(0.05, '大师', '0.03-0.1区间');
tRank(0.1, '钻石', '0.1边界');
tRank(0.15, '钻石', '0.1-0.2区间');
tRank(0.2, '白金', '0.2边界');
tRank(0.25, '白金', '0.2-0.3区间');
tRank(0.3, '黄金', '0.3边界');
tRank(0.35, '黄金', '0.3-0.4区间');
tRank(0.4, '白银', '0.4边界');
tRank(0.45, '白银', '0.4-0.5区间');
tRank(0.5, '青铜', '0.5边界');
tRank(0.75, '青铜', '0.5-1区间');
tRank(1.0, '黑铁', '1.0边界');
tRank(2.5, '黑铁', '1s以上');
console.log('[OK] 段位边界 19 项全部通过');

// ---- 全局榜分数编码 ----
assert.strictEqual(G.fmtGlobalErr(G.SCORE_BASE - 23), '0.023s', '分数→误差 23ms');
assert.strictEqual(G.fmtGlobalErr(G.SCORE_BASE - 1500), '1.500s', '分数→误差 1500ms');
assert.strictEqual(G.fmtGlobalErr(0), '-', '极端分数显示为-');
assert.strictEqual(G.fmtGlobalErr(G.SCORE_BASE), '0.000s', '满分=0误差');
// 误差越小编码分数越高
var s1 = G.SCORE_BASE - 20, s2 = G.SCORE_BASE - 500;
assert.ok(s1 > s2, '误差小→分数高');
console.log('[OK] 全局榜编码 5 项全部通过');

// ---- 本地榜 top50 与排序 ----
storage = {};  // 清空本地存储
var rng = 0;
function rndErr() {
  rng = (rng * 1103515245 + 12345) & 0x7fffffff;
  return rng % 9000;  // 0 ~ 9000ms
}
for (var i = 0; i < 70; i++) G.addLocalResult(G.MODE_CD, rndErr(), 10);
for (var j = 0; j < 70; j++) G.addLocalResult(G.MODE_CU, rndErr(), 8);

var lb = G.loadLB();
assert.strictEqual(lb.m1.length, 50, '倒计时本地只保留 50 条');
assert.strictEqual(lb.m2.length, 50, '正计时本地只保留 50 条');
for (var k = 1; k < lb.m1.length; k++) {
  assert.ok(lb.m1[k].err >= lb.m1[k - 1].err, '倒计时升序排序（误差小在前）');
}
for (var m = 1; m < lb.m2.length; m++) {
  assert.ok(lb.m2[m].err >= lb.m2[m - 1].err, '正计时升序排序（误差小在前）');
}
assert.strictEqual(lb.m1[0].err, Math.min.apply(null, lb.m1.map(function (e) { return e.err; })), '榜首=最小误差');
// 两个玩法互不影响
assert.strictEqual(lb.m1[0].x, 10, '倒计时记录的 x=10');
assert.strictEqual(lb.m2[0].x, 8, '正计时记录的 x=8');
console.log('[OK] 本地榜 top50 与排序 7 项全部通过');

// ---- 设置加载 ----
var G2 = (function () {
  delete require.cache[require.resolve('./game.js')];
  storage = { 'timetest.settings': JSON.stringify({ mode: 2, x: 99 }) };
  return require('./game.js');
})();
assert.strictEqual(G2.settings.mode, G2.MODE_CU, 'mode=2 正计时');
assert.strictEqual(G2.settings.x, G2.X_MAX, 'x=99 被钳制到 10');
delete require.cache[require.resolve('./game.js')];
storage = { 'timetest.settings': JSON.stringify({ mode: 1, x: 3 }) };
var G3 = require('./game.js');
assert.strictEqual(G3.settings.x, G3.X_MIN, 'x=3 即下限');
storage = { 'timetest.settings': 'bad json' };
delete require.cache[require.resolve('./game.js')];
var G4 = require('./game.js');
assert.strictEqual(G4.settings.mode, G4.MODE_CD, '脏数据回退默认 倒计时');
assert.strictEqual(G4.settings.x, 5, '脏数据回退默认 x=5');
console.log('[OK] 设置钳制与回退 4 项全部通过');

console.log('\n全部 ' + (19 + 5 + 7 + 4) + ' 项断言通过');
