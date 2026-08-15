/**
 * audio.js —— 声音管理
 *
 * 素材位于 sound/：
 *   bgm.wav          游戏 BGM（PCM，浏览器可播）
 *   home.wav         首页 BGM（IMA ADPCM，浏览器多不支持 -> 失败时回退 bgm.wav）
 *   bomb.wav         炸弹音效（PCM）
 *   enemyExplode.wav 敌机爆炸音效（PCM）
 *   boss.wav         BOSS 登场音效（IMA ADPCM -> 失败时回退 enemyExplode.wav）
 *
 * 所有声音受设置中的 BGM 开关统一控制（打开播放，关闭静音）。
 * 任何播放失败都会被捕获并静默忽略，不影响游戏运行。
 */
(function (root) {
  'use strict';

  var enabled = true;          // 是否开启声音
  var suspended = false;       // 暂停挂起：为 true 时忽略所有播放请求
  var bgmEl = null;            // 游戏 BGM
  var homeEl = null;           // 首页 BGM
  var current = null;          // 当前正在播放的 BGM 元素（游戏/首页二选一）
  var currentKind = null;      // 当前 BGM 类型（'home' | 'game'）
  var sfx = {};                // 音效缓存 name -> HTMLAudioElement
  var explodeLock = 0;         // 爆炸音效节流时间戳（敌机常成群爆炸）

  function makeEl(src) {
    try {
      var a = new Audio(src);
      a.preload = 'auto';
      return a;
    } catch (e) { return null; }
  }

  // 处理播放失败的静默吞掉（Promise 与旧浏览器事件都覆盖）
  function safePlay(el) {
    if (!el) return;
    try {
      var p = el.play();
      if (p && typeof p.catch === 'function') p.catch(function () { /* 忽略 */ });
    } catch (e) { /* 忽略 */ }
  }

  function stopBgm() {
    if (bgmEl) { try { bgmEl.pause(); bgmEl.currentTime = 0; } catch (e) { /* 忽略 */ } }
    if (homeEl) { try { homeEl.pause(); homeEl.currentTime = 0; } catch (e) { /* 忽略 */ } }
    current = null;
    currentKind = null;
  }

  function setEnabled(on) {
    enabled = !!on;
    if (!enabled) stopBgm();
  }
  function isEnabled() { return enabled; }

  // 暂停挂起：暂停期间忽略一切音乐/音效，保证静音
  function setSuspended(on) {
    suspended = !!on;
    if (suspended) stopBgm();
  }
  function isSuspended() { return suspended; }

  /**
   * 播放背景音乐，kind 为 'game' | 'home'。
   * home.wav 为 ADPCM 编码，浏览器可能无法解码，出错时自动回退到 bgm.wav。
   */
  function playMusic(kind) {
    if (suspended) return;   // 暂停挂起：不播放
    // 同类型 BGM 且仍在播放时不重启，避免首页子页面切换时音乐从头跳
    if (currentKind === kind && current && !current.paused && !current.ended) return;
    stopBgm();
    currentKind = kind;
    if (!enabled) return;
    if (kind === 'home') {
      if (!homeEl) {
        homeEl = makeEl('sound/home.wav');
        if (homeEl) {
          homeEl.loop = true;
          homeEl.onerror = function () {
            // 解码失败：用游戏 BGM 顶上，并立即尝试播放，保证首页有音乐
            try {
              homeEl = makeEl('sound/bgm.wav');
              if (homeEl) { homeEl.loop = true; current = homeEl; safePlay(homeEl); }
            } catch (e) { /* 忽略 */ }
          };
        }
      }
      current = homeEl;
    } else {
      if (!bgmEl) { bgmEl = makeEl('sound/bgm.wav'); if (bgmEl) bgmEl.loop = true; }
      current = bgmEl;
    }
    safePlay(current);
  }

  /**
   * 播放一次性音效。name 形如 'bomb'、'enemyExplode'、'boss'。
   * 爆炸音效做 60ms 节流，避免成片敌机爆炸时声音重叠爆音。
   */
  function playSfx(name) {
    if (suspended || !enabled) return;   // 暂停挂起或关闭时静音
    if (name === 'enemyExplode') {
      var now = Date.now();
      if (now - explodeLock < 60) return;
      explodeLock = now;
    }
    var src;
    if (name === 'boss') {
      // boss.wav 为 ADPCM，解码失败回退到爆炸音
      src = sfx[name];
      if (!src) {
        src = makeEl('sound/boss.wav');
        if (src) src.onerror = function () { try { sfx[name] = makeEl('sound/enemyExplode.wav'); } catch (e) { /* 忽略 */ } };
        sfx[name] = src;
      }
    } else {
      src = sfx[name] || (sfx[name] = makeEl('sound/' + name + '.wav'));
    }
    if (!src) return;
    try { src.currentTime = 0; } catch (e) { /* 忽略 */ }
    safePlay(src);
  }

  root.AudioMgr = {
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    setSuspended: setSuspended,
    isSuspended: isSuspended,
    playMusic: playMusic,
    playSfx: playSfx,
    stopBgm: stopBgm
  };
})(typeof self !== 'undefined' ? self : this);
