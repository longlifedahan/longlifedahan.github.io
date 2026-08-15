/* 赛博木鱼 · Node 冒烟测试：node test.js */
'use strict';
var G = require('./game.js');
var assert = require('assert');

function eq(name, got, want) {
  try {
    assert.strictEqual(got, want);
    console.log('  ✔ ' + name);
  } catch (e) {
    console.error('  ✘ ' + name + ' → 得到 ' + got + '，期望 ' + want);
    process.exitCode = 1;
  }
}

console.log('[1] 大数格式化（万/亿/…/科学计数）');
eq('9999（<1万）显示原数字', G.fmt(G.bnFrom(9999)), '9999');
eq('10000 → 1万', G.fmt(G.bnFrom(10000)), '1万');
eq('12345 → 1.23万', G.fmt(G.bnFrom(12345)), '1.23万');
eq('123456 → 12.35万', G.fmt(G.bnFrom(123456)), '12.35万');
eq('100万 → 100万', G.fmt(G.bnFrom(1e6)), '100万');
eq('1500万 → 1500万', G.fmt(G.bnFrom(1.5e7)), '1500万');
eq('10^8 → 1亿', G.fmt(G.bnFrom(1e8)), '1亿');
eq('10^10 → 100亿', G.fmt(G.bnFrom(1e10)), '100亿');
eq('10^14 → 100万亿', G.fmt(G.bnFrom(1e14)), '100万亿');
eq('10^26 → 100亿亿亿', G.fmt(G.bnFrom(1e26)), '100亿亿亿');
eq('10^31 → 1000万亿亿亿', G.fmt(G.bnFrom(1e31)), '1000万亿亿亿');
eq('10^32 → 1×10^32', G.fmt(G.bnFrom(1e32)), '1×10^32');
eq('3.28×10^39 → 3.28×10^39', G.fmt(G.bn(3.28, 39)), '3.28×10^39');
eq('0 → 0', G.fmt(G.bn(0, 0)), '0');

console.log('[1b] 功德不显示小数点 / 产量保留');
eq('123.45 → 123（功德取整）', G.fmt(G.bn(1.2345, 2)), '123');
eq('1.23万 → 1.23万（保留两位）', G.fmt(G.bnFrom(12345)), '1.23万');
eq('999.99 → 999', G.fmt(G.bn(9.9999, 2)), '999');
eq('产量 0.01/秒 不丢', G.fmtRate(G.bnFrom(0.01)), '0.01/秒');
eq('产量 4.05/秒', G.fmtRate(G.bn(4.05, 0)), '4.05/秒');
eq('产量 100/秒 整数', G.fmtRate(G.bnFrom(100)), '100/秒');
eq('产量 2万/秒 切单位', G.fmtRate(G.bnFrom(20000)), '2万/秒');

console.log('[2] 大数运算');
eq('10 + 1000 = 1010', G.fmt(G.add(G.bnFrom(10), G.bnFrom(1000))), '1010');
eq('100万 + 1亿 = 1.01亿', G.fmt(G.add(G.bnFrom(1e6), G.bnFrom(1e8))), '1.01亿');
eq('10^38 × 2 = 2×10^38', G.fmt(G.mulSmall(G.bnFrom(1e38), 2)), '2×10^38');
eq('100 - 99 = 1', G.fmt(G.sub(G.bnFrom(100), G.bnFrom(99))), '1');
eq('10 - 20 = 0（不为负）', G.fmt(G.sub(G.bnFrom(10), G.bnFrom(20))), '0');

console.log('[3] 等级判定');
eq('total=5 → 信众(0)', G.LV_NAMES[G.currentLevel(G.bnFrom(5))], '信众');
eq('total=10 → 信徒(1)', G.LV_NAMES[G.currentLevel(G.bnFrom(10))], '信徒');
eq('total=999 → 信徒(1)', G.LV_NAMES[G.currentLevel(G.bnFrom(999))], '信徒');
eq('total=1000 → 居士(2)', G.LV_NAMES[G.currentLevel(G.bnFrom(1000))], '居士');
eq('total=10^6 → 行者(3)', G.LV_NAMES[G.currentLevel(G.bnFrom(1e6))], '行者');
eq('total=10^7 → 沙弥(4)', G.LV_NAMES[G.currentLevel(G.bnFrom(1e7))], '沙弥');
eq('total=10^9 → 比丘(5)', G.LV_NAMES[G.currentLevel(G.bnFrom(1e9))], '比丘');
eq('total=10^45 → 佛陀(15)', G.LV_NAMES[G.currentLevel(G.bnFrom(1e45))], '佛陀');
eq('total=10^136 → 如来18', G.levelName(G.currentLevel(G.bnFrom(1e136))), '如来18');
eq('lv16 → 如来1', G.levelName(16), '如来1');
eq('lv17 → 如来2', G.levelName(17), '如来2');
eq('lv15 → 佛陀', G.levelName(15), '佛陀');
eq('晋升门槛序列前4个指数', G.NEED_EXP.slice(0, 4).join(','), '0,1,3,5');
eq('lv1 晋升需 10', G.fmt(G.need(1)), '10');
eq('lv2 晋升需 1000', G.fmt(G.need(2)), '1000');
eq('lv3 晋升需 10万', G.fmt(G.need(3)), '10万');
eq('lv4 晋升需 1000万', G.fmt(G.need(4)), '1000万');
eq('lv5 晋升需 10亿', G.fmt(G.need(5)), '10亿');
eq('lv16 晋升需 10^49', G.fmt(G.need(16)), '1×10^49');
eq('lv17 晋升需 10^54', G.fmt(G.need(17)), '1×10^54');

console.log('[4] 敲击基础产出');
eq('信众 1', G.fmt(G.tapBase(0)), '1');
eq('信徒 10', G.fmt(G.tapBase(1)), '10');
eq('居士 100', G.fmt(G.tapBase(2)), '100');
eq('如来 10^16 → 1亿亿', G.fmt(G.tapBase(16)), '1亿亿');

console.log('[5] 功德设施价格与单台产出');
eq('设备0 自动木鱼机 价格100', G.fmt(G.devicePrice(0)), '100');
eq('设备0 单台产出 0.1/秒', G.fmtRate(G.deviceUnit(0)), '0.1/秒');
eq('木鱼机性价比(0.001)不高于设备1(0.0011)', (0.1 / 100) <= (1.1 / 1000), true);
eq('设备1 自动转轮机 价格1000', G.fmt(G.devicePrice(1)), '1000');
eq('设备1 单台产出 1.1/秒', G.fmtRate(G.deviceUnit(1)), '1.1/秒');
eq('设备2 自动撞钟机 价格10万', G.fmt(G.devicePrice(2)), '10万');
eq('设备2 单台产出 121/秒', G.fmtRate(G.deviceUnit(2)), '121/秒');
eq('设备3 自动放生机 价格1000万', G.fmt(G.devicePrice(3)), '1000万');
eq('设备15 无量功德本源 价格10^49', G.fmt(G.devicePrice(15)), '1×10^49');
eq('设备15 单台产出 4.18×10^46/秒', G.fmtRate(G.deviceUnit(15)), '4.18×10^46/秒');
eq('设施数量共16', G.DEV_COUNT, 16);

console.log('[6] B站拆位编码往返');
(function () {
  var enc = G.encodeScore(G.bn(3.28, 39));
  var dec = G.decodeScore(enc);
  var ok = Math.abs(dec.m - 3.28) < 0.01 && dec.e === 39;
  eq('encode(3.28×10^39) 在安全范围', enc >= -16777216 && enc <= 16777215, true);
  eq('decode 还原尾数', Math.round(dec.m * 100) / 100, 3.28);
  eq('decode 还原指数', dec.e, 39);
})();

console.log('[7] 总产出与增益');
(function () {
  G.S.counts[0] = G.bnFrom(5);   // 5 台自动木鱼机（单台0.1/秒）
  G.S.counts[1] = G.bnFrom(2);   // 2 台自动转轮机（单台1.1/秒）
  var rate = G.totalRate();
  eq('5×0.1 + 2×1.1 = 2.7/秒', G.fmtRate(rate), '2.7/秒');
  eq('无敲击时倍率 ×1', G.multiplier().toFixed(2), '1.00');
  G.S.counts[0] = G.bn(0, 0); G.S.counts[1] = G.bn(0, 0);
})();

console.log('[8] 挂机上限分级');
G.setRelation(false, false);
eq('未关注默认 8 小时', G.idleCap(), 8 * 3600);
G.setRelation(true, false);
eq('作者无限挂机', G.idleCap(), Infinity);
G.setRelation(false, true);
eq('关注作者 24 小时', G.idleCap(), 24 * 3600);
G.setRelation(false, false);

console.log('[9] 挂机收益（10%）');
(function () {
  G.S.counts[1] = G.bnFrom(100);  // 100 台自动转轮机 → 110/秒
  var gain = G.applyOffline(3600, 8 * 3600);   // 挂机1小时
  eq('110 × 10% × 3600 = 3.96万', G.fmt(gain), '3.96万');
  G.S.counts[1] = G.bn(0, 0);
  G.S.gold = { m: 0, e: 0 }; G.S.total = { m: 0, e: 0 };
})();

console.log('[10] 敲击→晋升→购买→产出 集成流程');
(function () {
  G.S.gold = { m: 0, e: 0 }; G.S.total = { m: 0, e: 0 };
  G.S.counts = new Array(G.DEV_COUNT).fill(0).map(function () { return { m: 0, e: 0 }; });
  var i;
  for (i = 0; i < 10; i++) {
    var g = G.mulSmall(G.tapBase(0), 1);   // 信众每次敲 +1
    G.S.gold = G.add(G.S.gold, g); G.S.total = G.add(G.S.total, g);
  }
  eq('敲10下累计10功德', G.fmt(G.S.total), '10');
  eq('等级升至信徒', G.LV_NAMES[G.currentLevel(G.S.total)], '信徒');
  eq('信徒敲1下+10', G.fmt(G.mulSmall(G.tapBase(1), 1)), '10');
  eq('10功德买不起木鱼机(价100)', G.gte(G.S.gold, G.devicePrice(0)), false);
  G.S.gold = G.bnFrom(100);
  eq('攒到100可购买自动木鱼机', G.gte(G.S.gold, G.devicePrice(0)), true);
  G.S.gold = G.sub(G.S.gold, G.devicePrice(0)); G.S.counts[0] = G.add(G.S.counts[0], G.bn(1, 0));
  eq('购买后剩余0功德', G.fmt(G.S.gold), '0');
  eq('拥有1台自动木鱼机', G.fmt(G.S.counts[0]), '1');
  eq('每秒产出0.1', G.fmtRate(G.totalRate()), '0.1/秒');
  G.S.total = G.bnFrom(1000);
  eq('累计1000晋升居士', G.LV_NAMES[G.currentLevel(G.S.total)], '居士');
  eq('居士可购买自动转轮机', G.gte(G.S.total, G.devicePrice(1)), true);
  eq('信徒无法解锁设备1', (function () { G.S.total = G.bnFrom(10); return G.currentLevel(G.S.total) >= 2 ? false : true; })(), true);
  G.S.counts = new Array(G.DEV_COUNT).fill(0).map(function () { return { m: 0, e: 0 }; });
})();

console.log('[11] 敲击暴击');
eq('r=0.005 → 十倍暴击', G.critOf(0.005).name, '十倍暴击');
eq('r=0.0005 → 百倍暴击', G.critOf(0.0005).name, '百倍暴击');
eq('r=0.00005 → 超级暴击', G.critOf(0.00005).name, '超级暴击');
eq('r=0.000005 → 究极暴击', G.critOf(0.000005).name, '究极暴击');
eq('r=0.0000005 → 至尊暴击', G.critOf(0.0000005).name, '至尊暴击');
eq('r=0.5 → 无暴击', G.critOf(0.5), null);
eq('十倍 lv1 = 木鱼10×10=100', G.fmt(G.critBase(G.critOf(0.005), 1)), '100');
eq('百倍 lv1 = 10×100=1000', G.fmt(G.critBase(G.critOf(0.0005), 1)), '1000');
eq('超级 lv1 = 晋升1000×1%=10', G.fmt(G.critBase(G.critOf(0.00005), 1)), '10');
eq('超级 lv3 = 晋升10^7×1%=10万', G.fmt(G.critBase(G.critOf(0.00005), 3)), '10万');
eq('至尊 lv3 = 10^7×25%=250万', G.fmt(G.critBase(G.critOf(0.0000005), 3)), '250万');
eq('满级超级 = 10^54×1%=1×10^52', G.fmt(G.critBase(G.critOf(0.00005), 16)), '1×10^52');
/* 增产倍率因子：x型暴击乘倍率，pct型不乘 */
(function () {
  G.clickTs.length = 0;
  G.clickTs.push(Date.now());   // 一次敲击 → +10% 增产
  eq('十倍暴击含增产倍率 100×1.1=110', G.fmt(G.critGain(G.critOf(0.005), 1)), '110');
  eq('超级暴击不含增产倍率', G.fmt(G.critGain(G.critOf(0.00005), 1)), '10');
  G.clickTs.length = 0;
})();

console.log('[12] 设施数量超 2^53 不卡上限（回归）');
(function () {
  G.S.counts = new Array(G.DEV_COUNT).fill(0).map(function () { return { m: 0, e: 0 }; });
  G.S.counts[0] = G.bnFrom(1.7e17);              // 17亿亿，超过 number 精确上限 2^53≈9e15
  G.S.counts[0] = G.add(G.S.counts[0], G.bn(1, 0));
  eq('17亿亿台 +1 正常累加', G.fmt(G.S.counts[0]), '17亿亿');
  eq('超上限后总产出 = 1.7亿亿×0.1', G.fmtRate(G.totalRate()), '1.7亿亿/秒');
  var d = G.makeSaveObj();
  eq('存档数量指数为 17', d.c[0][1], 17);
  eq('存档数量还原显示', G.fmt(G.bn(d.c[0][0], d.c[0][1])), '17亿亿');
  G.S.counts = new Array(G.DEV_COUNT).fill(0).map(function () { return { m: 0, e: 0 }; });
})();

console.log('[13] 批量购买可买数量计算（回归：科学计数解析/精度）');
(function () {
  eq('Number("6.2e+47") 不被截成 6', Number('6.2e+47'), 6.2e47);
  eq('divIntBn 6.2e49/1e49 = 6', G.fmt(G.divIntBn(G.bnFrom(6.2e49), G.devicePrice(15))), '6');
  eq('divIntBn 6.2e49/1e44 = 62万（边界不少1）', G.fmt(G.divIntBn(G.bnFrom(6.2e49), G.devicePrice(14))), '62万');
  eq('divIntBn 1e49/1e49 = 1', G.fmt(G.divIntBn(G.bnFrom(1e49), G.bnFrom(1e49))), '1');
  eq('divIntBn 999/1000 = 0（买不起）', G.fmt(G.divIntBn(G.bnFrom(999), G.bnFrom(1000))), '0');
  eq('divIntBn 1e20/100 = 100亿亿', G.fmt(G.divIntBn(G.bnFrom(1e20), G.devicePrice(0))), '100亿亿');
})();

console.log('[14] 大数榜单编码/解码（大指数不溢出）');
(function () {
  var enc = G.encodeScore(G.bn(1, 969));   // 满级附近总功德 10^969
  eq('encode 10^969 在安全范围', enc, 9690000 + 1000);
  var dec = G.decodeScore(enc);
  eq('decode 10^969 指数', dec.e, 969);
  eq('decode 10^969 尾数≈1', Math.round(dec.m * 100) / 100, 1);
  eq('decode 10^969 显示', G.fmt(dec), '1×10^969');
  var e2 = G.encodeScore(G.bn(9.99, 40));
  var d2 = G.decodeScore(e2);
  eq('encode 9.99e40 往返显示', G.fmt(d2), '9.99×10^40');
})();

console.log('[15] 批量购买大数输入/显示/钳制');
(function () {
  eq('parseBulkNum("1.4e+22") 解析', G.fmt(G.parseBulkNum('1.4e+22')), '140万亿亿');
  eq('parseBulkNum("5000") 解析', G.fmt(G.parseBulkNum('5000')), '5000');
  eq('bnToIntString 大数科学计数', G.bnToIntString(G.bn(1.4, 22)), '1.4e+22');
  eq('bnToIntString 普通整数', G.bnToIntString(G.bnFrom(9999)), '9999');
  eq('clampBn 超上限钳到 1e22', G.fmt(G.clampBn(G.bnFrom(1e30), G.bn(1, 0), G.bn(1, 22))), '100万亿亿');
  eq('clampBn 低于下限钳到 1', G.fmt(G.clampBn(G.bn(0, 0), G.bn(1, 0), G.bn(1, 22))), '1');
})();

console.log(process.exitCode ? '\n存在失败用例！' : '\n全部通过 ✔');
