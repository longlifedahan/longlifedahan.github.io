// 冒烟测试：数据完整性与核心逻辑
"use strict";
const assert = require("assert");
const path = require("path");

global.window = {};
require(path.join(__dirname, "books.js"));
const books = global.window.BOOKS;
const { TIERS, LEVEL_ORDER, tierOf, avgOf, filterBooks, sortBooks, paginate } = require(path.join(__dirname, "app.js"));

// 数据完整性
assert.strictEqual(books.length, 15412, "数据条数应为 15412");
books.forEach(b => {
  assert.ok(b.c && b.n && b.a && b.l, `字段缺失: ${JSON.stringify(b)}`);
  assert.strictEqual(typeof b.s, "number", `销量应为数字: ${JSON.stringify(b)}`);
});
// 去重校验：同名同作者只保留均订最高的一条
const seenKey = new Map();
books.forEach(b => {
  const k = b.n + "|" + b.a;
  assert.ok(!seenKey.has(k), `存在同名同作者重复: ${b.n} ${b.a}`);
  seenKey.set(k, b.s);
});
const cats = new Set(books.map(b => b.c));
assert.strictEqual(cats.size, 24, "分类数应为 24");
const lvls = new Set(books.map(b => b.l));
assert.deepStrictEqual([...lvls].sort(), Object.keys(LEVEL_ORDER).sort(), "等级集合应完整");

// 成绩档位边界
assert.strictEqual(tierOf(1500), "千钧");
assert.strictEqual(tierOf(2999), "千钧");
assert.strictEqual(tierOf(3000), "两千均");
assert.strictEqual(tierOf(4499), "两千均");
assert.strictEqual(tierOf(4500), "精品");
assert.strictEqual(tierOf(8999), "精品");
assert.strictEqual(tierOf(9000), "大精品");
assert.strictEqual(tierOf(14999), "大精品");
assert.strictEqual(tierOf(15000), "万订");
assert.strictEqual(tierOf(74999), "万订");
assert.strictEqual(tierOf(75000), "五万订");
assert.strictEqual(tierOf(149999), "五万订");
assert.strictEqual(tierOf(150000), "十万订");
assert.strictEqual(tierOf(478023), "十万订");

// 均订换算
assert.strictEqual(avgOf(478023), Math.round((478023 * 2) / 3));
assert.strictEqual(avgOf(1500), 1000);

// 筛选
const all = books;
assert.strictEqual(filterBooks(all, { categories: new Set(["玄幻"]) }).length, 1783);
assert.strictEqual(filterBooks(all, { categories: new Set(["玄幻", "仙侠"]) }).length, 1783 + 1470);
assert.strictEqual(filterBooks(all, { categories: null }).length, all.length, "null 条件=不限");
const kw = filterBooks(all, { name: "斗破" });
assert.ok(kw.every(b => b.n.includes("斗破")));
const lvl = filterBooks(all, { levels: new Set(["白金"]) });
assert.ok(lvl.every(b => b.l === "白金"));
const tier = filterBooks(all, { tiers: new Set(["十万订"]) });
assert.ok(tier.length > 0 && tier.every(b => b.s >= 150000));
const combined = filterBooks(all, { categories: new Set(["都市"]), tiers: new Set(["万订", "五万订", "十万订"]) });
assert.ok(combined.every(b => b.c === "都市" && b.s >= 15000));

// 排序
const sortedAvg = sortBooks(all, "avg", 1);
for (let i = 1; i < sortedAvg.length; i++) assert.ok(avgOf(sortedAvg[i - 1].s) <= avgOf(sortedAvg[i].s), "均订应正序");
const sortedAvgD = sortBooks(all, "avg", -1);
assert.ok(avgOf(sortedAvgD[0].s) >= avgOf(sortedAvgD[sortedAvgD.length - 1].s), "均订应倒序");
const sortedLvl = sortBooks(all, "l", 1);
assert.ok(LEVEL_ORDER[sortedLvl[0].l] <= LEVEL_ORDER[sortedLvl[sortedLvl.length - 1].l], "等级应正序");
// 无排序时返回原顺序
const noSort = sortBooks(all, null, 0);
assert.strictEqual(noSort[0].n, all[0].n, "无排序应保持原顺序");

// 分页
const pg = paginate(all, 1, 20);
assert.strictEqual(pg.rows.length, 20);
assert.strictEqual(pg.pages, Math.ceil(15412 / 20));
assert.strictEqual(pg.total, 15412);
const pg2 = paginate(all, 999999, 50);
assert.strictEqual(pg2.page, pg2.pages, "越界页应被钳制到最后一页");
const pg3 = paginate(all, 0, 20);
assert.strictEqual(pg3.page, 1, "小于1页应回到第1页");

console.log("✅ 冒烟测试全部通过：", books.length, "条数据，筛选/排序/分页/档位边界均正确");
