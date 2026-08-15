(function () {
  'use strict';

  /* ================= 常量 ================= */
  const C = {
    MAX_SHOTS: 4,        // 每关射击机会（弹珠数）
    BIRDS: 5,            // 每关小鸟数量
    MAX_BOUNCES: 7,      // 子弹最大反弹次数（之后消失）
    stepSize: 3,         // 物理子步（像素），防穿透
    slingFX: 0.15,       // 弹弓相对画布 X
    slingFY: 0.74,       // 弹弓相对画布 Y
    maxPullF: 0.20,      // 最大拉距 = minDim 的比例
    minPull: 9,          // 小于该拉距不发射（回弹）
    minSpeedF: 0.7,      // 最小初速系数
    maxSpeedF: 3.0,      // 最大初速系数（× minDim px/s）
    travelK: 2.6,        // 最大射程 = force × (W+H) × travelK
    slingClearF: 0.34,   // 小鸟离弹弓最小距离系数
    minBirdGapF: 0.05,   // 小鸟之间最小间距系数
    obsSlingClearF: 0.32, // 障碍离弹弓最小距离系数
    birdSize: 0.8,       // 小鸟整体尺寸缩放（越小越难命中）
    birdHit: 0.8         // 小鸟碰撞盒相对视觉尺寸的缩放（越小越需精准命中）
  };
  const SAVE_KEY = 'bird_save_data';

  /* ================= DOM ================= */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const hud = $('hud'), hudStage = $('hudStage'), hudLevel = $('hudLevel'),
        hudShots = $('hudShots'), hudBirds = $('hudBirds'), hint = $('hint'),
        btnRank = $('btnRank'), btnMute = $('btnMute');
  const startScreen = $('startScreen'), startProgress = $('startProgress'),
        btnStart = $('btnStart'), btnRankStart = $('btnRankStart');
  const resScreen = $('resScreen'), resTitle = $('resTitle'), resDetail = $('resDetail'),
        resLevel = $('resLevel'), btnNext = $('btnNext'), btnHome = $('btnHome');
  const rankScreen = $('rankScreen'), rankList = $('rankList'),
        myRank = $('myRank'), btnCloseRank = $('btnCloseRank');

  /* ================= 状态 ================= */
  let W = 0, H = 0, dpr = 1;
  let state = 'menu';            // menu | aiming | flying | result
  let level = null;              // { birds:[], obstacles:[] }
  let stone = null;
  let drag = null;
  let shotsUsed = 0;
  let stage = 1;                 // 关卡数（通关 +1，无限）
  let userLevel = 0;             // 用户等级（通关/失败增减，最小 0）
  let bonus = 0;
  let saved = { stage: 1, level: 0, t: 0 };
  let toyEnv = false, toyReady = false;
  let particles = [];
  let muted = false;

  /* ================= 工具 ================= */
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function m() { return Math.min(W, H); }
  function stoneR() { return Math.max(6, Math.min(14, m() * 0.016)); }
  function slingPos() { return { x: W * C.slingFX, y: H * C.slingFY }; }
  // 弹弓倒三角上边中点（弹道基准点）
  function slingAnchor() { return { x: W * C.slingFX, y: H * C.slingFY - m() * 0.075 }; }

  /* ================= 画布尺寸（手机/B站强制横屏 16:9 / 桌面全屏） ================= */
  function isMobileOrBili() {
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
                   (navigator.maxTouchPoints > 0 && window.innerWidth < 1024);
    return mobile || !!window.toy;
  }
  function applyOrientation() {
    document.body.classList.toggle('landscape', isMobileOrBili());
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ow = W, oh = H;
    // 手机/B站环境强制横屏 16:9 并居中留黑边，桌面铺满窗口；canvas 是替换元素必须显式指定 CSS 尺寸
    let cw, ch;
    if (document.body.classList.contains('landscape')) {
      const aspect = 16 / 9;
      if (window.innerWidth / window.innerHeight > aspect) {
        ch = window.innerHeight; cw = ch * aspect;          // 窗口更宽：高度撑满，水平居中
      } else {
        cw = window.innerWidth; ch = cw / aspect;           // 窗口更窄（竖屏）：宽度撑满，垂直居中
      }
    } else {
      cw = window.innerWidth;
      ch = window.innerHeight;
    }
    W = Math.max(100, Math.round(cw));
    H = Math.max(100, Math.round(ch));
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (level && ow && oh && (ow !== W || oh !== H)) {
      const sx = W / ow, sy = H / oh;
      level.birds.forEach(b => { b.x *= sx; b.y *= sy; b.w *= sx; b.h *= sy; b.cx = b.x + b.w / 2; b.cy = b.y + b.h / 2; });
      level.obstacles.forEach(o => {
        if (o.type === 'circle') { o.x *= sx; o.y *= sy; o.r *= sx; }
        else { o.x *= sx; o.y *= sy; o.w *= sx; o.h *= sy; }
      });
      if (stone) { stone.x *= sx; stone.y *= sy; stone.trail.forEach(p => { p.x *= sx; p.y *= sy; }); }
    }
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  window.addEventListener('load', resize);

  /* ================= 几何碰撞 ================= */
  function rectOverlap(a, b, pad) {
    return (a.x - pad < b.x + b.w + pad) && (a.x + a.w + pad > b.x - pad) &&
           (a.y - pad < b.y + b.h + pad) && (a.y + a.h + pad > b.y - pad);
  }
  // 射线与膨胀 AABB（Minkowski 和，石子为圆 r）
  function rayRect(x, y, d, rect, r) {
    const x0 = rect.x - r, y0 = rect.y - r, x1 = rect.x + rect.w + r, y1 = rect.y + rect.h + r;
    let tmin = 0, tmax = Infinity;
    if (Math.abs(d.x) < 1e-9) { if (x < x0 || x > x1) return null; }
    else {
      let t1 = (x0 - x) / d.x, t2 = (x1 - x) / d.x;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    }
    if (Math.abs(d.y) < 1e-9) { if (y < y0 || y > y1) return null; }
    else {
      let t1 = (y0 - y) / d.y, t2 = (y1 - y) / d.y;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    }
    if (tmax < 0 || tmin > tmax) return null;
    return tmin > 0 ? tmin : null;
  }
  // 射线与圆（返回最近正 t）
  function rayCircle(ox, oy, dx, dy, cx, cy, R) {
    const fx = ox - cx, fy = oy - cy;
    const a = dx * dx + dy * dy;
    if (a < 1e-9) return null;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - R * R;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
    if (t1 > 1e-6) return t1;
    if (t2 > 1e-6) return t2;
    return null;
  }
  // 射线与线段
  function raySeg(ox, oy, dx, dy, ax, ay, bx, by) {
    const ex = bx - ax, ey = by - ay;
    const det = dx * ey - dy * ex;
    if (Math.abs(det) < 1e-9) return null;
    const t = ((ax - ox) * ey - (ay - oy) * ex) / det;
    const u = ((ax - ox) * dy - (ay - oy) * dx) / det;
    if (t >= 0 && u >= 0 && u <= 1) return t;
    return null;
  }
  function faceNormal(rect, hx, hy, r) {
    const x0 = rect.x - r, y0 = rect.y - r, x1 = rect.x + rect.w + r, y1 = rect.y + rect.h + r;
    const dl = hx - x0, dr = x1 - hx, dt = hy - y0, db = y1 - hy;
    const mn = Math.min(dl, dr, dt, db);
    if (mn === dl) return { x: -1, y: 0 };
    if (mn === dr) return { x: 1, y: 0 };
    if (mn === dt) return { x: 0, y: -1 };
    return { x: 0, y: 1 };
  }
  // 边的外法线（指向凸多边形外部，已归一化）
  function edgeOutwardNormal(a, b, centroid) {
    const ex = b.x - a.x, ey = b.y - a.y;
    const n1 = { x: -ey, y: ex };
    const n2 = { x: ey, y: -ex };
    const toMidX = (a.x + b.x) / 2 - centroid.x, toMidY = (a.y + b.y) / 2 - centroid.y;
    const n = (n1.x * toMidX + n1.y * toMidY >= 0) ? n1 : n2;
    const len = Math.hypot(n.x, n.y) || 1;
    return { x: n.x / len, y: n.y / len };
  }
  // 射线 vs 膨胀凸多边形（边外推 + 圆角）
  function rayVsInflatedPoly(ox, oy, dx, dy, verts, centroid, r) {
    const n = verts.length;
    let best = null;
    for (let i = 0; i < n; i++) {
      const a = verts[i], b = verts[(i + 1) % n];
      const en = edgeOutwardNormal(a, b, centroid);
      const t = raySeg(ox, oy, dx, dy, a.x + en.x * r, a.y + en.y * r, b.x + en.x * r, b.y + en.y * r);
      if (t !== null && t > 1e-6 && (!best || t < best.t)) best = { t, nx: en.x, ny: en.y };
    }
    for (const v of verts) {
      const t = rayCircle(ox, oy, dx, dy, v.x, v.y, r);
      if (t !== null && t > 1e-6 && (!best || t < best.t)) {
        const hx = ox + dx * t, hy = oy + dy * t;
        const dd = Math.hypot(hx - v.x, hy - v.y) || 1;
        best = { t, nx: (hx - v.x) / dd, ny: (hy - v.y) / dd };
      }
    }
    return best;
  }
  function triVerts(o) {
    return [
      { x: o.x + o.w / 2, y: o.y },
      { x: o.x, y: o.y + o.h },
      { x: o.x + o.w, y: o.y + o.h }
    ];
  }
  function triCentroid(o) { return { x: o.x + o.w / 2, y: o.y + o.h * 2 / 3 }; }

  /* ================= 反弹物理（预览与飞行共用同一判定） ================= */
  function nearestHit(x, y, d, maxT, obstacles, birds) {
    const r = stoneR();
    let best = null;
    // 四周墙壁（石子圆心活动范围为 [r, W-r]×[r, H-r]）
    if (d.x > 0) { const t = (W - r - x) / d.x; if (t > 1e-6 && t < maxT && (!best || t < best.t)) best = { t, nx: -1, ny: 0, kind: 'wall' }; }
    if (d.x < 0) { const t = (r - x) / d.x; if (t > 1e-6 && t < maxT && (!best || t < best.t)) best = { t, nx: 1, ny: 0, kind: 'wall' }; }
    if (d.y > 0) { const t = (H - r - y) / d.y; if (t > 1e-6 && t < maxT && (!best || t < best.t)) best = { t, nx: 0, ny: -1, kind: 'wall' }; }
    if (d.y < 0) { const t = (r - y) / d.y; if (t > 1e-6 && t < maxT && (!best || t < best.t)) best = { t, nx: 0, ny: 1, kind: 'wall' }; }
    if (obstacles) {
      for (const o of obstacles) {
        let t = null, nx = 0, ny = 0;
        if (o.type === 'circle') {
          t = rayCircle(x, y, d.x, d.y, o.x, o.y, o.r + r);
          if (t !== null) {
            const hx = x + d.x * t, hy = y + d.y * t;
            const dd = Math.hypot(hx - o.x, hy - o.y) || 1;
            nx = (hx - o.x) / dd; ny = (hy - o.y) / dd;
          }
        } else if (o.type === 'tri') {
          const res = rayVsInflatedPoly(x, y, d.x, d.y, triVerts(o), triCentroid(o), r);
          if (res) { t = res.t; nx = res.nx; ny = res.ny; }
        } else { // rect
          t = rayRect(x, y, d, o, r);
          if (t !== null) { const n = faceNormal(o, x + d.x * t, y + d.y * t, r); nx = n.x; ny = n.y; }
        }
        if (t !== null && t > 1e-6 && t < maxT && (!best || t < best.t)) {
          best = { t, nx, ny, kind: 'obs', rect: o };
        }
      }
    }
    if (birds) {
      for (const b of birds) {                 // 小鸟：命中后穿行，不反弹、不改方向；碰撞盒比视觉小
        if (b.hit) continue;
        const t = rayRect(x, y, d, birdHitRect(b), r);
        if (t !== null && t > 1e-6 && t < maxT && (!best || t < best.t)) {
          best = { t, nx: 0, ny: 0, kind: 'bird', rect: b };
        }
      }
    }
    return best;
  }
  // 单步子步推进（墙壁/障碍反弹，小鸟穿行不反弹）
  function advanceOnce(st, step, obstacles, birds) {
    const d = st.dir;
    const hit = nearestHit(st.x, st.y, d, step, obstacles, birds);
    if (!hit) {
      return { x: st.x + d.x * step, y: st.y + d.y * step, dir: d, dist: step };
    }
    const hx = st.x + d.x * hit.t, hy = st.y + d.y * hit.t;
    const nd = { x: d.x, y: d.y };
    if (hit.nx) nd.x = -nd.x;
    if (hit.ny) nd.y = -nd.y;
    const res = { x: hx + nd.x * 0.5, y: hy + nd.y * 0.5, dir: nd, dist: hit.t,
                  hitWall: hit.kind === 'wall', hitObs: hit.kind === 'obs' };
    if (hit.kind === 'bird') res.hitBird = hit.rect;
    return res;
  }
  // 反弹路径预测：返回 {segs, birdHits}，最多 maxBounces 次碰撞。
  // 命中鸟后从工作列表移除（石子穿过原位置），与真实飞行一致。
  function trace(sx, sy, dir, maxTravel, maxBounces, obstacles, birds) {
    const segs = [];
    const birdHits = [];
    const work = birds ? birds.slice() : null;
    let x = sx, y = sy, d = { x: dir.x, y: dir.y }, traveled = 0, bounces = 0, guard = 0;
    while (traveled < maxTravel && bounces < maxBounces && guard++ < 80) {
      const rem = maxTravel - traveled;
      const hit = nearestHit(x, y, d, rem, obstacles, work);
      if (!hit) {
        segs.push({ x1: x, y1: y, x2: x + d.x * rem, y2: y + d.y * rem, hit: null });
        break;
      }
      const hx = x + d.x * hit.t, hy = y + d.y * hit.t;
      segs.push({ x1: x, y1: y, x2: hx, y2: hy, hit });
      traveled += hit.t;
      if (hit.kind === 'bird') {
        birdHits.push({ bird: hit.rect, x: hx, y: hy });   // 穿行：移除已命中鸟，不改方向
        const i = work.indexOf(hit.rect);
        if (i >= 0) work.splice(i, 1);
      } else {                                             // 墙壁/障碍才反弹并计反弹次数
        if (hit.nx) d.x = -d.x;
        if (hit.ny) d.y = -d.y;
        bounces++;
      }
      x = hx + d.x * 0.5; y = hy + d.y * 0.5;
    }
    return { segs, birdHits };
  }

  /* ================= 随机关卡生成 ================= */
  // 小鸟实际碰撞盒：以中心为基准按 birdHit 缩小的矩形
  function birdHitRect(b) {
    const s = C.birdHit;
    return { x: b.cx - b.w * s / 2, y: b.cy - b.h * s / 2, w: b.w * s, h: b.h * s };
  }
  function birdSpec(kind) {
    const mm = m() * C.birdSize;   // 减小鸟的碰撞体积以提升难度
    if (kind === 'small') return { w: rand(0.055, 0.075) * mm, h: rand(0.05, 0.068) * mm };
    if (kind === 'medium') return { w: rand(0.085, 0.11) * mm, h: rand(0.075, 0.095) * mm };
    return { w: rand(0.115, 0.145) * mm, h: rand(0.10, 0.125) * mm };
  }
  function placeBird(kind, existing) {
    const spec = birdSpec(kind);
    const s = slingPos(), r = stoneR(), mm = m();
    for (let i = 0; i < 40; i++) {
      const cx = W * rand(0.14, 0.88), cy = H * rand(0.12, 0.84);
      const rect = { x: cx - spec.w / 2, y: cy - spec.h / 2, w: spec.w, h: spec.h, cx, cy, kind, hit: false };
      const margin = r * 2 + 8;
      if (rect.x < margin || rect.y < margin || rect.x + rect.w > W - margin || rect.y + rect.h > H - margin) continue;
      if (Math.hypot(cx - s.x, cy - s.y) < mm * C.slingClearF) continue;
      if (existing.some(b => rectOverlap(rect, b, mm * C.minBirdGapF))) continue;
      return rect;
    }
    return null;
  }
  function obsBounds(o) {
    if (o.type === 'circle') return { x: o.x - o.r, y: o.y - o.r, w: o.r * 2, h: o.r * 2 };
    return { x: o.x, y: o.y, w: o.w, h: o.h };
  }
  function obsCenter(o) { const b = obsBounds(o); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
  function obsRadius(o) { const b = obsBounds(o); return Math.hypot(b.w, b.h) / 2; }
  function birdRadius(b) { return Math.hypot(b.w, b.h) / 2; }
  // 障碍数量：3~20 随机，关卡越后越多
  function obstacleCount(stageNum) {
    const base = Math.min(20, 3 + Math.floor((stageNum - 1) / 3) * 2);
    return Math.min(20, base + ((Math.random() * 4) | 0));
  }
  function placeObstacles(birds, count, sizeFactor) {
    const mm = m(), r = stoneR(), s = slingPos();
    const obs = [];
    const types = ['rect', 'circle', 'tri'];
    for (let i = 0; i < count; i++) {
      for (let t = 0; t < 60; t++) {
        const type = types[(Math.random() * 3) | 0];
        let o;
        if (type === 'circle') {
          o = { type, x: W * rand(0.15, 0.85), y: H * rand(0.13, 0.83), r: rand(0.05, 0.11) * mm * sizeFactor };
        } else if (type === 'tri') {
          o = { type, x: W * rand(0.13, 0.83), y: H * rand(0.11, 0.83), w: rand(0.10, 0.19) * mm * sizeFactor, h: rand(0.09, 0.17) * mm * sizeFactor };
        } else {
          o = { type, x: W * rand(0.13, 0.83), y: H * rand(0.11, 0.83), w: rand(0.06, 0.13) * mm * sizeFactor, h: rand(0.06, 0.12) * mm * sizeFactor };
        }
        const b = obsBounds(o);
        const margin = r * 2 + 6;
        if (b.x < margin || b.y < margin || b.x + b.w > W - margin || b.y + b.h > H - margin) continue;
        const c = obsCenter(o);
        if (Math.hypot(c.x - s.x, c.y - s.y) < mm * C.obsSlingClearF) continue;
        const orad = obsRadius(o);
        if (birds.some(bi => Math.hypot(bi.cx - c.x, bi.cy - c.y) < orad + birdRadius(bi) + mm * 0.05)) continue;
        if (obs.some(oo => Math.hypot(obsCenter(oo).x - c.x, obsCenter(oo).y - c.y) < obsRadius(oo) + orad + mm * 0.03)) continue;
        obs.push(o); break;
      }
    }
    return obs;
  }
  // 小鸟必须可被击中：满力射程内，直线或撞墙一次反弹的实际反射路径能落到该小鸟上
  function reachable(bird, obstacles, allBirds) {
    const s = slingAnchor();
    const fullMax = (W + H) * C.travelK;
    const cand = [
      { x: bird.cx, y: bird.cy },        // 直线
      { x: -bird.cx, y: bird.cy },       // 左墙一次反弹
      { x: 2 * W - bird.cx, y: bird.cy },// 右墙一次反弹
      { x: bird.cx, y: -bird.cy },       // 上墙一次反弹
      { x: bird.cx, y: 2 * H - bird.cy } // 下墙一次反弹
    ];
    for (const t of cand) {
      const dx = t.x - s.x, dy = t.y - s.y;
      const len = Math.hypot(dx, dy);
      if (len <= 0 || len > fullMax) continue;
      const dir = { x: dx / len, y: dy / len };
      const tr = trace(s.x, s.y, dir, fullMax, C.MAX_BOUNCES, obstacles, allBirds);
      if (tr.birdHits.some(h => h.bird === bird)) return true;
    }
    return false;
  }
  // 是否存在一次射击能命中≥2只鸟的方向（5只鸟仅4发，须保证有连击可能）
  function hasMultiShot(obstacles, birds) {
    const s = slingAnchor();
    const fullMax = (W + H) * C.travelK;
    const seen = {};
    for (const b of birds) {
      const cand = [
        [b.cx, b.cy], [-b.cx, b.cy], [2 * W - b.cx, b.cy],
        [b.cx, -b.cy], [b.cx, 2 * H - b.cy]
      ];
      for (const [tx, ty] of cand) {
        const dx = tx - s.x, dy = ty - s.y;
        const len = Math.hypot(dx, dy);
        if (len <= 0 || len > fullMax) continue;
        const key = Math.round(dx / len * 1000) + ',' + Math.round(dy / len * 1000);
        if (seen[key]) continue;
        seen[key] = true;
        const dir = { x: dx / len, y: dy / len };
        const tr = trace(s.x, s.y, dir, fullMax, C.MAX_BOUNCES, obstacles, birds);
        const uniq = new Set(tr.birdHits.map(h => birds.indexOf(h.bird)));
        if (uniq.size >= 2) return true;
      }
    }
    return false;
  }
  function generateLevel(stageNum) {
    const sizeFactor = Math.min(1.9, 1 + (stageNum - 1) * 0.04); // 关卡越后障碍越大
    for (let attempt = 0; attempt < 80; attempt++) {
      const kinds = ['small', 'medium', 'large'];
      for (let i = kinds.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
      while (kinds.length < C.BIRDS) kinds.push(['small', 'medium', 'large'][(Math.random() * 3) | 0]);
      const birds = [];
      let ok = true;
      for (const k of kinds) { const b = placeBird(k, birds); if (!b) { ok = false; break; } birds.push(b); }
      if (!ok) continue;
      const target = obstacleCount(stageNum);
      const counts = target > 0 ? [target, Math.max(0, target >> 1), Math.min(3, target)] : [0];
      for (const c of counts) {
        const obstacles = placeObstacles(birds, c, sizeFactor);
        if (birds.every(b => reachable(b, obstacles, birds)) && hasMultiShot(obstacles, birds)) return { birds, obstacles };
      }
    }
    return fallbackLevel();
  }
  function fallbackLevel() {
    const mk = (kind, cx, cy) => {
      const spec = birdSpec(kind);
      return { x: cx - spec.w / 2, y: cy - spec.h / 2, w: spec.w, h: spec.h, cx, cy, kind, hit: false };
    };
    return { birds: [
      mk('small', W * 0.5, H * 0.3), mk('medium', W * 0.72, H * 0.55),
      mk('large', W * 0.38, H * 0.68), mk('small', W * 0.65, H * 0.42),
      mk('medium', W * 0.3, H * 0.5)
    ], obstacles: [] };
  }

  /* ================= 渲染 ================= */
  function roundRectPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#7ec8e8');
    g.addColorStop(1, '#eef9ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    const clouds = [[0.22, 0.2, 0.07], [0.72, 0.13, 0.05], [0.5, 0.32, 0.045]];
    for (const c of clouds) {
      ctx.beginPath();
      ctx.ellipse(c[0] * W, c[1] * H, c[2] * m() * 2, c[2] * m(), 0, 0, 7);
      ctx.fill();
    }
  }
  function drawWalls() {
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#6b4423';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(11, 11, W - 22, H - 22);
  }
  function drawObstacle(o) {
    ctx.lineCap = 'round';
    if (o.type === 'circle') {
      ctx.fillStyle = '#c9a86a';
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, 7); ctx.fill();
      ctx.strokeStyle = '#8b5e34'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.arc(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.35, 0, 7); ctx.fill();
    } else if (o.type === 'tri') {
      ctx.fillStyle = '#b0bec5';
      ctx.beginPath();
      ctx.moveTo(o.x + o.w / 2, o.y);
      ctx.lineTo(o.x, o.y + o.h);
      ctx.lineTo(o.x + o.w, o.y + o.h);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#78909c'; ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.moveTo(o.x + o.w / 2, o.y + o.h * 0.12);
      ctx.lineTo(o.x + o.w * 0.22, o.y + o.h * 0.7);
      ctx.lineTo(o.x + o.w * 0.78, o.y + o.h * 0.7);
      ctx.closePath(); ctx.fill();
    } else { // rect 木块
      ctx.fillStyle = '#c9a86a';
      roundRectPath(o.x, o.y, o.w, o.h, 4); ctx.fill();
      ctx.strokeStyle = '#8b5e34'; ctx.lineWidth = 2;
      roundRectPath(o.x, o.y, o.w, o.h, 4); ctx.stroke();
      ctx.strokeStyle = 'rgba(139,94,52,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(o.x + 2, o.y + o.h * 0.5); ctx.lineTo(o.x + o.w - 2, o.y + o.h * 0.5); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(o.x + 2, o.y + 2, o.w - 4, Math.max(2, o.h * 0.18));
    }
  }
  // 圆身小鸟，矩形碰撞箱（虚线标注）
  function drawBird(b) {
    const R = Math.min(b.w, b.h) * 0.42;
    const cx = b.cx, cy = b.cy;
    const color = b.kind === 'small' ? '#ff6b6b' : b.kind === 'medium' ? '#7ec850' : '#ffd93d';
    const dark = b.kind === 'small' ? '#d94f4f' : b.kind === 'medium' ? '#5da83a' : '#e0a800';
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.ellipse(cx, cy + R * 0.3, R * 0.5, R * 0.4, 0, 0, 7); ctx.fill();
    const ey = cy - R * 0.15, ex1 = cx - R * 0.32, ex2 = cx + R * 0.32, er = Math.max(2.5, R * 0.16);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(ex1, ey, er, 0, 7); ctx.arc(ex2, ey, er, 0, 7); ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(ex1 + er * 0.25, ey, er * 0.5, 0, 7); ctx.arc(ex2 + er * 0.25, ey, er * 0.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff9800';
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.18, ey + er);
    ctx.lineTo(cx + R * 0.18, ey + er);
    ctx.lineTo(cx, ey + er + R * 0.28);
    ctx.closePath(); ctx.fill();
    const hb = birdHitRect(b);                 // 显示实际碰撞盒（比视觉小）
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
    ctx.setLineDash([]);
  }
  function drawStoneAt(x, y) {
    const r = stoneR();
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
    g.addColorStop(0, '#d7dde2'); g.addColorStop(1, '#6b7075');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
  }
  function drawSlingshot() {
    const mm = m();
    const s = slingPos();          // 倒三角下顶点
    const a = slingAnchor();       // 倒三角上边中点
    const spread = mm * 0.05;
    const t1 = { x: a.x - spread / 2, y: a.y };
    const t2 = { x: a.x + spread / 2, y: a.y };
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#7a4a21';
    ctx.lineWidth = Math.max(5, mm * 0.014);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t2.x, t2.y);
    ctx.stroke();
    let stonePos = null;
    if (state === 'aiming' && drag) {
      const ap = aimParams();
      stonePos = ap.pullPos;
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(t1.x, t1.y); ctx.lineTo(stonePos.x, stonePos.y);
      ctx.moveTo(t2.x, t2.y); ctx.lineTo(stonePos.x, stonePos.y);
      ctx.stroke();
    } else if (!stone) {
      stonePos = a;                // 休息时小球位于上边中点
    }
    if (stonePos) drawStoneAt(stonePos.x, stonePos.y);
  }
  function drawPreview(ap) {
    const maxTravel = ap.force * (W + H) * C.travelK;
    // 弹道从“球与弹弓连线中点”起算，只显示前 3 次碰撞
    const tr = trace(ap.mid.x, ap.mid.y, ap.dir, maxTravel, 3, level.obstacles, level.birds);
    ctx.save();
    ctx.lineCap = 'round';
    let acc = 0;
    for (const sg of tr.segs) {
      const t0 = acc / maxTravel;
      acc += Math.hypot(sg.x2 - sg.x1, sg.y2 - sg.y1);
      const t1 = acc / maxTravel;
      const a = 0.75 - ((t0 + t1) / 2) * 0.6;
      ctx.strokeStyle = 'rgba(255,255,255,' + clamp(a, 0.1, 0.75).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1.5, 3.2 - ((t0 + t1) / 2) * 1.6);
      ctx.beginPath(); ctx.moveTo(sg.x1, sg.y1); ctx.lineTo(sg.x2, sg.y2); ctx.stroke();
      if (sg.hit) {
        ctx.fillStyle = sg.hit.kind === 'bird' ? 'rgba(255,80,80,0.95)' : 'rgba(255,255,120,' + a + ')';
        ctx.beginPath(); ctx.arc(sg.x2, sg.y2, sg.hit.kind === 'bird' ? 5 : 4, 0, 7); ctx.fill();
      }
    }
    for (const h of tr.birdHits) {
      const b = h.bird;
      ctx.strokeStyle = 'rgba(255,80,80,0.9)'; ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      roundRectPath(b.x, b.y, b.w, b.h, 6); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,80,80,0.22)';
      ctx.fill();
    }
    const last = tr.segs[tr.segs.length - 1];
    if (last && !last.hit) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(last.x2, last.y2, stoneR() + 2, 0, 7); ctx.stroke();
    }
    ctx.restore();
  }
  function drawTrail() {
    for (const p of stone.trail) {
      const a = 1 - p.age / 0.25;
      ctx.fillStyle = 'rgba(255,255,255,' + (a * 0.6).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, stoneR() * (0.5 + a * 0.5), 0, 7); ctx.fill();
    }
  }
  function spawnParticles(x, y, kind) {
    const col = kind === 'small' ? '#ff6b6b' : kind === 'medium' ? '#7ec850' : '#ffd93d';
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(40, 160);
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.6), t: 0, col });
    }
  }
  function updateParticles(dt) {
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; p.t += dt; }
    particles = particles.filter(p => p.t < p.life);
  }
  function drawParticles() {
    for (const p of particles) {
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 + a * 3, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function draw() {
    drawBackground();
    drawWalls();
    if (level) {
      level.obstacles.forEach(drawObstacle);
      level.birds.forEach(b => { if (!b.hit) drawBird(b); });
      if (state === 'aiming' && drag) drawPreview(aimParams());
      drawSlingshot();
      if (state === 'flying' && stone) { drawTrail(); drawStoneAt(stone.x, stone.y); }
    }
    drawParticles();
  }

  /* ================= 瞄准与发射 ================= */
  function aimParams() {
    const a = slingAnchor();                 // 弹弓倒三角上边中点
    const bx = drag.x, by = drag.y;          // 小球中心
    const dx = a.x - bx, dy = a.y - by;
    const len = Math.hypot(dx, dy);
    const maxPull = m() * C.maxPullF;
    const force = Math.min(len / maxPull, 1);
    const dir = len > 0.5 ? { x: dx / len, y: dy / len } : { x: 0, y: 1 };
    const pullLen = Math.min(len, maxPull);
    const pullPos = { x: a.x - dir.x * pullLen, y: a.y - dir.y * pullLen }; // 小球中心（限制拉距）
    const mid = { x: (a.x + pullPos.x) / 2, y: (a.y + pullPos.y) / 2 };    // 弹道起点：小球中心与上边中点连线的中点
    return { anchor: a, dir, force, pullPos, mid };
  }
  function launch() {
    const a = slingAnchor();
    const bx = drag.x, by = drag.y;
    const dx = a.x - bx, dy = a.y - by;
    const len = Math.hypot(dx, dy);
    if (len < C.minPull) return;           // 拉距过小，回弹不发射
    const maxPull = m() * C.maxPullF;
    const force = Math.min(len / maxPull, 1);
    const dir = { x: dx / len, y: dy / len };
    const pullLen = Math.min(len, maxPull);
    const mid = { x: a.x - dir.x * pullLen / 2, y: a.y - dir.y * pullLen / 2 }; // 小球中心与上边中点连线的中点
    const speed = m() * (C.minSpeedF + (C.maxSpeedF - C.minSpeedF) * force);
    const maxTravel = force * (W + H) * C.travelK;
    stone = { x: mid.x, y: mid.y, dir, speed, remaining: maxTravel, bounces: 0, trail: [] };
    shotsUsed++;
    state = 'flying';
    drag = null;
    play('launch');
    updateHUD();
  }

  /* ================= 飞行 ================= */
  function knockBird(b) {
    b.hit = true;
    play('pop');
    spawnParticles(b.cx, b.cy, b.kind);
    updateHUD();
  }
  function updateFlight(dt) {
    const speed = stone.speed;
    let budget = speed * dt;
    while (budget > 0.01 && stone.remaining > 0.01 && stone.bounces < C.MAX_BOUNCES) {
      const step = Math.min(budget, stone.remaining, C.stepSize);
      const res = advanceOnce(stone, step, level.obstacles, level.birds);
      stone.x = res.x; stone.y = res.y;
      stone.dir = res.dir;
      stone.remaining -= res.dist;
      budget -= res.dist;
      if (res.hitBird) {
        knockBird(res.hitBird);                       // 命中后子弹不消失、不反弹，继续直行
        if (level.birds.every(b => b.hit)) { endShot(); return; } // 全部击落即过关
        // 小鸟不算反弹次数，不改变方向
      } else if (res.hitWall || res.hitObs) {
        stone.bounces++;
        play('bounce');
        if (stone.bounces >= C.MAX_BOUNCES) { endShot(); return; }
      }
    }
    stone.trail.push({ x: stone.x, y: stone.y, age: 0 });
    if (stone.remaining <= 0.01 || stone.bounces >= C.MAX_BOUNCES) endShot();
  }
  function endShot() {
    stone = null;
    if (level.birds.every(b => b.hit)) { onClear(); return; }
    if (shotsUsed >= C.MAX_SHOTS) { onFail(); return; }
    state = 'aiming';
    updateHUD();
  }

  /* ================= 关卡流程 ================= */
  function beginLevel(stageNum) {
    shotsUsed = 0;
    level = generateLevel(stageNum);
    stone = null; drag = null; particles = [];
    state = 'aiming';
    updateHUD();
  }
  function startGame() {
    stage = saved.stage;
    userLevel = saved.level;
    startScreen.classList.remove('show');
    hud.classList.remove('hide');
    beginLevel(stage);
  }
  function onClear() {
    bonus = (C.MAX_SHOTS - shotsUsed) + 1; // 剩0发+1，剩1发+2，剩N发+N+1
    userLevel += bonus;
    stage += 1;
    save();
    submitLeaderboard();
    showResult('clear');
  }
  function onFail() {
    userLevel = Math.max(0, userLevel - 1);
    save();
    showResult('fail');
  }
  function showResult(type) {
    resScreen.classList.add('show');
    if (type === 'clear') {
      const remaining = C.MAX_SHOTS - shotsUsed;
      resTitle.textContent = '过关！';
      resDetail.textContent = '剩余 ' + remaining + ' 发子弹（用 ' + shotsUsed + ' 发击落 5 只小鸟）';
      resLevel.textContent = '等级 +' + bonus;
      resLevel.className = 'lvl-up';
      btnNext.textContent = '下一关';
    } else {
      const rest = level.birds.filter(b => !b.hit).length;
      resTitle.textContent = '未过关';
      resDetail.textContent = C.MAX_SHOTS + ' 次射击用完，还剩 ' + rest + ' 只小鸟';
      resLevel.textContent = '等级 -1';
      resLevel.className = 'lvl-down';
      btnNext.textContent = '再试一次';
    }
    state = 'result';
  }
  function showStart() {
    state = 'menu';
    level = null;
    startScreen.classList.add('show');
    hud.classList.add('hide');
    resScreen.classList.remove('show');
    rankScreen.classList.remove('show');
    startProgress.textContent = '第 ' + saved.stage + ' 关 · 等级 Lv.' + saved.level;
  }

  /* ================= HUD（数字标注） ================= */
  function updateHUD() {
    hudStage.textContent = '第' + stage + '关';
    hudLevel.textContent = 'Lv.' + userLevel;
    hudShots.textContent = shotsUsed + '/' + C.MAX_SHOTS;
    const rest = level.birds.filter(b => !b.hit).length;
    hudBirds.textContent = rest + '/' + C.BIRDS;
  }

  /* ================= 存档（B站云KV / localStorage 降级） ================= */
  function loadLocal() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d.stage === 'number') {
          saved = { stage: Math.max(1, d.stage | 0), level: Math.max(0, d.level | 0), t: d.t || 0 };
        }
      }
    } catch (e) { /* ignore */ }
  }
  function persistLocal() {
    try { saved.t = Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch (e) { /* ignore */ }
  }
  function persistCloud() {
    if (!toyReady || !window.toy) return;
    try { window.toy.setCloudStorage({ [SAVE_KEY]: JSON.stringify(saved) }).catch(() => {}); } catch (e) { /* ignore */ }
  }
  function save() {
    saved.stage = stage;
    saved.level = userLevel;
    persistLocal();
    persistCloud();
  }
  function reconcileCloud() {
    if (!toyReady || !window.toy || typeof window.toy.getCloudStorage !== 'function') return;
    try {
      window.toy.getCloudStorage([SAVE_KEY]).then(map => {
      const raw = map && map[SAVE_KEY];
      if (!raw) { window.toy.setCloudStorage({ [SAVE_KEY]: JSON.stringify(saved) }).catch(() => {}); return; }
      let c = null;
      try { c = JSON.parse(raw); } catch (e) { return; }
      if (!c) return;
      if ((c.t || 0) > (saved.t || 0)) {
        saved = { stage: Math.max(1, c.stage | 0), level: Math.max(0, c.level | 0), t: c.t || 0 };
        if (!startScreen.classList.contains('hide')) {
          startProgress.textContent = '第 ' + saved.stage + ' 关 · 等级 Lv.' + saved.level;
        }
      } else {
        window.toy.setCloudStorage({ [SAVE_KEY]: JSON.stringify(saved) }).catch(() => {});
      }
      }).catch(() => {});
    } catch (e) { /* ignore */ }
  }

  /* ================= 排行榜（仅B站，无本地榜） ================= */
  function submitLeaderboard() {
    if (!toyReady || !window.toy || typeof window.toy.submitScore !== 'function') return;
    try { window.toy.submitScore({ board: 1, score: Math.max(0, userLevel) }).catch(() => {}); } catch (e) { /* ignore */ }
  }
  function renderRank(list, me) {
    rankList.innerHTML = '';
    if (!list || !list.length) {
      rankList.innerHTML = '<div class="tip">暂无排行数据</div>';
      return;
    }
    list.forEach(item => {
      const el = document.createElement('div');
      el.className = 'rank-row' + (item.rank === 1 ? ' first' : '');
      el.innerHTML =
        '<span class="rk">' + item.rank + '</span>' +
        '<img class="av" src="' + esc(item.avatar) + '" alt="" referrerpolicy="no-referrer">' +
        '<span class="nm">' + esc(item.nickname) + '</span>' +
        '<span class="sc">Lv.' + item.score + '</span>';
      rankList.appendChild(el);
    });
    myRank.innerHTML = '';
    if (me && me.ranked) {
      myRank.innerHTML = '我的排名：第 <b>' + me.rank + '</b> 名 · Lv.' + me.score;
    } else {
      myRank.innerHTML = '我的排名：未上榜';
    }
  }
  function openRank() {
    rankScreen.classList.add('show');
    rankList.innerHTML = '<div class="tip">加载中…</div>';
    myRank.innerHTML = '';
    if (!toyReady || !window.toy || typeof window.toy.getRankList !== 'function') {
      rankList.innerHTML = '<div class="tip">排行榜仅在 B站 App 或 B站网页内可用</div>';
      return;
    }
    try {
      window.toy.getRankList({ board: 1, period: 'all', limit: 100 })
        .then(list => {
          return window.toy.getMyRank({ board: 1, period: 'all' }).catch(() => null)
            .then(me => renderRank(list, me));
        })
        .catch(() => { rankList.innerHTML = '<div class="tip">排行榜暂时不可用</div>'; });
    } catch (e) { rankList.innerHTML = '<div class="tip">排行榜暂时不可用</div>'; }
  }
  function closeRank() { rankScreen.classList.remove('show'); }

  /* ================= 音频（简单合成音） ================= */
  let AC = null;
  function audioInit() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (AC && AC.state === 'suspended') AC.resume();
  }
  function beep(freq, dur, type, vol, when) {
    if (!AC) return;
    const t = AC.currentTime + (when || 0);
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(t); o.stop(t + dur);
  }
  function play(name) {
    if (!AC || muted) return;
    switch (name) {
      case 'launch': beep(200, 0.18, 'triangle', 0.25); break;
      case 'bounce': beep(700, 0.05, 'square', 0.07); break;
      case 'pop': beep(500, 0.08, 'square', 0.2); beep(300, 0.12, 'square', 0.15, 0.05); break;
      case 'clear': [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.15, 'triangle', 0.2, i * 0.12)); break;
      case 'fail': [392, 330, 262].forEach((f, i) => beep(f, 0.2, 'sawtooth', 0.12, i * 0.15)); break;
    }
  }

  /* ================= 输入 ================= */
  function getPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function onDown(e) {
    audioInit();
    if (state !== 'aiming') return;
    const p = getPos(e);
    const a = slingAnchor();   // 小球休息位置（弹弓上边中点）
    if (Math.hypot(p.x - a.x, p.y - a.y) <= m() * 0.18) {
      drag = { x: p.x, y: p.y, id: e.pointerId };
      if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) {} }
      e.preventDefault();
    }
  }
  function onMove(e) {
    if (drag && state === 'aiming') {
      const p = getPos(e);
      drag.x = p.x; drag.y = p.y;
    }
  }
  function onUp(e) {
    if (drag && drag.id === e.pointerId) {
      if (state === 'aiming') launch();
      drag = null;
    }
  }
  function setupInput() {
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
  }

  /* ================= SDK 非阻塞加载 ================= */
  function onToyReady() {
    applyOrientation();      // B站环境检测到后切横屏
    resize();
    reconcileCloud();
    btnRank.classList.remove('hide');
    btnRankStart.classList.remove('hide');
  }
  function loadSDK() {
    if (window.toy) { toyEnv = true; toyReady = true; onToyReady(); return; }
    const s = document.createElement('script');
    s.src = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
    s.async = true;
    s.onload = () => {
      if (window.toy) { toyEnv = true; toyReady = true; onToyReady(); }
    };
    s.onerror = () => { toyReady = false; };
    document.head.appendChild(s);
  }

  /* ================= 静音 ================= */
  function loadMuted() {
    try { muted = localStorage.getItem('bird_muted') === '1'; } catch (e) { /* ignore */ }
    updateMuteBtn();
  }
  function updateMuteBtn() {
    btnMute.textContent = muted ? '静音' : '音效';
    btnMute.classList.toggle('muted', muted);
  }
  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem('bird_muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
    updateMuteBtn();
  }

  /* ================= 按钮绑定 ================= */
  btnStart.addEventListener('click', startGame);
  btnMute.addEventListener('click', toggleMute);
  btnRank.addEventListener('click', openRank);
  btnRankStart.addEventListener('click', openRank);
  btnCloseRank.addEventListener('click', closeRank);
  btnNext.addEventListener('click', () => { resScreen.classList.remove('show'); beginLevel(stage); });
  btnHome.addEventListener('click', showStart);

  /* ================= 主循环与启动 ================= */
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (stone) stone.trail.forEach(p => { p.age += dt; });
    stone && (stone.trail = stone.trail.filter(p => p.age < 0.25));
    updateParticles(dt);
    if (state === 'flying' && stone) updateFlight(dt);
    hint.classList.toggle('show', state === 'aiming');
    draw();
    requestAnimationFrame(loop);
  }
  function init() {
    applyOrientation();
    resize();
    requestAnimationFrame(resize);
    loadLocal();
    loadMuted();
    showStart();
    setupInput();
    loadSDK();
    requestAnimationFrame(loop);
  }
  init();
})();
