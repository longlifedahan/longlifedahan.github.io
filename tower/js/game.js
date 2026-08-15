/* ==================== 核心逻辑：属性 / 战斗 / 升级 / 商店 / 地图 ==================== */

/* ---------- 全局状态 ---------- */
const G = {
  state: 'menu',          // menu | battle | victory | shop | event | eventResult | gameover
  floor: 1,
  floorType: null,        // battle | shop | event
  floorSeed: 0,
  player: null,
  enemy: null,
  eventIdx: 0,
  lastEvent: null,
  lastOutcome: '',
  victory: null,
  egg: null,              // 彩蛋内容（floorType='egg' 时展示）
  kills: 0,
  floorsCleared: 0,
  goldEarned: 0,
  startedAt: 0,
  battleTimer: null,
  lives: 0,              // 每局独立的命（仅 B站 环境存在）
  followRevived: false,  // 本局是否已用过「关注复活」（每局仅一次，避免无限复活）
  goMode: 'normal',      // 结算页形态：normal | follow
  pendingShop: false,    // 每满 5 层后下一站是否为固定商城（不计层数）
  pendingBoss: false,    // 战前商城后待进入的 boss 战斗
  pendingBossSeed: 0,
  shopPrices: null,      // 本次商城的属性价格（基础值 ±10 金币浮动）
  speed: 2,              // 战斗速度倍率（1-5，默认 2）
  idle: false,           // 挂机模式
  exitIdleOnDeath: true, // 死亡后退出挂机（含复活后的每次死亡）
  idleSpeed: 200,        // 挂机楼层操作间隔（ms，10-1000，购买仍固定 10ms）
  idleAlloc: { atk: 4, def: 3, agi: 2, luck: 1 }, // 挂机商城属性购买比例（总和 10）
  levelGains: { count: 0, atk: 0, def: 0, agi: 0, luck: 0 }, // 本次升级加点明细（用于提示）
  userLvUps: 0 // 本次游戏内用户等级提升次数
};

let battleLog = [];
let battleRound = 0; // 当前战斗回合计数（随战斗日志一起重置）
let logRendered = 0;
let idleTimer = null;

/* ---------- 可调数值（集中在此，方便平衡） ---------- */
const BAL = {
  // 经验：幂函数成长（温和不爆表），同级怪约 3.5-4 场战斗升 1 级
  expBase: 15, expPow: 1.5, expBattleRatio: 3.75,
  // 升级成长：随等级线性增长（例如 10 级时每次升级加点约为 1 级的 1.5-2 倍）
  atkPerLevelBase: 3, atkPerLevelPer: 0.35, atkPerLevelPow: 0.04,
  defPerLevelBase: 2, defPerLevelPer: 0.2, defPerLevelPow: 0.003,
  agiPerLevelBase: 2, agiPerLevelPer: 0.2, agiPerLevelPow: 0.003,
  luckPerLevelBase: 1, luckPerLevelPer: 0.12, luckPerLevelPow: 0.02,
  levelPowExp: 1.5, // 升级加点中等级幂项指数（L^levelPowExp）；后期成长略增、幸运增幅最明显
  // 生命公式（玩家与怪物共用）：等级幂函数 b×L^a + 四维线性；防御权重最高，攻击其次，敏捷/幸运同权重
  hpBase: 100, hpPowBase: 9, hpPowExp: 1.25, hpDef: 5, hpAtk: 1.5, hpAgi: 1, hpLuck: 1,
  // 命中/闪避：命中下限 50%，闪避上限 50%
  hitFloor: 50, dodgeCap: 50,
  // 暴击：幸运 <1000 每点 +0.1% 暴击率；幸运 >500 每点 +0.1% 暴击伤害（基础倍率 1.5-2.5）
  // 伤害：基于「攻-防」差的比例（最高减免 90%，最低 1 点）
  dmgVarMin: 0.9, dmgVarMax: 1.1, dmgRatioMin: 0.1, dmgRatioMax: 1.0,
  // 敌人：以怪物自身等级为基数（statsAtLevel 与玩家同曲线二次成长），级别系数 + 层数系数提供递增压力；
  //       四维（攻/防/敏/运）以自身等级四维均值为基准均衡分配，幸运不再偏低；
  //       生命按自身等级与四维实时计算（词条可修正）；玩家属性仅按「超标幅度」小幅修正
  enemyFloorMultBase: 1.0, enemyFloorMultPer: 0.007, enemyFloorMultMax: 50,
  enemyStatRatio: 1.8, // 怪物四维整体强度系数（单一控制，方便平衡）
  enemyPlayerInfluence: 0.15, // 玩家属性影响系数：1 = 完全跟随玩家，0 = 纯怪物等级；0.15 为小幅修正
  // 战斗奖励（只有升级满血与商城补血，胜利不回血）
  goldRewardBase: 30, goldRewardPer: 5,
  goldExpBase: 2.5, goldExpPow: 1.45, // 金币：前期保底、后期幂函数增速放缓，避免玩家属性增长过快导致无限冲层
  // 战斗节奏
  turnDelay: 420
};

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

/* 确定性随机数（mulberry32），用于地图/敌人按层生成，杜绝读档刷图 */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 角色属性 ---------- */
function resetPlayer() {
  G.player = { level: 1, exp: 0, gold: 0, atk: 15, def: 8, agi: 8, luck: 5, hp: 0, maxHp: 0, hpMult: 1 }; // hpMult：事件提供的生命上限倍率（如大贤者+20%）
  // 用户等级属性加持：1-10级 每级1点，11-20级 每级2点，21-30级 每级3点……依次类推 ×10，每局随机分配到四项
  const keys = ['atk', 'def', 'agi', 'luck'];
  let bonus = 0;
  for (let lv = 1; lv <= Math.max(0, userState.level); lv++) bonus += (1 + Math.floor((lv - 1) / 10)) * 10;
  for (let i = 0; i < bonus; i++) G.player[keys[Math.floor(Math.random() * 4)]]++;
  recalcHp();
  G.player.hp = G.player.maxHp;
}

/* 生命公式（玩家与怪物共用）：等级幂函数 b×L^a + 四维线性，幸运与敏捷同权重；整体 ×5 */
function calcMaxHp(L, atk, def, agi, luck) {
  return Math.max(100, Math.floor((BAL.hpBase + BAL.hpPowBase * Math.pow(L, BAL.hpPowExp) + def * BAL.hpDef + atk * BAL.hpAtk + agi * BAL.hpAgi + luck * BAL.hpLuck) * 5));
}

function maxHpFor(p) {
  return Math.max(10, Math.round(calcMaxHp(p.level, p.atk, p.def, p.agi, p.luck) * (p.hpMult || 1)));
}

function recalcHp() {
  const p = G.player; if (!p) return;
  p.maxHp = maxHpFor(p);
  if (p.hp > p.maxHp) p.hp = p.maxHp;
}

function expNeeded(level) {
  return Math.floor(BAL.expBase * Math.pow(level, BAL.expPow));
}

function addExp(n) {
  const p = G.player; if (!p) return;
  p.exp += n;
  if (p.exp < 0) p.exp = 0; // 事件可能扣经验，不为负
  let guard = 0;
  while (p.exp >= expNeeded(p.level) && guard++ < 100) {
    p.exp -= expNeeded(p.level);
    levelUp();
  }
}

function levelUp() {
  const p = G.player;
  p.level++;
  const L = p.level;
  // 成长随等级增长：线性 + 等级幂项（等级越高，每次升级加点越多）
  const ga = BAL.atkPerLevelBase + Math.floor(L * BAL.atkPerLevelPer) + Math.floor(Math.pow(L, BAL.levelPowExp) * BAL.atkPerLevelPow);
  const gd = BAL.defPerLevelBase + Math.floor(L * BAL.defPerLevelPer) + Math.floor(Math.pow(L, BAL.levelPowExp) * BAL.defPerLevelPow);
  const gg = BAL.agiPerLevelBase + Math.floor(L * BAL.agiPerLevelPer) + Math.floor(Math.pow(L, BAL.levelPowExp) * BAL.agiPerLevelPow);
  const gl = BAL.luckPerLevelBase + Math.floor(L * BAL.luckPerLevelPer) + Math.floor(Math.pow(L, BAL.levelPowExp) * BAL.luckPerLevelPow);
  p.atk += ga; p.def += gd; p.agi += gg; p.luck += gl;
  if (G.levelGains) {
    G.levelGains.count++;
    G.levelGains.atk += ga;
    G.levelGains.def += gd;
    G.levelGains.agi += gg;
    G.levelGains.luck += gl;
  }
  p.maxHp = maxHpFor(p);
  p.hp = p.maxHp; // 升级满血
}

/* ---------- 命中 / 闪避 / 暴击 / 伤害 ---------- */
/* 闪避按「敏捷差 / 对方敏捷」的比例计算：同样的差距，对方敏捷越高闪避越低，封顶 50% */
function dodgePercent(defAgi, attAgi) {
  const diff = defAgi - attAgi;
  if (diff <= 0) return 0;
  if (attAgi <= 0) return BAL.dodgeCap;
  return Math.min(BAL.dodgeCap, (diff / attAgi) * 100);
}

function hitChance(attAgi, defAgi) {
  return Math.max(BAL.hitFloor, 100 - dodgePercent(defAgi, attAgi));
}

/* 幸运十进档：以 start 为起点的十进位分档，返回「已跨整档数 + 当前档内进度」（档内线性均匀） */
function luckDecade(luck, start) {
  if (luck <= start) return 0;
  let k = 0, lo = start, hi = start * 10;
  while (luck > hi) { lo = hi; hi *= 10; k++; }
  return k + (luck - lo) / (hi - lo);
}

/* 暴击：基础暴击率 10%，幸运每跨一档（10/100/1000…）+10%（档内线性，可>100%）；
   基础暴击伤害 150%，幸运每跨一档（100/1000/10000…）+50%（累加，档内线性）；
   实际暴击率 = 基础暴击率 × 玩家幸运/敌人幸运（下限0.01%，上限100%=必暴，多余无额外伤害） */
function critInfo(attLuck, defLuck) {
  const baseRate = 10 + 10 * luckDecade(attLuck, 10);
  const baseDmg = 150 + 50 * luckDecade(attLuck, 100);
  let rate;
  if (defLuck <= 0) rate = Math.min(100, baseRate);
  else rate = clamp(baseRate * (attLuck / defLuck), 0.01, 100);
  return { rate, mult: baseDmg / 100 };
}

/* 伤害比例：基于（攻-防）差。攻=防 时 50%，攻远高于防时趋近 100%，攻远低于防时降到 10%（最高减免 90%） */
function damageRatio(atk, def) {
  return clamp(0.5 + 0.5 * (atk - def) / (atk + def), BAL.dmgRatioMin, BAL.dmgRatioMax);
}

function attackDamage(atk, def, mult) {
  const v = BAL.dmgVarMin + Math.random() * (BAL.dmgVarMax - BAL.dmgVarMin);
  const raw = atk * damageRatio(atk, def) * v * mult;
  return Math.max(1, Math.round(raw));
}

/* ---------- 楼层 / 地图生成 ---------- */
/* 战斗:随机事件:随机商城 = 80:15:5（随机商城计入层数）；事件更常见，放大随机性与滚雪球 */
function rollFloorType(rng) {
  const r = rng();
  if (r < 0.80) return 'battle';
  if (r < 0.95) return 'event';
  return 'shop';
}

/* 上一格是商城时，本格不再出商城（战斗:事件 = 80:15 归一化） */
function rollNoShop(rng) {
  const r = rng();
  if (r < 0.80 / 0.95) return 'battle';
  return 'event';
}

/* 用已存的 seed 与 type 生成本层内容（敌人/事件），读档后确定性还原 */
function buildFloor() {
  const rng = mulberry32(G.floorSeed);
  rng(); // 跳过与楼层类型判定共享的首个随机数，避免敌人级别与楼层类型耦合（否则战斗层永远出不了首领）
  if (G.floorType === 'battle') {
    G.enemy = genEnemy(G.floor, rng);
  } else if (G.floorType === 'event') {
    G.eventIdx = Math.floor(rng() * EVENTS.length);
  }
  G.lastEvent = null;
  G.lastOutcome = '';
  G.victory = null;
  battleLog.length = 0;
  battleRound = 0;
  logRendered = 0;
}

/* 怪物级别：默认 低80%/中15%/高4%/首领1%；每逢10倍数层 低60%/中30%/高8%/首领2%；100层前不出首领 */
function pickMonsterTier(rng, floor) {
  const boost = floor % 10 === 0;
  let pLow = boost ? 0.52 : 0.72;
  let pMid = boost ? 0.30 : 0.17;
  let pHigh = boost ? 0.10 : 0.06;
  let pBoss = boost ? 0.08 : 0.05;
  if (floor < 100) pBoss = 0; // 100 层前不出首领，份额按比例分给其余三档
  const total = pLow + pMid + pHigh + pBoss;
  pLow /= total; pMid /= total; pHigh /= total; pBoss /= total;
  const r = rng();
  if (r < pLow) return { pool: MONSTERS.low, mult: 1.0, label: '低' };
  if (r < pLow + pMid) return { pool: MONSTERS.mid, mult: 1.1, label: '中' };
  if (r < pLow + pMid + pHigh) return { pool: MONSTERS.high, mult: 1.2, label: '高' };
  return { pool: MONSTERS.boss, mult: 1.5, label: '首领' };
}

/* 该层数的自然（期望）等级：敌人主按层数成长（约每 3 层 +1 级），
   始终略高于玩家等级，构成持续的压力来源 */
function expectedLevelForFloor(floor) {
  return Math.max(1, Math.round(1 + floor / 3));
}

/* 超过3000层的数值追赶系数：min(75%, 50+层数/1000%, max(10%, 层数/100-30%)) */
function catchUpMult(floor) {
  return Math.min(75, 50 + floor / 1000, Math.max(10, floor / 100 - 30)) / 100;
}

/* 怪物自身等级对应的基础属性（成长曲线与玩家一致，二次成长，跟得上玩家） */
function statsAtLevel(L) {
  let atk = 15, def = 8, agi = 8, luck = 5;
  for (let lv = 2; lv <= L; lv++) {
    atk += BAL.atkPerLevelBase + Math.floor(lv * BAL.atkPerLevelPer);
    def += BAL.defPerLevelBase + Math.floor(lv * BAL.defPerLevelPer);
    agi += BAL.agiPerLevelBase + Math.floor(lv * BAL.agiPerLevelPer);
    luck += BAL.luckPerLevelBase + Math.floor(lv * BAL.luckPerLevelPer);
  }
  return { atk, def, agi, luck };
}

function genEnemy(floor, rng) {
  const p = G.player;
  const v = (a, b) => a + rng() * (b - a);

  // 怪物级别（低/中/高/首领），决定总属性系数 1.0/1.1/1.2/1.5
  const tier = pickMonsterTier(rng, floor);

  const Le = expectedLevelForFloor(floor); // 怪物自身等级（展示与经验系统）
  const floorMult = clamp(BAL.enemyFloorMultBase + (floor - 1) * BAL.enemyFloorMultPer, BAL.enemyFloorMultBase, BAL.enemyFloorMultMax);
  const M = floorMult * tier.mult;

  // 怪物自身等级的基础属性（与玩家同曲线，二次成长，跟得上玩家的成长速度）
  const base = statsAtLevel(Le);

  // 玩家属性小幅修正：仅参考玩家相对其等级基准的「超标」幅度（商城/事件投入），系数很小，
  // 避免敌人完全镜像玩家导致橡皮筋式锁死成长
  const pb = statsAtLevel(Math.max(1, p.level));
  const infl = c => 1 + BAL.enemyPlayerInfluence * (clamp(p[c] / Math.max(1, pb[c]), 0.5, 2) - 1);
  const inflAvg = (infl('atk') + infl('def') + infl('agi') + infl('luck')) / 4;

  // 四维均衡：以自身等级四维均值为基准，±25% 随机分配，幸运不再偏低；
  // 预算 = 四维均值 × 整体强度系数 × 级别系数 × 层数压力 × 玩家小幅修正
  const avgBase = (base.atk + base.def + base.agi + base.luck) / 4;
  const budget = Math.max(4, avgBase * BAL.enemyStatRatio * M * inflAvg);
  const w = { atk: 0.75 + rng() * 0.5, def: 0.75 + rng() * 0.5, agi: 0.75 + rng() * 0.5, luck: 0.75 + rng() * 0.5 };
  const ws = w.atk + w.def + w.agi + w.luck;
  let atk = Math.max(1, Math.round(budget * w.atk / ws));
  let def = Math.max(0, Math.round(budget * w.def / ws));
  let agi = Math.max(1, Math.round(budget * w.agi / ws));
  let luck = Math.max(0, budget - atk - def - agi); // 保证四维总和恒为 budget

  // 超过3000层的数值追赶：若玩家四维均高于怪物四维，则怪物四维各按追赶项加成，防止后期数值崩坏
  if (G.floor > 3000) {
    const mult = catchUpMult(G.floor);
    if (p.atk > atk && p.def > def && p.agi > agi && p.luck > luck) {
      atk += (p.atk - atk) * mult;
      def += (p.def - def) * mult;
      agi += (p.agi - agi) * mult;
      luck += (p.luck - luck) * mult;
    }
  }

  // 生命：与玩家共用同一公式（等级幂函数 + 四维线性），词条可修正生命
  const hp0 = Math.max(40, calcMaxHp(Le, atk, def, agi, luck));

  // 词条：不同属性加成，平均约 1.0-1.1
  const affix = MONSTER_AFFIX[Math.floor(rng() * MONSTER_AFFIX.length)];
  return {
    name: affix.name + tier.pool[Math.floor(rng() * tier.pool.length)],
    affix: affix.name,
    tier: tier.label,
    level: Le,
    floor,
    hp: Math.max(40, Math.round(hp0 * affix.hp)),
    maxHp: Math.max(40, Math.round(hp0 * affix.hp)),
    atk: Math.max(1, Math.round(atk * affix.atk)),
    def: Math.max(0, Math.round(def * affix.def)),
    agi: Math.max(1, Math.round(agi * affix.agi)),
    luck: Math.max(0, Math.round(luck * affix.luck))
  };
}

/* ---------- 流程控制 ---------- */
function newGame() {
  clearBattleTimer();
  resetPlayer();
  G.kills = 0; G.floorsCleared = 0; G.goldEarned = 0; G.startedAt = Date.now();
  G.lives = 0; G.followRevived = false; G.goMode = 'normal'; // 命每局独立，关注复活每局一次
  G.speed = 2; // 默认战斗速度 2x
  G.idle = false;
  G.userLvUps = 0; // 每局重新统计用户升级次数
  G.floor = 1;
  G.pendingShop = false;
  G.pendingBoss = false;
  G.floorSeed = (Math.random() * 0x7fffffff) >>> 0;
  G.floorType = rollFloorType(mulberry32(G.floorSeed));
  buildFloor();
  autoSave();
  enterFloor();
}

/* 商城属性价格随机浮动（基础值 ±10 金币） */
function rollShopPrices() {
  const r10 = () => Math.floor(Math.random() * 21) - 10;
  G.shopPrices = { atk: 40 + r10(), def: 35 + r10(), agi: 30 + r10(), luck: 25 + r10() };
}

/* 彩蛋层检测：抵达彩蛋层且概率命中时返回彩蛋（奖励在 advanceFloor 中应用） */
function checkEasterEgg() {
  const egg = EASTER_EGGS[G.floor];
  if (egg && Math.random() * 100 < egg.chance) return egg;
  return null;
}

function enterFloor() {
  if (G.floorType === 'egg') {
    // 彩蛋：无选择，直接展示文字与结果（奖励在抵达时已应用）
    const egg = EASTER_EGGS[G.floor];
    G.egg = egg ? { text: egg.text, result: egg.result } : { text: '', result: '' };
    G.state = 'egg';
    uiRender();
    return;
  }
  G.state = G.floorType === 'battle' ? 'battle' : (G.floorType === 'shop' ? 'shop' : 'event');
  if (G.floorType === 'shop') rollShopPrices(); // 每次进商城重新浮动属性价格
  if (G.state === 'battle' && !G.idle) startBattleAuto();
  uiRender();
}

/* 推进：每满 5 层插一次不计层数的固定商城；否则按 战斗85%/事件10%/随机商城5% 生成（随机商城计入层数）；
   boss 战前必出一次不计层数的战前商城，且不与前一格商城连续 */
function advanceFloor() {
  clearBattleTimer();
  const leavingShop = G.state === 'shop';
  const prevWasShop = G.floorType === 'shop'; // 本格不能紧跟商城（保证不连续 2 格商城）
  if (G.pendingBoss) {
    // 离开战前商城 → 进入 boss 战斗（层数不变）
    G.pendingBoss = false;
    G.floorType = 'battle';
    G.floorSeed = G.pendingBossSeed;
  } else if (G.pendingShop && !leavingShop) {
    G.pendingShop = false;
    G.floorType = 'shop'; // 固定商城不记录爬塔层数（层数不变）
  } else {
    if (G.pendingShop) G.pendingShop = false; // 离开的是随机商城，清掉待商城标记
    G.floor++;
    G.floorSeed = (Math.random() * 0x7fffffff) >>> 0;
    // 彩蛋层：命中则本层替换为彩蛋，跳过战斗/事件/商城
    const egg = checkEasterEgg();
    if (egg) {
      G.floorType = 'egg';
      G.pendingShop = false;
      G.pendingBoss = false;
      const res = egg.effect(G.player);
      G.egg = { text: egg.text, result: egg.result || res };
      recalcHp();
    } else {
      const rng = mulberry32(G.floorSeed);
      G.floorType = prevWasShop ? rollNoShop(rng) : rollFloorType(rng);
      // 战斗层若为首领：先插入战前商城（不计层数）；若前一格已是商城则跳过，避免连续商城
      if (G.floorType === 'battle' && !prevWasShop) {
        const tierRng = mulberry32(G.floorSeed);
        tierRng(); // 与 buildFloor 相同的跳过，保证判定一致
        if (pickMonsterTier(tierRng, G.floor).label === '首领') {
          G.pendingBoss = true;
          G.pendingBossSeed = G.floorSeed;
          G.floorType = 'shop';
          G.pendingShop = false; // 战前商城充当本周期商城
        }
      }
    }
    G.floorsCleared++;
    if (G.floor % 5 === 0 && G.floorType !== 'shop') G.pendingShop = true; // 每满 5 层，下一站为固定商城
    addUserXp(1); // 每通关 1 层塔，用户经验 +1
    maybeAutoSubmit(); // 爬塔中节流云上报进度（死亡时也会最终上报）
  }
  buildFloor();
  autoSave();
  enterFloor();
}

function toMenu() {
  clearBattleTimer();
  G.idle = false;
  clearIdleTimer();
  G.state = 'menu';
  uiRender();
}

/* ---------- 挂机模式 ---------- */
function toggleIdle() {
  if (G.idle) {
    G.idle = false;
    clearIdleTimer();
    if (G.state === 'battle') startBattleAuto();
    toast('已退出挂机');
  } else {
    if (G.state === 'menu' || G.state === 'gameover') { toast('当前状态无法挂机'); return; }
    G.idle = true;
    clearBattleTimer();
    toast('已进入挂机，自动爬塔');
    idleTimer = setTimeout(idleTick, G.idleSpeed || 200);
  }
  updateIdleButton();
}

function clearIdleTimer() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
}

/* 前往下一层/楼层操作间隔取设置值（默认 200ms），商城购买固定 10ms；死亡自动退出挂机 */
function idleTick() {
  if (!G.idle) return;
  let delay = G.idleSpeed || 200;
  const s = G.state;
  if (s === 'battle') {
    skipBattle(); // 战斗立刻跳过
  } else if (s === 'victory' || s === 'eventResult') {
    advanceFloor();
  } else if (s === 'shop') {
    const done = idleShop();
    delay = done ? (G.idleSpeed || 200) : Math.max(1, Math.round((G.idleSpeed || 200) / 5)); // 购买间隔 = 页面切换间隔/5
  } else if (s === 'event') {
    const ev = G.lastEvent || pickEvent();
    chooseEvent(Math.floor(Math.random() * ev.choices.length)); // 随机选
  } else if (s === 'egg') {
    advanceFloor(); // 彩蛋无需选择，自动继续
  } else if (s === 'gameover') {
    G.idle = false;
    clearIdleTimer();
    updateIdleButton();
    return;
  }
  idleTimer = setTimeout(idleTick, delay);
}

/* 挂机商城：先补满生命，再按比例一次性买完所有能买得起的属性，然后退出商城 */
function idleShop() {
  const p = G.player;
  if (p.hp < p.maxHp) {
    const pot = shopItems().find(x => x.id === 'pot');
    if (p.gold >= pot.price && itemMaxQ(pot, p) >= 1) {
      const missing = Math.max(0, p.maxHp - p.hp);
      shopState.pot = Math.max(1, Math.ceil(missing / Math.max(1, pot.heal)));
      buyItem('pot');
      return false; // 已补血，下一 tick 一次性买属性
    }
  }
  idleBuyAttributes(); // 按比例一次性购买
  advanceFloor(); // 购买结束，退出商城
  return true;
}

/* 按挂机比例一次性计算并购买：整轮（比例总和）为主，余钱再按比重优先买零头 */
function idleBuyAttributes() {
  const p = G.player;
  const items = shopItems();
  const alloc = G.idleAlloc || { atk: 4, def: 3, agi: 2, luck: 1 };
  const order = ['atk', 'def', 'agi', 'luck'];
  const priceOf = id => items.find(x => x.id === id).price;
  // 整轮购买（买完所有金币能买下的整轮）
  const roundCost = order.reduce((s, id) => s + (alloc[id] || 0) * priceOf(id), 0);
  if (roundCost > 0 && p.gold >= roundCost) {
    const rounds = Math.floor(p.gold / roundCost);
    order.forEach(id => { shopState[id] = (alloc[id] || 0) * rounds; });
    order.forEach(id => { if (shopState[id] > 0) buyItem(id); });
  }
  // 余钱买零头：比重高者优先
  const high = order.slice().sort((a, b) => alloc[b] - alloc[a]);
  let guard = 0;
  while (guard++ < 40) {
    const id = high.find(x => alloc[x] > 0 && p.gold >= priceOf(x));
    if (!id) break;
    shopState[id] = 1;
    buyItem(id);
  }
}

function clearBattleTimer() {
  if (G.battleTimer) { clearTimeout(G.battleTimer); G.battleTimer = null; }
}

function battleDelay() {
  return Math.max(40, Math.round(BAL.turnDelay / (G.speed || 2)));
}

function startBattleAuto() {
  clearBattleTimer();
  G.battleTimer = setTimeout(function tick() {
    if (G.state !== 'battle') return;
    battleStep();
    if (G.state === 'battle') { G.battleTimer = setTimeout(tick, battleDelay()); }
    else uiRender();
  }, battleDelay());
}

/* 一键跳过：同步跑完剩余回合 */
function skipBattle() {
  clearBattleTimer();
  let guard = 0;
  while (G.state === 'battle' && guard++ < 2000) battleStep();
  uiRender();
}

function battleStep() {
  if (G.state !== 'battle') return;
  battleRound++;
  log('第' + battleRound + '轮', 'sys'); // 标注回合，战斗与死亡回放均展示
  const p = G.player, e = G.enemy;
  let cont = true;
  if (p.agi >= e.agi) {
    cont = pAttack();
    if (cont) cont = eAttack();
  } else {
    cont = eAttack();
    if (cont) cont = pAttack();
  }
  uiTickBattle();
}

function pAttack() {
  const p = G.player, e = G.enemy;
  if (Math.random() * 100 < hitChance(p.agi, e.agi)) {
    const ci = critInfo(p.luck, e.luck); // 玩家攻击，敌人防守
    const isCrit = Math.random() * 100 < ci.rate;
    const dmg = attackDamage(p.atk, e.def, isCrit ? ci.mult : 1);
    e.hp = Math.max(0, e.hp - dmg);
    log((isCrit ? '暴击！' : '') + '你攻击「' + e.name + '」，造成 ' + dmg + ' 点伤害。', isCrit ? 'crit you' : 'you');
    if (e.hp <= 0) {
      log('「' + e.name + '」倒下了！', 'win');
      onBattleWin();
      return false;
    }
  } else {
    log('你的攻击落空了，MISS！', 'miss');
  }
  return true;
}

function eAttack() {
  const p = G.player, e = G.enemy;
  if (Math.random() * 100 < hitChance(e.agi, p.agi)) {
    const ci = critInfo(e.luck, p.luck); // 敌人攻击，玩家防守
    const isCrit = Math.random() * 100 < ci.rate;
    const dmg = attackDamage(e.atk, p.def, isCrit ? ci.mult : 1);
    p.hp = Math.max(0, p.hp - dmg);
    log((isCrit ? '暴击！' : '') + '「' + e.name + '」攻击你，造成 ' + dmg + ' 点伤害。', isCrit ? 'crit enemy' : 'enemy');
    if (p.hp <= 0) {
      log('你的生命归零……', 'sys');
      onPlayerDeath();
      return false;
    }
  } else {
    log('「' + e.name + '」的攻击被躲开了，MISS！', 'miss');
  }
  return true;
}

function onBattleWin() {
  clearBattleTimer();
  const e = G.enemy;
  const tierMult = TIER_REWARD[e.tier] || 1; // 低1.0 / 中1.1 / 高1.2 / 首领1.5
  const exp = Math.round(expReward(G.floor, e.level) * tierMult);
  const gold = Math.round(goldReward(G.floor, e.level) * tierMult);
  const before = G.player.level;
  G.levelGains = { count: 0, atk: 0, def: 0, agi: 0, luck: 0 }; // 本次战斗升级加点明细
  G.kills++;
  addExp(exp);
  G.player.gold += gold;
  G.goldEarned += gold;

  // 高级敌人 40% 额外掉落 1 项属性（基于玩家当前值 1%-2%）；首领 100% 直升一级 + 掉落 3 项属性（1%-3%）
  const bonuses = [];
  if (e.tier === '高' && Math.random() < 0.40) {
    bonuses.push(dropAttributesPercent(1, 0.01 + Math.random() * 0.01));
  }
  if (e.tier === '首领') {
    levelUp();
    bonuses.push('直接升了一级！');
    bonuses.push(dropAttributesPercent(3, 0.01 + Math.random() * 0.02));
  }

  G.victory = { exp, gold, leveled: G.player.level > before, newLevel: G.player.level, bonuses, gains: G.levelGains.count > 0 ? G.levelGains : null };
  G.state = 'victory';
}

/* 事件/Boss 单次属性加成上限：max(玩家等级×层数×0.05, 10000)，防止后期属性爆炸 */
function attrGainCap() {
  return Math.max(10000, Math.round((G.player ? G.player.level : 1) * G.floor * 0.05));
}

/* 掉落：向 count 个随机属性各加当前值 pct%（如 0.01 = 1%），受 attrGainCap 封顶 */
function dropAttributesPercent(count, pct) {
  const pool = [['攻击', 'atk'], ['防御', 'def'], ['敏捷', 'agi'], ['幸运', 'luck']];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  const picked = pool.slice(0, Math.min(count, pool.length));
  const parts = [];
  picked.forEach(function (kv) {
    const amt = Math.min(attrGainCap(), Math.max(1, Math.round(G.player[kv[1]] * pct)));
    G.player[kv[1]] += amt;
    parts.push(kv[0] + ' +' + amt);
  });
  return '额外掉落：' + parts.join('、');
}

function onPlayerDeath() {
  clearBattleTimer();
  // 设置开启时：每次死亡（含复活后的死亡）都退出挂机，避免复生后自动继续
  if (G.exitIdleOnDeath && G.idle) {
    G.idle = false;
    clearIdleTimer();
  }
  G.state = 'gameover';
  G.goMode = 'normal';
  toySubmitScore();
  clearAutoSave(); // 死亡即清自动存档，「继续冒险」只代表存活进度
  decideAfterDeath();
}

/* 死亡后判定：有命先扣命复活；命尽且本局未用过关注复活时，B站 环境走关注复活；否则真正死亡 */
function decideAfterDeath() {
  if (G.lives > 0) {
    G.lives--;
    revivePlayer();
    return;
  }
  if (G.followRevived) {
    G.goMode = 'normal'; // 已用过关注复活，命尽即真死（不再无限循环复活）
    uiRender();
    return;
  }
  canUseFollow().then(function (ok) {
    if (!ok) { G.goMode = 'normal'; uiRender(); return; }
    getFollowState().then(function (following) {
      if (following) { grantRevive(); }
      else { G.goMode = 'follow'; awaitingFollow = false; uiRender(); }
    });
  });
}

/* 关注后 / 已关注：原地复活并给 3 条命（每局仅一次） */
function grantRevive() {
  awaitingFollow = false;
  G.followRevived = true;
  G.lives = 3;
  revivePlayer();
}

/* 复活：满血，保留敌人已受损的血量（不清空重生成），重新进入当前层战斗 */
function revivePlayer() {
  const p = G.player;
  p.hp = p.maxHp;
  battleLog.length = 0;
  battleRound = 0;
  logRendered = 0;
  enterFloor(); // 依据 floorType 重新进入当前层，敌人保留受损状态
  autoSave(); // 复活后重写自动存档
  toast('复活成功！剩余 ' + G.lives + ' 条命');
}

/* 重新进入页面后，若有待确认的关注复活，恢复该局 */
function restoreRunToRevive(save, promptFollow) {
  clearBattleTimer();
  G.player = save.player;
  G.floor = save.floor || 1;
  G.floorType = save.floorType || 'battle';
  G.floorSeed = save.floorSeed || 0;
  G.pendingShop = !!save.pendingShop;
  G.pendingBoss = !!save.pendingBoss;
  G.pendingBossSeed = save.pendingBossSeed || 0;
  G.kills = save.kills || 0;
  G.floorsCleared = save.floorsCleared || 0;
  G.goldEarned = save.goldEarned || 0;
  G.startedAt = save.startedAt || Date.now();
  G.lives = save.lives || 0;
  G.followRevived = !!save.followRevived;
  battleLog.length = 0; battleRound = 0; logRendered = 0;
  if (promptFollow) {
    G.state = 'gameover';
    G.goMode = 'follow';
    awaitingFollow = false;
    uiRender();
  } else {
    G.goMode = 'normal';
    grantRevive();
  }
}

/* 奖励带浮动（±15% 随机性）；经验按「怪物等级/玩家等级」动态结算：
   同级约 4-5 场升 1 级；怪物高于玩家时经验更多（追级），低于时更少（平衡） */
function expReward(floor, enemyLevel) {
  const L = Math.max(1, G.player.level);
  const mult = clamp((enemyLevel || L) / L, 0.3, 3.0);
  return Math.max(5, Math.round(expNeeded(L) / BAL.expBattleRatio * mult * (0.85 + Math.random() * 0.3)));
}
/* 金币：线性 + 幂函数部分（温和，后期与线性约 1:1 发力） */
function goldReward(floor, enemyLevel) {
  const L = enemyLevel || expectedLevelForFloor(floor);
  const linear = BAL.goldRewardBase + floor * BAL.goldRewardPer;
  const expPart = BAL.goldExpBase * Math.pow(L, BAL.goldExpPow);
  return Math.max(1, Math.round((linear + expPart) * (0.85 + Math.random() * 0.3)));
}

/* ---------- 商店 ---------- */
const shopState = {};

function shopItems() {
  const p = G.player;
  const sp = G.shopPrices || { atk: 40, def: 35, agi: 30, luck: 25 }; // 未进商城时用基础价
  // 恢复药水：按 250 生命 = 1 金币定价（血量 10 倍后同步下调价格）；每瓶恢复最大生命 10%（取整到 250，保证价格为整数）
  const potHeal = Math.max(250, Math.round((p ? p.maxHp : 100) * 0.10 / 250) * 250);
  // 属性价格随商城浮动（基础值 ±10），不随属性值/层数变化；描述并入名称
  return [
    { id: 'atk', name: '攻击力 +1（增加造成的伤害）', price: sp.atk, apply: q => { q.atk++; } },
    { id: 'def', name: '防御力 +1（减少受到的伤害）', price: sp.def, apply: q => { q.def++; } },
    { id: 'agi', name: '敏捷 +1（先手与闪避）', price: sp.agi, apply: q => { q.agi++; } },
    { id: 'luck', name: '幸运 +1（提高暴击）', price: sp.luck, apply: q => { q.luck++; } },
    { id: 'pot', name: '恢复药水（250 生命 = 1 金币）', heal: potHeal, price: Math.max(1, potHeal / 250), apply: q => { q.hp = Math.min(q.maxHp, q.hp + potHeal); } },
    { id: 'exp', name: '经验卷（1 金币 = 5 经验）', price: 10, apply: q => { addExp(50); } }
  ];
}

/* 商品可买上限：受金币约束；药水额外受「最多补满生命」约束，不能超买 */
function itemMaxQ(it, p) {
  if (it.single) return 1;
  let max = Math.floor(p.gold / it.price);
  if (it.id === 'pot') {
    const missing = Math.max(0, p.maxHp - p.hp);
    if (missing <= 0) return 0; // 已满血，无需购买
    max = Math.min(max, Math.max(1, Math.ceil(missing / Math.max(1, it.heal))));
  }
  return max;
}

function buyItem(id) {
  const it = shopItems(G.floor).find(x => x.id === id);
  if (!it) return;
  const p = G.player;
  const qty = it.single ? 1 : clamp(shopState[id] || 0, 0, itemMaxQ(it, p));
  if (qty <= 0) return;
  const cost = qty * it.price;
  if (p.gold < cost) { toast('金币不足'); return; }
  p.gold -= cost;
  for (let i = 0; i < qty; i++) it.apply(p);
  recalcHp();
  shopState[id] = 0;
  // 购买后只局部刷新列表与状态栏，避免整页重渲染触发入场动画的闪屏
  if (G.state === 'shop') { renderShopList(); renderStatus(); }
  else uiRender();
}

/* ---------- 战斗日志 ---------- */
function log(text, cls) {
  battleLog.push({ text, cls: cls || '' });
}

/* ---------- 事件 ---------- */
/* 事件提供的属性奖励随等级提升 */
function eventBoost() {
  return 1 + Math.floor(G.player.level / 4);
}

function pickEvent() {
  const ev = EVENTS[G.eventIdx];
  return ev || EVENTS[Math.floor(Math.random() * EVENTS.length)];
}

function chooseEvent(i) {
  const ev = G.lastEvent || pickEvent();
  G.lastEvent = ev;
  const ch = ev.choices[i];
  if (!ch) return;
  G.lastOutcome = ch.run(G.player);
  recalcHp();
  G.state = 'eventResult';
  uiRender();
}
