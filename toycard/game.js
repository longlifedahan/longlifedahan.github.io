/* ================= 配置 ================= */
var API_BASE = (typeof window !== 'undefined' && window.__TOYCARD_API__)
  ? window.__TOYCARD_API__
  : 'https://api.bilitoy.beer/api/toys';
var PAGE_SIZE = 60;               // 服务端单页上限
var API_URL = API_BASE + '?p1=2&ps=' + PAGE_SIZE;

/* 黑名单 / 收藏：优先 B站 k-v 云存储（多端同步），localStorage 仅作本地缓存 */
var K_BLACK = 'tc_black';
var K_FAV = 'tc_fav';
var K_CACHE = 'toycard_cache_v1'; // 全量数据缓存（网络异常兜底）

/* 排行榜统计（board 固定 1/2/3） */
var B_PV = 1;        // 页面访问次数（每次进入 +1）
var B_SINGLE = 2;    // 单抽次数（每次单抽 +1）
var B_TEN = 3;       // 十连次数（每次十连 +1）

/* ================= 状态 ================= */
var DATA = { items: [], categories: [], total: 0 };
var selCats = {};                 // 分类 -> 是否选中（默认全选）
var blackMap = {};                // id -> item
var favMap = {};                  // id -> item
var currentResult = [];           // 当前抽卡结果
var currentTab = 'gacha';         // 当前 tab
var drawing = false;              // 抽卡特效中（防连点）

function $(id) { return document.getElementById(id); }

/* ================= 工具 ================= */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function objToArr(map) {
  var out = [];
  for (var k in map) if (Object.prototype.hasOwnProperty.call(map, k)) out.push(map[k]);
  return out;
}
function findItem(id) {
  for (var i = 0; i < DATA.items.length; i++) if (DATA.items[i].id === id) return DATA.items[i];
  return null;
}
function formatPv(item) {
  if (item.pv_text) return item.pv_text;
  var pv = Number(item.pv) || 0;
  if (!pv) return '';
  if (pv >= 10000) return (pv / 10000).toFixed(1) + 'w';
  return String(pv);
}
function toyUrl(item) {
  return 'https://www.bilibili.com/toy/' + encodeURIComponent(item.slug);
}

/* ================= B站 SDK（异步懒加载，永不阻塞页面） ================= */
function cloudReady() {
  return typeof window !== 'undefined' && window.toy &&
    typeof window.toy.getCloudStorage === 'function' &&
    typeof window.toy.setCloudStorage === 'function';
}
function sdkReady() {
  return typeof window !== 'undefined' && window.toy &&
    typeof window.toy.getRankList === 'function' &&
    typeof window.toy.submitScore === 'function';
}
/* 是否 B站 域名环境（App 内/www.bilibili.com）。本地/外部域名不在此列 */
function inBiliEnv() {
  if (typeof window === 'undefined' || !window.location) return false;
  var h = window.location.hostname || '';
  return /bilibili\.com$/i.test(h) || /biliintl\.com$/i.test(h);
}
var sdkPromise = null;
function ensureSdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise(function (resolve) {
    if (typeof window === 'undefined') { resolve(false); return; }
    if (window.toy && typeof window.toy.submitScore === 'function') { resolve(true); return; }
    try {
      var s = document.createElement('script');
      s.src = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
      s.async = true;
      var done = function () { resolve(true); };
      s.onload = done;
      s.onerror = done;
      document.head.appendChild(s);
      setTimeout(done, 8000);   // 兜底：SDK 最迟 8s 视为已尝试，不阻塞主流程
    } catch (e) { resolve(true); }
  });
  return sdkPromise;
}

/* ================= 本地缓存（localStorage） ================= */
function localRead(key) {
  try {
    var r = localStorage.getItem(key);
    if (r) { var d = JSON.parse(r); if (Array.isArray(d)) return d; }
  } catch (e) {}
  return [];
}
function localWrite(key, arr) {
  try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) {}
}
function readLocalInto(key, map) {
  localRead(key).forEach(function (it) { map[it.id] = it; });
}

/* ================= 云存储（B站 k-v） ================= */
function cloudRead(key) {
  if (!cloudReady()) return Promise.resolve(null);
  return window.toy.getCloudStorage([key]).then(function (data) {
    if (!data || !data[key]) return null;
    var d = JSON.parse(data[key]);
    return Array.isArray(d) ? d : null;
  }).catch(function () { return null; });
}
function cloudWrite(key, arr) {
  if (!cloudReady()) return Promise.resolve();
  var kv = {};
  kv[key] = JSON.stringify(arr);
  return window.toy.setCloudStorage(kv).catch(function () {});
}

/* ================= 黑名单 / 收藏 ================= */
var cloudTimer = null;
function persistList(key) {
  var arr = key === K_BLACK ? objToArr(blackMap) : objToArr(favMap);
  localWrite(key, arr);
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(function () { cloudWrite(key, arr); }, 500);
}

function addBlack(item) {
  if (blackMap[item.id]) return;
  blackMap[item.id] = item;
  persistList(K_BLACK);
}
function removeBlack(id) {
  if (!blackMap[id]) return;
  delete blackMap[id];
  persistList(K_BLACK);
}
function clearBlack() {
  blackMap = {};
  persistList(K_BLACK);
}
function toggleFav(item) {
  if (favMap[item.id]) { delete favMap[item.id]; persistList(K_FAV); return false; }
  favMap[item.id] = item;
  persistList(K_FAV);
  return true;
}
function removeFav(id) {
  if (!favMap[id]) return;
  delete favMap[id];
  persistList(K_FAV);
}
function clearFav() {
  favMap = {};
  persistList(K_FAV);
}
function isFav(id) { return !!favMap[id]; }
function getBlackItems() { return objToArr(blackMap); }
function getFavItems() { return objToArr(favMap); }

/* 本地快读（先展示） */
function loadLists() {
  blackMap = {}; favMap = {};
  readLocalInto(K_BLACK, blackMap);
  readLocalInto(K_FAV, favMap);
}
/* 云端覆盖（多端同步，页面加载时拉最新） */
function loadListsFromCloud() {
  if (!cloudReady()) return Promise.resolve();
  return Promise.all([
    cloudRead(K_BLACK).then(function (arr) {
      if (arr) { blackMap = {}; arr.forEach(function (it) { blackMap[it.id] = it; }); localWrite(K_BLACK, arr); }
    }),
    cloudRead(K_FAV).then(function (arr) {
      if (arr) { favMap = {}; arr.forEach(function (it) { favMap[it.id] = it; }); localWrite(K_FAV, arr); }
    })
  ]).then(function () {
    updateFootCounts();
    renderListTabs();
  });
}

/* ================= 排行榜统计（仅 SDK 可用时生效） ================= */
function readBoard(board) {
  return window.toy.getRankList({ board: board, period: 'all', limit: 1 }).then(function (list) {
    var v = (list && list.length && list[0]) ? (Number(list[0].score) || 0) : 0;
    return Math.max(0, Math.floor(v));
  });
}
function bumpBoard(board, delta) {
  return readBoard(board).then(function (cur) {
    var next = cur + delta;
    return window.toy.submitScore({ board: board, score: next })
      .then(function () { return next; })
      .catch(function () { return cur; });
  });
}
function computeStats(single, ten) {
  return { single: single, ten: ten, total: single + ten * 10 };
}
function renderStats(pv, total) {
  var el = $('stats-bar');
  if (!el) return;
  el.hidden = false;
  el.textContent = '📈 访问 ' + pv + ' 次 · 总抽卡 ' + total + ' 次';
}
function refreshStats() {
  if (!sdkReady()) return;
  Promise.all([readBoard(B_PV), readBoard(B_SINGLE), readBoard(B_TEN)]).then(function (arr) {
    var c = computeStats(arr[1], arr[2]);
    renderStats(arr[0], c.total);
  }).catch(function () {});
}
function initStats() {
  if (!sdkReady()) return;
  bumpBoard(B_PV, 1).then(function () { refreshStats(); }).catch(function () { refreshStats(); });
}
function bumpDrawStat(n) {
  if (!sdkReady()) return Promise.resolve();
  return bumpBoard(n > 1 ? B_TEN : B_SINGLE, 1).then(function () { refreshStats(); });
}

/* ================= 抽取池 & 抽卡 ================= */
function buildPool() {
  return DATA.items.filter(function (it) {
    return selCats[it.category] && !blackMap[it.id];
  });
}
/* 加权池：按 count 展开多份（count=1 一份，count=2 两份，概率翻倍） */
function buildWeightedPool() {
  var pool = [];
  DATA.items.forEach(function (it) {
    if (!selCats[it.category] || blackMap[it.id]) return;
    var w = Math.max(1, Math.floor(Number(it.count) || 1));
    for (var i = 0; i < w; i++) pool.push(it);
  });
  return pool;
}
/* 从池（可能含重复 id 的加权池）中抽 n 个不同 id，同一批不重复 */
function gachaDraw(pool, n) {
  var copy = pool.slice();
  for (var i = copy.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = copy[i]; copy[i] = copy[j]; copy[j] = t;
  }
  var out = [];
  var seen = {};
  for (var k = 0; k < copy.length && out.length < n; k++) {
    var it = copy[k];
    if (!seen[it.id]) { seen[it.id] = true; out.push(it); }
  }
  return out;
}

/* ================= 数据拉取（每次进入重新拉，失败才用缓存） ================= */
function fetchJSON(url) {
  return new Promise(function (resolve, reject) {
    var hasAC = typeof AbortController !== 'undefined';
    var ctl = hasAC ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (ctl) ctl.abort();
      reject(new Error('请求超时'));
    }, 15000);
    var opts = ctl ? { signal: ctl.signal } : {};
    fetch(url, opts).then(function (r) {
      if (!r.ok) { clearTimeout(timer); reject(new Error('HTTP ' + r.status)); return; }
      return r.json();
    }).then(function (j) {
      clearTimeout(timer); resolve(j);
    }).catch(function (e) {
      clearTimeout(timer); reject(e);
    });
  });
}
function fetchAll() {
  return fetchJSON(API_URL).then(function (first) {
    var total = Number(first.total) || 0;
    var all = Array.isArray(first.items) ? first.items.slice() : [];
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    var chain = Promise.resolve();
    for (var p = 2; p <= pages; p++) {
      chain = chain.then(function (pn) {
        return fetchJSON(API_URL + '&pn=' + pn).then(function (r) {
          if (Array.isArray(r.items)) all = all.concat(r.items);
        });
      }.bind(null, p));
    }
    return chain.then(function () {
      return { items: all, categories: first.categories || [], total: total };
    });
  });
}
function saveCache(data) {
  try { localStorage.setItem(K_CACHE, JSON.stringify({ items: data.items, categories: data.categories, total: data.total })); } catch (e) {}
}
function loadCache() {
  try {
    var r = localStorage.getItem(K_CACHE);
    if (r) { var d = JSON.parse(r); if (d && Array.isArray(d.items)) return d; }
  } catch (e) {}
  return null;
}
/* 本地数据源（data.js）直接可读，含四种类型，无需网络 */
function getLocalData() {
  if (typeof window !== 'undefined' && window.TOYCARD_DATA &&
      Array.isArray(window.TOYCARD_DATA.items) && window.TOYCARD_DATA.items.length) {
    return window.TOYCARD_DATA;
  }
  return loadCache();
}
function applyData(data) {
  DATA.items = data.items || [];
  DATA.categories = data.categories || [];
  DATA.total = data.total || DATA.items.length;
}
/* 本地 poster 补 images/ 前缀；http/https/根路径/data 保持原样 */
function normalizePoster(p) {
  if (!p) return '';
  if (/^https?:\/\//i.test(p) || /^\//.test(p) || /^data:/i.test(p)) return p;
  return 'images/' + p;
}
/* 合并 myToys.js 的本地游戏进抽卡池（按 id 去重，兼容线上数据；本地类型并入分类） */
function mergeMyToys() {
  if (typeof window === 'undefined' || !window.MY_TOYS || !window.MY_TOYS.length) return;
  var idSet = {};
  DATA.items.forEach(function (it) { idSet[it.id] = true; });
  var cats = DATA.categories.slice();
  window.MY_TOYS.forEach(function (it) {
    if (!it || it.id == null) return;
    if (idSet[it.id]) return;             // 与线上 id 重复，保留线上
    var cat = it.category || '游戏';
    DATA.items.push({
      id: it.id,
      slug: it.slug || '',
      title: it.title || '',
      poster: normalizePoster(it.poster),
      category: cat,
      author: it.author || '',
      pv_text: it.pv_text || '',
      store_tag: it.store_tag || '',
      count: it.count           // 抽取频率：1 正常，2 翻倍，依此类推
    });
    idSet[it.id] = true;
    if (cats.indexOf(cat) < 0) cats.push(cat);
  });
  DATA.total = DATA.items.length;
  DATA.categories = cats;
}
/* 本地预览（localhost/127.0.0.1/file://）直接走 data.js，不发网络请求，避免跨域报错 */
function isLocalPreview() {
  if (typeof window === 'undefined' || !window.location) return false;
  var h = window.location.hostname || '';
  var p = window.location.protocol || '';
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || p === 'file:';
}
/* 第一阶段：本地数据立即渲染（data.js + myToys，其次 localStorage 缓存），保证进去就有游戏 */
function initData() {
  var local = getLocalData();
  if (local) applyData(local);
  mergeMyToys();
  initCats();
  renderChips();
  renderMeta();
}
/* 第二阶段：后台请求网络最新数据，成功后覆盖并重新渲染；失败静默保持本地数据 */
function refreshFromNetwork() {
  return fetchAll().then(function (data) {
    applyData(data);
    saveCache(data);
    mergeMyToys();   // 网络加载后仍并入本地 myToys
    // 保留用户已取消的分类，新出现的分类默认选中
    var prev = selCats;
    var next = {};
    DATA.categories.forEach(function (c) { next[c] = prev[c] !== false; });
    selCats = next;
    renderChips();
    renderMeta();
    console.log('成功获取最新数据：' + data.items.length + ' 条');
    return true;
  }).catch(function () {
    if (!DATA.items.length) {
      $('meta-text').textContent = '加载失败';
      $('empty-hint').textContent = '数据加载失败，请检查网络后刷新重试';
      $('cat-chips').innerHTML = '<span class="chip-loading">暂无分类</span>';
    }
    return false;
  });
}
function initCats() {
  selCats = {};
  DATA.categories.forEach(function (c) { selCats[c] = true; });
}

/* ================= 渲染：分类 / 信息 ================= */
function renderChips() {
  var box = $('cat-chips');
  if (!DATA.categories.length) { box.innerHTML = '<span class="chip-loading">暂无分类</span>'; return; }
  box.innerHTML = DATA.categories.map(function (c) {
    return '<span class="chip' + (selCats[c] ? ' active' : '') + '" data-cat="' + escapeHtml(c) + '">' + escapeHtml(c) + '</span>';
  }).join('');
}
function renderMeta() {
  var pool = buildPool().length;
  $('meta-text').textContent = '共 ' + DATA.total + ' 个游戏 · 可选池 ' + pool + ' 个';
}
function updateFootCounts() {
  var bc = $('black-count');
  bc.textContent = getBlackItems().length;
  var fc = $('fav-count');
  fc.textContent = getFavItems().length;
  fc.className = 'tb-count fav';
}

/* ================= 渲染：抽卡卡片 ================= */
function cardHtml(item, idx) {
  var fav = isFav(item.id) ? ' on' : '';
  var rare = item.store_tag ? ' card-item--rare' : '';
  var tag = item.store_tag ? '<span class="store-tag">' + escapeHtml(item.store_tag) + '</span>' : '';
  var pv = formatPv(item);
  var delay = ((idx % 10) * 0.07).toFixed(2);
  var url = toyUrl(item);
  return '' +
    '<div class="card-item' + rare + '" data-id="' + item.id + '" style="--d:' + delay + 's">' +
      '<button class="badge badge-x" data-act="black" aria-label="拉黑">✕</button>' +
      '<button class="badge badge-star' + fav + '" data-act="fav" aria-label="收藏">★</button>' +
      '<a class="card-link" href="' + url + '" data-jump="' + escapeHtml(item.slug) + '" target="_blank" rel="noopener">' +
        '<div class="poster-wrap">' +
          '<span class="poster-emoji" aria-hidden="true">🎮</span>' +
          tag +
          '<img class="poster" src="' + escapeHtml(item.poster) + '" alt="' + escapeHtml(item.title) + '" loading="lazy" onerror="this.style.display=\'none\';">' +
        '</div>' +
        '<div class="info">' +
          '<div class="name">' + escapeHtml(item.title) + '</div>' +
          '<div class="meta">' +
            '<span class="m-type">' + escapeHtml(item.category) + '</span>' +
            '<span class="m-author">👤 ' + escapeHtml(item.author) + '</span>' +
            '<span class="m-pv">▶ ' + escapeHtml(pv) + ' 次游玩</span>' +
          '</div>' +
        '</div>' +
      '</a>' +
    '</div>';
}

function setResult(drawn) {
  var box = $('result');
  var hint = $('empty-hint');
  if (!drawn.length) {
    box.innerHTML = '';
    box.className = 'result';
    hint.style.display = '';
    return;
  }
  hint.style.display = 'none';
  box.className = 'result ' + (drawn.length === 1 ? 'result--single' : 'result--grid');
  box.innerHTML = drawn.map(function (it, i) { return cardHtml(it, i); }).join('');
}

function doDraw(n) {
  if (drawing) return;
  if (!DATA.items.length) { toast('数据尚未加载完成，请稍候'); return; }
  var pool = buildWeightedPool();
  if (!pool.length) {
    currentResult = [];
    setResult([]);
    $('empty-hint').textContent = '当前分类没有可抽的游戏（或已被全部拉黑），请调整分类';
    toast('抽取池为空');
    return;
  }
  drawing = true;
  disableDrawBtns(true);
  playSpark(n, function () {
    var drawn = gachaDraw(pool, n);
    currentResult = drawn;
    setResult(drawn);
    if (drawn.length < n) toast('池中仅剩 ' + drawn.length + ' 个，已全部抽出');
    drawing = false;
    disableDrawBtns(false);
    bumpDrawStat(n);   // SDK 可用时累计抽卡次数
  });
}
function disableDrawBtns(d) {
  $('btn-single').disabled = d;
  $('btn-ten').disabled = d;
}

/* ================= 抽卡特效 ================= */
function playSpark(n, done) {
  var ov = $('spark-overlay');
  var ring = ov.querySelector('.spark-ring');
  ring.classList.toggle('spark-ring--ten', n > 1);
  $('spark-text').textContent = n > 1 ? '十连召唤中…' : '召唤中…';
  ov.hidden = false;
  spawnParticles(n * 5);
  setTimeout(function () {
    ov.hidden = true;
    done();
  }, n > 1 ? 700 : 520);
}
function spawnParticles(count) {
  for (var i = 0; i < count; i++) {
    var p = document.createElement('span');
    p.className = 'particle';
    p.style.left = (6 + Math.random() * 88) + 'vw';
    p.style.top = (30 + Math.random() * 42) + 'vh';
    p.style.width = p.style.height = (5 + Math.random() * 7) + 'px';
    p.style.animationDuration = (0.7 + Math.random() * 0.5).toFixed(2) + 's';
    p.style.animationDelay = (Math.random() * 0.15).toFixed(2) + 's';
    document.body.appendChild(p);
    setTimeout(function (el) { if (el && el.parentNode) el.parentNode.removeChild(el); }, 1600, p);
  }
}

/* ================= 渲染：黑名单 / 收藏列表 tab ================= */
/* mode: 'black' 图片/名字都不跳转；'fav' 图片与游戏名都可跳转 */
function listItemHtml(item, fav) {
  var pv = formatPv(item);
  var poster = '<span class="list-poster"><span class="pe" aria-hidden="true">🎮</span>' +
    '<img class="list-img" src="' + escapeHtml(item.poster) + '" alt="" loading="lazy" onerror="this.style.display=\'none\';">' +
    '</span>';
  if (fav) {
    poster = '<a class="list-link" href="' + toyUrl(item) + '" data-jump="' + escapeHtml(item.slug) + '" target="_blank" rel="noopener">' + poster + '</a>';
  }
  var name = '<div class="list-name">' + escapeHtml(item.title) + '</div>';
  if (fav) {
    name = '<a class="list-name-link" href="' + toyUrl(item) + '" data-jump="' + escapeHtml(item.slug) + '" target="_blank" rel="noopener">' + escapeHtml(item.title) + '</a>';
  }
  return '' +
    '<div class="list-item" data-id="' + item.id + '">' +
      poster +
      '<div class="list-info">' + name +
        '<div class="list-meta">' + escapeHtml(item.category) + ' · ' + escapeHtml(item.author) + ' · ▶ ' + escapeHtml(pv) + '</div>' +
      '</div>' +
      '<button class="list-remove" data-remove>移除</button>' +
    '</div>';
}
function renderBlackTab() {
  var items = getBlackItems();
  $('black-tip').textContent = '已拉黑 ' + items.length + ' 个，之后抽卡不会抽到';
  $('btn-clear-black').hidden = !items.length;
  var body = $('black-body');
  body.innerHTML = items.length
    ? items.map(function (it) { return listItemHtml(it, false); }).join('')
    : '<div class="list-empty">暂无黑名单</div>';
}
function renderFavTab() {
  var items = getFavItems();
  $('fav-tip').textContent = '已收藏 ' + items.length + ' 个';
  $('btn-clear-fav').hidden = !items.length;
  var body = $('fav-body');
  body.innerHTML = items.length
    ? items.map(function (it) { return listItemHtml(it, true); }).join('')
    : '<div class="list-empty">暂无收藏</div>';
}
function renderListTabs() {
  if (currentTab === 'black') renderBlackTab();
  if (currentTab === 'fav') renderFavTab();
}

/* ================= Tab 切换 ================= */
function switchTab(tab) {
  currentTab = tab;
  ['gacha', 'black', 'fav'].forEach(function (t) {
    var el = $('tab-' + t);
    if (el) el.hidden = (t !== tab);
  });
  document.querySelectorAll('.tab-btn').forEach(function (b) {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  renderListTabs();
}

/* ================= 跳转（仅 B站 环境用 SDK navigate，其余走默认链接） ================= */
function openToyLink(slug, url) {
  if (inBiliEnv() && cloudReady() && window.toy.navigate) {
    window.toy.navigate({ type: 'toy', id: slug }).catch(function () {
      window.open(url, '_blank');
    });
  } else {
    window.open(url, '_blank');
  }
}

/* ================= Toast / 确认弹层 ================= */
var toastTimer = null;
function toast(msg) {
  var el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.hidden = true; }, 1800);
}
var confirmCb = null;
function showConfirm(text, onOk) {
  confirmCb = onOk;
  $('confirm-text').textContent = text;
  $('confirm-mask').hidden = false;
}
function closeConfirm() {
  $('confirm-mask').hidden = true;
  confirmCb = null;
}

/* ================= 事件绑定 ================= */
function bindEvents() {
  // 分类 chips（事件委托）
  $('cat-chips').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    var cat = chip.dataset.cat;
    selCats[cat] = !selCats[cat];
    chip.classList.toggle('active', selCats[cat]);
    renderMeta();
  });
  $('btn-select-all').addEventListener('click', function () {
    Object.keys(selCats).forEach(function (c) { selCats[c] = true; });
    renderChips(); renderMeta();
  });
  $('btn-clear-all').addEventListener('click', function () {
    Object.keys(selCats).forEach(function (c) { selCats[c] = false; });
    renderChips(); renderMeta();
  });

  // 抽卡
  $('btn-single').addEventListener('click', function () { doDraw(1); });
  $('btn-ten').addEventListener('click', function () { doDraw(10); });

  // 结果区（拉黑 / 收藏）
  $('result').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    e.preventDefault();
    var card = btn.closest('.card-item');
    var id = Number(card.dataset.id);
    var item = findItem(id);
    if (!item) return;
    if (btn.dataset.act === 'black') {
      addBlack(item);
      card.classList.add('removing');
      setTimeout(function () {
        currentResult = currentResult.filter(function (x) { return x.id !== id; });
        card.remove();
      }, 200);
      updateFootCounts();
      toast('已加入黑名单 ⛔');
    } else if (btn.dataset.act === 'fav') {
      var on = toggleFav(item);
      btn.classList.toggle('on', on);
      updateFootCounts();
      toast(on ? '已收藏 ⭐' : '已取消收藏');
    }
  });

  // 底部 tab
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
  });

  // 黑名单 / 收藏列表（移除）
  function bindListRemove(bodyId, removeFn, renderFn) {
    $(bodyId).addEventListener('click', function (e) {
      var btn = e.target.closest('[data-remove]');
      if (!btn) return;
      var item = btn.closest('.list-item');
      var id = Number(item.dataset.id);
      removeFn(id);
      renderFn();
      updateFootCounts();
      toast(removeFn === removeBlack ? '已移出黑名单' : '已移除收藏');
    });
  }
  bindListRemove('black-body', removeBlack, renderBlackTab);
  bindListRemove('fav-body', removeFav, renderFavTab);

  // 清空
  $('btn-clear-black').addEventListener('click', function () {
    showConfirm('确定清空全部黑名单吗？', function () {
      clearBlack();
      renderBlackTab();
      updateFootCounts();
      toast('已清空黑名单');
    });
  });
  $('btn-clear-fav').addEventListener('click', function () {
    showConfirm('确定清空全部收藏吗？', function () {
      clearFav();
      renderFavTab();
      updateFootCounts();
      toast('已清空收藏');
    });
  });

  // 打开新页面：仅 B站 域名环境拦截用 SDK navigate；本地/外部走浏览器默认链接，避免异常 URL
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[data-jump]');
    if (!link) return;
    if (!(inBiliEnv() && cloudReady() && window.toy.navigate)) return;
    e.preventDefault();
    openToyLink(link.dataset.jump, link.href);
  });

  // 确认弹层
  $('confirm-cancel').addEventListener('click', closeConfirm);
  $('confirm-ok').addEventListener('click', function () {
    var cb = confirmCb;
    closeConfirm();
    if (cb) cb();
  });
  $('confirm-mask').addEventListener('click', function (e) {
    if (e.target === $('confirm-mask')) closeConfirm();
  });
}

/* ================= 初始化 ================= */
function init() {
  loadLists();                 // 本地缓存快读，先展示
  bindEvents();
  switchTab('gacha');          // 默认进入抽卡 tab
  updateFootCounts();

  // 第一阶段：本地数据立即渲染，确保进去就有游戏
  initData();
  // 第二阶段：后台拉接口更新最新数据（本地走代理、真机走线上），失败静默保持本地
  refreshFromNetwork();

  // SDK 异步加载完成后：云端黑名单/收藏同步 + 排行榜统计（访问次数 +1）
  ensureSdk().then(function () {
    loadListsFromCloud();
    initStats();
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}

/* ================= 导出（供 Node 冒烟测试） ================= */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DATA: DATA, selCats: selCats,
    buildPool: buildPool, gachaDraw: gachaDraw,
    addBlack: addBlack, removeBlack: removeBlack, clearBlack: clearBlack,
    toggleFav: toggleFav, removeFav: removeFav, clearFav: clearFav, isFav: isFav,
    getBlackItems: getBlackItems, getFavItems: getFavItems,
    loadLists: loadLists, loadListsFromCloud: loadListsFromCloud,
    localRead: localRead, localWrite: localWrite, cloudReady: cloudReady,
    escapeHtml: escapeHtml, formatPv: formatPv, fetchAll: fetchAll, cardHtml: cardHtml,
    getLocalData: getLocalData, mergeMyToys: mergeMyToys, normalizePoster: normalizePoster,
    sdkReady: sdkReady, ensureSdk: ensureSdk, computeStats: computeStats,
    readBoard: readBoard, bumpBoard: bumpBoard,
    buildWeightedPool: buildWeightedPool, listItemHtml: listItemHtml, inBiliEnv: inBiliEnv, isLocalPreview: isLocalPreview
  };
}
