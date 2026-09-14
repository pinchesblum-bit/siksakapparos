const fs = require('fs');
const assert = require('node:assert/strict');
const {PGlite} = require('@electric-sql/pglite');
const sync = require('../../admin-sync.js');
process.chdir(require('node:path').resolve(__dirname, '../../..'));
const db = new PGlite();
const settings = {inventory:1, defaultPrice:20, buyingWebsite:{orderingEnabled:true, publicAccessEnabled:false}, chickenPurchaseCost:10};
const sale = id => ({id, quantity:1, price:20, status:'paid', ticketId:'123456', createdAt:'2026-09-14T10:00:00Z'});
const reset = async (sales=[], config=settings) => db.query('update kapparos_app_state set sales=$1,settings=$2,updated_at=now() where id=$3',[sales,config,'main']);
const state = async () => (await db.query('select sales,settings,updated_at from kapparos_app_state where id=$1',['main'])).rows[0];
const save = async payload => (await db.query('select kapparos_save_admin_state($1,$2,$3) as saved',[payload.sales,payload.settings,payload.deletedSaleIds||[]])).rows[0].saved;
const patch = (base, sales, config=base.settings, deleted=[]) => sync.request(base,base,{sales,settings:config},deleted);
const online = async id => (await db.query('select kapparos_create_online_demo_order($1,$2,$3,$4) as saved',[{...sale(id),isOnlineSale:true,isDemoSale:true,onlineOrderKey:id,onlineOrderTokenHash:'fixture'},id,'fixture',1])).rows[0].saved;
let count=0;
async function test(name, fn){await reset();await fn();console.log('PASS',name);count++;}
(async()=>{
 await db.exec('create table kapparos_app_state(id text primary key,sales jsonb,settings jsonb,updated_at timestamptz); insert into kapparos_app_state values (\'main\',\'[]\',\'{}\',now());');
 for(const file of ['siksakapparos/tests/admin-sync/fixtures/kapparos_allocate_ticket_id.sql','siksakapparos/tests/admin-sync/fixtures/kapparos_create_online_demo_order.sql','siksakapparos/supabase/admin-save-stock.sql']) await db.exec(fs.readFileSync(file,'utf8'));
 await test('ten submitted admin attempts use one last chicken',async()=>{
  const base=await state();const results=await Promise.all(Array.from({length:10},(_,i)=>save(patch(base,[sale('a'+i)]))));
  assert.equal(results.filter(r=>!r.settings._kapparosSaveError).length,1);assert.equal((await state()).sales.length,1);
  assert.equal(results.filter(r=>r.settings._kapparosSaveError?.code==='inventory').length,9);
 });
 await test('mixed online/admin attempts share stock and online retries are idempotent',async()=>{
  const base=await state();const first=await online('web');assert.equal(first.ok,true);
  const result=await save(patch(base,[sale('desk')]));assert.equal(result.settings._kapparosSaveError.code,'inventory');
  assert.equal((await online('web')).existing,true);assert.equal((await state()).sales.length,1);
 });
 await test('online refuses last chicken already saved by admin',async()=>{
  const base=await state();await save(patch(base,[sale('desk')]));assert.equal((await online('web')).code,'inventory');
 });
 await test('retry of accepted admin record preserves assigned ticket and does not duplicate',async()=>{
  const base=await state(), payload=patch(base,[sale('desk')]);const a=await save(payload),b=await save(payload);
  assert.equal(b.settings._kapparosSaveError,undefined);assert.deepEqual(a.sales,b.sales);assert.equal(b.sales.length,1);
 });
 await test('stale sale edit cannot undo completion',async()=>{
  await reset([sale('desk')]);const base=await state();await save(patch(base,[{...sale('desk'),geschlagen:true}]));
  const r=await save(patch(base,[{...sale('desk'),fullName:'Fixture changed'}]));assert.equal(r.settings._kapparosSaveError.code,'conflict');assert.equal((await state()).sales[0].geschlagen,true);
 });
 await test('stale edit cannot resurrect deleted sale; repeated deletion is safe',async()=>{
  await reset([sale('desk')]);const base=await state(),deletion=patch(base,[],base.settings,['desk']);
  await save(deletion);assert.equal((await save(deletion)).settings._kapparosSaveError,undefined);
  assert.equal((await save(patch(base,[{...sale('desk'),fullName:'Fixture'}]))).settings._kapparosSaveError.code,'conflict');assert.equal((await state()).sales.length,0);
 });
 await test('completed and free chickens remain consumed; expired/reserved excluded',async()=>{
  await reset([{...sale('free'),price:0,paymentType:'free',geschlagen:true},{...sale('expired'),status:'expired',quantity:40},{...sale('reserved'),status:'reserved',quantity:40}]);
  const base=await state();assert.equal((await save(patch(base,[...base.sales,sale('extra')]))).settings._kapparosSaveError.code,'inventory');
 });
 await test('unrelated settings updates merge; same setting conflicts',async()=>{
  const base=await state();await save(patch(base,[],{...base.settings,inventory:5}));
  const r=await save(patch(base,[],{...base.settings,defaultPrice:25}));assert.equal(r.settings.inventory,5);assert.equal(r.settings.defaultPrice,25);
  assert.equal((await save(patch(base,[],{...base.settings,inventory:10}))).settings._kapparosSaveError.code,'conflict');
 });
 await test('normal sales save cannot overwrite credentials through metadata',async()=>{
  const base=await state();const p=patch(base,[sale('a')]);p.settings.username='unauthorized';p.settings._kapparosWrite.settingsBases.username={present:false,value:null};
  const r=await save(p);assert.equal(r.settings._kapparosSaveError.code,'conflict');assert.equal((await state()).sales.length,0);
 });
 await test('legacy full snapshot also cannot oversell or change data on rejection',async()=>{
  const base=await state();await online('web');const before=await state();const r=await save({sales:[sale('desk')],settings:base.settings});assert.equal(r.settings._kapparosSaveError.code,'inventory');assert.deepEqual(await state(),before);
 });
 await test('error and write metadata never persist',async()=>{
  const base=await state();await save(patch(base,[sale('one')]));await save(patch(base,[sale('two')]));const current=await state();assert.equal(current.settings._kapparosWrite,undefined);assert.equal(current.settings._kapparosSaveError,undefined);
 });
 await test('client rebase preserves remote-only sales and edits during a save',async()=>{
  const before={sales:[sale('a')],settings};const now={sales:[{...sale('a'),fullName:'New name'}],settings:{...settings,defaultPrice:30}};
  const r=sync.rebase({sales:[sale('a'),sale('web')],settings:{...settings,inventory:5}},before,now);
  assert.equal(r.sales.length,2);assert.equal(r.sales[0].fullName,'New name');assert.equal(r.settings.inventory,5);assert.equal(r.settings.defaultPrice,30);
 });
 console.log(count+' isolated PostgreSQL/function checks passed. PGlite serializes submissions; live row-lock behavior is inspected separately.');await db.close();
})().catch(e=>{console.error(e);process.exitCode=1;db.close();});
