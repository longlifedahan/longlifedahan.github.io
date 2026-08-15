/* ============================================================
 * 财富帝国 · 挂机游戏 (D:\b站toy\money)
 * 纯原生 H5+JS。核心：钱（元/万/亿/... ≥10^50 科学计数）。
 * - 大本营：产出每级×10，升级费每级×100；点击 +10% 衰减增益（1 分钟线性衰减、无上限、作用于总产出）
 * - 100 种建筑：第 n 座价格 10^(2n-2)、产出 10^(2n-5)×(1+(n-1)%)/s（1000s 回本），
 *   需大本营 n 级解锁；存钱罐（第 1 座）固定价格 10、单座产出 0.01
 * - 挂机：在线×1，挂机基础倍率 5%；上限分级=作者无限/关注作者24h/默认8h
 * - B站排行榜：3 个榜位 = 总资产 / 每秒基础产值 / 大本营等级
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
function gte(a, b) {
  if (a.m === 0) return b.m === 0;
  if (b.m === 0) return true;
  if (a.e > b.e) return true;
  if (a.e < b.e) return false;
  return a.m >= b.m - 1e-12;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* ---------------- 格式化（元/万/亿/… / 科学计数） ---------------- */
function trimNum(s) {
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
function unitName(k) {
  if (k <= 0) return '';
  var yi = new Array(Math.floor(k / 2)).fill('亿').join('');
  if (k % 2 === 1) return '万' + yi;
  return yi;
}
var SCI_E = 50;   // 超过 10^50 用科学计数法
function fmt(v) {
  if (!v || v.m === 0) return '0';
  if (v.e > SCI_E) {
    return trimNum(v.m.toFixed(3)) + '*10^' + v.e;
  }
  var k = Math.floor(v.e / 4);
  if (k <= 0) {
    return trimNum((v.m * Math.pow(10, v.e)).toFixed(2)) + '元';
  }
  var val = v.m * Math.pow(10, v.e - 4 * k);
  return trimNum(val.toFixed(2)) + unitName(k);
}
/* 每秒产出专用：加“/秒” */
function fmtRate(v) { return fmt(v) + '/秒'; }
/* 顶部资产显示：≥1万 保留小数（1.23万）；<1万 只取整数（123元，忽略 0.45） */
function fmtInt(v) {
  if (!v || v.m === 0) return '0';
  if (v.e > SCI_E) return trimNum(v.m.toFixed(3)) + '*10^' + v.e;
  var k = Math.floor(v.e / 4);
  if (k <= 0) return Math.floor(v.m * Math.pow(10, v.e)) + '元';
  return trimNum((v.m * Math.pow(10, v.e - 4 * k)).toFixed(2)) + unitName(k);
}

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
  var mant = enc % 10000;
  return bnFrom(mant * Math.pow(10, e - 3));
}

/* ---------------- 100 种建筑（名字越来越牛） ---------------- */
var BUILDING_NAMES = [
  '存钱罐','零钱盒','糖果铺','旧书店','报刊亭',
  '奶茶摊','早餐铺','水果摊','杂货店','小超市',
  '玩具店','服装店','家电城','网咖','快递站',
  '电影院','手机旗舰店','连锁超市','房产中介','汽车4S店',
  '物流园','商业街','游乐园','五星酒店','豪华商场',
  '摩天写字楼','芯片工厂','港口码头','航空公司','地产集团',
  '私人银行','风投基金','云计算中心','新能源电站','高铁集团',
  '航天公司','深海钻探平台','生物实验室','量子计算中心','超级制造基地',
  '数据交易所','电商帝国','娱乐经纪公司','智慧城市','太空电梯公司',
  '火星殖民地','戴森球能源站','时光研究所','星系银行','银河矿业公司',
  '虫洞收费站','恒星熔炉','量子帝国','超维银行','时空铸币厂',
  '宇宙商行','平行贸易局','多元宇宙钱庄','概念铸币局','命运交易所',
  '法则金币局','真理银行','无限造币厂','因果商会','熵值金库',
  '宇宙银行','真理通货所','至高钱座','本源铸币神域','万物中央银行',
  '永恒财富塔','创世金库','众神财政部','诸神银行','命运金币王座',
  '贪欲之泉','法则掠夺总部','维度钱庄','太初金矿','混沌印钞机',
  '奇迹锻造厂','神话铸币间','星辉财政厅','宇宙印钞总局','纪元货币领主',
  '虚空金脉','不朽财富圣殿','神国金库','全能印钞神坛','至高财富权杖',
  '命运金库','太一钱庄','无极金池','绝对财富法则','大道银行',
  '鸿蒙铸币炉','天道金库','无穷财富之门','起源金币圣殿','终极货币之神'
];
var B_COUNT = BUILDING_NAMES.length;   // 100

/* ---------------- 常量 ---------------- */
var SAVE_KEY = 'money_save_v1';
var REL_KEY = 'money_rel_v1';   // 持久化作者/关注关系
var AUTHOR_UID = '13450091';    // 作者 B站 UID：关注引导跳转主页用
var OFF_RATE = 0.05;      // 挂机基础倍率 5%
var OFF_MAX = 8 * 3600;   // 默认挂机上限 8 小时
var CLICK_BOOST = 0.10;   // 每次点击 +10%
var CLICK_MS = 60000;     // 持续 1 分钟，线性衰减（无上限，可叠加）
var BUFF_BAR_FULL = 19.0; // 增益条满格基准：倍率 ×20（buff=19）才满，超出后条满但倍率继续涨
var SAVE_INTERVAL = 5000;
var SUBMIT_INTERVAL = 60000;
var BOARD_GOLD = 1, BOARD_PPS = 2, BOARD_LV = 3;

/* ---------------- 游戏状态 ---------------- */
var S = {
  gold: { m: 0, e: 0 },
  totalGold: { m: 0, e: 0 },
  baseLevel: 1,
  counts: new Array(B_COUNT).fill(0)
};
var clickTs = [];
var lastTick = Date.now();
var lastSave = Date.now();
var lastSubmit = 0;
var booted = false, bootTs = 0;   // 启动期：完成本地+云端读档前不结算，bootTs 为离线计时起点
// 挂机上限分级：作者无限 / 关注作者 24h / 默认 8h
var author = false, following = false;
var followGuided = false;
var idleSec = 0, idleGranted = 0;      // 本次进入的挂机秒数 / 已结算秒数（用于升级补差）
var idleGain = { m: 0, e: 0 };         // 已累计结算的挂机收益（弹窗显示）

/* ---------------- 产出计算 ---------------- */
function baseRate() { return bnFrom(Math.pow(10, S.baseLevel - 1)); }
/* 单座产量：10^(2n-5) × 等级增益（lv1=100%、lv2=101%、lv3=102%…，n 为建筑序号）；存钱罐固定 0.01 */
function buildingUnitRate(i) {
  if (i === 0) return bnFrom(0.01);
  return bnFrom(Math.pow(10, 2 * (i + 1) - 5) * (1 + i * 0.01));
}
function buildingRate(i) { return mulSmall(buildingUnitRate(i), S.counts[i]); }  // 总产量（数量×单座）
function totalRate() {
  var r = baseRate();
  for (var i = 0; i < B_COUNT; i++) if (S.counts[i]) r = add(r, buildingRate(i));
  return r;
}
function costBase() { return bnFrom(Math.pow(10, 2 * S.baseLevel)); }
function costBuilding(i) { if (i === 0) return bnFrom(10); return bnFrom(Math.pow(10, 2 * (i + 1) - 2)); }   // 价格 10^(2n-2)，存钱罐固定 10

/* ---------------- 点击增益（衰减、可叠加、作用于总产出） ---------------- */
function buffValue() {
  var now = Date.now();
  while (clickTs.length && now - clickTs[0] > CLICK_MS) clickTs.shift();
  var sum = 0;
  for (var i = 0; i < clickTs.length; i++) {
    sum += CLICK_BOOST * (1 - (now - clickTs[i]) / CLICK_MS);
  }
  return sum;   // 无上限，可叠加
}
function multiplier() { return 1 + buffValue(); }

/* ---------------- 存档 / 多端合并（按历史总资产取高） ----------------
 * 无法加载 SDK → 只用本地 localStorage 读/写。
 * SDK 可用 → 对比本地与 B站 云端的历史总资产（totalGold，只增不减），取高者作为当前状态，
 * 并覆盖低者回写两端（云端 + localStorage），多端进度不丢失、不倒退。 */
var CLOUD_KEY = 'money_save';
var CLOUD_SAVE_INTERVAL = 15000;
var cloudLastSave = 0;
var cloudMerged = false;
function makeSaveObj() {
  return { g: [S.gold.m, S.gold.e], tg: [S.totalGold.m, S.totalGold.e], l: S.baseLevel, c: S.counts, ts: Date.now() };
}
function stateGold(d) {
  return Array.isArray(d.tg) ? bn(d.tg[0], d.tg[1]) : { m: 0, e: 0 };
}
function isValidState(d) {
  return d && Array.isArray(d.g) && Array.isArray(d.tg);
}
function adoptState(d) {
  if (!d) return;
  S.gold = Array.isArray(d.g) ? bn(d.g[0], d.g[1]) : { m: 0, e: 0 };
  S.totalGold = Array.isArray(d.tg) ? bn(d.tg[0], d.tg[1]) : { m: 0, e: 0 };
  S.baseLevel = clamp(d.l || 1, 1, 100000);
  S.counts = (d.c && d.c.length === B_COUNT) ? d.c : S.counts;
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
/* 强制回写两端（合并时用，不走节流） */
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
/* SDK 可用时对比本地与云端：取历史总资产高者，覆盖低者并回写两端 */
function mergeWithCloud() {
  return new Promise(function (resolve) {
    if (!sdkReady()) { resolve(false); return; }
    cloudMerged = true;
    try {
      window.toy.getCloudStorage([CLOUD_KEY]).then(function (data) {
        try {
          var c = data && data[CLOUD_KEY] ? JSON.parse(data[CLOUD_KEY]) : null;
          if (isValidState(c) && gte(stateGold(c), S.totalGold)) {
            // 云端历史总资产 >= 本地 → 采用云端
            adoptState(c);
            lastTick = (c.ts > 0) ? c.ts : Date.now();
          }
          // 覆盖低者：无论哪端胜出，都把胜者回写两端
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
  refs.bcount = []; refs.bout = []; refs.bbtn = [];
  var frag = document.createDocumentFragment();
  for (var i = 0; i < Math.min(S.baseLevel, B_COUNT); i++) {
    (function (idx) {
      var row = document.createElement('div');
      row.className = 'brow';
      row.id = 'brow-' + idx;
      var main = document.createElement('div');
      main.className = 'brow-main';
      var lv = document.createElement('span');
      lv.className = 'blv'; lv.textContent = 'Lv.' + (idx + 1);
      var nm = document.createElement('span');
      nm.className = 'bname'; nm.textContent = BUILDING_NAMES[idx];
      var cnt = document.createElement('span');
      cnt.className = 'bcount';
      var btn = document.createElement('button');
      btn.className = 'bbtn';
      btn.addEventListener('click', function (ev) { ev.stopPropagation(); buyBuilding(idx); });
      main.appendChild(lv); main.appendChild(nm); main.appendChild(cnt); main.appendChild(btn);
      var out = document.createElement('div');
      out.className = 'bout';
      row.appendChild(main); row.appendChild(out);
      frag.appendChild(row);
      refs.bcount[idx] = cnt;
      refs.bout[idx] = out;
      refs.bbtn[idx] = btn;
    })(i);
  }
  list.appendChild(frag);
  buildLockTip();
}
function buildLockTip() {
  var tip = $('lock-tip');
  if (S.baseLevel >= B_COUNT) { tip.innerHTML = ''; return; }
  var remain = B_COUNT - S.baseLevel;
  var next = S.baseLevel + 1; // 下一座（下标 baseLevel）
  var html = '';
  html += '<div>🔒 还有 <b>' + remain + '</b> 种建筑未解锁</div>';
  html += '<div>下一座：<span class="plv">Lv.' + next + '</span> ' + BUILDING_NAMES[S.baseLevel] + '（需大本营升至 <b>Lv.' + next + '</b>）</div>';
  html += '<button class="lock-toggle" id="lock-toggle">展开预览</button>';
  html += '<div class="lock-preview" id="lock-preview" hidden></div>';
  tip.innerHTML = html;
  var tgl = $('lock-toggle');
  var pre = $('lock-preview');
  tgl.addEventListener('click', function () {
    if (pre.hidden) {
      var arr = [];
      var n = Math.min(B_COUNT, next + 5);
      for (var i = S.baseLevel; i < n; i++) {
        arr.push('<div>· <span class="plv">Lv.' + (i + 1) + '</span> ' + BUILDING_NAMES[i] + ' — 需大本营 ' + (i + 1) + ' 级</div>');
      }
      pre.innerHTML = arr.join('');
      pre.hidden = false;
      tgl.textContent = '收起预览';
    } else { pre.hidden = true; tgl.textContent = '展开预览'; }
  });
}
function updateBase() {
  $('b-lv').textContent = 'Lv.' + S.baseLevel;
  $('b-rate').textContent = '每秒产出：' + fmt(baseRate());
  var up = $('b-up');
  up.classList.toggle('locked', !gte(S.gold, costBase()));
  $('b-up-cost').textContent = fmt(costBase());
}
function updateRow(i) {
  if (!refs.bcount[i]) return;
  refs.bcount[i].textContent = '×' + S.counts[i];
  refs.bout[i].innerHTML = '每秒产出资产：<b>' + fmt(buildingUnitRate(i)) + '</b>（每座）';
  var btn = refs.bbtn[i];
  var c = costBuilding(i);
  btn.textContent = '新建（' + fmt(c) + '）';
  btn.classList.toggle('no', !gte(S.gold, c));
  var row = $('brow-' + i);
  row.classList.toggle('afford', gte(S.gold, c));
}
function render() {
  $('m-gold').textContent = fmtInt(S.gold);
  $('m-total').textContent = fmtInt(S.totalGold);
  var buff = buffValue();
  var rate = totalRate();
  $('m-mult').textContent = '倍率 ×' + (1 + buff).toFixed(2);
  $('m-base').textContent = '基础 ' + fmt(rate) + '/秒';
  $('m-pps').textContent = '每秒 +' + fmt(mulSmall(rate, multiplier()));
  $('buff-fill').style.width = (Math.min(buff, BUFF_BAR_FULL) / BUFF_BAR_FULL * 100) + '%';
  updateBase();
  var n = Math.min(S.baseLevel, B_COUNT);
  for (var i = 0; i < n; i++) updateRow(i);
  updateFoot();
}
/* 页脚按身份提示，已关注/作者不再出现“关注作者解锁8h”的提醒 */
function updateFoot() {
  var foot = $('foot');
  if (!foot) return;
  var txt;
  if (author) txt = '💰 点大本营增产 · 挂机基础倍率5% · 作者挂机无上限';
  else if (following) txt = '💰 点大本营增产 · 挂机基础倍率5% · 挂机上限24小时';
  else txt = '💰 点大本营增产 · 挂机基础倍率5% · 关注作者可解锁24小时挂机';
  if (foot._txt !== txt) { foot._txt = txt; foot.textContent = txt; }
}

/* ---------------- 操作 ---------------- */
function onBaseTap(ev) {
  if (ev && ev.target && ev.target.closest && ev.target.closest('#b-up')) return;
  clickTs.push(Date.now());
  $('base-icon').classList.remove('pop');
  void $('base-icon').offsetWidth;
  $('base-icon').classList.add('pop');
  floatText(ev, '+10%');
  render();
}
function buyBase() {
  var c = costBase();
  if (!gte(S.gold, c)) return;
  S.gold = sub(S.gold, c);
  S.baseLevel++;
  save();
  submitBoards(true);
  buildList();
  render();
  floatText(null, '🏰 Lv.' + S.baseLevel, $('base-card'));
}
function buyBuilding(i) {
  var c = costBuilding(i);
  if (!gte(S.gold, c)) return;
  S.gold = sub(S.gold, c);
  S.counts[i]++;
  updateRow(i);
  render();
}

/* 浮动文字 */
function floatText(ev, txt, anchor) {
  var el = document.createElement('div');
  el.className = 'float-txt';
  el.textContent = txt;
  document.body.appendChild(el);
  var x, y;
  if (anchor) {
    var r = anchor.getBoundingClientRect();
    x = r.left + r.width / 2; y = r.top + r.height / 2;
  } else if (ev) {
    x = ev.clientX || ev.touches && ev.touches[0].clientX || window.innerWidth / 2;
    y = ev.clientY || ev.touches && ev.touches[0].clientY || 120;
  } else {
    x = window.innerWidth / 2; y = 120;
  }
  el.style.left = x + 'px';
  el.style.top = (y - 10) + 'px';
  setTimeout(function () { el.remove(); }, 800);
}

/* ---------------- 挂机收益（基础倍率 5%，最高 8 小时） ----------------
 * applyOffline 只结算收益并返回，不弹 UI；重进弹窗由 finishBoot→settleAndShow 触发 */
function idleCap() {
  if (author) return Infinity;          // 作者本人：无限挂机
  if (following) return 24 * 3600;      // 关注作者：24 小时
  return OFF_MAX;                       // 默认：8 小时
}
function applyOffline(sec, cap) {
  if (sec <= 0) return { m: 0, e: 0 };
  var capped = Math.min(sec, cap);
  var gain = mulSmall(mulSmall(totalRate(), OFF_RATE), capped);
  S.gold = add(S.gold, gain);
  S.totalGold = add(S.totalGold, gain);
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
  if (following) return '挂机基础倍率 5%，上限 24 小时';
  return '挂机基础倍率 5%，上限 8 小时 · 关注作者可解锁 24 小时';
}
/* 重进挂机回报弹窗（非 alert）：超 8h 且非作者/非关注时展示关注引导 */
function showIdleModal() {
  $('idle-dur').textContent = fmtDur(idleSec);
  $('idle-gain').textContent = fmt(idleGain);
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
/* 读取持久化关系作为检测失败时的兜底：已关注用户不会被误判成 8h 并反复提醒 */
function loadRelation() {
  try {
    var raw = localStorage.getItem(REL_KEY);
    if (!raw) return;
    var d = JSON.parse(raw);
    if (d && d.ts && Date.now() - d.ts < 30 * 86400 * 1000) {   // 30 天内有效
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
  // 优先跳转作者主页（固定 UID），失败再尝试从作者资料取 mid
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
/* 关注后上限从 8h 升到 24h（作者为无限），补发差额挂机收益 */
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

/* ---------------- 主循环 ---------------- */
function tick() {
  var now = Date.now();
  var dt = (now - lastTick) / 1000;
  lastTick = now;
  if (!booted) { render(); return; }   // 启动期等待本地+云端读档+关注关系
  // 超过 1.5s 的部分视为挂机（如页面被节流/挂后台），按基础倍率 5% 计
  var online = Math.min(dt, 1.5);
  if (dt > online) applyOffline(dt - online, idleCap());
  var gain = mulSmall(totalRate(), multiplier() * online);
  S.gold = add(S.gold, gain);
  S.totalGold = add(S.totalGold, gain);
  if (now - lastSave > SAVE_INTERVAL) { lastSave = now; save(); }
  submitBoards(false);
  render();
}
/* 启动：等 SDK 就绪→多端合并(取历史总资产高者)→解析关注关系→按对应上限结算挂机并弹窗
 * （避免首帧 tick 与云端读档重复计算） */
function finishBoot() {
  waitSDK(3000).then(function () {
    return mergeWithCloud();
  }).then(function (adopted) {
    if (adopted) { bootTs = lastTick; buildList(); render(); }
    return fetchRelation();
  }).then(function () {
    settleAndShow();
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
    // 合并前绝不能写云端：否则会用未合并的本地低数据覆盖云端高数据。
    // 合并统一由 finishBoot 的 mergeWithCloud 完成（取历史总资产高者再回写两端）。
    if (sdkReady()) { submitBoards(true); return; }
    var s = document.createElement('script');
    s.src = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
    s.async = true;
    s.onload = function () {
      submitBoards(true);
      // 若本会话启动时 SDK 未就绪、云端未合并，此处补做多端合并（取历史总资产高者）
      if (!cloudMerged) {
        mergeWithCloud().then(function (adopted) {
          if (adopted) { bootTs = lastTick; buildList(); render(); }
        });
      }
    };
    document.head.appendChild(s);
  } catch (e) {}
}
function submitBoards(force) {
  if (!sdkReady()) return;
  var now = Date.now();
  if (!force && now - lastSubmit < SUBMIT_INTERVAL) return;
  lastSubmit = now;
  try {
    window.toy.submitScore({ board: BOARD_GOLD, score: encodeScore(S.totalGold) }).catch(function () {});
    window.toy.submitScore({ board: BOARD_PPS, score: encodeScore(totalRate()) }).catch(function () {});
    window.toy.submitScore({ board: BOARD_LV, score: clamp(S.baseLevel, 0, 16777215) }).catch(function () {});
  } catch (e) {}
}
function openLB(board) {
  $('lb-modal').hidden = false;
  switchTab(board || 1);
}
function switchTab(b) {
  var tabs = document.querySelectorAll('#lb-tabs .tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', Number(tabs[i].getAttribute('data-b')) === b);
  if (!sdkReady()) {
    $('lb-note').textContent = '请在 B站 App 内打开以查看全球榜';
    $('lb-body').innerHTML = '<div class="lb-tip">当前环境不支持加载 B站 排行榜</div>';
    return;
  }
  $('lb-note').textContent = b === BOARD_GOLD ? '榜位① · 累计总资产（历史最高）'
    : b === BOARD_PPS ? '榜位② · 每秒基础产值'
    : '榜位③ · 大本营等级';
  $('lb-body').innerHTML = '<div class="lb-tip">加载中…</div>';
  window.toy.getRankList({ board: b, period: 'all', limit: 50 }).then(function (list) {
    renderLB(b, list);
  }).catch(function () {
    $('lb-body').innerHTML = '<div class="lb-tip">加载失败</div>';
  });
  window.toy.getMyRank({ board: b, period: 'all' }).then(function (me) {
    if (me && me.ranked) $('lb-note').textContent += ' · 我的排名：第 ' + me.rank + ' 名';
  }).catch(function () {});
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function renderLB(b, list) {
  if (!list || !list.length) {
    $('lb-body').innerHTML = '<div class="lb-tip">暂无上榜数据</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < list.length; i++) {
    var it = list[i];
    var txt;
    if (b === BOARD_LV) txt = 'Lv.' + it.score;
    else txt = fmt(decodeScore(it.score)) + (b === BOARD_PPS ? '/秒' : '');
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
  loadRelation();         // 先取持久化的作者/关注关系（检测失败时的兜底）
  bootTs = lastTick;      // 离线计时起点 = 本地存档时间
  loadSDK();
  submitBoards(true);

  // finishBoot 内：等 SDK 就绪→读云端(SDK 优先)→解析关注关系→按上限结算挂机
  finishBoot();

  $('base-card').addEventListener('click', function (ev) { onBaseTap(ev); });
  $('b-up').addEventListener('click', function (ev) { ev.stopPropagation(); buyBase(); });
  $('btn-rank').addEventListener('click', function () { openLB(); });
  $('btn-close-lb').addEventListener('click', function () { $('lb-modal').hidden = true; });
  $('lb-modal').addEventListener('click', function (ev) { if (ev.target === $('lb-modal')) $('lb-modal').hidden = true; });
  $('btn-idle-ok').addEventListener('click', function () { $('idle-modal').hidden = true; });
  $('idle-modal').addEventListener('click', function (ev) { if (ev.target === $('idle-modal')) $('idle-modal').hidden = true; });
  $('btn-follow').addEventListener('click', onFollowBtn);
  var tabs = document.querySelectorAll('#lb-tabs .tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function () { switchTab(Number(this.getAttribute('data-b'))); });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { save(); return; }
    // 从 B站 App 关注后返回：重查关注状态并升级挂机上限
    if (!$('idle-modal').hidden && !$('idle-follow').hidden && !following) recheckFollow(false);
  });
  window.addEventListener('beforeunload', save);

  buildList();
  render();
  setInterval(tick, 1000);   // 资产每 1s 一跳结算
  setInterval(render, 100);  // UI 高频刷新（增益条/倍率/可购买高亮）
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
    bn: bn, bnFrom: bnFrom, add: add, sub: sub, mulSmall: mulSmall, gte: gte,
    fmt: fmt, fmtRate: fmtRate, fmtInt: fmtInt, unitName: unitName,
    encodeScore: encodeScore, decodeScore: decodeScore,
    baseRate: baseRate, buildingRate: buildingRate, buildingUnitRate: buildingUnitRate, costBase: costBase,
    costBuilding: costBuilding, totalRate: totalRate, multiplier: multiplier,
    buffValue: buffValue, clickTs: clickTs, CLICK_MS: CLICK_MS, CLICK_BOOST: CLICK_BOOST,
    idleCap: idleCap, idleNote: idleNote, applyOffline: applyOffline, OFF_RATE: OFF_RATE, OFF_MAX: OFF_MAX,
    setRelation: function (a, f) { author = !!a; following = !!f; },
    BUILDING_NAMES: BUILDING_NAMES, B_COUNT: B_COUNT, S: S
  };
}
