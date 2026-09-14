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
function loadPublic(page='order/index.html') {const d=dom('siksakapparos-order/'+page),w=d.window;script(w,'siksakapparos-order/buying-content.js');script(w,'siksakapparos-order/buying-presentation.js');script(w,'siksakapparos-order/buying-languages.js');script(w,'siksakapparos-order/buying-checkout.js');return d;}
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
function fullBuyingPage(page='index.html',completed=null,options={}) {
 const d=new JSDOM(read('siksakapparos-order/'+page),{url:'https://siksakapparos.org/'+(page==='index.html'?'':'order/'),runScripts:'outside-only'}),w=d.window,requests=[],navigations=[];
 w.AbortSignal=AbortSignal;w.scrollTo=()=>{};w.__navigate=path=>navigations.push(path);
 Object.defineProperty(w.performance,'getEntriesByType',{value:()=>[{type:options.navigationType||'reload'}]});
 w.sessionStorage.setItem('kapparosBuyingVisitV1','1');
 if(options.handoff)w.sessionStorage.setItem('kapparosBuyingHandoffV1',JSON.stringify(options.handoff));
 w.sessionStorage.setItem('kapparosBuyingPreviewV1','local-preview-fixture');
 if(completed)w.sessionStorage.setItem('kapparosCompletedTicketV1',JSON.stringify(completed));
 w.fetch=(url,init)=>new Promise((resolve,reject)=>{assert(url.endsWith('/kapparos-public-config'));requests.push({url,init,resolve,reject});});
 for(const el of w.document.querySelectorAll('script')){
  if(el.src){const name=new URL(el.src).pathname.split('/').pop();if(name!=='ticket-design.js')w.eval(read('siksakapparos-order/'+name).replaceAll('root.location.assign','root.__navigate').replaceAll('root.location.replace','root.__navigate'));}
  else w.eval(el.textContent.replaceAll('window.location.assign','window.__navigate'));
 }
 return {d,w,requests,navigations};
}
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
 for(const page of ['index.html','order/index.html']) await test(page+' keeps private access English and renders saved copy, editable icons and support links',()=>{
  const d=loadPublic(page),w=d.window,doc=w.document;
  assert.equal(doc.documentElement.lang,'en');assert(doc.querySelector('.language-switcher').hidden);
  w.BuyingLanguages.apply({...site,pageContent:{...site.pageContent,benefitOrderIcon:'📍',supportPhone:'2125550100',supportEmail:'help@example.invalid'}},false);
  assert.equal(doc.documentElement.lang,'yi');if(page==='index.html'){assert.equal(doc.querySelector('[data-copy="benefitOrderIcon"]').textContent,'📍');assert.equal(doc.querySelector('[data-copy="benefitPaymentIcon"] img').getAttribute('src'),'/icons/prayer-book.svg');assert.equal(doc.querySelector('[data-copy="benefitTicketIcon"] img').getAttribute('src'),'/icons/mikvah.svg');assert(doc.querySelector('.event-venue').hidden);}
  assert.equal(doc.querySelector('.support-phone').href,'tel:+12125550100');assert.equal(doc.querySelector('.support-email').href,'mailto:help@example.invalid');assert(!doc.getElementById('buyingSupportFooter').hidden);
  const total=doc.getElementById('summaryTotal').textContent;doc.getElementById('customerName').value='Untouched customer';
  doc.querySelector('[data-language="en"]').click();if(page==='index.html')assert.equal(doc.querySelector('[data-copy="benefitOrder"]').textContent,'Shoychet on site');assert.equal(doc.getElementById('summaryTotal').textContent,total);assert.equal(doc.getElementById('customerName').value,'Untouched customer');
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
 await test('Two Venue inputs preserve one stored field and translated line boundaries',async()=>{
  const e=editor({...site,pageContent:{...site.pageContent,venue:'First venue line'}}),w=e.w;
  w.BuyingSettingsEditor.editSection('Time and location');
  assert.equal(w.document.getElementById('buyingEdit-venue').value,'First venue line');
  assert.equal(w.document.getElementById('buyingEdit-venueLine2').value,'');
  w.document.getElementById('buyingEdit-venueLine2').value='Second venue line';
  w.document.querySelector('[data-buying-section="Time and location"] form').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();
  assert.equal(e.confirmed,1);assert.equal(e.state.pageContent.venue,'First venue line\nSecond venue line');
  assert.equal(e.state.englishContent.values.venue,'First venue line\nSecond venue line');assert(!Object.hasOwn(e.state.pageContent,'venueLine2'));
  w.BuyingSettingsEditor.editSection('Time and location');assert.equal(w.document.getElementById('buyingEdit-venueLine2').value,'Second venue line');
  w.document.getElementById('buyingEdit-venue').value='a'.repeat(200);w.document.getElementById('buyingEdit-venueLine2').value='b'.repeat(100);
  w.document.querySelector('[data-buying-section="Time and location"] form').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();
  assert.equal(e.saved.length,1);assert.equal(e.confirmed,1);w.close();
 });
 await test('A new Yiddish Venue line translates separately while preserving the unchanged saved line',async()=>{
  const first='מנינים סליחות פון 5:20',second='נאך א שורה';
  const e=editor({...site,pageContent:{...site.pageContent,venue:first},englishContent:{source:{venue:first},values:{venue:'Selichos minyanim from 5:20'}}}),w=e.w,requests=[];
  w.fetch=async(url,init)=>{const body=JSON.parse(init.body);requests.push(body.texts);return Response.json({values:{venue:'Another line'}});};
  w.BuyingSettingsEditor.editSection('Time and location');w.document.getElementById('buyingEdit-venueLine2').value=second;
  w.document.querySelector('[data-buying-section="Time and location"] form').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();
  assert.deepEqual(requests,[{venue:second}]);assert.equal(e.confirmed,1);
  assert.equal(e.state.pageContent.venue,first+'\n'+second);assert.equal(e.state.englishContent.source.venue,first+'\n'+second);
  assert.equal(e.state.englishContent.values.venue,'Selichos minyanim from 5:20\nAnother line');w.close();
 });
 await test('Buying page layout follows the introduction, Venue and phone positions',()=>{
  for(const page of ['index.html']){
   const {window:w}=loadPublic(page);w.BuyingLanguages.apply({...site,pageContent:{...site.pageContent,venue:'First venue line\nSecond venue line'}},false);
   const doc=w.document,box=doc.querySelector('.event-details'),intro=doc.querySelector('.hero-copy'),phone=doc.querySelector('.event-contact');
   assert(intro.compareDocumentPosition(box)&4);assert(doc.querySelector('.event-booking').compareDocumentPosition(phone)&4);assert.equal(phone.parentElement.className,'hero');assert.equal(phone.previousElementSibling.id,'availabilityMessage');assert.equal(phone.previousElementSibling.previousElementSibling.id,'openOrderButton');assert(doc.querySelector('.event-booking').compareDocumentPosition(doc.getElementById('openOrderButton'))&4);
   const pair=doc.querySelector('.event-venues');assert(pair.classList.contains('has-two-lines'));assert.equal(pair.querySelectorAll('.event-venue').length,2);assert.equal(pair.dir,'rtl');
   doc.querySelector('[data-language="en"]').click();assert.equal(pair.dir,'ltr');assert.equal(pair.children[1].textContent,'Second venue line');w.close();
  }
 });
 await test('Declining section confirmation saves nothing and does not prompt twice',async()=>{
  const e=editor(site,false),w=e.w;w.BuyingSettingsEditor.editSection('Time and location');w.document.getElementById('buyingEdit-timeText').value='New time';w.document.querySelector('[data-buying-section="Time and location"] form').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();assert.equal(e.confirmed,1);assert.equal(e.saved.length,0);w.close();
 });
 await test('Unconnected translation still saves Yiddish and reports the actual pending state',async()=>{
  const e=editor(),w=e.w;w.BuyingSettingsEditor.editSection('Time and location');w.document.getElementById('buyingEdit-timeText').value='נייע צייט';w.document.querySelector('[data-buying-section="Time and location"] form').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();assert.equal(e.state.pageContent.timeText,'נייע צייט');assert.match(w.document.querySelector('[data-buying-section="Time and location"] .settings-message').textContent,/Yiddish saved.*Connection required/);assert.equal(e.confirmed,1);w.close();
 });
 await test('English stays selectable after a new Yiddish edit and never displays its stale translation',()=>{
  const {window:w}=loadPublic('index.html');
  w.BuyingLanguages.apply({...site,pageContent:{...site.pageContent,timeText:'נייע צייט'},englishContent:{source:{timeText:'old'},values:{timeText:'Stale translation'}}},false);
  const button=w.document.querySelector('[data-language="en"]');assert.equal(button.hidden,false);button.click();
  assert.equal(w.document.documentElement.lang,'en');assert.equal(w.document.querySelector('[data-copy="timeText"]').textContent,'נייע צייט');assert.equal(w.document.querySelector('[data-copy="timeText"]').dir,'rtl');
  assert.equal(w.document.querySelector('[data-copy="benefitOrder"]').textContent,'Shoychet on site');w.close();
 });
 await test('Untranslated English terms cannot be accepted or submitted',()=>{
  const {window:w}=loadPublic(),config={...site,termsEnabled:true,termsRevision:'new',pageContent:{...site.pageContent,termsText:'נייע תנאים'},englishContent:{source:{termsText:'old'},values:{termsText:'Stale terms'}}};
  w.BuyingLanguages.apply(config,false);w.BuyingCheckout.apply(config);w.document.querySelector('[data-language="en"]').click();
  assert.equal(w.document.getElementById('acceptBuyerTerms').disabled,true);assert.equal(w.BuyingCheckout.validate(),false);w.close();
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
 for(const page of ['index.html','order/index.html'])await test(page+' restores a verified preview without exposing the login screen while loading',async()=>{
  const e=fullBuyingPage(page),{w}=e,doc=w.document;
  assert(doc.getElementById('previewGate').hidden);assert(doc.body.classList.contains('preview-loading'));
  assert.equal(w.getComputedStyle(doc.querySelector('main')).display,'none');assert.equal(w.getComputedStyle(doc.getElementById('previewGate')).display,'none');
  assert.equal(e.requests[0].init.headers.Authorization,'Bearer local-preview-fixture');assert.equal(e.requests[0].init.cache,'no-store');
  e.requests[0].resolve(Response.json({settings:site}));await settle();
  assert(doc.getElementById('previewGate').hidden);assert(doc.getElementById('previewLoading').hidden);assert(!doc.body.classList.contains('preview-locked'));
  assert.equal(e.requests.length,1);if(page==='index.html'){doc.getElementById('openOrderButton').click();assert.equal(e.navigations.at(-1),'/order/');}else{assert.equal(doc.querySelector('.hero'),null);assert.equal(doc.querySelector('.event-details'),null);assert.equal(doc.getElementById('openOrderButton'),null);assert(doc.querySelector('.order-section.open'));}assert.equal(doc.getElementById('quantityValue').textContent,'1');assert.equal(doc.getElementById('summaryQuantity').textContent,'1');assert.equal(doc.getElementById('summaryTotal').textContent,'$20.00');
  doc.getElementById('previewExit').click();assert(!doc.getElementById('previewGate').hidden);assert.equal(w.sessionStorage.getItem('kapparosBuyingPreviewV1'),null);assert(doc.body.classList.contains('preview-locked'));w.close();
 });
 await test('Sold-out notice replaces the landing action and stays there after a language change',async()=>{
  const e=fullBuyingPage(),{w}=e,doc=w.document;e.requests[0].resolve(Response.json({settings:{...site,inventory:0}}));await settle();
  const button=doc.getElementById('openOrderButton'),notice=doc.getElementById('availabilityMessage');
  // Load the external style used by the real page into this isolated DOM fixture.
  const style=doc.createElement('style');style.textContent=read('siksakapparos-order/buying-languages.css');doc.head.append(style);
  assert.equal(w.getComputedStyle(button).display,'none');assert.equal(button.disabled,true);assert.equal(notice.hidden,false);assert.equal(notice.textContent,'אלע כפרות זענען שוין פארקויפט');
  assert.equal(notice.previousElementSibling,button);assert(notice.nextElementSibling.classList.contains('event-contact'));
  doc.querySelector('[data-language="en"]').click();assert.equal(w.getComputedStyle(button).display,'none');assert.equal(notice.textContent,'Online orders are currently sold out.');
  w.applyConfig({...site,inventory:3});assert.notEqual(w.getComputedStyle(button).display,'none');assert.equal(button.disabled,false);assert.equal(notice.hidden,true);w.close();
 });
 function buyer(e,amount=1){
  const d=e.w.document;d.getElementById('customerName').value='Local fixture';d.getElementById('customerPhone').value='2125550100';d.getElementById('customerEmail').value='fixture@example.invalid';
  for(let i=1;i<amount;i++)d.getElementById('increaseQuantity').click();
 }
 await test('Online quantity controls stop at one and the actual available limit',async()=>{
  const e=fullBuyingPage('order/index.html'),{w}=e,d=w.document;e.requests[0].resolve(Response.json({settings:{...site,inventory:3}}));await settle();
  assert.equal(d.getElementById('decreaseQuantity').disabled,true);buyer(e,3);assert.equal(d.getElementById('quantityValue').textContent,'3');assert.equal(d.getElementById('increaseQuantity').disabled,true);
  d.getElementById('increaseQuantity').click();d.getElementById('increaseQuantity').dispatchEvent(new w.Event('click'));assert.equal(d.getElementById('quantityValue').textContent,'3');
  d.getElementById('decreaseQuantity').click();assert.equal(d.getElementById('quantityValue').textContent,'2');assert.equal(d.getElementById('increaseQuantity').disabled,false);w.close();
 });
 for(const remaining of [0,1])await test('Checkout checks fresh stock before payment when remaining drops to '+remaining,async()=>{
  const e=fullBuyingPage('order/index.html'),{w}=e,d=w.document;e.requests[0].resolve(Response.json({settings:{...site,inventory:3}}));await settle();buyer(e,3);
  d.getElementById('checkoutButton').click();assert.equal(e.requests.length,2);assert.equal(e.requests[1].init.cache,'no-store');assert.equal(e.requests[1].init.headers.Authorization,'Bearer local-preview-fixture');
  assert.equal(d.getElementById('checkoutButton').getAttribute('aria-busy'),'true');assert.equal(d.getElementById('increaseQuantity').disabled,true);assert.equal(d.getElementById('decreaseQuantity').disabled,true);
  assert(!d.getElementById('demoCheckoutModal').classList.contains('open'));d.getElementById('checkoutButton').click();assert.equal(e.requests.length,2);
  e.requests[1].resolve(Response.json({settings:{...site,inventory:remaining}}));await settle();
  assert(!d.getElementById('demoCheckoutModal').classList.contains('open'));assert.equal(d.getElementById('checkoutAvailabilityError').hidden,false);
  assert.equal(d.getElementById('quantityValue').textContent,String(remaining));assert.equal(d.getElementById('customerName').value,'Local fixture');assert.equal(d.getElementById('customerEmail').value,'fixture@example.invalid');
  assert.equal(d.getElementById('checkoutButton').disabled,remaining===0);assert.equal(d.getElementById('increaseQuantity').disabled,true);
  d.querySelector('[data-language="en"]').click();assert.match(d.getElementById('checkoutAvailabilityError').textContent,remaining===0?/sold out/:/not enough chickens/);
  assert.equal(w.sessionStorage.getItem('kapparosCheckoutSessionV1'),null);w.close();
 });
 await test('Sufficient fresh stock opens payment with the reviewed quantity and no sale request',async()=>{
  const e=fullBuyingPage('order/index.html'),{w}=e,d=w.document;e.requests[0].resolve(Response.json({settings:{...site,inventory:3}}));await settle();buyer(e,2);
  d.getElementById('checkoutButton').click();e.requests[1].resolve(Response.json({settings:{...site,inventory:2}}));await settle();
  assert(d.getElementById('demoCheckoutModal').classList.contains('open'));assert.equal(d.getElementById('demoPaymentTotal').textContent,'$40.00');assert.equal(d.getElementById('demoCardNumber').value,'');assert.equal(d.getElementById('checkoutAvailabilityError').hidden,true);assert.equal(e.requests.length,2);w.close();
 });
 await test('A failed stock check keeps the form and preview access intact and allows retry',async()=>{
  const e=fullBuyingPage('order/index.html'),{w}=e,d=w.document;e.requests[0].resolve(Response.json({settings:{...site,inventory:3}}));await settle();buyer(e,2);
  d.getElementById('checkoutButton').click();e.requests[1].reject(new Error('Local offline fixture'));await settle();
  assert(!d.getElementById('demoCheckoutModal').classList.contains('open'));assert.equal(d.getElementById('previewGate').hidden,true);assert(!d.body.classList.contains('preview-loading'));assert.equal(d.getElementById('customerName').value,'Local fixture');
  assert.equal(d.getElementById('checkoutButton').disabled,false);assert.equal(d.getElementById('quantityValue').textContent,'2');assert.equal(d.getElementById('checkoutAvailabilityError').hidden,false);
  d.getElementById('checkoutButton').click();assert.equal(e.requests.length,3);e.requests[2].resolve(Response.json({settings:{...site,inventory:3}}));await settle();assert(d.getElementById('demoCheckoutModal').classList.contains('open'));w.close();
 });
 await test('A changed price requires reviewing the new total before payment',async()=>{
  const e=fullBuyingPage('order/index.html'),{w}=e,d=w.document;e.requests[0].resolve(Response.json({settings:{...site,inventory:3}}));await settle();buyer(e,2);
  d.getElementById('checkoutButton').click();e.requests[1].resolve(Response.json({settings:{...site,inventory:3,price:25}}));await settle();
  assert(!d.getElementById('demoCheckoutModal').classList.contains('open'));assert.equal(d.getElementById('summaryTotal').textContent,'$50.00');assert.equal(d.getElementById('checkoutAvailabilityError').hidden,false);w.close();
 });
 await test('Checkout respects changed terms and expired preview access',async()=>{
  const e=fullBuyingPage('order/index.html'),{w}=e,d=w.document,terms={...site,inventory:3,termsEnabled:true,termsRevision:'before',pageContent:{...site.pageContent,termsText:'Fixture terms.'}};
  e.requests[0].resolve(Response.json({settings:terms}));await settle();buyer(e,1);d.getElementById('acceptBuyerTerms').click();
  d.getElementById('checkoutButton').click();e.requests[1].resolve(Response.json({settings:{...terms,termsRevision:'after',pageContent:{...terms.pageContent,termsText:'Changed fixture terms.'}}}));await settle();
  assert(!d.getElementById('demoCheckoutModal').classList.contains('open'));assert.equal(d.getElementById('acceptBuyerTerms').checked,false);d.getElementById('acceptBuyerTerms').click();
  d.getElementById('checkoutButton').click();e.requests[2].resolve(Response.json({locked:true}));await settle();assert.equal(d.getElementById('previewGate').hidden,false);assert(!d.getElementById('demoCheckoutModal').classList.contains('open'));w.close();
 });
 await test('A temporary connection failure offers retry without displaying the closed page or losing the preview session',async()=>{
  const e=fullBuyingPage(),{w}=e,doc=w.document;e.requests[0].reject(new Error('Offline fixture'));await settle();
  assert(doc.getElementById('previewGate').hidden);assert(!doc.getElementById('previewRetry').hidden);assert(doc.body.classList.contains('preview-locked'));
  assert.equal(w.sessionStorage.getItem('kapparosBuyingPreviewV1'),'local-preview-fixture');doc.getElementById('previewRetry').click();
  assert(doc.getElementById('previewRetry').hidden);assert.equal(e.requests.length,2);e.requests[1].resolve(Response.json({settings:site}));await settle();
  assert(!doc.body.classList.contains('preview-locked'));assert(doc.getElementById('previewGate').hidden);w.close();
 });
 await test('Only a confirmed locked response shows the English login screen',async()=>{
  const e=fullBuyingPage(),{w}=e,doc=w.document;assert(doc.getElementById('previewGate').hidden);
  e.requests[0].resolve(Response.json({locked:true}));await settle();assert(!doc.getElementById('previewGate').hidden);assert(doc.getElementById('previewLoading').hidden);
  assert(doc.body.classList.contains('preview-locked'));assert.equal(doc.documentElement.lang,'en');assert.equal(w.getComputedStyle(doc.querySelector('main')).display,'none');w.close();
 });
 await test('The clean order route restores an existing ticket only after access validation and Done returns home',async()=>{
  const e=fullBuyingPage('order/index.html',{id:'fixture-only',ticketId:'123456',orderToken:'fixture-only-token',fullName:'Local fixture',phone:'2125550100',quantity:2,price:40,remainingInventory:98}),{w}=e,doc=w.document;
  assert(!doc.getElementById('demoCheckoutModal').classList.contains('open'));e.requests[0].resolve(Response.json({settings:site}));await settle();
  assert(doc.getElementById('demoCheckoutModal').classList.contains('open'));assert.equal(doc.getElementById('demoTicketNumber').textContent,'123456');assert.equal(e.requests.length,1);doc.getElementById('demoDoneButton').click();assert.equal(JSON.parse(w.sessionStorage.getItem('kapparosBuyingHandoffV1')).settings.inventory,100);
  assert.equal(doc.querySelector('.order-back').href,'https://siksakapparos.org/');doc.getElementById('demoDoneButton').click();assert.equal(e.navigations.at(-1),'/');
  assert.equal(w.sessionStorage.getItem('kapparosCompletedTicketV1'),null);assert.equal(w.sessionStorage.getItem('kapparosBuyingPreviewV1'),'local-preview-fixture');w.close();
 });
 await test('The legacy order URL preserves its query and fragment; nested assets and the original chicken icon remain valid',()=>{
  const old=new JSDOM(read('siksakapparos-order/order.html'),{url:'https://siksakapparos.org/order.html?language=en#summary',runScripts:'outside-only'});let target;
  old.window.__navigate=value=>target=value;old.window.eval(old.window.document.querySelector('script').textContent.replace('window.location.replace','window.__navigate'));assert.equal(target,'/order/?language=en#summary');old.window.close();
  const e=fullBuyingPage('order/index.html'),doc=e.w.document;
  for(const el of doc.querySelectorAll('script[src],link[rel="stylesheet"]')){const url=new URL(el.src||el.href);assert(fs.existsSync(path.join(root,'siksakapparos-order',url.pathname)));}
  assert.equal(doc.querySelector('base'),null);assert.equal(doc.querySelector('link[rel="canonical"]').href,'https://siksakapparos.org/order/');
  const png=fs.readFileSync(path.join(root,'siksakapparos-order/favicon.png'));assert.equal(png.readUInt32BE(16),256);assert.equal(png.readUInt32BE(20),256);
  assert(png.equals(Buffer.from(doc.querySelector('.hero-chicken').src.split(',')[1],'base64')));assert.equal(doc.querySelector('link[rel="icon"]').href,'https://siksakapparos.org/favicon.png');
  for(const file of ['index.html','order/index.html'])assert(!read('siksakapparos-order/'+file).includes('Demo payments do not charge a card. Successful tests are saved as paid online sales.'));
  e.w.close();
 });
 await test('New visits to the order route return home and discard a previous checkout',()=>{
  const e=fullBuyingPage('order/index.html',{id:'old',ticketId:'123456',orderToken:'old-token'},{navigationType:'navigate'});
  assert.equal(e.navigations.at(-1),'/');assert.equal(e.requests.length,0);assert.equal(e.w.sessionStorage.getItem('kapparosCompletedTicketV1'),null);e.w.close();
 });
 await test('A new homepage visit cannot reopen a completed terminal',async()=>{
  const e=fullBuyingPage('index.html',{id:'old',ticketId:'123456',orderToken:'old-token'},{navigationType:'navigate'});e.requests[0].resolve(Response.json({settings:site}));await settle();
  assert.equal(e.w.sessionStorage.getItem('kapparosCompletedTicketV1'),null);assert(!e.w.document.getElementById('demoCheckoutModal').classList.contains('open'));e.w.close();
 });
 await test('Logout clears the terminal and next login from the order route goes home',async()=>{
  const e=fullBuyingPage('order/index.html'),{w}=e,d=w.document;e.requests[0].resolve(Response.json({settings:site}));await settle();buyer(e,1);
  d.getElementById('checkoutButton').click();e.requests[1].resolve(Response.json({settings:site}));await settle();d.getElementById('demoCardName').value='Fixture card';
  w.sessionStorage.setItem('kapparosCompletedTicketV1','old');w.sessionStorage.setItem('kapparosCheckoutSessionV1','old');d.getElementById('previewExit').click();
  assert.equal(e.navigations.at(-1),'/');assert.equal(w.sessionStorage.getItem('kapparosCompletedTicketV1'),null);assert.equal(w.sessionStorage.getItem('kapparosCheckoutSessionV1'),null);
  assert.equal(d.getElementById('demoCardName').value,'');assert(!d.getElementById('demoCheckoutModal').classList.contains('open'));
  d.getElementById('previewUsername').value='fixture';d.getElementById('previewPassword').value='fixture';d.getElementById('previewLoginForm').dispatchEvent(new w.Event('submit',{cancelable:true}));
  e.requests[2].resolve(Response.json({token:'new-fixture-token',settings:site}));await settle();assert.equal(e.navigations.at(-1),'/');
  assert(!d.getElementById('demoCheckoutModal').classList.contains('open'));assert.equal(JSON.parse(w.sessionStorage.getItem('kapparosBuyingHandoffV1')).path,'/');w.close();
 });
 await test('Internal navigation uses a single-use recent configuration; expired or changed-session copies are rejected',async()=>{
  const a=fullBuyingPage(),{w}=a;a.requests[0].resolve(Response.json({settings:site}));await settle();w.document.getElementById('openOrderButton').click();
  const handoff=JSON.parse(w.sessionStorage.getItem('kapparosBuyingHandoffV1'));
  const b=fullBuyingPage('order/index.html',null,{navigationType:'navigate',handoff});assert.equal(b.requests.length,0);assert(!b.w.document.body.classList.contains('preview-locked'));assert.equal(b.w.sessionStorage.getItem('kapparosBuyingHandoffV1'),null);b.w.BuyingVisit.go('/');assert.equal(JSON.parse(b.w.sessionStorage.getItem('kapparosBuyingHandoffV1')).verifiedAt,handoff.verifiedAt);buyer(b,1);b.w.document.getElementById('checkoutButton').click();assert.equal(b.requests.length,1);b.requests[0].resolve(Response.json({settings:site}));await settle();assert(b.w.document.getElementById('demoCheckoutModal').classList.contains('open'));
  for(const value of [{...handoff,at:Date.now()-60001},{...handoff,token:'different-session'}]){const c=fullBuyingPage('order/index.html',null,{navigationType:'navigate',handoff:value});assert.equal(c.navigations.at(-1),'/');assert.equal(c.requests.length,0);c.w.close();}
  w.close();b.w.close();
 });
 await test('Returning through browser history closes the terminal and returns home',async()=>{
  const e=fullBuyingPage('order/index.html'),{w}=e,d=w.document;e.requests[0].resolve(Response.json({settings:site}));await settle();buyer(e,1);d.getElementById('checkoutButton').click();e.requests[1].resolve(Response.json({settings:site}));await settle();
  d.getElementById('demoCardName').value='Private fixture';w.dispatchEvent(new w.PageTransitionEvent('pagehide',{persisted:true}));assert.equal(d.getElementById('demoCardName').value,'');assert(!d.getElementById('demoCheckoutModal').classList.contains('open'));
  w.sessionStorage.setItem('kapparosCompletedTicketV1','old');w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));assert.equal(e.navigations.at(-1),'/');assert.equal(w.sessionStorage.getItem('kapparosCompletedTicketV1'),null);w.close();
 });
 await test('Payment stays English during Yiddish ordering and language switches',async()=>{
  const e=fullBuyingPage('order/index.html'),{w}=e,d=w.document;e.requests[0].resolve(Response.json({settings:site}));await settle();buyer(e,1);d.getElementById('checkoutButton').click();e.requests[1].resolve(Response.json({settings:site}));await settle();
  assert.equal(d.documentElement.lang,'yi');assert.equal(d.getElementById('demoCheckoutModal').dir,'ltr');assert.equal(d.querySelector('[for="demoCardName"]').textContent,'Name on card');assert.equal(d.getElementById('demoCheckoutTitle').textContent,'Secure card payment');
  d.getElementById('demoCardName').value='Untouched fixture';d.querySelector('[data-language="en"]').click();d.querySelector('[data-language="yi"]').click();assert.equal(d.getElementById('demoCardName').value,'Untouched fixture');assert.equal(d.getElementById('demoCheckoutTitle').textContent,'Secure card payment');
  d.getElementById('demoPaymentForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();assert.equal(d.getElementById('demoPaymentError').textContent,'This demo accepts only the test card shown above.');assert.equal(e.requests.length,2);w.close();
 });
 await test('A quick load never shows a spinner; a genuinely slow access check does',async()=>{
  const e=fullBuyingPage(),d=e.w.document;assert.equal(d.getElementById('previewLoading').hidden,true);e.requests[0].resolve(Response.json({settings:site}));await settle();assert.equal(d.getElementById('previewLoading').hidden,true);e.w.close();
  const slow=fullBuyingPage();await new Promise(r=>setTimeout(r,330));assert.equal(slow.w.document.getElementById('previewLoading').hidden,false);assert.equal(slow.w.document.getElementById('previewGate').hidden,true);slow.requests[0].resolve(Response.json({settings:site}));await settle();assert.equal(slow.w.document.getElementById('previewLoading').hidden,true);slow.w.close();
 });

 await test('A stock response arriving after logout cannot reopen payment',async()=>{
  const e=fullBuyingPage('order/index.html'),{w}=e,d=w.document;e.requests[0].resolve(Response.json({settings:site}));await settle();buyer(e,1);d.getElementById('checkoutButton').click();d.getElementById('previewExit').click();
  e.requests[1].resolve(Response.json({settings:site}));await settle();assert(!d.getElementById('demoCheckoutModal').classList.contains('open'));assert(!d.getElementById('previewGate').hidden);assert.equal(w.sessionStorage.getItem('kapparosBuyingPreviewV1'),null);w.close();
 });
 console.log(count+' regression checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
