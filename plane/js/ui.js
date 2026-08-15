/**
 * ui.js —— 界面与交互
 *
 * 依赖：window.PlaneCore、window.AudioMgr、window.Game
 * 职责：视图切换（首页/设置/商店/排行榜/游戏）、设置项读写、商店升级、
 *       本地+B站 排行榜（异步加载不阻塞页面）、暂停/结算遮罩、断点续玩入口。
 */
(function (root) {
  'use strict';

  var Core = root.PlaneCore;
  var AudioMgr = root.AudioMgr;
  var Game = root.Game;
  var CFG = Core.CFG;

  // 当前视图
  var curView = 'view-home';
  // “返回”目标：从哪进来，back 回哪（home / game 恢复对局 / gameover 结算）
  var navReturn = 'home';
  var hintTimer = null;

  // 排行榜当前状态：来源(本地/B站) -> B站子类(高分/等级) -> 周期(日/周/月/总)
  var curSource = 'local';
  var curType = 'score';
  var curPeriod = 'all';

  // DOM
  var $ = function (id) { return document.getElementById(id); };

  /* ========================================================================
   * 视图切换
   * ====================================================================== */
  function showView(id) {
    curView = id;
    var views = document.querySelectorAll('.view');
    for (var i = 0; i < views.length; i++) views[i].classList.toggle('active', views[i].id === id);
  }

  function enterGame() {
    showView('view-game');
    navReturn = 'home';
  }

  function goHome() {
    Game.toHome();
    showView('view-home');
    renderHomeStats();
    if (Core.loadSettings().bgm) AudioMgr.playMusic('home');
  }

  function showGameHint() {
    var hint = $('game-hint');
    if (!hint) return;
    var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    hint.textContent = isTouch ? '拖动飞机 · 双击屏幕放炸弹' : '鼠标移动 · 空格放炸弹';
    hint.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hint.hidden = true; }, 3200);
  }

  // 跳关选择弹窗：列出可从第 1 关起跳至的关卡，用户点击即进入
  function openJumpSelect() {
    var up = Core.loadUpgrades();
    var maxJump = Math.floor(up.armor / CFG.jump.perLevels);
    if (maxJump <= 0) return;
    var list = $('jump-list');
    list.innerHTML = '';
    // 不展示第 1 关（不跳），只列跳 1 关及以上的选项
    for (var j = 1; j <= maxJump; j++) {
      (function (jj) {
        var btn = document.createElement('button');
        btn.className = 'btn ghost';
        btn.textContent = '第 ' + (1 + jj) + ' 关';
        btn.onclick = function () {
          $('jump-overlay').hidden = true;
          Game.startRun(jj);
          enterGame();
          showGameHint();
        };
        list.appendChild(btn);
      })(j);
    }
    $('jump-overlay').hidden = false;
  }

  /* ========================================================================
   * 首页
   * ====================================================================== */
  function renderHomeStats() {
    $('home-best').textContent = Core.fmtNum(Core.bestLocalScore());
    $('home-balance').textContent = Core.fmtNum(Core.getBalance());
    $('btn-continue').disabled = !Core.hasCheckpoint();
    // 跳关按钮：机体每 10 级跳 1 关；低于 10 级（无法跳关）时隐藏
    var up = Core.loadUpgrades();
    var jump = Math.floor(up.armor / CFG.jump.perLevels);
    if (jump <= 0) {
      $('btn-start-jump').style.display = 'none';
    } else {
      $('btn-start-jump').style.display = 'block';
      $('btn-start-jump').textContent = '开始游戏（跳关）';
    }
  }

  // BGM 快捷开关（首页 + 游戏页按钮），两处图标同步
  function updateSoundBtns() {
    var icon = Core.loadSettings().bgm ? '🔊' : '🔇';
    var el = $('btn-sound-home');
    if (el) el.textContent = icon;
    el = $('btn-sound-game');
    if (el) el.textContent = icon;
  }
  function toggleBgm() {
    var s = Core.loadSettings();
    s.bgm = !s.bgm;
    Core.saveSettings(s);
    AudioMgr.setEnabled(s.bgm);
    if (s.bgm) {
      // 暂停时不播放音乐
      var st = Game.getState();
      if (st === 'playing') AudioMgr.playMusic('game');
      else if (st !== 'paused') AudioMgr.playMusic('home');
    }
    Game.refreshSettings();
    updateSoundBtns();
  }

  /* ========================================================================
   * 设置
   * ====================================================================== */
  function setToggle(el, on) {
    el.textContent = on ? '开' : '关';
    el.classList.toggle('on', !!on);
  }
  function loadSettingsUI() {
    var s = Core.loadSettings();
    setToggle($('set-bgm'), s.bgm);
    setToggle($('set-boss'), s.boss);
    setToggle($('set-hp'), s.showHp);
    var cap = $('set-cap');
    cap.value = s.cap;
    $('set-cap-val').textContent = s.cap;
    // 难度分段高亮
    var segs = document.querySelectorAll('#diff-seg .seg');
    for (var i = 0; i < segs.length; i++) {
      segs[i].classList.toggle('on', segs[i].getAttribute('data-diff') === s.difficulty);
    }
  }
  function bindSettings() {
    $('set-bgm').onclick = function () {
      var s = Core.loadSettings();
      s.bgm = !s.bgm;
      Core.saveSettings(s);
      AudioMgr.setEnabled(s.bgm);
      setToggle(this, s.bgm);
      Game.refreshSettings();
    };
    $('set-boss').onclick = function () {
      var s = Core.loadSettings();
      s.boss = !s.boss;
      Core.saveSettings(s);
      setToggle(this, s.boss);
      Game.refreshSettings();
    };
    $('set-hp').onclick = function () {
      var s = Core.loadSettings();
      s.showHp = !s.showHp;
      Core.saveSettings(s);
      setToggle(this, s.showHp);
      Game.refreshSettings();
    };
    $('set-cap').oninput = function () {
      var s = Core.loadSettings();
      s.cap = parseInt(this.value, 10);
      Core.saveSettings(s);
      $('set-cap-val').textContent = s.cap;
      Game.refreshSettings();
    };
    // 难度分段选择
    var diffSegs = document.querySelectorAll('#diff-seg .seg');
    for (var d = 0; d < diffSegs.length; d++) {
      diffSegs[d].onclick = function () {
        var s = Core.loadSettings();
        s.difficulty = this.getAttribute('data-diff');
        Core.saveSettings(s);
        for (var j = 0; j < diffSegs.length; j++) diffSegs[j].classList.toggle('on', diffSegs[j] === this);
        Game.refreshSettings();
      };
    }
  }

  /* ========================================================================
   * 商店
   * ====================================================================== */
  var SHOP_DEFS = {
    armor: { base: 0 },
    b1: { base: CFG.bullets.b1.base },
    b2: { base: CFG.bullets.b2.base },
    b3: { base: CFG.bullets.b3.base }
  };
  function renderShop() {
    var up = Core.loadUpgrades();
    var bal = Core.getBalance();
    $('shop-balance').textContent = Core.fmtNum(bal);
    $('shop-level').textContent = 'Lv.' + Core.playerLevel(up);

    var keys = ['armor', 'b1', 'b2', 'b3'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var lv = up[k];
      var cost = Core.costForLevel(k, lv);
      $('up-' + k + '-lv').textContent = 'Lv.' + lv;
      var btn = document.querySelector('.upgrade-card[data-key="' + k + '"] .buy');
      if (k === 'armor') {
        $('up-armor-stat').textContent = '基础生命 ' + Core.armorMaxHp(lv);
        $('up-armor-next').textContent = '下一级：+10 生命';
      } else {
        var dmg = Core.bulletDamage(SHOP_DEFS[k].base, lv);
        $('up-' + k + '-stat').textContent = '威力 ' + Core.fmtDmg(dmg);
        var next = Core.bulletDamage(SHOP_DEFS[k].base, lv + 1);
        $('up-' + k + '-next').textContent = '下一级：威力 ' + Core.fmtDmg(next);
        // 子弹等级不得高于机体等级+10，否则需先提升机体
        if (lv >= up.armor + 10) {
          btn.textContent = '需机体等级提升至 Lv.' + Math.max(1, lv - 9);
          btn.disabled = true;
          continue;
        }
      }
      btn.textContent = '升级（' + Core.fmtNum(cost) + ' 积分）';
      btn.disabled = bal < cost;
    }
  }

  function buy(kind) {
    var up = Core.loadUpgrades();
    // 子弹等级不得高于机体等级+10
    if (kind !== 'armor' && up[kind] >= up.armor + 10) {
      AudioMgr.playSfx('enemyExplode');
      return;
    }
    var cost = Core.costForLevel(kind, up[kind]);
    if (!Core.spendBalance(cost)) {
      AudioMgr.playSfx('enemyExplode');
      return;
    }
    up[kind] += 1;
    Core.saveUpgrades(up);
    AudioMgr.playSfx('bomb');
    renderShop();
  }

  /* ========================================================================
   * 排行榜
   * ====================================================================== */
  function ensureSDK(cb) {
    if (typeof window.toy !== 'undefined' && window.toy && typeof window.toy.getRankList === 'function') {
      cb(true); return;
    }
    try {
      var s = document.createElement('script');
      s.src = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
      s.async = true;
      s.onload = function () { cb(!!window.toy); };
      s.onerror = function () { cb(false); };
      document.head.appendChild(s);
    } catch (e) { cb(false); }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function topCls(r) { return r === 1 ? 'top1' : (r === 2 ? 'top2' : (r === 3 ? 'top3' : '')); }
  function fmtDate(ts) {
    var d = new Date(ts), p = function (x) { return x < 10 ? '0' + x : '' + x; };
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function periodLabel(p) {
    return { all: '总榜', month: '月榜', week: '周榜', day: '日榜' }[p] || '';
  }

  function loadGlobalBoard(board, period, cb) {
    ensureSDK(function (ok) {
      if (!ok) { cb(null, null, 'SDK 未就绪，请在 B站 App 内打开'); return; }
      Promise.all([
        window.toy.getRankList({ board: board, period: period, limit: CFG.rankTop }).catch(function () { return null; }),
        window.toy.getMyRank({ board: board, period: period }).catch(function () { return null; })
      ]).then(function (res) {
        cb(res[0], res[1], null);
      }).catch(function () { cb(null, null, '榜单加载失败'); });
    });
  }

  function renderRank() {
    var body = $('rank-body');
    var note = $('rank-note');
    var typeTabs = $('rank-type-tabs');
    var periodTabs = $('rank-period-tabs');

    // 本地榜（高分，无周期/子类）
    if (curSource === 'local') {
      typeTabs.style.display = 'none';
      periodTabs.style.display = 'none';
      note.textContent = '本地高分榜 · 仅本设备';
      var list = Core.getLocalLB();
      if (!list.length) { body.innerHTML = '<div class="lb-tip">暂无本地记录，快去开局！</div>'; return; }
      var html = '';
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        html += '<div class="lb-row">' +
          '<span class="lb-rank ' + topCls(i + 1) + '">' + (i + 1) + '</span>' +
          '<span class="lb-nick">第 ' + r.wave + ' 波</span>' +
          '<span class="lb-score">' + Core.fmtNum(r.score) + '</span>' +
          '<span class="lb-sub">' + fmtDate(r.ts) + '</span>' +
          '</div>';
      }
      body.innerHTML = html;
      return;
    }

    // B站榜：先选高分/等级，再选周期
    typeTabs.style.display = 'flex';
    periodTabs.style.display = 'flex';
    var board = curType === 'score' ? CFG.bScoreBoard : CFG.bLevelBoard;
    var isScore = curType === 'score';
    body.innerHTML = '<div class="lb-tip">加载中…</div>';
    note.textContent = '';
    loadGlobalBoard(board, curPeriod, function (list, mine, err) {
      if (err) { body.innerHTML = '<div class="lb-tip">' + esc(err) + '</div>'; return; }
      if (!list || !list.length) { body.innerHTML = '<div class="lb-tip">暂无上榜数据</div>'; return; }
      var mineRank = mine && mine.ranked ? mine.rank : 0;
      var h = '';
      for (var j = 0; j < list.length; j++) {
        var it = list[j];
        var scoreText = isScore ? Core.fmtNum(Core.decodeScore(it.score)) : 'Lv.' + it.score;
        var cls = it.rank === mineRank ? ' lb-me' : '';
        h += '<div class="lb-row' + cls + '">' +
          '<span class="lb-rank ' + topCls(it.rank) + '">' + it.rank + '</span>' +
          '<img class="lb-avatar" alt="" src="' + esc(it.avatar || '') + '" onerror="this.style.visibility=\'hidden\'">' +
          '<span class="lb-nick">' + esc(it.nickname || '匿名') + '</span>' +
          '<span class="lb-score">' + scoreText + '</span>' +
          '</div>';
      }
      body.innerHTML = h;
      note.textContent = 'B站 ' + (isScore ? '高分' : '等级') + '榜 · ' + periodLabel(curPeriod) +
        (mineRank > 0 ? ' · 我的排名 ' + mineRank : ' · 未上榜');
    });
  }

  /* ========================================================================
   * 结算
   * ====================================================================== */
  function showGameOver(score, wave, points) {
    $('over-score').textContent = Core.fmtNum(score);
    $('over-sub').textContent = '到达第 ' + wave + ' 波';
    $('over-points').textContent = '获得积分 +' + Core.fmtNum(points) +
      '（分数 ÷100）· 可到商店升级';
    $('over-overlay').hidden = false;
    $('pause-overlay').hidden = true;
  }

  /* ========================================================================
   * 事件绑定
   * ====================================================================== */
  function bindTabs() {
    var srcTabs = document.querySelectorAll('#rank-source-tabs .tab');
    for (var i = 0; i < srcTabs.length; i++) {
      srcTabs[i].onclick = function () {
        for (var j = 0; j < srcTabs.length; j++) srcTabs[j].classList.toggle('active', srcTabs[j] === this);
        curSource = this.getAttribute('data-source');
        renderRank();
      };
    }
    var typeTabs = document.querySelectorAll('#rank-type-tabs .tab');
    for (var t = 0; t < typeTabs.length; t++) {
      typeTabs[t].onclick = function () {
        for (var m = 0; m < typeTabs.length; m++) typeTabs[m].classList.toggle('active', typeTabs[m] === this);
        curType = this.getAttribute('data-type');
        renderRank();
      };
    }
    var perTabs = document.querySelectorAll('#rank-period-tabs .tab');
    for (var k = 0; k < perTabs.length; k++) {
      perTabs[k].onclick = function () {
        for (var m = 0; m < perTabs.length; m++) perTabs[m].classList.toggle('active', perTabs[m] === this);
        curPeriod = this.getAttribute('data-period');
        renderRank();
      };
    }
  }

  function bindButtons() {
    // 首页
    $('btn-start').onclick = function () {
      Game.startRun();
      enterGame();
      showGameHint();
    };
    $('btn-start-jump').onclick = openJumpSelect;
    $('btn-jump-cancel').onclick = function () {
      $('jump-overlay').hidden = true;
    };
    $('btn-continue').onclick = function () {
      if (Game.continueRun()) { enterGame(); showGameHint(); }
      else { AudioMgr.playSfx('enemyExplode'); renderHomeStats(); }
    };
    $('btn-help').onclick = function () {
      navReturn = 'home';
      showView('view-help');
    };
    $('btn-help-back').onclick = function () {
      showView('view-home');
      renderHomeStats();
      if (Core.loadSettings().bgm) AudioMgr.playMusic('home');
    };
    $('btn-settings').onclick = function () {
      navReturn = 'home';
      showView('view-settings');
      loadSettingsUI();
    };
    $('btn-shop').onclick = function () {
      navReturn = 'home';
      showView('view-shop');
      renderShop();
    };
    $('btn-rank').onclick = function () {
      navReturn = 'home';
      showView('view-rank');
      renderRank();
    };

    // 设置页返回
    $('btn-settings-back').onclick = function () {
      if (navReturn === 'game') { showView('view-game'); Game.resume(); }
      else { showView('view-home'); renderHomeStats(); if (Core.loadSettings().bgm) AudioMgr.playMusic('home'); }
    };

    // 商店返回
    $('btn-shop-back').onclick = function () {
      if (navReturn === 'gameover') { showView('view-game'); }
      else { showView('view-home'); renderHomeStats(); if (Core.loadSettings().bgm) AudioMgr.playMusic('home'); }
    };

    // 排行榜返回
    $('btn-rank-back').onclick = function () {
      if (navReturn === 'gameover') { showView('view-game'); }
      else { showView('view-home'); renderHomeStats(); if (Core.loadSettings().bgm) AudioMgr.playMusic('home'); }
    };

    // 商店购买
    var buys = document.querySelectorAll('.upgrade-card .buy');
    for (var b = 0; b < buys.length; b++) {
      buys[b].onclick = function () { buy(this.getAttribute('data-key')); };
    }

    // BGM 快捷开关（首页 + 游戏页）
    $('btn-sound-home').onclick = toggleBgm;
    $('btn-sound-game').onclick = toggleBgm;

    // 游戏内顶部按钮
    $('btn-pause').onclick = function () {
      Game.pause();
      $('pause-overlay').hidden = false;
    };

    // 暂停遮罩
    $('btn-resume').onclick = function () {
      $('pause-overlay').hidden = true;
      Game.resume();
    };
    $('btn-end-run').onclick = function () {
      $('pause-overlay').hidden = true;
      Game.endRun();
    };
    $('btn-pause-settings').onclick = function () {
      $('pause-overlay').hidden = true;
      navReturn = 'game';
      showView('view-settings');
      loadSettingsUI();
    };
    $('btn-pause-home').onclick = function () {
      $('pause-overlay').hidden = true;
      goHome();
    };

    // 结算
    $('btn-again').onclick = function () {
      $('over-overlay').hidden = true;
      Game.startRun();
      enterGame();
      showGameHint();
    };
    $('btn-over-shop').onclick = function () {
      navReturn = 'gameover';
      showView('view-shop');
      renderShop();
    };
    $('btn-over-rank').onclick = function () {
      navReturn = 'gameover';
      showView('view-rank');
      renderRank();
    };
    $('btn-over-home').onclick = function () {
      $('over-overlay').hidden = true;
      goHome();
    };
  }

  /* ========================================================================
   * 启动
   * ====================================================================== */
  function boot() {
    AudioMgr.setEnabled(Core.loadSettings().bgm);
    Game.setHudEls({
      score: $('hud-score'), progress: $('hud-progress'), time: $('hud-time'), wave: $('hud-wave'), hp: $('hud-hp'),
      bombs: $('hud-bombs'), p1: $('hud-p1'), p2: $('hud-p2'), p3: $('hud-p3')
    });
    Game.init($('game'), $('game-wrap'));
    bindSettings();
    bindTabs();
    bindButtons();
    updateSoundBtns();
    renderHomeStats();

    // 启动后优先从 B站 云存储拉取持久化数据（云优先，本地兜底），完成后刷新界面
    ensureSDK(function () {
      Core.syncFromCloud(function () {
        renderHomeStats();
        loadSettingsUI();
        Game.refreshSettings();
      });
    });

    // 首次用户交互后再尝试播放首页音乐（浏览器自动播放限制）
    var firstDone = false;
    function firstGesture() {
      if (firstDone) return;
      firstDone = true;
      if (curView === 'view-home' && Core.loadSettings().bgm) AudioMgr.playMusic('home');
    }
    document.addEventListener('pointerdown', firstGesture, { once: true });
    document.addEventListener('keydown', firstGesture, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // 暴露给 Game 调用的接口
  root.UI = {
    showGameOver: showGameOver,
    requestPause: function () {
      if (Game.getState() === 'playing') { Game.pause(); $('pause-overlay').hidden = false; }
    }
  };
})(typeof self !== 'undefined' ? self : this);
