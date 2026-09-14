const fs=require('fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const {PGlite}=require('@electric-sql/pglite');
process.chdir(require('node:path').resolve(__dirname, '../../..'));
const db=new PGlite(),windows=[];
const clone=x=>JSON.parse(JSON.stringify(x));
const baseSettings={username:'fixture',inventory:1,defaultPrice:20,chickenPurchaseCost:0,phoneRequired:true,emailRequired:false,buyingWebsite:{publicAccessEnabled:false,orderingEnabled:true}};
const get=async()=>{const row=(await db.query("select sales,settings,updated_at from kapparos_app_state where id='main'")).rows[0];return{sales:row.sales,settings:row.settings,updatedAt:row.updated_at};};
const reset=async()=>db.query("update kapparos_app_state set sales='[]',settings=$1,updated_at=now() where id='main'",[baseSettings]);
async function settle(){for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));}
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setImmediate(r));}throw Error('UI did not settle');}
async function device(){
 const d=new JSDOM(fs.readFileSync('siksakapparos/index.html','utf8'),{url:'https://pinchesblum-bit.github.io/siksakapparos/',runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;windows.push(w);
 w.sessionStorage.setItem('kapparosLoggedInV1','local-fixture-token');w.localStorage.setItem('kapparosCloudMigratedV1','true');
 w.AbortSignal=AbortSignal;w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){}});w.scrollTo=()=>{};
 const errors=[],calls=[];let delayed=null;w.addEventListener('error',e=>errors.push(e.error?.stack||e.message));w.setInterval=(fn,ms)=>{assert.equal(ms,2500);return 0;};
 w.fetch=async(url,init)=>{
  const body=JSON.parse(init.body);calls.push(body);assert(url.endsWith('/kapparos-access'));assert.equal(init.cache,'no-store');
  if(body.action==='get')return Response.json(await get());
  if(body.action==='save'){
   if(delayed)await delayed;
   const current=await get();const settings={...current.settings,...body.settings};
   const r=(await db.query('select kapparos_save_admin_state($1,$2,$3) as saved',[body.sales,settings,body.deletedSaleIds])).rows[0].saved;
   return Response.json({sales:r.sales,settings:r.settings,updatedAt:r.updated_at});
  }
  throw Error('Unexpected fixture action '+body.action);
 };
 for(const el of w.document.querySelectorAll('script')){
  if(el.src){const name=new URL(el.src).pathname.split('/').pop();if(name!=='ticket-design.js')w.eval(fs.readFileSync('siksakapparos/'+name,'utf8'));}
  else w.eval(el.textContent+(el.textContent.includes('initializeCloudSession();')?`\nwindow.fixture={state,openModal,showSaleEditor,refreshCloudStateSilently,flushCloudSave,queueCloudSave,cloudSnapshot,canUseSaleTicket,saveSettings,showSaleView,get dirty(){return cloudSaveDirty},get submitting(){return saleSubmitting},get baseline(){return cloudBaselineRaw},get baselineUi(){return cloudBaselineUi},get ready(){return cloudReady}};`:''));
 }
 await until(()=>w.fixture?.ready);assert.deepEqual(errors,[]);
 return {w,doc:w.document,calls,errors,delay(){let release;delayed=new Promise(r=>release=r);return()=>{delayed=null;release();};}};
}
function fill(device,name){const {doc,w}=device;w.fixture.openModal();doc.getElementById('fullName').value=name;doc.getElementById('phone').value='2125550100';const payment=doc.getElementById('paymentType');payment.value='cash';payment.dispatchEvent(new w.Event('change'));}
function submit(d){d.doc.getElementById('saleForm').dispatchEvent(new d.w.Event('submit',{bubbles:true,cancelable:true}));}
(async()=>{
 await db.exec("create table kapparos_app_state(id text primary key,sales jsonb,settings jsonb,updated_at timestamptz);insert into kapparos_app_state values('main','[]','{}',now());");
 for(const file of ['siksakapparos/tests/admin-sync/fixtures/kapparos_allocate_ticket_id.sql','siksakapparos/supabase/admin-save-stock.sql'])await db.exec(fs.readFileSync(file,'utf8'));
 await reset();const a=await device(),b=await device();fill(a,'Local fixture A');fill(b,'Local fixture B');
 b.doc.getElementById('quantity').value='1';b.doc.getElementById('otherDetails').value='Do not disturb';
 const release=a.delay();submit(a);await settle();assert(a.doc.getElementById('saveSaleBtn').disabled);assert(!a.doc.getElementById('saleForm').classList.contains('sale-readonly'));assert(a.w.fixture.dirty);assert.equal(a.w.fixture.canUseSaleTicket(a.w.fixture.state.sales[0]),false);assert.equal((await get()).sales.length,0);
 release();await until(()=>!a.w.fixture.submitting);assert.equal((await get()).sales.length,1);assert(a.doc.getElementById('saleForm').classList.contains('sale-readonly'));
 // Device B still has a stale stock view when it submits. The database refuses it.
 submit(b);await until(()=>!b.w.fixture.submitting);assert.equal((await get()).sales.length,1);assert(!b.doc.getElementById('saleForm').classList.contains('sale-readonly'));assert.equal(b.doc.getElementById('fullName').value,'Local fixture B');assert.equal(b.w.fixture.dirty,false);assert.equal(b.doc.getElementById('quantity').getAttribute('aria-invalid'),'true');assert.match(b.doc.getElementById('toast').textContent,/not enough chickens/);
 console.log('PASS two complete admin pages: last chicken rejected, form preserved, success/ticket waits for server');
 // A sales-only poll updates a form-open device without touching entered fields.
 await reset();await b.w.fixture.refreshCloudStateSilently();assert.equal(b.doc.getElementById('quantity').getAttribute('aria-invalid'),'false');
 const remote={id:'fixture-online',ticketId:'654321',fullName:'Local online fixture',phone:'2125550101',status:'paid',quantity:1,price:20,isOnlineSale:true,isDemoSale:true};
 await db.query("update kapparos_app_state set sales=$1,updated_at=now() where id='main'",[[remote]]);await b.w.fixture.refreshCloudStateSilently();
 assert.equal(b.w.fixture.state.sales.length,1);assert.equal(b.doc.getElementById('fullName').value,'Local fixture B');assert.equal(b.doc.getElementById('otherDetails').value,'Do not disturb');assert.equal(b.doc.getElementById('paymentType').value,'cash');assert.equal(b.doc.getElementById('quantity').getAttribute('aria-invalid'),'true');
 assert.equal(b.doc.querySelector('.sale-source-badges .online-sale-badge').textContent,'Online');assert.equal(b.doc.querySelector('.sale-source-badges .demo-sale-badge').textContent,'Demo');
 b.w.fixture.openModal(remote.id);assert.equal(b.doc.getElementById('saleDemoBadge').hidden,false);assert.equal(b.doc.getElementById('saleOnlineBadge').hidden,false);assert.equal(b.doc.getElementById('geschlagen').disabled,false);
 console.log('PASS form-open polling updates stock without resetting fields; Online/Demo visible in list and view; switch usable');
 // Ordinary saves send no unchanged sales or settings defaults.
 await reset();await a.w.fixture.refreshCloudStateSilently();a.w.fixture.state.settings.defaultPrice=25;a.w.fixture.saveSettings();await a.w.fixture.flushCloudSave();
 const sent=a.calls.filter(c=>c.action==='save').at(-1);assert.equal(sent.sales.length,0);assert(sent.settings._kapparosWrite);assert.equal(sent.settings.inventory,undefined);assert.equal((await get()).settings.defaultPrice,25);assert.equal((await get()).settings.inventory,1);
 console.log('PASS settings save sends only changed fields and keeps remote stock');
 a.w.fixture.state.settings.inventory=100;a.w.fixture.state.settings.chickenPurchaseCost=10;a.w.fixture.saveSettings();await a.w.fixture.flushCloudSave();const cost=(await get()).settings;assert.equal(cost.accountingExpenses.find(e=>e.id==='auto-chicken-inventory-cost').amount,1000);assert.equal(cost.chickenPurchaseBatches.reduce((n,b)=>n+b.quantity*b.unitCost,0),1000);console.log('PASS cost normalization survives partial settings saves: 100 chickens at $10 = $1,000');
 for(const d of [a,b])assert.deepEqual(d.errors,[]);
 for(const w of windows)w.close();await db.close();
})().catch(async e=>{console.error(e);for(const w of windows)w.close();await db.close();process.exitCode=1;});
