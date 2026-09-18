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
const reset = async (sales = [sale('keep')]) => {
  await db.query("insert into kapparos_app_state values ('main',$1,$2,now()) on conflict(id) do update set sales=excluded.sales,settings=excluded.settings,updated_at=excluded.updated_at", [sales, config]);
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
let count = 0;
async function test(name, fn) { await reset(); await fn(); console.log('PASS', name); count++; }

(async () => {
  await db.exec('create table kapparos_app_state(id text primary key,sales jsonb,settings jsonb,updated_at timestamptz);');
  for (const file of ['tests/admin-sync/fixtures/kapparos_allocate_ticket_id.sql', 'supabase/admin-save-stock.sql']) await db.exec(fs.readFileSync(path.join(root, file), 'utf8'));
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
  console.log(`${count} isolated edge-function/PostgreSQL regression checks passed. No production requests were made.`);
})().catch(error => {console.error(error); process.exitCode=1;}).finally(()=>db.close());
