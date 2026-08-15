/* ==================== 界面渲染与交互 ==================== */

let rankSource = 'local'; // local | global
let rankTab = '1';        // 等级榜 1 / 层数榜 2
let rankPeriod = 'all';   // day | week | month | all
let rankLoadSeq = 0;      // 防旧请求覆盖新选择
let saveMode = 'save';
let toastTimer = null;
let awaitingFollow = false; // 是否正在等待跳转关注后返回
let pendingConfirm = null;   // 待确认回调（替代 window.confirm）

/* ---------- 通用 ---------- */
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function pct(v, max) { return Math.max(0, Math.min(100, Math.round(v / max * 100))); }
/* 大数缩写：≥1亿 显示为 XX万；≥1万亿 显示为 XX亿 */
function fmtBig(n) {
  n = Math.floor(n || 0);
  if (n >= 1e12) return Math.floor(n / 1e8) + '亿';
  if (n >= 1e8) return Math.floor(n / 1e4) + '万';
  return '' + n;
}
function fmtTime(ts) {
  const d = new Date(ts);
  const p2 = n => (n < 10 ? '0' : '') + n;
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
}
function floorTypeName(t) { return t === 'battle' ? '战斗' : (t === 'shop' ? '商城' : '事件'); }

function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

function pauseBattle() { clearBattleTimer(); }

/* ---------- 模态框 ---------- */
function openModal(html) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = '<div class="modal-backdrop"></div><div class="modal-box">' + html + '</div>';
  root.classList.add('open');
  pauseBattle();
}
function closeModal() {
  const root = document.getElementById('modalRoot');
  if (replayTimer) { clearTimeout(replayTimer); replayTimer = null; } // 关闭时停止死亡回放
  root.classList.remove('open');
  root.innerHTML = '';
  if (G.state === 'battle' && !G.idle) startBattleAuto(); // 挂机模式由 idleTick 驱动，避免计时器冲突
}

/* ---------- 主渲染 ---------- */
function uiRender() {
  renderTop();
  renderStatus();
  const scene = document.getElementById('scene');
  switch (G.state) {
    case 'menu': scene.innerHTML = menuHTML(); break;
    case 'battle': scene.innerHTML = battleHTML(); logRendered = 0; appendLogUI(); break;
    case 'victory': scene.innerHTML = victoryHTML(); break;
    case 'shop': scene.innerHTML = shopHTML(); break;
    case 'event': scene.innerHTML = eventHTML(); break;
    case 'eventResult': scene.innerHTML = eventResultHTML(); break;
    case 'egg': scene.innerHTML = eggHTML(); break;
    case 'gameover': scene.innerHTML = gameOverHTML(); break;
  }
}

function renderTop() {
  const info = document.getElementById('floorInfo');
  if (G.player && G.state !== 'menu') info.textContent = '第 ' + G.floor + ' 层 · ' + floorTypeName(G.floorType);
  else info.textContent = '';
  updateIdleButton();
}

function updateIdleButton() {
  const b = document.getElementById('btnIdle');
  if (b) b.textContent = G.idle ? '退出挂机' : '挂机';
}

function renderStatus() {
  const bar = document.getElementById('statusbar');
  if (!G.player || G.state === 'menu') {
    bar.innerHTML = G.state === 'menu' ? '<div class="menu-hint">踏上高塔，书写你的传说</div>' : '';
    return;
  }
  const p = G.player;
  bar.innerHTML =
    '<div class="st-row">' +
      '<span class="st-lv">Lv.' + p.level + '</span>' +
      '<div class="bar exp"><i style="width:' + Math.min(100, Math.round(p.exp / expNeeded(p.level) * 100)) + '%"></i><span class="bar-label">' + fmtBig(p.exp) + ' / ' + fmtBig(expNeeded(p.level)) + '</span></div>' +
      '<div class="bar hp"><i style="width:' + pct(p.hp, p.maxHp) + '%"></i></div>' +
      '<span class="st-hp">' + fmtBig(p.hp) + '/' + fmtBig(p.maxHp) + '</span>' +
    '</div>' +
    '<div class="st-row stats">' +
      '<span>攻 <b>' + fmtBig(p.atk) + '</b></span>' +
      '<span>防 <b>' + fmtBig(p.def) + '</b></span>' +
      '<span>敏 <b>' + fmtBig(p.agi) + '</b></span>' +
      '<span>运 <b>' + fmtBig(p.luck) + '</b></span>' +
      '<span>金 <b>' + fmtBig(p.gold) + '</b></span>' +
      (G.lives > 0 ? '<span class="lives">命 <b>x' + G.lives + '</b></span>' : '') +
    '</div>' +
    '<div class="st-row btns">' +
      '<button class="btn" data-act="save">存档</button>' +
      '<button class="btn" data-act="load">读档</button>' +
      '<button class="btn" data-act="menu">主菜单</button>' +
    '</div>';
}

function refreshStatusBars() {
  const p = G.player; if (!p) return;
  const hpBar = document.querySelector('#statusbar .bar.hp i');
  const hpTxt = document.querySelector('#statusbar .st-hp');
  if (hpBar && hpTxt) { hpBar.style.width = pct(p.hp, p.maxHp) + '%'; hpTxt.textContent = fmtBig(p.hp) + '/' + fmtBig(p.maxHp); }
  const expBar = document.querySelector('#statusbar .bar.exp i');
  if (expBar) expBar.style.width = Math.min(100, Math.round(p.exp / expNeeded(p.level) * 100)) + '%';
  const expLabel = document.querySelector('#statusbar .bar.exp .bar-label');
  if (expLabel) expLabel.textContent = fmtBig(p.exp) + ' / ' + fmtBig(expNeeded(p.level));
}

/* ---------- 菜单 ---------- */
function menuHTML() {
  const auto = autoInfo(); // 只保留「继续冒险」：读取最近的自动存档进度
  return '<div class="menu">' +
    '<h1>无尽魔塔</h1>' +
    '<p class="sub">每上一层，都是新的命运。你只有一次机会。</p>' +
    '<div class="best">历史最佳：第 ' + bestFloor() + ' 层 · Lv.' + bestLevel() + '</div>' +
    '<div class="ulv ' + userLevelColorClass(userState.level) + '">用户 Lv.' + userState.level + ' · 经验 ' + fmtBig(userState.xp) + '/' + fmtBig(userXpNeeded(userState.level)) + '</div>' +
    '<button class="btn primary" data-act="newgame">开始新旅程</button>' +
    (auto ? '<button class="btn" data-act="resume">继续冒险（第 ' + auto.floor + ' 层）</button>' : '') +
    '<button class="btn" data-act="load">读取存档</button>' +
    '<button class="btn" data-act="rank">排行榜</button>' +
    '<button class="btn" data-act="help">玩法说明</button>' +
    '</div>';
}

/* ---------- 战斗 ---------- */
function battleHTML() {
  const p = G.player, e = G.enemy;
  return '<div class="panel battle">' +
    '<div class="b-top">' +
      '<div class="unit u-play">' +
        '<div class="u-name">你 <span class="lvl">Lv.' + p.level + '</span></div>' +
        '<div class="bar hp"><i style="width:' + pct(p.hp, p.maxHp) + '%"></i></div>' +
        '<div class="u-stats">攻 ' + fmtBig(p.atk) + ' · 防 ' + fmtBig(p.def) + '<br>敏 ' + fmtBig(p.agi) + ' · 运 ' + fmtBig(p.luck) + ' · 生命 ' + fmtBig(p.hp) + '/' + fmtBig(p.maxHp) + '</div>' +
      '</div>' +
      '<div class="vs">VS</div>' +
      '<div class="unit u-enemy">' +
        '<div class="u-name"><span class="tier">' + e.tier + '</span>' + esc(e.name) + ' <span class="lvl">' + e.floor + '层</span></div>' +
        '<div class="bar hp enemy"><i style="width:' + pct(e.hp, e.maxHp) + '%"></i></div>' +
        '<div class="u-stats">攻 ' + fmtBig(e.atk) + ' · 防 ' + fmtBig(e.def) + ' · 敏 ' + fmtBig(e.agi) + ' · 运 ' + fmtBig(e.luck) + ' · 生命 ' + fmtBig(e.hp) + '/' + fmtBig(e.maxHp) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="b-log" id="battleLog"></div>' +
    '<button class="btn primary" data-act="skip">跳过战斗</button>' +
    '</div>';
}

function appendLogUI() {
  const box = document.getElementById('battleLog');
  if (box) {
    while (logRendered < battleLog.length) {
      const l = battleLog[logRendered++];
      const div = document.createElement('div');
      div.className = l.cls || '';
      div.textContent = l.text;
      box.appendChild(div);
    }
    box.scrollTop = box.scrollHeight;
  }
  const pw = document.querySelector('#scene .u-play .bar i');
  const ew = document.querySelector('#scene .u-enemy .bar i');
  const p = G.player, e = G.enemy;
  if (pw) pw.style.width = pct(p.hp, p.maxHp) + '%';
  if (ew) ew.style.width = pct(e.hp, e.maxHp) + '%';
  refreshStatusBars();
}

function uiTickBattle() {
  if (document.getElementById('battleLog')) appendLogUI();
  else uiRender();
}

/* ---------- 胜利 ---------- */
function victoryHTML() {
  const v = G.victory;
  const e = G.enemy;
  return '<div class="panel victory">' +
    '<h2>胜利！</h2>' +
    (e ? '<div class="defeated">' +
      '<div class="d-name"><span class="tier">' + e.tier + '</span>' + esc(e.name) + '</div>' +
      '<div class="d-meta">品质：' + e.tier + ' · 等级 Lv.' + e.level + ' · 第 ' + e.floor + ' 层</div>' +
      '<div class="d-stats">攻 ' + fmtBig(e.atk) + ' · 防 ' + fmtBig(e.def) + ' · 敏 ' + fmtBig(e.agi) + ' · 运 ' + fmtBig(e.luck) + ' · 生命 ' + fmtBig(e.maxHp) + '</div>' +
    '</div>' : '') +
    '<p>获得经验 <b style="color:var(--exp)">+' + fmtBig(v.exp) + '</b>，金币 <b style="color:var(--gold)">+' + fmtBig(v.gold) + '</b></p>' +
    (v.leveled ? '<div class="lvup">' +
      '<p class="lvup-title">' + (v.gains && v.gains.count > 1 ? '连续升级 ×' + v.gains.count + '！' : '等级提升！') + ' Lv.' + v.newLevel + '，生命全满</p>' +
      (v.gains && v.gains.count ? '<p class="lvup-gains">' + gainsList(v.gains) + '</p>' : '') +
      '</div>' : '') +
    (v.bonuses && v.bonuses.length ? '<div class="bonus-list">' + v.bonuses.map(function (b) { return '<p class="bonus">' + b + '</p>'; }).join('') + '</div>' : '') +
    '<button class="btn primary" data-act="next">继续攀登 → 第 ' + (G.floor + 1) + ' 层</button>' +
    '</div>';
}

function gainsList(g) {
  const parts = [];
  if (g.atk) parts.push('攻击 +' + fmtBig(g.atk));
  if (g.def) parts.push('防御 +' + fmtBig(g.def));
  if (g.agi) parts.push('敏捷 +' + fmtBig(g.agi));
  if (g.luck) parts.push('幸运 +' + fmtBig(g.luck));
  return parts.join(' · ');
}

/* ---------- 商店 ---------- */
function shopHTML() {
  const items = shopItems(G.floor);
  return '<div class="panel shop">' +
    '<div class="shop-head">' +
      '<h2>神秘商店</h2>' +
      '<button class="btn close" data-act="next" aria-label="退出商店">×</button>' +
    '</div>' +
    '<div class="shop-gold">当前金币：' + G.player.gold + '</div>' +
    '<div class="shop-list">' + items.map(shopItemHTML).join('') + '</div>' +
    '</div>';
}

function shopItemHTML(it) {
  const p = G.player;
  const qty = shopState[it.id] || 0;
  const maxQ = itemMaxQ(it, p);
  const total = qty * it.price;
  const canBuy = qty > 0 && total > 0 && p.gold >= total;
  return '<div class="shop-item" data-id="' + it.id + '">' +
    '<div class="si-head"><span class="si-name">' + it.name + '</span><span class="si-price">' + it.price + ' 金币</span></div>' +
    (it.single ? '' :
      '<div class="si-qty">' +
        '<button class="q-btn" data-qop="dec">−</button>' +
        '<input class="q-input" type="number" min="0" max="' + maxQ + '" value="' + qty + '" data-input>' +
        '<button class="q-btn" data-qop="inc">＋</button>' +
        '<input class="q-range" type="range" min="0" max="' + Math.max(0, maxQ) + '" value="' + qty + '" data-range>' +
      '</div>') +
    '<div class="si-actions">' +
      '<span class="si-total">' + (it.single ? ('花费 ' + it.price + ' 金币') : (qty + ' 份 · 共 ' + total + ' 金币')) + '</span>' +
      '<button class="btn primary" data-act="buy" ' + (canBuy ? '' : 'disabled') + '>购买</button>' +
    '</div>' +
    '</div>';
}

function renderShopList() {
  const list = document.querySelector('.shop-list');
  if (!list) return;
  const items = shopItems(G.floor);
  list.innerHTML = items.map(shopItemHTML).join('');
  const goldEl = document.querySelector('.shop-gold');
  if (goldEl) goldEl.textContent = '当前金币：' + G.player.gold;
}

function qtyOp(id, op) {
  const it = shopItems(G.floor).find(x => x.id === id);
  if (!it || it.single) return;
  const maxQ = itemMaxQ(it, G.player);
  let q = shopState[id] || 0;
  q = op === 'inc' ? Math.min(q + 1, maxQ, 99) : Math.max(0, q - 1);
  shopState[id] = q;
  renderShopList();
}

/* ---------- 事件 ---------- */
function eventHTML() {
  const ev = G.lastEvent || pickEvent();
  G.lastEvent = ev;
  return '<div class="panel event">' +
    '<h2>' + esc(ev.title) + '</h2>' +
    '<p class="ev-desc">' + esc(ev.desc) + '</p>' +
    '<div class="ev-choices">' +
    ev.choices.map((c, i) => '<button class="btn" data-act="choice" data-i="' + i + '">' + esc(c.text) + '</button>').join('') +
    '</div></div>';
}

function eventResultHTML() {
  const ev = G.lastEvent;
  return '<div class="panel event">' +
    '<h2>' + (ev ? esc(ev.title) : '事件') + '</h2>' +
    '<p class="ev-out">' + esc(G.lastOutcome) + '</p>' +
    '<button class="btn primary" data-act="next">继续攀登 → 第 ' + (G.floor + 1) + ' 层</button>' +
    '</div>';
}

/* 彩蛋层：抵达特定层数概率触发，无需选择，直接展示文字与结果 */
function eggHTML() {
  const e = G.egg || { text: '', result: '' };
  return '<div class="panel over egg">' +
    '<h2>彩蛋 · 第 ' + G.floor + ' 层</h2>' +
    '<p class="egg-text">' + esc(e.text) + '</p>' +
    '<p class="egg-result">' + esc(e.result) + '</p>' +
    '<button class="btn primary" data-act="next">继续前进 → 第 ' + (G.floor + 1) + ' 层</button>' +
    '</div>';
}

/* ---------- 游戏结束（normal / follow 两种形态） ---------- */
function gameOverHTML() {
  if (G.goMode === 'follow') return followGameOverHTML();
  return normalGameOverHTML();
}

function overStatsHTML() {
  const p = G.player;
  return '<div class="over-stats">' +
    '<div><span>到达层数</span><b>' + G.floor + '</b></div>' +
    '<div><span>最终等级</span><b>Lv.' + p.level + '</b></div>' +
    '<div><span>击败怪物</span><b>' + G.kills + '</b></div>' +
    '<div><span>累计金币</span><b>' + G.goldEarned + '</b></div>' +
    '<div><span>历史最佳</span><b>第 ' + bestFloor() + ' 层 · Lv.' + bestLevel() + '</b></div>' +
    '</div>';
}

function killerHTML() {
  const e = G.enemy;
  if (!e) return '';
  return '<div class="defeated killer">' +
    '<div class="d-name"><span class="tier">' + e.tier + '</span>' + esc(e.name) + '</div>' +
    '<div class="d-meta">击败了你 · 等级 Lv.' + e.level + ' · 第 ' + e.floor + ' 层</div>' +
    '<div class="d-stats">攻 ' + fmtBig(e.atk) + ' · 防 ' + fmtBig(e.def) + ' · 敏 ' + fmtBig(e.agi) + ' · 运 ' + fmtBig(e.luck) + ' · 生命 ' + fmtBig(e.maxHp) + '</div>' +
    '</div>';
}

function userLvUpHTML() {
  if (!G.userLvUps) return '';
  return '<p class="ulv-up ' + userLevelColorClass(userState.level) + '">用户等级提升！Lv.' + userState.level + '（本次 +' + G.userLvUps + ' 级）</p>';
}

function normalGameOverHTML() {
  return '<div class="panel over">' +
    '<h2>游戏结束</h2>' +
    '<p>你倒在了第 ' + G.floor + ' 层，塔顶依旧遥不可及……</p>' +
    killerHTML() +
    overStatsHTML() +
    userLvUpHTML() +
    '<button class="btn" data-act="replay">死亡回放</button>' +
    '<button class="btn primary" data-act="newgame">再次挑战</button>' +
    '<button class="btn" data-act="menu">返回主菜单</button>' +
    '</div>';
}

/* 关注复活引导：未关注时展示，跳转作者主页关注后可复活并获得 3 条命 */
function followGameOverHTML() {
  return '<div class="panel over">' +
    '<h2>游戏结束</h2>' +
    '<p>你倒在了第 ' + G.floor + ' 层……</p>' +
    killerHTML() +
    overStatsHTML() +
    userLvUpHTML() +
    '<button class="btn" data-act="replay">死亡回放</button>' +
    '<p class="follow-tip">关注作者即可原地复活，并获得 <b>3 条命</b> 继续攀爬！</p>' +
    '<button class="btn primary" data-act="follow">去关注作者（复活 +3 命）</button>' +
    '<button class="btn" data-act="recheck">我已关注，检查</button>' +
    '<button class="btn" data-act="newgame">直接开始下一局</button>' +
    '<button class="btn" data-act="menu">返回主菜单</button>' +
    '</div>';
}

function followAuthor() {
  if (!toySdkReady()) return;
  awaitingFollow = true;
  setPendingRevive(serializeGame()); // 跳转前持久化当前局，返回后重新检测
  toast('正在跳转作者主页，关注后返回即可复活');
  openAuthorHome().catch(function (e) {
    console.warn('[ToySDK] navigate 失败', e);
    awaitingFollow = false;
    toast('跳转失败，请重试');
  });
}

function recheckFollow() {
  getFollowState().then(function (following) {
    if (following) { clearPendingRevive(); grantRevive(); }
    else toast('尚未检测到关注，请先关注作者');
  });
}

/* 从关注主页返回 / 页面重新加载后，重新检测关注状态 */
function checkPendingRevive() {
  const pr = getPendingRevive();
  if (!pr || !pr.save) return;
  canUseFollow().then(function (ok) {
    if (!ok) { clearPendingRevive(); return; } // 非 B站 环境，忽略
    getFollowState().then(function (following) {
      if (following) { clearPendingRevive(); restoreRunToRevive(pr.save, false); }
      else restoreRunToRevive(pr.save, true); // 恢复该局并再次展示关注引导
    });
  });
}

/* ---------- 存档 / 读档模态框 ---------- */
function openSaveLoad(mode) {
  saveMode = mode;
  openModal(saveModalHTML(mode));
}

function saveModalHTML(mode) {
  const rows = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const info = slotInfo(i);
    rows.push(
      '<div class="slot ' + (info ? 'has' : '') + '">' +
        '<div class="slot-info">' +
          '<span>' + (info ? ('第 ' + info.floor + ' 层 · Lv.' + info.level) : ('空存档位 ' + (i + 1))) + '</span>' +
          (info ? '<span class="slot-time">' + fmtTime(info.ts) + ' · ' + info.hp + '/' + info.maxHp + ' HP</span>' : '') +
        '</div>' +
        '<div class="slot-actions">' +
          '<button class="btn" data-slot="' + i + '" data-op="' + (mode === 'save' ? 'save' : 'load') + '">' + (mode === 'save' ? '保存' : '读取') + '</button>' +
          (info ? '<button class="btn danger" data-slot="' + i + '" data-op="del">删除</button>' : '') +
        '</div>' +
      '</div>');
  }
  return '<h3>' + (mode === 'save' ? '保存存档' : '读取存档') + '</h3>' +
    '<div class="slot-list">' + rows.join('') + '</div>' +
    '<button class="btn" data-act="close">关闭</button>';
}

function refreshSaveModal() {
  const box = document.querySelector('#modalRoot .modal-box');
  if (box) openModal(saveModalHTML(saveMode));
}

function slotAction(i, op) {
  if (op === 'save') {
    if (slotInfo(i)) {
      confirmDialog('存档 ' + (i + 1) + ' 已有内容，是否覆盖？', function () { saveSlot(i); refreshSaveModal(); });
    } else {
      saveSlot(i);
      refreshSaveModal();
    }
  } else if (op === 'load') {
    if (!loadSlotData(i)) { toast('该存档位为空'); return; }
    if (G.state !== 'menu') {
      confirmDialog('读取存档将放弃当前进度，确定？', function () { closeModal(); loadSlot(i); });
    } else {
      closeModal();
      loadSlot(i);
    }
  } else if (op === 'del') {
    deleteSlot(i);
    refreshSaveModal();
  }
}

/* ---------- 排行榜（本地榜 / 全站榜） ---------- */
function openRank() {
  openModal(rankModalHTML());
  updateRankTabsState();
  loadRank();
}

function rankModalHTML() {
  return '<h3>排行榜</h3>' +
    '<div class="rank-source">' +
      '<button class="btn small ' + (rankSource === 'local' ? 'active' : '') + '" data-source="local">本地榜</button>' +
      '<button class="btn small ' + (rankSource === 'global' ? 'active' : '') + '" data-source="global">全站榜</button>' +
    '</div>' +
    '<div class="rank-tabs">' +
      '<button class="btn small ' + (rankTab === '1' ? 'active' : '') + '" data-tab="1">等级榜</button>' +
      '<button class="btn small ' + (rankTab === '2' ? 'active' : '') + '" data-tab="2">层数榜</button>' +
      '<button class="btn small ' + (rankTab === '3' ? 'active' : '') + '" data-tab="3">用户等级榜</button>' +
    '</div>' +
    '<div class="rank-periods">' +
      '<button class="btn small ' + (rankPeriod === 'day' ? 'active' : '') + '" data-period="day">日榜</button>' +
      '<button class="btn small ' + (rankPeriod === 'week' ? 'active' : '') + '" data-period="week">周榜</button>' +
      '<button class="btn small ' + (rankPeriod === 'month' ? 'active' : '') + '" data-period="month">月榜</button>' +
      '<button class="btn small ' + (rankPeriod === 'all' ? 'active' : '') + '" data-period="all">总榜</button>' +
    '</div>' +
    '<div class="rank-list"><p class="loading">加载中…</p></div>' +
    '<button class="btn" data-act="close">关闭</button>';
}

function updateRankTabsState() {
  const srcs = document.querySelectorAll('[data-source]');
  srcs.forEach(b => b.classList.toggle('active', b.dataset.source === rankSource));
  const tabs = document.querySelectorAll('.rank-tabs button');
  tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === rankTab));
  const periods = document.querySelector('.rank-periods');
  if (periods) {
    periods.style.display = rankSource === 'global' ? '' : 'none';
    periods.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.period === rankPeriod));
  }
}

async function loadRank() {
  const seq = ++rankLoadSeq;
  const listEl = document.querySelector('.rank-list');
  if (listEl) listEl.innerHTML = '<p class="loading">加载中…</p>';
  const board = rankTab === '1' ? BOARD_LEVEL : (rankTab === '2' ? BOARD_FLOOR : BOARD_USER);
  let list = null, mine = null;
  if (rankSource === 'local') {
    list = localRank(board);
  } else {
    const [g, m] = await Promise.all([
      fetchGlobalRank(board, rankPeriod),
      fetchGlobalMyRank(board, rankPeriod)
    ]);
    list = g; mine = m;
  }
  const box = document.querySelector('.rank-list');
  if (box && seq === rankLoadSeq) box.innerHTML = rankListHTML(list, mine, rankSource);
}

function switchRankSource(source) { rankSource = source; updateRankTabsState(); loadRank(); }
function switchRankTab(tab) { rankTab = tab; updateRankTabsState(); loadRank(); }
function switchRankPeriod(period) { rankPeriod = period; updateRankTabsState(); loadRank(); }

function rankListHTML(list, mine, source) {
  if (source === 'global' && list === null) return '<p class="empty">全站榜需在 B站 App / Web 环境中查看</p>';
  if (!list || !list.length) return '<p class="empty">暂无上榜数据，先去爬塔吧</p>';
  const rows = list.map(it => {
    let avatar = '';
    if (it.avatar) {
      const src = it.avatar.indexOf('http') === 0 ? it.avatar : 'https:' + it.avatar;
      avatar = '<img class="rk-avatar" src="' + esc(src) + '" alt="" onerror="this.style.display=\'none\'">';
    }
    return '<div class="rk-row top' + (it.rank <= 3 ? it.rank : 0) + (mine && mine.rank === it.rank ? ' mine' : '') + '">' +
      '<span class="rk-rank">' + it.rank + '</span>' + avatar +
      '<span class="rk-name">' + esc(it.nickname || '匿名') + '</span>' +
      '<span class="rk-score">' + it.score + '</span>' +
      '</div>';
  }).join('');
  const mineHtml = (source === 'global' && mine) ? '<div class="rk-mine">我的排名：第 ' + mine.rank + ' 名 · ' + mine.score + ' 分</div>' : '';
  return mineHtml + rows;
}

/* ---------- 设置（战斗速度 + 挂机属性分配） ---------- */
function openSettings() {
  openModal(settingsHTML()); // openModal 内部已暂停战斗
}

function settingsHTML() {
  const alloc = G.idleAlloc || { atk: 4, def: 3, agi: 2, luck: 1 };
  const total = alloc.atk + alloc.def + alloc.agi + alloc.luck;
  return '<h3>设置</h3>' +
    '<h4>战斗速度</h4>' +
    '<div class="speed-opts">' +
      [1, 2, 3, 4, 5].map(s => '<button class="btn small ' + (G.speed === s ? 'active' : '') + '" data-speed="' + s + '">×' + s + '</button>').join('') +
    '</div>' +
    '<h4>挂机属性分配</h4>' +
    allocRow('atk', '攻击', alloc.atk, total) +
    allocRow('def', '防御', alloc.def, total) +
    allocRow('agi', '敏捷', alloc.agi, total) +
    allocRow('luck', '幸运', alloc.luck, total) +
    '<div class="alloc-total">已分配 ' + total + '/10（挂机商城按此比例购买，以 10 次为单位）</div>' +
    '<h4>挂机速度</h4>' +
    '<div class="alloc-row">' +
      '<span class="alloc-name">间隔</span>' +
      '<input type="range" min="10" max="1000" step="10" value="' + (G.idleSpeed || 200) + '" data-idlespeed class="slider">' +
      '<span class="alloc-val" id="idlespeed-val">' + (G.idleSpeed || 200) + 'ms</span>' +
    '</div>' +
    '<div class="alloc-total">楼层操作间隔（购买仍固定 10ms）</div>' +
    '<h4>死亡后退出挂机</h4>' +
    '<div class="speed-opts">' +
      '<button class="btn small ' + (G.exitIdleOnDeath ? 'active' : '') + '" data-act="toggleExitIdle">' + (G.exitIdleOnDeath ? '开启' : '关闭') + '</button>' +
    '</div>' +
    '<div class="alloc-total">开启后，每次死亡（含复活后的再次死亡）都会自动退出挂机</div>' +
    '<button class="btn" data-act="close">关闭</button>';
}

function setIdleSpeed(v) {
  G.idleSpeed = clamp(Math.round(v), 10, 1000);
  const el = document.getElementById('idlespeed-val');
  if (el) el.textContent = G.idleSpeed + 'ms';
  saveSettings();
}

/* 每项独立 +/−（共用 10 点池，点满后需先减再加，绝不牵连其他项） */
function allocRow(key, name, val, total) {
  return '<div class="alloc-row">' +
    '<span class="alloc-name">' + name + '</span>' +
    '<button class="alloc-btn" data-allocop="dec" data-alloc="' + key + '" ' + (val <= 0 ? 'disabled' : '') + '>−</button>' +
    '<span class="alloc-val" id="alloc-' + key + '">' + val + '</span>' +
    '<button class="alloc-btn" data-allocop="inc" data-alloc="' + key + '" ' + (total >= 10 ? 'disabled' : '') + '>＋</button>' +
    '</div>';
}

/* 分配调整：只改被点的这一项，点池满时 + 被禁用 */
function setIdleAlloc(key, delta) {
  const alloc = G.idleAlloc || (G.idleAlloc = { atk: 4, def: 3, agi: 2, luck: 1 });
  const total = alloc.atk + alloc.def + alloc.agi + alloc.luck;
  const nv = alloc[key] + delta;
  if (nv < 0 || nv > 10) return;
  if (delta > 0 && total >= 10) return; // 已分配满 10 点
  alloc[key] = nv;
  saveSettings();
  updateAllocUI();
}

function updateAllocUI() {
  const alloc = G.idleAlloc;
  const total = alloc.atk + alloc.def + alloc.agi + alloc.luck;
  ['atk', 'def', 'agi', 'luck'].forEach(k => {
    const vEl = document.getElementById('alloc-' + k);
    if (vEl) vEl.textContent = alloc[k];
    const row = vEl ? vEl.closest('.alloc-row') : null;
    if (row) {
      const inc = row.querySelector('[data-allocop="inc"]');
      const dec = row.querySelector('[data-allocop="dec"]');
      if (inc) inc.disabled = alloc[k] >= 10 || total >= 10;
      if (dec) dec.disabled = alloc[k] <= 0;
    }
  });
  const totalEl = document.querySelector('.alloc-total');
  if (totalEl) totalEl.textContent = '已分配 ' + total + '/10（挂机商城按此比例购买，以 10 次为单位）';
}

function setBattleSpeed(s) {
  G.speed = clamp(s, 1, 5);
  saveSettings();
  if (G.state === 'battle') { clearBattleTimer(); startBattleAuto(); }
  const box = document.querySelector('#modalRoot .modal-box');
  if (box) openModal(settingsHTML());
}

function saveSettings() {
  try {
    localStorage.setItem('tower_settings', JSON.stringify({ speed: G.speed, idleSpeed: G.idleSpeed, alloc: G.idleAlloc, exitIdleOnDeath: G.exitIdleOnDeath }));
  } catch (e) {}
}

function loadSettings() {
  try {
    const d = JSON.parse(localStorage.getItem('tower_settings') || 'null');
    if (d) {
      if (d.speed >= 1 && d.speed <= 5) G.speed = d.speed;
      if (d.idleSpeed >= 10 && d.idleSpeed <= 1000) G.idleSpeed = d.idleSpeed;
      if (typeof d.exitIdleOnDeath === 'boolean') G.exitIdleOnDeath = d.exitIdleOnDeath;
      if (d.alloc) {
        const a = G.idleAlloc || (G.idleAlloc = { atk: 4, def: 3, agi: 2, luck: 1 });
        ['atk', 'def', 'agi', 'luck'].forEach(k => { if (typeof d.alloc[k] === 'number') a[k] = clamp(d.alloc[k], 0, 10); });
      }
    }
  } catch (e) {}
}

/* ---------- 说明 ---------- */
function openHelp() {
  openModal('<div class="help">' +
    '<h3>玩法说明</h3>' +
    '<h4>目标</h4><p>在无尽魔塔中向上攀爬，尽量活到最后。</p>' +
    '<h4>战斗</h4><p>自动回合制，敏捷高的一方先出手。</p>' +
    '<p>怪物分低、中、高、首领四级：每逢 10 倍数层可能出现更高级的怪物，100 层后可能出现强大的首领。</p>' +
    '<h4>属性</h4><ul>' +
      '<li>攻击：增加伤害。</li>' +
      '<li>防御：减免伤害。</li>' +
      '<li>敏捷：决定先手与闪避。</li>' +
      '<li>幸运：提高暴击率与暴击伤害。</li>' +
    '</ul>' +
    '<h4>成长</h4><p>击败敌人获得经验与金币；升级恢复满血并提升属性。</p>' +
    '<h4>随机事件</h4><p>少数楼层会触发随机事件，不同选择带来不同的奖励或惩罚，不会直接结束游戏。</p>' +
    '<h4>商城</h4><p>每 5 层固定出现一次，也可能随机遇到商城；用金币购买属性、经验，或恢复生命。商城后一格不会连续出商城，首领战前必有一次补给商城。</p>' +
    '<h4>用户等级</h4><p>每通关 1 层塔获得 1 点经验，升级所需经验 = 当前用户等级 × 2。用户等级越高，每局开局的初始属性加成越多（每级 +1 点，每局随机分配到各项属性）。</p>' +
    '<button class="btn" data-act="close">关闭</button>' +
    '</div>');
}

/* ---------- 自定义确认弹窗（替代 window.confirm，兼容 WebView） ---------- */
function confirmDialog(message, onYes) {
  pendingConfirm = onYes;
  openModal('<h3>确认</h3>' +
    '<p class="confirm-msg">' + esc(message) + '</p>' +
    '<div class="confirm-btns">' +
      '<button class="btn primary" data-act="confirmYes">确定</button>' +
      '<button class="btn" data-act="close">取消</button>' +
    '</div>');
}

function goMenu() {
  const wasGameover = G.state === 'gameover';
  if (wasGameover) G.player = null; // 结算后清空已死亡角色，避免带 0 血继续
  closeModal();
  if (!wasGameover && G.userLvUps > 0) toast('用户等级提升到 Lv.' + userState.level + '！本次 +' + G.userLvUps + ' 级');
  toMenu();
}

/* ---------- 死亡回放（1 倍速重放最后一战） ---------- */
let replayTimer = null;

function deathReplayHTML(enemy) {
  return '<div class="panel replay">' +
    '<h3>死亡回放</h3>' +
    (enemy ? '<div class="defeated killer">' +
      '<div class="d-name"><span class="tier">' + enemy.tier + '</span>' + esc(enemy.name) + '</div>' +
      '<div class="d-meta">等级 Lv.' + enemy.level + ' · 第 ' + enemy.floor + ' 层</div>' +
      '<div class="d-stats">攻 ' + fmtBig(enemy.atk) + ' · 防 ' + fmtBig(enemy.def) + ' · 敏 ' + fmtBig(enemy.agi) + ' · 运 ' + fmtBig(enemy.luck) + ' · 生命 ' + fmtBig(enemy.maxHp) + '</div>' +
    '</div>' : '') +
    '<div class="b-log" id="replayLog"></div>' +
    '<div class="replay-progress" id="replayProgress"></div>' +
    '<button class="btn primary" data-act="close">关闭</button>' +
    '</div>';
}

function openDeathReplay() {
  const entries = battleLog.slice(); // 快照，避免回放过程中被覆盖
  if (!entries.length) { toast('没有可回放的战斗记录'); return; }
  openModal(deathReplayHTML(G.enemy));
  const box = document.getElementById('replayLog');
  const prog = document.getElementById('replayProgress');
  const delay = Math.max(40, Math.round(BAL.turnDelay / 1)); // 强制 1 倍速
  let i = 0;
  (function tick() {
    if (i < entries.length) {
      const div = document.createElement('div');
      div.className = entries[i].cls || '';
      div.textContent = entries[i].text;
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
      prog.textContent = '第 ' + (i + 1) + ' / ' + entries.length + ' 步';
      i++;
      replayTimer = setTimeout(tick, delay);
    } else {
      replayTimer = null;
      prog.textContent = '回放结束';
    }
  })();
}

/* ---------- 动作分发 ---------- */
function mainAction(act, el) {
  switch (act) {
    case 'newgame':
      awaitingFollow = false; clearPendingRevive();
      if (G.player && G.state !== 'menu' && G.state !== 'gameover') {
        confirmDialog('开始新旅程将放弃当前进度，确定？', function () { closeModal(); newGame(); });
      } else {
        closeModal(); newGame();
      }
      break;
    case 'resume': // 继续冒险 = 读取最近自动存档
      awaitingFollow = false;
      closeModal(); loadAuto(); break;
    case 'menu':
      awaitingFollow = false; clearPendingRevive();
      if (G.state !== 'menu' && G.state !== 'gameover') {
        confirmDialog('返回主菜单？未保存的进度将丢失。', goMenu);
      } else {
        goMenu();
      }
      break;
    case 'confirmYes': {
      const fn = pendingConfirm;
      pendingConfirm = null;
      closeModal();
      if (typeof fn === 'function') fn();
      break;
    }
    case 'next':
      closeModal(); advanceFloor(); break;
    case 'skip':
      skipBattle(); break;
    case 'choice':
      chooseEvent(parseInt(el.dataset.i, 10)); break;
    case 'buy':
      buyItem(el.closest('.shop-item').dataset.id); break;
    case 'follow':
      followAuthor(); break;
    case 'recheck':
      recheckFollow(); break;
    case 'save': openSaveLoad('save'); break;
    case 'load': openSaveLoad('load'); break;
    case 'rank': openRank(); break;
    case 'help': openHelp(); break;
    case 'idle': toggleIdle(); break;
    case 'settings': openSettings(); break;
    case 'toggleExitIdle':
      G.exitIdleOnDeath = !G.exitIdleOnDeath;
      saveSettings();
      openModal(settingsHTML());
      break;
    case 'replay': openDeathReplay(); break;
    case 'close': closeModal(); break;
  }
}

/* ---------- 全局事件委托 ---------- */
document.addEventListener('click', function (ev) {
  const t = ev.target;
  if (t.classList && t.classList.contains('modal-backdrop')) { closeModal(); return; }

  const speedBtn = t.closest('[data-speed]');
  if (speedBtn) { setBattleSpeed(parseInt(speedBtn.dataset.speed, 10)); return; }

  const allocOp = t.closest('[data-allocop]');
  if (allocOp) {
    setIdleAlloc(allocOp.dataset.alloc, allocOp.dataset.allocop === 'inc' ? 1 : -1);
    return;
  }

  const source = t.closest('[data-source]');
  if (source) { switchRankSource(source.dataset.source); return; }

  const period = t.closest('[data-period]');
  if (period) { switchRankPeriod(period.dataset.period); return; }

  const tab = t.closest('[data-tab]');
  if (tab) { switchRankTab(tab.dataset.tab); return; }

  const qop = t.closest('[data-qop]');
  if (qop) { const item = t.closest('.shop-item'); if (item) qtyOp(item.dataset.id, qop.dataset.qop); return; }

  const slot = t.closest('[data-slot]');
  if (slot) { slotAction(parseInt(slot.dataset.slot, 10), slot.dataset.op); return; }

  const act = t.closest('[data-act]');
  if (act) { mainAction(act.dataset.act, act); }
});

document.addEventListener('input', function (ev) {
  const spd = ev.target.closest('[data-idlespeed]');
  if (spd) { setIdleSpeed(parseInt(ev.target.value, 10) || 200); return; }
  const item = ev.target.closest('.shop-item');
  if (!item) return;
  if (ev.target.matches('[data-range]')) {
    // 拖动滑块时只更新局部，避免整列重渲染造成拖拽卡顿
    const id = item.dataset.id;
    const it = shopItems(G.floor).find(x => x.id === id);
    const maxQ = itemMaxQ(it, G.player);
    const q = clamp(parseInt(ev.target.value, 10) || 0, 0, maxQ);
    shopState[id] = q;
    const num = item.querySelector('[data-input]');
    if (num) num.value = q;
    const totalEl = item.querySelector('.si-total');
    if (totalEl) totalEl.textContent = q + ' 份 · 共 ' + (q * it.price) + ' 金币';
    const buyBtn = item.querySelector('[data-act="buy"]');
    if (buyBtn) buyBtn.disabled = !(q > 0 && G.player.gold >= q * it.price);
  }
});

document.addEventListener('change', function (ev) {
  const item = ev.target.closest('.shop-item');
  if (!item) return;
  if (ev.target.matches('[data-input]')) {
    const id = item.dataset.id;
    const it = shopItems(G.floor).find(x => x.id === id);
    const maxQ = it && !it.single ? itemMaxQ(it, G.player) : 1;
    shopState[id] = clamp(parseInt(ev.target.value, 10) || 0, 0, maxQ);
    renderShopList();
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeModal();
});

/* ---------- 初始化（先渲染游戏，再异步加载 SDK，不阻塞首屏） ---------- */
/* 从关注主页返回时自动重新检测（App 返回 / 页面重新激活） */
document.addEventListener('visibilitychange', function () {
  if (!document.hidden && awaitingFollow && G.state === 'gameover') recheckFollow();
});
window.addEventListener('focus', function () {
  if (awaitingFollow && G.state === 'gameover') recheckFollow();
});

function init() {
  loadSettings(); // 恢复已保存的战斗速度与挂机分配
  loadUserState(); // 加载全局用户等级（本地同步 + 云端异步）
  loadPendingScore(); // 恢复上次未上报的成绩，SDK 就绪后自动补报
  // 先渲染游戏，确保首屏立即可交互；出错也给出兜底而非白屏
  try {
    uiRender();
  } catch (e) {
    console.error('[init] 渲染失败:', e);
    const scene = document.getElementById('scene');
    if (scene) scene.innerHTML = '<div class="panel"><h2>加载出错</h2><p>' + esc(e && e.message ? e.message : e) + '</p></div>';
  }
  // 游戏就绪后，再在后台加载 SDK（绝不阻塞首屏）
  setTimeout(loadToySdk, 1500);
  // 待确认的关注复活：SDK 就绪后自动重检
  setTimeout(checkPendingRevive, 2500);
}
init();
