/* 小恐龙快跑 —— 引擎+UI 集成冒烟（Node 沙箱，DOM/ctx 桩，驱动 rAF 数千帧） */
'use strict';
var fs = require('fs'), vm = require('vm');

function makeCtx() {
  var rec;
  function mk() {
    return new Proxy(function () {}, {
      get: function (t, p) { if (p === Symbol.toPrimitive) return function () { return 'ctx'; }; return rec; },
      set: function () { return true; },
      apply: function () { return rec; }
    });
  }
  rec = mk();
  return rec;
}
var ctxStub = makeCtx();
var els = {};

function makeEl(id) {
  var el = {
    id: id, style: {}, _l: {}, hidden: (id === 'view-home' ? false : true),
    textContent: '', innerHTML: '', clientWidth: 390, clientHeight: 220,
    width: 0, height: 0,
    classList: { add: function () {}, remove: function () {}, toggle: function () {} },
    setAttribute: function () {}, getAttribute: function () { return null; },
    querySelector: function () { return { hidden: true, textContent: '', style: {} }; },
    querySelectorAll: function () { return []; },
    appendChild: function () {}, closest: function () { return null; },
    getContext: function () { return ctxStub; }
  };
  el.addEventListener = function (t, fn) { (el._l[t] = el._l[t] || []).push(fn); };
  return el;
}
var doc = {
  getElementById: function (id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
  createElement: function () { return makeEl('tmp'); },
  head: { appendChild: function () {} },
  addEventListener: function () {},
  querySelectorAll: function () { return []; }
};
var store = {};
var rAFQ = [];
var sandbox = {
  document: doc,
  window: { addEventListener: function () {}, devicePixelRatio: 1,
    requestAnimationFrame: function (cb) { rAFQ.push(cb); } },
  localStorage: {
    getItem: function (k) { return store[k] !== undefined ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  },
  setTimeout: function () { return 0; },
  clearTimeout: function () {},
  requestAnimationFrame: function (cb) { rAFQ.push(cb); },
  module: { exports: {} }
};
sandbox.global = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/game.js', 'utf8'), sandbox);
var G = sandbox.module.exports;

var failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); }

console.log('== 商店购买（充值金币） ==');
G.S.coins = 999999; G.S.totalCoins = 0; G.S.hi = 0;
var shopKeys = ['dj', 'life2', 'shield', 'magnet', 'dash', 'life3', 'roar', 'x2', 'tj', 'life4', 'revive', 'fly'];
shopKeys.forEach(function (k) {
  G.buy(k);
  ok(G.S.owns[k], '购买成功：' + k);
});
ok(G.S.owns.dj && G.S.owns.life2 && G.S.owns.life3 && G.S.owns.life4 &&
   G.S.owns.tj && G.S.owns.revive && G.S.owns.fly && G.S.owns.magnet &&
   G.S.owns.shield && G.S.owns.dash && G.S.owns.roar && G.S.owns.x2, '全部 12 项购买生效');
ok(G.S.coins < 999999, '金币已扣减（剩 ' + G.S.coins + '）');
ok(G.livesTotal() === 4, '四条命 total=' + G.livesTotal());

console.log('== 恐龙颜色自定义 ==');
G.S.color = '#4d9de0';
ok(G.validColor(G.S.color) === '#4d9de0', '自定义恐龙色已设置（后续用蓝色跑长局验证绘制）');
ok(G.shadeColor('#4d9de0', -25) !== '#4d9de0', '暗色派生正常');

console.log('== 设置页导航 ==');
els['btn-settings']._l.click[0]();
ok(els['view-settings'].hidden === false, '点击设置按钮后显示设置页');
ok(els['view-home'].hidden === true, '首页已隐藏');
ok(els['color-presets'].innerHTML.length > 0, '色板已渲染');
ok(els['color-preview'].style.background === '#4d9de0', '颜色预览更新为当前恐龙色');
els['btn-back-settings']._l.click[0]();
ok(els['view-home'].hidden === false, '返回后回到首页');

console.log('== 启动对局 ==');
els['btn-start']._l.click[0]();
var now = 0;
function step(ms) { now += ms; G.tick(now); }
for (var i = 0; i < 200; i++) step(16);
ok(G.R && G.R.state === 'running', '倒计时后进入奔跑，state=' + (G.R ? G.R.state : 'null'));
for (var ih = 0; ih < 30; ih++) step(16);
ok(els['hud-passives'].innerHTML.indexOf('🦘') >= 0, '二连跳被动指示显示在生命值旁');
ok(els['hud-passives'].innerHTML.indexOf('🧲') >= 0, '吸铁石被动指示显示在生命值旁');
ok(els['hud-passives'].innerHTML.indexOf('💖') >= 0, '重生守护被动指示显示在生命值旁');
ok(els['hud-coins'].innerHTML.indexOf('coin') >= 0, 'HUD 金币用 CSS 图标（非 emoji）');

console.log('== 长时间奔跑 + 智能跳跃 + 技能（跑到 10000 米实测陨石） ==');
var skillUsed = {};
['shield', 'dash', 'roar', 'x2', 'fly'].forEach(function (k) { skillUsed[k] = 0; });
function trySkill(k) { if (G.R.sk[k].cd <= 0) { G.useSkill(k); skillUsed[k]++; } }
var steps = 0, reachedMeteor = false, reachedBird = false, reachedDouble = false;
var birdHeights = {}, maxCoins = 0, birdSeen = false, birdCactusCoexist = false, maxBirds = 0;
while (G.R && G.R.state === 'running' && steps < 60000) {
  step(16);
  var R = G.R;
  steps++;
  if (R.meters >= 3000) reachedBird = true;
  if (R.meters >= 1000) reachedDouble = true;
  if (R.meters >= 10000) reachedMeteor = true;
  if (R.coins.length > maxCoins) maxCoins = R.coins.length;
  // 智能决策
  var nearest = null, birdNear = false, meteorNear = false, meteorFallNear = false;
  var hasBirdNow = false, hasCactusNow = false, birdNow = 0;
  for (var j = 0; j < R.obs.length; j++) {
    var o = R.obs[j];
    if (o.type === 'bird') { birdSeen = true; birdHeights[o.baseY] = 1; hasBirdNow = true; birdNow++; if (o.x > 90 && o.x < 90 + 260) birdNear = true; }
    else if (o.type === 'cactus') { hasCactusNow = true; if (o.x > 90 && o.x < 90 + 400) { if (!nearest || o.x < nearest.x) nearest = o; } }
    else if (o.x > 90 && o.x < 90 + 400) { if (!nearest || o.x < nearest.x) nearest = o; }
  }
  if (birdNow > maxBirds) maxBirds = birdNow;
  if (hasBirdNow && hasCactusNow) birdCactusCoexist = true;
  for (var mi = 0; mi < R.meteors.length; mi++) {
    var mt = R.meteors[mi];
    if (mt.type === 'warn' && mt.tx > 90 - 20 && mt.tx < 90 + 90) meteorNear = true;
    if (mt.type === 'fall' && mt.y > 80 && mt.y < 280 && Math.abs(mt.x - 113) < 90) meteorFallNear = true;
  }
  if (meteorNear || meteorFallNear) {
    if (R.dino.grounded) G.doJump();
    if (R.sk.shield.cd <= 0) trySkill('shield');
  } else if (nearest) {
    var dist = nearest.x - 90;
    if (birdNear && dist < 240 && R.sk.shield.cd <= 0) trySkill('shield');   // 鸟+掌同时临近时开护盾
    if (R.dino.grounded && dist < 360) G.doJump();
    else if (!R.dino.grounded && R.dino.jumps < 3 && dist < 280) G.doJump();
    if (dist < 110 && R.sk.dash.cd <= 0) trySkill('dash');
  } else if (!birdNear && R.dino.grounded && Math.random() < 0.004) G.doJump();
  // 强制各技能各用一次（保证覆盖技能分支）
  if (steps === 500) trySkill('shield');
  if (steps === 600) trySkill('dash');
  if (steps === 700) trySkill('roar');
  if (steps === 800) trySkill('x2');
  if (steps === 900) trySkill('fly');
  // 场景技能：障碍多时怒吼清场 / 飞行穿越
  if (R.sk.roar.cd <= 0 && R.obs.length >= 2) trySkill('roar');
  else if (R.sk.fly.cd <= 0 && R.obs.length >= 2) trySkill('fly');
  if (reachedMeteor) break;
}
ok(R && R.score > 100, '奔跑产生分数 score=' + (R ? Math.floor(R.score) : 0));
ok(R.meters >= 500, '达到 500 米（高仙人掌解锁）meters=' + R.meters);
ok(reachedDouble, '达到 1000 米（双连仙人掌解锁）');
ok(reachedBird, '达到 3000 米（飞鸟解锁）');
ok(birdSeen, '3000 米后确实出现飞鸟（累计 ' + Object.keys(birdHeights).length + ' 档高度）');
ok(birdCactusCoexist, '鸟与仙人掌可同屏共存');
ok(Object.keys(birdHeights).length >= 2, '飞鸟飞行高度有差异（出现 ' + Object.keys(birdHeights).length + ' 档）');
ok(maxCoins < 30, '屏幕金币数量有界（峰值 ' + maxCoins + '，整体均匀）');
ok(skillUsed.shield >= 1, '护罩技能用过 ' + skillUsed.shield + ' 次');
ok(skillUsed.dash >= 1, '冲刺技能用过 ' + skillUsed.dash + ' 次');
ok(skillUsed.roar >= 1, '怒吼技能用过 ' + skillUsed.roar + ' 次');
ok(skillUsed.x2 >= 1, '双倍技能用过 ' + skillUsed.x2 + ' 次');
ok(skillUsed.fly >= 1, '飞行技能用过 ' + skillUsed.fly + ' 次');
console.log('  → 最终分数 ' + Math.floor(R.score) + '，距离 ' + R.meters + 'm，陨石阶段：' + reachedMeteor);

console.log('== 地面裂缝（3w 米）与飞行技能 ==');
// 无技能可用时：贴地落入裂缝会扣命
G.startRun();
for (var cf = 0; cf < 250; cf++) step(16);
G.R.obs = []; G.R.meteors = [];
['shield', 'dash', 'roar', 'fly'].forEach(function (k) { G.R.sk[k].cd = 999; });   // 禁自动技能
G.R.obs.push({ type: 'crevice', x: 30, w: 140, h: 0, y: 300 });
for (var cs = 0; cs < 30; cs++) step(16);
ok(G.R.lives < 4 || G.R.state === 'over', '无技能时贴地落入裂缝会扣命（lives=' + G.R.lives + '）');
// 自动技能：落入裂缝自动触发护盾保命
G.startRun();
for (var cf3 = 0; cf3 < 250; cf3++) step(16);
G.R.obs = []; G.R.meteors = [];
G.R.obs.push({ type: 'crevice', x: 30, w: 140, h: 0, y: 300 });
for (var cs3 = 0; cs3 < 30; cs3++) step(16);
ok(G.R.sk.shield.t > 0 && G.R.lives === 4, '落入裂缝自动触发护盾保命（shield.t=' + G.R.sk.shield.t.toFixed(1) + '）');
// 飞行激活：穿过裂缝 + 仙人掌不死亡
G.startRun();
for (var cf2 = 0; cf2 < 250; cf2++) step(16);
G.R.obs = []; G.R.meteors = [];
G.useSkill('fly');
ok(G.R.sk.fly.t > 0, '飞行技能激活 t=' + G.R.sk.fly.t.toFixed(1));
G.R.obs.push({ type: 'crevice', x: 30, w: 140, h: 0, y: 300 });
G.R.obs.push({ type: 'cactus', variant: 'med', x: 120, w: 24, h: 62, y: 300 });
for (var fk = 0; fk < 40; fk++) step(16);
ok(G.R.state === 'running', '飞行时穿过裂缝与仙人掌不死亡');

console.log('== 重生守护：基础无敌 0.5s，购买后 3s ==');
// 无重生：失去生命后有 1.2s 基础无敌（防连撞）
G.startRun();
for (var rv1 = 0; rv1 < 250; rv1++) step(16);
G.R.obs = []; G.R.meteors = [];
['shield', 'dash', 'roar', 'fly'].forEach(function (k) { G.R.sk[k].cd = 999; });
G.S.owns.revive = false;
G.R.obs.push({ type: 'crevice', x: 30, w: 140, h: 0, y: 300 });
for (var rv2 = 0; rv2 < 5; rv2++) step(16);
ok(G.R.inv > 0.3 && G.R.inv < 0.5, '无重生守护时基础无敌 0.5s（inv=' + G.R.inv.toFixed(2) + '）');
// 有重生：失去生命后 3s 无敌
G.S.owns.revive = true;
G.startRun();
for (var rv3 = 0; rv3 < 250; rv3++) step(16);
G.R.obs = []; G.R.meteors = [];
['shield', 'dash', 'roar', 'fly'].forEach(function (k) { G.R.sk[k].cd = 999; });
G.R.obs.push({ type: 'crevice', x: 30, w: 140, h: 0, y: 300 });
for (var rv4 = 0; rv4 < 5; rv4++) step(16);
ok(G.R.inv > 2.5, '有重生守护时失去生命后 3s 无敌（inv=' + G.R.inv.toFixed(1) + '）');

console.log('== 允许多鸟（独立随机出现，可同屏但不强制） ==');
G.startRun();
for (var mb1 = 0; mb1 < 250; mb1++) step(16);
G.R.obs = []; G.R.meteors = []; G.R.distToOb = 5000;
G.R.obs.push({ type: 'bird', x: 300, y: 150, baseY: 150, w: 52, h: 40, flap: 0 });
G.R.obs.push({ type: 'bird', x: 500, y: 130, baseY: 130, w: 52, h: 40, flap: 1 });
for (var mb2 = 0; mb2 < 20; mb2++) step(16);
var birdsAfter = 0;
for (var mbj = 0; mbj < G.R.obs.length; mbj++) if (G.R.obs[mbj].type === 'bird') birdsAfter++;
ok(birdsAfter >= 2, '允许多只鸟同屏共存（' + birdsAfter + ' 只，独立随机不互相排斥）');

console.log('== 陨石（1w 米） ==');
G.startRun();
for (var mt1 = 0; mt1 < 250; mt1++) step(16);
G.R.meters = 11000; G.R.metersFloat = 11000 * 12;
G.R.obs = []; G.R.meteors = []; G.R.distToOb = 5000;
G.R.meteorT = 0.5;
var sawMeteor = false, sawCrater = false;
for (var mt2 = 0; mt2 < 400; mt2++) {
  step(16);
  if (G.R.meteors.length > 0) sawMeteor = true;
  if (sawMeteor) {
    for (var mj = 0; mj < G.R.obs.length; mj++) {
      if (G.R.obs[mj].type === 'crater') { sawCrater = true; break; }
    }
  }
  if (sawCrater) break;
}
ok(sawMeteor, '陨石出现');
ok(sawCrater, '陨石落地砸出坑');

console.log('== 结束本局 / 结算 ==');
G.startRun();
for (var sp = 0; sp < 250; sp++) step(16);
R = G.R;
els['btn-pause']._l.click[0]();
ok(R.state === 'paused', '点击暂停按钮后暂停');
els['btn-endrun']._l.click[0]();
ok(R.state === 'over', '结束本局后进入结算');
ok(els['over-overlay'].hidden === false, '结算弹窗显示');
ok(store['google_lb'] && JSON.parse(store['google_lb']).hi.length >= 1, '本地榜已记录');

console.log('== 再来一局 ==');
els['btn-again']._l.click[0]();
ok(G.R.state === 'count', '再来一局进入倒计时');
for (var k2 = 0; k2 < 200; k2++) step(16);
ok(G.R.state === 'running', '第二局跑起来了');
for (var k3 = 0; k3 < 60; k3++) step(16);
ok(G.R.score > 0, '第二局有分数 score=' + Math.floor(G.R.score));

console.log('== 技能数字快捷键 1/2/3/4/5 ==');
G.useSkillByNumber(1);
ok(G.R.sk.shield.t > 0, '数字键 1 释放护罩');
G.useSkillByNumber(2);
ok(G.R.sk.dash.t > 0, '数字键 2 释放冲刺');
G.useSkillByNumber(3);
ok(G.R.sk.roar.cd > 0, '数字键 3 释放怒吼（进入冷却）');
G.useSkillByNumber(4);
ok(G.R.sk.x2.t > 0, '数字键 4 释放双倍');
G.useSkillByNumber(5);
ok(G.R.sk.fly.t > 0, '数字键 5 释放飞行');

console.log('== 吸铁石 ==');
G.S.owns.magnet = false;
G.startRun();
for (var mg1 = 0; mg1 < 250; mg1++) step(16);
G.R.obs = []; G.R.meteors = []; G.R.coins = []; G.R.distToOb = 5000;
G.R.coins.push({ x: 180, y: 222, r: 12, phase: 0 });   // 高处金币，地面恐龙自然够不到
var sNo = G.S.coins;
for (var mg2 = 0; mg2 < 120; mg2++) step(16);
ok(G.S.coins - sNo === 0, '无吸铁石时高处金币不被收集');
G.S.owns.magnet = true;
G.startRun();
for (var mg3 = 0; mg3 < 250; mg3++) step(16);
G.R.obs = []; G.R.meteors = []; G.R.coins = []; G.R.distToOb = 5000;
G.R.coins.push({ x: 180, y: 222, r: 12, phase: 0 });
var sMg = G.S.coins;
for (var mg4 = 0; mg4 < 120; mg4++) step(16);
ok(G.S.coins - sMg >= 1, '有吸铁石时高处金币被吸来收集');

console.log('== 双倍得分：金币获取也双倍 ==');
G.startRun();
for (var dx1 = 0; dx1 < 250; dx1++) step(16);
G.R.obs = []; G.R.meteors = []; G.R.coins = []; G.R.distToOb = 5000;
G.useSkill('x2');
ok(G.R.sk.x2.t > 0, '双倍得分激活');
var cBefore = G.S.coins;
G.R.coins.push({ x: 113, y: 275, r: 12, phase: 0 });   // 恐龙脚下，下一帧拾取
for (var dx2 = 0; dx2 < 5; dx2++) step(16);
ok(G.S.coins - cBefore >= 2, '双倍得分时一枚金币 +2（实际 +' + (G.S.coins - cBefore) + '）');

console.log('== 鸟生成前验证跳越（同屏障碍时调低可跳过） ==');
G.startRun();
for (var bv1 = 0; bv1 < 250; bv1++) step(16);
G.R.meters = 3500; G.R.metersFloat = 3500 * 12;   // 解锁鸟
G.R.obs = []; G.R.meteors = []; G.R.distToOb = 5000;
G.R.obs.push({ type: 'cactus', variant: 'med', x: 650, w: 24, h: 62, y: 300 });   // 与鸟几乎同时到达恐龙
G.R.birdT = 0;
for (var bv2 = 0; bv2 < 10; bv2++) step(16);
var newBird = null;
for (var bv3 = 0; bv3 < G.R.obs.length; bv3++) if (G.R.obs[bv3].type === 'bird') newBird = G.R.obs[bv3];
ok(newBird !== null, '鸟已生成');
ok(newBird && newBird.baseY >= 170, '与仙人掌同时到达时鸟调低到可跳过（baseY=' + (newBird ? newBird.baseY.toFixed(0) : '?') + '）');

console.log('== 自动触发冲刺：应附带冲刺效果（速度提升+摧毁障碍） ==');
G.startRun();
for (var ad1 = 0; ad1 < 250; ad1++) step(16);
G.R.obs = []; G.R.meteors = []; G.R.distToOb = 5000;   // 固定生成距离，排除新障碍干扰
G.R.sk.shield.cd = 999; G.R.sk.roar.cd = 999;   // 禁护盾/怒吼，让自动触发走冲刺
var speedNormal = G.R.speed;
G.R.obs.push({ type: 'cactus', variant: 'med', x: 88, w: 24, h: 62, y: 300 });   // 叠在恐龙上 → 威胁
for (var ad2 = 0; ad2 < 5; ad2++) step(16);
ok(G.R.sk.dash.t > 0, '自动触发冲刺激活（dash.t=' + G.R.sk.dash.t.toFixed(1) + '）');
ok(G.R.speed > speedNormal * 1.5, '冲刺附带速度提升（speed=' + G.R.speed.toFixed(0) + '，正常=' + speedNormal.toFixed(0) + '）');
var cactusRemaining = 0;
for (var ad3 = 0; ad3 < G.R.obs.length; ad3++) if (G.R.obs[ad3].type === 'cactus') cactusRemaining++;
ok(cactusRemaining === 0, '冲刺摧毁路径上的仙人掌（剩余=' + cactusRemaining + '）');

console.log('== 冲刺后无敌 & 怒吼清全场 ==');
G.startRun();
for (var ds1 = 0; ds1 < 250; ds1++) step(16);
G.R.obs = []; G.R.meteors = [];
G.useSkill('dash');
ok(G.R.sk.dash.t > 0, '冲刺激活');
for (var ds2 = 0; ds2 < 170; ds2++) step(16);   // 2.5s=156帧
ok(G.R.sk.dash.t <= 0, '冲刺已结束');
ok(G.R.inv > 0, '冲刺结束后追加 0.5s 无敌（inv=' + G.R.inv.toFixed(2) + '）');
G.R.obs = []; G.R.meteors = [];
G.R.obs.push({ type: 'bird', x: 300, y: 150, baseY: 150, w: 52, h: 40, flap: 0 });
G.R.obs.push({ type: 'cactus', variant: 'med', x: 400, w: 24, h: 62, y: 300 });
G.R.meteors.push({ type: 'warn', tx: 500, t: 0.8 });
G.R.meteors.push({ type: 'fall', tx: 600, x: 600, y: 100, vy: 0 });
G.useSkill('roar');
ok(G.R.obs.length === 0, '怒吼清空全部障碍（含飞鸟）');
ok(G.R.meteors.length === 0, '怒吼清空全部陨石');

console.log('== 怒吼：清空本屏 + 3s 不生成障碍 ==');
G.startRun();
for (var rr1 = 0; rr1 < 250; rr1++) step(16);
G.R.obs = []; G.R.meteors = []; G.R.distToOb = 0;
G.R.obs.push({ type: 'cactus', variant: 'med', x: 400, w: 24, h: 62, y: 300 });
G.useSkill('roar');
ok(G.R.noSpawnT > 2.5, '怒吼后进入 3s 不生成计时（noSpawnT=' + G.R.noSpawnT.toFixed(1) + '）');
ok(G.R.obs.length === 0, '怒吼清理本屏障碍');
var cactusAfter = 0;
for (var rr2 = 0; rr2 < 100; rr2++) {
  step(16);
  for (var rr3 = 0; rr3 < G.R.obs.length; rr3++) if (G.R.obs[rr3].type === 'cactus') cactusAfter++;
}
ok(cactusAfter === 0, '怒吼后 3s 内没有新障碍生成（cactus=' + cactusAfter + '）');

console.log('== GM 账号（点击首页小恐龙 7 次解锁） ==');
G.S.gm = false;
for (var ci = 0; ci < 7; ci++) els['home-icon']._l.click[0]();
ok(G.S.gm === true, '连续点击小恐龙 7 次解锁 GM');
for (var kk in G.S.owns) G.S.owns[kk] = false;   // 模拟全未购买
G.startRun();
for (var gm1 = 0; gm1 < 250; gm1++) step(16);
G.R.obs = []; G.R.meteors = [];
ok(G.R.gm === true, 'GM 局生效');
ok(G.R.lives === 4, 'GM 局四条命');
G.useSkill('shield');
ok(G.R.sk.shield.t > 0, 'GM 局未购买也能用护罩');
G.useSkill('fly');
ok(G.R.sk.fly.t > 0, 'GM 局未购买也能用飞行');
els['btn-pause']._l.click[0]();
ok(G.R.state === 'paused', 'GM 局可暂停');
els['btn-endrun']._l.click[0]();
ok(G.S.gm === false, '结算后 GM 回归正常');
G.startRun();
for (var gm2 = 0; gm2 < 250; gm2++) step(16);
ok(G.R.gm === false, '下一局不再 GM');
ok(G.R.lives === 1, '下一局回归 1 条命');
G.useSkill('shield');
ok(G.R.sk.shield.t === 0, '下一局未购买护罩不可用');

console.log('\n失败 ' + failures + ' 项');
process.exit(failures ? 1 : 0);
