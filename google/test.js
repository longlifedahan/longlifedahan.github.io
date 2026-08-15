/* 小恐龙快跑 —— Node 冒烟测试（纯逻辑，无需 DOM） */
'use strict';
var G = require('./game.js');
var passed = 0, failed = 0;

function ok(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.log('  ✗ ' + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + '（期望 ' + b + '，实际 ' + a + '）'); }

console.log('== B站分数编码往返 ==');
(function () {
  var samples = [0, 1, 5, 999, 9999, 10000, 12345, 123456, 1234567, 12345678, 99999999, 1e9, 2.5e11];
  for (var i = 0; i < samples.length; i++) {
    var v = samples[i];
    var enc = G.encodeScore(v);
    ok(enc >= 0 && enc <= 16777215, 'encode(' + v + ') 在限内，enc=' + enc);
    var dec = G.decodeScore(enc);
    if (v < 10000) eq(dec, v, '小值 ' + v + ' 精确往返');
    else {
      var rel = Math.abs(dec - v) / v;
      ok(rel < 0.002, v + ' → ' + dec + ' 相对误差 < 0.2%（' + (rel * 100).toFixed(2) + '%）');
    }
  }
  eq(G.encodeScore(9999), 9999, '9999 直接存');
  ok(G.encodeScore(99999999) !== 99999999, '大数被编码压缩（防超限）');
})();

console.log('== 速度曲线 ==');
(function () {
  eq(G.speedAt(0), G.BASE_SPEED, '起点=基础速度');
  var prev = G.speedAt(0);
  for (var d = 1; d < 200000; d *= 10) {
    var s = G.speedAt(d);
    ok(s >= prev, '单调递增 @dist=' + d);
    ok(s <= G.MAX_SPEED, '不超过上限 @dist=' + d);
    prev = s;
  }
  ok(Math.abs(G.speedAt(1e9) - G.MAX_SPEED) < 0.01, '远端逼近上限');
  // 增率递减：每 1000px 的增量应逐步变小
  var inc1 = G.speedAt(2000) - G.speedAt(1000);
  var inc2 = G.speedAt(20000) - G.speedAt(19000);
  ok(inc2 < inc1, '增率递减（越来越慢） inc1=' + inc1.toFixed(2) + ' inc2=' + inc2.toFixed(2));
})();

console.log('== 障碍间隔 ==');
(function () {
  eq(G.gapFor(400, 0), 400 * 0.55 + 140, 'gap 下限');
  eq(G.gapFor(400, 1), 400 * 0.55 + 400, 'gap 上限');
  ok(G.gapFor(860, 0) / 860 > 0.5, '高速下反应时间 >= 0.5s');
  ok(G.gapFor(400, 0, 3000) < G.gapFor(400, 0, 0), '3000 米后障碍更密');
  ok(G.gapFor(400, 0, 10000) < G.gapFor(400, 0, 3000), '10000 米后更密');
})();

console.log('== 本地/云端合并 ==');
(function () {
  var local = { coins: 100, totalCoins: 500, hi: 900, maxMeters: 3000, owns: { dj: true, life2: false, shield: false }, muted: false };
  var cloud = { coins: 300, totalCoins: 400, hi: 1200, maxMeters: 5000, owns: { dj: false, life2: true, shield: true }, muted: true };
  var m = G.mergeSave(local, cloud);
  eq(m.coins, 300, '金币取高（以总金币高为准）');
  eq(m.totalCoins, 500, '累计取高');
  eq(m.hi, 1200, '最高分取高');
  eq(m.maxMeters, 5000, '最远距离取高');
  ok(m.owns.dj && m.owns.life2 && m.owns.shield, '购买项并集');
  ok(m.muted, '静音取真');
  // 相等金币取本地
  var l2 = { coins: 200, totalCoins: 1, hi: 1, owns: { dj: false }, muted: false };
  var c2 = { coins: 200, totalCoins: 1, hi: 1, owns: { dj: true }, muted: false };
  var m2 = G.mergeSave(l2, c2);
  eq(m2.coins, 200, '金币相等不重复累加');
  ok(m2.owns.dj, '并集仍生效');
  // 空输入
  var m3 = G.mergeSave(null, null);
  eq(m3.coins, 0, '空输入默认 0');
  // GM 标志
  ok(G.defaultSave().gm === false, '默认无 GM');
  var mg = G.mergeSave({ gm: true }, { gm: false });
  ok(mg.gm === true, 'GM 标志并集');
})();

console.log('== fmtNum ==');
(function () {
  eq(G.fmtNum(0), '0', '0');
  eq(G.fmtNum(9999), '9999', '9999');
  eq(G.fmtNum(12345), '1.23万', '1.23万');
  eq(G.fmtNum(100000), '10万', '10万');
  eq(G.fmtNum(123000000), '1.23亿', '1.23亿');
})();

console.log('== 颜色工具 ==');
(function () {
  eq(G.defaultSave().color, G.DEFAULT_COLOR, '默认恐龙色');
  ok(G.validColor('#6cb544') === '#6cb544', '合法 hex 通过');
  ok(!G.validColor('red'), '非法颜色拒绝');
  ok(!G.validColor('#6cb54'), '短 hex 拒绝');
  var d = G.shadeColor('#6cb544', -25);
  ok(G.validColor(d), 'shadeColor 产出合法 hex: ' + d);
  ok(parseInt(d.slice(1), 16) < parseInt('#6cb544'.slice(1), 16), '变暗（用于腿部/描边）');
  var m = G.mergeSave({ color: '#ff0000' }, { color: '#0000ff' });
  eq(m.color, '#ff0000', '颜色合并优先本地');
  var m2 = G.mergeSave({ color: '#ff0000' }, null);
  eq(m2.color, '#ff0000', '云端缺失用本地色');
})();

console.log('== 金币档位 ==');
(function () {
  eq(G.coinCountFor(500, 0), 1, '<1000 米最低 1 枚');
  eq(G.coinCountFor(500, 0.99), 3, '<1000 米最高 3 枚');
  eq(G.coinCountFor(2000, 0.99), 4, '1000-3000 米最高 4 枚');
  eq(G.coinCountFor(5000, 0.99), 5, '3000-10000 米最高 5 枚');
  eq(G.coinCountFor(20000, 0.99), 6, '10000 米以上最高 6 枚');
  var minOk = true;
  for (var m = 0; m < 20000; m += 100) {
    for (var r = 0; r < 1; r += 0.1) {
      var n = G.coinCountFor(m, r);
      if (m < 1000 && (n < 1 || n > 3)) minOk = false;
      if (m >= 1000 && m < 3000 && (n < 2 || n > 4)) minOk = false;
      if (m >= 3000 && m < 10000 && (n < 3 || n > 5)) minOk = false;
      if (m >= 10000 && (n < 4 || n > 6)) minOk = false;
    }
  }
  ok(minOk, '各米数档位金币数均在区间内');
})();

console.log('\n通过 ' + passed + ' 项，失败 ' + failed + ' 项');
process.exit(failed ? 1 : 0);
