/**
 * sim.js —— 引擎 + UI 集成冒烟（Node 沙箱内模拟浏览器环境）
 * 运行：node sim.js
 * 作用：驱动数百帧游戏循环，并模拟 UI 按钮点击，确保运行时无异常。
 */
'use strict';
var fs = require('fs');
var vm = require('vm');

// ---------- 引擎环境桩 ----------
var grad = { addColorStop: function () {} };
var ctx = {
  save: function () {}, restore: function () {}, translate: function () {}, rotate: function () {},
  drawImage: function () {}, clearRect: function () {}, fillRect: function () {}, strokeRect: function () {},
  stroke: function () {}, beginPath: function () {}, arc: function () {}, fill: function () {}, fillText: function () {}, strokeText: function () {},
  measureText: function () { return { width: 10 }; },
  moveTo: function () {}, lineTo: function () {}, closePath: function () {},
  bezierCurveTo: function () {}, quadraticCurveTo: function () {},
  createLinearGradient: function () { return grad; }, setLineDash: function () {}
};
var canvasStub = {
  getContext: function () { return ctx; },
  addEventListener: function () {},
  getBoundingClientRect: function () { return { left: 0, top: 0, width: 450, height: 800 }; },
  style: {}, width: 450, height: 800
};
var wrapStub = { style: {} };
var imgInstances = [];
var rafCb = null;

// 通用 DOM 元素桩
function makeEl(id, attrs) {
  attrs = attrs || {};
  return {
    id: id || '',
    style: {},
    classList: { toggle: function () {}, add: function () {}, remove: function () {}, contains: function () { return false; } },
    textContent: '', innerHTML: '', value: '', disabled: false, hidden: false,
    onclick: null, oninput: null, onerror: null,
    addEventListener: function () {}, removeEventListener: function () {},
    setAttribute: function () {}, getAttribute: function (name) { return attrs[name] != null ? attrs[name] : ''; },
    appendChild: function () {}, querySelector: function () { return makeEl('q'); }
  };
}

var elCache = {};
// 元素桩：按 id 注册到 elCache，保证 querySelectorAll 与 getElementById 拿到同一实例
function el(id, attrs) {
  if (elCache[id]) return elCache[id];
  elCache[id] = makeEl(id, attrs);
  return elCache[id];
}
var documentStub = {
  readyState: 'complete',
  documentElement: { clientWidth: 400, clientHeight: 700 },
  addEventListener: function () {},
  getElementById: function (id) {
    if (id === 'game') return canvasStub;
    if (id === 'game-wrap') return wrapStub;
    return el(id);
  },
  createElement: function () { return { async: false, src: '', onload: null, onerror: null }; },
  head: { appendChild: function () {} },
  querySelector: function () { return el('q'); },
  querySelectorAll: function (sel) {
    if (sel.indexOf('rank-source-tabs') >= 0) {
      return [el('st1', { 'data-source': 'local' }), el('st2', { 'data-source': 'global' })];
    }
    if (sel.indexOf('rank-type-tabs') >= 0) {
      return [el('ty1', { 'data-type': 'score' }), el('ty2', { 'data-type': 'level' })];
    }
    if (sel.indexOf('rank-period-tabs') >= 0) {
      return [el('pt1', { 'data-period': 'all' }), el('pt2', { 'data-period': 'month' }), el('pt3', { 'data-period': 'week' }), el('pt4', { 'data-period': 'day' })];
    }
    if (sel.indexOf('.view') >= 0) {
      return [el('view-home'), el('view-help'), el('view-settings'), el('view-shop'), el('view-rank'), el('view-game')];
    }
    if (sel.indexOf('.upgrade-card') >= 0) {
      return [el('buy-armor', { 'data-key': 'armor' }), el('buy-b1', { 'data-key': 'b1' }), el('buy-b2', { 'data-key': 'b2' }), el('buy-b3', { 'data-key': 'b3' })];
    }
    return [];
  }
};

var glob = {
  self: null, console: console, Date: Date, Math: Math, JSON: JSON,
  Infinity: Infinity, isFinite: isFinite, NaN: NaN,
  requestAnimationFrame: function (cb) { rafCb = cb; return 1; },
  setTimeout: function (cb) { return 1; }, clearTimeout: function () {},
  Image: function () { this.width = 64; this.height = 64; this.onload = null; imgInstances.push(this); },
  Audio: function () { this.loop = false; this.currentTime = 0; this.play = function () { return { catch: function () {} }; }; },
  navigator: { maxTouchPoints: 0 },
  addEventListener: function () {}, removeEventListener: function () {},
  document: documentStub,
  window: null
};
glob.self = glob;
glob.window = glob;

var sandbox = vm.createContext(glob);
function runFile(name) { vm.runInContext(fs.readFileSync(name, 'utf8'), sandbox, { filename: name }); }

// ---------- 加载 ----------
runFile('js/core.js');
runFile('js/audio.js');
runFile('js/game.js');
runFile('js/ui.js');

var Game = sandbox.Game;
var Core = sandbox.PlaneCore;
var UI = sandbox.UI;
if (!Game || !Core || !UI) { console.error('✗ 全局对象缺失'); process.exit(1); }

// 触发图片 onload，走真实 drawImage 渲染路径
imgInstances.forEach(function (img) { if (img.onload) img.onload(); });

var simClock = 0;   // 单调递增时钟：rAF 时间戳必须单调，dt 恒为正
function drive(frames) {
  for (var i = 0; i < frames; i++) {
    simClock += 16;
    var cb = rafCb; rafCb = null;
    if (cb) cb(simClock);
  }
}
function click(id) { var el = elCache[id]; if (el && typeof el.onclick === 'function') el.onclick.call(el); }

// ---------- 引擎流程 ----------
Game.startRun();
var run = Game.getRunInfo();
if (Game.getState() !== 'playing') { console.error('✗ startRun 未进入 playing'); process.exit(1); }
drive(300);

var bombsBefore = run.bombs;
Game.doBomb();
if (run.bombs !== bombsBefore - 1) { console.error('✗ doBomb 未消耗炸弹'); process.exit(1); }

Game.pause();
if (Game.getState() !== 'paused') { console.error('✗ pause 失败'); process.exit(1); }
drive(30);
Game.resume();
if (Game.getState() !== 'playing') { console.error('✗ resume 失败'); process.exit(1); }

// 强制血量归零 -> 死亡动画 -> 结算
run.hp = 0;
drive(200);
if (Game.getState() !== 'over') { console.error('✗ 未正常进入结算 state=' + Game.getState()); process.exit(1); }
if (!Core.getLocalLB().length) { console.error('✗ 本地榜未写入'); process.exit(1); }
if (Core.hasCheckpoint()) { console.error('✗ 结算后断点应清除'); process.exit(1); }

// 断点续玩
Game.startRun();
Game.pause();
Game.toHome();
if (!Core.hasCheckpoint()) { console.error('✗ 退出未保存断点'); process.exit(1); }
if (!Game.continueRun() || Game.getState() !== 'playing') { console.error('✗ 续玩失败'); process.exit(1); }
drive(120);
Game.toHome();
if (!Core.hasCheckpoint()) { console.error('✗ 续玩后再次退出未保存断点'); process.exit(1); }

// ---------- BOSS 流程实测（生成 / 发射子弹 / 被子弹击破） ----------
(function () {
  Game.startRun();
  var r = Game.getRunInfo();
  r.spawned = Core.CFG.wave.perWave;     // 强制本波达标 -> checkWave 触发 BOSS
  drive(15);
  var b = Game.getBoss();
  if (!b) { console.error('✗ BOSS 未生成'); process.exit(1); }
  if (!b.specials || b.specials.length !== 3) { console.error('✗ BOSS 未抽取 3 种特殊攻击'); process.exit(1); }

  // 双重激光专项：强制特殊攻击全为 doubleLaser，触发后 laserX 应为两侧数组
  b.specials = ['doubleLaser', 'doubleLaser', 'doubleLaser'];
  b.specialT = 0; b.specialWarn = 0; b.specialActive = 0;
  drive(120);
  var lx = Game.getBoss().laserX;
  if (!Array.isArray(lx) || lx.length !== 2) { console.error('✗ 双重激光未生效 laserX=' + JSON.stringify(lx)); process.exit(1); }

  // 强制触发一次特殊攻击（警告 -> 执行），验证状态机无异常
  b.specialT = 0;
  drive(150);

  // BOSS 应发射子弹：0.5s/发，检测到 radius>=13 的 BOSS 子弹
  var hasBossBullet = false;
  for (var i = 0; i < 40; i++) {
    var eb = Game.getEnemyBullets();
    for (var j = 0; j < eb.length; j++) {
      if (eb[j].radius >= 13) hasBossBullet = true;
    }
    if (hasBossBullet) break;
    drive(1);
  }
  if (!hasBossBullet) { console.error('✗ BOSS 未发射子弹'); process.exit(1); }

  // 断点续玩：BOSS 血量上限应保持满血、当前血量保持剩余（旧缺陷是 maxHp 被存成剩余血）
  var hpBefore = b.hp, maxBefore = b.maxHp;
  Game.pause();
  Game.toHome();
  if (!Game.continueRun()) { console.error('✗ 断点续玩失败'); process.exit(1); }
  var br = Game.getBoss();
  if (!br) { console.error('✗ 续玩后 BOSS 丢失'); process.exit(1); }
  if (br.maxHp !== maxBefore) { console.error('✗ 续玩后 BOSS 血量上限错误 maxHp=' + br.maxHp + ' 应为 ' + maxBefore); process.exit(1); }
  if (br.hp !== hpBefore) { console.error('✗ 续玩后 BOSS 当前血量错误'); process.exit(1); }
  b = br;

  // BOSS 应能被子弹击破：设极低血量，靠玩家自动射击打死
  b.hp = 5;
  drive(240);
  if (Game.getBoss()) { console.error('✗ BOSS 未被玩家子弹击破'); process.exit(1); }
})();

// ---------- UI 流程 ----------
// 商店买一次（先给足积分）
Core.addBalance(500);
click('btn-shop');
click('buy-b1');           // 升级 b1
var up = Core.loadUpgrades();
if (up.b1 < 1) { console.error('✗ 商店升级未生效'); process.exit(1); }
click('btn-shop-back');

// 设置页
click('btn-settings');
click('btn-settings-back');

// 排行榜（本地 + B站 异步路径，含 高分/等级 二级 tab）
click('btn-rank');
click('ty2');            // 切到 B站·等级
click('btn-rank-back');

// 说明页
click('btn-help');
click('btn-help-back');

// 暂停 -> 结束本局并结算
click('btn-start');
click('btn-pause');
click('btn-end-run');
if (Game.getState() !== 'over') { console.error('✗ endRun 未进入结算'); process.exit(1); }

// 开始 -> 暂停 -> 首页 -> 继续
click('btn-start');
click('btn-pause');
click('btn-resume');
click('btn-pause-home');
click('btn-continue');

// 结算遮罩
UI.showGameOver(12345, 3, 123);

// 跳关：跳 2 关 -> 从第 3 关开始，威力 ×1.4²
Core.saveUpgrades({ armor: 20, b1: 0, b2: 0, b3: 0 });
Game.startRun(2);
if (Game.getRunInfo().wave !== 3) { console.error('✗ 跳关未生效 wave=' + Game.getRunInfo().wave); process.exit(1); }
if (Game.getRunInfo().jumpMult !== Core.jumpMult(2)) { console.error('✗ 跳关威力加成错误'); process.exit(1); }

// 清理：避免 sim 退出时遗留
Core.clearCheckpoint();

console.log('✓ sim 集成冒烟通过（引擎数百帧 + UI 全流程点击，无异常）');
