const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const edge = stripTypeScriptTypes(fs.readFileSync(__dirname + '/../supabase/functions/kapparos-sync/index.ts', 'utf8'));
const id = 'auto-chicken-inventory-cost';
function source(name) {
  const start = html.search(new RegExp('    (?:async )?function ' + name + '\\('));
  assert.ok(start >= 0, name);
  return html.slice(start, html.indexOf('\n    }', start) + 6);
}
function fixture() {
  return { inventory: 100, chickenPurchaseCost: 10, chickenExpenseName: 'Chickens',
    chickenInventoryRecorded: 100,
    chickenPurchaseBatches: [{ quantity: 200, unitCost: 10, date: '2026-08-31', createdAt: 'original' }],
    accountingExpenses: [{ id: 'ordinary', name: 'Supplies', amount: 26, paid: true },
      { id, name: 'Chickens', amount: 2000, paid: false, date: '2026-08-31', note: '', category: 'Inventory', createdAt: 'original' }] };
}
const normalize = new Function(source('normalizeChickenPurchaseSettings') + ';return normalizeChickenPurchaseSettings;')();
const es = edge.indexOf('function normalizeChickenPurchaseSettings(');
const ee = edge.indexOf('\n}', es) + 2;
const serverNormalize = new Function(edge.slice(es, ee) + ';return normalizeChickenPurchaseSettings;')();
const date = '2026-09-11', now = date + 'T12:00:00Z';
const settings = fixture();
normalize(settings, date, now);
assert.equal(settings.accountingExpenses[1].amount, 1000);
assert.deepEqual(settings.accountingExpenses[0], fixture().accountingExpenses[0]);
assert.equal(settings.accountingExpenses[1].paid, false);
assert.equal(settings.accountingExpenses[1].createdAt, 'original');
const stable = JSON.stringify(settings);
for (let i = 0; i < 5; i++) normalize(settings, date, now + i);
assert.equal(JSON.stringify(settings), stable, 'Repeated saves never duplicate purchases');
assert.deepEqual(serverNormalize(fixture(), date, now), settings, 'Backend repairs stale client totals identically');
settings.chickenPurchaseCost = 12.5;
normalize(settings, date, now);
assert.equal(settings.accountingExpenses[1].amount, 1250);
settings.inventory = 120;
normalize(settings, date, now);
assert.equal(settings.accountingExpenses[1].amount, 1500);
assert.deepEqual(settings.chickenPurchaseBatches.map(b => [b.quantity, b.unitCost, b.date]), [[100,12.5,'2026-08-31'],[20,12.5,date]]);
const env = vm.createContext({ expensePaymentEntryPending:false, document:{getElementById:()=>({hidden:false})}, sessionStorage:{getItem:()=>null,setItem(){}}, state: { settings, sales: [] }, CHICKEN_EXPENSE_ID: id,
  getLocalDateValue: () => date,
  money: n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  settingChickenPurchaseCost: { value: '10' }, chickenPurchaseSummary: {}, chickenPurchaseTotal: {} });
vm.runInContext(['normalizeChickenPurchaseSettings', 'getChickenPurchaseTotal', 'syncChickenPurchaseExpense', 'getAccountingExpenses', 'updateChickenPurchasePreview'].map(source).join('\n'), env);
assert.equal(vm.runInContext("getAccountingExpenses('2026-08')[0].amount", env), 1250);
assert.equal(vm.runInContext("getAccountingExpenses('2026-09')[0].amount", env), 250);
env.state.settings = fixture();
env.settingChickenPurchaseCost.value = '12.50';
const beforePreview = JSON.stringify(env.state.settings);
vm.runInContext('updateChickenPurchasePreview()', env);
assert.equal(env.chickenPurchaseSummary.textContent, '100 chickens × $12.50 = $1,250.00');
assert.equal(env.chickenPurchaseTotal.textContent, '$1,250.00');
assert.equal(JSON.stringify(env.state.settings), beforePreview, 'Typing a preview does not save');
env.settingChickenPurchaseCost.value = '';
vm.runInContext('updateChickenPurchasePreview()', env);
assert.equal(env.chickenPurchaseTotal.textContent, '$0.00');
env.state.settings.chickenPurchaseCost = 0.29;
vm.runInContext('syncChickenPurchaseExpense()', env);
assert.equal(env.state.settings.accountingExpenses[1].amount, 29);
env.state.settings.inventory = 0;
vm.runInContext('syncChickenPurchaseExpense()', env);
assert.equal(env.state.settings.accountingExpenses[1].amount, 0);

const field = () => ({ value: '', disabled: false, focus() {}, setCustomValidity() {} });
for (const name of ['expensePaymentType','expensePaymentDetails','expensePaymentDetailsField','expensePaymentDetailsLabel','expenseName','expenseAmount','expenseDate','expenseCategory','expenseNote','expensePaid','expenseModalTitle','deleteExpenseBtn','cancelExpenseBtn','editExpenseBtn','saveExpenseBtn']) env[name] = field();
Object.assign(env, { expenseForm: { classList: { toggle() {}, contains() { return false; } }, reportValidity: () => true }, setTimeout: fn => fn(),
  askConfirmation: async () => true, CHANGE_CONFIRMATION: 'Confirm', closeExpenseModal() {}, showToast() {},
  saveSettings() { env.syncChickenPurchaseExpense(); }, renderAccounting() {}, accountingMonth: {} });
vm.runInContext(source('updateExpensePaymentFields') + source('setExpenseFieldMode') + source('showExpenseEditor'), env);
vm.runInContext('showExpenseEditor({id: CHICKEN_EXPENSE_ID})', env);
assert.equal(env.expenseName.disabled, true);
assert.equal(env.expenseAmount.disabled, true);
assert.equal(env.expensePaid.disabled, false);
vm.runInContext('showExpenseEditor()', env);
assert.equal(env.expenseName.disabled, false);
assert.equal(env.expenseAmount.disabled, false);

async function checkSubmit() {
  const start = html.indexOf("    expenseForm.addEventListener('submit', async event => {");
  const finish = html.indexOf('\n    });', start) + 8;
  env.expenseForm.addEventListener = (_, handler) => { env.submitExpense = handler; };
  vm.runInContext(html.slice(start, finish), env);
  env.state.settings = fixture();
  env.syncChickenPurchaseExpense();
  env.state.editingExpenseId = id;
  env.expenseName.value = 'Changed outside Settings';
  env.expenseAmount.value = '9999';
  env.expenseDate.value = '2020-01-01';
  env.expenseCategory.value = 'Inventory';
  env.expenseNote.value = 'A permitted note';
  env.expensePaid.checked = false; env.expensePaymentType.value='cash';
  await env.submitExpense({ preventDefault() {} });
  const saved = env.state.settings.accountingExpenses[1];
  assert.equal(saved.name, 'Chickens');
  assert.equal(saved.amount, 1000);
  assert.equal(saved.date, '2026-08-31');
  assert.equal(saved.note, 'A permitted note');
}

async function checkPassword() {
  const views = [{ dataset: { settingsView: 'accounting' }, hidden: true }, { dataset: { settingsView: 'sales' }, hidden: true }];
  const storage = new Map();
  const auth = vm.createContext({ state: { page: 'settings' }, accountingSettingsUnlocked: false, pendingSecurityAction: null,
    LAST_SETTINGS_VIEW_KEY: 'last', LAST_TICKET_VIEW_KEY:'ticket', VALID_SETTINGS_VIEWS: new Set(['accounting','sales']), settingsHome: { hidden: false }, settingsViews: views,
    renderTicketDeliverySettings() {}, resetSettingsSection() {}, setSettingsEditMode() {}, settingsEditMode: {},
    sessionStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    openSecurityDialog(action) { auth.pendingSecurityAction = action; }, closeSecurityDialog() { auth.pendingSecurityAction = null; } });
  vm.runInContext(['showSettingsHome','openSettingsView','completeSecurityAction'].map(source).join('\n'), auth);
  vm.runInContext("openSettingsView('accounting')", auth);
  assert.equal(views[0].hidden, true);
  assert.equal(auth.pendingSecurityAction, 'accounting-settings');
  await auth.completeSecurityAction('verified-by-server');
  assert.equal(views[0].hidden, false);
  vm.runInContext('showSettingsHome()', auth);
  assert.equal(auth.accountingSettingsUnlocked, false);
  vm.runInContext("openSettingsView('accounting')", auth);
  assert.equal(views[0].hidden, true, 'Reopening settings asks again');
  assert.equal(auth.pendingSecurityAction, 'accounting-settings');
  auth.closeSecurityDialog();
  assert.equal(views[0].hidden, true, 'Cancel keeps protected settings hidden');
}
function checkSummary() {
  Object.assign(env, { getPaymentMethod: () => null, accountingRange: {}, accountingMonthWrap: {}, accountingCalendarSection: {},
    accountingIncome: {}, accountingExpenseTotal: {}, accountingNetLabel: {}, accountingNet: {},
    accountingNetCard: { classList: { toggle() {}, contains() { return false; } } }, accountingCalendar: {}, renderExpenseList() {}, setAccountingTab() {} });
  vm.runInContext(['isBanshakPayment','getAccountingMonth','getAccountingSaleDate','renderAccounting'].map(source).join('\n'), env);
  env.state.settings = fixture();
  env.state.settings.accountingExpenses[0].amount = 1500;
  env.state.settings.accountingExpenses.push({ id: 'paid-test', name: 'Test', paid: true, amount: 2500 });
  env.state.sales = [{ status: 'paid', paymentType: 'credit', price: 10, quantity: 1 },
    { status: 'paid', paymentType: 'banshak', price: 20, quantity: 2 }];
  env.state.accountingRange = 'all';
  env.renderAccounting();
  assert.equal(env.accountingIncome.textContent, '$10.00');
  assert.equal(env.accountingExpenseTotal.textContent, '$5,000.00');
  assert.equal(env.accountingNetLabel.textContent, 'Deficit');
  assert.equal(env.accountingNet.textContent, '$4,990.00');
  assert.equal(env.state.settings.accountingExpenses[1].amount, 1000, 'Sales do not reduce chicken purchase expense');
  env.state.settings.accountingExpenses = env.state.settings.accountingExpenses.filter(e => e.id === id);
  env.state.sales = [{ status: 'paid', paymentType: 'cash', price: 20, quantity: 1 }];
  env.renderAccounting();
  assert.equal(env.accountingIncome.textContent, '$20.00');
  assert.equal(env.accountingExpenseTotal.textContent, '$1,000.00');
  assert.equal(env.accountingNet.textContent, '$980.00');
}
(async () => {
  await checkSubmit();
  await checkPassword();
  checkSummary();
  console.log('PASS: corrected totals, repeated saves, rate/quantity edits, calendar totals, cents, zero inventory, live preview without saving, locked expense fields and submit guard, password navigation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
