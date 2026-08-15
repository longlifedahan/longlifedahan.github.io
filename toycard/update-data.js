/*
 * 拉取 TOYSTORE 全量数据生成本地 data.js（离线直读 / 网络兜底）。
 * 用法：node update-data.js
 */
var fs = require('fs');
var PAGE = 60;

function getJSON(url) {
  return fetch(url, { signal: AbortSignal.timeout(20000) }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

(async function () {
  var API = 'https://api.bilitoy.beer/api/toys?p1=2&ps=' + PAGE;
  var first = await getJSON(API);
  var total = first.total || 0;
  var items = (first.items || []).slice();
  var pages = Math.max(1, Math.ceil(total / PAGE));
  for (var p = 2; p <= pages; p++) {
    var r = await getJSON(API + '&pn=' + p);
    items = items.concat(r.items || []);
  }
  // 精简字段，减小体积
  var KEYS = ['id', 'slug', 'title', 'poster', 'category', 'author', 'pv_text', 'store_tag'];
  items = items.map(function (it) {
    var o = {};
    KEYS.forEach(function (k) { if (it[k] != null) o[k] = it[k]; });
    return o;
  });
  var out = { total: total, categories: first.categories || [], items: items };
  fs.writeFileSync('data.js', 'window.TOYCARD_DATA = ' + JSON.stringify(out) + ';\n');
  console.log('已生成 data.js：' + items.length + ' 条，分类 ' + (first.categories || []).join('/') + '，体积 ' + Math.round(fs.statSync('data.js').size / 1024) + ' KB');
})().catch(function (e) {
  console.error('拉取失败：' + e.message);
  process.exit(1);
});
