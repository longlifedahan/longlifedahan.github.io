/* 捕鱼达人：经济平衡仿真
 * 目的：校准渔网爆炸半径 R，使"高手（精准打鱼群）"长期回本 ~120%，
 *       "普通（瞄准打偏）"长期回本 ~70%。
 * 数学：单条被覆盖鱼的期望回本贡献恒 = 0.1875（=0.3Y*0.625*(X/Y)/C，C=成本=X）。
 *       回本率 = 0.1875 * 覆盖鱼数当量。
 */
'use strict';
const G = require('./game.js');

const W = 800, H = 400, unit = H / 540, area = W * H;

// 鱼半径：与 game.js sizeFor 一致（按等级线性，lv20 封顶）
function rFor(lv) {
  return G.sizeFor(lv);
}
// 等级分布：35% 精英群（接近渔场上限的鱼，高价值，是高手目标），65% 普通群（低级鱼，新手保底）
function localLevel(maxLv) {
  const lowHi = Math.max(3, maxLv - 4);
  if (Math.random() < 0.25 && maxLv > lowHi) {
    return lowHi + 1 + Math.floor(Math.random() * (maxLv - lowHi));
  }
  return 1 + Math.floor(Math.random() * lowHi);
}
function fireShot(R, gunLv, fish, aim) {
  const power = G.gunPower(gunLv);
  let gain = 0;
  for (const f of fish) {
    const dx = f.x - aim.x, dy = f.y - aim.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= R + f.r * 0.5) {
      const c = G.catchProb(power, f.capture);
      const prob = d <= R * 0.5 ? c.center : c.edge;
      if (Math.random() < prob) gain += f.value;
    }
  }
  return gain;
}
// 生成聚团鱼：若干群，每群 5 条、分布半径 3.4×群内平均鱼半径（匹配游戏聚团逻辑）
function genClusters(T, maxLv) {
  const fish = [];
  const perCluster = 5;
  const clusters = Math.max(1, Math.round(T / perCluster));
  let placed = 0;
  for (let c = 0; c < clusters && placed < T; c++) {
    const cx = 80 + Math.random() * (W - 160);
    const cy = 60 + Math.random() * (H - 120);
    const n = Math.min(perCluster, T - placed);
    const lvs = [], caps = [], rs = [];
    for (let i = 0; i < n; i++) {
      const lv = localLevel(maxLv);
      const cap = G.fishCapture(lv);
      lvs.push(lv); caps.push(cap); rs.push(rFor(lv));
    }
    const avgR = rs.reduce((a, b) => a + b, 0) / n;
    const gR = 3.4 * avgR;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * gR;
      fish.push({
        x: cx + Math.cos(a) * d,
        y: cy + Math.sin(a) * d,
        capture: caps[i], value: G.fishValue(lvs[i]), r: rs[i]
      });
      placed++;
    }
  }
  return fish;
}
// shots 个独立炮的均值回本率
function simulate(R, gunLv, maxLv, T, shots, mode) {
  let gain = 0, cost = 0;
  for (let s = 0; s < shots; s++) {
    const fish = genClusters(T, maxLv);
    let aim;
    if (mode === 'pro') {
      // 高手：遍历每条鱼为候选爆炸心，选覆盖期望总价值最大的点（专打肥鱼群）
      let bestSc = -1, bx = 0, by = 0;
      for (const c of fish) {
        let sc = 0;
        for (const t of fish) {
          const dx = t.x - c.x, dy = t.y - c.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d <= R + t.r * 0.5) {
            const cp = G.catchProb(G.gunPower(gunLv), t.capture);
            sc += (d <= R * 0.5 ? cp.center : cp.edge) * t.value;
          }
        }
        if (sc > bestSc) { bestSc = sc; bx = c.x; by = c.y; }
      }
      aim = { x: bx, y: by };
    } else {
      // 普通：15% 完全打空（随机点），85% 瞄准但打偏（0~1.2R 偏移）
      if (Math.random() < 0.15) {
        aim = { x: Math.random() * W, y: Math.random() * H };
      } else {
        const pick = fish[Math.floor(Math.random() * fish.length)];
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * 1.2 * R;
        aim = { x: pick.x + Math.cos(a) * d, y: pick.y + Math.sin(a) * d };
      }
    }
    gain += fireShot(R, gunLv, fish, aim);
    cost += G.gunPrice(gunLv);
  }
  return gain / cost;
}

function explodeR(gunLv) {
  // 低级炮渔网更大（初期好回本），收敛到 50，封顶 150
  const k = Math.max(50, 62 - (gunLv - 1) * 1.5);
  return Math.min(k * Math.pow(G.fishCapture(gunLv) / 100, 0.33), 150) * unit;
}

const shots = 8000;
console.log('radius 公式: R = min(55*(Y/100)^0.33,160)*unit；群=5条/半径3.4r；普通=15%打空+85%打偏1.2R；T=16；等级分布 1/l^0.8');
for (const gunLv of [1, 3, 6, 10]) {
  const maxLv = gunLv + 2; // 渔场等级=炮等级（上限已改为渔场等级+2）
  const T = 16; // 鱼密度恒定（群更稀疏，避免覆盖相邻群）
  const R = explodeR(gunLv);
  const pro = simulate(R, gunLv, maxLv, T, shots, 'pro');
  const norm = simulate(R, gunLv, maxLv, T, shots, 'norm');
  console.log('炮Lv' + gunLv + '  R=' + R.toFixed(0) + 'px  高手回本=' + (pro * 100).toFixed(0) +
    '%  普通回本=' + (norm * 100).toFixed(0) + '%');
}
