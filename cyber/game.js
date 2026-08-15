/* ============================================================
 * 赛博木鱼 · 挂机游戏 (D:\b站toy\cyber)
 * 纯原生 H5+JS。核心：功德（信众/信徒/.../如来 17 级）
 * - 敲木鱼：按等级产出（信众1/信徒10/...×10每级），每次 +10% 增产（1分钟线性衰减、可叠加、无上限）
 * - 16 种功德设施：第 n 种单台产出 = 2^(n-1) × 价格/1000，价格 = 对应等级晋升门槛，只堆数量
 * - 大数：万/亿/万亿/.../万亿亿亿 中文单位，≥10^32 转科学计数
 * - 挂机：在线×1，挂机基础倍率 10%；上限=作者无限/关注作者24h/默认8h
 * - B站排行榜：3 个维度(总功德/每秒产出/功德等级) × 4 个周期(日/周/月/总)，大数拆位编码
 * ============================================================ */
'use strict';

/* ---------------- 大数：m×10^e，m∈[1,10) 或 0 ---------------- */
function bn(m, e) { return { m: m, e: e }; }
function bnFrom(x) {
  if (!(x > 0) || !isFinite(x)) return { m: 0, e: 0 };
  var e = Math.floor(Math.log10(x));
  var m = x / Math.pow(10, e);
  if (m >= 10) { m /= 10; e++; }
  if (m < 1) { m *= 10; e--; }
  return { m: m, e: e };
}
function add(a, b) {
  if (a.m === 0) return b;
  if (b.m === 0) return a;
  var em = Math.max(a.e, b.e);
  var s = a.m * Math.pow(10, a.e - em) + b.m * Math.pow(10, b.e - em);
  if (s >= 10) { s /= 10; em++; }
  if (s < 1 && s > 0) { while (s < 1) { s *= 10; em--; } }
  return { m: s, e: em };
}
function sub(a, b) {
  if (a.m === 0) return { m: 0, e: 0 };
  if (b.m === 0) return a;
  var em = Math.max(a.e, b.e);
  var m = a.m * Math.pow(10, a.e - em) - b.m * Math.pow(10, b.e - em);
  if (m <= 0) return { m: 0, e: 0 };
  var e = em;
  while (m < 1) { m *= 10; e--; }
  while (m >= 10) { m /= 10; e++; }
  return { m: m, e: e };
}
function mulSmall(a, c) {
  if (a.m === 0 || c === 0) return { m: 0, e: 0 };
  var m = a.m * c, e = a.e;
  while (m >= 10) { m /= 10; e++; }
  while (m < 1) { m *= 10; e--; }
  return { m: m, e: e };
}
function mulBn(a, b) {
  if (a.m === 0 || b.m === 0) return { m: 0, e: 0 };
  var m = a.m * b.m, e = a.e + b.e;
  while (m >= 10) { m /= 10; e++; }
  while (m < 1) { m *= 10; e--; }
  return { m: m, e: e };
}
/* 整数除法 floor(a/b)，返回大数（用于批量购买可买数量） */
function divIntBn(a, b) {
  if (a.m === 0) return { m: 0, e: 0 };
  if (a.e < b.e) return { m: 0, e: 0 };   // a < b（指数更小）
  var m = a.m / b.m, e = a.e - b.e;
  while (m >= 10) { m /= 10; e++; }
  while (m < 1) { m *= 10; e--; }
  if (e >= 15) return { m: m, e: e };   // 巨大数量，量级正确即可
  var f = Math.floor(m * Math.pow(10, e) + 1e-9);
  return f > 0 ? bnFrom(f) : { m: 0, e: 0 };
}
function gte(a, b) {
  if (a.m === 0) return b.m === 0;
  if (b.m === 0) return true;
  if (a.e > b.e) return true;
  if (a.e < b.e) return false;
  return a.m >= b.m - 1e-12;
}
function gt(a, b) { return gte(a, b) && !gte(b, a); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* ---------------- 格式化（万/亿/万亿/…/科学计数） ---------------- */
function trimNum(s) {
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
var SCI_E = 32;   // ≥10^32（亿亿亿亿）用科学计数法
/* 达到 1万 切换万、1亿 切换亿、1万亿 切换万亿…每 10^4 升一档（阈值=单位量级） */
var UNITS = [
  [28, '万亿亿亿', 28], [24, '亿亿亿', 24], [20, '万亿亿', 20],
  [16, '亿亿', 16], [12, '万亿', 12], [8, '亿', 8], [4, '万', 4]
];
/* fmt：功德/价格，<10^6 取整不显示小数点（123.45 → 123），≥10^6 用万/亿/…单位保留两位 */
/* fmtSmall：每秒产出/小数值，<10^6 整数显示整数、小数保留两位（0.01/秒 不丢） */
function fmtBase(v, keepDec) {
  if (!v || v.m === 0) return '0';
  var e = v.e;
  if (e >= SCI_E) return trimNum(v.m.toFixed(2)) + '×10^' + e;
  for (var i = 0; i < UNITS.length; i++) {
    if (e >= UNITS[i][0]) {
      return trimNum((v.m * Math.pow(10, e - UNITS[i][2])).toFixed(2)) + UNITS[i][1];
    }
  }
  var raw = v.m * Math.pow(10, e);
  if (keepDec && Math.floor(raw) !== raw) return trimNum(raw.toFixed(2));
  return String(Math.floor(raw + 1e-9));   // 补偿浮点误差（如 1 - 0.99 的 0.9999…）
}
function fmt(v) { return fmtBase(v, false); }
function fmtSmall(v) { return fmtBase(v, true); }
function fmtRate(v) { return fmtSmall(v) + '/秒'; }

/* B站 分数拆位编码（分数限 ±16777216）：存 = 指数×10000 + 尾数×1000 */
function encodeScore(v) {
  if (!v || v.m === 0) return 0;
  var mant = Math.round(v.m * 1000);
  var e = v.e;
  if (mant >= 10000) { mant = 1000; e += 1; }
  return clamp(e * 10000 + mant, -16777216, 16777215);
}
function decodeScore(enc) {
  if (enc <= 0) return { m: 0, e: 0 };
  var e = Math.floor(enc / 10000);
  var m = (enc % 10000) / 1000;   // mant×10^(e-3) = (mant/1000)×10^e，直接构造避免大指数溢出
  if (m === 0) return { m: 0, e: 0 };
  if (m >= 10) { m /= 10; e++; }
  if (m < 1) { m *= 10; e--; }
  return { m: m, e: e };
}

/* ---------------- 等级表（lv0-15 各称号，lv16+ 统称如来，可无限晋升） ---------------- */
var LV_NAMES = ['信众', '信徒', '居士', '行者', '沙弥', '比丘', '禅师', '上座', '长老', '住持', '方丈', '大德', '罗汉', '菩萨', '活佛', '佛陀', '如来'];
var LV_NAME_MAX = LV_NAMES.length - 1;   // 16，称号索引上限（如来）
var MAX_LV = 200;                        // 可继续晋升的实际封顶（lv16 后都叫如来）
var LV_COLORS = [
  '#9aa0a6', '#8fc7d8', '#6ec6a0', '#58b6e0', '#e0a93c',
  '#e07b3c', '#d94f4f', '#c456d9', '#e856c4', '#ff4fa0',
  '#ff7b3d', '#ffd23d', '#3df5d0', '#3da6ff', '#9d6bff',
  '#ff5ce1', '#fff7b0'
];
/* 满级如来的渐变色（金色佛光） */
var LV_GRADIENT = 'linear-gradient(180deg,#fff7b0 0%,#ffd76a 30%,#ff9d3d 55%,#ff5ce1 80%,#7d5cff 100%)';

/* 晋升所需累计总功德指数：lv1=10，lv2=1000(×100)，lv3=10万(×100)…lv1-5 段×100；
   lv5-10 段×1000；lv10-15 段×10000；lv15 之后每级×10万（指数 +5） */
var NEED_EXP = [0, 1, 3, 5, 7, 9, 12, 15, 18, 21, 24, 28, 32, 36, 40, 44, 49];
/* lv16 起区分：如来1、如来2…（排行榜/晋升弹窗/顶部等级均使用） */
function levelName(lv) { return lv >= LV_NAME_MAX ? '如来' + (lv - LV_NAME_MAX + 1) : LV_NAMES[lv]; }
function needExp(lv) { return lv <= LV_NAME_MAX ? NEED_EXP[lv] : 49 + 5 * (lv - LV_NAME_MAX); }
function need(lv) { return lv === 0 ? { m: 0, e: 0 } : { m: 1, e: needExp(lv) }; }
function currentLevel(total) {
  for (var lv = MAX_LV; lv >= 0; lv--) if (gte(total, need(lv))) return lv;
  return 0;
}
/* 敲击单次基础产出 = 10^lv（信众1/信徒10/…） */
function tapBase(lv) { return { m: 1, e: lv }; }

/* ---------------- 16 种功德设施（突破信众后每级解锁一个） ---------------- */
var DEV_NAMES = [
  '自动木鱼机', '自动转轮机', '自动撞钟机', '自动放生机',
  '诵经机器人', '诵经机器人阵列', '赛博香火庙', '功德聚灵阵',
  '赛博活佛像', '电子功德碑林', '量子诵经塔', '数字金身罗汉阵',
  '菩提智能道场', '灵山赛博圣境', '三千佛国法界', '无量功德本源'
];
var DEV_ICONS = ['🪘', '☸️', '🔔', '🕊️', '🤖', '🤖', '🛕', '✨', '🗿', '🪨', '🗼', '🥋', '🌳', '🏔️', '🌌', '☀️'];
var DEV_COUNT = DEV_NAMES.length;   // 16
/* 第 i 种设施价格 = 对应等级晋升门槛；单台产出 = 1.1^i × 价格/1000（性价比每级仅 ×1.1）
   自动木鱼机（第0种）特例：价格 100、单台产出 0.1/秒（性价比 0.001 与设备1相当，避免钻空子），其余不变 */
function devicePrice(i) { return i === 0 ? bnFrom(100) : need(i + 1); }
function deviceUnit(i) { return i === 0 ? bnFrom(0.1) : mulSmall(mulSmall(devicePrice(i), Math.pow(1.1, i)), 0.001); }

/* ---------------- 常量 ---------------- */
var SAVE_KEY = 'cyber_save_v1';
var REL_KEY = 'cyber_rel_v1';
var CLOUD_KEY = 'cyber_save';
var AUTHOR_UID = '13450091';
var OFF_RATE = 0.10;      // 挂机基础倍率 10%
var OFF_MAX = 8 * 3600;   // 默认挂机上限 8 小时
var CLICK_BOOST = 0.10;   // 每次敲击 +10%
var CLICK_MS = 60000;     // 持续 1 分钟，线性衰减（无上限，可叠加）
var BUFF_BAR_FULL = 19.0; // 增益条满格基准：倍率 ×20（buff=19）才满
var SAVE_INTERVAL = 10000;        // localStorage 每 10 秒
var CLOUD_SAVE_INTERVAL = 60000;  // B站 云存储(K-V) 每 1 分钟
var SUBMIT_INTERVAL = 600000;     // 排行榜每 10 分钟
var BOARD_MERIT = 1, BOARD_PPS = 2, BOARD_LV = 3;
var PERIODS = ['all', 'month', 'week', 'day'];

/* ---------------- 游戏状态 ---------------- */
var S = {
  gold: { m: 0, e: 0 },      // 当前可用功德（可购买设备）
  total: { m: 0, e: 0 },     // 累计总功德（只增不减，用于等级/榜单）
  counts: new Array(DEV_COUNT).fill(0).map(function () { return { m: 0, e: 0 }; }),  // 数量用大数存储，避免超 2^53 精度上限
  muted: false
};
var clickTs = [];
var lastTick = Date.now();
var lastSave = Date.now();
var lastSubmit = 0;
var booted = false, bootTs = 0;
var author = false, following = false;
var followGuided = false;
var idleSec = 0, idleGranted = 0;   // 本次离开的秒数 / 已结算秒数（用于升级补差）
var idleGain = { m: 0, e: 0 };      // 已累计结算的挂机收益（弹窗显示）
var hiddenAt = 0;                   // 离开游戏时刻，>0 表示处于离开状态；游戏内为 0
var lastLevel = 0;                  // 上次已提示晋升的等级（累计总功德只增不减，升级即晋升）
var cloudLastSave = 0;
var cloudMerged = false;

/* ---------------- 产出计算 ---------------- */
function deviceTotal(i) { return mulBn(deviceUnit(i), S.counts[i]); }
function totalRate() {
  var r = { m: 0, e: 0 };
  for (var i = 0; i < DEV_COUNT; i++) if (S.counts[i].m) r = add(r, deviceTotal(i));
  return r;
}

/* ---------------- 敲击增益（衰减、可叠加、无上限，作用于敲击+自动产出） ---------------- */
function buffValue() {
  var now = Date.now();
  while (clickTs.length && now - clickTs[0] > CLICK_MS) clickTs.shift();
  var sum = 0;
  for (var i = 0; i < clickTs.length; i++) {
    sum += CLICK_BOOST * (1 - (now - clickTs[i]) / CLICK_MS);
  }
  return sum;
}
function multiplier() { return 1 + buffValue(); }

/* ---------------- 存档 / 多端合并（按累计总功德取高） ---------------- */
function makeSaveObj() {
  return { g: [S.gold.m, S.gold.e], tg: [S.total.m, S.total.e], c: S.counts.map(function (c) { return [c.m, c.e]; }), m: S.muted ? 1 : 0, ts: Date.now() };
}
function stateTotal(d) {
  return Array.isArray(d.tg) ? bn(d.tg[0], d.tg[1]) : { m: 0, e: 0 };
}
function isValidState(d) {
  return d && Array.isArray(d.g) && Array.isArray(d.tg);
}
function adoptState(d) {
  if (!d) return;
  S.gold = Array.isArray(d.g) ? bn(d.g[0], d.g[1]) : { m: 0, e: 0 };
  S.total = Array.isArray(d.tg) ? bn(d.tg[0], d.tg[1]) : { m: 0, e: 0 };
  if (d.c && d.c.length === DEV_COUNT) {
    S.counts = d.c.map(function (c) { return Array.isArray(c) ? bn(c[0], c[1]) : bnFrom(c); });   // 兼容新旧存档
  }
  if (d.m) S.muted = !!d.m;
}
function save() {
  try {
    var d = makeSaveObj();
    localStorage.setItem(SAVE_KEY, JSON.stringify(d));
    if (sdkReady() && Date.now() - cloudLastSave > CLOUD_SAVE_INTERVAL) {
      cloudLastSave = Date.now();
      var kv = {}; kv[CLOUD_KEY] = JSON.stringify(d);
      window.toy.setCloudStorage(kv).catch(function () {});
    }
  } catch (e) {}
}
function writeBoth() {
  var d = makeSaveObj();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (e) {}
  if (sdkReady()) {
    var kv = {}; kv[CLOUD_KEY] = JSON.stringify(d);
    window.toy.setCloudStorage(kv).catch(function () {});
  }
}
function load() {
  var d = null, raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) {}
  if (raw) { try { d = JSON.parse(raw); } catch (e) {} }
  adoptState(d);
  lastTick = (d && d.ts) ? d.ts : Date.now();
}
/* SDK 可用时对比本地与云端：取累计总功德高者，覆盖低者并回写两端 */
function mergeWithCloud() {
  return new Promise(function (resolve) {
    if (!sdkReady()) { resolve(false); return; }
    cloudMerged = true;
    try {
      window.toy.getCloudStorage([CLOUD_KEY]).then(function (data) {
        try {
          var c = data && data[CLOUD_KEY] ? JSON.parse(data[CLOUD_KEY]) : null;
          /* 仅当云端累计功德严格更高才采用（相等时不覆盖，避免重复结算离线收益）；
             采用后按云端存档时间补结算挂机，lastTick=now 不干扰在线计时 */
          if (isValidState(c) && gt(stateTotal(c), S.total)) {
            var now = Date.now();
            var since = (c.ts > 0) ? (now - c.ts) / 1000 : 0;
            adoptState(c);
            if (since >= 1 && booted) applyOffline(Math.min(since, idleCap()), idleCap());
            lastTick = now;
          }
          writeBoth();
          resolve(true);
        } catch (e) { resolve(false); }
      }).catch(function () { resolve(false); });
    } catch (e) { resolve(false); }
  });
}

/* ---------------- DOM 引用 ---------------- */
function $(id) { return document.getElementById(id); }
var refs = {};

/* ---------------- 渲染 ---------------- */
function buildList() {
  var list = $('list');
  list.innerHTML = '';
  refs.bcount = []; refs.bout = []; refs.bbtn = []; refs.bbulk = []; refs.brow = [];
  var frag = document.createDocumentFragment();
  for (var i = 0; i < DEV_COUNT; i++) {
    (function (idx) {
      var row = document.createElement('div');
      row.className = 'brow';
      row.id = 'brow-' + idx;
      var main = document.createElement('div');
      main.className = 'brow-main';
      var icon = document.createElement('span');
      icon.className = 'bicon'; icon.textContent = DEV_ICONS[idx];
      var nm = document.createElement('span');
      nm.className = 'bname'; nm.textContent = DEV_NAMES[idx];
      var lv = document.createElement('span');
      lv.className = 'blv'; lv.textContent = 'Lv.' + (idx + 1) + ' ' + levelName(idx + 1);
      var cnt = document.createElement('span');
      cnt.className = 'bcount'; cnt.textContent = '×0';
      var btn = document.createElement('button');
      btn.className = 'bbtn';
      btn.addEventListener('click', function (ev) { ev.stopPropagation(); buyDevice(idx); });
      var bbtn = document.createElement('button');
      bbtn.className = 'bbtn bulk-btn';
      bbtn.textContent = '批量';
      bbtn.addEventListener('click', function (ev) { ev.stopPropagation(); openBulk(idx); });
      main.appendChild(icon); main.appendChild(nm); main.appendChild(lv); main.appendChild(cnt);
      main.appendChild(bbtn); main.appendChild(btn);
      var out = document.createElement('div');
      out.className = 'bout';
      row.appendChild(main); row.appendChild(out);
      frag.appendChild(row);
      refs.bcount[idx] = cnt;
      refs.bout[idx] = out;
      refs.bbtn[idx] = btn;
      refs.bbulk[idx] = bbtn;
      refs.brow[idx] = row;
    })(i);
  }
  list.appendChild(frag);
}
function updateRow(i) {
  var lv = currentLevel(S.total);
  var unlocked = i < lv;   // 第 i 种设施需 lv ≥ i+1
  var row = refs.brow[i];
  var cnt = refs.bcount[i];
  var out = refs.bout[i];
  var btn = refs.bbtn[i];
  var bbtn = refs.bbulk[i];
  row.classList.toggle('locked', !unlocked);
  cnt.textContent = '×' + fmt(S.counts[i]);   // 数量超1万按格式显示（×1.23万）
  if (!unlocked) {
    btn.textContent = 'Lv.' + (i + 1) + ' 解锁';
    btn.classList.add('no');
    bbtn.classList.add('no'); bbtn.disabled = true;
    out.innerHTML = '需达到 <b>' + levelName(i + 1) + '</b> 等级解锁（晋升需求 ' + fmt(devicePrice(i)) + ' 功德）';
    row.classList.remove('afford');
    return;
  }
  bbtn.classList.remove('no'); bbtn.disabled = false;
  var c = devicePrice(i);
  var u = deviceUnit(i);
  out.innerHTML = '每台 <b>' + fmtRate(u) + '</b> · 总 ' + fmtRate(mulBn(u, S.counts[i]));
  btn.textContent = '购买（' + fmt(c) + '）';
  var afford = gte(S.gold, c);
  btn.classList.toggle('no', !afford);
  row.classList.toggle('afford', afford);
}
function updateTop() {
  var lv = currentLevel(S.total);
  var badge = $('lv-badge');
  var name = $('lv-name');
  badge.textContent = 'Lv.' + lv;
  name.textContent = levelName(lv);
  if (lv >= MAX_LV) {
    name.style.background = LV_GRADIENT;
    name.style.textShadow = '0 0 22px rgba(255,215,106,.8)';
  } else {
    name.style.background = 'none';
    var lvc = LV_COLORS[Math.min(lv, LV_NAME_MAX)];
    name.style.color = lvc;
    name.style.textShadow = '0 0 14px ' + lvc + '66, 0 0 30px ' + lvc + '33';
  }
  /* 等级进度条：当前累计 / 升级所需 */
  var th = need(Math.min(lv + 1, MAX_LV));
  var fill = $('lv-prog-fill');
  var thTxt = $('lv-th');
  if (lv >= MAX_LV) {
    fill.style.width = '100%';
    thTxt.textContent = '已臻圆满 · 累计功德 ' + fmt(S.total);
  } else {
    var pct = 0;
    if (S.total.m > 0) {
      var next = need(lv + 1);
      if (gte(S.total, next)) pct = 100;
      else {
        /* 比例：在 [need(lv), need(lv+1)] 区间内线性 */
        var lo = need(lv);
        var span = sub(next, lo);
        var cur = sub(S.total, lo);
        if (span.m > 0 && cur.m > 0) pct = Math.min(100, (cur.m * Math.pow(10, cur.e - span.e)) / (span.m) * 100);
      }
    }
    fill.style.width = pct + '%';
    thTxt.textContent = '累计功德 ' + fmt(S.total) + ' / ' + fmt(next);
  }
}
function render() {
  var lv = currentLevel(S.total);
  checkPromotion(lv);
  $('m-gold').textContent = fmt(S.gold);
  var rate = totalRate();
  var mult = multiplier();
  $('m-pps').textContent = fmtRate(mulSmall(rate, mult));
  $('sec-rate').textContent = '基础产量：' + fmtRate(rate);
  var buff = buffValue();
  $('buff-fill').style.width = (Math.min(buff, BUFF_BAR_FULL) / BUFF_BAR_FULL * 100) + '%';
  $('buff-num').textContent = '倍率 ×' + mult.toFixed(2);
  $('tap-line').textContent = '👆 敲木鱼 +' + fmt(tapBase(lv)) + ' 功德 · 增产 +10%';
  updateTop();
  for (var i = 0; i < DEV_COUNT; i++) updateRow(i);
  updateFoot();
}
/* 累计总功德只增不减：等级提升时弹出晋升提醒 */
function checkPromotion(lv) {
  if (lv > lastLevel) {
    lastLevel = lv;
    showPromoModal(lv);
  }
}
function showPromoModal(lv) {
  var lvc = LV_COLORS[Math.min(lv, LV_NAME_MAX)];
  $('promo-name').textContent = '晋升 ' + levelName(lv);
  $('promo-name').style.color = lvc;
  $('promo-name').style.textShadow = '0 0 18px ' + lvc + '88';
  $('promo-lv').textContent = 'Lv.' + lv;
  $('promo-modal').hidden = false;
}
function updateFoot() {
  var foot = $('foot');
  if (!foot) return;
  var txt;
  if (author) txt = '🙏 敲木鱼增产 · 挂机基础倍率10% · 作者挂机无上限';
  else if (following) txt = '🙏 敲木鱼增产 · 挂机基础倍率10% · 挂机上限24小时';
  else txt = '🙏 敲木鱼增产 · 挂机基础倍率10% · 关注作者可解锁24小时挂机';
  if (foot._txt !== txt) { foot._txt = txt; foot.textContent = txt; }
}

/* ---------------- 敲击暴击 ----------------
 * x型：木鱼自身产量（不含增产设施）×倍数；pct型：当前升级所需功德 ×百分比 */
var CRITS = [
  { r: 1e-6,  name: '至尊暴击', mult: 0.25, type: 'pct' },
  { r: 1e-5,  name: '究极暴击', mult: 0.05, type: 'pct' },
  { r: 1e-4,  name: '超级暴击', mult: 0.01, type: 'pct' },
  { r: 1e-3,  name: '百倍暴击', mult: 100, type: 'x' },
  { r: 0.01,  name: '十倍暴击', mult: 10,  type: 'x' }
];
function critOf(r) {
  for (var i = 0; i < CRITS.length; i++) if (r < CRITS[i].r) return CRITS[i];
  return null;
}
function critBase(crit, lv) {
  if (crit.type === 'x') return mulSmall(tapBase(lv), crit.mult);
  return mulSmall(need(Math.min(lv + 1, MAX_LV)), crit.mult);
}
/* x型（十倍/百倍）暴击乘增产倍率；pct型（超级/究极/至尊）不乘 */
function critGain(crit, lv) {
  var base = critBase(crit, lv);
  return crit.type === 'x' ? mulSmall(base, multiplier()) : base;
}

/* ---------------- 操作 ---------------- */
function onTap(ev) {
  ensureAudio();
  playTap();
  var lv = currentLevel(S.total);
  var crit = critOf(Math.random());
  var gain, label;
  if (crit) {
    gain = critGain(crit, lv);
    label = crit.name + '！功德+' + fmt(gain) + '！';
  } else {
    gain = mulSmall(tapBase(lv), multiplier());
    label = '+' + fmt(gain) + ' 功德';
  }
  S.gold = add(S.gold, gain);
  S.total = add(S.total, gain);
  clickTs.push(Date.now());
  var wrap = $('muyu-wrap');
  wrap.classList.remove('tapped');
  void wrap.offsetWidth;
  wrap.classList.add('tapped');
  floatText(ev, label, crit ? 'crit' : '');
  render();
}
function buyDevice(i) {
  var lv = currentLevel(S.total);
  if (i >= lv) return;                       // 未解锁
  var c = devicePrice(i);
  if (!gte(S.gold, c)) return;
  S.gold = sub(S.gold, c);
  S.counts[i] = add(S.counts[i], { m: 1, e: 0 });
  updateRow(i);
  render();
}

/* ---------------- 批量购买（输入数量或拖动滑块） ---------------- */
var bulkIdx = 0, bulkMaxBn = { m: 1, e: 0 }, sliderMax = 1;
function vFloat(v) { return v.m * Math.pow(10, v.e); }
/* 输入字符串 → 大数（支持整数与科学计数，避免 parseInt 把 "6.2e+47" 解析成 6） */
function parseBulkNum(s) {
  var n = Number(s);
  if (!isFinite(n) || n <= 0) return { m: 1, e: 0 };
  return bnFrom(n);
}
/* 大数整数 → 显示字符串（≥10^21 用科学计数，输入框 Number 可正确解析） */
function bnToIntString(v) {
  if (v.m === 0) return '0';
  if (v.e >= 21) return trimNum(v.m.toFixed(2)) + 'e+' + v.e;
  return String(Math.floor(v.m * Math.pow(10, v.e) + 1e-9));
}
function clampBn(v, lo, hi) {
  if (gte(lo, v)) return lo;
  if (gte(v, hi)) return hi;
  return v;
}
function openBulk(i) {
  var lv = currentLevel(S.total);
  if (i >= lv) return;
  bulkIdx = i;
  var price = devicePrice(i);
  bulkMaxBn = divIntBn(S.gold, price);
  var bnNum = vFloat(bulkMaxBn);
  sliderMax = isFinite(bnNum) ? Math.min(Math.max(1, Math.floor(bnNum)), 9999) : 9999;
  $('bulk-name').textContent = DEV_ICONS[i] + ' ' + DEV_NAMES[i];
  $('bulk-price').textContent = '单台价格：' + fmt(price);
  if (bulkMaxBn.m === 0) {
    $('bulk-afford').textContent = '当前功德：' + fmt(S.gold) + ' · 功德不足，无法购买';
  } else {
    $('bulk-afford').textContent = '当前功德：' + fmt(S.gold) + ' · 最多可买 ' + fmt(bulkMaxBn) + ' 台';
  }
  var slider = $('bulk-slider');
  slider.min = '1';
  slider.max = String(sliderMax);
  slider.value = '1';
  $('bulk-num').value = '1';
  $('bulk-max').textContent = String(sliderMax);
  updateBulkUI();
  $('bulk-modal').hidden = false;
}
function updateBulkUI() {
  var nbn = clampBn(parseBulkNum($('bulk-num').value), { m: 1, e: 0 }, bulkMaxBn);
  var total = mulBn(devicePrice(bulkIdx), nbn);
  $('bulk-num').value = bnToIntString(nbn);
  var num = Number(bnToIntString(nbn)) || 1;
  $('bulk-slider').value = String(Math.min(num, sliderMax));
  $('bulk-total').textContent = fmt(total);
  $('btn-bulk-ok').disabled = !gte(S.gold, total);   // 功德不足时禁止购买
}
/* 一键选择当前功德能买的最大数量 */
function setBulkMax() {
  $('bulk-num').value = bnToIntString(bulkMaxBn);
  updateBulkUI();
}
function buyBulk() {
  var nbn = clampBn(parseBulkNum($('bulk-num').value), { m: 1, e: 0 }, bulkMaxBn);
  var total = mulBn(devicePrice(bulkIdx), nbn);
  if (!gte(S.gold, total)) return;
  S.gold = sub(S.gold, total);
  S.counts[bulkIdx] = add(S.counts[bulkIdx], nbn);
  $('bulk-modal').hidden = true;
  updateRow(bulkIdx);
  render();
}

/* ---------------- 转世重修（清空所有功德，重新开始） ---------------- */
function openReborn() { $('reborn-modal').hidden = false; }
function doReborn() {
  S.gold = { m: 0, e: 0 };
  S.total = { m: 0, e: 0 };
  S.counts = new Array(DEV_COUNT).fill(0).map(function () { return { m: 0, e: 0 }; });
  lastLevel = 0;
  clickTs.length = 0;   // 清空敲击增益
  $('reborn-modal').hidden = true;
  var d = makeSaveObj();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (e) {}
  /* 覆盖云端为转世后的空档，防止下次启动把云端旧高进度合并回来 */
  if (sdkReady()) {
    window.toy.setCloudStorage((function () { var kv = {}; kv[CLOUD_KEY] = JSON.stringify(d); return kv; })()).catch(function () {});
    window.toy.removeCloudStorage([CLOUD_KEY]).catch(function () {});
  }
  submitBoards(true);   // 榜单历史最高分保留（SDK 不降分），游戏内进度已清空
  buildList();
  render();
}

/* 浮动文字（cls：'' 普通 / 'crit' 暴击醒目） */
function floatText(ev, txt, cls) {
  var el = document.createElement('div');
  el.className = 'float-txt' + (cls ? ' ' + cls : '');
  el.textContent = txt;
  document.body.appendChild(el);
  var x, y;
  if (ev && ev.touches && ev.touches[0]) { x = ev.touches[0].clientX; y = ev.touches[0].clientY; }
  else if (ev && ev.clientX) { x = ev.clientX; y = ev.clientY; }
  else { x = window.innerWidth / 2; y = window.innerHeight * 0.42; }
  el.style.left = x + 'px';
  el.style.top = (y - 20) + 'px';
  setTimeout(function () { el.remove(); }, 900);
}

/* ---------------- 音效（Web Audio 合成木鱼声） ---------------- */
var ac = null;
function ensureAudio() {
  if (ac) return;
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
}
function playTap() {
  if (S.muted || !ac) return;
  try {
    var t = ac.currentTime;
    /* 主音：短促的“笃” */
    var o = ac.createOscillator();
    var g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(540, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.18);
    g.gain.setValueAtTime(0.85, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + 0.24);
    /* 泛音：增加敲击清脆感 */
    var o2 = ac.createOscillator();
    var g2 = ac.createGain();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(1150, t);
    o2.frequency.exponentialRampToValueAtTime(700, t + 0.08);
    g2.gain.setValueAtTime(0.22, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o2.connect(g2); g2.connect(ac.destination);
    o2.start(t); o2.stop(t + 0.11);
  } catch (e) {}
}
function toggleMute() {
  S.muted = !S.muted;
  $('btn-mute').textContent = S.muted ? '🔇' : '🔊';
  $('btn-mute').classList.toggle('off', S.muted);
  save();
}

/* ---------------- 挂机收益（基础倍率 10%，最高 8 小时） ---------------- */
function idleCap() {
  if (author) return Infinity;
  if (following) return 24 * 3600;
  return OFF_MAX;
}
function applyOffline(sec, cap) {
  if (sec <= 0) return { m: 0, e: 0 };
  var capped = Math.min(sec, cap);
  var gain = mulSmall(mulSmall(totalRate(), OFF_RATE), capped);
  S.gold = add(S.gold, gain);
  S.total = add(S.total, gain);
  return gain;
}
function fmtDur(sec) {
  if (sec < 60) return Math.max(1, Math.round(sec)) + ' 秒';
  if (sec < 3600) return Math.round(sec / 60) + ' 分钟';
  var h = Math.floor(sec / 3600);
  var m = Math.round((sec % 3600) / 60);
  return h + ' 小时' + (m ? ' ' + m + ' 分' : '');
}
function idleNote() {
  if (author) return '你是作者，挂机无上限';
  if (following) return '挂机基础倍率 10%，上限 24 小时';
  return '挂机基础倍率 10%，上限 8 小时 · 关注作者可解锁 24 小时';
}
function showIdleModal() {
  $('idle-dur').textContent = fmtDur(idleSec);
  $('idle-gain').textContent = fmt(idleGain) + ' 功德';
  $('idle-note').textContent = idleNote();
  var fb = $('idle-follow');
  fb.hidden = !(idleSec > OFF_MAX && !author && !following);
  if (!fb.hidden) {
    $('idle-follow-tip').textContent = followGuided
      ? '请先在 B站 App 关注作者，再点击「我已关注」'
      : '挂机上限 8 小时，关注作者可解锁 24 小时挂机';
    $('btn-follow').textContent = followGuided ? '我已关注' : '去关注作者';
  }
  $('idle-modal').hidden = false;
}

/* ---------------- 关注关系解析与挂机上限升级 ---------------- */
function waitSDK(timeout) {
  return new Promise(function (resolve) {
    if (sdkReady()) { resolve(true); return; }
    var t = setTimeout(function () { clearInterval(iv); resolve(false); }, timeout || 3000);
    var iv = setInterval(function () { if (sdkReady()) { clearInterval(iv); clearTimeout(t); resolve(true); } }, 100);
  });
}
function saveRelation() {
  try { localStorage.setItem(REL_KEY, JSON.stringify({ f: following, a: author, ts: Date.now() })); } catch (e) {}
}
function loadRelation() {
  try {
    var raw = localStorage.getItem(REL_KEY);
    if (!raw) return;
    var d = JSON.parse(raw);
    if (d && d.ts && Date.now() - d.ts < 30 * 86400 * 1000) {
      following = !!d.f;
      author = !!d.a;
    }
  } catch (e) {}
}
function fetchRelation() {
  return new Promise(function (resolve) {
    if (!sdkReady() || !window.toy.getAuthorRelation) { resolve(); return; }
    window.toy.getAuthorRelation().then(function (res) {
      if (res && res.status === 'ok' && res.data) {
        author = !!res.data.isAuthor;
        following = !!res.data.isFollowing;
        saveRelation();
      }
      resolve();
    }).catch(function () { resolve(); });
  });
}
function guideToFollow() {
  if (!sdkReady() || !window.toy.navigate) return;
  window.toy.navigate({ type: 'space', id: AUTHOR_UID }).catch(function () {
    if (!window.toy.getAuthorProfile) return;
    window.toy.getAuthorProfile().then(function (res) {
      var d = res && res.data;
      var mid = d && (d.mid || d.uid);
      if (mid) window.toy.navigate({ type: 'space', id: String(mid) }).catch(function () {});
    }).catch(function () {});
  });
}
function onFollowBtn() {
  if (!followGuided) {
    followGuided = true;
    guideToFollow();
    showIdleModal();
  } else {
    recheckFollow(true);
  }
}
function recheckFollow(showMsg) {
  fetchRelation().then(function () {
    if (following) {
      upgradeIdleCap();
      var fb = $('idle-follow');
      fb.hidden = true;
      followGuided = false;
    } else if (showMsg) {
      $('idle-follow-tip').textContent = '尚未检测到关注，请先在 B站 App 关注作者后回来';
    }
    render();
  });
}
function upgradeIdleCap() {
  if (idleSec < 1) return;
  var total = Math.min(idleSec, idleCap());
  if (total > idleGranted) {
    var extra = total - idleGranted;
    idleGranted = total;
    idleGain = add(idleGain, applyOffline(extra, idleCap()));
    showIdleModal();
  }
}

/* ---------------- 主循环（在线全速结算；离开游戏才挂机，由 visibilitychange 结算） ---------------- */
function tick() {
  var now = Date.now();
  if (!booted) { render(); return; }
  if (document.hidden) { lastTick = now; render(); return; }   // 离开期间挂机由 visibilitychange 处理
  var dt = (now - lastTick) / 1000;
  lastTick = now;
  var gain = mulSmall(totalRate(), multiplier() * dt);
  S.gold = add(S.gold, gain);
  S.total = add(S.total, gain);
  if (now - lastSave > SAVE_INTERVAL) { lastSave = now; save(); }
  submitBoards(false);
  render();
}
/* 异步执行云端合并 + 关注关系，全程不阻塞游戏（游戏已 booted 正常产出） */
function finishCloudAsync() {
  waitSDK(8000).then(function () {
    return mergeWithCloud();
  }).then(function (adopted) {
    if (adopted) { buildList(); render(); }
    return fetchRelation();
  }).then(function () {
    if (following) upgradeIdleCap();
    render();
  });
}
function settleAndShow() {
  var now = Date.now();
  idleSec = Math.max(0, (now - bootTs) / 1000);
  bootTs = 0;
  lastTick = now;
  booted = true;
  if (idleSec >= 1) {
    idleGranted = Math.min(idleSec, idleCap());
    idleGain = applyOffline(idleGranted, idleCap());
    showIdleModal();
  }
  render();
}

/* ---------------- B站 排行榜 ---------------- */
function sdkReady() {
  return typeof window !== 'undefined' && window.toy &&
    typeof window.toy.submitScore === 'function' &&
    typeof window.toy.getRankList === 'function';
}
function loadSDK() {
  try {
    if (sdkReady()) { submitBoards(true); return; }
    var s = document.createElement('script');
    s.src = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
    s.async = true;
    s.onload = function () { submitBoards(true); };   // 云端合并统一由 finishCloudAsync 异步完成
    document.head.appendChild(s);
  } catch (e) {}
}
function submitBoards(force) {
  if (!sdkReady()) return;
  var now = Date.now();
  if (!force && now - lastSubmit < SUBMIT_INTERVAL) return;
  lastSubmit = now;
  try {
    for (var p = 0; p < PERIODS.length; p++) {
      window.toy.submitScore({ board: BOARD_MERIT, period: PERIODS[p], score: encodeScore(S.total) }).catch(function () {});
      window.toy.submitScore({ board: BOARD_PPS, period: PERIODS[p], score: encodeScore(totalRate()) }).catch(function () {});
      window.toy.submitScore({ board: BOARD_LV, period: PERIODS[p], score: clamp(currentLevel(S.total), 0, 16777215) }).catch(function () {});
    }
  } catch (e) {}
}
var lbBoard = 1, lbPeriod = 'all';
function openLB(board) {
  $('lb-modal').hidden = false;
  switchTab(board || 1);
}
function switchTab(b) {
  lbBoard = b;
  var tabs = document.querySelectorAll('#lb-tabs .tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', Number(tabs[i].getAttribute('data-b')) === b);
  loadLB();
}
function switchPeriod(p) {
  lbPeriod = p;
  var tabs = document.querySelectorAll('#lb-ptabs .ptab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-p') === p);
  loadLB();
}
function loadLB() {
  if (!sdkReady()) {
    $('lb-note').textContent = '请在 B站 App 内打开以查看全球榜';
    $('lb-body').innerHTML = '<div class="lb-tip">当前环境不支持加载 B站 排行榜</div>';
    return;
  }
  var pName = lbPeriod === 'all' ? '总榜' : lbPeriod === 'month' ? '月榜' : lbPeriod === 'week' ? '周榜' : '日榜';
  var bName = lbBoard === BOARD_MERIT ? '总功德' : lbBoard === BOARD_PPS ? '每秒产出' : '功德等级';
  $('lb-note').textContent = pName + ' · ' + bName + '（历史最高）';
  $('lb-body').innerHTML = '<div class="lb-tip">加载中…</div>';
  window.toy.getRankList({ board: lbBoard, period: lbPeriod, limit: 100 }).then(function (list) {
    renderLB(list);
  }).catch(function () {
    $('lb-body').innerHTML = '<div class="lb-tip">加载失败</div>';
  });
  window.toy.getMyRank({ board: lbBoard, period: lbPeriod }).then(function (me) {
    if (me && me.ranked) $('lb-note').textContent += ' · 我的排名：第 ' + me.rank + ' 名';
  }).catch(function () {});
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function renderLB(list) {
  if (!list || !list.length) {
    $('lb-body').innerHTML = '<div class="lb-tip">暂无上榜数据</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < list.length; i++) {
    var it = list[i];
    var txt;
    if (lbBoard === BOARD_LV) txt = levelName(clamp(it.score, 0, MAX_LV));
    else txt = (lbBoard === BOARD_PPS ? fmtSmall(decodeScore(it.score)) + '/秒' : fmt(decodeScore(it.score)));
    html += '<div class="lb-row">' +
      '<span class="lb-rank' + (it.rank <= 3 ? ' top' : '') + '">' + it.rank + '</span>' +
      '<img class="lb-avatar" src="' + esc(it.avatar) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
      '<span class="lb-name">' + esc(it.nickname) + '</span>' +
      '<span class="lb-score">' + txt + '</span>' +
      '</div>';
  }
  $('lb-body').innerHTML = html;
}

/* ---------------- 初始化 ---------------- */
function init() {
  load();
  loadRelation();
  lastLevel = currentLevel(S.total);   // 初始等级不弹晋升，升级时才弹
  buildList();
  bootTs = lastTick;

  $('btn-mute').textContent = S.muted ? '🔇' : '🔊';
  $('btn-mute').classList.toggle('off', S.muted);

  $('muyu-card').addEventListener('click', onTap);
  $('btn-mute').addEventListener('click', toggleMute);
  $('btn-rank').addEventListener('click', function () { openLB(); });
  $('btn-close-lb').addEventListener('click', function () { $('lb-modal').hidden = true; });
  $('lb-modal').addEventListener('click', function (ev) { if (ev.target === $('lb-modal')) $('lb-modal').hidden = true; });
  $('btn-idle-ok').addEventListener('click', function () { $('idle-modal').hidden = true; });
  $('idle-modal').addEventListener('click', function (ev) { if (ev.target === $('idle-modal')) $('idle-modal').hidden = true; });
  $('btn-follow').addEventListener('click', onFollowBtn);
  $('btn-close-bulk').addEventListener('click', function () { $('bulk-modal').hidden = true; });
  $('bulk-modal').addEventListener('click', function (ev) { if (ev.target === $('bulk-modal')) $('bulk-modal').hidden = true; });
  $('btn-bulk-cancel').addEventListener('click', function () { $('bulk-modal').hidden = true; });
  $('btn-bulk-ok').addEventListener('click', buyBulk);
  $('bulk-slider').addEventListener('input', function () { $('bulk-num').value = this.value; updateBulkUI(); });
  $('bulk-num').addEventListener('change', updateBulkUI);
  $('btn-bulk-max').addEventListener('click', setBulkMax);
  $('btn-promo-ok').addEventListener('click', function () { $('promo-modal').hidden = true; });
  $('promo-modal').addEventListener('click', function (ev) { if (ev.target === $('promo-modal')) $('promo-modal').hidden = true; });
  $('btn-reborn').addEventListener('click', openReborn);
  $('btn-reborn-ok').addEventListener('click', doReborn);
  $('btn-reborn-cancel').addEventListener('click', function () { $('reborn-modal').hidden = true; });
  $('reborn-modal').addEventListener('click', function (ev) { if (ev.target === $('reborn-modal')) $('reborn-modal').hidden = true; });
  var tabs = document.querySelectorAll('#lb-tabs .tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function () { switchTab(Number(this.getAttribute('data-b'))); });
  }
  var ptabs = document.querySelectorAll('#lb-ptabs .ptab');
  for (var j = 0; j < ptabs.length; j++) {
    ptabs[j].addEventListener('click', function () { switchPeriod(this.getAttribute('data-p')); });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      hiddenAt = Date.now();       // 离开游戏：记录离开时刻并停止在线结算
      lastTick = Date.now();
      writeBoth();                 // 立即保存本地 + B站 云存储
      submitBoards(true);          // 立即提交排行榜
      return;
    }
    var now = Date.now();
    if (hiddenAt > 0) {            // 回到游戏：结算离开期间挂机收益（基础产出×10%）
      var sec = (now - hiddenAt) / 1000;
      hiddenAt = 0;
      if (booted && sec >= 1) {
        idleSec = sec;
        idleGranted = Math.min(sec, idleCap());
        idleGain = applyOffline(idleGranted, idleCap());
        showIdleModal();
      }
    }
    lastTick = now;
    if (!$('idle-modal').hidden && !$('idle-follow').hidden && !following) recheckFollow(false);
  });
  window.addEventListener('beforeunload', function () { writeBoth(); submitBoards(true); });

  // 立即进入游戏：结算本地离线挂机并开始产出，不等待 SDK（避免阻塞游戏进程）
  settleAndShow();
  // SDK 相关（云端合并/关注关系/榜单）完全异步执行，不阻塞
  loadSDK();
  finishCloudAsync();
  submitBoards(true);

  render();
  setInterval(tick, 1000);
  setInterval(render, 100);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

/* 供 Node 冒烟测试 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    bn: bn, bnFrom: bnFrom, add: add, sub: sub, mulSmall: mulSmall, mulBn: mulBn, divIntBn: divIntBn, gte: gte,
    fmt: fmt, fmtSmall: fmtSmall, fmtRate: fmtRate,
    encodeScore: encodeScore, decodeScore: decodeScore,
    NEED_EXP: NEED_EXP, LV_NAMES: LV_NAMES, MAX_LV: MAX_LV, LV_COLORS: LV_COLORS,
    LV_NAME_MAX: LV_NAME_MAX, levelName: levelName, needExp: needExp,
    need: need, currentLevel: currentLevel, tapBase: tapBase,
    CRITS: CRITS, critOf: critOf, critBase: critBase, critGain: critGain,
    DEV_NAMES: DEV_NAMES, DEV_COUNT: DEV_COUNT, devicePrice: devicePrice, deviceUnit: deviceUnit,
    totalRate: totalRate, deviceTotal: deviceTotal,
    buffValue: buffValue, multiplier: multiplier, clickTs: clickTs, CLICK_MS: CLICK_MS, CLICK_BOOST: CLICK_BOOST,
    idleCap: idleCap, idleNote: idleNote, applyOffline: applyOffline, OFF_RATE: OFF_RATE, OFF_MAX: OFF_MAX,
    setRelation: function (a, f) { author = !!a; following = !!f; },
    makeSaveObj: makeSaveObj,
    parseBulkNum: parseBulkNum, bnToIntString: bnToIntString, clampBn: clampBn,
    S: S
  };
}
