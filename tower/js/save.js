/* ==================== 存档 / 读档（localStorage）==================== */

const SLOT_COUNT = 20;
const AUTO_KEY = 'tower_save_auto';
const saveKeys = Array.from({ length: SLOT_COUNT }, (_, i) => 'tower_save_' + i);

function serializeGame() {
  return {
    v: 1, ts: Date.now(),
    floor: G.floor, floorType: G.floorType, floorSeed: G.floorSeed,
    pendingShop: G.pendingShop,
    pendingBoss: G.pendingBoss, pendingBossSeed: G.pendingBossSeed,
    player: Object.assign({}, G.player),
    kills: G.kills, floorsCleared: G.floorsCleared, goldEarned: G.goldEarned,
    startedAt: G.startedAt, lives: G.lives, followRevived: G.followRevived
  };
}

function saveSlot(i) {
  if (!G.player || G.state === 'menu') { toast('当前没有可保存的冒险'); return false; }
  try {
    localStorage.setItem(saveKeys[i], JSON.stringify(serializeGame()));
    toast('已保存到存档 ' + (i + 1));
    return true;
  } catch (e) { toast('保存失败：' + e.message); return false; }
}

function loadSlotData(i) {
  try {
    const raw = localStorage.getItem(saveKeys[i]);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function slotInfo(i) {
  const d = loadSlotData(i);
  if (!d || !d.player) return null;
  return { ts: d.ts, floor: d.floor, level: d.player.level, hp: d.player.hp, maxHp: d.player.maxHp };
}

function deleteSlot(i) {
  localStorage.removeItem(saveKeys[i]);
}

function loadGameFromData(d) {
  if (!d || !d.player) { toast('存档无效'); return; }
  clearBattleTimer();
  G.player = d.player;
  G.floor = d.floor || 1;
  G.floorType = d.floorType || 'battle';
  G.floorSeed = d.floorSeed || 0;
  G.pendingShop = !!d.pendingShop;
  G.pendingBoss = !!d.pendingBoss;
  G.pendingBossSeed = d.pendingBossSeed || 0;
  G.kills = d.kills || 0;
  G.floorsCleared = d.floorsCleared || 0;
  G.goldEarned = d.goldEarned || 0;
  G.startedAt = d.startedAt || Date.now();
  G.lives = d.lives || 0;
  G.followRevived = !!d.followRevived;
  G.goMode = 'normal';
  battleLog.length = 0;
  logRendered = 0;
  buildFloor();
  enterFloor();
  toast('已读档：第 ' + G.floor + ' 层');
}

function loadSlot(i) {
  const d = loadSlotData(i);
  if (!d) { toast('该存档位为空'); return; }
  loadGameFromData(d);
}

function autoSave() {
  if (!G.player || G.state === 'menu' || G.state === 'gameover') return;
  try { localStorage.setItem(AUTO_KEY, JSON.stringify(serializeGame())); } catch (e) {}
}

function loadAuto() {
  try {
    const raw = localStorage.getItem(AUTO_KEY);
    if (raw) { loadGameFromData(JSON.parse(raw)); return true; }
  } catch (e) {}
  return false;
}

function clearAutoSave() {
  try { localStorage.removeItem(AUTO_KEY); } catch (e) {}
}

/* 自动存档概要（用于菜单「继续冒险」按钮文案） */
function autoInfo() {
  try {
    const d = JSON.parse(localStorage.getItem(AUTO_KEY) || 'null');
    if (d && d.player) return { floor: d.floor, level: d.player.level };
  } catch (e) {}
  return null;
}
