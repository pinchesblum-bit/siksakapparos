const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {webcrypto} = require('node:crypto');
const {JSDOM} = require('jsdom');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const copy = require(path.join(root,'siksakapparos/buying-content.js'));
const presentation = require(path.join(root,'siksakapparos/buying-presentation.js'));
let count = 0;
const test = async (name, fn) => { await fn(); count++; console.log('PASS',name); };
function dom(file) {return new JSDOM(read(file),{url:'https://siksakapparos.org/',runScripts:'outside-only'});}
function script(w,file) {w.eval(read(file));}
function loadPublic(page='order.html') {const d=dom('siksakapparos-order/'+page),w=d.window;script(w,'siksakapparos-order/buying-content.js');script(w,'siksakapparos-order/buying-presentation.js');script(w,'siksakapparos-order/buying-languages.js');script(w,'siksakapparos-order/buying-checkout.js');return d;}
const site = {title:'פנים מאירות סיקסא',subtitle:'ערב יום כיפור כפרות',orderingEnabled:true,publicAccessEnabled:false,price:20,inventory:100,pageContent:{introText:'באשטעלט אייער כפרות גרינג און באקוועם',bookingNote:'ווען איר באשטעלט א כפרה וועט דאס ווערן אוועקגעלייגט ביז 8:00',benefitOrder:'שוחט אויפן פלאץ',benefitPayment:'מניני סליחות ושחרית',benefitTicket:'מקוה חמה',contactLabel:'צו באשטעלן אויפן טעלעפאן רופט:',venue:'',services:'',prepaymentNote:''}};
function backend(slug, options={}) {
 let handler; const calls=[];
 const current={settings:options.admin||{defaultPrice:20,inventory:300,buyingWebsite:site},sales:options.sales||[]};
 const context=vm.createContext({console,Request,Response,Headers,AbortSignal,TextEncoder,Uint8Array,crypto:webcrypto,KapparosBuyingContent:copy,OPENING_NOTICE:'Online ordering will open September 13.',hasBuyingAccess:async()=>options.access??true,previewLogin:async()=> 'mock-preview',
 Deno:{env:{get:key=>({SUPABASE_URL:'https://unit.invalid',SUPABASE_SERVICE_ROLE_KEY:'server-test',KAPPAROS_TRANSLATE_API_KEY:options.key}[key])},serve:f=>handler=f},
 fetch:async(url,init={})=>{
  calls.push({url,init});
  if(url.includes('kapparos_sessions'))return Response.json(options.auth?[{token_hash:'test'}]:[]);
  if(url.includes('kapparos_app_state'))return Response.json([current]);
  if(url.includes('rpc/kapparos_create_online_demo_order')){const p=JSON.parse(init.body);return Response.json({ok:true,sale:p.p_sale,remaining:298});}
  if(url.includes('translation.googleapis.com')){if(options.providerError)return Response.json({error:'private diagnostic'},{status:400});const q=JSON.parse(init.body).q;return Response.json({data:{translations:q.map(()=>({translatedText:'New wording'}))}});}
  throw Error('Unexpected network request '+url);
 }});
 const code=read('siksakapparos/supabase/functions/'+slug+'/index.ts').replace(/^import .*;$/mg,'').replace('export async function','async function');
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,context);
 return {handler,calls,current};
}
const request=(body,token='a'.repeat(64),origin='https://pinchesblum-bit.github.io')=>new Request('https://unit.invalid',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
const order={action:'create-demo-order',fullName:'Local fixture',phone:'2125550100',email:'fixture@example.invalid',quantity:2,expectedPrice:40,orderKey:'local-test-order-key-1234',orderToken:'b'.repeat(48)};
function editor(settings=site,confirmValue=true) {
 const d=dom('siksakapparos/index.html'),w=d.window;script(w,'siksakapparos/buying-content.js');script(w,'siksakapparos/buying-presentation.js');script(w,'siksakapparos/buying-settings.js');w.AbortSignal=AbortSignal;
 let state=structuredClone(settings),confirmed=0,saved=[];w.fetch=async()=>Response.json({code:'translation_setup_required',error:'Connection required'},{status:503});
 w.BuyingSettingsEditor.init({getSettings:()=>state,token:()=> 'fixture',confirm:async()=>{confirmed++;return confirmValue;},saveSection:async(values,en)=>{
   saved.push({values,en});for(const field of copy.fields)if(Object.hasOwn(values,field.key)){if(field.root)state[field.key]=values[field.key];else(state.pageContent||={})[field.key]=values[field.key];}
   if(en)state.englishContent={source:{...state.englishContent?.source,...en.source},values:{...state.englishContent?.values,...en.values}};
 },saveTermsEnabled:async(value)=>{saved.push({termsEnabled:value});state.termsEnabled=value;}});
 return {d,w,get state(){return state},get confirmed(){return confirmed},saved};
}
async function settle(){await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));}
(async()=>{
 await test('Current saved wording and Shoychet spelling have current English; stale translations are rejected',()=>{
  const e=presentation.english(site);assert.deepEqual(e.missing,[]);assert.equal(e.values.benefitOrder,'Shoychet on site');assert.equal(e.values.title,'Punim Meiros Siksa');assert.equal(e.values.venue,'');
  assert.equal(presentation.english({...site,englishContent:{source:{benefitOrder:site.pageContent.benefitOrder},values:{benefitOrder:'Shoyched on site'}}}).values.benefitOrder,'Shoychet on site');
  assert(!copy.fields.some(f=>f.key.startsWith('gate')));
  assert(copy.english({...site,pageContent:{...site.pageContent,timeText:'נייע צייט'},englishContent:{source:{timeText:'old'},values:{timeText:'Stale'}}}).missing.includes('timeText'));
 });
 await test('Shared schema is identical in both websites and three Edge Functions',()=>{
  const source=read('siksakapparos/buying-content.js');for(const file of ['siksakapparos-order/buying-content.js',...['kapparos-public-config','kapparos-buying-translate','kapparos-public-order'].map(s=>'siksakapparos/supabase/functions/'+s+'/buying-content.js')])assert.equal(read(file),source);
 });
 await test('Phones have stable US formatting and safe dialing links',()=>{
  for(const value of ['8453723311','845-372-3311','(845) 372-3311','+1 845 372 3311','18453723311'])assert.deepEqual(copy.phone(value),{label:'845-372-3311',href:'tel:+18453723311'});
  assert.equal(copy.phone('javascript:alert(1)').href,'');
 });
 for(const page of ['index.html','order.html']) await test(page+' keeps private access English and renders saved copy, editable icons and support links',()=>{
  const d=loadPublic(page),w=d.window,doc=w.document;
  assert.equal(doc.documentElement.lang,'en');assert(doc.querySelector('.language-switcher').hidden);
  w.BuyingLanguages.apply({...site,pageContent:{...site.pageContent,benefitOrderIcon:'📍',supportPhone:'2125550100',supportEmail:'help@example.invalid'}},false);
  assert.equal(doc.documentElement.lang,'yi');assert.equal(doc.querySelector('[data-copy="benefitOrderIcon"]').textContent,'📍');assert.equal(doc.querySelector('[data-copy="benefitPaymentIcon"] img').getAttribute('src'),'icons/prayer-book.svg');assert.equal(doc.querySelector('[data-copy="benefitTicketIcon"] img').getAttribute('src'),'icons/mikvah.svg');assert(doc.querySelector('.event-venue').hidden);
  assert.equal(doc.querySelector('.support-phone').href,'tel:+12125550100');assert.equal(doc.querySelector('.support-email').href,'mailto:help@example.invalid');assert(!doc.getElementById('buyingSupportFooter').hidden);
  const total=doc.getElementById('summaryTotal').textContent;doc.getElementById('customerName').value='Untouched customer';
  doc.querySelector('[data-language="en"]').click();assert.equal(doc.querySelector('[data-copy="benefitOrder"]').textContent,'Shoychet on site');assert.equal(doc.getElementById('summaryTotal').textContent,total);assert.equal(doc.getElementById('customerName').value,'Untouched customer');
  w.BuyingLanguages.lock();assert.equal(doc.documentElement.lang,'en');assert.equal(doc.getElementById('previewShowPassword').textContent,'Show');assert.equal(doc.getElementById('previewGateTitle').textContent,'Online ordering will open September 13.');assert(doc.querySelector('.language-switcher').hidden);w.close();
 });
 await test('Editable copy renders as text; empty support/footer and optional text remain hidden',()=>{
  const {window:w}=loadPublic();w.BuyingLanguages.apply({...site,pageContent:{...site.pageContent,bookingNote:'<img src=x onerror=alert(1)>',supportPhone:'',supportEmail:''}},false);
  assert.equal(w.document.querySelector('.event-booking img'),null);assert(w.document.getElementById('buyingSupportFooter').hidden);w.close();
 });
 await test('Each section saves only its fields, asks once, and preserves other drafts and settings',async()=>{
  const e=editor({...site,extra:'keep',termsEnabled:false});const {w}=e;
  w.BuyingSettingsEditor.editSection('Heading');w.document.getElementById('buyingEdit-introText').value='Unsaved heading draft';
  w.BuyingSettingsEditor.editSection('Time and location');w.document.getElementById('buyingEdit-timeText').value='New time';
  w.document.querySelector('[data-buying-section="Time and location"] form').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await settle();
  assert.equal(e.confirmed,1);assert.equal(e.saved.length,1);assert(!Object.hasOwn(e.saved[0].values,'introText'));assert.equal(e.state.pageContent.introText,site.pageContent.introText);assert.equal(w.document.getElementById('buyingEdit-introText').value,'Unsaved heading draft');assert.equal(e.state.extra,'keep');assert.equal(e.state.price,20);assert.equal(e.state.publicAccessEnabled,false);
  w.document.querySelector('[data-buying-section="Heading"] .settings-actions button').click();assert.equal(w.document.getElementById('buyingEdit-introText').value,site.pageContent.introText);w.close();
 });
 await test('Declining section confirmation saves nothing and does not prompt twice',async()=>{
  const e=editor(site,false),w=e.w;w.BuyingSettingsEditor.editSection('Time and location');w.document.getElementById('buyingEdit-timeText').value='New time';w.document.querySelector('[data-buying-section="Time and location"] form').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();assert.equal(e.confirmed,1);assert.equal(e.saved.length,0);w.close();
 });
 await test('Unconnected translation still saves Yiddish and reports the actual pending state',async()=>{
  const e=editor(),w=e.w;w.BuyingSettingsEditor.editSection('Time and location');w.document.getElementById('buyingEdit-timeText').value='נייע צייט';w.document.querySelector('[data-buying-section="Time and location"] form').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();assert.equal(e.state.pageContent.timeText,'נייע צייט');assert.match(w.document.querySelector('[data-buying-section="Time and location"] .settings-message').textContent,/Yiddish saved.*Connection required/);assert.equal(e.confirmed,1);w.close();
 });
 await test('Terms switch works before Edit, requests text before enabling, and saves with one confirmation',async()=>{
  const e=editor(),w=e.w,toggle=w.document.getElementById('buyingTermsEnabled');assert.equal(toggle.disabled,false);toggle.click();await settle();assert.equal(e.confirmed,0);assert.equal(toggle.checked,false);assert.equal(w.document.getElementById('buyingEdit-termsText').disabled,false);
  w.document.getElementById('buyingEdit-termsText').value='Fixture terms only.';w.document.querySelector('[data-buying-section="Buyer terms"] form').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();toggle.click();await settle();assert.equal(e.state.termsEnabled,true);assert.equal(e.confirmed,2);assert.equal(toggle.disabled,false);w.close();
 });
 await test('Buyer must accept terms; a language/revision change resets acceptance; a config reload keeps matching acceptance',async()=>{
  const {window:w}=loadPublic(),config={...site,termsEnabled:true,termsRevision:'revision-1',pageContent:{...site.pageContent,termsText:'Fixture terms only.'}};
  w.BuyingLanguages.apply(config,false);w.BuyingCheckout.apply(config);assert.equal(w.BuyingCheckout.validate(),false);
  w.document.getElementById('acceptBuyerTerms').click();assert.equal(w.BuyingCheckout.validate(),true);assert.equal(w.BuyingCheckout.acceptancePayload().termsAcceptance.revision,'revision-1');
  w.BuyingCheckout.apply({...config,inventory:2});assert.equal(w.BuyingCheckout.validate(),true);
  w.document.querySelector('[data-language="en"]').click();assert.equal(w.BuyingCheckout.validate(),false);
  w.document.getElementById('acceptBuyerTerms').click();w.BuyingCheckout.apply({...config,termsRevision:'revision-2'});assert.equal(w.BuyingCheckout.validate(),false);
  assert.equal(w.BuyingCheckout.phoneDigits('+1 (212) 555-0100'),'2125550100');w.close();
 });
 await test('Locked config exposes no editable gate fields and preserves manual access',async()=>{
  const b=backend('kapparos-public-config',{access:false});const d=await (await b.handler(request({action:'public-config'}))).json();assert.equal(d.locked,true);assert.equal(d.copy,undefined);assert.equal(d.settings,undefined);
 });
 await test('Public config preserves selling price/inventory and returns the exact terms revision',async()=>{
  const settings={...site,termsEnabled:true,pageContent:{...site.pageContent,termsText:'Fixture terms.'}};
  const b=backend('kapparos-public-config',{admin:{defaultPrice:20,inventory:300,buyingWebsite:settings},sales:[{status:'paid',quantity:3},{status:'reserved',quantity:8}]});const d=await (await b.handler(request({action:'public-config'}))).json();assert.equal(d.settings.price,20);assert.equal(d.settings.inventory,297);assert.equal(d.settings.termsRevision,await copy.termsRevision(settings));
 });
 await test('Server rejects missing/stale terms before the order RPC and records accepted wording on valid orders',async()=>{
  const settings={...site,termsEnabled:true,pageContent:{...site.pageContent,termsText:'Fixture terms.'}},admin={defaultPrice:20,inventory:300,buyingWebsite:settings};
  const b=backend('kapparos-public-order',{admin});let r=await b.handler(request(order));assert.equal(r.status,400);assert.equal((await r.json()).code,'TERMS_REQUIRED');assert(!b.calls.some(c=>c.url.includes('/rpc/')));
  r=await b.handler(request({...order,termsAcceptance:{accepted:true,language:'en',revision:'old'}}));assert.equal(r.status,409);assert.equal((await r.json()).code,'TERMS_CHANGED');assert(!b.calls.some(c=>c.url.includes('/rpc/')));
  r=await b.handler(request({...order,termsAcceptance:{accepted:true,language:'en',revision:await copy.termsRevision(settings)}}));assert.equal(r.status,200);const sent=JSON.parse(b.calls.find(c=>c.url.includes('/rpc/')).init.body).p_sale;assert.equal(sent.price,40);assert.equal(sent.quantity,2);assert.equal(sent.isDemoSale,true);assert.equal(sent.termsAcceptance.text,'Fixture terms.');assert.equal(sent.termsAcceptance.language,'en');assert(sent.termsAcceptance.acceptedAt);
 });
 await test('Existing order retry remains idempotent even if terms changed after its creation',async()=>{
  const hash=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(order.orderToken))).toString('hex');const sale={onlineOrderKey:order.orderKey,onlineOrderTokenHash:hash,status:'paid',quantity:2};const b=backend('kapparos-public-order',{admin:{defaultPrice:20,inventory:300,buyingWebsite:{...site,termsEnabled:true,pageContent:{...site.pageContent,termsText:'New terms.'}}},sales:[sale]});const r=await b.handler(request(order));assert.equal(r.status,200);assert.equal(b.calls.filter(c=>c.url.includes('/rpc/')).length,1);
 });
 await test('Translation status and provider remain admin-authenticated; only allowlisted public text is accepted',async()=>{
  const no=backend('kapparos-buying-translate');assert.equal((await no.handler(request({action:'status'},''))).status,401);assert.equal(no.calls.length,0);
  const yes=backend('kapparos-buying-translate',{auth:true});assert.deepEqual(await (await yes.handler(request({action:'status'}))).json(),{configured:false});assert.equal((await yes.handler(request({texts:{customerEmail:'private@example.invalid'}}))).status,400);const r=await yes.handler(request({texts:{timeText:'נייע צייט'}}));assert.equal(r.status,503);assert.equal((await r.json()).code,'translation_setup_required');
 });
 console.log(count+' regression checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
