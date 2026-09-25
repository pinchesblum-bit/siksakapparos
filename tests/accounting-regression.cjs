const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const expenseId = 'auto-chicken-inventory-cost';

assert.match(html, /<option value="paid">Paid<\/option>\s*<option value="treifa">טריפה<\/option>/);
assert.doesNotMatch(html, /id="chickenOutcome"/);
assert.match(html, /const isOutcomeOnly = \['treifa', 'dead'\]\.includes\(status\)/);
assert.match(html, /const isIncomeStatus = status === 'paid'/);
assert.match(html, /id="salesSearchCount"/);
assert.match(html, /id="salesSearchOptionsBtn"/);
assert.match(html, /id="salesPaymentFilter"/);
assert.match(html, /\.status-pill\.dead \{ color: #8b2e26; background: #f7d7d2;/);
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
    { id: 'treifa', status: 'treifa', quantity: 2, price: 0 },
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
const missingRates = vm.runInContext("getChickenAccountingBreakdown({inventory:10}, [{status:'paid',quantity:2}])", browserEnv);
assert.equal(missingRates.kosherRate, 13);
assert.equal(missingRates.invalidRate, 0);
assert.equal(missingRates.unsoldRate, 8);
assert.equal(missingRates.totalExpense, 90, 'Missing stored rates use the Admin defaults instead of zero');
vm.runInContext("normalizeChickenPurchaseSettings(state.settings, '2026-09-11', '2026-09-11T12:00:00Z', state.sales)", browserEnv);
assert.equal(browserEnv.state.settings.accountingExpenses[1].amount, 820);
assert.equal(browserEnv.state.settings.accountingExpenses[1].paid, false);
assert.equal(browserEnv.state.settings.accountingExpenses[1].date, '2026-09-11');
assert.equal(browserEnv.state.settings.accountingExpenses[1].createdAt, 'original');
assert.match(browserEnv.state.settings.accountingExpenses[1].note, /10 paid/);
assert.match(browserEnv.state.settings.accountingExpenses[1].note, /3 טויטע/);
browserEnv.state.settings.chickenExpenseAmountOverride = 777.77;
vm.runInContext("normalizeChickenPurchaseSettings(state.settings, '2026-09-11', 'manual', state.sales)", browserEnv);
assert.equal(browserEnv.state.settings.accountingExpenses[1].amount, 777.77, 'Manual chicken expense total remains stable');
browserEnv.state.settings.chickenExpenseAmountOverride = null;
vm.runInContext("normalizeChickenPurchaseSettings(state.settings, '2026-09-11', 'calculated', state.sales)", browserEnv);
assert.equal(browserEnv.state.settings.accountingExpenses[1].amount, 820, 'Clearing the manual total restores the category calculation');
const stable = JSON.stringify(browserEnv.state.settings);
vm.runInContext("normalizeChickenPurchaseSettings(state.settings, '2026-09-11', 'later', state.sales)", browserEnv);
assert.equal(JSON.stringify(browserEnv.state.settings), stable, 'Repeated normalization is stable');

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
vm.runInContext([
  'isBanshakPayment', 'getAccountingMonth', 'getAccountingSaleDate', 'getExpensePaymentTotals',
  'moneyToCents', 'getAccountingTotals', 'renderAccounting'
].map(source).join('\n'), env);
env.renderAccounting();
assert.equal(env.accountingIncome.textContent, '$230.00');
assert.equal(env.accountingExpenseTotal.textContent, '$846.00');
assert.equal(env.accountingNetLabel.textContent, 'Deficit');
assert.equal(env.accountingNet.textContent, '$616.00');
assert.equal(env.accountingChickenTotal.textContent, 100);
assert.equal(env.accountingKosherCount.textContent, 10);
assert.equal(env.accountingInvalidCount.textContent, 2);
assert.equal(env.accountingDeadCount.textContent, 3);
assert.equal(env.accountingUnsoldCount.textContent, 85);

env.state.sales[0].price = 1200;
env.renderAccounting();
assert.equal(env.accountingNetLabel.textContent, 'Profit');
assert.equal(env.accountingNet.textContent, '$354.00');
// Two treifa entries at an extra $6.50 each add $13 in supplier expense.
env.state.settings.invalidShechitaCost = 11.5;
env.syncChickenPurchaseExpense();
env.renderAccounting();
assert.equal(env.accountingIncome.textContent, '$1,200.00', 'Changing the treifa rate never changes customer income');
assert.equal(env.accountingInvalidCost.textContent, '$23.00 expense');
assert.equal(env.accountingExpenseTotal.textContent, '$859.00');
assert.equal(env.accountingNet.textContent, '$341.00', 'An extra $13 chicken expense lowers profit by $13');
assert.equal(env.state.settings.accountingExpenses.filter(expense => expense.id === expenseId).length, 1, 'Chicken expense is not double-counted');
env.state.settings.accountingExpenses.push({ id: 'delivery', name: 'Delivery', amount: 13, paid: false, date: '2026-09-11' });
env.renderAccounting();
assert.equal(env.accountingExpenseTotal.textContent, '$872.00');
assert.equal(env.accountingNet.textContent, '$328.00', 'Unpaid ordinary expenses reduce profit immediately');
let paymentTotals = env.getExpensePaymentTotals(env.state.settings.accountingExpenses);
assert.equal(paymentTotals.paid, 26);
assert.equal(paymentTotals.unpaid, 846);
env.state.settings.accountingExpenses[2].paid = true;
env.renderAccounting();
assert.equal(env.accountingNet.textContent, '$328.00', 'Paying an expense does not charge profit a second time');
paymentTotals = env.getExpensePaymentTotals(env.state.settings.accountingExpenses);
assert.equal(paymentTotals.paid, 39);
assert.equal(paymentTotals.unpaid, 833);
env.state.settings.accountingExpenses.pop();
env.renderAccounting();
assert.equal(env.accountingNet.textContent, '$341.00', 'Deleting an ordinary expense restores its amount to profit');

env.state.sales = [
  { status: 'paid', price: 100, paymentType: 'cash', paidOn: '2026-09-11', createdAt: '2026-08-01T12:00:00Z' },
  { status: 'paid', price: 75, paymentType: 'credit', isOnlineSale: true, paidAt: '2026-10-02T12:00:00Z' },
  { status: 'paid', price: 500, paymentType: 'banshak', paidOn: '2026-09-11' },
  { status: 'treifa', price: 500, paymentType: 'cash', paidOn: '2026-09-11' },
  { status: 'paid', chickenOutcome: 'invalid', price: 500, paymentType: 'cash', paidOn: '2026-09-11' },
  { status: 'dead', price: 500, paymentType: 'cash', paidOn: '2026-09-11' },
  { status: 'reserved', price: 500, paymentType: 'cash', paidOn: '2026-09-11' },
  { status: 'expired', price: 500, paymentType: 'cash', paidOn: '2026-09-11' }
];
env.state.settings.accountingExpenses = [
  { id: expenseId, amount: 100, date: '2026-09-11', paid: false },
  { id: 'october', amount: 50, date: '2026-10-02', paid: true },
  { id: 'undated', amount: 25, date: '', paid: false }
];
env.getLocalDateValue = date => date ? date.toISOString().slice(0, 10) : '2026-09-11';
env.state.accountingRange = 'month';
env.accountingMonth.value = '2026-09';
env.renderAccountingCalendar = (month, totals) => { env.calendarMonth = month; env.dailyTotals = totals; };
env.renderAccounting();
assert.equal(env.accountingIncome.textContent, '$100.00', 'Only actually paid customer sales enter monthly income');
assert.equal(env.accountingExpenseTotal.textContent, '$100.00');
assert.equal(env.accountingNet.textContent, '$0.00');
assert.equal(env.dailyTotals['2026-09-11'].income, 100);
assert.equal(env.dailyTotals['2026-09-11'].expenses, 100);
assert.equal(env.dailyTotals['2026-10-02'], undefined);
env.accountingMonth.value = '2026-10';
env.renderAccounting();
assert.equal(env.accountingIncome.textContent, '$75.00', 'Online paid income uses the payment timestamp');
assert.equal(env.accountingExpenseTotal.textContent, '$50.00');
assert.equal(env.accountingNet.textContent, '$25.00');
env.state.accountingRange = 'all';
env.renderAccounting();
assert.equal(env.accountingIncome.textContent, '$175.00');
assert.equal(env.accountingExpenseTotal.textContent, '$175.00', 'All-time includes expenses without dates');

env.state.sales = [{ status: 'paid', price: 0.3, paymentType: 'cash', paidOn: '2026-09-11' }];
env.state.settings.accountingExpenses = [
  { amount: 0.1, date: '2026-09-11' }, { amount: 0.2, date: '2026-09-11' }
];
env.renderAccounting();
assert.equal(env.accountingNetLabel.textContent, 'Profit', 'Balanced cents must not create a floating-point deficit');
assert.equal(env.accountingNet.textContent, '$0.00');
assert.equal(env.getAccountingTotals(env.state.sales, env.state.settings.accountingExpenses).net, 0);
env.state.accountingRange = 'month';
env.accountingMonth.value = '2026-09';
env.renderAccounting();
assert.equal(env.dailyTotals['2026-09-11'].expenses, 0.3, 'Calendar arithmetic is also exact to the cent');

Object.assign(env, {
  accountingOverview: {}, accountingSalesOverview: {}, accountingExpensesView: {}, accountingTabs: []
});
vm.runInContext(source('setAccountingTab'), env);
env.setAccountingTab('sales');
assert.equal(env.accountingRange.value, 'all', 'Inventory overview clearly displays all-time scope');
assert.equal(env.accountingRange.disabled, true);
assert.equal(env.accountingMonthWrap.hidden, true);
assert.equal(env.accountingMonth.disabled, true);
assert.equal(env.state.accountingRange, 'month', 'Changing tabs preserves the money overview filter');
env.setAccountingTab('overview');
assert.equal(env.accountingRange.value, 'month');
assert.equal(env.accountingRange.disabled, false);
assert.equal(env.accountingMonthWrap.hidden, false);
assert.equal(env.accountingMonth.disabled, false);
assert.equal(env.accountingMonth.value, '2026-09');
env.setAccountingTab('expenses');
assert.equal(env.accountingRange.value, 'month');
assert.equal(env.accountingMonthWrap.hidden, false);

Object.assign(env, {
  expirePastReservations() {}, getKapparosSold: () => 0, getHomeSummaryTotal: () => 0,
  getNeedsReservedTotal: () => 0, getNeedsSavedTotal: () => 0, getSaleTicketId: sale => sale.id || '',
  getPaymentPlan: () => null, showToast() {},
  Blob: class { constructor(parts) { env.exported = parts.join(''); } },
  URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
  document: { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } }
});
env.state.settings.paymentMethods = [{ id: 'cash', label: 'Cash' }, { id: 'credit', label: 'Credit card' }];
env.state.settings.customFields = [];
env.state.settings.reportLabels = { chickens: 'Inventory', paid: 'Available', needsReserved: 'Reserved', needsSaved: 'Saved' };
env.state.sales = [
  { status: 'paid', price: 10, paymentType: 'cash' },
  { status: 'paid', price: 20, paymentType: 'credit' },
  { status: 'paid', price: 30, paymentType: 'credit', isOnlineSale: true },
  { status: 'treifa', price: 500, paymentType: '' },
  { status: 'dead', price: 500, paymentType: '' },
  { status: 'paid', price: 500, paymentType: 'banshak' }
];
env.state.settings.accountingExpenses = [{ name: 'Delivery', amount: 13, paid: false }];
vm.runInContext(['xmlEscape', 'excelCell', 'excelRow', 'getStatusLabel', 'getSalePaymentType', 'getReportPaymentGroups', 'getReportSalesTotal', 'exportAllData'].map(source).join('\n'), env);
env.exportAllData();
function exportedSheet(name) {
  return env.exported.split(`<Worksheet ss:Name="${name}">`)[1].split('</Worksheet>')[0];
}
function moneyRow(label, amount) {
  return env.excelRow([label, { value: amount, type: 'Number', style: 'Currency' }]);
}
assert.ok(exportedSheet('Accounting').includes(moneyRow('Income', 60)));
assert.ok(exportedSheet('Accounting').includes(moneyRow('Expenses', 13)));
assert.ok(exportedSheet('Accounting').includes(moneyRow('Profit', 47)));
assert.ok(exportedSheet('Reports').includes(env.excelRow([
  'Credit card', { value: 1, type: 'Number', style: 'Integer' }, { value: 20, type: 'Number', style: 'Currency' }
])), 'Exported credit totals exclude online payments');
assert.ok(exportedSheet('Reports').includes(env.excelRow([
  'Online', { value: 1, type: 'Number', style: 'Integer' }, { value: 30, type: 'Number', style: 'Currency' }
])), 'Export includes the actual online income instead of zero');

console.log('PASS: chicken rates and profit, paid/unpaid expenses, status exclusions, date filters, exact cents, and export totals.');
