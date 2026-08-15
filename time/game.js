/* 手速测试 游戏逻辑 + UI（首页 / 计时 / 结算 / 本地与 B站 榜单） */
(function () {
  'use strict';

  var MODE_CD = 1;            // 倒计时：X → 0，点到 0s
  var MODE_CU = 2;            // 正计时：0 → X，点到 Xs
  var X_MIN = 3, X_MAX = 10;
  var KEY_SETTINGS = 'timetest.settings';
  var KEY_LB = 'timetest.lb';
  var BOARD_CD = 1;           // B站 榜位 1：倒计时
  var BOARD_CU = 2;           // B站 榜位 2：正计时
  var SCORE_BASE = 20000;     // 全局榜分数 = 基数 - 误差ms（误差越小分越高）
  var LOCAL_TOP = 50;         // 本地每玩法保留 top50
  var GLOBAL_TOP = 100;       // B站 全局榜展示 top100

  // 段位表：误差（秒）越小段位越高
  var RANKS = [
    { min: 1.0,  name: '黑铁', color: '#9aa4b0' },
    { min: 0.5,  name: '青铜', color: '#cd7f32' },
    { min: 0.4,  name: '白银', color: '#d7dde5' },
    { min: 0.3,  name: '黄金', color: '#f6c94a' },
    { min: 0.2,  name: '白金', color: '#7fe0d0' },
    { min: 0.1,  name: '钻石', color: '#00c8ff' },
    { min: 0.03, name: '大师', color: '#b06bff' },
    { min: 0.01, name: '宗师', color: '#ff4d6d' },
    { min: 0,    name: '王者', color: '#ff3b30' }
  ];
  function rankOf(errSec) {
    for (var i = 0; i < RANKS.length; i++) {
      if (errSec >= RANKS[i].min) return RANKS[i];
    }
    return RANKS[RANKS.length - 1];
  }

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtErr(errMs) { return (errMs / 1000).toFixed(3) + 's'; }
  function modeName(m) { return m === MODE_CU ? '正计时' : '倒计时'; }
  function targetText(m, x) { return m === MODE_CU ? '目标 ' + x.toFixed(3) + 's' : '目标 0.000s'; }

  // ---------- 设置持久化 ----------
  function loadSettings() {
    var def = { mode: MODE_CD, x: 5 };
    try {
      var raw = localStorage.getItem(KEY_SETTINGS);
      if (raw) {
        var s = JSON.parse(raw);
        var m = (+s.mode === MODE_CU) ? MODE_CU : MODE_CD;
        var x = parseInt(s.x, 10);
        if (isNaN(x)) x = def.x;
        return { mode: m, x: clamp(x, X_MIN, X_MAX) };
      }
    } catch (e) { /* 忽略 */ }
    return def;
  }
  function saveSettings() {
    try { localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings)); } catch (e) { /* 忽略 */ }
  }
  var settings = loadSettings();

  // ---------- 计时状态 ----------
  var phase = 'ready';          // ready | run | result
  var startTime = 0;            // performance.now() 起点
  var rafId = null;
  var lastErrMs = 0;
  var lastElapsedMs = 0;

  var RING_C = 2 * Math.PI * 92;  // 进度环周长

  // ---------- 计时 ----------
  function startRun() {
    phase = 'run';
    startTime = performance.now();
    $('btn-start-run').hidden = true;
    $('live-time').hidden = false;
    $('live-unit').hidden = false;
    $('result-panel').hidden = true;
    $('live-hint').textContent = '点击屏幕锁定时间';
    setRing(0);
    tick();
  }
  function tick() {
    if (phase !== 'run') return;
    updateLive();
    rafId = requestAnimationFrame(tick);
  }
  function updateLive() {
    var elapsed = performance.now() - startTime;
    var sec = settings.mode === MODE_CD
      ? settings.x - elapsed / 1000      // 剩余时间，可为负
      : elapsed / 1000;                  // 已过时间
    $('live-time').textContent = sec.toFixed(3);
    // 接近目标时红色高亮
    var errNow = Math.abs(sec - (settings.mode === MODE_CD ? 0 : settings.x));
    $('stage').classList.toggle('hot', errNow < 0.1);
    setRing(clamp(elapsed / (settings.x * 1000), 0, 1));
  }
  function setRing(frac) {
    $('ring-fg').style.strokeDasharray = RING_C;
    $('ring-fg').style.strokeDashoffset = RING_C * (1 - frac);
  }

  function lock() {
    if (phase !== 'run') return;
    phase = 'result';
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    var elapsedMs = performance.now() - startTime;
    lastElapsedMs = elapsedMs;
    lastErrMs = Math.abs(elapsedMs - settings.x * 1000);
    $('stage').classList.remove('hot');
    addLocalResult(settings.mode, lastErrMs, settings.x);
    submitGlobal(settings.mode, lastErrMs);   // 后台静默上报，不阻塞
    renderResult();
  }

  function renderResult() {
    $('live-time').hidden = true;
    $('live-unit').hidden = true;
    $('live-hint').textContent = '';
    var r = rankOf(lastErrMs / 1000);
    var rankEl = $('rank-name');
    rankEl.textContent = r.name;
    rankEl.style.color = r.color;
    $('rank-err').textContent = '误差 ' + fmtErr(lastErrMs);
    var tapText;
    if (settings.mode === MODE_CD) {
      tapText = '点击时刻 剩余 ' + ((settings.x * 1000 - lastElapsedMs) / 1000).toFixed(3) + 's';
    } else {
      tapText = '点击时刻 ' + (lastElapsedMs / 1000).toFixed(3) + 's';
    }
    $('rank-sub').textContent = modeName(settings.mode) + ' · ' + targetText(settings.mode, settings.x) + ' · ' + tapText;
    $('result-panel').hidden = false;
  }

  function resetStage() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    phase = 'ready';
    $('stage').classList.remove('hot');
    $('btn-start-run').hidden = false;
    $('live-time').hidden = true;
    $('live-unit').hidden = true;
    $('result-panel').hidden = true;
    $('live-hint').textContent = '';
    setRing(0);
  }

  function enterTiming() {
    $('timing-title').textContent = modeName(settings.mode) + ' · ' + targetText(settings.mode, settings.x);
    resetStage();
    showView('view-timing');
  }

  // ---------- 本地战绩 ----------
  function loadLB() {
    try {
      var raw = localStorage.getItem(KEY_LB);
      if (raw) {
        var lb = JSON.parse(raw);
        if (lb && lb.m1 && lb.m2) return lb;
      }
    } catch (e) { /* 忽略 */ }
    return { m1: [], m2: [] };
  }
  function saveLB(lb) {
    try { localStorage.setItem(KEY_LB, JSON.stringify(lb)); } catch (e) { /* 忽略 */ }
  }
  function addLocalResult(mode, errMs, x) {
    var lb = loadLB();
    var key = mode === MODE_CD ? 'm1' : 'm2';
    var arr = lb[key] || [];
    arr.push({ err: errMs, x: x, ts: Date.now() });
    arr.sort(function (a, b) { return a.err - b.err; });
    if (arr.length > LOCAL_TOP) arr.length = LOCAL_TOP;
    lb[key] = arr;
    saveLB(lb);
    renderBest();
  }

  // ---------- Toy SDK（异步非阻塞加载） ----------
  var toyReady = false;
  function loadSDK() {
    try {
      if (typeof window !== 'undefined' && window.toy && typeof window.toy.getRankList === 'function') {
        toyReady = true;
        return;
      }
      var s = document.createElement('script');
      s.src = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
      s.async = true;
      s.onload = function () {
        if (typeof window.toy !== 'undefined' && window.toy) toyReady = true;
      };
      document.head.appendChild(s);
    } catch (e) { /* 非浏览器环境忽略 */ }
  }
  function boardOf(mode) { return mode === MODE_CD ? BOARD_CD : BOARD_CU; }
  function submitGlobal(mode, errMs) {
    if (!toyReady) return;
    var score = Math.round(SCORE_BASE - errMs);
    score = clamp(score, -16777216, 16777215);
    try {
      window.toy.submitScore({ board: boardOf(mode), score: score }).catch(function () { /* 忽略 */ });
    } catch (e) { /* 忽略 */ }
  }
  function loadGlobalList(mode, cb) {
    try {
      Promise.all([
        window.toy.getRankList({ board: boardOf(mode), period: 'all', limit: GLOBAL_TOP }).catch(function () { return null; }),
        window.toy.getMyRank({ board: boardOf(mode), period: 'all' }).catch(function () { return null; })
      ]).then(function (res) { cb(res[0], res[1]); });
    } catch (e) { cb(null, null); }
  }
  function fmtGlobalErr(score) {
    var errMs = SCORE_BASE - score;
    if (errMs < 0 || errMs >= SCORE_BASE) return '-';
    return fmtErr(errMs);
  }

  // ---------- 首页 ----------
  function showView(id) {
    var views = document.querySelectorAll('.view');
    for (var i = 0; i < views.length; i++) {
      views[i].classList.toggle('active', views[i].id === id);
    }
  }
  function renderHome() {
    var segs = $('mode-seg').querySelectorAll('.seg');
    for (var i = 0; i < segs.length; i++) {
      segs[i].classList.toggle('active', +segs[i].getAttribute('data-mode') === settings.mode);
    }
    $('x-range').value = settings.x;
    $('x-val').textContent = settings.x + ' 秒';
    renderBest();
  }
  function renderBest() {
    var lb = loadLB();
    renderBestRow('best-m1', MODE_CD, lb.m1);
    renderBestRow('best-m2', MODE_CU, lb.m2);
  }
  function renderBestRow(id, mode, arr) {
    var el = $(id);
    var best = arr && arr.length ? arr[0] : null;
    if (!best) {
      el.innerHTML = '<span class="best-mode">' + modeName(mode) + '</span><span class="best-empty">暂无记录</span>';
      return;
    }
    var r = rankOf(best.err / 1000);
    el.innerHTML = '<span class="best-mode">' + modeName(mode) + '</span>' +
      '<span class="best-item" style="color:' + r.color + '">' + r.name + '</span>' +
      '<span class="best-item best-err">' + fmtErr(best.err) + '</span>';
  }

  // ---------- 排行榜弹窗 ----------
  var lbSource = 'local', lbMode = MODE_CD;
  function openLB() {
    lbSource = 'local';
    lbMode = settings.mode;
    $('lb-modal').hidden = false;
    renderLBTabs();
    renderLB();
  }
  function closeLB() { $('lb-modal').hidden = true; }
  function renderLBTabs() {
    var srcBtns = $('lb-source-tabs').querySelectorAll('.tab');
    for (var i = 0; i < srcBtns.length; i++) {
      srcBtns[i].classList.toggle('active', srcBtns[i].getAttribute('data-source') === lbSource);
    }
    var modeBtns = $('lb-mode-tabs').querySelectorAll('.tab');
    for (var j = 0; j < modeBtns.length; j++) {
      modeBtns[j].classList.toggle('active', +modeBtns[j].getAttribute('data-lbmode') === lbMode);
    }
  }
  function setLbTip(html) { $('lb-body').innerHTML = '<div class="lb-tip">' + html + '</div>'; }
  function renderLB() {
    if (lbSource === 'local') renderLocalLB();
    else renderGlobalLB();
  }

  function renderLocalLB() {
    var lb = loadLB();
    var key = lbMode === MODE_CD ? 'm1' : 'm2';
    var arr = lb[key] || [];
    $('lb-note').textContent = '本地 ' + modeName(lbMode) + ' · 误差越小越好 · TOP ' + LOCAL_TOP;
    if (!arr.length) { setLbTip('暂无本地记录，快去挑战吧'); return; }
    var rows = '';
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      var r = rankOf(it.err / 1000);
      rows += '<div class="lb-row">' +
        '<span class="lb-rank' + (i < 3 ? ' t' + (i + 1) : '') + '">' + (i + 1) + '</span>' +
        '<span class="lb-badge" style="color:' + r.color + '">' + r.name + '</span>' +
        '<span class="lb-err">' + fmtErr(it.err) + '</span>' +
        '<span class="lb-meta">目标' + it.x + 's · ' + fmtDate(it.ts) + '</span>' +
        '</div>';
    }
    $('lb-body').innerHTML = '<div class="lb-head"><span>名次</span><span>段位</span><span>误差</span><span>目标 · 日期</span></div>' + rows;
  }

  function renderGlobalLB() {
    if (!toyReady) {
      setLbTip('正在加载 B站 数据…');
      var attempts = 0;
      (function waitSDK() {
        if (toyReady) { renderGlobalLB(); return; }
        if (attempts++ > 20) { setLbTip('SDK 加载失败，请在 B 站 App 内查看全局榜'); return; }
        setTimeout(waitSDK, 200);
      })();
      return;
    }
    $('lb-note').textContent = 'B站 全局 ' + modeName(lbMode) + ' · 展示 TOP ' + GLOBAL_TOP;
    setLbTip('加载中…');
    loadGlobalList(lbMode, function (list, mine) {
      if (!list) { setLbTip('全局榜加载失败，请稍后重试'); return; }
      if (!list.length) { setLbTip('暂无上榜记录，去创造奇迹吧'); return; }
      var rows = '';
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        rows += '<div class="lb-row global">' +
          '<span class="lb-rank' + (it.rank <= 3 ? ' t' + it.rank : '') + '">' + it.rank + '</span>' +
          (it.avatar ? '<img class="lb-avatar" src="' + esc(it.avatar) + '" alt="">' : '<span class="lb-avatar"></span>') +
          '<span class="lb-name">' + esc(it.nickname) + '</span>' +
          '<span class="lb-err">' + fmtGlobalErr(it.score) + '</span>' +
          '</div>';
      }
      if (mine && mine.ranked) {
        rows += '<div class="lb-row global mine"><span class="lb-rank">' + mine.rank + '</span>' +
          '<span class="lb-avatar"></span><span class="lb-name">我</span>' +
          '<span class="lb-err">' + fmtGlobalErr(mine.score) + '</span></div>';
      }
      $('lb-body').innerHTML = '<div class="lb-head global"><span>名次</span><span>玩家</span><span>误差</span></div>' + rows;
    });
  }
  function fmtDate(ts) {
    try {
      var d = new Date(ts);
      return (d.getMonth() + 1) + '-' + d.getDate();
    } catch (e) { return ''; }
  }

  // ---------- 事件绑定 ----------
  function wire() {
    // 首页
    $('mode-seg').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.seg') : null;
      if (!b) return;
      settings.mode = +b.getAttribute('data-mode');
      saveSettings();
      renderHome();
    });
    $('x-range').addEventListener('input', function () {
      settings.x = parseInt(this.value, 10);
      saveSettings();
      $('x-val').textContent = settings.x + ' 秒';
    });
    $('btn-start').addEventListener('click', enterTiming);
    $('btn-open-lb').addEventListener('click', openLB);

    // 计时页
    $('btn-back').addEventListener('click', function () { resetStage(); showView('view-home'); });
    $('btn-start-run').addEventListener('pointerdown', function (e) {
      e.stopPropagation();
      if (phase === 'ready') startRun();
    });
    $('stage').addEventListener('pointerdown', function () {
      if (phase === 'run') lock();
    });
    $('btn-again').addEventListener('click', resetStage);
    $('btn-result-lb').addEventListener('click', openLB);

    // 排行榜弹窗
    $('btn-close-lb').addEventListener('click', closeLB);
    $('lb-source-tabs').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.tab') : null;
      if (!b) return;
      lbSource = b.getAttribute('data-source');
      renderLBTabs();
      renderLB();
    });
    $('lb-mode-tabs').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.tab') : null;
      if (!b) return;
      lbMode = +b.getAttribute('data-lbmode');
      renderLBTabs();
      renderLB();
    });
    $('lb-modal').addEventListener('click', function (e) {
      if (e.target === $('lb-modal')) closeLB();
    });
  }

  function init() {
    wire();
    renderHome();
    loadSDK();   // 非阻塞，不阻碍游戏启动
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  // Node 单测导出（浏览器环境 module 未定义，不影响）
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      MODE_CD: MODE_CD, MODE_CU: MODE_CU, X_MIN: X_MIN, X_MAX: X_MAX,
      SCORE_BASE: SCORE_BASE, RANKS: RANKS,
      rankOf: rankOf, fmtErr: fmtErr, fmtGlobalErr: fmtGlobalErr,
      loadSettings: loadSettings, settings: settings,
      loadLB: loadLB, saveLB: saveLB, addLocalResult: addLocalResult
    };
  }
})();
