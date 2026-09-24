const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');

const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const edge = stripTypeScriptTypes(fs.readFileSync(__dirname + '/../supabase/functions/kapparos-sync/index.ts', 'utf8'));
const expenseId = 'auto-chicken-inventory-cost';

assert.match(html, /<option value="paid">Paid<\/option>\s*<option value="treifa">טריפה<\/option>/);
assert.doesNotMatch(html, /id="chickenOutcome"/);
assert.match(fs.readFileSync(__dirname + '/../supabase/admin-save-stock.sql', 'utf8'), /\('paid', 'treifa', 'dead'\)/);

function source(name) {
  const start = html.search(new RegExp('    (?:async )?function ' + name + '\\('));
  assert.ok(start >= 0, name);
  return html.slice(start, html.indexOf('\n    }', start) + 6);
}

function fixture() {
  return {
    chickenCostModelVersion: 1, inventory: 100,
    chickenPurchaseCost: 13, invalidShechitaCost: 5, unsoldChickenCost: 8,
    chickenExpenseName: 'Chickens',
    accountingExpenses: [
      { id: 'ordinary', name: 'Supplies', amount: 26, paid: true, date: '2026-09-10' },
      { id: expenseId, name: 'Chickens', amount: 999, paid: false, date: '2026-09-11', note: '', category: 'Inventory', createdAt: 'original' }
    ]
  };
}

function salesFixture() {
  return [
    { id: 'kosher', status: 'paid', quantity: 10, price: 230, paymentType: 'cash', paidOn: '2026-09-11' },
    { id: 'treifa', status: 'treifa', quantity: 2, price: 46, paymentType: 'credit', paidOn: '2026-09-11' },
    { id: 'dead', status: 'dead', quantity: 3, price: 0 },
    { id: 'reserved', status: 'reserved', quantity: 4, price: 92 }
  ];
}

const browserEnv = vm.createContext({ state: { settings: fixture(), sales: salesFixture() } });
vm.runInContext(source('getSaleStatus') + source('getChickenAccountingBreakdown') + source('normalizeChickenPurchaseSettings'), browserEnv);
assert.equal(vm.runInContext("getSaleStatus({status:'paid',chickenOutcome:'invalid'})", browserEnv), 'treifa', 'Legacy outcome records remain טריפה');
const breakdown = vm.runInContext('getChickenAccountingBreakdown()', browserEnv);
assert.deepEqual(JSON.parse(JSON.stringify(breakdown)), {
  inventory: 100, paid: 10, kosher: 10, invalid: 2, dead: 3, unsold: 85, used: 15,
  kosherRate: 13, invalidRate: 5, unsoldRate: 8,
  kosherExpense: 130, invalidExpense: 10, unsoldExpense: 680, totalExpense: 820
});
vm.runInContext("normalizeChickenPurchaseSettings(state.settings, '2026-09-11', '2026-09-11T12:00:00Z', state.sales)", browserEnv);
assert.equal(browserEnv.state.settings.accountingExpenses[1].amount, 820);
assert.equal(browserEnv.state.settings.accountingExpenses[1].paid, false);
assert.equal(browserEnv.state.settings.accountingExpenses[1].date, '2026-09-11');
assert.equal(browserEnv.state.settings.accountingExpenses[1].createdAt, 'original');
assert.match(browserEnv.state.settings.accountingExpenses[1].note, /10 paid/);
assert.match(browserEnv.state.settings.accountingExpenses[1].note, /3 טויטע/);
const stable = JSON.stringify(browserEnv.state.settings);
vm.runInContext("normalizeChickenPurchaseSettings(state.settings, '2026-09-11', 'later', state.sales)", browserEnv);
assert.equal(JSON.stringify(browserEnv.state.settings), stable, 'Repeated normalization is stable');

const edgeStart = edge.indexOf('function normalizeChickenPurchaseSettings(');
const edgeEnd = edge.indexOf('\n}', edgeStart) + 2;
const serverNormalize = new Function(edge.slice(edgeStart, edgeEnd) + ';return normalizeChickenPurchaseSettings;')();
const serverSettings = serverNormalize(fixture(), '2026-09-11', '2026-09-11T12:00:00Z', salesFixture());
assert.equal(serverSettings.accountingExpenses[1].amount, 820, 'Server uses the same outcome model');
assert.equal(serverSettings.accountingExpenses[1].note, browserEnv.state.settings.accountingExpenses[1].note);

const env = vm.createContext({
  expensePaymentEntryPending: false,
  document: { getElementById: () => ({ hidden: false }) },
  sessionStorage: { getItem: () => null, setItem() {} },
  state: { settings: JSON.parse(JSON.stringify(browserEnv.state.settings)), sales: salesFixture(), accountingRange: 'all', accountingTab: 'overview' },
  CHICKEN_EXPENSE_ID: expenseId,
  getLocalDateValue: () => '2026-09-11',
  money: value => '$' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  settingChickenPurchaseCost: { value: '13' }, settingInvalidShechitaCost: { value: '5' },
  settingUnsoldChickenCost: { value: '8' }, chickenPurchaseSummary: {}, chickenPurchaseTotal: {}
});
vm.runInContext([
  'getSaleStatus', 'getChickenAccountingBreakdown', 'normalizeChickenPurchaseSettings', 'getChickenPurchaseTotal',
  'syncChickenPurchaseExpense', 'getAccountingExpenses', 'updateChickenPurchasePreview'
].map(source).join('\n'), env);
env.updateChickenPurchasePreview();
assert.equal(env.chickenPurchaseTotal.textContent, '$820.00');
assert.match(env.chickenPurchaseSummary.textContent, /85 unsold × \$8\.00/);
assert.equal(vm.runInContext("getAccountingExpenses('2026-09').length", env), 2);
assert.equal(vm.runInContext("getAccountingExpenses('2026-08').length", env), 0);

Object.assign(env, {
  getPaymentMethod: () => null,
  accountingRange: { value: '' }, accountingMonth: { value: '' }, accountingMonthWrap: {}, accountingCalendarSection: {},
  accountingIncome: {}, accountingExpenseTotal: {}, accountingNetLabel: {}, accountingNet: {},
  accountingNetCard: { classList: { toggle() {} } }, accountingCalendar: {},
  accountingChickenTotal: {}, accountingKosherCount: {}, accountingKosherCost: {},
  accountingInvalidCount: {}, accountingInvalidCost: {}, accountingDeadCount: {},
  accountingUnsoldCount: {}, accountingUnsoldCost: {}, renderExpenseList() {}, setAccountingTab() {}
});
vm.runInContext(['isBanshakPayment', 'getAccountingMonth', 'getAccountingSaleDate', 'renderAccounting'].map(source).join('\n'), env);
env.renderAccounting();
assert.equal(env.accountingIncome.textContent, '$276.00');
assert.equal(env.accountingExpenseTotal.textContent, '$846.00');
assert.equal(env.accountingNetLabel.textContent, 'Deficit');
assert.equal(env.accountingNet.textContent, '$570.00');
assert.equal(env.accountingChickenTotal.textContent, 100);
assert.equal(env.accountingKosherCount.textContent, 10);
assert.equal(env.accountingInvalidCount.textContent, 2);
assert.equal(env.accountingDeadCount.textContent, 3);
assert.equal(env.accountingUnsoldCount.textContent, 85);

console.log('PASS: chicken outcomes, automatic unsold count, category costs, server parity, money overview, and sales overview totals.');
