/* ==================== 数据：怪物名 + 词条 + 随机事件库 ==================== */

/* ---------- 怪物（100 种，按楼层分阶） ---------- */
const MONSTERS = {
  low:  ['史莱姆', '洞穴野狼', '蝙蝠', '哥布林', '毒蘑菇', '小恶魔', '骷髅兵', '巨型蜘蛛', '野猪', '泥沼怪', '洞穴蟑螂', '毒蛇', '鼠王', '石蛙', '枯藤精', '灰狼', '食人蚁', '黑乌鸦', '蘑菇妖', '沼泽蜥', '野蜂群', '地鼠', '火蜥蜴', '尖叫菇', '岩蟹', '暗蝙蝠', '绿皮怪', '沼泽蛇', '洞穴章鱼', '泥浆人'],
  mid:  ['石像鬼', '狼人', '幽灵', '蜥蜴战士', '食人花', '魔眼', '暗影犬', '沼泽巨蛙', '独眼巨人', '腐尸', '女妖', '魔化士兵', '石魔像', '食尸鬼', '暗影猎手', '冰霜精灵', '火焰蜥蜴', '诅咒木乃伊', '吸血蝙蝠', '兽人战士', '迷雾妖', '铁甲龟', '亡灵法师', '树妖', '岩甲虫', '深渊幼体', '幻影狼', '血腥骑士', '荆棘魔', '磷火妖'],
  high: ['深渊骑士', '火焰恶魔', '冰霜女巫', '巨型魔蝎', '牛头人', '风暴元素', '血魔', '摄魂鬼', '暗影刺客', '亡灵统帅', '雷兽', '咒术师', '钢铁魔像', '地狱猎犬', '闪电精灵', '霜龙', '深渊术士', '死灵巫妖', '狂乱兽人', '魔化巨像', '暗影魔主', '灰烬使者', '寒冰巨魔', '熔岩巨人', '虚空行者'],
  boss: ['魔塔领主', '深渊魔王', '时间支配者', '虚空巨兽', '不死巫妖', '混沌之龙', '永恒守望者', '梦魇之主', '灭世使者', '古神残影', '魔龙王', '黑曜石巨人', '寂灭者', '命运编织者', '塔之意志']
};

/* ---------- 词条（20 种）：不同属性加成，平均加成约 1.0-1.1 ---------- */
const MONSTER_AFFIX = [
  { name: '强壮的', atk: 1.35, def: 1.0, agi: 0.75, hp: 1.35, luck: 1.0 },
  { name: '暴躁的', atk: 1.30, def: 0.9, agi: 0.90, hp: 1.0, luck: 1.0 },
  { name: '迅捷的', atk: 0.85, def: 0.9, agi: 1.50, hp: 0.85, luck: 1.0 },
  { name: '坚硬的', atk: 0.85, def: 1.4, agi: 0.80, hp: 1.20, luck: 1.0 },
  { name: '巨大的', atk: 1.20, def: 1.1, agi: 0.75, hp: 1.40, luck: 0.9 },
  { name: '渺小的', atk: 0.85, def: 0.85, agi: 1.30, hp: 0.70, luck: 1.2 },
  { name: '狂暴的', atk: 1.50, def: 0.8, agi: 0.85, hp: 1.00, luck: 0.9 },
  { name: '冷静的', atk: 0.90, def: 1.1, agi: 1.05, hp: 1.00, luck: 1.15 },
  { name: '狡猾的', atk: 1.05, def: 0.9, agi: 1.10, hp: 0.85, luck: 1.4 },
  { name: '贪婪的', atk: 1.15, def: 0.9, agi: 1.00, hp: 1.00, luck: 1.2 },
  { name: '恶毒的', atk: 1.30, def: 1.0, agi: 0.80, hp: 1.00, luck: 1.2 },
  { name: '迟钝的', atk: 1.00, def: 1.25, agi: 0.70, hp: 1.30, luck: 0.9 },
  { name: '幸运的', atk: 0.90, def: 0.9, agi: 1.00, hp: 0.90, luck: 1.8 },
  { name: '倒霉的', atk: 1.05, def: 1.0, agi: 1.00, hp: 1.00, luck: 0.6 },
  { name: '饥饿的', atk: 1.30, def: 1.0, agi: 1.10, hp: 0.70, luck: 1.0 },
  { name: '胆小的', atk: 0.80, def: 0.9, agi: 1.20, hp: 0.80, luck: 1.2 },
  { name: '傲慢的', atk: 1.35, def: 1.0, agi: 0.90, hp: 1.00, luck: 0.7 },
  { name: '潜伏的', atk: 1.00, def: 0.85, agi: 1.15, hp: 1.00, luck: 1.3 },
  { name: '虚弱的', atk: 0.75, def: 0.9, agi: 1.00, hp: 0.70, luck: 1.1 },
  { name: '精英的', atk: 1.25, def: 1.25, agi: 1.10, hp: 1.40, luck: 1.2 }
];

/* 怪物级别对应的金币/经验奖励系数（与总属性系数一致） */
const TIER_REWARD = { '低': 1.0, '中': 1.1, '高': 1.2, '首领': 1.5 };

/* ---------- 随机事件生成器（100 项，每项至少 4 个选项） ---------- */
const EVENT_ATTRS = [
  { name: '攻击', key: 'atk', base: 2 },
  { name: '防御', key: 'def', base: 2 },
  { name: '敏捷', key: 'agi', base: 2 },
  { name: '幸运', key: 'luck', base: 2 }
];

const SCENES = [
  { t: '神秘祭坛', d: '一座古旧祭坛散发着微弱的光，仿佛在等待你的抉择。', o: '祭坛' },
  { t: '幽暗深井', d: '井口深不见底，隐约传来水滴的回响。', o: '深井' },
  { t: '枯萎花园', d: '花园里花草都已枯萎，只有一丝异香残留。', o: '花园' },
  { t: '破碎雕塑', d: '一尊残破的雕像凝视着你，似乎有话要说。', o: '雕像' },
  { t: '闪烁水晶', d: '水晶折射着奇异的光芒，能量在内部流转。', o: '水晶' },
  { t: '古老书架', d: '散落的书卷记载着晦涩的古老知识。', o: '书卷' },
  { t: '迷雾走廊', d: '浓雾笼罩着前方的走廊，看不清来路。', o: '迷雾' },
  { t: '篝火营地', d: '一堆将熄的篝火旁散落着冒险者的遗物。', o: '篝火' },
  { t: '岩壁裂缝', d: '裂缝中透出风声，仿佛有东西在另一端窥视。', o: '裂缝' },
  { t: '废弃药庐', d: '药架上摆满落灰的瓶瓶罐罐。', o: '药庐' },
  { t: '机关走廊', d: '脚下的石板似乎暗藏机关。', o: '石板' },
  { t: '金库残骸', d: '碎裂的宝箱散落一地，仍有零星闪光。', o: '宝箱' },
  { t: '祈愿之泉', d: '一汪清澈泉水，泉底有金币的微光。', o: '泉水' },
  { t: '图腾石柱', d: '石柱上的图腾古老而神秘。', o: '图腾' },
  { t: '幽魂徘徊', d: '半透明的幽魂在空中盘旋，发出低语。', o: '幽魂' },
  { t: '神兵残刃', d: '一柄断裂的武器插在地上，寒气逼人。', o: '残刃' },
  { t: '冒险者遗体', d: '一具骸骨背着半满的包裹，手还指向远方。', o: '骸骨' },
  { t: '风铃走廊', d: '风铃在穿堂风中叮当作响，诡异而悦耳。', o: '风铃' },
  { t: '血字壁画', d: '壁画上以暗红的颜料写着看不懂的文字。', o: '壁画' },
  { t: '机关匣', d: '一个精巧的机关匣静静躺在角落。', o: '机关匣' },
  { t: '断桥', d: '石桥从中断裂，断裂处悬浮着光尘。', o: '断桥' },
  { t: '蘑菇丛', d: '色彩斑斓的蘑菇丛中透着微弱荧光。', o: '蘑菇' },
  { t: '废炉', d: '废弃的铁炉中还残留着余温。', o: '铁炉' },
  { t: '许愿树', d: '枯树上挂满褪色的布条，随风摇曳。', o: '许愿树' },
  { t: '暗影池', d: '池水漆黑如墨，倒映不出任何东西。', o: '暗影池' },
  { t: '锈蚀王座', d: '锈迹斑斑的王座上，一枚暗淡的宝石若隐若现。', o: '王座' },
  { t: '蜂巢', d: '巨大的蜂巢悬在头顶，蜜蜂嗡嗡作响。', o: '蜂巢' },
  { t: '冻湖', d: '湖面结着薄冰，冰下似有游动的阴影。', o: '冻湖' },
  { t: '风蚀石碑', d: '石碑上的字迹已被风沙磨平大半。', o: '石碑' },
  { t: '沉默吊桥', d: '吊桥摇晃，桥下是深不见底的峡谷。', o: '吊桥' },
  { t: '武器商人', d: '一位行商在塔中支起摊位，铁器寒光闪烁，吆喝着最新的兵刃。', o: '商人', special: 'merchant' },
  { t: '大贤者的殿堂', d: '白须贤者端坐于石阶之上，目光如炬，周身环绕着微光。', o: '贤者', special: 'sage' },
  { t: '巨龙的巢穴', d: '洞窟中金币堆积如山，沉睡的巨龙偶尔喷出一缕火星。', o: '龙巢', special: 'dragon' },
  { t: '落难的勇士', d: '一名重伤的勇士靠在墙边，盔甲残破，眼中仍有不甘的战意。', o: '勇士', special: 'warrior' },
  { t: '鎏金宝箱', d: '一具华贵的鎏金宝箱静静立着，锁孔上刻着古老的纹路。', o: '宝箱', special: 'chest' },
  { t: '占卜师的水晶球', d: '水晶球中雾气翻涌，披着星袍的占卜师对你神秘一笑。', o: '占卜师', special: 'fortune' }
];

/* ---------- 事件选项工厂（多分支随机，放大随机性；奖励更大、惩罚更重，帮助玩家滚雪球） ---------- */
/* 事件经验：当前等级所需经验的 20%-200%（多数小、偶尔大，平均约 50%，放大随机性） */
function evExpAmount() {
  const need = Math.max(1, expNeeded(G.player.level));
  const roll = Math.random();
  let f;
  if (roll < 0.75) f = 0.2 + Math.random() * 0.3;        // 20%-50%
  else if (roll < 0.9) f = 0.5 + Math.random() * 0.5;    // 50%-100%
  else f = 1.0 + Math.random();                          // 100%-200%
  return Math.max(1, Math.round(need * f));
}
/* 事件属性奖励：基础值 + 当前值 0.5%-1.5% 的额外成长；受 attrGainCap 封顶防爆炸 */
function evAttrGain(g, key, base) {
  const amt = Math.max(1, Math.round(base * eventBoost() + g[key] * (0.5 + Math.random()) / 100));
  return Math.min(amt, attrGainCap());
}
function evPenaltyHp() { return Math.round((8 + G.floor * 1.5 + Math.random() * G.floor * 2) * 10); } // 血量 10 倍后同步放大固定扣血
function evPenaltyGold() { return Math.round(15 + G.floor * 3 + Math.random() * G.floor * 3); }

function evGain(obj, name, key, base) {
  return {
    text: '向' + obj + '祈求，提升' + name,
    run: g => {
      const roll = Math.random();
      if (roll < 0.5) {
        const n = evAttrGain(g, key, base);
        g[key] += n;
        return '向' + obj + '祈求得到回应，' + name + ' +' + n + '！';
      }
      if (roll < 0.75) {
        const n = Math.round(evAttrGain(g, key, base) * (1.5 + Math.random()));
        g[key] += n;
        return '你得到丰厚的回应，' + name + ' +' + n + '！';
      }
      if (roll < 0.87) {
        const hp = evPenaltyHp();
        g.hp = Math.max(1, g.hp - hp);
        return '回应中夹杂着反噬，生命 -' + hp + '，' + name + ' 无变化。';
      }
      const gp = evPenaltyGold();
      g.gold = Math.max(0, g.gold - gp);
      return obj + '索取了你的供奉，金币 -' + gp + '。';
    }
  };
}
function evRisk(obj, name, key, base) {
  return {
    text: '冒风险尝试汲取' + obj + '之力',
    run: g => {
      const roll = Math.random();
      if (roll < 0.3) {
        const n = Math.round(evAttrGain(g, key, base) * 2);
        g[key] += n;
        return '你成功汲取了' + obj + '之力，' + name + ' +' + n + '！';
      }
      if (roll < 0.55) {
        const n = evAttrGain(g, key, base);
        const xp = evExpAmount();
        g[key] += n; addExp(xp);
        return '你意外收获更多，' + name + ' +' + n + '，经验 +' + xp + '！';
      }
      if (roll < 0.85) {
        const hp = evPenaltyHp();
        g.hp = Math.max(1, g.hp - hp);
        return '力量反噬，生命 -' + hp + '。';
      }
      const xl = Math.max(1, Math.round(expNeeded(G.player.level) * 0.1));
      addExp(-xl);
      return '你付出了惨痛代价，经验 -' + xl + '。';
    }
  };
}
function evAgi(obj) {
  return {
    text: '凭敏捷探索' + obj + '深处',
    run: g => {
      const req = 5 + Math.floor(G.floor * 0.4);
      if (Math.random() * 100 < hitChance(g.agi, req)) {
        const xp = evExpAmount();
        addExp(xp);
        if (Math.random() < 0.3) {
          const w = 15 + G.floor * 3 + Math.floor(Math.random() * (10 + G.floor * 2));
          g.gold += w;
          return '你灵巧地穿行，还顺走一些遗物，经验 +' + xp + '、金币 +' + w + '！';
        }
        return '你灵巧地穿行，经验 +' + xp + '！';
      }
      const hp = evPenaltyHp();
      g.hp = Math.max(1, g.hp - hp);
      return '你踩中暗伏的机关，生命 -' + hp + '。';
    }
  };
}
function evGamble(obj) {
  return {
    text: '在' + obj + '前押上金币赌一把',
    run: g => {
      const stake = 40 + G.floor * 2;
      if (g.gold < stake) return '金币不足，只好作罢。';
      g.gold -= stake;
      const roll = Math.random();
      if (roll < 0.35) { const w = Math.round(stake * (2 + Math.random() * 2)); g.gold += w; return '你赌赢了！金币 +' + w + '。'; }
      if (roll < 0.7) { g.gold += stake; return '险象环生，最终打平，拿回了 ' + stake + ' 金币。'; }
      if (roll < 0.85) { const hp = evPenaltyHp(); g.hp = Math.max(1, g.hp - hp); return '输红了眼还挨了一顿揍，金币 -' + stake + '、生命 -' + hp + '。'; }
      return '你输掉了押注的 ' + stake + ' 金币。';
    }
  };
}
function evSpend(obj, name, key, base) {
  return {
    text: '献上金币供奉' + obj,
    run: g => {
      const cost = Math.min(300, 20 + G.floor);
      if (g.gold < cost) return '金币不足，只能作罢。';
      g.gold -= cost;
      const roll = Math.random();
      if (roll < 0.5) {
        const n = evAttrGain(g, key, base);
        g[key] += n;
        return '供奉生效，' + name + ' +' + n + '！';
      }
      if (roll < 0.75) {
        const n = Math.round(evAttrGain(g, key, base) * 2);
        g[key] += n;
        return '你的虔诚得到双倍回应，' + name + ' +' + n + '！';
      }
      if (roll < 0.88) {
        const hp = evPenaltyHp();
        g.hp = Math.max(1, g.hp - hp);
        return '供奉触怒了神像，生命 -' + hp + '。';
      }
      return '供奉似乎没有被回应，' + name + ' 无变化。';
    }
  };
}
function evHeal(obj) {
  return {
    text: '在' + obj + '边休息片刻',
    run: g => {
      const roll = Math.random();
      if (roll < 0.65) {
        const h = Math.round(g.maxHp * (0.2 + Math.random() * 0.25));
        g.hp = Math.min(g.maxHp, g.hp + h);
        return '你恢复了 ' + h + ' 点生命。';
      }
      if (roll < 0.9) {
        const h2 = Math.round(g.maxHp * 0.5);
        g.hp = Math.min(g.maxHp, g.hp + h2);
        return '这里异常宁静，你恢复了 ' + h2 + ' 点生命！';
      }
      const hp = Math.round(g.maxHp * 0.1);
      g.hp = Math.max(1, g.hp - hp);
      return '休息时惊动了什么，你受了伤，生命 -' + hp + '。';
    }
  };
}
function evHpFor(obj, name, key, base) {
  return {
    text: '以生命为代价换取' + name,
    run: g => {
      const hpCost = Math.max(5, Math.round(g.maxHp * (0.2 + Math.random() * 0.2)));
      const roll = Math.random();
      if (roll < 0.55) {
        const n = Math.round(evAttrGain(g, key, base) * 1.5);
        g.hp = Math.max(1, g.hp - hpCost);
        g[key] += n;
        return '你付出代价，' + name + ' +' + n + '（生命 -' + hpCost + '）。';
      }
      if (roll < 0.8) {
        const n = evAttrGain(g, key, base);
        const hc = Math.round(hpCost * 0.5);
        g.hp = Math.max(1, g.hp - hc);
        g[key] += n;
        return '代价比想象中轻，' + name + ' +' + n + '（生命 -' + hc + '）。';
      }
      g.hp = Math.max(1, g.hp - hpCost);
      return '你付出了代价却一无所获，生命 -' + hpCost + '。';
    }
  };
}
function evExp(obj) {
  return {
    text: '研读' + obj + '附近的古籍',
    run: g => {
      const roll = Math.random();
      if (roll < 0.65) {
        const xp = evExpAmount();
        addExp(xp);
        return '你领悟了其中的知识，经验 +' + xp + '！';
      }
      if (roll < 0.85) {
        const xp = Math.round(evExpAmount() * 2);
        addExp(xp);
        return '你破译了古籍的深奥内容，经验 +' + xp + '！';
      }
      const hp = evPenaltyHp();
      g.hp = Math.max(1, g.hp - hp);
      return '古籍中暗藏陷阱，你被蛰了一下，生命 -' + hp + '。';
    }
  };
}
function evGold(obj) {
  return {
    text: '搜刮' + obj + '周围的遗物',
    run: g => {
      const roll = Math.random();
      if (roll < 0.5) {
        const w = 20 + G.floor * 4 + Math.floor(Math.random() * (15 + G.floor * 3));
        g.gold += w;
        return '你找到一些遗物，金币 +' + w + '！';
      }
      if (roll < 0.8) {
        const w = 60 + G.floor * 8 + Math.floor(Math.random() * (30 + G.floor * 5));
        g.gold += w;
        return '你发现了一个宝箱，金币 +' + w + '！';
      }
      if (roll < 0.9) {
        const gp = evPenaltyGold();
        g.gold = Math.max(0, g.gold - gp);
        return '遗物中暗藏机关，你损失了 ' + gp + ' 金币。';
      }
      const xl = Math.max(1, Math.round(expNeeded(G.player.level) * 0.08));
      addExp(-xl);
      return '一张古籍被撕毁，你损失了 ' + xl + ' 经验。';
    }
  };
}
function evNothing(obj) {
  return { text: '绕开' + obj + '，继续赶路', run: () => '你没有多做停留，继续向上攀爬。' };
}

/* ========== 特殊事件：更丰富奖励、更强随机性 ========== */
/* 武器商人：花金币购买装备，获得不同属性加成（装备不保存，仅当次属性） */
function evMerchantBuy(obj, equip, name, key, rate) {
  return {
    text: '购买「' + equip + '」（' + name + ' +' + Math.round(rate * 100) + '%当前）',
    run: g => {
      const cost = Math.min(400, 40 + G.floor * 2);
      if (g.gold < cost) return '金币不足，只能看看「' + equip + '」。';
      g.gold -= cost;
      const amt = Math.min(attrGainCap(), Math.max(3, Math.round(g[key] * rate + 3 * eventBoost())));
      g[key] += amt;
      return '你买下「' + equip + '」，' + name + ' +' + amt + '！';
    }
  };
}
function merchantChoices(sc) {
  return [
    evMerchantBuy(sc, '精钢长剑', '攻击', 'atk', 0.03),
    evMerchantBuy(sc, '玄铁重盾', '防御', 'def', 0.03),
    evMerchantBuy(sc, '疾风之靴', '敏捷', 'agi', 0.03),
    evMerchantBuy(sc, '幸运符石', '幸运', 'luck', 0.04),
    evNothing(sc)
  ];
}

/* 大贤者：生命上限 +20%，以及多种赐福 */
function sageChoices(sc) {
  return [
    { text: '接受贤者赐福（生命上限 +随机1%-5%，回满血）', run: g => {
        const pct = 1 + Math.random() * 4; // 1%~5% 随机
        g.hpMult = (g.hpMult || 1) * (1 + pct / 100);
        recalcHp(); g.hp = g.maxHp;
        return '贤者念动咒文，你的生命上限提升 ' + pct.toFixed(1) + '%，生命回满！';
      } },
    { text: '请贤者指点武艺（攻击大幅提升）', run: g => {
        const amt = Math.min(attrGainCap(), Math.max(4, Math.round(g.atk * 0.05 + 4 * eventBoost())));
        g.atk += amt;
        return '贤者点破你武艺的破绽，攻击 +' + amt + '！';
      } },
    { text: '聆听贤者教诲（大量经验）', run: g => {
        const xp = Math.round(expNeeded(G.player.level) * (1 + Math.random() * 2));
        addExp(xp);
        return '贤者之语如醍醐灌顶，经验 +' + xp + '！';
      } },
    { text: '贤者赠予盘缠（大量金币）', run: g => {
        const w = 60 + G.floor * 10 + Math.floor(Math.random() * (40 + G.floor * 6));
        g.gold += w;
        return '贤者赠你一份盘缠，金币 +' + w + '！';
      } },
    { text: '谢过贤者，告辞离开', run: () => '你向贤者行礼，缓缓退出殿堂。' }
  ];
}

/* 巨龙的宝藏：大量金币与高风险高回报 */
function dragonChoices(sc) {
  return [
    { text: '悄悄搬走一堆金币（大量金币）', run: g => {
        const w = 80 + G.floor * 15 + Math.floor(Math.random() * (60 + G.floor * 10));
        g.gold += w;
        return '你蹑手蹑脚搬走一堆金币，金币 +' + w + '！';
      } },
    { text: '偷走一颗龙珠（随机大幅属性）', run: g => {
        const pool = [['攻击', 'atk'], ['防御', 'def'], ['敏捷', 'agi'], ['幸运', 'luck']];
        const kv = pool[Math.floor(Math.random() * pool.length)];
        const amt = Math.min(attrGainCap(), Math.max(5, Math.round(g[kv[1]] * 0.04 + 5 * eventBoost())));
        g[kv[1]] += amt;
        return '你趁龙熟睡偷走龙珠，' + kv[0] + ' +' + amt + '！';
      } },
    { text: '斗胆挑战巨龙（高风险高回报）', run: g => {
        const roll = Math.random();
        if (roll < 0.45) { const xp = Math.round(expNeeded(G.player.level) * (1.5 + Math.random() * 2)); addExp(xp); return '你竟斩落了巨龙！经验 +' + xp + '！'; }
        if (roll < 0.8) { const w = 120 + G.floor * 20; g.gold += w; return '巨龙喷息吓退了你，却遗落一袋金币 +' + w + '！'; }
        const hp = Math.round(g.maxHp * 0.35);
        g.hp = Math.max(1, g.hp - hp);
        return '巨龙一爪拍下，你重伤而逃，生命 -' + hp + '！';
      } },
    { text: '拾起一枚龙鳞（全属性小幅提升）', run: g => {
        ['atk', 'def', 'agi', 'luck'].forEach(k => { g[k] += Math.min(attrGainCap(), Math.max(1, Math.round(g[k] * 0.01 + 1))); });
        return '龙鳞蕴含的力量流入体内，四维小幅提升！';
      } },
    { text: '悄然退走', run: () => '你屏息退出龙巢，巨龙仍在沉睡。' }
  ];
}

/* 落难的勇士：大量经验与援助 */
function warriorChoices(sc) {
  return [
    { text: '救助勇士，他传授毕生经验（大量经验）', run: g => {
        const xp = Math.round(expNeeded(G.player.level) * (1.5 + Math.random() * 2));
        addExp(xp);
        return '勇士强撑着传授心得，经验 +' + xp + '！';
      } },
    { text: '接过勇士的佩剑（攻击大幅提升）', run: g => {
        const amt = Math.min(attrGainCap(), Math.max(4, Math.round(g.atk * 0.04 + 4 * eventBoost())));
        g.atk += amt;
        return '你接过染血的佩剑，攻击 +' + amt + '！';
      } },
    { text: '用草药为勇士疗伤（生命回满）', run: g => { g.hp = g.maxHp; return '勇士分你一半药草，生命回满！'; } },
    { text: '勇士托付遗物（大量金币）', run: g => {
        const w = 50 + G.floor * 8 + Math.floor(Math.random() * (40 + G.floor * 5));
        g.gold += w;
        return '勇士将最后的盘缠托付给你，金币 +' + w + '！';
      } },
    { text: '无能为力，悄然离开', run: () => '你转身离去，勇士的目光逐渐黯淡。' }
  ];
}

/* 鎏金宝箱：高风险高回报的随机大奖 */
function chestChoices(sc) {
  return [
    { text: '打开宝箱（随机大奖）', run: g => {
        const roll = Math.random();
        if (roll < 0.25) { const xp = Math.round(expNeeded(G.player.level) * (1 + Math.random() * 2)); addExp(xp); return '宝箱里是上古卷轴，经验 +' + xp + '！'; }
        if (roll < 0.5) { const w = 80 + G.floor * 12 + Math.floor(Math.random() * (60 + G.floor * 8)); g.gold += w; return '宝箱里金光耀眼，金币 +' + w + '！'; }
        if (roll < 0.8) {
          const pool = [['攻击', 'atk'], ['防御', 'def'], ['敏捷', 'agi'], ['幸运', 'luck']];
          const kv = pool[Math.floor(Math.random() * pool.length)];
          const amt = Math.min(attrGainCap(), Math.max(5, Math.round(g[kv[1]] * 0.05 + 5 * eventBoost())));
          g[kv[1]] += amt;
          return '宝箱里躺着一件宝物，' + kv[0] + ' +' + amt + '！';
        }
        const hp = Math.round(g.maxHp * 0.3);
        g.hp = Math.max(1, g.hp - hp);
        return '宝箱里射出暗箭，生命 -' + hp + '！';
      } },
    { text: '研究箱上的铭文（幸运提升）', run: g => {
        const amt = Math.min(attrGainCap(), Math.max(3, Math.round(g.luck * 0.05 + 3 * eventBoost())));
        g.luck += amt;
        return '你破译部分铭文，幸运 +' + amt + '！';
      } },
    { text: '找来工具慢慢撬开（必定有收获）', run: g => {
        const roll = Math.random();
        if (roll < 0.5) { const w = 40 + G.floor * 6; g.gold += w; return '你撬开宝箱，金币 +' + w + '！'; }
        const xp = Math.round(expNeeded(G.player.level) * 0.8);
        addExp(xp);
        return '箱底压着一卷笔记，经验 +' + xp + '！';
      } },
    { text: '放弃宝箱，离开', run: () => '你放弃宝箱，继续赶路。' },
    { text: '绕开宝箱', run: () => '你谨慎地绕开宝箱。' }
  ];
}

/* 占卜师：幸运与随机命运 */
function fortuneChoices(sc) {
  return [
    { text: '请占卜师窥探命运（幸运大幅提升）', run: g => {
        const amt = Math.min(attrGainCap(), Math.max(3, Math.round(g.luck * 0.06 + 3 * eventBoost())));
        g.luck += amt;
        return '水晶球中浮现你的命运，幸运 +' + amt + '！';
      } },
    { text: '占卜你的财运（随机金币）', run: g => {
        const roll = Math.random();
        const w = Math.round((40 + G.floor * 6) * (0.5 + roll));
        g.gold += w;
        return '占卜师算出你的财运，金币 +' + w + '！';
      } },
    { text: '占卜凶吉（高风险高回报）', run: g => {
        const roll = Math.random();
        if (roll < 0.5) { const xp = Math.round(expNeeded(G.player.level) * (1 + Math.random() * 1.5)); addExp(xp); return '大吉！命运指引你，经验 +' + xp + '！'; }
        if (roll < 0.8) { const amt = Math.max(4, Math.round(g.atk * 0.04 + 4 * eventBoost())); g.atk += amt; return '凶中带吉，你领悟破局之法，攻击 +' + amt + '！'; }
        const hp = Math.round(g.maxHp * 0.25);
        g.hp = Math.max(1, g.hp - hp);
        return '大凶！一股黑气缠上你，生命 -' + hp + '！';
      } },
    { text: '占卜师赠你一枚护符（随机属性）', run: g => {
        const pool = [['攻击', 'atk'], ['防御', 'def'], ['敏捷', 'agi'], ['幸运', 'luck']];
        const kv = pool[Math.floor(Math.random() * pool.length)];
        const amt = Math.min(attrGainCap(), Math.max(3, Math.round(g[kv[1]] * 0.04 + 3 * eventBoost())));
        g[kv[1]] += amt;
        return '护符微微发烫，' + kv[0] + ' +' + amt + '！';
      } },
    { text: '谢过占卜师，离开', run: () => '你谢过占卜师，转身离去。' }
  ];
}

/* 由场景与编号组合出 5 个选项（每个事件至少 4 项） */
function buildChoices(sc, i) {
  if (sc.special === 'merchant') return merchantChoices(sc);
  if (sc.special === 'sage') return sageChoices(sc);
  if (sc.special === 'dragon') return dragonChoices(sc);
  if (sc.special === 'warrior') return warriorChoices(sc);
  if (sc.special === 'chest') return chestChoices(sc);
  if (sc.special === 'fortune') return fortuneChoices(sc);
  const variant = Math.floor(i / SCENES.length) % 4;
  const a = EVENT_ATTRS[(i + variant) % 4];
  const b = EVENT_ATTRS[(i + variant + 1) % 4];
  const o = sc.o;
  switch (variant) {
    case 0: return [evGain(o, a.name, a.key, a.base), evAgi(o), evSpend(o, b.name, b.key, b.base), evHeal(o), evNothing(o)];
    case 1: return [evHpFor(o, a.name, a.key, a.base), evGamble(o), evExp(o), evGold(o), evNothing(o)];
    case 2: return [evRisk(o, a.name, a.key, a.base), evSpend(o, b.name, b.key, b.base), evHeal(o), evAgi(o), evNothing(o)];
    default: return [evGain(o, a.name, a.key, a.base), evExp(o), evGold(o), evRisk(o, b.name, b.key, b.base), evNothing(o)];
  }
}

function buildEvents() {
  const evs = [];
  for (let i = 0; i < 100; i++) {
    const sc = SCENES[i % SCENES.length];
    evs.push({ id: 'ev' + i, title: sc.t, desc: sc.d, choices: buildChoices(sc, i) });
  }
  return evs;
}

const EVENTS = buildEvents();

/* ---------- 彩蛋层：抵达特定层数时概率触发，跳过常规内容，直接文字+结果 ---------- */
const EASTER_EGGS = {
  233: {
    chance: 23.3, text: '你遇到了一对名叫22和33的小姑娘，幸运增加了', result: '幸运 +233',
    effect: g => { g.luck += 233; }
  },
  258: {
    chance: 2.58, text: '你遇到了一位嘴臭的冒险家，你生气的揍了他一顿，抢走了他的钱包', result: '金币 +8000',
    effect: g => { g.gold += 8000; }
  },
  520: {
    chance: 5.2, text: '你遇到了爱神，全属性增加了', result: '全属性 +52',
    effect: g => { g.atk += 52; g.def += 52; g.agi += 52; g.luck += 52; }
  },
  666: {
    chance: 6.6, text: '无事发生，但是你幸运的捡到了一个钱袋', result: '金币 +6666',
    effect: g => { g.gold += 6666; }
  },
  777: {
    chance: 7.7, text: '你遇到一位神秘的盲眼武僧，他教会你如何狩猎野怪', result: '经验 +77777',
    effect: g => { addExp(77777); }
  },
  999: {
    chance: 100, text: '你遇到一扇神秘的大门，你以为这趟旅途到达了终点，当随着你的到来，大门自动敞开，看来你的旅途还没有结束', result: '全属性 +999，金币 +9999',
    effect: g => { g.atk += 999; g.def += 999; g.agi += 999; g.luck += 999; g.gold += 9999; }
  },
  1314: {
    chance: 13.14, text: '你遇到了一位异性冒险者，与ta一见钟情，等级提升了', result: '等级提升 13 级',
    effect: () => { for (let i = 0; i < 13; i++) levelUp(); }
  },
  2800: {
    chance: 28, text: '你遇到一位老妪，她说我曾经也是一位弓箭手，直到她洗澡的时候膝盖中了一箭，但还是教给你一些经验', result: '全属性 +2800',
    effect: g => { g.atk += 28; g.def += 28; g.agi += 28; g.luck += 28; }
  },
  4396: {
    chance: 43.9, text: '你隐隐约约听到有人在讨论一处宝藏，当你抵达时，你获得了大量的属性药水', result: '随机一项属性 +4396',
    effect: g => {
      const pool = [['攻击', 'atk'], ['防御', 'def'], ['敏捷', 'agi'], ['幸运', 'luck']];
      const kv = pool[Math.floor(Math.random() * pool.length)];
      g[kv[1]] += 4396;
    }
  },
  9999: {
    chance: 100, text: '你费劲千辛万苦，以为自己可以登顶，但你发现王座还未降临，旅途还在继续', result: '全属性 +9999，金币 +999999',
    effect: g => { g.atk += 9999; g.def += 9999; g.agi += 9999; g.luck += 9999; g.gold += 999999; }
  }
};
