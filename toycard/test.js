/* 冒烟测试：node test.js（不写 'use strict'，保证 require 到模块函数） */
var assert = require('assert');

/* mock localStorage */
global.localStorage = {
  _s: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
  setItem: function (k, v) { this._s[k] = String(v); },
  removeItem: function (k) { delete this._s[k]; }
};

var G = require('./game.js');
var pass = 0, fail = 0;
var pending = [];

function t(name, fn) {
  try {
    var r = fn();
    if (r && typeof r.then === 'function') {
      pending.push(r.then(function () { pass++; console.log('✓ ' + name); })
        .catch(function (e) { fail++; console.log('✗ ' + name + ' -> ' + e.message); }));
    } else {
      pass++; console.log('✓ ' + name);
    }
  } catch (e) {
    fail++; console.log('✗ ' + name + ' -> ' + e.message);
  }
}

/* ---------- 抽卡 ---------- */
t('gachaDraw 抽 n 个不重复', function () {
  var pool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return { id: n }; });
  var d = G.gachaDraw(pool, 10);
  assert.strictEqual(d.length, 10);
  assert.strictEqual(new Set(d.map(function (x) { return x.id; })).size, 10);
});
t('gachaDraw n 大于池长返回全部且不重复', function () {
  var d = G.gachaDraw([{ id: 1 }, { id: 2 }, { id: 3 }], 10);
  assert.strictEqual(d.length, 3);
  assert.strictEqual(new Set(d.map(function (x) { return x.id; })).size, 3);
});
t('gachaDraw 空池返回空', function () {
  assert.deepStrictEqual(G.gachaDraw([], 5), []);
});
t('gachaDraw 不修改原池', function () {
  var pool = [{ id: 1 }, { id: 2 }, { id: 3 }];
  G.gachaDraw(pool, 2);
  assert.strictEqual(pool.length, 3);
});

/* ---------- 抽取池过滤 ---------- */
t('buildPool 按分类与黑名单过滤', function () {
  G.DATA.items = [
    { id: 1, category: '游戏' },
    { id: 2, category: '工具' },
    { id: 3, category: '游戏' }
  ];
  G.selCats['游戏'] = true;
  G.selCats['工具'] = true;
  G.addBlack({ id: 1, category: '游戏' });
  var pool = G.buildPool();
  assert.deepStrictEqual(pool.map(function (x) { return x.id; }).sort(), [2, 3]);
  G.removeBlack(1);
});
t('buildPool 排除未选中分类', function () {
  G.selCats['游戏'] = false;
  G.selCats['工具'] = true;
  assert.deepStrictEqual(G.buildPool().map(function (x) { return x.id; }), [2]);
});
t('buildPool 黑名单为空的加载', function () {
  G.selCats['游戏'] = true;
  G.selCats['工具'] = true;
  assert.strictEqual(G.buildPool().length, 3);
});

/* ---------- 黑名单 ---------- */
t('黑名单增删与持久化', function () {
  G.addBlack({ id: 10, title: 'A', category: '游戏', poster: '', slug: 'a', author: 'x', pv_text: '1w' });
  assert.ok(G.getBlackItems().some(function (x) { return x.id === 10; }));
  assert.ok(JSON.parse(global.localStorage.getItem('tc_black')).some(function (x) { return x.id === 10; }));
  G.removeBlack(10);
  assert.ok(!G.getBlackItems().some(function (x) { return x.id === 10; }));
  assert.ok(!JSON.parse(global.localStorage.getItem('tc_black')).some(function (x) { return x.id === 10; }));
});
t('黑名单 clearBlack 清空', function () {
  G.addBlack({ id: 11, title: 'B', category: '游戏', poster: '', slug: 'b', author: 'x', pv_text: '1w' });
  G.clearBlack();
  assert.strictEqual(G.getBlackItems().length, 0);
  assert.deepStrictEqual(JSON.parse(global.localStorage.getItem('tc_black')), []);
});
t('loadLists 从本地存储恢复黑名单', function () {
  G.addBlack({ id: 30, title: 'C', category: '测试', poster: '', slug: 'c', author: 'z', pv_text: '3w' });
  G.loadLists();
  assert.ok(G.getBlackItems().some(function (x) { return x.id === 30; }));
  G.clearBlack();
});

/* ---------- 收藏 ---------- */
t('收藏 toggle 与持久化', function () {
  var item = { id: 20, title: 'D', category: '工具', poster: '', slug: 'd', author: 'y', pv_text: '2w' };
  assert.strictEqual(G.toggleFav(item), true);
  assert.ok(G.isFav(20));
  assert.ok(JSON.parse(global.localStorage.getItem('tc_fav')).some(function (x) { return x.id === 20; }));
  assert.strictEqual(G.toggleFav(item), false);
  assert.ok(!G.isFav(20));
});
t('收藏 removeFav / clearFav', function () {
  G.toggleFav({ id: 21, title: 'E', category: '游戏', poster: '', slug: 'e', author: 'y', pv_text: '2w' });
  G.removeFav(21);
  assert.ok(!G.isFav(21));
  G.toggleFav({ id: 22, title: 'F', category: '游戏', poster: '', slug: 'f', author: 'y', pv_text: '2w' });
  G.clearFav();
  assert.strictEqual(G.getFavItems().length, 0);
});

/* ---------- 工具 ---------- */
t('escapeHtml 转义特殊字符', function () {
  assert.strictEqual(G.escapeHtml('<b>"x"&\'y\''), '&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;');
  assert.strictEqual(G.escapeHtml(null), '');
  assert.strictEqual(G.escapeHtml(undefined), '');
});
t('formatPv 优先 pv_text', function () {
  assert.strictEqual(G.formatPv({ pv_text: '802.6w' }), '802.6w');
  assert.strictEqual(G.formatPv({ pv: 8026000 }), '802.6w');
  assert.strictEqual(G.formatPv({ pv: 500 }), '500');
  assert.strictEqual(G.formatPv({ pv: 0 }), '');
  assert.strictEqual(G.formatPv({}), '');
});

/* ---------- 卡片渲染 ---------- */
t('cardHtml 含跳转链接/角标/信息', function () {
  var html = G.cardHtml({ id: 100, title: '<大狗>', slug: 'Dagou-Tap', poster: 'p.jpg', category: '游戏', author: '马克杯', pv_text: '802.6w', store_tag: '镇店之宝' }, 0);
  assert.ok(html.indexOf('https://www.bilibili.com/toy/Dagou-Tap') >= 0, '应含跳转链接');
  assert.ok(html.indexOf('&lt;大狗&gt;') >= 0, 'title 应转义');
  assert.ok(html.indexOf('data-act="black"') >= 0, '应含拉黑角标');
  assert.ok(html.indexOf('data-act="fav"') >= 0, '应含收藏角标');
  assert.ok(html.indexOf('镇店之宝') >= 0, '应含 store_tag');
  assert.ok(html.indexOf('802.6w') >= 0, '应含游玩次数');
});
t('cardHtml 收藏态加 on', function () {
  G.toggleFav({ id: 100, title: 'x', slug: 'x', poster: '', category: '游戏', author: '', pv_text: '' });
  var html = G.cardHtml({ id: 100, title: 'x', slug: 'x', poster: '', category: '游戏', author: '', pv_text: '' }, 0);
  assert.ok(html.indexOf('badge-star on') >= 0, '收藏中应为实心星');
  G.clearFav();
});
t('cardHtml 稀有卡加 card-item--rare', function () {
  var html = G.cardHtml({ id: 101, title: 'x', slug: 'x', poster: '', category: '游戏', author: '', pv_text: '', store_tag: '镇店之宝' }, 0);
  assert.ok(html.indexOf('card-item--rare') >= 0, '镇店之宝应有稀有样式');
  assert.ok(html.indexOf('data-jump="x"') >= 0, '应含 data-jump 供 SDK 跳转');
});

/* ---------- 云存储 / 多端同步 ---------- */
t('cloudReady 在无 SDK 环境返回 false', function () {
  assert.strictEqual(G.cloudReady(), false);
});
t('loadListsFromCloud 无 SDK 时正常 resolve 且不抛错', function () {
  return G.loadListsFromCloud().then(function () {
    assert.ok(true, '应正常 resolve');
  });
});
t('黑名单写入同时落 localStorage（云不可用时不抛错）', function () {
  G.addBlack({ id: 40, title: 'G', category: '游戏', poster: '', slug: 'g', author: 'x', pv_text: '1w' });
  assert.ok(JSON.parse(global.localStorage.getItem('tc_black')).some(function (x) { return x.id === 40; }));
  G.removeBlack(40);
});

/* ---------- 本地数据源 ---------- */
t('getLocalData 优先读 data.js 数据', function () {
  var prev = global.window;
  global.window = { TOYCARD_DATA: { total: 2, categories: ['游戏'], items: [{ id: 1 }] } };
  var d = G.getLocalData();
  assert.ok(d && d === global.window.TOYCARD_DATA, '应直接返回 data.js 数据');
  global.window = prev;
});
t('getLocalData 无 data.js 时回退 localStorage 缓存', function () {
  var prev = global.window;
  global.window = {};
  global.localStorage.setItem('toycard_cache_v1', JSON.stringify({ items: [{ id: 9 }], categories: [], total: 1 }));
  var d = G.getLocalData();
  assert.ok(d && d.items[0].id === 9, '应回退到缓存');
  global.window = prev;
  global.localStorage.removeItem('toycard_cache_v1');
});

/* ---------- myToys 本地游戏并入抽卡池 ---------- */
t('mergeMyToys 并入本地游戏并补 images 前缀', function () {
  var prev = global.window;
  G.DATA.items = [{ id: 1, category: '游戏' }];
  G.DATA.categories = ['游戏'];
  G.DATA.total = 1;
  global.window = { MY_TOYS: [
    { id: 9001, poster: 'my.png', title: '我的Toy', author: '我', category: '工具', pv_text: '1.2w', slug: 'my-slug' }
  ] };
  G.mergeMyToys();
  assert.strictEqual(G.DATA.items.length, 2);
  var mine = G.DATA.items[1];
  assert.strictEqual(mine.poster, 'images/my.png', '本地图标应补 images/ 前缀');
  assert.strictEqual(mine.slug, 'my-slug');
  assert.ok(G.DATA.categories.indexOf('工具') >= 0, '应并入本地类型');
  assert.strictEqual(G.DATA.total, 2, 'total 应更新');
  global.window = prev;
});
t('mergeMyToys 与线上 id 重复时跳过', function () {
  var prev = global.window;
  G.DATA.items = [{ id: 9002, category: '游戏' }];
  G.DATA.categories = ['游戏'];
  G.DATA.total = 1;
  global.window = { MY_TOYS: [{ id: 9002, poster: 'a.png', title: 'dup', author: 'a', category: '游戏', pv_text: '', slug: 'dup' }] };
  G.mergeMyToys();
  assert.strictEqual(G.DATA.items.length, 1, '重复 id 不应重复加入');
  global.window = prev;
});
t('normalizePoster 本地文件名补前缀 / 网络地址保持原样', function () {
  assert.strictEqual(G.normalizePoster('a.png'), 'images/a.png');
  assert.strictEqual(G.normalizePoster('https://x.com/a.png'), 'https://x.com/a.png');
  assert.strictEqual(G.normalizePoster('/a.png'), '/a.png');
  assert.strictEqual(G.normalizePoster(''), '');
});
t('buildPool 包含本地 myToys（本地加载）', function () {
  var prev = global.window;
  G.DATA.items = [{ id: 1, category: '游戏' }];
  G.DATA.categories = ['游戏', '工具'];
  G.DATA.total = 1;
  G.selCats['游戏'] = true;
  G.selCats['工具'] = true;
  global.window = { MY_TOYS: [{ id: 9003, poster: 'b.png', title: 'B', author: 'x', category: '工具', pv_text: '1w', slug: 'b' }] };
  G.mergeMyToys();
  assert.strictEqual(G.buildPool().length, 2, '本地游戏应进入抽取池');
  global.window = prev;
});

/* ---------- 排行榜统计 ---------- */
t('computeStats 总抽卡 = 单抽 + 十连×10', function () {
  var c = G.computeStats(5, 2);
  assert.strictEqual(c.single, 5);
  assert.strictEqual(c.ten, 2);
  assert.strictEqual(c.total, 25, '5 + 2*10 = 25');
  assert.strictEqual(G.computeStats(0, 0).total, 0);
  assert.strictEqual(G.computeStats(1, 0).total, 1, '单抽算 1 次');
  assert.strictEqual(G.computeStats(0, 1).total, 10, '十连算 10 次');
});
t('sdkReady 无 SDK 环境返回 false', function () {
  assert.strictEqual(G.sdkReady(), false);
});
t('ensureSdk 无 window 环境直接 resolve 不抛错', function () {
  return G.ensureSdk().then(function (ok) {
    assert.strictEqual(ok, false, 'node 下无 SDK 返回 false');
  });
});
t('readBoard / bumpBoard 依赖 window.toy，无 SDK 时不可调用（mock 验证）', function () {
  var prev = global.window;
  var calls = [];
  global.window = {
    toy: {
      getRankList: function (req) { calls.push(req); return Promise.resolve([{ score: 7 }]); },
      submitScore: function (req) { calls.push(req); return Promise.resolve({ score: 8 }); }
    }
  };
  return G.readBoard(2).then(function (v) {
    assert.strictEqual(v, 7, '应读到榜分 7');
    return G.bumpBoard(2, 1).then(function (n) {
      assert.strictEqual(n, 8, '累加后应为 8');
      assert.ok(calls.some(function (c) { return c.board === 2 && c.score === 8; }), '应提交 score 8');
    });
  }).then(function () {
    global.window = prev;
  }, function (e) {
    global.window = prev;
    throw e;
  });
});

/* ---------- 加权抽取 & 列表跳转 ---------- */
t('buildWeightedPool 按 count 展开加权份', function () {
  var prev = global.window;
  G.DATA.items = [
    { id: 1, category: '游戏', count: 1 },
    { id: 2, category: '游戏', count: 3 }
  ];
  G.selCats['游戏'] = true;
  var pool = G.buildWeightedPool();
  assert.strictEqual(pool.length, 4, '1 + 3 份');
  assert.strictEqual(pool.filter(function (x) { return x.id === 2; }).length, 3, 'id2 应 3 份');
  assert.strictEqual(pool.filter(function (x) { return x.id === 1; }).length, 1, 'id1 应 1 份');
  global.window = prev;
});
t('gachaDraw 加权池含重复 id 时仍不重复', function () {
  var pool = [
    { id: 1 }, { id: 1 }, { id: 2 }, { id: 2 },
    { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }, { id: 7 }, { id: 8 }
  ];
  var d = G.gachaDraw(pool, 10);
  assert.strictEqual(d.length, 8, '应抽到 8 个不同 id');
  assert.strictEqual(new Set(d.map(function (x) { return x.id; })).size, 8);
});
t('listItemHtml 黑名单图片不跳转 / 收藏图片与游戏名都跳转', function () {
  var it = { id: 5, title: 'T', slug: 's', poster: 'p.png', category: '游戏', author: 'a', pv_text: '1w' };
  var black = G.listItemHtml(it, false);
  assert.ok(black.indexOf('list-link') < 0, '黑名单不应有图片跳转链接');
  assert.ok(black.indexOf('data-jump') < 0, '黑名单不应有 data-jump');
  var fav = G.listItemHtml(it, true);
  assert.ok(fav.indexOf('list-name-link') >= 0, '收藏游戏名应为链接');
  assert.ok(fav.indexOf('data-jump="s"') >= 0, '收藏应有 data-jump');
  assert.ok(fav.indexOf('class="list-link"') >= 0, '收藏图片应为链接');
});

/* ---------- 跳转环境判断 ---------- */
t('inBiliEnv 识别 bilibili 域名 / 本地返回 false', function () {
  var prev = global.window;
  global.window = { location: { hostname: 'www.bilibili.com' } };
  assert.strictEqual(G.inBiliEnv(), true);
  global.window = { location: { hostname: 'toy.bilibili.com' } };
  assert.strictEqual(G.inBiliEnv(), true);
  global.window = { location: { hostname: 'localhost' } };
  assert.strictEqual(G.inBiliEnv(), false, '本地不应触发 SDK 跳转');
  global.window = { location: { hostname: 'example.github.io' } };
  assert.strictEqual(G.inBiliEnv(), false, '外部域名不应触发 SDK 跳转');
  global.window = prev;
});

/* ---------- 本地预览识别 ---------- */
t('isLocalPreview 识别 localhost / file，真机返回 false', function () {
  var prev = global.window;
  global.window = { location: { hostname: 'localhost', protocol: 'http:' } };
  assert.strictEqual(G.isLocalPreview(), true);
  global.window = { location: { hostname: '127.0.0.1', protocol: 'http:' } };
  assert.strictEqual(G.isLocalPreview(), true);
  global.window = { location: { hostname: '', protocol: 'file:' } };
  assert.strictEqual(G.isLocalPreview(), true);
  global.window = { location: { hostname: 'www.bilibili.com', protocol: 'https:' } };
  assert.strictEqual(G.isLocalPreview(), false);
  global.window = prev;
});

/* ---------- 网络：真实分页拉取 ---------- */
t('fetchAll 拉取全量（需网络，约188条）', function () {
  return G.fetchAll().then(function (d) {
    assert.ok(d.items.length >= 180, '应拉取约188条，实得 ' + d.items.length);
    assert.ok(d.categories.length >= 4, '分类应≥4');
    var ids = new Set(d.items.map(function (x) { return x.id; }));
    assert.strictEqual(ids.size, d.items.length, '不应有重复 id');
    console.log('   ↳ 实得 ' + d.items.length + ' 条，分类 ' + d.categories.join('/'));
  }).catch(function (e) {
    console.log('   ⚠ 网络不可用，跳过 fetchAll 断言：' + e.message);
  });
});

Promise.all(pending).then(function () {
  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
});
