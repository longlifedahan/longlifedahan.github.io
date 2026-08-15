/* 24点：经典/挑战/反解 三合一（顶部 3 tab 切换，无首页）
 * - 经典/挑战：四张牌凑 24，可解性用遍历验证（不可解重新生成）
 * - 反解：输入四数输出所有解法（无解提示）
 * - 操作：先选第一张牌 → 强制选运算符 → 再选第二张牌即合并（顺序固定）
 * - 运算生成的新牌用不同颜色区分（gen 标记）
 * - 提示/跳过不记录榜单；排行榜本地 + B站（按用时，越短越靠前） */
(function () {
  'use strict';

  // ---------- 常量 ----------
  var TARGET = 24;
  var LIMIT = 1e9;        // 中间结果绝对值上限（避免巨数/精度问题）
  var MAX_SOLS = 200;     // 解法数量上限
  var LOCAL_TOP = 20;
  var GLOBAL_TOP = 100;
  var KEY_LB = 'g24.lb';
  var SYM = { '+': ' + ', '-': ' - ', '*': ' × ', '/': ' ÷ ' };
  var MODES = {
    classic:   { name: '经典', range: 13, board: 1 },
    challenge: { name: '挑战', range: 100, board: 2 }
  };

  // ---------- 状态 ----------
  var state = 'playing';   // playing | over
  var mode = 'classic';    // classic | challenge | solver
  var cards = [];          // [{v:{n,d}, e:表达式, gen:bool}]
  var selected = [];       // 第一张牌索引（最多 1）
  var selOp = null;        // 已选运算符（先选运算符才能选第二张）
  var history = [];        // 操作历史（撤销栈）
  var usedHint = false;    // 本局是否用过提示
  var sessions = {};       // 每个模式的独立进度（切 tab 保留）
  var toyReady = false;
  var lbSource = 'local';  // 排行榜来源
  var lbMode = 'classic';  // 排行榜模式

  // ---------- 计时 ----------
  var accum = 0, startTs = 0, timerInt = null, timerRunning = false;

  // ---------- DOM ----------
  function $(id) { return document.getElementById(id); }
  var viewGame, viewSolver, modeTabs;
  var timerEl, cardsEl, opsEl, statusEl, hintLine;
  var overOverlay, overTitle, overScore, overSub;
  var lbModal, lbNote, lbBody, lbSourceTabs, lbModeTabs;
  var hintModal, hintBody;
  var snumInputs, solveResult;
  if (typeof document !== 'undefined') {
    viewGame = $('view-game'); viewSolver = $('view-solver'); modeTabs = $('mode-tabs');
    timerEl = $('timer'); cardsEl = $('cards');
    opsEl = $('ops'); statusEl = $('status'); hintLine = $('hint-line');
    overOverlay = $('over-overlay'); overTitle = $('over-title'); overScore = $('over-score'); overSub = $('over-sub');
    lbModal = $('lb-modal'); lbNote = $('lb-note'); lbBody = $('lb-body');
    lbSourceTabs = $('lb-source-tabs'); lbModeTabs = $('lb-mode-tabs');
    hintModal = $('hint-modal'); hintBody = $('hint-body');
    snumInputs = [$('sn0'), $('sn1'), $('sn2'), $('sn3')];
    solveResult = $('solve-result');
  }

  // ---------- 分数工具（精确四则运算） ----------
  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { var t = a % b; a = b; b = t; }
    return a || 1;
  }
  function mk(n, d) {
    if (d === 0 || !isFinite(n) || !isFinite(d)) return null;
    if (d < 0) { n = -n; d = -d; }
    var g = gcd(n, d);
    return { n: n / g, d: d / g };
  }
  function fadd(a, b) { return mk(a.n * b.d + b.n * a.d, a.d * b.d); }
  function fsub(a, b) { return mk(a.n * b.d - b.n * a.d, a.d * b.d); }
  function fmul(a, b) { return mk(a.n * b.n, a.d * b.d); }
  function fdiv(a, b) { return b.n === 0 ? null : mk(a.n * b.d, a.d * b.n); }
  function feq(a, v) { return a.n === v * a.d; }
  function fmtNum(a) {
    if (!a) return '?';
    if (a.d === 1) return String(a.n);
    if (a.n % a.d === 0) return String(a.n / a.d);
    return a.n + '/' + a.d;
  }

  // ---------- 求解器（分数精确，交换律去重） ----------
  function genOps(a, b, ea, eb) {
    var res = [];
    var sw = ea <= eb;              // 加法/乘法按表达式字典序合并，去除交换重复
    var x = sw ? a : b, y = sw ? b : a;
    var lx = sw ? ea : eb, ly = sw ? eb : ea;
    function ok(v) {
      return v && Math.abs(v.n) <= LIMIT && v.d <= LIMIT;
    }
    var s = fadd(x, y);
    if (ok(s)) res.push({ v: s, e: '(' + lx + ' + ' + ly + ')' });
    var d1 = fsub(a, b);
    if (ok(d1)) res.push({ v: d1, e: '(' + ea + ' - ' + eb + ')' });
    if (a.n !== b.n || a.d !== b.d) {
      var d2 = fsub(b, a);
      if (ok(d2)) res.push({ v: d2, e: '(' + eb + ' - ' + ea + ')' });
    }
    var p = fmul(x, y);
    if (ok(p)) res.push({ v: p, e: '(' + lx + ' × ' + ly + ')' });
    var q1 = fdiv(a, b);
    if (ok(q1)) res.push({ v: q1, e: '(' + ea + ' ÷ ' + eb + ')' });
    var q2 = fdiv(b, a);
    if (ok(q2)) res.push({ v: q2, e: '(' + eb + ' ÷ ' + ea + ')' });
    return res;
  }

  function collect(vals, exps, seen, out, cap) {
    var n = vals.length;
    if (n === 1) {
      if (feq(vals[0], TARGET) && !seen[exps[0]]) {
        seen[exps[0]] = 1;
        out.push(exps[0]);
      }
      return;
    }
    if (out.length >= cap) return;
    var tried = {};
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        var key = vals[i].n + '/' + vals[i].d + ',' + vals[j].n + '/' + vals[j].d;
        if (tried[key]) continue;
        tried[key] = 1;
        var rest = [], restE = [];
        for (var k = 0; k < n; k++) if (k !== i && k !== j) { rest.push(vals[k]); restE.push(exps[k]); }
        var ops = genOps(vals[i], vals[j], exps[i], exps[j]);
        for (var m = 0; m < ops.length; m++) {
          rest.push(ops[m].v); restE.push(ops[m].e);
          collect(rest, restE, seen, out, cap);
          rest.pop(); restE.pop();
          if (out.length >= cap) return;
        }
      }
    }
  }

  function solveFrac(vals) {
    var out = [], seen = {};
    collect(vals.slice(), vals.map(fmtNum), seen, out, MAX_SOLS);
    return out;
  }
  // 整数四数 → 所有解法表达式
  function solve24(nums) {
    var vals = nums.map(function (n) { return mk(n, 1); });
    return solveFrac(vals);
  }
  // 只判断是否有解（找到第一个即停）
  function solvable(nums) {
    var vals = nums.map(function (n) { return mk(n, 1); });
    return findOne(vals);
  }
  function findOne(vals) {
    var n = vals.length;
    if (n === 1) return feq(vals[0], TARGET);
    var tried = {};
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        var key = vals[i].n + '/' + vals[i].d + ',' + vals[j].n + '/' + vals[j].d;
        if (tried[key]) continue;
        tried[key] = 1;
        var rest = [];
        for (var k = 0; k < n; k++) if (k !== i && k !== j) rest.push(vals[k]);
        var ops = genOps(vals[i], vals[j], '', '');
        for (var m = 0; m < ops.length; m++) {
          rest.push(ops[m].v);
          if (findOne(rest)) return true;
          rest.pop();
        }
      }
    }
    return false;
  }

  // ---------- 题生成（遍历验证，不可解重新生成） ----------
  function randInt(n) { return Math.floor(Math.random() * n); }
  function genClassic() {
    for (var t = 0; t < 1000; t++) {
      var a = [1 + randInt(13), 1 + randInt(13), 1 + randInt(13), 1 + randInt(13)];
      if (solvable(a)) return a;
    }
    return genFallback();
  }
  function genChallenge() {
    for (var t = 0; t < 1000; t++) {
      var a = [1 + randInt(100), 1 + randInt(100), 1 + randInt(100), 1 + randInt(100)];
      if (solvable(a)) return a;
    }
    return genFallback();
  }
  // 保底可解：三数 + 24-和（保证 1~100 内）
  function genFallback() {
    for (;;) {
      var a = 1 + randInt(100), b = 1 + randInt(100), c = 1 + randInt(100);
      var d = TARGET - a - b - c;
      if (d >= 1 && d <= 100) return [a, b, c, d];
    }
  }

  // ---------- 排行榜编码（B站分数 ±16777216，科学计数拆分） ----------
  function sciParts(n) {
    if (!(n > 0)) return { c: 1, e: 0 };
    var e = Math.floor(Math.log10(n));
    return { c: n / Math.pow(10, e), e: e };
  }
  function encodeScore(n) {
    if (!(n > 0) || !isFinite(n)) return 0;
    var s = sciParts(n);
    var mant = Math.round(s.c * 1000);
    var e = s.e;
    if (mant >= 10000) { mant = 1000; e += 1; }
    return Math.max(-16777216, Math.min(16777215, e * 10000 + mant));
  }
  function decodeScore(enc) {
    if (enc <= 0) return 0;
    var e = Math.floor(enc / 10000), mant = enc % 10000;
    return mant * Math.pow(10, e - 3);
  }
  function fmtScore(sec) {
    // 时:分:秒 冒号格式，取整到秒，无毫秒
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    var mm = (m < 10 ? '0' + m : '' + m), ss = (s < 10 ? '0' + s : '' + s);
    return h > 0 ? h + ':' + mm + ':' + ss : m + ':' + ss;
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' + s : s);
  }
  function fmtDate(ts) {
    try {
      var d = new Date(ts);
      return (d.getMonth() + 1) + '-' + d.getDate();
    } catch (e) { return ''; }
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- 计时 ----------
  function startTimer() {
    if (timerRunning) return;
    timerRunning = true;
    startTs = Date.now();
    tickTimer();
    timerInt = setInterval(tickTimer, 200);
  }
  function stopTimer() {
    if (!timerRunning) return;
    timerRunning = false;
    if (timerInt) { clearInterval(timerInt); timerInt = null; }
    accum += Date.now() - startTs;
  }
  function tickTimer() {
    if (timerEl) timerEl.textContent = fmtClock((accum + (timerRunning ? Date.now() - startTs : 0)) / 1000);
  }
  function resetTimer() {
    accum = 0; timerRunning = false;
    if (timerInt) { clearInterval(timerInt); timerInt = null; }
    if (timerEl) timerEl.textContent = '0:00';
  }
  function elapsed() {
    return (accum + (timerRunning ? Date.now() - startTs : 0)) / 1000;
  }

  // ---------- 视图与 tab ----------
  function showView(id) {
    viewGame.classList.toggle('active', id === 'view-game');
    viewSolver.classList.toggle('active', id === 'view-solver');
    lbModal.hidden = true;
    hintModal.hidden = true;
    overOverlay.hidden = true;
  }
  function renderTabs() {
    var btns = modeTabs.querySelectorAll('.tab');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-tab') === mode);
    }
  }
  function switchMode(m) {
    if (m === mode) return;
    saveCurrent();
    mode = m;
    renderTabs();
    if (m === 'solver') { showView('view-solver'); return; }
    showView('view-game');
    loadSession(m);
  }
  function startMode(m) { switchMode(m); }

  // 保存当前模式进度（切 tab 前调用）
  function saveCurrent() {
    stopTimer();                   // 先停表累计，再存值
    var s = sessions[mode] || (sessions[mode] = {});
    s.cards = cards;
    s.selected = selected.slice();
    s.selOp = selOp;
    s.history = history;
    s.usedHint = usedHint;
    s.state = state;
    s.accum = accum;
    s.overOpen = !overOverlay.hidden;
    s.hasStarted = true;
  }
  // 恢复目标模式进度（首次进入则开新局）
  function loadSession(m) {
    var s = sessions[m];
    if (!s || !s.hasStarted) { newRound(); return; }
    cards = s.cards;
    selected = s.selected;
    selOp = s.selOp;
    history = s.history;
    usedHint = s.usedHint;
    state = s.state;
    accum = s.accum;
    overOverlay.hidden = !s.overOpen;
    if (state === 'playing') startTimer();
    renderCards();
    renderOps();
    updateStatus();
  }

  // ---------- 游戏流程 ----------
  function newRound() {
    var nums = mode === 'classic' ? genClassic() : genChallenge();
    cards = nums.map(function (n) { return { v: mk(n, 1), e: String(n), gen: false }; });
    selected = [];
    selOp = null;
    history = [];
    usedHint = false;
    state = 'playing';
    resetTimer();
    startTimer();
    overOverlay.hidden = true;
    hintLine.textContent = '';
    renderCards();
    renderOps();
    updateStatus();
  }
  function renderCards() {
    cardsEl.innerHTML = '';
    for (var i = 0; i < cards.length; i++) {
      var c = document.createElement('div');
      var cls = 'card';
      if (cards[i].gen) cls += ' gen';
      if (selected.indexOf(i) >= 0) cls += ' sel';
      c.className = cls;
      c.textContent = fmtNum(cards[i].v);
      (function (idx) {
        c.addEventListener('click', function () { onCardClick(idx); });
      })(i);
      cardsEl.appendChild(c);
    }
  }
  function renderOps() {
    var ready = selected.length === 1 && state === 'playing';
    opsEl.classList.toggle('ready', ready);
    if (ready) {
      var btns = opsEl.querySelectorAll('.op');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('picked', selOp === btns[i].getAttribute('data-op'));
      }
    }
  }
  function updateStatus() {
    if (!statusEl) return;
    if (state === 'over') { statusEl.textContent = ''; return; }
    if (cards.length === 1) return;
    if (selected.length === 0) statusEl.textContent = '请选择第一张牌';
    else if (!selOp) statusEl.textContent = '请选择运算符';
    else statusEl.textContent = '请选择第二张牌';
  }
  // 选第一张牌：点击未选中的牌设为第一张；再点同一张取消。
  // 强制顺序：未选运算符时点击其他牌会被忽略。
  function onCardClick(idx) {
    if (state === 'over' || idx >= cards.length) return;
    if (selected.length === 0) {
      selected.push(idx);
    } else if (selected[0] === idx) {
      selected = [];
      selOp = null;
    } else if (selOp) {
      doMerge(selOp, selected[0], idx);
      return;
    }
    renderCards();
    renderOps();
    updateStatus();
  }
  // 选运算符：必须已选第一张牌
  function selectOp(op) {
    if (state === 'over' || selected.length !== 1) return;
    selOp = op;
    renderOps();
    updateStatus();
  }
  function compute(va, vb, op, ea, eb) {
    var v = op === '+' ? fadd(va, vb) : op === '-' ? fsub(va, vb)
      : op === '*' ? fmul(va, vb) : fdiv(va, vb);
    if (!v || Math.abs(v.n) > LIMIT || v.d > LIMIT) return null;
    return { v: v, e: '(' + ea + SYM[op] + eb + ')' };
  }
  // 合并：第一张(i) op 第二张(j)，顺序固定
  function doMerge(op, i, j) {
    if (state === 'over') return;
    var a = cards[i], b = cards[j];
    var r = compute(a.v, b.v, op, a.e, b.e);
    if (!r) { renderCards(); renderOps(); updateStatus(); return; }
    history.push(cards.slice());
    var nc = [];
    for (var k = 0; k < cards.length; k++) if (k !== i && k !== j) nc.push(cards[k]);
    r.gen = true;               // 运算生成的新牌：不同颜色区分
    nc.push(r);
    cards = nc;
    selected = [];
    selOp = null;
    renderCards();
    renderOps();
    updateStatus();
    checkEnd();
  }
  function checkEnd() {
    if (cards.length !== 1) return;
    stopTimer();
    state = 'over';
    var ok = feq(cards[0].v, TARGET);
    var t = elapsed();
    overTitle.textContent = ok ? '恭喜！算出 24' : '未得到 24';
    overScore.textContent = ok ? '结果 ' + fmtNum(cards[0].v) : '当前结果 ' + fmtNum(cards[0].v);
    if (ok) {
      overSub.textContent = '用时 ' + fmtScore(t);
      if (usedHint) overSub.textContent += ' · 已用提示，本局未上榜';
      else { addLocal(mode, t); submitGlobal(mode, t); overSub.textContent += ' · 已记录榜单'; }
    } else {
      overSub.textContent = '只剩一张牌，无法继续运算';
    }
    overOverlay.hidden = false;
  }
  function undo() {
    if (!history.length) return;
    cards = history.pop();
    selected = [];
    selOp = null;
    if (state === 'over') {
      state = 'playing';
      overOverlay.hidden = true;
      startTimer();
    }
    renderCards();
    renderOps();
    updateStatus();
  }
  function skip() {
    newRound();                   // 跳题：重新出题、重新计时，不记录榜单
  }
  function showHint() {
    if (!cards.length) return;
    var sols = solveFrac(cards.map(function (c) { return c.v; }));
    var html = sols.length
      ? sols.slice(0, 10).map(function (s) { return '<div class="hint-item">' + esc(s) + '</div>'; }).join('')
        + (sols.length > 10 ? '<div class="hint-more">…等 ' + sols.length + ' 种</div>' : '')
      : '<div class="hint-item">当前牌面无法凑出 24</div>';
    hintBody.innerHTML = html;
    usedHint = true;
    hintModal.hidden = false;
  }
  // 测试钩子：用指定数字组开局（浏览器环境不导出，不影响线上）
  function _setCards(nums) {
    cards = nums.map(function (n) { return { v: mk(n, 1), e: String(n), gen: false }; });
    selected = [];
    selOp = null;
    history = [];
    usedHint = false;
    state = 'playing';
    resetTimer();
    startTimer();
    overOverlay.hidden = true;
    renderCards();
    renderOps();
    updateStatus();
  }

  // ---------- 反解 ----------
  function doSolve() {
    var nums = [];
    for (var i = 0; i < snumInputs.length; i++) {
      var val = parseInt(snumInputs[i].value, 10);
      if (!(val >= 1 && val <= 100)) {
        solveResult.innerHTML = '<div class="lb-tip">请输入 1-100 之间的整数</div>';
        return;
      }
      nums.push(val);
    }
    var sols = solve24(nums);
    if (!sols.length) {
      solveResult.innerHTML = '<div class="lb-tip">无解：这四个数字无法凑出 24</div>';
      return;
    }
    var html = '<div class="solver-count">共 ' + sols.length + ' 种解法</div><div class="solver-list">';
    for (var j = 0; j < sols.length; j++) html += '<div class="solver-item">' + esc(sols[j]) + '</div>';
    html += '</div>';
    solveResult.innerHTML = html;
  }

  // ---------- 本地排行榜（按用时升序） ----------
  function emptyLB() { return { classic: [], challenge: [] }; }
  function loadLB() {
    try {
      var raw = localStorage.getItem(KEY_LB);
      if (raw) {
        var lb = JSON.parse(raw);
        if (lb && typeof lb === 'object') {
          if (!Array.isArray(lb.classic)) lb.classic = [];
          if (!Array.isArray(lb.challenge)) lb.challenge = [];
          return lb;
        }
      }
    } catch (e) { /* 忽略 */ }
    return emptyLB();
  }
  function saveLB(lb) {
    try { localStorage.setItem(KEY_LB, JSON.stringify(lb)); } catch (e) { /* 忽略 */ }
  }
  function addLocal(m, time) {
    var lb = loadLB();
    var arr = lb[m] || [];
    arr.push({ time: time, ts: Date.now() });
    arr.sort(function (a, b) { return a.time - b.time; });
    if (arr.length > LOCAL_TOP) arr.length = LOCAL_TOP;
    lb[m] = arr;
    saveLB(lb);
  }

  // ---------- B站 SDK（异步加载） ----------
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
  function submitGlobal(m, time) {
    if (!toyReady || !window.toy || typeof window.toy.submitScore !== 'function') return;
    var board = MODES[m].board;
    if (!board) return;
    var score = encodeScore(Math.round(1e7 / Math.max(time, 0.01)));
    try { window.toy.submitScore({ board: board, score: score }).catch(function () { /* 忽略 */ }); }
    catch (e) { /* 忽略 */ }
  }
  function loadGlobalList(cb) {
    if (!toyReady || !window.toy) { cb(null, null); return; }
    var board = MODES[lbMode].board;
    if (!board) { cb(null, null); return; }
    try {
      Promise.all([
        window.toy.getRankList({ board: board, period: 'all', limit: GLOBAL_TOP }).catch(function () { return null; }),
        window.toy.getMyRank({ board: board, period: 'all' }).catch(function () { return null; })
      ]).then(function (res) { cb(res[0], res[1]); });
    } catch (e) { cb(null, null); }
  }

  // ---------- 排行榜弹窗 ----------
  function openLB() {
    lbSource = 'local';
    if (mode === 'solver') { if (!MODES[lbMode]) lbMode = 'classic'; }
    else lbMode = mode;
    lbModal.hidden = false;
    renderLBTabs();
    renderLB();
  }
  function closeLB() { lbModal.hidden = true; }
  function renderLBTabs() {
    var sBtns = lbSourceTabs.querySelectorAll('.tab');
    for (var i = 0; i < sBtns.length; i++) {
      sBtns[i].classList.toggle('active', sBtns[i].getAttribute('data-source') === lbSource);
    }
    var mBtns = lbModeTabs.querySelectorAll('.tab');
    for (var j = 0; j < mBtns.length; j++) {
      mBtns[j].classList.toggle('active', mBtns[j].getAttribute('data-lbmode') === lbMode);
    }
  }
  function setTip(html) { lbBody.innerHTML = '<div class="lb-tip">' + html + '</div>'; }
  function renderLB() {
    if (lbSource === 'local') renderLocalLB();
    else renderGlobalLB();
  }
  function renderLocalLB() {
    var list = loadLB()[lbMode] || [];
    lbNote.textContent = '本地榜 · ' + MODES[lbMode].name + ' · 用时最短 · TOP ' + LOCAL_TOP;
    if (!list.length) { setTip('暂无记录，快去开局挑战吧'); return; }
    var rows = '';
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      rows += '<div class="lb-row">' +
        '<span class="lb-rank' + (i < 3 ? ' t' + (i + 1) : '') + '">' + (i + 1) + '</span>' +
        '<span class="lb-score">' + fmtScore(it.time) + '</span>' +
        '<span class="lb-meta">' + fmtDate(it.ts) + '</span>' +
        '</div>';
    }
    lbBody.innerHTML = '<div class="lb-head"><span>名次</span><span>用时</span><span>日期</span></div>' + rows;
  }
  function renderGlobalLB() {
    var title = 'B站榜 · ' + MODES[lbMode].name + ' · 用时最短 · TOP ' + GLOBAL_TOP;
    lbNote.textContent = title;
    if (!toyReady) {
      setTip('正在加载 B站 数据…');
      var attempts = 0;
      (function waitSDK() {
        if (toyReady) { renderGlobalLB(); return; }
        if (attempts++ > 25) { setTip('SDK 加载失败，请在 B站 App 内查看'); return; }
        setTimeout(waitSDK, 200);
      })();
      return;
    }
    setTip('加载中…');
    loadGlobalList(function (list, mine) {
      if (!list) { setTip('加载失败，请稍后重试'); return; }
      if (!list.length) { setTip('暂无上榜记录，去创造奇迹吧'); return; }
      var rows = '';
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        var t = 1e7 / decodeScore(it.score);
        rows += '<div class="lb-row global">' +
          '<span class="lb-rank' + (it.rank <= 3 ? ' t' + it.rank : '') + '">' + it.rank + '</span>' +
          (it.avatar ? '<img class="lb-avatar" src="' + esc(it.avatar) + '" alt="" referrerpolicy="no-referrer">' : '<span class="lb-avatar"></span>') +
          '<span class="lb-name">' + esc(it.nickname) + '</span>' +
          '<span class="lb-score">' + fmtScore(t) + '</span>' +
          '</div>';
      }
      if (mine && mine.ranked) {
        var mt = 1e7 / decodeScore(mine.score);
        rows += '<div class="lb-row global mine"><span class="lb-rank">' + mine.rank + '</span>' +
          '<span class="lb-avatar"></span><span class="lb-name">我</span>' +
          '<span class="lb-score">' + fmtScore(mt) + '</span></div>';
      }
      lbBody.innerHTML = '<div class="lb-head global"><span>名次</span><span>玩家</span><span>用时</span></div>' + rows;
    });
  }

  // ---------- 事件绑定 ----------
  if (typeof document !== 'undefined') {
    modeTabs.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.tab') : null;
      if (!b) return;
      var t = b.getAttribute('data-tab');
      if (MODES[t] || t === 'solver') switchMode(t);
    });
    $('btn-open-lb').addEventListener('click', openLB);
    $('btn-undo').addEventListener('click', undo);
    $('btn-hint').addEventListener('click', showHint);
    $('btn-skip').addEventListener('click', skip);
    $('btn-close-hint').addEventListener('click', function () { hintModal.hidden = true; });
    $('btn-close-lb').addEventListener('click', closeLB);
    $('btn-over-lb').addEventListener('click', openLB);
    $('btn-again').addEventListener('click', function () { newRound(); });
    $('btn-undo-over').addEventListener('click', undo);
    $('btn-solve').addEventListener('click', doSolve);

    opsEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.op') : null;
      if (!b) return;
      selectOp(b.getAttribute('data-op'));
    });
    lbSourceTabs.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.tab') : null;
      if (!b) return;
      lbSource = b.getAttribute('data-source');
      renderLBTabs();
      renderLB();
    });
    lbModeTabs.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.tab') : null;
      if (!b) return;
      lbMode = b.getAttribute('data-lbmode');
      renderLBTabs();
      renderLB();
    });
    lbModal.addEventListener('click', function (e) { if (e.target === lbModal) closeLB(); });
    hintModal.addEventListener('click', function (e) { if (e.target === hintModal) hintModal.hidden = true; });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  function init() {
    mode = 'classic';
    sessions = {};
    renderTabs();
    showView('view-game');
    newRound();
    loadSDK();
  }

  // ---------- Node 单测导出 ----------
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      TARGET: TARGET, LIMIT: LIMIT, MODES: MODES,
      solve24: solve24, solvable: solvable, solveFrac: solveFrac,
      genClassic: genClassic, genChallenge: genChallenge, genFallback: genFallback,
      encodeScore: encodeScore, decodeScore: decodeScore,
      fmtScore: fmtScore, fmtNum: fmtNum, fmtClock: fmtClock,
      fadd: fadd, fsub: fsub, fmul: fmul, fdiv: fdiv, mk: mk, feq: feq,
      startMode: startMode, switchMode: switchMode, newRound: newRound,
      onCardClick: onCardClick, selectOp: selectOp, doMerge: doMerge,
      undo: undo, showHint: showHint, skip: skip,
      doSolve: doSolve, addLocal: addLocal, loadLB: loadLB,
      getCards: function () { return cards.slice(); },
      getState: function () { return state; },
      getMode: function () { return mode; },
      getUsedHint: function () { return usedHint; },
      getHistory: function () { return history.length; },
      getSelected: function () { return selected.slice(); },
      getSelOp: function () { return selOp; },
      elapsed: elapsed,
      _setCards: _setCards,
      openLB: openLB
    };
  }
})();
