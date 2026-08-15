/* ================= 工具 ================= */
function num(id) {
  const v = parseFloat(document.getElementById(id).value);
  return isNaN(v) || v < 0 ? 0 : v;
}
function sel(id) {
  const v = parseFloat(document.getElementById(id).value);
  return isNaN(v) ? 0 : v;
}
function fmtInt(n) { return Math.round(n).toLocaleString('zh-CN'); }
function fmtNum(n, dec) {
  if (!isFinite(n)) return '--';
  return n.toLocaleString('zh-CN', { maximumFractionDigits: dec, minimumFractionDigits: dec });
}

/* ================= 状态 ================= */
const REST_DAYS = { 0: 52, 1: 78, 2: 104 }; // 单休 / 大小周 / 双休
let restDays = REST_DAYS[2];
let totalManual = false;
let workManual = false;

/* ================= 取值与计算 ================= */
function computedTotal() {
  return num('in-salary') * 12 + num('in-fund') * 12 + num('in-bonus');
}
function computedWorkDays() {
  return 365 - restDays - num('in-leave') - num('in-holiday');
}
function totalSalary() {
  return totalManual ? num('in-total-manual') : computedTotal();
}
function workDays() {
  const v = workManual ? num('in-workdays-manual') : computedWorkDays();
  return Math.max(1, v);
}
function dailySalary() {
  return totalSalary() / workDays();
}
function earlyFactor() {
  return document.getElementById('chk-early').checked ? 0.95 : 1;
}
function envCoef() {
  return sel('sel-work') * sel('sel-sec') * sel('sel-env') * sel('sel-job') * earlyFactor();
}
function eduCoef() {
  return sel('sel-edu');
}
function effectiveHours() {
  return Math.max(0.5, num('in-workhours') + num('in-commute') - 0.5 * num('in-slack'));
}
function score() {
  const base = 35 * effectiveHours() * eduCoef();
  if (base <= 0) return 0;
  return dailySalary() * envCoef() / base;
}

/* ================= 渲染 ================= */
function render() {
  const ts = totalSalary();
  const wd = workDays();
  const ds = dailySalary();
  const ec = envCoef();
  const eh = effectiveHours();
  const edu = eduCoef();
  const sc = score();

  // 年度总薪资
  document.getElementById('total-salary-val').textContent = ts ? fmtInt(ts) + ' 元' : '--';
  // 年度工作天数
  document.getElementById('workdays-desc').textContent =
    '365 - ' + restDays + '（休息） - ' + fmtNum(num('in-leave'), 0) + ' - ' + fmtNum(num('in-holiday'), 0);
  document.getElementById('workdays-val').textContent = wd ? fmtInt(wd) + ' 天' : '--';

  // 平均日薪
  document.getElementById('daily-salary').textContent = ds ? fmtNum(ds, 1) : '--';

  // 综合系数
  document.getElementById('env-coef').textContent = fmtNum(ec, 3);
  document.getElementById('edu-coef').textContent = fmtNum(edu, 1);

  // 评估结果
  document.getElementById('score').textContent = fmtNum(sc, 2);
  document.getElementById('rb-daily').textContent = ds ? fmtNum(ds, 1) : '--';
  document.getElementById('rb-env').textContent = fmtNum(ec, 3);
  document.getElementById('rb-hours').textContent = fmtNum(eh, 1);
  document.getElementById('rb-edu').textContent = fmtNum(edu, 1);

  // 综合公式展示（分式）
  const ef = earlyFactor();
  document.getElementById('ft-daily').textContent = ds ? fmtNum(ds, 1) : '--';
  document.getElementById('ft-env').textContent = fmtNum(ec, 3);
  document.getElementById('ft-hours').textContent = fmtNum(eh, 1);
  document.getElementById('ft-edu').textContent = fmtNum(edu, 1);
  document.getElementById('ft-score').textContent = fmtNum(sc, 2);
  document.getElementById('formula-env').textContent =
    '综合系数 = ' + fmtNum(sel('sel-work'), 2) + ' × ' + fmtNum(sel('sel-sec'), 2) + ' × ' + fmtNum(sel('sel-env'), 2) +
    ' × ' + fmtNum(sel('sel-job'), 2) + ' × ' + (ef === 0.95 ? '0.95' : '1.0') + '（八点前）';

  renderRating(sc);
}

function renderRating(sc) {
  const el = document.getElementById('score');
  const label = document.getElementById('score-label');
  let cls, txt;
  if (sc >= 4) { cls = 's-sss'; txt = '💥 SSS 爽到爆炸'; }
  else if (sc >= 3) { cls = 's-ss'; txt = '🚀 SS 很爽'; }
  else if (sc >= 2.25) { cls = 's-s'; txt = '🌟 S 爽'; }
  else if (sc >= 1.5) { cls = 's-a'; txt = '👍 A 高质量工作'; }
  else if (sc >= 0.8) { cls = 's-b'; txt = '😐 B 一般'; }
  else if (sc >= 0.5) { cls = 's-c'; txt = '😓 C 很惨'; }
  else { cls = 's-d'; txt = '💔 D 惨爆了'; }
  el.className = 'score ' + cls;
  label.textContent = txt;
}

/* ================= 数字输入限制 ================= */
function bindNumeric(el) {
  el.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1 && !/[0-9.]/.test(e.key)) e.preventDefault();
  });
  el.addEventListener('input', function () {
    let v = this.value.replace(/[^0-9.]/g, '');
    const i = v.indexOf('.');
    if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '');
    if (v !== this.value) this.value = v;
    render();
  });
  el.addEventListener('blur', function () {
    if (this.value !== '' && this.value !== '.') {
      const n = parseFloat(this.value);
      this.value = isNaN(n) ? this.value : String(n);
    }
    render();
  });
}

/* ================= 模式切换（自动计算 / 直接填写） ================= */
function bindToggle(toggleId, manualInputId, valueId, getComputed, flagSetter) {
  const btn = document.getElementById(toggleId);
  const inp = document.getElementById(manualInputId);
  const val = document.getElementById(valueId);
  btn.addEventListener('click', function () {
    const manual = !flagSetter.get();
    flagSetter.set(manual);
    if (manual) {
      const c = getComputed();
      inp.value = c > 0 ? String(Math.round(c)) : '';
      inp.hidden = false;
      btn.textContent = '自动计算';
      btn.classList.add('on');
      val.classList.add('dim');
      inp.focus();
    } else {
      inp.value = '';
      inp.hidden = true;
      btn.textContent = '直接填写';
      btn.classList.remove('on');
      val.classList.remove('dim');
    }
    render();
  });
}

/* ================= 休息制度分段 ================= */
function bindRestSeg() {
  const seg = document.getElementById('seg-rest');
  seg.addEventListener('click', function (e) {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    seg.querySelectorAll('.seg-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    restDays = REST_DAYS[parseInt(b.dataset.rest, 10)];
    render();
  });
}

/* ================= 初始化 ================= */
function init() {
  ['in-salary', 'in-fund', 'in-bonus', 'in-leave', 'in-holiday',
   'in-workhours', 'in-commute', 'in-slack', 'in-total-manual', 'in-workdays-manual']
    .forEach(id => bindNumeric(document.getElementById(id)));

  ['sel-work', 'sel-sec', 'sel-env', 'sel-job', 'sel-edu'].forEach(id => {
    document.getElementById(id).addEventListener('change', render);
  });
  document.getElementById('chk-early').addEventListener('change', render);

  bindRestSeg();
  bindToggle('toggle-total', 'in-total-manual', 'total-salary-val', computedTotal,
    { get: () => totalManual, set: v => { totalManual = v; } });
  bindToggle('toggle-workdays', 'in-workdays-manual', 'workdays-val', computedWorkDays,
    { get: () => workManual, set: v => { workManual = v; } });

  render();
}

document.addEventListener('DOMContentLoaded', init);
