/* ================= 冒烟测试：模拟 window.toy + 最小 DOM，验证核心流程 ================= */
var fs = require('fs');
var path = require('path');

/* ---- 最小 DOM 桩 ---- */
function makeEl() {
  return {
    _h: {},
    addEventListener: function (t, fn) { (this._h[t] = this._h[t] || []).push(fn); },
    classList: { _s: [], add: function (c) { if (this._s.indexOf(c) < 0) this._s.push(c); }, remove: function (c) { var i = this._s.indexOf(c); if (i >= 0) this._s.splice(i, 1); }, toggle: function (c, f) { var has = this._s.indexOf(c) >= 0; if (f === undefined) { has ? this.remove(c) : this.add(c); } else { f ? this.add(c) : this.remove(c); } }, contains: function (c) { return this._s.indexOf(c) >= 0; } },
    style: {}, hidden: false, textContent: '', innerHTML: '', value: '', className: '', files: [], src: '',
    select: function () {}, remove: function () {}, appendChild: function () {}, setAttribute: function () {},
    _attrs: {}, getAttribute: function (a) { return this._attrs ? this._attrs[a] : null; }
  };
}
function makeTab(b) {
  var el = makeEl();
  el._attrs = { 'data-b': String(b) };
  return el;
}

global.document = {
  readyState: 'complete',
  _els: {},
  getElementById: function (id) { if (!this._els[id]) this._els[id] = makeEl(); return this._els[id]; },
  addEventListener: function () {},
  querySelectorAll: function (sel) {
    if (sel === '#rank-tabs .rtab') return [makeTab(1), makeTab(2)];
    return [];
  },
  createElement: function () { return makeEl(); },
  head: { appendChild: function () {} },
  body: { appendChild: function () {} },
  execCommand: function () { return true; }
};
Object.defineProperty(global, 'navigator', { value: { clipboard: { writeText: function () { return Promise.resolve(); } }, userAgent: 'test' }, configurable: true });
global.window = { toy: null, addEventListener: function () {}, focus: function () {}, open: function () { return {}; }, location: { href: '' } };
global.setInterval = function () { return 1; };   // 不让定时器挂起
global.FileReader = function () {
  var self = this;
  this.readAsDataURL = function () { setTimeout(function () { if (self.onload) self.onload({ target: { result: 'data:image/png;base64,x' } }); }, 0); };
};

/* ---- 模拟 B站 SDK ---- */
function makeSDK(rel) {
  var cloud = {};
  var scores = { 1: {}, 2: {}, 3: {} };   // board -> uid -> 最高分
  var relData = rel;
  return {
    getRankList: function (req) {
      var b = req.board || 1;
      var rows = Object.keys(scores[b]).map(function (uid) { return { rank: 0, score: scores[b][uid], nickname: 'u', avatar: '' }; });
      rows.sort(function (a, c) { return c.score - a.score; });
      rows = rows.slice(0, req.limit || 100);
      rows.forEach(function (r, i) { r.rank = i + 1; });
      return Promise.resolve(rows);
    },
    getMyRank: function (req) {
      var b = req.board || 1;
      var sc = scores[b].u1 || 0;
      return Promise.resolve({ ranked: sc !== 0, rank: sc ? 1 : 0, score: sc });
    },
    submitScore: function (req) {
      var b = req.board || 1;
      var prev = scores[b].u1 || 0;
      if (req.score > prev) scores[b].u1 = req.score;
      return Promise.resolve({ score: scores[b].u1 });
    },
    getCloudStorage: function (keys) {
      var out = {};
      (keys && keys.length ? keys : Object.keys(cloud)).forEach(function (k) { if (cloud[k] !== undefined) out[k] = cloud[k]; });
      return Promise.resolve(out);
    },
    setCloudStorage: function (obj) { Object.keys(obj).forEach(function (k) { cloud[k] = obj[k]; }); return Promise.resolve(); },
    removeCloudStorage: function () { return Promise.resolve(); },
    getAuthorRelation: function () { return Promise.resolve({ status: 'ok', data: { isFollowing: relData.isFollowing, isAuthor: relData.isAuthor } }); },
    navigate: function () { return Promise.resolve(); },
    _cloud: cloud,
    _scores: scores,
    _rel: relData
  };
}

var code = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');

function flush() { return new Promise(function (r) { setTimeout(r, 30); }); }

function check(name, cond) {
  if (cond) { console.log('PASS  ' + name); }
  else { console.log('FAIL  ' + name); process.exitCode = 1; }
}

(async function () {
  /* ---------- 场景1：普通用户完整流程（领取制） ---------- */
  var sdk1 = makeSDK({ isFollowing: false, isAuthor: false });
  global.window.toy = sdk1;
  eval(code);

  await flush();

  check('首访需点击领取（不自动）', S.f1 === false);
  check('首访未领取剩余 0', remaining() === 0);
  // 点击领取首访票
  $('grant-1')._h.click[0]();
  await flush();
  check('首访领取后 f1', S.f1 === true);
  check('初始剩余 1 票', remaining() === 1);
  check('初始榜单均为 0', S.counts.blue === 0 && S.counts.red === 0);

  // 投蓝方
  S.pick = 'blue';
  castVote();
  await flush();
  check('蓝方榜1累计=1', S.counts.blue === 1 && sdk1._scores[1].u1 === 1);
  check('投后已用=1', S.used === 1);
  check('投后剩余 0', remaining() === 0);

  // 关注后复查 → 按钮变领取 → 点击领取
  sdk1._rel.isFollowing = true;
  await recheckFollow();
  await flush();
  check('关注后按钮变领取（未自动发）', S.f2 === false && $('btn-follow').textContent === '领取');
  $('grant-2')._h.click[0]();
  await flush();
  check('点击领取后获得关注票 f2', S.f2 === true);
  check('关注后剩余 1', remaining() === 1);

  // 分享上传发票
  onShareFile({});
  await flush();
  await flush();
  check('分享发票 f3', S.f3 === true);
  check('分享后剩余 2', remaining() === 2);

  // 投红方
  S.pick = 'red';
  castVote();
  await flush();
  check('红方榜2累计=1', S.counts.red === 1 && sdk1._scores[2].u1 === 1);
  check('已用=2', S.used === 2);
  check('剩余 1', remaining() === 1);

  // 模拟重置 K-V（删空云存储），已用榜3锚点仍在 → 不应突破3票
  sdk1._cloud = {};
  await loadState();
  if (S.loggedIn) { S.f1 = true; S.f2 = true; S.f3 = true; }   // 模拟重新领取全部资格
  await flush();
  check('重置后重新领取也仍 ≤3 票（榜3锚定）', S.used === 2 && remaining() === 1);
  // 补1票到 3
  S.pick = 'blue'; castVote(); await flush();
  check('重置后最多只能补到3票', S.used === 3 && remaining() === 0);
  var before = sdk1._scores[1].u1 || 0;
  S.pick = 'blue'; castVote(); await flush();
  check('无票时不能继续投（榜单不增长）', (sdk1._scores[1].u1 || 0) === before);

  /* ---------- 场景2：UP本尊无限票 ---------- */
  var sdk2 = makeSDK({ isFollowing: true, isAuthor: true });
  global.window.toy = sdk2;
  eval(code);
  await flush();
  check('UP 判定无限票', isUnlimited() === true);
  check('UP 剩余显示 999', remaining() === 999);
  var b0 = sdk2._scores[1].u1 || 0;
  S.pick = 'blue';
  castVote(); await flush();
  castVote(); await flush();
  check('UP 可连续投票，榜单持续增长', (sdk2._scores[1].u1 || 0) >= b0 + 2);
  check('UP 不占用本人已投锚点', (sdk2._scores[3].u1 || 0) === 0);

  /* ---------- 场景3：未登录（无K-V）不可投票 ---------- */
  var sdk3 = makeSDK({ isFollowing: false, isAuthor: false });
  // 模拟 getCloudStorage 拒绝
  sdk3.getCloudStorage = function () { return Promise.reject(new Error('no login')); };
  global.window.toy = sdk3;
  eval(code);
  await flush();
  check('未登录时 loggedIn=false', S.loggedIn === false);
  check('未登录时 vote 按钮锁定', $('btn-vote').classList.contains('locked') === true);

  /* ---------- 场景4：App内 navigate 失败 → location.href 兜底 ---------- */
  var sdk4 = makeSDK({ isFollowing: false, isAuthor: false });
  sdk4.navigate = function () { return Promise.reject(new Error('blocked')); };
  global.window.toy = sdk4;
  global.window.location.href = '';
  eval(code);
  await flush();
  guideToFollow();
  await flush();
  check('App内navigate失败回退 location.href 跳UP主页', global.window.location.href === 'https://space.bilibili.com/13450091');
  check('跟随弹窗已显示', $('follow-modal').hidden === false);

  /* ---------- 场景5：无SDK（电脑端）→ window.open 打开 ---------- */
  global.window.toy = null;
  global.window._openedUrl = null;
  global.window.open = function (url) { global.window._openedUrl = url; return {}; };
  eval(code);
  await flush();
  guideToFollow();
  await flush();
  check('无SDK时用 window.open 打开UP主页', global.window._openedUrl === 'https://space.bilibili.com/13450091');

  /* ---------- 场景6：投票列表 TOP100 ---------- */
  var sdk6 = makeSDK({ isFollowing: false, isAuthor: false });
  sdk6._scores[1].u1 = 5;
  sdk6._scores[1].u2 = 3;
  sdk6._scores[2].u2 = 4;
  global.window.toy = sdk6;
  eval(code);
  await flush();
  openRank();
  await flush();
  check('投票列表弹窗打开', $('rank-modal').hidden === false);
  check('鸣潮TOP100渲染用户名', $('rank-body').innerHTML.indexOf('u') >= 0);
  // 模拟真实点击按钮
  $('rank-modal').hidden = true;
  $('btn-rank')._h.click[0]();
  await flush();
  check('点击查看投票列表按钮能打开弹窗', $('rank-modal').hidden === false);
  check('投票列表不显示票数', $('rank-body').innerHTML.indexOf('5 票') < 0);
  switchRankTab(2);
  await flush();
  check('切到原神TOP100说明更新', $('rank-note').textContent.indexOf('原神') >= 0);

  /* ---------- 场景7：已关注用户进入页面不自动发，需点击领取后显示已获得 ---------- */
  var sdk7 = makeSDK({ isFollowing: true, isAuthor: false });
  global.window.toy = sdk7;
  eval(code);
  await flush();
  check('已关注用户进入页面不自动获得关注票', S.f2 === false);
  check('关注票按钮显示领取', $('btn-follow').textContent === '领取');
  $('grant-2')._h.click[0]();
  await flush();
  check('点击领取后获得关注票', S.f2 === true);
  check('关注票按钮显示已获得', $('g2-status').textContent === '已获得' && $('g2-status').hidden === false);
  check('分享票未获得仍显示去分享', $('btn-share').textContent === '去分享');

  console.log('---- 冒烟测试结束 ----');
})().catch(function (e) { console.error('TEST ERROR', e); process.exitCode = 1; });
