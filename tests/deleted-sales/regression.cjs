// Node 24+. All HTTP calls are intercepted; only synthetic, in-memory data is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { webcrypto, createHash } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const sync = require('../../admin-sync.js');
const root = path.resolve(__dirname, '../..');
const db = new PGlite();
const source = fs.readFileSync(process.argv[2] || path.join(root, 'supabase/functions/kapparos-sync/index.ts'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const hash = text => createHash('sha256').update(text).digest('hex');
const config = { username: 'fixture', passwordHash: hash('fixture-password'), inventory: 100, defaultPrice: 23 };
const sale = (id, ticketId = '123456') => ({id, ticketId, quantity: 1, price: 23, status: 'paid', fullName: 'Synthetic fixture', createdAt: '2026-09-01T10:00:00Z'});
let handler, writes = [], beforeRpc;
const state = async () => (await db.query("select sales,settings,updated_at from kapparos_app_state where id='main'")).rows[0];
const reset = async (sales = [sale('keep')], settings = config) => {
  await db.query("insert into kapparos_app_state values ('main',$1,$2,now()) on conflict(id) do update set sales=excluded.sales,settings=excluded.settings,updated_at=excluded.updated_at", [sales, settings]);
  writes = []; beforeRpc = null;
};
const context = {
  Request, Response, TextEncoder, Uint8Array, URL, crypto: webcrypto, console,
  Deno: {env: {get: key => ({SUPABASE_URL:'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY:'fixture-only'}[key])}, serve: fn => {handler = fn;}},
  fetch: async (url, init = {}) => {
    assert(url.startsWith('https://fixture.invalid/rest/v1/'), 'Unexpected external request blocked');
    const route = url.split('/rest/v1/')[1], method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    if (method !== 'GET') writes.push({route, method, body});
    if (route.startsWith('kapparos_app_state?') && method === 'GET') {
      const row = await state(); return Response.json(row ? [row] : []);
    }
    if (route.startsWith('kapparos_sessions?') && method === 'GET') return Response.json([{token_hash: hash('fixture-token')}]);
    if (route === 'kapparos_sessions' && method === 'POST') return Response.json([]);
    if (route.startsWith('kapparos_sessions?') && method === 'DELETE') return Response.json([]);
    if (route === 'rpc/kapparos_save_admin_state' && method === 'POST') {
      if (beforeRpc) { const run = beforeRpc; beforeRpc = null; await run(); }
      const result = await db.query('select kapparos_save_admin_state($1,$2,$3) as saved', [body.p_sales, body.p_settings, body.p_deleted_sale_ids]);
      return Response.json(result.rows[0].saved);
    }
    throw Error('Unexpected database write/route: ' + method + ' ' + route);
  }
};
vm.runInNewContext(stripTypeScriptTypes(source), context);
const call = async (action, payload = {}, authorized = true) => {
  const response = await handler(new Request('https://fixture.invalid/sync', {
    method: 'POST', headers: {'Content-Type':'application/json', Origin:'https://pinchesblum-bit.github.io', ...(authorized ? {Authorization:'Bearer fixture-token'} : {})},
    body: JSON.stringify({action, ...payload})
  }));
  return {status: response.status, data: await response.json()};
};
const patch = (base, sales, settings = base.settings, deletedIds = []) => sync.request(base, base, {sales, settings}, deletedIds);
const noDataWrites = () => assert.equal(writes.filter(x => !x.route.startsWith('kapparos_sessions')).length, 0);
const chickenExpenseId = 'auto-chicken-inventory-cost';
const accountingSettings = () => ({
  ...config, chickenCostModelVersion: 1, chickenPurchaseCost: 13, invalidShechitaCost: 5,
  unsoldChickenCost: 8, chickenExpenseName: 'Chickens', accountingExpenses: []
});
const accountingSales = () => [
  {...sale('kosher', '100001'), quantity: 10, price: 230, paymentType: 'cash'},
  {...sale('treifa', '100002'), quantity: 2, price: 0, status: 'treifa'},
  {...sale('dead', '100003'), quantity: 3, price: 0, status: 'dead'},
  {...sale('reserved', '100004'), quantity: 4, price: 92, status: 'reserved'},
  {...sale('expired', '100005'), quantity: 5, price: 115, status: 'expired'}
];
const chickenExpense = row => {
  const found = row.settings.accountingExpenses.filter(expense => expense.id === chickenExpenseId);
  assert.equal(found.length, 1, 'Exactly one linked chicken expense exists');
  return found[0];
};
const profit = row => {
  const income = row.sales.reduce((sum, item) => (item.status || 'paid') === 'paid'
    && item.chickenOutcome !== 'invalid' && item.paymentType !== 'banshak'
    ? sum + Math.round(Number(item.price || 0) * 100) : sum, 0);
  const expenses = row.settings.accountingExpenses.reduce((sum, item) => sum + Math.round(Number(item.amount || 0) * 100), 0);
  return (income - expenses) / 100;
};
const saveOk = async payload => {
  const response = await call('save', payload);
  assert.equal(response.status, 200);
  assert.equal(response.data.settings._kapparosSaveError, undefined);
  const persisted = await state();
  assert.deepEqual(response.data.sales, persisted.sales, 'Response contains persisted sales');
  const {passwordHash, password, _legacyPassword, ...publicSettings} = persisted.settings;
  assert.deepEqual(response.data.settings, publicSettings, 'Response contains trigger-updated settings');
  return persisted;
};
let count = 0;
async function test(name, fn) { await reset(); await fn(); console.log('PASS', name); count++; }

(async () => {
  await db.exec('create role anon; create role authenticated; create role service_role; create table kapparos_app_state(id text primary key,sales jsonb,settings jsonb,updated_at timestamptz);');
  for (const file of ['tests/admin-sync/fixtures/kapparos_allocate_ticket_id.sql', 'supabase/chicken-accounting.sql', 'supabase/admin-save-stock.sql']) await db.exec(fs.readFileSync(path.join(root, file), 'utf8'));
  await test('login ignores stale browser orders and never changes existing sales or settings', async () => {
    const before = await state();
    const r = await call('login', {username:'fixture', password:'fixture-password', importLocal:true, localSales:[sale('deleted-old', '654321'), {...sale('keep'), fullName:'Stale overwrite'}], localSettings:{inventory:999}}, false);
    assert.equal(r.status, 200); assert(r.data.token); assert.deepEqual(r.data.sales, before.sales);
    assert.equal(r.data.settings.passwordHash, undefined); assert.deepEqual(await state(), before); noDataWrites();
  });
  await test('an empty cloud sales list is not refilled by old local sales', async () => {
    await reset([]); const before = await state();
    const r = await call('login', {username:'fixture', password:'fixture-password', importLocal:true, localSales:[sale('deleted-old')]}, false);
    assert.equal(r.status, 200); assert.deepEqual(r.data.sales, []); assert.deepEqual(await state(), before); noDataWrites();
  });
  await test('missing cloud row cannot be reconstructed from a browser backup', async () => {
    await db.exec("delete from kapparos_app_state where id='main'");
    const r = await call('login', {username:'fixture', password:'fixture-password', importLocal:true, localSales:[sale('deleted-old')]}, false);
    assert.equal(r.status, 503); assert.equal(await state(), undefined); assert.equal(writes.length, 0);
  });
  await test('incorrect password and missing session cannot write data', async () => {
    const before = await state();
    assert.equal((await call('login', {username:'fixture', password:'wrong', importLocal:true, localSales:[sale('deleted-old')]}, false)).status, 401);
    assert.equal((await call('save', {sales:[]}, false)).status, 401);
    assert.deepEqual(await state(), before); assert.equal(writes.length, 0);
  });
  await test('old full-snapshot saves are refused without restoring or deleting any record', async () => {
    const before = await state();
    for (const settings of [{}, {_kapparosWrite:{version:0}}, {_kapparosWrite:{version:'1'}}, {_kapparosWrite:{version:1, saleBases:[], settingsBases:{}}}, {_kapparosWrite:{version:1, saleBases:{}}}]) {
      const r = await call('save', {sales:[sale('deleted-old')], settings, knownSaleIds:['keep'], deletedSaleIds:['keep']});
      assert.equal(r.status, 409); assert.match(r.data.error, /refresh/);
    }
    assert.deepEqual(await state(), before); noDataWrites();
  });
  await test('current admin can create a sale and safely retry without changing existing sales', async () => {
    const base = await state(), payload = patch(base, [...base.sales, sale('new', '654321')]);
    for (let i=0; i<2; i++) {
      const r = await call('save', payload); assert.equal(r.status, 200); assert.equal(r.data.settings._kapparosSaveError, undefined);
    }
    const after = await state(); assert.equal(after.sales.length, 2); assert.deepEqual(after.sales.find(s=>s.id==='keep'), base.sales[0]);
  });
  await test('current edits work; stale edits and queued saves cannot resurrect a deleted sale', async () => {
    const base = await state();
    let r = await call('save', patch(base, [{...base.sales[0], fullName:'Edited fixture'}]));
    assert.equal(r.data.settings._kapparosSaveError, undefined);
    const beforeDelete = await state();
    r = await call('save', patch(beforeDelete, [], beforeDelete.settings, ['keep']));
    assert.equal(r.data.settings._kapparosSaveError, undefined);
    const afterDelete = await state();
    r = await call('save', patch(base, [{...base.sales[0], fullName:'Stale edit'}]));
    assert.equal(r.data.settings._kapparosSaveError.code, 'conflict'); assert.deepEqual(await state(), afterDelete);
  });
  await test('settings-only save preserves every current sale', async () => {
    const base = await state();
    const r = await call('save', patch(base, base.sales, {...base.settings, defaultPrice:25}));
    assert.equal(r.data.settings._kapparosSaveError, undefined); assert.equal(r.data.settings.defaultPrice, 25);
    assert.deepEqual((await state()).sales, base.sales);
  });
  await test('knownSaleIds cannot imply deletions in the current protocol', async () => {
    const base = await state(); const payload = patch(base, base.sales); delete payload.deletedSaleIds;
    payload.knownSaleIds = ['keep'];
    const r = await call('save', payload); assert.equal(r.data.settings._kapparosSaveError, undefined); assert.deepEqual((await state()).sales, base.sales);
  });
  await test('stock rejection leaves existing records unchanged', async () => {
    await db.query("update kapparos_app_state set settings=jsonb_set(settings,'{inventory}','1') where id='main'");
    const before = await state(); const r = await call('save', patch(before, [...before.sales, sale('too-many','654321')]));
    assert.equal(r.data.settings._kapparosSaveError.code, 'inventory'); assert.deepEqual(await state(), before);
  });
  await test('changing credentials cannot replay a sale deleted after its initial read', async () => {
    beforeRpc = async () => db.query("update kapparos_app_state set sales='[]' where id='main'");
    const r = await call('credentials', {currentPassword:'fixture-password', username:'fixture-new', newPassword:'fixture-new-password'});
    assert.equal(r.status, 200); assert.deepEqual((await state()).sales, []); assert.equal((await state()).settings.username, 'fixture-new');
    assert.deepEqual(writes.find(w=>w.route.startsWith('rpc/')).body.p_sales, []);
  });
  await test('changing credentials preserves existing and newly arrived online sales exactly', async () => {
    const expected = [sale('keep'), {...sale('online','654321'), isOnlineSale:true}];
    beforeRpc = async () => db.query("update kapparos_app_state set sales=$1 where id='main'", [expected]);
    const r = await call('credentials', {currentPassword:'fixture-password', username:'fixture-new'});
    assert.equal(r.status, 200); assert.deepEqual((await state()).sales, expected);
  });
  await test('a rate-only delta lowers profit by rate increase times all recorded treifa', async () => {
    await reset(accountingSales(), accountingSettings());
    const base = await state();
    assert.equal(chickenExpense(base).amount, 820);
    const payload = patch(base, base.sales, {...base.settings, invalidShechitaCost: 18});
    assert.deepEqual(payload.sales, []);
    assert.deepEqual(Object.keys(payload.settings._kapparosWrite.settingsBases), ['invalidShechitaCost']);
    const after = await saveOk(payload);
    assert.equal(chickenExpense(after).amount, 846);
    assert.equal(profit(after), profit(base) - 26);
    assert.equal(after.settings.invalidShechitaCost, 18);
  });
  await test('an ordinary $13 expense lowers profit exactly $13 without replacing supplier cost', async () => {
    await reset(accountingSales(), accountingSettings());
    const base = await state();
    const ordinary = {id: 'ordinary-13', name: 'Supplies', amount: 13, date: '2026-09-24', paid: false};
    const settings = {...base.settings, accountingExpenses: [...base.settings.accountingExpenses, ordinary]};
    const after = await saveOk(patch(base, base.sales, settings));
    assert.equal(chickenExpense(after).amount, 820);
    assert.equal(profit(after), profit(base) - 13);
    assert.deepEqual(after.settings.accountingExpenses.find(item => item.id === ordinary.id), ordinary);
  });
  await test('all three per-chicken rates use complete quantities and currency rounding', async () => {
    await reset(accountingSales(), accountingSettings());
    let base = await state();
    for (const [key, value, increase] of [['chickenPurchaseCost', 14.25, 12.5], ['invalidShechitaCost', 6.17, 2.34], ['unsoldChickenCost', 9.01, 85.85]]) {
      const after = await saveOk(patch(base, base.sales, {...base.settings, [key]: value}));
      assert.equal(Math.round((profit(base) - profit(after)) * 100), Math.round(increase * 100));
      base = after;
    }
    assert.equal(chickenExpense(base).amount, 920.69);
  });
  await test('paid, treifa, dead, reserved, expired and free records reconcile with inventory', async () => {
    const sales = [...accountingSales(), {...sale('free', '100006'), quantity: 1, price: 23, paymentType: 'banshak'}];
    await reset(sales, accountingSettings());
    const current = await state();
    assert.equal(chickenExpense(current).amount, 825);
    assert.match(chickenExpense(current).note, /11 paid/);
    assert.match(chickenExpense(current).note, /2 טריפה/);
    assert.match(chickenExpense(current).note, /84 unsold/);
    assert.match(chickenExpense(current).note, /3 טויטע/);
    assert.equal(profit(current), 230 - 825, 'Free, reserved, expired and outcome records add no income');
  });
  await test('legacy paid records with invalid chicken outcome use the treifa cost', async () => {
    const sales = accountingSales().map(item => item.id === 'treifa' ? {...item, status: 'paid', chickenOutcome: 'invalid', price: 46} : item);
    await reset(sales, accountingSettings());
    const base = await state();
    assert.equal(chickenExpense(base).amount, 820);
    assert.equal(profit(base), 230 - 820);
    const after = await saveOk(patch(base, base.sales, {...base.settings, invalidShechitaCost: 18}));
    assert.equal(chickenExpense(after).amount, 846);
  });
  await test('quantity edits and deleted outcomes immediately recalculate supplier cost', async () => {
    await reset(accountingSales(), accountingSettings());
    let base = await state();
    let sales = base.sales.map(item => item.id === 'treifa' ? {...item, quantity: 3} : item);
    let after = await saveOk(patch(base, sales));
    assert.equal(chickenExpense(after).amount, 817, 'One unsold $8 chicken becomes one $5 treifa');
    base = after;
    sales = base.sales.filter(item => item.id !== 'dead');
    after = await saveOk(patch(base, sales, base.settings, ['dead']));
    assert.equal(chickenExpense(after).amount, 841, 'Deleting three dead outcomes restores three unsold costs');
  });
  await test('status changes replace supplier category rather than adding a second expense', async () => {
    await reset(accountingSales(), accountingSettings());
    let base = await state();
    let sales = base.sales.map(item => item.id === 'kosher' ? {...item, status: 'treifa', price: 0, paymentType: ''} : item);
    let after = await saveOk(patch(base, sales));
    assert.equal(chickenExpense(after).amount, 740);
    assert.equal(profit(after), -740);
    base = after;
    sales = base.sales.map(item => item.id === 'kosher' ? {...item, status: 'dead'} : item);
    after = await saveOk(patch(base, sales));
    assert.equal(chickenExpense(after).amount, 690);
    base = after;
    sales = base.sales.map(item => item.id === 'kosher' ? {...item, status: 'reserved', price: 230} : item);
    after = await saveOk(patch(base, sales));
    assert.equal(chickenExpense(after).amount, 770);
  });
  await test('inventory changes adjust only unsold cost', async () => {
    await reset(accountingSales(), accountingSettings());
    const base = await state();
    const after = await saveOk(patch(base, base.sales, {...base.settings, inventory: 110}));
    assert.equal(chickenExpense(after).amount, 900);
    assert.equal(profit(after), profit(base) - 80);
  });
  await test('online direct sale writes update supplier accounting without an admin save', async () => {
    await reset(accountingSales(), accountingSettings());
    const base = await state();
    const online = {...sale('online-accounting', '100006'), quantity: 2, price: 46, paymentType: 'credit', isOnlineSale: true};
    await db.query("update kapparos_app_state set sales=sales || $1::jsonb where id='main'", [[online]]);
    const after = await state();
    assert.equal(chickenExpense(after).amount, 830);
    assert.equal(profit(after), profit(base) + 36);
    assert.deepEqual(after.sales.find(item => item.id === online.id), online);
  });
  await test('an online sale arriving between Edge read and rate-save RPC is included once', async () => {
    await reset(accountingSales(), accountingSettings());
    const base = await state();
    const online = {...sale('online-race', '100006'), quantity: 2, price: 46, paymentType: 'credit', isOnlineSale: true};
    beforeRpc = async () => db.query("update kapparos_app_state set sales=sales || $1::jsonb where id='main'", [[online]]);
    const after = await saveOk(patch(base, base.sales, {...base.settings, invalidShechitaCost: 18}));
    assert.equal(chickenExpense(after).amount, 856);
    assert.equal(after.sales.filter(item => item.id === online.id).length, 1);
    assert.equal(profit(after), 276 - 856);
  });
  await test('concurrent online supplier recalculation rejects stale expense metadata and accepts a fresh retry', async () => {
    await reset(accountingSales(), accountingSettings());
    const base = await state();
    const ordinary = {id: 'ordinary-race', name: 'Supplies', amount: 13, paid: false, date: '2026-09-24'};
    const settings = {...base.settings, accountingExpenses: [...base.settings.accountingExpenses, ordinary]};
    beforeRpc = async () => db.query("update kapparos_app_state set sales=sales || $1::jsonb where id='main'", [[{...sale('online-expense-race', '100006'), quantity: 2, price: 46, paymentType: 'credit', isOnlineSale: true}]]);
    const rejected = await call('save', patch(base, base.sales, settings));
    assert.equal(rejected.data.settings._kapparosSaveError.code, 'conflict');
    const latest = await state();
    assert.equal(chickenExpense(latest).amount, 830);
    assert.equal(latest.settings.accountingExpenses.some(item => item.id === ordinary.id), false);
    const after = await saveOk(patch(latest, latest.sales, {...latest.settings, accountingExpenses: [...latest.settings.accountingExpenses, ordinary]}));
    assert.equal(chickenExpense(after).amount, 830);
    assert.deepEqual(after.settings.accountingExpenses.find(item => item.id === ordinary.id), ordinary);
    assert.equal(profit(after), 276 - 843);
  });
  await test('supplier recalculation preserves payment metadata, original date and ordinary expenses', async () => {
    const ordinary = {id: 'ordinary-kept', name: 'Equipment', amount: 40, paid: true, paymentType: 'cash', date: '2026-09-20'};
    const supplier = {id: chickenExpenseId, name: 'Old name', amount: 1234, date: '2026-09-01', category: 'Inventory', paid: true, paymentType: 'check', paymentDetails: 'Fixture check', order: 4, createdAt: '2026-09-01T10:00:00Z', updatedAt: '', note: 'Old derived count'};
    await reset(accountingSales(), {...accountingSettings(), accountingExpenses: [ordinary, supplier]});
    const base = await state();
    const after = await saveOk(patch(base, base.sales, {...base.settings, invalidShechitaCost: 18, chickenExpenseName: 'Supplier chickens'}));
    const actual = chickenExpense(after);
    for (const key of ['date', 'category', 'paid', 'paymentType', 'paymentDetails', 'order', 'createdAt']) assert.deepEqual(actual[key], supplier[key], key);
    assert.equal(actual.name, 'Supplier chickens');
    assert.equal(actual.amount, 846);
    assert.deepEqual(after.settings.accountingExpenses.find(item => item.id === ordinary.id), ordinary);
  });
  await test('missing rates use defaults while explicit zero stays zero', async () => {
    await reset(accountingSales(), {...config, inventory: 100});
    let base = await state();
    assert.equal(chickenExpense(base).amount, 810);
    assert.equal(base.settings.chickenPurchaseCost, 13);
    assert.equal(base.settings.invalidShechitaCost, 0);
    assert.equal(base.settings.unsoldChickenCost, 8);
    const after = await saveOk(patch(base, base.sales, {...base.settings, chickenPurchaseCost: 0, invalidShechitaCost: 0, unsoldChickenCost: 0}));
    assert.equal(chickenExpense(after).amount, 0);
    assert.equal(after.settings.chickenPurchaseCost, 0);
    assert.equal(after.settings.unsoldChickenCost, 0);
    assert.equal(profit(after), 230);
  });
  await test('duplicate linked expenses collapse to one without removing ordinary entries', async () => {
    const supplier = {id: chickenExpenseId, name: 'Chickens', amount: 999, paid: false, date: '2026-09-01', createdAt: 'fixture-created'};
    const ordinary = {id: 'ordinary-kept', name: 'Supplies', amount: 13, paid: false, date: '2026-09-02'};
    await reset(accountingSales(), {...accountingSettings(), accountingExpenses: [supplier, ordinary, {...supplier, amount: 1234}]});
    const after = await state();
    assert.equal(chickenExpense(after).amount, 820);
    assert.equal(after.settings.accountingExpenses.length, 2);
    assert.deepEqual(after.settings.accountingExpenses.find(item => item.id === ordinary.id), ordinary);
  });
  await test('unrelated saves and readbacks do not churn the supplier expense timestamp', async () => {
    await reset(accountingSales(), accountingSettings());
    const base = await state();
    const initialExpense = clone(chickenExpense(base));
    let after = await saveOk(patch(base, base.sales, {...base.settings, defaultPrice: 24}));
    assert.deepEqual(chickenExpense(after), initialExpense);
    after = await saveOk(patch(after, after.sales));
    assert.deepEqual(chickenExpense(after), initialExpense);
    assert.deepEqual(chickenExpense((await call('get')).data), initialExpense);
  });
  await test('unpaid versus paid changes only payment balance, never profit or expense amount', async () => {
    await reset(accountingSales(), accountingSettings());
    const base = await state();
    const settings = clone(base.settings);
    Object.assign(settings.accountingExpenses.find(item => item.id === chickenExpenseId), {paid: true, paymentType: 'cash', paymentDetails: ''});
    const after = await saveOk(patch(base, base.sales, settings));
    assert.equal(chickenExpense(after).paid, true);
    assert.equal(chickenExpense(after).amount, 820);
    assert.equal(profit(after), profit(base));
  });
  await test('a stale rate edit is rejected with accounting state entirely unchanged', async () => {
    await reset(accountingSales(), accountingSettings());
    const base = await state();
    const after = await saveOk(patch(base, base.sales, {...base.settings, invalidShechitaCost: 10}));
    const rejected = await call('save', patch(base, base.sales, {...base.settings, invalidShechitaCost: 18}));
    assert.equal(rejected.data.settings._kapparosSaveError.code, 'conflict');
    assert.deepEqual(await state(), after);
  });
  console.log(`${count} isolated edge-function/PostgreSQL regression checks passed. No production requests were made.`);
})().catch(error => {console.error(error); process.exitCode=1;}).finally(()=>db.close());
