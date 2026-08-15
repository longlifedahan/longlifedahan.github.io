/**
 * test.js —— Node 冒烟测试（针对 core.js 纯逻辑）
 * 运行：node test.js
 * 覆盖：排行榜编码/解码、波次倍率、商店花费与累乘、积分/本地榜/断点存储。
 */
'use strict';
var assert = require('assert');
var C = require('./js/core.js');

var pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n     ' + e.message); }
}
function eq(a, b, msg) { assert.strictEqual(a, b, msg); }

console.log('== 排行榜编码/解码 ==');
ok('普通分数往返', function () {
  [10, 100, 12345, 999999, 12345678, 1e8, 1.23e12].forEach(function (n) {
    var dec = C.decodeScore(C.encodeScore(n));
    assert(Math.abs(dec - n) / n < 0.0005, n + ' -> ' + dec);
  });
});
ok('编码值在 SDK 允许范围内', function () {
  [1, 1e6, 1e10, 1e50].forEach(function (n) {
    var enc = C.encodeScore(n);
    assert(enc <= 16777215 && enc >= -16777216, 'enc=' + enc);
  });
});
ok('0/负数/非法返回 0', function () {
  eq(C.encodeScore(0), 0);
  eq(C.encodeScore(-5), 0);
  eq(C.encodeScore(NaN), 0);
});

console.log('== 波次成长 ==');
ok('敌机倍率：1、1.05、1.108、1.174（第N轮×4.5+0.5(N-1)%）', function () {
  eq(C.enemyMult(1), 1);
  eq(Math.round(C.enemyMult(2) * 100) / 100, 1.05);
  eq(Math.round(C.enemyMult(3) * 1000) / 1000, 1.108);
  eq(Math.round(C.enemyMult(4) * 1000) / 1000, 1.174);
});
ok('BOSS 倍率（敌机 150%）：1、1.075、1.164、1.268', function () {
  eq(C.bossMul(1), 1);
  eq(Math.round(C.bossMul(2) * 1000) / 1000, 1.075);
  eq(Math.round(C.bossMul(3) * 1000) / 1000, 1.164);
  eq(Math.round(C.bossMul(4) * 1000) / 1000, 1.268);
});
ok('每波敌机数量：200、220、240（+20/轮）', function () {
  eq(C.perWaveCount(1), 200);
  eq(C.perWaveCount(2), 220);
  eq(C.perWaveCount(5), 280);
});
ok('难度信息：默认困难、噩梦/地狱有额外分数', function () {
  eq(C.difficultyInfo('easy').spawn, 0.5);
  eq(C.difficultyInfo('normal').spawn, 0.3);
  eq(C.difficultyInfo('hard').spawn, 0.2);
  eq(C.difficultyInfo('nightmare').spawn, 0.1);
  eq(C.difficultyInfo('hell').spawn, 0.05);
  eq(C.difficultyInfo('nightmare').bonus, 0.10);
  eq(C.difficultyInfo('hell').bonus, 0.20);
  eq(C.difficultyInfo('bad').spawn, 0.2);    // 非法难度回退默认困难
});

console.log('== 商店 ==');
ok('升级花费：机体1000/机关枪40/激光30/高爆弹30 起，累乘10%', function () {
  eq(C.costForLevel('armor', 0), 1000);
  eq(C.costForLevel('armor', 1), 1100);
  eq(C.costForLevel('b1', 0), 40);
  eq(C.costForLevel('b2', 0), 30);
  eq(C.costForLevel('b3', 0), 30);
  eq(C.costForLevel('b3', 1), 33);
});
ok('机体累加：1000 + 10*级数', function () {
  eq(C.armorMaxHp(0), 1000);
  eq(C.armorMaxHp(3), 1030);
});
ok('子弹等级上限 = 机体+10', function () {
  eq(C.bulletLevelCap(0), 10);
  eq(C.bulletLevelCap(5), 15);
});
ok('商店子弹伤害：每级 (dmg+0.1X)×1.001（Lv1 起即提升）', function () {
  eq(C.bulletDamage(10, 0), 10);
  eq(Math.round(C.bulletDamage(10, 1) * 1000) / 1000, 11.011);
  eq(Math.round(C.bulletDamage(10, 2) * 100000) / 100000, 12.02301);
});
ok('总等级 = 四者之和', function () {
  eq(C.playerLevel({ armor: 2, b1: 1, b2: 0, b3: 3 }), 6);
});

console.log('== 数字展示 ==');
ok('fmtNum 万/亿', function () {
  eq(C.fmtNum(999), '999');
  eq(C.fmtNum(12345), '1.2万');
  eq(C.fmtNum(123456789), '1.23亿');
  eq(C.fmtNum(0), '0');
});
ok('fmtNum 大数单位与科学计数', function () {
  eq(C.fmtNum(1e12), '1万亿');
  eq(C.fmtNum(1.5e16), '1.5亿亿');
  eq(C.fmtNum(1e24), '1亿亿亿');
  eq(C.fmtNum(1e41), '1.00*10^41');
});
ok('跳关威力序列：1.04、1.083、1.128（连乘）', function () {
  eq(Math.round(C.jumpMult(1) * 100) / 100, 1.04);
  eq(Math.round(C.jumpMult(2) * 1000) / 1000, 1.083);
  eq(Math.round(C.jumpMult(3) * 1000) / 1000, 1.128);
});
ok('fmtDmg：小于万取整，破万用万、过亿用亿、大单位同 fmtNum', function () {
  eq(C.fmtDmg(12), '12');
  eq(C.fmtDmg(12.6), '13');
  eq(C.fmtDmg(0), '0');
  eq(C.fmtDmg(12345), '1.2万');
  eq(C.fmtDmg(123456789), '1.23亿');
  eq(C.fmtDmg(1e12), '1万亿');
  eq(C.fmtDmg(1e16), '1亿亿');
  eq(C.fmtDmg(1e41), '1.00*10^41');
});
ok('fmtTime 为 mm:ss', function () {
  eq(C.fmtTime(0), '00:00');
  eq(C.fmtTime(65), '01:05');
  eq(C.fmtTime(600), '10:00');
});

console.log('== 掉落 ==');
ok('rollDrop 只返回合法种类', function () {
  var legal = ['bomb', 'b1', 'b2', 'b3', 'life', 'score'];
  for (var i = 0; i < 500; i++) {
    var d = C.rollDrop();
    assert(legal.indexOf(d) >= 0, '非法掉落 ' + d);
  }
});

console.log('== 本地存储 ==');
ok('设置保存/读取 + 敌机上限钳制到 10~50', function () {
  C.saveSettings({ bgm: false, cap: 5, boss: true, showHp: false });
  var s = C.loadSettings();
  eq(s.bgm, false);
  eq(s.cap, 10);            // 低于下限 -> 钳到 10
  C.saveSettings({ bgm: true, cap: 99, boss: false, showHp: true });
  s = C.loadSettings();
  eq(s.cap, 50);            // 高于上限 -> 钳到 50
  eq(s.boss, false);
});
ok('商店等级与积分', function () {
  C.saveUpgrades({ armor: 0, b1: 0, b2: 0, b3: 0 });
  C.addBalance(250);
  eq(C.getBalance(), 250);
  eq(C.spendBalance(110), true);
  eq(C.getBalance(), 140);
  eq(C.spendBalance(999), false);   // 不足
  eq(C.getBalance(), 140);
});
ok('本地榜：按分数降序 + 截断 Top100', function () {
  var lb = [];
  for (var i = 0; i < 120; i++) C.addLocalLB(1000 + (i % 50), 1);
  var arr = C.getLocalLB();
  eq(arr.length, 100);
  for (var k = 1; k < arr.length; k++) {
    assert(arr[k - 1].score >= arr[k].score, '未降序');
  }
  eq(C.bestLocalScore(), arr[0].score);
});
ok('断点快照：保存/读取/清除', function () {
  C.clearCheckpoint();
  eq(C.hasCheckpoint(), false);
  C.saveCheckpoint({ wave: 3, score: 1234, hp: 500, bombs: 5, boss: { hp: 9999, x: 100, y: 150, dir: 1 } });
  var cp = C.loadCheckpoint();
  eq(cp.wave, 3);
  eq(cp.score, 1234);
  eq(cp.boss.hp, 9999);
  eq(C.hasCheckpoint(), true);
  C.clearCheckpoint();
  eq(C.hasCheckpoint(), false);
});
ok('积分取整与边界', function () {
  var before = C.getBalance();
  C.addBalance(5.6);
  eq(C.getBalance(), before + 5);
});

console.log('\n共 ' + (pass + fail) + ' 项，通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
