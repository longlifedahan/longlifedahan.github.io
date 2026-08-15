/* 财富帝国 · Node 冒烟测试：node test.js */
'use strict';
var M = require('./game.js');
var passed = 0, failed = 0;

function assert(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error('✗ ' + name); }
}
function close(a, b, eps) {
  eps = eps || 1e-9;
  return Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
}

/* ---- 大数 ---- */
assert('bnFrom 100 = 1e2', M.bnFrom(100).m === 1 && M.bnFrom(100).e === 2);
assert('bnFrom 0.1 = 1e-1', M.bnFrom(0.1).m === 1 && M.bnFrom(0.1).e === -1);
assert('bnFrom 0 = 0', M.bnFrom(0).m === 0 && M.bnFrom(0).e === 0);

var a = M.add(M.bnFrom(1e12), M.bnFrom(5e12));          // 6e12
assert('add 6e12', a.m === 6 && a.e === 12);
var b = M.add(M.bnFrom(1e12), M.bnFrom(1));             // 1e12（小量被吸收，尾数仅浮动）
assert('add 吸收小量', close(b.m, 1) && b.e === 12);
var c = M.sub(M.bnFrom(1000), M.bnFrom(999));           // 1（浮点下尾数可能 9.99…e-1，按值比较）
assert('sub 1000-999=1', close(c.m * Math.pow(10, c.e), 1, 1e-9));
var d = M.mulSmall(M.bnFrom(5e8), 0.01);                // 5e6
assert('mulSmall *0.01', close(d.m, 5) && d.e === 6);
var e = M.mulSmall(M.bnFrom(5e8), 2);                   // 1e9
assert('mulSmall *2', close(e.m, 1) && e.e === 9);
assert('gte 10>=10', M.gte(M.bnFrom(10), M.bnFrom(10)));
assert('gte 1e9>=1e8', M.gte(M.bnFrom(1e9), M.bnFrom(1e8)));
assert('gte 1e8>=1e9 为假', !M.gte(M.bnFrom(1e8), M.bnFrom(1e9)));

/* ---- 格式化 ---- */
assert('fmt 元', M.fmt(M.bnFrom(1234)) === '1234元');
assert('fmt 万', M.fmt(M.bnFrom(12345)) === '1.23万');
assert('fmt 亿', M.fmt(M.bnFrom(1.5e8)) === '1.5亿');
assert('fmt 万亿', M.fmt(M.bnFrom(2e12)) === '2万亿');
assert('fmt 亿亿', M.fmt(M.bnFrom(3e16)) === '3亿亿');
assert('fmt 万亿亿', M.fmt(M.bnFrom(4e20)) === '4万亿亿');
assert('fmt 亿亿亿', M.fmt(M.bnFrom(5e24)) === '5亿亿亿');
assert('fmt 科学计数', M.fmt(M.bn(1.23456, 51)) === '1.235*10^51');
assert('fmt 0.1元', M.fmt(M.bnFrom(0.1)) === '0.1元');
assert('unitName(1)=万', M.unitName(1) === '万');
assert('unitName(2)=亿', M.unitName(2) === '亿');
assert('unitName(3)=万亿', M.unitName(3) === '万亿');
assert('unitName(4)=亿亿', M.unitName(4) === '亿亿');
assert('unitName(7)=万亿亿亿', M.unitName(7) === '万亿亿亿');

/* ---- 拆位编码往返 ---- */
var enc = M.encodeScore(M.bnFrom(1.2345678e30));
var dec = M.decodeScore(enc);
assert('encodeScore 在限内', Math.abs(enc) <= 16777215);
assert('decode 尾数≈1.2346', close(dec.m * Math.pow(10, dec.e), 1.2346e30, 1e-3));
var enc2 = M.encodeScore(M.bnFrom(999));
assert('encodeScore 小值', enc2 > 0);

/* ---- 建筑公式 ---- */
for (var i = 1; i <= M.B_COUNT; i++) M.S.counts[i - 1] = 1;   // 每种建筑 1 座
/* 存钱罐（第 1 座）固定：价格10、单座产出0.01 */
assert('存钱罐 价格10', M.costBuilding(0).e === 1);
assert('存钱罐 单座产出0.01', M.buildingUnitRate(0).e === -2 && close(M.buildingUnitRate(0).m, 1));
for (var i = 2; i <= M.B_COUNT; i++) {
  var cost = M.costBuilding(i - 1);
  var rate = M.buildingRate(i - 1);
  // 第 n 座（n≥2）：cost=10^(2n-2)，rate=10^(2n-5)×(1+(n-1)%)（数量=1）
  var expC = 2 * i - 2, expR = 2 * i - 5;
  var lvM = 1 + (i - 1) * 0.01;
  assert('建筑' + i + ' 价格 10^' + expC, close(cost.m, 1) && cost.e === expC);
  assert('建筑' + i + ' 产出 10^' + expR + '×' + lvM.toFixed(2), close(rate.m, lvM) && rate.e === expR);
}
assert('建筑100 价格10^198', M.costBuilding(99).e === 198);
assert('1000s回本 (1)', M.costBuilding(0).e - M.buildingRate(0).e === 3);
assert('1000s回本 (99)', M.costBuilding(99).e - M.buildingRate(99).e === 3);
/* 等级产出差异：lv1=100%、lv2=101%、lv3=102%（增益=1+(n-1)% 反映在尾数上） */
for (var k = 0; k < 3; k++) {
  assert('建筑' + (k + 1) + ' 增益' + (100 + k).toFixed(0) + '%', close(M.buildingUnitRate(k).m, 1 + k * 0.01, 1e-9));
}
/* 单座产量与数量无关，总产量=单座×数量 */
M.S.counts[0] = 5;
assert('单座产量不随数量变', M.buildingUnitRate(0).e === -2 && close(M.buildingUnitRate(0).m, 1));
assert('总产量=单座×5', close(M.buildingRate(0).m * Math.pow(10, M.buildingRate(0).e), 0.05, 1e-9));
M.S.counts[0] = 1;

/* ---- 大本营 ---- */
M.S.baseLevel = 1;
assert('大本营1级产出1/s', M.baseRate().m === 1 && M.baseRate().e === 0);
assert('大本营1→2升级费100', M.costBase().e === 2);
M.S.baseLevel = 2;
assert('大本营2级产出10/s', M.baseRate().m === 1 && M.baseRate().e === 1);
assert('大本营2→3升级费1万', M.costBase().e === 4);
M.S.baseLevel = 3;
assert('大本营3→4升级费100万', M.costBase().e === 6);
M.S.baseLevel = 1;

/* ---- 建筑名字 ---- */
assert('100 种建筑', M.B_COUNT === 100 && M.BUILDING_NAMES.length === 100);
var bad = 0;
for (var j = 0; j < 100; j++) if (!M.BUILDING_NAMES[j]) bad++;
assert('无空名', bad === 0);
assert('末位最牛名字', M.BUILDING_NAMES[99] === '终极货币之神');

/* ---- 点击增益：5s 线性衰减、无上限 ---- */
M.clickTs.length = 0;
M.clickTs.push(Date.now());
assert('单次点击≈+10%', Math.abs(M.buffValue() - 0.10) < 1e-3);
M.clickTs.length = 0;
M.clickTs.push(Date.now() - M.CLICK_MS / 2);   // 5s 前（10s 中点）→ 衰减到一半
assert('60s中点衰减到一半', Math.abs(M.buffValue() - 0.05) < 1e-3);
M.clickTs.length = 0;
M.clickTs.push(Date.now() - M.CLICK_MS - 1000); // 61s 前 → 应被清除
assert('超过60s被清除', M.buffValue() === 0);
M.clickTs.length = 0;
for (var t = 0; t < 30; t++) M.clickTs.push(Date.now());   // 30 次连点
var many = M.buffValue();
assert('无上限可叠加>100%', many > 1.0);
assert('倍率随叠加增长(>2)', M.multiplier() > 2.0);
M.clickTs.length = 0;

/* ---- 挂机上限分级 + 按上限结算 ---- */
M.setRelation(false, false);
assert('默认上限8h', M.idleCap() === 28800);
M.setRelation(false, true);
assert('关注作者24h', M.idleCap() === 86400);
M.setRelation(true, false);
assert('作者无限', M.idleCap() === Infinity);
/* 已关注用户不再提醒 8h */
M.setRelation(false, true);
assert('关注者说明无8h', M.idleNote().indexOf('8 小时') < 0 && M.idleNote().indexOf('24 小时') >= 0);
M.setRelation(true, false);
assert('作者说明无上限', M.idleNote().indexOf('无上限') >= 0 && M.idleNote().indexOf('8 小时') < 0);
M.setRelation(false, false);
assert('默认说明提示关注', M.idleNote().indexOf('8 小时') >= 0 && M.idleNote().indexOf('关注') >= 0);
M.S.gold = { m: 0, e: 0 };
M.S.baseLevel = 1;
M.S.counts = new Array(100).fill(0);   // 1/s
var gg1 = M.applyOffline(100000, M.idleCap());      // 100000s>8h → 封顶 1×5%×28800
assert('挂机8h封顶', close(gg1.m * Math.pow(10, gg1.e), 0.05 * 28800, 1e-6));
M.S.gold = { m: 0, e: 0 };
M.setRelation(true, false);
var gg2 = M.applyOffline(100000, M.idleCap());      // 作者：无限 → 1×5%×100000
assert('作者无限结算', close(gg2.m * Math.pow(10, gg2.e), 0.05 * 100000, 1e-6));
M.setRelation(false, false);

/* ---- 总产出包含大本营+建筑 ---- */
M.S.baseLevel = 2;                 // 10/s
M.S.counts = new Array(100).fill(0);
M.S.counts[0] = 5;                 // 5 × 0.01 = 0.05/s
M.S.counts[1] = 1;                 // 1 × 0.101 = 0.101/s
var rt = M.totalRate();
assert('totalRate ≈ 10.151/s', close(rt.m * Math.pow(10, rt.e), 10.151, 1e-9));

/* ---- 顶部资产显示（fmtInt）：≥1万 留小数，<1万 取整 ---- */
assert('fmtInt <1万取整', M.fmtInt(M.bnFrom(1234.56)) === '1234元');
assert('fmtInt 忽略小数', M.fmtInt(M.bnFrom(123.45)) === '123元');
assert('fmtInt 截断0.5', M.fmtInt(M.bnFrom(0.5)) === '0元');
assert('fmtInt 万留小数', M.fmtInt(M.bnFrom(12345)) === '1.23万');
assert('fmtInt 亿留小数', M.fmtInt(M.bnFrom(1.5e8)) === '1.5亿');
assert('fmtInt 科学计数留小数', M.fmtInt(M.bn(1.9, 51)) === '1.9*10^51');
assert('fmtInt 0', M.fmtInt(M.bn(0, 0)) === '0');
assert('fmtInt 边界9999', M.fmtInt(M.bnFrom(9999)) === '9999元');
assert('fmtInt 边界1万', M.fmtInt(M.bnFrom(10000)) === '1万');

console.log('通过 ' + passed + ' / ' + (passed + failed));
process.exit(failed ? 1 : 0);
