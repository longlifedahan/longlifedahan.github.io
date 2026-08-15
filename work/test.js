// 冒烟测试：模拟 DOM 运行 app.js，验证计算与交互（非 'use strict'）
const fs = require('fs');
const path = require('path');

const assert = (cond, msg) => {
  if (!cond) { console.error('✗ ' + msg); process.exit(1); }
  console.log('✓ ' + msg);
};

class FakeEl {
  constructor(id) {
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.className = '';
    this.hidden = true;
    this.checked = false;
    this._listeners = {};
    this.dataset = {};
    this.classList = { add() {}, remove() {}, contains() { return false; } };
  }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  dispatch(t, extra) {
    const e = Object.assign({ type: t, target: this, key: '', preventDefault() { this._pd = true; } }, extra || {});
    (this._listeners[t] || []).forEach(fn => fn.call(this, e));
    return e;
  }
  focus() {}
  querySelectorAll() { return []; }
}

const els = {};
const document = {
  getElementById(id) { return els[id] || (els[id] = new FakeEl(id)); },
  addEventListener(t, fn) { if (t === 'DOMContentLoaded') this._loaded = fn; },
};

global.document = document;
global.window = global;

eval(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8'));
document._loaded();

// 重置默认值
function resetDefaults() {
  const def = {
    'in-salary': '10000', 'in-fund': '1200', 'in-bonus': '0',
    'in-leave': '10', 'in-holiday': '11',
    'in-workhours': '8', 'in-commute': '2', 'in-slack': '1',
    'sel-work': '1', 'sel-sec': '1.1', 'sel-env': '1', 'sel-job': '1', 'sel-edu': '1',
  };
  Object.keys(def).forEach(id => { els[id].value = def[id]; });
  els['chk-early'].checked = false;
  ['in-salary', 'in-fund', 'in-bonus', 'in-leave', 'in-holiday',
   'in-workhours', 'in-commute', 'in-slack', 'sel-work', 'sel-sec', 'sel-env', 'sel-job', 'sel-edu', 'chk-early']
    .forEach(id => els[id].dispatch('input'));
}
resetDefaults();

// ===== 默认计算 =====
assert(els['total-salary-val'].textContent === '134,400 元', '年度总薪资 = 134400 元');
assert(els['workdays-val'].textContent === '240 天', '年度工作天数 = 240 天');
assert(els['daily-salary'].textContent === '560.0', '平均日薪 = 560 元/天');
assert(els['env-coef'].textContent === '1.100', '综合系数 = 1.100');
assert(els['score'].textContent === '1.85', '性价比 = 1.85');
assert(els['score-label'].textContent === '👍 A 高质量工作', '默认评分档位 = A 高质量工作');
assert(els['ft-daily'].textContent === '560.0', '分式分子：平均日薪 = 560.0');
assert(els['ft-env'].textContent === '1.100', '分式分子：综合系数 = 1.100');
assert(els['ft-hours'].textContent === '9.5', '分式分母：每日有效时长 = 9.5');
assert(els['ft-edu'].textContent === '1.0', '分式分母：学历系数 = 1.0');
assert(els['ft-score'].textContent === '1.85', '分式结果 = 1.85');
assert(els['formula-env'].textContent.includes('× 1.0（八点前）'), '综合系数公式带八点前系数');

// ===== 手动填写总薪资 =====
els['toggle-total'].dispatch('click');
assert(els['in-total-manual'].hidden === false, '切换后总薪资变为可填写');
assert(els['in-total-manual'].value === '134400', '手动输入框预填计算值');
els['in-total-manual'].value = '150000';
els['in-total-manual'].dispatch('input');
assert(els['daily-salary'].textContent === '625.0', '手动总薪资生效：日薪 = 625');
els['toggle-total'].dispatch('click');
assert(els['in-total-manual'].hidden === true, '切回自动后隐藏手动输入');

// ===== 手动填写工作天数 =====
els['toggle-workdays'].dispatch('click');
els['in-workdays-manual'].value = '200';
els['in-workdays-manual'].dispatch('input');
assert(els['daily-salary'].textContent === '672.0', '手动工作天数生效：日薪 = 672');
els['toggle-workdays'].dispatch('click');

// ===== 学历系数展示 =====
els['sel-edu'].value = '1.2';
els['sel-edu'].dispatch('change');
assert(els['edu-coef'].textContent === '1.2', '学历系数展示 = 1.2');

// ===== 环境系数组合（公务员 × 五险一金 × 普通同事） =====
resetDefaults();
els['sel-work'].value = '1.25';
els['sel-env'].value = '1';
els['sel-env'].dispatch('change');
assert(els['env-coef'].textContent === '1.375', '公务员×五险一金×普通同事 综合系数 = 1.375');

// ===== 就业形式 × 八点前勾选 =====
resetDefaults();
els['sel-job'].value = '1.2';
els['chk-early'].checked = true;
els['chk-early'].dispatch('change');
assert(els['env-coef'].textContent === '1.254', '有编制×八点前上班 综合系数 = 1.254');
assert(els['formula-env'].textContent.includes('× 0.95（八点前）'), '勾选后公式展示 × 0.95');

// ===== 评分档位 B =====
resetDefaults();
els['sel-job'].value = '0.6';
els['sel-job'].dispatch('change');
assert(els['score'].textContent === '1.11', '不固定就业 性价比 = 1.11');
assert(els['score-label'].textContent === '😐 B 一般', '1.11 → B 一般');

// ===== 评分档位 D =====
resetDefaults();
els['sel-work'].value = '0.8';
els['sel-sec'].value = '0.8';
els['sel-env'].value = '0.9';
els['sel-job'].value = '0.6';
els['sel-edu'].value = '2.0';
els['in-workhours'].value = '12';
els['chk-early'].checked = true;
['sel-work', 'sel-sec', 'sel-env', 'sel-job', 'sel-edu', 'in-workhours', 'chk-early']
  .forEach(id => els[id].dispatch('change'));
assert(els['env-coef'].textContent === '0.328', '工厂工地×无保险×差环境×不固定×八点前 综合系数 = 0.328');
assert(els['score'].textContent === '0.19', '恶劣场景 性价比 = 0.19');
assert(els['score-label'].textContent === '💔 D 惨爆了', '0.19 → D 惨爆了');

// ===== 数字输入拦截与清洗 =====
resetDefaults();
const keyTest = els['in-salary'];
assert(keyTest.dispatch('keydown', { key: 'a' })._pd === true, '字母按键被拦截');
assert(keyTest.dispatch('keydown', { key: '5' })._pd !== true, '数字按键放行');
keyTest.value = 'abc12.5.6';
keyTest.dispatch('input');
assert(keyTest.value === '12.56', '非法字符被移除且只保留一个小数点');

console.log('\n全部通过 ✔');
