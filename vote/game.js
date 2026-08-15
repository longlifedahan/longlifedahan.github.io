/* ================= 配置 ================= */
var AUTHOR_UID = '13450091';      // 关注的UP主
var BOARD_BLUE = 1;               // 榜单1：鸣潮票数（累计计数）
var BOARD_RED = 2;                // 榜单2：原神票数（累计计数）
var BOARD_USED = 3;               // 榜单3：本人已投次数（服务端防刷锚点）
var MAX_SCORE = 16777215;         // submitScore 允许的最大值
var SHARE_URL = 'https://www.bilibili.com/toy/vote/index.html';
var REFRESH_MS = 10000;           // 票数自动刷新间隔

/* 云存储 key（登录用户 + Toy 隔离，服务端为准） */
var K_F1 = 'V_f1';                // 首次进入票已领取
var K_F2 = 'V_f2';                // 关注票已领取
var K_F3 = 'V_f3';                // 分享票已领取
var K_USED = 'V_used';            // 已投次数镜像

/* ================= 状态 ================= */
var S = {
  sdk: false,
  loggedIn: false,
  counts: { blue: 0, red: 0 },
  f1: false, f2: false, f3: false,
  used: 0,
  following: false,
  isAuthor: false,
  pick: null,
  voting: false
};

function $(id) { return document.getElementById(id); }

/* ================= SDK ================= */
function sdkReady() {
  return typeof window !== 'undefined' && window.toy &&
    typeof window.toy.submitScore === 'function' &&
    typeof window.toy.getRankList === 'function' &&
    typeof window.toy.getCloudStorage === 'function' &&
    typeof window.toy.setCloudStorage === 'function' &&
    typeof window.toy.getMyRank === 'function' &&
    typeof window.toy.getAuthorRelation === 'function';
}
function injectSDK(onload) {
  try {
    var s = document.createElement('script');
    s.src = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
    s.async = true;
    s.onload = onload;
    s.onerror = onload;
    document.head.appendChild(s);
  } catch (e) { if (onload) onload(); }
}

/* ================= 票数（排行榜累计计数） ================= */
function readTotal(board) {
  return window.toy.getRankList({ board: board, period: 'all', limit: 1 }).then(function (list) {
    var v = (list && list.length && list[0]) ? (Number(list[0].score) || 0) : 0;
    return Math.max(0, Math.floor(v));
  });
}
function refreshCounts() {
  if (!sdkReady()) { renderCounts(); return; }
  readTotal(BOARD_BLUE).then(function (n) { S.counts.blue = n; renderCounts(); }).catch(function () {});
  readTotal(BOARD_RED).then(function (n) { S.counts.red = n; renderCounts(); }).catch(function () {});
}

/* ================= 资格 / 剩余票数 ================= */
function granted() { return (S.f1 ? 1 : 0) + (S.f2 ? 1 : 0) + (S.f3 ? 1 : 0); }
function isUnlimited() { return S.isAuthor; }
function remaining() {
  if (isUnlimited()) return 999;
  var r = Math.min(3, granted()) - S.used;
  return r < 0 ? 0 : r;
}

function persistKV() {
  if (!S.loggedIn) return;
  var kv = {};
  kv[K_F1] = S.f1 ? '1' : '0';
  kv[K_F2] = S.f2 ? '1' : '0';
  kv[K_F3] = S.f3 ? '1' : '0';
  kv[K_USED] = String(S.used);
  window.toy.setCloudStorage(kv).catch(function () {});
}

/* 读取本人资格：关注关系 + K-V 标志 + 榜单3已投次数 */
function loadState() {
  return new Promise(function (resolve) {
    if (!sdkReady()) { resolve(); return; }
    var left = 3;
    function done() { if (--left === 0) resolve(); }
    window.toy.getAuthorRelation().then(function (res) {
      if (res && res.status === 'ok' && res.data) {
        S.following = !!res.data.isFollowing;
        S.isAuthor = !!res.data.isAuthor;
      }
      done();
    }).catch(function () { done(); });
    window.toy.getCloudStorage([K_F1, K_F2, K_F3, K_USED]).then(function (data) {
      S.loggedIn = true;
      S.f1 = !!(data && data[K_F1] === '1');
      S.f2 = !!(data && data[K_F2] === '1');
      S.f3 = !!(data && data[K_F3] === '1');
      var u = data && data[K_USED] ? Number(data[K_USED]) : 0;
      S.used = isFinite(u) && u > 0 ? Math.floor(u) : 0;
      done();
    }).catch(function () { S.loggedIn = false; done(); });
    window.toy.getMyRank({ board: BOARD_USED, period: 'all' }).then(function (me) {
      if (me && me.ranked) {
        var v = Number(me.score) || 0;
        if (v > S.used) S.used = v;
      }
      done();
    }).catch(function () { done(); });
  });
}

/* 关注关系复查：只更新关注/作者状态，不自动发票（领取制） */
function recheckFollow() {
  return new Promise(function (resolve) {
    if (!sdkReady() || !window.toy.getAuthorRelation) { resolve(); return; }
    window.toy.getAuthorRelation().then(function (res) {
      if (res && res.status === 'ok' && res.data) {
        S.following = !!res.data.isFollowing;
        S.isAuthor = !!res.data.isAuthor;
      }
      render();
      resolve();
    }).catch(function () { resolve(); });
  });
}

/* ================= 动作 ================= */
function grantFollow() {
  recheckFollow().then(function () {
    if (S.f2) { toast('关注票已领取'); return; }
    if (S.following) { S.f2 = true; persistKV(); render(); toast('关注成功，获得 1 票'); }
    else toast('尚未检测到关注，请先关注UP主');
  });
}
function guideToFollow() {
  $('follow-modal').hidden = false;
  jumpToSpace();
}
/* 跳转UP主页：优先 SDK navigate；失败时端内用 location.href（App 内会站内打开），端外用 window.open */
function jumpToSpace() {
  function fallback() {
    var url = 'https://space.bilibili.com/' + AUTHOR_UID;
    var inApp = sdkReady() || (window.toy && typeof window.toy === 'object');
    try {
      if (!inApp && window.open) {
        var win = window.open(url, '_blank');
        if (win) return;
      }
      window.location.href = url;
    } catch (e) {
      try { window.location.href = url; } catch (e2) {}
    }
  }
  if (sdkReady() && window.toy.navigate) {
    window.toy.navigate({ type: 'space', id: AUTHOR_UID }).catch(fallback);
  } else {
    fallback();
  }
}
function onGrantFollow() {
  if (S.f2) return;
  if (!S.loggedIn) { toast('请先登录'); return; }
  if (S.following) grantFollow();
  else guideToFollow();
}

function openShare() {
  $('share-url').value = SHARE_URL;
  $('share-preview').hidden = true;
  $('copy-tip').textContent = '';
  $('share-modal').hidden = false;
  copyLink();
}
function onShareFile(file) {
  var reader = new FileReader();
  reader.onload = function (e) {
    $('share-img').src = e.target.result;
    $('share-preview').hidden = false;
    if (S.loggedIn && !S.f3) { S.f3 = true; persistKV(); render(); }
    setTimeout(function () {
      $('share-modal').hidden = true;
      toast('分享成功，已获得 1 票');
    }, 700);
  };
  reader.readAsDataURL(file);
}
function copyLink() {
  var url = SHARE_URL;
  function ok() {
    $('copy-tip').textContent = '已复制到剪贴板';
    setTimeout(function () { $('copy-tip').textContent = ''; }, 2000);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(ok, function () { fallbackCopy(url); ok(); });
  } else { fallbackCopy(url); ok(); }
}
function fallbackCopy(text) {
  try {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch (e) {}
}

/* 投票：读取该方当前总数 +1 写入自己的分数 */
function castVote() {
  if (S.voting) return;
  if (!S.pick) { toast('请先选择你支持的一方'); return; }
  if (!S.loggedIn) { toast('请先登录后再投票'); return; }
  if (!isUnlimited() && remaining() <= 0) { toast('暂无可用票数，先获取投票资格吧'); return; }
  S.voting = true;
  $('btn-vote').textContent = '投票中…';
  var side = S.pick;
  var board = side === 'blue' ? BOARD_BLUE : BOARD_RED;
  readTotal(board).then(function (cur) {
    if (cur >= MAX_SCORE) { S.voting = false; renderVote(); toast('该方票数已达上限'); return; }
    var next = cur + 1;
    window.toy.submitScore({ board: board, score: next }).then(function () {
      S.counts[side] = next;
      renderCounts();
      if (!S.isAuthor) {
        S.used += 1;
        persistKV();
        window.toy.submitScore({ board: BOARD_USED, score: S.used }).catch(function () {});
      }
      S.voting = false;
      renderVote();
      toast(side === 'blue' ? '已为 鸣潮 投出 1 票' : '已为 原神 投出 1 票');
      refreshCounts();
    }).catch(function () {
      S.voting = false; renderVote(); toast('投票失败，请稍后再试');
    });
  }).catch(function () {
    S.voting = false; renderVote(); toast('投票失败，请稍后再试');
  });
}

/* ================= 渲染 ================= */
function render() { renderCounts(); renderGrants(); renderVote(); }

function renderCounts() {
  var blue = S.counts.blue, red = S.counts.red, tot = blue + red;
  $('blue-count').textContent = blue + ' 票';
  $('red-count').textContent = red + ' 票';
  var bp = tot ? (blue / tot * 100) : 0;
  var rp = tot ? (red / tot * 100) : 0;
  $('bar-blue').style.width = bp + '%';
  $('bar-red').style.width = rp + '%';
  $('blue-pct').textContent = bp.toFixed(1) + '%';
  $('red-pct').textContent = rp.toFixed(1) + '%';
}

function renderGrants() {
  var g1 = $('g1-status');
  if (S.f1) { g1.textContent = '已获得'; g1.className = 'grant-badge done'; }
  else { g1.textContent = '领取'; g1.className = 'grant-badge wait'; }

  var fBtn = $('btn-follow'), g2 = $('g2-status');
  if (S.f2) { fBtn.hidden = true; g2.hidden = false; g2.textContent = '已获得'; g2.className = 'grant-badge done'; }
  else {
    g2.hidden = true;
    fBtn.hidden = false;
    fBtn.textContent = S.following ? '领取' : '去关注';
  }

  var sBtn = $('btn-share'), g3 = $('g3-status');
  if (S.f3) { sBtn.hidden = true; g3.hidden = false; g3.textContent = '已获得'; g3.className = 'grant-badge done'; }
  else { g3.hidden = true; sBtn.hidden = false; sBtn.textContent = '去分享'; }
}

function renderVote() {
  $('pick-blue').classList.toggle('sel', S.pick === 'blue');
  $('pick-red').classList.toggle('sel', S.pick === 'red');
  var red = S.pick === 'red';
  $('btn-vote').classList.toggle('red-mode', red);
  var can = S.loggedIn && S.pick && (isUnlimited() || remaining() > 0);
  $('btn-vote').classList.toggle('locked', !can);
  $('btn-vote').textContent = S.pick ? (red ? '为 原神 投票' : '为 鸣潮 投票') : '投 票';
  var bal = $('bal-text');
  if (!S.sdk) bal.innerHTML = '请在 B站 App 内打开投票';
  else if (!S.loggedIn) bal.innerHTML = '请先登录后投票';
  else if (isUnlimited()) bal.innerHTML = '剩余票数：<b>999+</b> 票';
  else bal.innerHTML = '剩余票数：<b>' + remaining() + '</b> 票';
}

/* ================= 投票列表（TOP100） ================= */
var rankBoard = BOARD_BLUE;
function openRank() {
  $('rank-modal').hidden = false;
  try { switchRankTab(rankBoard); } catch (e) {}
}
function switchRankTab(b) {
  rankBoard = b;
  try {
    var tabs = document.querySelectorAll('#rank-tabs .rtab');
    for (var i = 0; i < tabs.length; i++) {
      var on = Number(tabs[i].getAttribute('data-b')) === b;
      if (on) tabs[i].classList.add('active'); else tabs[i].classList.remove('active');
    }
  } catch (e) {}
  loadRank();
}
function loadRank() {
  if (!sdkReady()) {
    $('rank-note').textContent = '';
    $('rank-body').innerHTML = '<div class="lb-tip">请在 B站 App 内打开查看投票列表</div>';
    return;
  }
  $('rank-note').textContent = '为「' + (rankBoard === BOARD_BLUE ? '鸣潮' : '原神') + '」投票的用户 TOP100';
  $('rank-body').innerHTML = '<div class="lb-tip">加载中…</div>';
  window.toy.getRankList({ board: rankBoard, period: 'all', limit: 100 }).then(function (list) {
    renderRank(list);
  }).catch(function () {
    $('rank-body').innerHTML = '<div class="lb-tip">加载失败</div>';
  });
}
function renderRank(list) {
  if (!list || !list.length) { $('rank-body').innerHTML = '<div class="lb-tip">暂无用户投票</div>'; return; }
  var html = '';
  for (var i = 0; i < list.length; i++) {
    var it = list[i];
    html += '<div class="lb-row">' +
      '<span class="lb-rank' + (it.rank <= 3 ? ' top' : '') + '">' + it.rank + '</span>' +
      '<img class="lb-avatar" src="' + esc(it.avatar) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
      '<span class="lb-name">' + esc(it.nickname) + '</span>' +
      '</div>';
  }
  $('rank-body').innerHTML = html;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* ================= Toast ================= */
var toastTimer = null;
function toast(msg) {
  var t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
}

/* ================= 事件 ================= */
function bindEvents() {
  $('pick-blue').addEventListener('click', function () { S.pick = 'blue'; renderVote(); });
  $('pick-red').addEventListener('click', function () { S.pick = 'red'; renderVote(); });
  $('btn-vote').addEventListener('click', castVote);

  $('grant-1').addEventListener('click', function () {
    if (S.f1) return;
    if (!S.loggedIn) { toast('请先登录'); return; }
    S.f1 = true;
    persistKV();
    render();
    toast('已领取首访票 1 票');
  });
  $('grant-2').addEventListener('click', onGrantFollow);
  $('grant-3').addEventListener('click', function () { if (!S.f3) openShare(); });

  $('btn-rank').addEventListener('click', openRank);
  $('btn-close-rank').addEventListener('click', function () { $('rank-modal').hidden = true; });
  $('rank-modal').addEventListener('click', function (ev) { if (ev.target === this) this.hidden = true; });
  var rts = document.querySelectorAll('#rank-tabs .rtab');
  for (var i = 0; i < rts.length; i++) {
    rts[i].addEventListener('click', function () { switchRankTab(Number(this.getAttribute('data-b'))); });
  }

  $('btn-close-share').addEventListener('click', function () { $('share-modal').hidden = true; });
  $('share-modal').addEventListener('click', function (ev) { if (ev.target === this) this.hidden = true; });
  $('btn-copy').addEventListener('click', copyLink);
  $('file-input').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (f) onShareFile(f);
    this.value = '';
  });

  $('btn-follow-cancel').addEventListener('click', function () { $('follow-modal').hidden = true; });
  $('btn-follow-open').addEventListener('click', jumpToSpace);
  $('btn-follow-ok').addEventListener('click', function () { $('follow-modal').hidden = true; grantFollow(); });
  $('follow-modal').addEventListener('click', function (ev) { if (ev.target === this) this.hidden = true; });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { refreshCounts(); recheckFollow(); }
  });
  window.addEventListener('focus', function () { refreshCounts(); recheckFollow(); });
  setInterval(refreshCounts, REFRESH_MS);
}

/* ================= 初始化 ================= */
function afterSDK() {
  S.sdk = true;
  loadState().then(function () {
    render();
    refreshCounts();
  });
}
function init() {
  bindEvents();
  render();
  refreshCounts();
  if (sdkReady()) afterSDK();
  else injectSDK(afterSDK);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}
