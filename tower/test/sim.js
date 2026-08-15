/* 冒烟测试：在 Node 中模拟运行核心逻辑（不加载 ui.js） */
const fs = require('fs');
const path = require('path');

// ---- DOM / 环境桩 ----
global.localStorage = (() => {
  const m = {};
  return {
    getItem: k => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; }
  };
})();
global.window = {};
global.document = { getElementById: () => null };

// ---- 拼接源文件，并暴露 const 引用（同一 eval 作用域，跨文件可见）----
const dir = path.join(__dirname, '..', 'js');
const src = ['data.js', 'game.js', 'save.js', 'rank.js']
  .map(f => fs.readFileSync(path.join(dir, f), 'utf8'))
  .join('\n') +
  '\nglobal.__game = { state: () => G, player: () => G.player, events: () => EVENTS, shopState: () => shopState, bal: () => BAL, monsters: () => MONSTERS, affix: () => MONSTER_AFFIX, tierReward: () => TIER_REWARD, user: () => userState };\n';
eval(src);

// ---- UI 桩 ----
global.uiRender = function () {};
global.uiTickBattle = function () {};
global.toast = function () {};
global.renderShopList = function () {};
global.renderStatus = function () {};

const S = () => __game.state();      // 游戏状态
const P = () => __game.player();     // 玩家属性
const EVENTS = __game.events();
const SS = __game.shopState();       // 商店购买数量

let fails = 0;
function assert(cond, msg) {
  if (!cond) { console.error('断言失败:', msg); fails++; }
  else console.log('  ok:', msg);
}

// ---- 基础公式 ----
console.log('[公式]');
assert(hitChance(10, 10) === 100, '同敏捷必中');
assert(hitChance(5, 10) >= 50 && hitChance(5, 10) < 100, '敏捷差命中下限 50%，且未满必中');

// 闪避按「敏捷差 / 对方敏捷」比例计算：同样的差距，对方敏捷越高闪避越低，封顶 50%
assert(dodgePercent(1500, 1000) === 50, '敏捷差500/对方敏捷1000 → 50%');
assert(dodgePercent(10500, 10000) === 5, '敏捷差500/对方敏捷10000 → 5%');
assert(dodgePercent(1000, 1000) === 0, '同敏捷无闪避');
assert(dodgePercent(2000, 1000) === 50, '闪避封顶 50%');
assert(dodgePercent(0, 0) === 0, '双方敏捷为0无闪避');

assert(attackDamage(100, 0, 1) >= 90, '无防御伤害≈攻击力');
assert(attackDamage(1, 100000, 1) === 1, '最低造成 1 点伤害');
assert(attackDamage(100, 100000, 1) >= 9 && attackDamage(100, 100000, 1) <= 11, '最高减免 90%（100攻vs10万防≈10伤害）');
assert(Math.abs(damageRatio(100, 100) - 0.5) < 0.01, '攻=防 时伤害比例 50%');
assert(damageRatio(100, 100000) <= 0.1, '攻远低于防时减免封顶 90%');
assert(damageRatio(1000, 100) >= 0.9, '攻远高于防时比例接近 100%');
assert(critInfo(5, 5).rate === 10, '基础暴击率 10%');
assert(Math.abs(critInfo(100, 100).rate - 20) < 0.01, '幸运100（跨一档）暴击率≈20%');
assert(Math.abs(critInfo(200, 100).rate - 42.22) < 0.5, '幸运比2倍 → 暴击率约翻倍');
assert(critInfo(100, 1000000).rate === 0.01, '幸运远低于敌人 → 暴击率下限 0.01%');
assert(critInfo(1000000, 100).rate === 100, '幸运碾压敌人 → 暴击率封顶 100%（必暴）');
assert(critInfo(5, 5).mult === 1.5, '基础暴击伤害 150%');
assert(critInfo(1000, 1000).mult === 2.0, '幸运1000 → 暴击伤害 200%');
assert(critInfo(10000, 10000).mult === 2.5, '幸运10000 → 暴击伤害 250%');
assert(maxHpFor({ level: 1, atk: 10, def: 5, agi: 5, luck: 5 }) >= 150, '初始生命合理');

// ---- 完整对局模拟（多局统计） ----
console.log('[模拟对局直至倒下（100 局）]');
const results = [];
for (let run = 0; run < 100; run++) {
  __game.user().level = 1; __game.user().xp = 0; // 每局从用户等级 1 开始，测基础平衡
  newGame();
  let battles = 0, shops = 0, events = 0;
  let maxFloor = 0, gameover = false, guard = 0;
  while (guard++ < 300000 && !gameover) {
    if (S().state === 'battle') { skipBattle(); battles++; }
    else if (S().state === 'victory') advanceFloor();
    else if (S().state === 'shop') {
      const p = P();
      if (p.hp < p.maxHp * 0.8 && p.gold >= 25) { // 无胜利回血，商城多补血
        const pot = shopItems(S().floor).find(x => x.id === 'pot');
        SS.pot = Math.max(1, Math.min(6, Math.floor(p.gold / pot.price)));
        buyItem('pot');
      }
      if (p.gold > 45 && Math.random() < 0.8) {
        // 优先买经验（升级=满血+属性），其次攻击/防御
        const id = ['exp', 'exp', 'atk', 'def'][Math.floor(Math.random() * 4)];
        SS[id] = Math.max(1, Math.floor(Math.random() * 3));
        buyItem(id);
      }
      shops++;
      advanceFloor();
    } else if (S().state === 'event') {
      const ev = S().lastEvent || pickEvent();
      chooseEvent(Math.floor(Math.random() * ev.choices.length));
      events++;
    } else if (S().state === 'eventResult') advanceFloor();
    else if (S().state === 'egg') advanceFloor();
    else if (S().state === 'gameover') { gameover = true; break; }
    if (S().floor > maxFloor) maxFloor = S().floor;
    if (P().hp < 0) { console.error('生命为负！'); fails++; }
  }
  results.push({ maxFloor, level: P().level, battles, shops, events });
  if (!gameover) { console.error('第 ' + (run + 1) + ' 局疑似死循环'); fails++; }
}
const reach30 = results.filter(r => r.maxFloor >= 30).length;
const reach50 = results.filter(r => r.maxFloor >= 50).length;
const avg = results.reduce((a, r) => a + r.maxFloor, 0) / results.length;
const best = Math.max(...results.map(r => r.maxFloor));
console.log('  平均 ' + avg.toFixed(1) + ' 层，最高 ' + best + ' 层；到达 30 层以上 ' + reach30 + '/100，到达 50 层以上 ' + reach50 + '/100');
assert(reach30 >= 75, '大部分对局能到达 30 层以上（当前 ' + reach30 + '/100）');
assert(reach50 >= 40, '相当一部分对局能到达 50 层以上（当前 ' + reach50 + '/100）');

// ---- 正常玩家成长模拟（挂机策略：补血 + 按 4:3:2:1 买四属性）----
// 反映真实玩家的正常成长，护栏：平均能玩到 100 层，且不会无限冲层到 3000
console.log('[正常玩家成长（挂机策略 40 局）]');
const idleResults = [];
for (let run = 0; run < 40; run++) {
  __game.user().level = 1; __game.user().xp = 0;
  newGame();
  S().idleAlloc = { atk: 4, def: 3, agi: 2, luck: 1 };
  let guard = 0, idleGameover = false;
  while (guard++ < 300000 && !idleGameover && S().floor < 3000) {
    const st = S().state;
    if (st === 'battle') skipBattle();
    else if (st === 'victory') advanceFloor();
    else if (st === 'shop') { let g2 = 0; while (S().state === 'shop' && g2++ < 50) idleShop(); }
    else if (st === 'event') { const ev = S().lastEvent || pickEvent(); chooseEvent(Math.floor(Math.random() * ev.choices.length)); }
    else if (st === 'eventResult') advanceFloor();
    else if (st === 'egg') advanceFloor();
    else if (st === 'gameover') { idleGameover = true; break; }
  }
  idleResults.push(S().floor);
  if (!idleGameover && S().floor < 3000) { console.error('第 ' + (run + 1) + ' 局疑似死循环'); fails++; }
}
const iAvg = idleResults.reduce((a, r) => a + r, 0) / idleResults.length;
const iMax = Math.max(...idleResults);
const hit3000 = idleResults.filter(f => f >= 3000).length;
const i100 = idleResults.filter(f => f >= 100).length;
const i500 = idleResults.filter(f => f >= 500).length;
console.log('  平均 ' + iAvg.toFixed(1) + ' 层，最高 ' + iMax + ' 层；到达 100 层以上 ' + i100 + '/40，到达 500 层以上 ' + i500 + '/40，到达 3000 层 ' + hit3000 + '/40');
assert(i100 >= 38, '绝大多数正常玩家能过 100 层（当前 ' + i100 + '/40）');
assert(iAvg >= 300, '正常玩家（挂机）平均能过 300 层（一半以上过 300，当前 ' + iAvg.toFixed(1) + '）');
assert(i500 >= 4, '有幸运玩家能冲过 500 层（少数 10-20%，当前 ' + i500 + '/40）');
assert(hit3000 === 0, '正常玩家不会无限冲层到 3000（当前触顶 ' + hit3000 + '/40）');

// ---- 存档/读档往返 ----
console.log('[存档读档]');
saveSlot(0);
const d = loadSlotData(0);
assert(!!d && d.floor === S().floor && d.player.level === P().level, '存档内容一致');
const saved = JSON.stringify(P());
loadGameFromData({ ...d, player: { ...d.player } });
assert(JSON.stringify(P()) === saved, '读档还原玩家属性');
assert(S().floorType === d.floorType, '读档还原楼层类型');
deleteSlot(0);
assert(loadSlotData(0) === null, '删除存档成功');

// ---- 确定性楼层生成 ----
console.log('[确定性]');
const type1 = S().floorType;
const enemy1 = S().enemy ? { ...S().enemy } : null;
buildFloor();
assert(type1 === S().floorType, '楼层类型由种子确定');
if (enemy1) assert(enemy1.hp === S().enemy.hp && enemy1.atk === S().enemy.atk, '敌人属性由种子确定');

// ---- 事件惩罚不死人 ----
console.log('[事件惩罚]');
P().hp = 3;
EVENTS.forEach(ev => ev.choices.forEach(ch => { ch.run(P()); }));
assert(P().hp >= 1, '事件惩罚不会杀死主角');
assert(P().atk >= 1 && P().def >= 1 && P().agi >= 1 && P().luck >= 1, '事件属性惩罚不会降到 0 以下');
P().hp = P().maxHp;

// ---- 新规则校验 ----
console.log('[新规则]');
{
  // 楼层类型：战斗80% / 事件15% / 随机商城5%（随机商城计入层数）
  let b = 0, e = 0, s = 0;
  const rng = mulberry32(12345);
  for (let i = 0; i < 10000; i++) {
    const t = rollFloorType(rng);
    if (t === 'battle') b++; else if (t === 'event') e++; else s++;
  }
  assert(Math.abs(b / 10000 - 0.80) < 0.02 && Math.abs(s / 10000 - 0.05) < 0.02,
    '楼层比例 战斗80%/事件15%/商城5%（' + (b / 100) + '%/' + (e / 100) + '%/' + (s / 100) + '%）');
}
{
  // 每满 5 层插入一次不计层数的固定商城；若第 5 层本身是随机商城则不再连锁
  newGame();
  const g = S();
  g.floor = 4; g.pendingShop = false; g.floorType = 'battle'; g.floorSeed = 123;
  buildFloor(); g.state = 'battle';
  skipBattle();               // 赢下第 4 层
  advanceFloor();             // 推进到第 5 层
  assert(g.floor === 5 && g.pendingShop === true, '推进到第 5 层后置位待商城');
  const fifthIsShop = g.state === 'shop';
  if (g.state === 'battle') skipBattle();
  else if (g.state === 'event') { const ev = g.lastEvent || pickEvent(); chooseEvent(0); }
  advanceFloor();             // 离开第 5 层
  if (fifthIsShop) {
    assert(g.floor === 6 && g.pendingShop === false, '第5层为随机商城：离开后直接进入第 6 层（随机商城计入层数）');
  } else {
    assert(g.floorType === 'shop' && g.floor === 5, '每满 5 层插入固定商城且不记录层数');
    advanceFloor();           // 离开固定商城
    assert(g.floor === 6 && g.pendingShop === false, '离开固定商城后继续第 6 层');
  }
  clearBattleTimer();
}
{
  // 连续商城防护：离开商城后，下一格必不为商城
  newGame();
  const g = S();
  g.floor = 7; g.pendingShop = false; g.floorType = 'shop'; g.floorSeed = 123;
  buildFloor(); g.state = 'shop';
  advanceFloor(); // 离开随机商城
  assert(g.floorType !== 'shop', '商城后下一格不是商城');
  clearBattleTimer();
}
{
  // boss 战前必出商城（不计层数）；离开战前商城后进入 boss 战斗（层数不变）
  let bossSeed = -1;
  for (let s = 0; s < 500000; s++) {
    const first = mulberry32(s)();          // rollFloorType 用的第一个值
    const rng = mulberry32(s); rng();       // buildFloor 跳过后的值
    if (first < 0.85 && pickMonsterTier(rng, 100).label === '首领') { bossSeed = s; break; }
  }
  assert(bossSeed >= 0, '找到会生成首领的种子');
  resetPlayer();
  const g = S();
  g.floor = 99; g.pendingShop = false; g.pendingBoss = false; g.floorType = 'battle'; g.floorSeed = 123;
  buildFloor(); g.state = 'battle';
  skipBattle(); // 赢下第 99 层
  const origRandom = Math.random;
  Math.random = () => bossSeed / 0x7fffffff;
  advanceFloor(); // 推进到 100 层：首领 → 战前商城
  Math.random = origRandom;
  assert(g.floor === 100 && g.floorType === 'shop' && g.pendingBoss === true, 'boss 战前生成战前商城（不计层数）');
  advanceFloor(); // 离开战前商城 → boss 战斗
  assert(g.state === 'battle' && g.enemy.tier === '首领' && g.floor === 100, '离开战前商城后进入 boss 战斗（层数不变）');
  clearBattleTimer();
}
{
  // 升级成长随等级线性增长
  const BAL2 = __game.bal();
  const gAt = L => BAL2.atkPerLevelBase + Math.floor(L * BAL2.atkPerLevelPer);
  const dAt = L => BAL2.defPerLevelBase + Math.floor(L * BAL2.defPerLevelPer);
  assert(gAt(20) > gAt(10) && gAt(10) > gAt(1), '升级加点随等级线性增长（攻 Lv1=' + gAt(1) + '，Lv10=' + gAt(10) + '，Lv20=' + gAt(20) + '）');
  assert(dAt(20) > dAt(1), '防御加点同样线性增长（Lv1=' + dAt(1) + '，Lv20=' + dAt(20) + '）');
}
{
  // 事件库：至少 100 项，每项至少 4 个选项
  assert(EVENTS.length >= 100, '事件库至少 100 项（当前 ' + EVENTS.length + '）');
  const minChoices = Math.min.apply(null, EVENTS.map(ev => ev.choices.length));
  assert(minChoices >= 4, '每个事件至少 4 个选项（最少 ' + minChoices + '）');
}
{
  // 怪物：至少 100 种；词条 20 种，平均加成 1.0-1.1
  const M = __game.monsters();
  const total = Object.keys(M).reduce((s, k) => s + M[k].length, 0);
  assert(total >= 100, '怪物种类至少 100 种（当前 ' + total + '）');
  const A = __game.affix();
  assert(A.length === 20, '词条 20 种');
  const avgAffix = A.reduce((s, a) => s + (a.atk + a.def + a.agi + a.hp + a.luck) / 5, 0) / A.length;
  assert(avgAffix >= 1.0 && avgAffix <= 1.1, '词条平均加成 1.0-1.1（当前 ' + avgAffix.toFixed(3) + '）');
}
{
  // 怪物级别概率：默认 低72/中17/高6/首领5；10倍数层 低52/中30/高10/首领8；100层前无首领
  resetPlayer();
  const countsAt = (floor, n) => {
    const c = { '低': 0, '中': 0, '高': 0, '首领': 0 };
    for (let i = 0; i < n; i++) c[genEnemy(floor, mulberry32(1000 + i)).tier]++;
    return c;
  };
  const pct = (c, k) => c[k] / 20000;
  const base = countsAt(101, 20000);
  assert(Math.abs(pct(base, '低') - 0.72) < 0.02 && Math.abs(pct(base, '中') - 0.17) < 0.02 &&
    Math.abs(pct(base, '高') - 0.06) < 0.02 && Math.abs(pct(base, '首领') - 0.05) < 0.01,
    '默认概率 低72/中17/高6/首领5（实际 ' + (pct(base, '低') * 100).toFixed(1) + '/' + (pct(base, '中') * 100).toFixed(1) + '/' + (pct(base, '高') * 100).toFixed(1) + '/' + (pct(base, '首领') * 100).toFixed(1) + '）');
  const boost = countsAt(110, 20000);
  assert(Math.abs(pct(boost, '低') - 0.52) < 0.02 && Math.abs(pct(boost, '中') - 0.30) < 0.02 &&
    Math.abs(pct(boost, '高') - 0.10) < 0.02 && Math.abs(pct(boost, '首领') - 0.08) < 0.01,
    '10倍数层 低52/中30/高10/首领8（实际 ' + (pct(boost, '低') * 100).toFixed(1) + '/' + (pct(boost, '中') * 100).toFixed(1) + '/' + (pct(boost, '高') * 100).toFixed(1) + '/' + (pct(boost, '首领') * 100).toFixed(1) + '）');
  const pre100 = countsAt(50, 20000);
  assert(pre100['首领'] === 0, '100层前不出首领');
}
{
  // 总属性系数 1.0/1.2/1.5/2.0（100 层以上统计）
  resetPlayer();
  const cnt = { '低': 0, '中': 0, '高': 0, '首领': 0 };
  const sum = { '低': 0, '中': 0, '高': 0, '首领': 0 };
  for (let i = 0; i < 60000; i++) {
    const e = genEnemy(101, mulberry32(1000 + i));
    cnt[e.tier]++;
    sum[e.tier] += e.atk + e.def + e.agi + e.luck + e.hp / 10;
  }
  const base = sum['低'] / cnt['低'];
  const ratio = k => sum[k] / cnt[k] / base;
  assert(Math.abs(ratio('中') - 1.1) < 0.12, '中级别总属性约 1.1x（实际 ' + ratio('中').toFixed(2) + '）');
  assert(Math.abs(ratio('高') - 1.2) < 0.15, '高级别总属性约 1.2x（实际 ' + ratio('高').toFixed(2) + '）');
  assert(Math.abs(ratio('首领') - 1.5) < 0.2, '首领总属性约 1.5x（实际 ' + ratio('首领').toFixed(2) + '）');
}
{
  // 事件属性奖励随等级提升
  P().level = 1;
  const boostL1 = eventBoost();
  P().level = 9;
  const boostL9 = eventBoost();
  assert(boostL9 > boostL1, '事件属性奖励随等级提升（Lv1=' + boostL1 + '，Lv9=' + boostL9 + '）');
  P().level = 1;
  recalcHp();
}
{
  // 商城：属性价格固定不变；经验 1 金币 = 5 经验；补血 1 金币 = 25 生命；已移除「满血恢复」
  P().level = 1;
  const s1 = shopItems();
  P().level = 30;
  const s30 = shopItems();
  const priceOf = (list, id) => list.find(x => x.id === id).price;
  assert(priceOf(s1, 'atk') === priceOf(s30, 'atk') && priceOf(s1, 'def') === priceOf(s30, 'def'),
    '单属性价格不变（不随属性/等级变化）');
  assert(!s1.some(x => x.id === 'full'), '已移除「满血恢复」');
  assert(priceOf(s1, 'exp') === 10, '经验卷价格 10 金币');
  rollShopPrices();
  const sp = S().shopPrices;
  assert(sp.atk >= 30 && sp.atk <= 50 && sp.def >= 25 && sp.def <= 45 && sp.agi >= 20 && sp.agi <= 40 && sp.luck >= 15 && sp.luck <= 35, '商城属性价格在基础值 ±10 内浮动');
  P().gold = 100;
  P().exp = 0;
  const beforeExp = P().exp;
  SS.exp = 1;
  buyItem('exp'); // 花 10 金币 → +50 经验
  assert(P().exp === beforeExp + 50, '经验卷 1 金币 = 5 经验（10 金币 → 50 经验）');
  P().level = 1;
  recalcHp();
}
{
  // 药水：250 生命 = 1 金币；最多补满，不能超买
  resetPlayer();
  P().hp = Math.floor(P().maxHp * 0.5);
  const pot = shopItems().find(x => x.id === 'pot');
  assert(pot.heal / 250 === pot.price, '药水定价 250 生命 = 1 金币（' + pot.heal + ' 生命 / ' + pot.price + ' 金币）');
  P().gold = 99999;
  SS.pot = 99;
  const maxQ = itemMaxQ(pot, P());
  assert(maxQ <= Math.ceil((P().maxHp - P().hp) / pot.heal), '药水不能超买（上限补满）');
  buyItem('pot');
  assert(P().hp === P().maxHp, '买药水最多恢复到满血');
  resetPlayer();
}
{
  assert(S().speed === 2, '默认战斗速度 2x');
  assert(S().idleSpeed === 200, '挂机速度默认 200ms');
}
{
  // 奖励系数：低1.0 / 中1.1 / 高1.2 / 首领1.5
  const TR = __game.tierReward();
  assert(TR['低'] === 1.0 && TR['中'] === 1.1 && TR['高'] === 1.2 && TR['首领'] === 1.5, '级别奖励系数 1.0/1.1/1.2/1.5');
}
{
  // 击杀奖励浮动：多次调用应出现不同数值（高等级下才不受 5 点兜底影响）
  P().level = 30;
  const vals = new Set();
  for (let i = 0; i < 30; i++) vals.add(expReward(20));
  assert(vals.size > 1, '经验奖励具有随机性');
  const gvals = new Set();
  for (let i = 0; i < 30; i++) gvals.add(goldReward(20));
  assert(gvals.size > 1, '金币奖励具有随机性');
  P().level = 1;
  recalcHp();
}
{
  // 属性掉落：按当前值百分比向随机属性加成
  resetPlayer();
  const before = [P().atk, P().def, P().agi, P().luck];
  dropAttributesPercent(2, 0.01);
  const after = [P().atk, P().def, P().agi, P().luck];
  let hit = 0, gained = 0;
  for (let i = 0; i < 4; i++) {
    const g = after[i] - before[i];
    if (g !== 0) {
      assert(g === Math.max(1, Math.round(before[i] * 0.01)), '掉落按当前值 1% 加成（' + before[i] + ' → +' + g + '）');
      hit++; gained += g;
    }
  }
  assert(hit === 2 && gained > 0, '掉落作用于 2 项属性（合计 +' + gained + '）');
}
{
  // 升级加点明细：记录的具体值与属性实际变化一致
  resetPlayer();
  S().levelGains = { count: 0, atk: 0, def: 0, agi: 0, luck: 0 };
  const b = { atk: P().atk, def: P().def, agi: P().agi, luck: P().luck };
  addExp(expNeeded(1));
  assert(S().levelGains.count === 1, '记录升级次数');
  assert(P().atk - b.atk === S().levelGains.atk && P().def - b.def === S().levelGains.def && P().luck - b.luck === S().levelGains.luck, '升级加点明细与属性变化一致');
}
{
  // 挂机属性分配：按比例一次性购买（整轮 4:3:2:1，余钱优先买比重高的）
  resetPlayer();
  P().gold = 10000; P().hp = P().maxHp;
  S().idleAlloc = { atk: 4, def: 3, agi: 2, luck: 1 };
  const before = { atk: P().atk, def: P().def, agi: P().agi, luck: P().luck };
  idleBuyAttributes();
  const gained = { atk: P().atk - before.atk, def: P().def - before.def, agi: P().agi - before.agi, luck: P().luck - before.luck };
  assert(gained.atk >= gained.def && gained.def >= gained.agi && gained.agi >= gained.luck, '按比例购买（攻≥防≥敏≥运）');
  assert(P().gold >= 0, '一次性购买后金币不为负');
  S().idleAlloc = { atk: 4, def: 3, agi: 2, luck: 1 };
}
{
  // 用户等级：升级所需经验 = 等级 × 2
  const U = __game.user();
  U.level = 1; U.xp = 0;
  assert(userXpNeeded(1) === 2 && userXpNeeded(5) === 10, '升级所需经验 = 等级 × 2');
  addUserXp(2);
  assert(U.level === 2 && U.xp === 0, '经验满 2 升到 2 级');
  addUserXp(8); // 2级需4 → 升3级(剩4)，3级需6 → 停
  assert(U.level === 3 && U.xp === 4, '逐级升级（2→3 需 4，剩余 4 经验）');
}
{
  // 用户等级 → 开局随机属性加成：每级 +1 点 ×10
  const U = __game.user();
  U.level = 5; U.xp = 0;
  const baseSum = 15 + 8 + 8 + 5;
  resetPlayer();
  const total = P().atk + P().def + P().agi + P().luck;
  assert(total === baseSum + 50, '用户等级 5 → 开局 +50 点随机属性（实测 +' + (total - baseSum) + '）');
  U.level = 1; U.xp = 0;
}
{
  // 挂机商城：生命未满但买不起药水时，不应卡死，最终应退出商城
  resetPlayer();
  P().hp = 1; P().gold = 0;
  S().state = 'shop'; S().floorType = 'shop';
  S().floor = 1; S().floorSeed = 123; S().pendingShop = false;
  const done = idleShop();
  assert(done === true && S().state !== 'shop', '挂机买不起任何东西时自动退出商城');
  clearBattleTimer();
}
{
  // 挂机商城：正常购买（补血 + 四属性）后退出商城
  resetPlayer();
  P().gold = 500; P().hp = Math.floor(P().maxHp * 0.3);
  S().state = 'shop'; S().floorType = 'shop';
  S().floor = 1; S().floorSeed = 123; S().pendingShop = false;
  let guard = 0;
  while (S().state === 'shop' && guard++ < 300) idleShop();
  assert(S().state !== 'shop', '挂机正常购买后退出商城');
  assert(P().gold >= 0, '挂机购买后金币不为负');
  clearBattleTimer();
}

// ---- 关注复活流程（模拟 B站 SDK） ----
(async function () {
  console.log('[关注复活]');
  window.toy = {
    isSupport: () => Promise.resolve(true),
    getAuthorRelation: () => Promise.resolve({ status: 'ok', data: { isFollowing: true } }),
    navigate: () => Promise.resolve(),
    submitScore: () => Promise.resolve({ score: 0 }),
    getRankList: () => Promise.resolve([]),
    getMyRank: () => Promise.resolve({ ranked: false, rank: 0, score: 0 })
  };
  await waitSdkReady();
  const S2 = S();

  // 已关注：死亡自动复活并给 3 条命
  resetPlayer();
  S2.floor = 5; S2.floorType = 'battle'; S2.floorSeed = 123; S2.lives = 0; S2.goMode = 'normal';
  buildFloor(); S2.state = 'battle'; P().hp = 0;
  clearBattleTimer(); onPlayerDeath();
  await new Promise(r => setTimeout(r, 20));
  assert(S2.lives === 3, '已关注：死亡后获得 3 条命');
  assert(S2.state !== 'gameover', '已关注：原地复活，未进入结算');
  assert(P().hp === P().maxHp, '复活后生命回满');

  // 未关注：进入关注引导结算页
  window.toy.getAuthorRelation = () => Promise.resolve({ status: 'ok', data: { isFollowing: false } });
  S2.lives = 0; S2.followRevived = false; P().hp = 0; S2.state = 'battle';
  clearBattleTimer(); onPlayerDeath();
  await new Promise(r => setTimeout(r, 20));
  assert(S2.goMode === 'follow' && S2.state === 'gameover', '未关注：展示关注引导结算页');

  // 作者本人（isAuthor=true，未关注）：也可复活
  window.toy.getAuthorRelation = () => Promise.resolve({ status: 'ok', data: { isFollowing: false, isAuthor: true } });
  S2.lives = 0; S2.followRevived = false; P().hp = 0; S2.state = 'battle';
  clearBattleTimer(); onPlayerDeath();
  await new Promise(r => setTimeout(r, 20));
  assert(S2.lives === 3 && S2.state !== 'gameover', '作者本人（isAuthor）也可复活');

  // 已有命时死亡：扣 1 条命并复活
  window.toy.getAuthorRelation = () => Promise.resolve({ status: 'ok', data: { isFollowing: true } });
  S2.lives = 2; P().hp = 0; S2.state = 'battle';
  clearBattleTimer(); onPlayerDeath();
  await new Promise(r => setTimeout(r, 20));
  assert(S2.lives === 1, '已有命：死亡扣 1 条命并复活（2→1）');
  assert(S2.state !== 'gameover', '已有命：复活继续');

  // 已用过关注复活后命尽：真死，不再无限循环复活
  window.toy.getAuthorRelation = () => Promise.resolve({ status: 'ok', data: { isFollowing: true } });
  S2.lives = 0; S2.followRevived = true; P().hp = 0; S2.state = 'battle';
  clearBattleTimer(); onPlayerDeath();
  await new Promise(r => setTimeout(r, 20));
  assert(S2.state === 'gameover' && S2.goMode === 'normal', '命尽且已用过关注复活：真死，不再循环');

  // 复活保留敌人受损血量
  resetPlayer();
  S2.floor = 6; S2.floorType = 'battle'; S2.floorSeed = 123; S2.lives = 1; S2.followRevived = false; S2.goMode = 'normal';
  buildFloor(); S2.state = 'battle';
  const enemyHp = Math.floor(S2.enemy.maxHp / 2);
  S2.enemy.hp = enemyHp; // 敌人被打掉一半血
  P().hp = 0;
  clearBattleTimer(); onPlayerDeath(); // 有命 → 复活
  await new Promise(r => setTimeout(r, 20));
  assert(S2.enemy.hp === enemyHp, '复活后敌人保留受损血量');
  assert(S2.state === 'battle', '复活后重新进入战斗');

  // 非 B站 环境：无命，直接结算
  window.toy = null;
  S2.lives = 0; S2.followRevived = false; P().hp = 0; S2.state = 'battle';
  clearBattleTimer(); onPlayerDeath();
  await new Promise(r => setTimeout(r, 20));
  assert(S2.goMode === 'normal' && S2.state === 'gameover', '非B站环境：无命，直接进入普通结算');

  clearBattleTimer();
  console.log(fails === 0 ? '\n全部通过 ✓' : '\n有 ' + fails + ' 处失败 ✗');
  process.exit(fails === 0 ? 0 : 1);
})();
