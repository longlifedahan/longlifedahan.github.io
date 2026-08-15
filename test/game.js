/* 反应力测试：默认蓝，变绿点击计时，变红不点；5 绿 1 红，红不在最后也不在倒数第二 */
(function () {
  // 动态加载 Toy SDK：异步、失败静默，绝不阻塞游戏进程；B站环境已注入时跳过
  if (typeof window.toy === 'undefined' && typeof document !== 'undefined') {
    const sdk = document.createElement('script');
    sdk.src = '//s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
    sdk.async = true;
    document.head.appendChild(sdk);
  }

  const stage = document.getElementById('stage');
  const slots = Array.prototype.slice.call(document.querySelectorAll('.slot'));
  const timerEl = document.getElementById('timer');
  const btnRestart = document.getElementById('btnRestart');
  const startScreen = document.getElementById('startScreen');
  const resScreen = document.getElementById('resScreen');
  const btnStart = document.getElementById('btnStart');
  const btnAgain = document.getElementById('btnAgain');
  const btnHome = document.getElementById('btnHome');
  const resTimes = document.getElementById('resTimes');
  const resCalc = document.getElementById('resCalc');
  const resFinal = document.getElementById('resFinal');
  const btnRankStart = document.getElementById('btnRankStart');
  const btnRankRes = document.getElementById('btnRankRes');
  const rankScreen = document.getElementById('rankScreen');
  const rankLocal = document.getElementById('rankLocal');
  const rankGlobal = document.getElementById('rankGlobal');
  const rankGlobalContent = document.getElementById('rankGlobalContent');
  const rankGlobalGate = document.getElementById('rankGlobalGate');
  const btnFollow = document.getElementById('btnFollow');
  const btnCloseRank = document.getElementById('btnCloseRank');
  const tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));

  const BLUE = '#1e88e5';
  const GREEN = '#43a047';
  const RED = '#e53935';
  const EXEMPT_MS = 250; // 完成测试后一小段时间内的误触豁免

  let state = 'idle';        // idle | blue | green | red
  let times = [];            // 5 次绿色成绩(ms，含罚时)
  let pendingEarly = 0;      // 蓝屏提前点击累计罚时(ms)，加到本次绿色
  let redPenalty = false;    // 点红罚 0.5s，待加到下一次绿色
  let redClickedOnce = false;// 本红阶段是否已罚（只算一次）
  let roundIndex = 0;        // 已变色次数
  let totalChanges = 5;      // 本轮变色次数：无红 5，有红 6
  let hasRed = false;        // 本轮是否出现红色（50% 概率）
  let redAt = -1;            // 红色位置 0~4（不最后）；无红时为 -1
  let greenStart = 0;        // 变绿时刻，绿阶段计时起点
  let redStart = 0;          // 变红时刻，红阶段计时起点
  let lastGreenTap = -999;   // 上次完成测试（绿点击）的时刻，用于豁免紧随误触
  let changeTimer = null;
  let redTimer = null;

  function fmt(ms) { return (ms / 1000).toFixed(3) + 's'; }

  // 秒表格式：分:秒.毫秒
  function fmtTimer(ms) {
    ms = Math.max(0, Math.floor(ms));
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cs = ms % 1000;
    return m + ':' + String(s).padStart(2, '0') + '.' + String(cs).padStart(3, '0');
  }

  function clearTimers() {
    clearTimeout(changeTimer);
    clearTimeout(redTimer);
  }

  function setColor(c) { stage.style.background = c; }

  function resetSlots() {
    slots.forEach(function (s) {
      s.textContent = '';
      s.classList.remove('filled');
    });
  }

  function fillSlot(i, ms) {
    slots[i].textContent = fmt(ms);
    slots[i].classList.add('filled');
  }

  // 本轮时间 = 已产生罚时 + 变色后的实时经过；蓝屏时只显示罚时基准
  function currentTotal(now) {
    let total = pendingEarly + (redPenalty ? 500 : 0);
    if (state === 'green') total += now - greenStart;
    else if (state === 'red') total += now - redStart;
    return total;
  }

  function startRound() {
    clearTimers();
    times = [];
    pendingEarly = 0;
    redPenalty = false;
    roundIndex = 0;
    hasRed = Math.random() < 0.5; // 红色 50% 概率出现
    redAt = hasRed ? Math.floor(Math.random() * 5) : -1; // 有红时位置 0~4（不最后）
    totalChanges = hasRed ? 6 : 5; // 无红时只绿 5 次
    lastGreenTap = -999;
    resetSlots();
    state = 'blue';
    setColor(BLUE);
    scheduleChange();
  }

  function scheduleChange() {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(doChange, 1000 + Math.random() * 4000); // 随机 1~5s
  }

  function doChange() {
    if (state !== 'blue' || roundIndex >= totalChanges) return;
    if (hasRed && roundIndex === redAt) goRed();
    else goGreen();
  }

  function goGreen() {
    state = 'green';
    greenStart = performance.now();
    setColor(GREEN);
  }

  function goRed() {
    state = 'red';
    redClickedOnce = false;
    pendingEarly = 0; // 红前的提前点击不罚时（作废）
    redStart = performance.now();
    setColor(RED);
    redTimer = setTimeout(function () {
      if (state !== 'red') return;
      state = 'blue';
      roundIndex++;
      setColor(BLUE);
      scheduleChange();
    }, 500); // 红只亮 0.5s
  }

  function onTap() {
    const now = performance.now();
    if (state === 'green') {
      const t = now - greenStart;
      const score = t + pendingEarly + (redPenalty ? 500 : 0);
      times.push(score);
      pendingEarly = 0;
      redPenalty = false;
      roundIndex++;
      fillSlot(times.length - 1, score);
      lastGreenTap = now;
      if (roundIndex >= totalChanges) { finishRound(); return; }
      state = 'blue';
      setColor(BLUE);
      scheduleChange();
    } else if (state === 'blue') {
      // 紧接完成测试的误触豁免；其余提前点击每次累加 0.25s
      if (now - lastGreenTap >= EXEMPT_MS) {
        pendingEarly += 250;
      }
    } else if (state === 'red') {
      if (!redClickedOnce) {
        redClickedOnce = true;
        redPenalty = true; // 点红罚 0.5s，只算一次，加到下一次绿色
      }
    }
  }

  function finishRound() {
    state = 'idle';
    const sorted = times.slice().sort(function (a, b) { return a - b; });
    const kept = sorted.slice(1, -1); // 去掉最快和最慢
    const avg = kept.reduce(function (s, v) { return s + v; }, 0) / kept.length;

    resTimes.innerHTML = times.map(function (t, i) {
      const drop = t === sorted[0] || t === sorted[sorted.length - 1];
      const tag = t === sorted[0] ? ' 最快' : t === sorted[sorted.length - 1] ? ' 最慢' : '';
      return '<div class="res-row"><span>第 ' + (i + 1) + ' 次</span><b class="' + (drop ? 'drop' : '') + '">' + fmt(t) + tag + '</b></div>';
    }).join('');

    resCalc.innerHTML =
      '去掉最快 <b>' + fmt(sorted[0]) + '</b> 和最慢 <b>' + fmt(sorted[sorted.length - 1]) + '</b>，中间 3 次平均 <b>' + fmt(avg) + '</b>';
    resFinal.innerHTML = '最终手速<b class="final">' + fmt(avg) + '</b>';

    resScreen.classList.add('show');
    submitResult(avg); // 提交本轮成绩（本地 + B站，异步不阻塞）
  }

  // ---------- 排行榜 ----------
  const RANK_KEY = 'reaction_rank_local';
  const SCORE_BASE = 10000; // B站榜按分越大越靠前：分 = 10000 - 手速(ms)
  const AUTHOR_ID = '13450091';

  function fmtDate(d) {
    const p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function loadLocalRank() {
    try { return JSON.parse(localStorage.getItem(RANK_KEY)) || []; } catch (e) { return []; }
  }

  function saveLocalRank(list) {
    try { localStorage.setItem(RANK_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 本地 top10 + B站榜上报（B站失败不影响本地）
  function submitResult(avgMs) {
    const list = loadLocalRank();
    list.push({ ms: Math.round(avgMs), date: fmtDate(new Date()) });
    list.sort(function (a, b) { return a.ms - b.ms; });
    saveLocalRank(list.slice(0, 10));
    if (window.toy && typeof window.toy.submitScore === 'function') {
      window.toy.submitScore({ board: 1, score: SCORE_BASE - Math.round(avgMs) }).catch(function () {});
    }
  }

  function renderLocal() {
    const list = loadLocalRank();
    rankLocal.innerHTML = list.length
      ? list.map(function (r, i) {
          return '<div class="rank-row' + (i === 0 ? ' first' : '') + '"><span class="rk">' + (i + 1) + '</span><b>' + fmt(r.ms) + '</b><span class="dt">' + r.date + '</span></div>';
        }).join('')
      : '<div class="tip">暂无纪录，完成一轮即可上榜</div>';
  }

  function renderGlobalList(list) {
    if (!list || !list.length) { rankGlobalContent.innerHTML = '<div class="tip">暂无数据</div>'; return; }
    rankGlobalContent.innerHTML = list.map(function (it) {
      const ms = Math.max(0, SCORE_BASE - it.score);
      return '<div class="rank-row' + (it.rank === 1 ? ' first' : '') + '"><span class="rk">' + it.rank + '</span>' +
        '<img class="av" src="' + it.avatar + '" alt="">' +
        '<span class="nm">' + escapeHtml(it.nickname) + '</span>' +
        '<b class="sc">' + fmt(ms) + '</b></div>';
    }).join('');
  }

  // B站全局 top100：先校验关注，作者本人/已关注才拉取；异步不阻塞本地
  function loadGlobal() {
    rankGlobalGate.classList.add('hide');
    if (!window.toy || typeof window.toy.getRankList !== 'function') {
      rankGlobalContent.innerHTML = '<div class="tip">排行榜仅在 B站 App 内可用</div>';
      return;
    }
    rankGlobalContent.innerHTML = '<div class="tip">加载中…</div>';
    const relP = (typeof window.toy.getAuthorRelation === 'function') ? window.toy.getAuthorRelation() : null;
    Promise.resolve(relP).then(function (rel) {
      if (rel && rel.status === 'ok' && rel.data && (rel.data.isAuthor || rel.data.isFollowing)) {
        return window.toy.getRankList({ board: 1, period: 'all', limit: 100 });
      }
      rankGlobalContent.innerHTML = '';
      rankGlobalGate.classList.remove('hide');
      return null;
    }).then(function (list) {
      if (list) renderGlobalList(list);
    }).catch(function () {
      rankGlobalContent.innerHTML = '<div class="tip">加载失败，请稍后重试</div>';
    });
  }

  function openRank() {
    renderLocal();
    rankScreen.classList.add('show');
  }

  stage.addEventListener('pointerdown', onTap);

  // 秒表刷新：蓝屏显示罚时基准，绿/红阶段实时跳动
  setInterval(function () {
    timerEl.textContent = fmtTimer(currentTotal(performance.now()));
  }, 30);

  btnStart.addEventListener('click', function () {
    startScreen.classList.remove('show');
    startRound();
  });

  btnAgain.addEventListener('click', function () {
    resScreen.classList.remove('show');
    startRound();
  });

  btnHome.addEventListener('click', function () {
    resScreen.classList.remove('show');
    startScreen.classList.add('show');
    state = 'idle';
    clearTimers();
  });

  btnRestart.addEventListener('click', function () {
    resScreen.classList.remove('show');
    startRound(); // 中途放弃并重开
  });

  btnRankStart.addEventListener('click', openRank);
  btnRankRes.addEventListener('click', openRank);

  btnCloseRank.addEventListener('click', function () {
    rankScreen.classList.remove('show');
  });

  btnFollow.addEventListener('click', function () {
    if (window.toy && typeof window.toy.navigate === 'function') {
      window.toy.navigate({ type: 'space', id: AUTHOR_ID }).catch(function () {});
    }
  });

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      const isLocal = tab.dataset.tab !== 'global';
      rankLocal.classList.toggle('hide', !isLocal);
      rankGlobal.classList.toggle('hide', isLocal);
      if (!isLocal) loadGlobal();
    });
  });
})();
