/* 起点书单：筛选 / 排序 / 分页 逻辑 */
(function () {
  "use strict";

  // ---------- 常量与纯函数（可被 Node 冒烟测试引用） ----------
  var TIERS = [
    { name: "千钧",   min: 1500 },
    { name: "两千均", min: 3000 },
    { name: "精品",   min: 4500 },
    { name: "大精品", min: 9000 },
    { name: "万订",   min: 15000 },
    { name: "五万订", min: 75000 },
    { name: "十万订", min: 150000 },
  ];

  var LEVEL_ORDER = { Lv1: 1, Lv2: 2, Lv3: 3, Lv4: 4, Lv5: 5, "大神": 6, "白金": 7 };
  var LEVELS = ["Lv1", "Lv2", "Lv3", "Lv4", "Lv5", "大神", "白金"];

  // 成绩档位：基于销量基础取值
  function tierOf(sale) {
    for (var i = TIERS.length - 1; i >= 0; i--) {
      if (sale >= TIERS[i].min) return TIERS[i].name;
    }
    return "千钧以下";
  }

  function avgOf(sale) {
    return Math.round((sale * 2) / 3);
  }

  function filterBooks(books, cond) {
    var kwName = (cond.name || "").toLowerCase();
    var kwAuthor = (cond.author || "").toLowerCase();
    return books.filter(function (b) {
      if (cond.categories && cond.categories.size && !cond.categories.has(b.c)) return false;
      if (kwName && b.n.toLowerCase().indexOf(kwName) < 0) return false;
      if (kwAuthor && b.a.toLowerCase().indexOf(kwAuthor) < 0) return false;
      if (cond.levels && cond.levels.size && !cond.levels.has(b.l)) return false;
      if (cond.tiers && cond.tiers.size && !cond.tiers.has(tierOf(b.s))) return false;
      return true;
    });
  }

  function sortBooks(books, key, dir) {
    if (!key || !dir) return books.slice();
    var cmp;
    if (key === "avg") {
      cmp = function (x, y) { return avgOf(x.s) - avgOf(y.s); };
    } else if (key === "l") {
      cmp = function (x, y) { return (LEVEL_ORDER[x.l] || 99) - (LEVEL_ORDER[y.l] || 99); };
    } else {
      cmp = function (x, y) { return x[key].localeCompare(y[key], "zh"); };
    }
    var sorted = books.slice();
    sorted.sort(function (x, y) { return dir * cmp(x, y); });
    return sorted;
  }

  function paginate(list, page, pageSize) {
    var total = list.length;
    var pages = Math.max(1, Math.ceil(total / pageSize));
    var cur = Math.min(Math.max(1, page), pages);
    var start = (cur - 1) * pageSize;
    return {
      rows: list.slice(start, start + pageSize),
      page: cur,
      pages: pages,
      total: total,
      start: start + 1,
    };
  }

  var CORE = { TIERS: TIERS, LEVEL_ORDER: LEVEL_ORDER, LEVELS: LEVELS, tierOf: tierOf, avgOf: avgOf, filterBooks: filterBooks, sortBooks: sortBooks, paginate: paginate };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = CORE;
  }

  // ---------- DOM 部分 ----------
  if (typeof window === "undefined" || typeof document === "undefined") return;

  var $ = function (id) { return document.getElementById(id); };
  var state = { sortKey: null, sortDir: 0, page: 1, pageSize: 20, showRec: true };
  var mselInstances = {};
  var books = (window.BOOKS || []).slice();

  // 置顶推荐数据：始终展示在所有数据前，序号 0
  var PINNED = [
    { c: "轻小说", n: "《斗罗之我的老婆是银龙王》", a: "炫光超佛帝", l: "/", avg: "/", link: "https://www.qidian.com/book/1024104863/", pinned: true },
    { c: "轻小说", n: "《斗罗大陆之我能抽取无限武魂》", a: "炫光超佛帝", l: "/", avg: "/", link: "https://book.qq.com/book-detail/34104863", pinned: true },
  ];

  // 多选下拉组件：带"全部"项，默认全部
  function createMultiSelect(containerId, options) {
    var root = $(containerId);
    var allOptions = [{ value: "", label: "全部" }].concat(options);
    var allValues = options.map(function (o) { return o.value; });
    var inst = { selected: new Set(allValues), allValues: allValues };

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "msel-btn";
    var labelSpan = document.createElement("span");
    var caret = document.createElement("span");
    caret.className = "caret";
    btn.appendChild(labelSpan);
    btn.appendChild(caret);

    var panel = document.createElement("div");
    panel.className = "msel-panel";
    allOptions.forEach(function (opt, idx) {
      var lab = document.createElement("label");
      lab.className = "msel-item";
      if (idx === 1) lab.classList.add("divider");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.v = opt.value;
      var span = document.createElement("span");
      span.textContent = opt.label;
      lab.appendChild(cb);
      lab.appendChild(span);
      panel.appendChild(lab);
    });

    root.appendChild(btn);
    root.appendChild(panel);

    function allOn() { return inst.selected.size === inst.allValues.length; }

    function syncChecks() {
      var on = allOn();
      var cbs = panel.querySelectorAll("input");
      cbs.forEach(function (cb) {
        if (cb.dataset.v === "") {
          cb.checked = on;
          cb.closest(".msel-item").classList.toggle("checked", on);
        } else {
          var checked = inst.selected.has(cb.dataset.v);
          cb.checked = checked;
          cb.closest(".msel-item").classList.toggle("checked", checked);
        }
      });
      labelSpan.textContent = on ? "全部" : (inst.selected.size ? "已选 " + inst.selected.size + " 项" : "不限");
    }

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      root.classList.toggle("open");
    });
    panel.addEventListener("click", function (e) { e.stopPropagation(); });
    panel.addEventListener("change", function (e) {
      var cb = e.target;
      if (cb.dataset.v === "") {
        // 取消"全部"时连带取消所有项；再点则全选
        inst.selected = allOn() ? new Set() : new Set(inst.allValues);
      } else {
        if (cb.checked) inst.selected.add(cb.dataset.v);
        else inst.selected.delete(cb.dataset.v);
      }
      syncChecks();
    });
    document.addEventListener("click", function () { root.classList.remove("open"); });

    // 全选或一项未选（不限）时该筛选不生效
    inst.getValue = function () {
      if (!inst.selected.size || allOn()) return null;
      return new Set(inst.selected);
    };
    inst.reset = function () { inst.selected = new Set(inst.allValues); syncChecks(); };
    syncChecks();
    return inst;
  }

  function categoryOptions() {
    var seen = {};
    books.forEach(function (b) { seen[b.c] = 1; });
    return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, "zh"); })
      .map(function (c) { return { value: c, label: c }; });
  }

  function collectConditions() {
    return {
      categories: mselInstances.category ? mselInstances.category.getValue() : null,
      name: $("fName").value.trim(),
      author: $("fAuthor").value.trim(),
      levels: mselInstances.level ? mselInstances.level.getValue() : null,
      tiers: mselInstances.tier ? mselInstances.tier.getValue() : null,
    };
  }

  function updateSortSelect() {
    var sel = $("sortSelect");
    if (state.sortKey && state.sortDir) sel.value = state.sortKey;
    else sel.value = "";
    var btn = $("sortDirBtn");
    if (state.sortKey && state.sortDir) {
      btn.textContent = state.sortDir === 1 ? "↑" : "↓";
      btn.disabled = false;
    } else {
      btn.textContent = "↓";
      btn.disabled = true;
    }
  }

  function applySortFromSelect() {
    var sel = $("sortSelect");
    var key = sel.value;
    if (!key) { state.sortKey = null; state.sortDir = 0; }
    else { state.sortKey = key; state.sortDir = 1; }
  }

  function sortableKeys() {
    return { c: "c", n: "n", a: "a", l: "l", avg: "avg" };
  }

  function render() {
    var cond = collectConditions();
    var filtered = filterBooks(books, cond);
    var sorted = sortBooks(filtered, state.sortKey, state.sortDir);
    var pg = paginate(state.showRec ? PINNED.concat(sorted) : sorted, state.page, state.pageSize);

    state.page = pg.page;

    // 表头箭头
    document.querySelectorAll(".book-table th[data-key]").forEach(function (th) {
      var key = th.getAttribute("data-key");
      th.classList.remove("sorted");
      th.removeAttribute("data-arrow");
      if (state.sortKey === key) {
        th.classList.add("sorted");
        th.setAttribute("data-arrow", state.sortDir === 1 ? "↑" : "↓");
      }
    });
    updateSortSelect();

    // 统计信息
    $("totalHint").textContent = "共 " + books.length.toLocaleString() + " 本";
    $("resultInfo").textContent = "查询到 " + pg.total.toLocaleString() + " 本";

    // 桌面表格
    var tbody = $("tbody");
    tbody.innerHTML = "";
    if (!pg.rows.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7" class="empty">没有符合条件的书</td></tr>';
    }
    var normalStart = (pg.page - 1) * state.pageSize - PINNED.length;
    if (normalStart < 0) normalStart = 0;
    var normalCount = 0;
    pg.rows.forEach(function (b) {
      var avg = b.avg != null ? b.avg : avgOf(b.s);
      var link = b.link || ("https://www.qidian.com/so/" + encodeURIComponent(b.n) + ".html");
      var idx = b.pinned ? "友情推荐" : normalStart + (normalCount++) + 1;
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td class="idx">' + idx + "</td>" +
        "<td>" + esc(b.c) + "</td>" +
        "<td>" + esc(b.n) + "</td>" +
        "<td>" + esc(b.a) + "</td>" +
        '<td><span class="lvl-badge lvl-' + b.l + '">' + b.l + "</span></td>" +
        '<td class="avg">' + avg.toLocaleString() + "</td>" +
        '<td><a class="book-link" target="_blank" rel="noopener" href="' + link + '">跳转</a></td>';
      tbody.appendChild(tr);
    });

    // 手机卡片
    var list = $("cardList");
    list.innerHTML = "";
    if (!pg.rows.length) {
      list.innerHTML = '<div class="empty">没有符合条件的书</div>';
    }
    var nStart = (pg.page - 1) * state.pageSize - PINNED.length;
    if (nStart < 0) nStart = 0;
    var nCount = 0;
    pg.rows.forEach(function (b) {
      var avg = b.avg != null ? b.avg : avgOf(b.s);
      var link = b.link || ("https://www.qidian.com/so/" + encodeURIComponent(b.n) + ".html");
      var idx = b.pinned ? "友情推荐" : nStart + (nCount++) + 1;
      var card = document.createElement("div");
      card.className = "card";
      card.innerHTML =
        '<div class="card-row1"><span class="card-idx">' + idx + '</span><span class="card-name">' + esc(b.n) + '</span><span class="card-cat">' + esc(b.c) + "</span></div>" +
        '<div class="card-row2"><span class="card-meta"><span class="card-author">' + esc(b.a) + '</span><span class="lvl-badge lvl-' + b.l + '">' + b.l + "</span></span>" +
        '<span class="card-right"><span class="card-avg">均订 <b>' + avg.toLocaleString() + "</b></span>" +
        '<a class="card-link" target="_blank" rel="noopener" href="' + link + '">跳转</a></span></div>';
      list.appendChild(card);
    });

    // 分页
    $("pageTotal").textContent = "/ " + pg.pages;
    $("pageInput").value = pg.page;
    $("pageInput").max = pg.pages;
    $("btnPrev").disabled = pg.page <= 1;
    $("btnNext").disabled = pg.page >= pg.pages;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }

  function doFilter() {
    state.page = 1;
    render();
  }

  function resetAll() {
    mselInstances.category.reset();
    mselInstances.level.reset();
    mselInstances.tier.reset();
    state.sortKey = null;
    state.sortDir = 0;
    state.page = 1;
    $("fName").value = "";
    $("fAuthor").value = "";
    $("sortSelect").value = "";
    render();
  }

  function bindEvents() {
    var toastTimer = null;
    $("helpBtn").addEventListener("click", function () {
      var t = $("toast");
      t.classList.add("show");
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
    });
    $("btnFilter").addEventListener("click", doFilter);
    $("btnReset").addEventListener("click", resetAll);
    $("fName").addEventListener("keydown", function (e) { if (e.key === "Enter") doFilter(); });
    $("fAuthor").addEventListener("keydown", function (e) { if (e.key === "Enter") doFilter(); });
    // 表头排序三态：正序 -> 倒序 -> 取消
    document.querySelectorAll(".book-table th[data-key]").forEach(function (th) {
      th.addEventListener("click", function () {
        var key = th.getAttribute("data-key");
        if (key === "link" || key === "idx") return;
        if (state.sortKey === key) {
          if (state.sortDir === 1) state.sortDir = -1;
          else if (state.sortDir === -1) { state.sortDir = 0; state.sortKey = null; }
          else state.sortDir = 1;
        } else {
          state.sortKey = key;
          state.sortDir = 1;
        }
        state.page = 1;
        render();
      });
    });

    $("sortSelect").addEventListener("change", function () {
      applySortFromSelect();
      state.page = 1;
      render();
    });
    $("sortDirBtn").addEventListener("click", function () {
      if (!state.sortKey || !state.sortDir) return;
      state.sortDir = state.sortDir === 1 ? -1 : 1;
      state.page = 1;
      render();
    });

    $("pageSize").addEventListener("change", function () {
      state.pageSize = parseInt(this.value, 10);
      state.page = 1;
      render();
    });

    $("showRec").addEventListener("change", function () {
      state.showRec = this.checked;
      state.page = 1;
      render();
    });

    $("btnPrev").addEventListener("click", function () {
      if (state.page > 1) { state.page--; render(); }
    });
    $("btnNext").addEventListener("click", function () {
      var pg = paginate(sortBooks(filterBooks(books, collectConditions()), state.sortKey, state.sortDir), state.page + 1, state.pageSize);
      state.page = pg.page;
      render();
    });
    $("pageInput").addEventListener("change", function () {
      var p = parseInt(this.value, 10);
      if (isNaN(p) || p < 1) { this.value = state.page; return; }
      state.page = p;
      render();
    });
  }

  function init() {
    mselInstances.category = createMultiSelect("mselCategory", categoryOptions());
    mselInstances.level = createMultiSelect("mselLevel", LEVELS.map(function (l) { return { value: l, label: l }; }));
    mselInstances.tier = createMultiSelect("mselTier", TIERS.map(function (t) { return { value: t.name, label: t.name }; }));
    bindEvents();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
