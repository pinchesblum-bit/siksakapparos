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
let checks = 0;
function test(name, fn) { return Promise.resolve().then(fn).then(()=>{checks++; console.log('PASS',name);}); }
function dom(file) { return new JSDOM(read(file), {url:'https://siksakapparos.org/',runScripts:'outside-only'}); }
function evalScript(window,file) {window.eval(read(file));}
function transpile(file) { const code=read(file).replace(/^import .*;$/mg,'').replace('export async function','async function'); return ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText; }
function backend(file, options={}) {
  let handler; const calls=[];
  const context=vm.createContext({console,Request,Response,Headers,AbortSignal,TextEncoder,Uint8Array,crypto:webcrypto,
    KapparosBuyingContent:copy, OPENING_NOTICE:'notice', hasBuyingAccess:async()=>options.access??false,previewLogin:async()=> 'test-preview',
    Deno:{env:{get:k=>({SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'server-test-key',KAPPAROS_TRANSLATE_API_KEY:options.key}[k])},serve:f=>handler=f},
    fetch:async(url,init)=>{calls.push({url,init});
      if(url.includes('kapparos_sessions')) return Response.json(options.authorized?[{token_hash:'mock'}]:[]);
      if(url.includes('kapparos_app_state')) return Response.json([{settings:options.admin||{},sales:options.sales||[]}]);
      if(options.providerError) return Response.json({error:'private provider diagnostic'},{status:400});
      const q=JSON.parse(init.body).q;return Response.json({data:{translations:q.map(()=>({translatedText:'Updated time'}))}});
    }});
  vm.runInContext(transpile(file).replace('export async function handleRequest','async function handleRequest'),context);
  return {handler,calls,context};
}
const request = (texts,token='a'.repeat(64),origin='https://pinchesblum-bit.github.io')=>new Request('https://test.invalid/translate',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({texts})});
(async()=>{
 await test('English defaults, exact-source caching, blank text, limits and public allowlist',()=>{
  assert.equal(copy.english({}).missing.length,0);
  const settings={pageContent:{timeText:'פון ניין ביז צען',services:''},englishContent:{source:{timeText:'old'},values:{timeText:'Stale time'}},password:'private',price:20};
  const e=copy.english(settings);assert(e.missing.includes('timeText'));assert.equal(e.values.services,'');
  assert.equal(copy.source({pageContent:{venue:'x'.repeat(500)}}).venue.length,240);
  const p=copy.publicCopy(settings,['title','gateTitle','gateDescription']);assert(!JSON.stringify(p).includes('private'));assert(!Object.hasOwn(p.pageContent,'timeText'));
 });
 for(const file of ['index.html','order.html']) await test(file+' language choice, saved settings, safe text, blank hiding and unchanged checkout numbers',()=>{
  const {window:w}=dom('siksakapparos-order/'+file);
  evalScript(w,'siksakapparos-order/buying-content.js');evalScript(w,'siksakapparos-order/buying-languages.js');
  const total=w.document.getElementById('summaryTotal').textContent;
  w.document.getElementById('customerName').value='Customer test name';
  w.BuyingLanguages.apply({title:'פנים מאירות סיקסא',subtitle:'ערב יום כיפור כפרות',pageContent:{phoneNumber:'212-555-0100',services:''}});
  assert.equal(w.document.documentElement.lang,'yi');assert.equal(w.document.querySelector('.event-contact a').href,'tel:+12125550100');assert(w.document.querySelector('.event-services').hidden);
  w.document.querySelector('[data-language="en"]').click();
  assert.equal(w.document.documentElement.lang,'en');assert.equal(w.document.querySelector('.event-time').textContent,'From 5:40 to 8:00');
  assert.equal(w.localStorage.getItem('kapparosBuyingLanguageV1'),'en');
  assert.equal(w.document.getElementById('summaryTotal').textContent,total);assert.equal(w.document.getElementById('customerName').value,'Customer test name');
  w.BuyingLanguages.apply({pageContent:{venue:'<img src=x onerror=alert(1)>',timeText:'נייע צייט'},englishContent:{source:{timeText:'old'},values:{timeText:'Stale'}}});
  assert.equal(w.document.documentElement.lang,'yi');assert(w.document.querySelector('[data-language="en"]').hidden);assert.equal(w.document.querySelector('.event-venue img'),null);
  assert.equal(w.document.querySelector('.event-time').textContent,'נייע צייט');
  const empty=Object.fromEntries(w.KapparosBuyingContent.fields.filter(f=>!f.root).map(f=>[f.key,'']));
  w.BuyingLanguages.apply({pageContent:empty});assert(w.document.querySelector('.event-details').hidden);assert(w.document.querySelector('.event-booking').hidden);
  w.close();
 });
 await test('Admin form preserves extra settings; cancel restores fields; translation submits public copy only',async()=>{
  const {window:w}=dom('siksakapparos/index.html');
  evalScript(w,'siksakapparos/buying-content.js');evalScript(w,'siksakapparos/buying-settings.js');
  let settings={...Object.fromEntries(copy.fields.filter(f=>f.root).map(f=>[f.key,f.yi])),publicAccessEnabled:false,orderingEnabled:true,extra:{keep:true},price:20,inventory:100};
  const ids={title:'settingBuyingTitle',subtitle:'settingBuyingSubtitle',buttonText:'settingBuyingButtonText',confirmationText:'settingBuyingConfirmationText'};
  for(const [key,id] of Object.entries(ids)) w.document.getElementById(id).value=settings[key];
  w.BuyingSettingsEditor.fill(settings);w.document.getElementById('buyingCopy-timeText').value='נייע צייט';
  w.AbortSignal=AbortSignal;
  let captured;
  w.fetch=async(url,init)=>{captured=JSON.parse(init.body);return Response.json({values:{timeText:'New time'}});};
  const next=w.BuyingSettingsEditor.read(settings);assert.equal(next.extra.keep,true);assert.equal(next.price,20);assert.equal(next.publicAccessEnabled,false);
  const english=await w.BuyingSettingsEditor.translate(next,'local-test-token');assert.deepEqual(Object.keys(captured.texts),['timeText']);assert.equal(english.values.timeText,'New time');
  w.BuyingSettingsEditor.fill(settings);assert.equal(w.document.getElementById('buyingCopy-timeText').value,'פון 5:40 ביז 8:00');
  w.fetch=async()=>Response.json({error:'Connection required'},{status:503});
  await assert.rejects(w.BuyingSettingsEditor.translate(next,'test'),/Connection required/);
  w.close();
 });
 await test('Existing Edit mode leaves both buying switches usable',()=>{
  const source=read('siksakapparos/index.html');
  const func=source.slice(source.indexOf('    function setSettingsEditMode('),source.indexOf('    function resetSettingsSection('));
  const {window:w}=dom('siksakapparos/index.html');
  evalScript(w,'siksakapparos/buying-content.js');evalScript(w,'siksakapparos/buying-settings.js');w.BuyingSettingsEditor.fill({});
  w.eval('const settingsEditMode={};'+func+';setSettingsEditMode("buying",false);');
  assert.equal(w.document.getElementById('settingBuyingEnabled').disabled,false);assert.equal(w.document.getElementById('settingBuyingPublicAccess').disabled,false);
  assert.equal(w.document.getElementById('buyingCopy-timeText').disabled,true);w.close();
 });
 await test('Save uses one confirmation, preserves switches and shared settings, and reports translation failure after saving Yiddish',async()=>{
  const {window:w}=dom('siksakapparos/index.html');
  evalScript(w,'siksakapparos/buying-content.js');evalScript(w,'siksakapparos/buying-settings.js');
  w.state={settings:{buyingWebsite:{...Object.fromEntries(copy.fields.filter(f=>f.root).map(f=>[f.key,f.yi])),publicAccessEnabled:false,orderingEnabled:true,price:20,inventory:100,extra:'keep'}}};
  const ids={title:'settingBuyingTitle',subtitle:'settingBuyingSubtitle',buttonText:'settingBuyingButtonText',confirmationText:'settingBuyingConfirmationText'};
  for(const [key,id] of Object.entries(ids))w.document.getElementById(id).value=w.state.settings.buyingWebsite[key];
  w.BuyingSettingsEditor.fill(w.state.settings.buyingWebsite);
  w.document.getElementById('buyingCopy-timeText').value='נייע צייט';
  w.cloudSessionToken='local-test';w.CHANGE_CONFIRMATION='Existing confirmation';w.settingsEditMode={buying:true};
  let confirmations=0,saves=0,resolveFinished;
  const finished=new Promise(r=>resolveFinished=r);
  w.askConfirmation=async()=>{confirmations++;return true;};w.saveSettings=()=>saves++;
  w.flushCloudSave=async()=>{};w.showToast=()=>resolveFinished();
  w.setSettingsEditMode=(section,editing)=>{w.settingsEditMode[section]=editing;};
  w.BuyingSettingsEditor.translate=async()=>{throw new Error('Connection required');};
  const source=read('siksakapparos/index.html');const start=source.indexOf('    let buyingSettingsSaving = false;');
  w.eval(source.slice(start,source.indexOf("    websiteSettingsForm.addEventListener('submit'",start)));
  w.document.getElementById('buyingWebsiteSettingsForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await finished;
  assert.equal(confirmations,1);assert.equal(saves,1);assert.equal(w.state.settings.buyingWebsite.pageContent.timeText,'נייע צייט');
  assert.equal(w.state.settings.buyingWebsite.price,20);assert.equal(w.state.settings.buyingWebsite.inventory,100);assert.equal(w.state.settings.buyingWebsite.publicAccessEnabled,false);assert.equal(w.state.settings.buyingWebsite.extra,'keep');
  assert.match(w.document.getElementById('buyingWebsiteSettingsMessage').textContent,/Yiddish wording saved.*Connection required/);
  w.close();
 });
 const file='siksakapparos/supabase/functions/kapparos-buying-translate/index.ts';
 await test('Translation rejects unauthorized sessions/origins before provider access',async()=>{
  const b=backend(file);
  assert.equal((await b.handler(request({timeText:'נייע צייט'},''))).status,401);assert.equal(b.calls.length,0);
  assert.equal((await b.handler(request({timeText:'נייע צייט'}))).status,401);assert.equal(b.calls.length,1);
  assert.equal((await b.handler(request({timeText:'נייע צייט'},'a'.repeat(64),'https://evil.invalid'))).status,403);assert.equal(b.calls.length,1);
 });
 await test('Translation missing connection is explicit and never fabricates translations',async()=>{
  const b=backend(file,{authorized:true});const r=await b.handler(request({timeText:'נייע צייט'}));assert.equal(r.status,503);assert.equal((await r.json()).code,'translation_setup_required');assert.equal(b.calls.length,1);
 });
 await test('Only bounded allowlisted copy is sent to the provider; complete English is returned',async()=>{
  const b=backend(file,{authorized:true,key:'provider-test-key'});
  assert.equal((await b.handler(request({customerEmail:'private@example.invalid'}))).status,400);
  assert.equal((await b.handler(request({timeText:'x'.repeat(201)}))).status,400);
  const r=await b.handler(request({timeText:'נייע צייט',phoneNumber:'845-372-3311'}));assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{values:{phoneNumber:'845-372-3311',timeText:'Updated time'}});
  const provider=b.calls.find(c=>c.url.includes('translation.googleapis.com'));assert.deepEqual(JSON.parse(provider.init.body).q,['נייע צייט']);
  assert.equal((await b.handler(request({timeText:'נאך א צייט'}))).status,429);
 });
 await test('Provider failure does not leak credentials or provider diagnostics',async()=>{
  const b=backend(file,{authorized:true,key:'provider-test-key',providerError:true});const r=await b.handler(request({timeText:'נייע צייט'}));assert.equal(r.status,502);const text=await r.text();assert(!text.includes('provider-test-key'));assert(!text.includes('private provider diagnostic'));
 });
 await test('Public locked config exposes gate copy only; manual access guard is preserved',async()=>{
  const b=backend('siksakapparos/supabase/functions/kapparos-public-config/index.ts',{admin:{buyingWebsite:{pageContent:{gateTitle:'Closed for now',phoneNumber:'private-test'}},passwordHash:'private-hash',defaultPrice:20,inventory:100}});
  const r=await b.handler(request({}));assert.equal(r.status,200);const result=await r.json();assert.equal(result.locked,true);assert.equal(result.settings,undefined);assert.equal(result.copy.pageContent.gateTitle,'Closed for now');assert(!JSON.stringify(result).includes('private'));
 });
 await test('Price, inventory and ticket settings are unchanged in public config',async()=>{
  const admin={defaultPrice:20,inventory:100,printTicketsEnabled:false,ticketDelivery:{heading:'Keep template'},buyingWebsite:{publicAccessEnabled:true,pageContent:{timeText:'New time'}}};
  const b=backend('siksakapparos/supabase/functions/kapparos-public-config/index.ts',{access:true,admin,sales:[{status:'paid',quantity:3},{status:'reserved',quantity:8}]});
  const result=await (await b.handler(request({}))).json();assert.equal(result.settings.price,20);assert.equal(result.settings.inventory,97);assert.equal(result.settings.printTicketsEnabled,false);assert.equal(result.settings.ticketDelivery.heading,'Keep template');assert.equal(result.settings.pageContent.timeText,'New time');
 });
 console.log(checks+' checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
