/* ==================== 排行榜：本地榜 + 全站榜（Toy SDK） ==================== */

const BOARD_LEVEL = 1; // 等级榜
const BOARD_FLOOR = 2; // 层数榜
const BOARD_USER = 3;  // 用户等级榜
const LOCAL_SCORES_KEY = 'tower_local_scores';
const AUTHOR_UID = '13450091'; // 关注引导目标作者
const PENDING_REVIVE_KEY = 'tower_pending_revive';
const PENDING_SCORE_KEY = 'tower_pending_score';
const USER_KEY = 'tower_user';

let sdkScriptInjected = false;
let sdkReadyPromise = null;
let pendingScore = null; // SDK 未就绪时缓存待上报成绩

/* ---------- 全局用户等级（每通关 1 层 +1 经验；升级所需经验 = 等级 × 2） ---------- */
let userState = { level: 1, xp: 0 };

function userXpNeeded(level) { return level * 2; }

function loadUserState() {
  try {
    const local = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    if (local && local.level) userState = { level: local.level, xp: local.xp || 0 };
  } catch (e) {}
  // B站 云端覆盖（异步，登录后生效）
  if (toySdkReady()) {
    window.toy.getCloudStorage([USER_KEY]).then(function (res) {
      try {
        const d = JSON.parse(res[USER_KEY] || 'null');
        if (d && d.level && d.level >= userState.level) userState = { level: d.level, xp: d.xp || 0 };
        else if (d && d.level && d.level < userState.level) saveUserState(); // 本地更高则回写云端
      } catch (e) {}
      uiRender();
    }).catch(function () {});
  }
}

function saveUserState() {
  const data = JSON.stringify({ level: userState.level, xp: userState.xp });
  try { localStorage.setItem(USER_KEY, data); } catch (e) {}
  if (toySdkReady()) window.toy.setCloudStorage({ [USER_KEY]: data }).catch(function () {});
}

function addUserXp(n) {
  userState.xp += n;
  let guard = 0;
  while (userState.xp >= userXpNeeded(userState.level) && guard++ < 1000) {
    userState.xp -= userXpNeeded(userState.level);
    userState.level++;
    if (G && G.userLvUps !== undefined) G.userLvUps++; // 记录本次游戏内升级次数
  }
  saveUserState();
}

/* 用户等级颜色：等级越高越炫酷（更多等级、更高特效） */
function userLevelColorClass(level) {
  if (level >= 50) return 'ulv-rainbow';
  if (level >= 45) return 'ulv-sun';
  if (level >= 40) return 'ulv-red';
  if (level >= 35) return 'ulv-orange';
  if (level >= 30) return 'ulv-gold';
  if (level >= 25) return 'ulv-pink';
  if (level >= 20) return 'ulv-purple';
  if (level >= 15) return 'ulv-cyan';
  if (level >= 10) return 'ulv-blue';
  if (level >= 5) return 'ulv-green';
  return 'ulv-gray';
}

function toySdkReady() {
  return typeof window !== 'undefined' && window.toy && typeof window.toy.isSupport === 'function';
}

/* Toy SDK 响应解包：兼容「裸数据」与「{status:'ok', data}」包装两种返回 */
function sdkData(res) {
  if (res && typeof res === 'object' && res.status === 'ok' && 'data' in res) return res.data;
  return res;
}

/* 动态注入 Toy SDK，异步加载，不阻塞首屏 */
function loadToySdk() {
  if (sdkScriptInjected) return;
  sdkScriptInjected = true;
  sdkReadyPromise = new Promise(function (resolve) {
    const s = document.createElement('script');
    s.src = '//s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
    s.async = true;
    s.onload = function () { flushPendingScore(); resolve(true); };
    s.onerror = function () { resolve(false); };
    (document.head || document.documentElement).appendChild(s);
  });
}

/* 等待 SDK 就绪（会自动触发加载）；不可用时返回 false */
function waitSdkReady() {
  if (toySdkReady()) return Promise.resolve(true);
  if (!sdkReadyPromise) loadToySdk();
  return sdkReadyPromise.then(function () { return toySdkReady(); });
}

/* ---------- 本地成绩记录（本地榜数据源） ---------- */
function recordLocalScore() {
  if (!G.player) return;
  const d = readLocalScores();
  d.bestFloor = Math.max(d.bestFloor, G.floor);
  d.bestLevel = Math.max(d.bestLevel, G.player.level);
  d.scores.push({ name: '我', level: G.player.level, floor: G.floor, ulv: userState.level, ts: Date.now() });
  if (d.scores.length > 500) d.scores = d.scores.slice(-500);
  try { localStorage.setItem(LOCAL_SCORES_KEY, JSON.stringify(d)); } catch (e) {}
}

function readLocalScores() {
  try {
    const d = JSON.parse(localStorage.getItem(LOCAL_SCORES_KEY) || 'null');
    if (d && Array.isArray(d.scores)) return d;
  } catch (e) {}
  return { bestFloor: 0, bestLevel: 1, scores: [] };
}

function bestFloor() { return readLocalScores().bestFloor; }
function bestLevel() { return readLocalScores().bestLevel; }

/* 本地榜（全时段，本设备历史成绩） */
function localRank(board) {
  const d = readLocalScores();
  const list = d.scores
    .map(s => ({ score: board === BOARD_LEVEL ? s.level : (board === BOARD_FLOOR ? s.floor : (s.ulv || 0)), ts: s.ts }))
    .filter(s => s.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.ts - b.ts))
    .slice(0, 50);
  return list.map((s, i) => ({ rank: i + 1, score: s.score, nickname: '本地玩家', avatar: '' }));
}

/* ---------- 成绩上报（异步，绝不阻塞；SDK 未就绪则缓存待补报） ---------- */
function toySubmitScore() {
  recordLocalScore();
  if (!G.player) return;
  submitCloud(G.player.level, G.floor, userState.level);
}

/* 云上报：SDK 就绪直接上报；未就绪则缓存到内存并落盘，避免刷新/关闭丢失 */
function submitCloud(level, floor, ulv) {
  if (toySdkReady()) submitAll(level, floor, ulv);
  else {
    pendingScore = { level, floor, ulv };
    persistPendingScore();
  }
}

/* 爬塔中节流云上报（不记本地榜，避免被中途进度刷屏）：30s 内最多一次 */
let lastAutoSubmit = 0;
function maybeAutoSubmit() {
  const now = Date.now();
  if (now - lastAutoSubmit < 30000) return;
  lastAutoSubmit = now;
  if (!G.player) return;
  submitCloud(G.player.level, G.floor, userState.level);
}

function persistPendingScore() {
  try { localStorage.setItem(PENDING_SCORE_KEY, JSON.stringify(pendingScore)); } catch (e) {}
}

/* 启动时从 localStorage 恢复待上报成绩；SDK 就绪后自动补报 */
function loadPendingScore() {
  try {
    const d = JSON.parse(localStorage.getItem(PENDING_SCORE_KEY) || 'null');
    if (d && typeof d.floor === 'number') pendingScore = { level: d.level || 1, floor: d.floor, ulv: d.ulv || 0 };
  } catch (e) {}
  if (pendingScore && toySdkReady()) flushPendingScore();
}

function flushPendingScore() {
  if (!pendingScore) return;
  if (!toySdkReady()) return; // 仍未就绪，保留待补报
  const p = pendingScore;
  pendingScore = null;
  try { localStorage.removeItem(PENDING_SCORE_KEY); } catch (e) {}
  submitAll(p.level, p.floor, p.ulv);
}

function submitAll(level, floor, ulv) {
  window.toy.submitScore({ board: BOARD_LEVEL, score: level }).catch(e => console.warn('[ToySDK] 等级榜上报失败', e));
  window.toy.submitScore({ board: BOARD_FLOOR, score: floor }).catch(e => console.warn('[ToySDK] 层数榜上报失败', e));
  window.toy.submitScore({ board: BOARD_USER, score: ulv }).catch(e => console.warn('[ToySDK] 用户等级榜上报失败', e));
}

/* ---------- 全站榜（SDK，支持日/周/月/总） ---------- */
async function fetchGlobalRank(board, period) {
  if (!(await waitSdkReady())) return null; // SDK 不可用
  try {
    const list = sdkData(await window.toy.getRankList({ board, period, limit: 50 }));
    return Array.isArray(list) && list.length ? list : [];
  } catch (e) { console.warn('[ToySDK] getRankList 失败', e); }
  return null;
}

async function fetchGlobalMyRank(board, period) {
  if (!(await waitSdkReady())) return null;
  try {
    const r = sdkData(await window.toy.getMyRank({ board, period }));
    return r && r.ranked ? r : null;
  } catch (e) { console.warn('[ToySDK] getMyRank 失败', e); }
  return null;
}

/* ---------- 关注检测与复活引导（B站环境） ---------- */
/* 获取当前用户与 Toy 作者的互动关系；非 B站/未登录返回 null */
function getAuthorRelation() {
  if (!toySdkReady()) return Promise.resolve(null);
  return window.toy.getAuthorRelation().then(function (r) {
    return r && r.status === 'ok' && r.data ? r.data : null;
  }).catch(function () { return null; });
}

/* B站环境是否支持关注复活（getAuthorRelation 返回 ok） */
function canUseFollow() {
  return getAuthorRelation().then(function (r) { return !!r; });
}

/* 是否已关注作者（作者本人也算可复活） */
function getFollowState() {
  return getAuthorRelation().then(function (r) { return !!(r && (r.isFollowing || r.isAuthor)); });
}

/* 跳转作者主页（必须在用户手势中调用） */
function openAuthorHome() {
  return window.toy.navigate({ type: 'space', id: AUTHOR_UID });
}

/* 待确认的关注复活：跳转前持久化当前局，返回后重新检测 */
function setPendingRevive(save) {
  try { localStorage.setItem(PENDING_REVIVE_KEY, JSON.stringify({ save: save, ts: Date.now() })); } catch (e) {}
}
function getPendingRevive() {
  try { return JSON.parse(localStorage.getItem(PENDING_REVIVE_KEY) || 'null'); } catch (e) { return null; }
}
function clearPendingRevive() {
  try { localStorage.removeItem(PENDING_REVIVE_KEY); } catch (e) {}
}
