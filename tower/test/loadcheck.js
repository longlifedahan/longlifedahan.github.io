/* 模拟浏览器（共享全局作用域）按序加载全部脚本并执行 init，检测耗时/报错 */
const fs = require('fs'), path = require('path');

global.localStorage = (() => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })();
global.window = { addEventListener: () => {}, toy: undefined };
const fakeEl = () => ({
  innerHTML: '', textContent: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
  addEventListener() {}, matches() { return false; }, scrollTop: 0, scrollHeight: 0, disabled: false, value: '', text: ''
});
global.document = {
  getElementById: () => fakeEl(), createElement: () => fakeEl(),
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener: () => {}, head: fakeEl(), documentElement: fakeEl(), hidden: true
};

const dir = path.join(__dirname, '..', 'js');
const src = ['data.js', 'game.js', 'save.js', 'rank.js', 'ui.js']
  .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

const t0 = Date.now();
try {
  eval(src);
  console.log('加载+init 成功，耗时', (Date.now() - t0) + 'ms');
} catch (e) {
  console.log('出错:', e && e.message, e && e.stack && e.stack.split('\n')[1]);
  process.exit(1);
}
setTimeout(() => process.exit(0), 200);
