const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
function fn(name){const a=html.search(new RegExp('    (?:async )?function '+name+'\\('));assert.ok(a>=0,name);return html.slice(a,html.indexOf('\n    }',a)+6);}
const nodes={expenseUnpaidTotal:{}};
const expenseList={closest:()=>({})};let confirms=true,saves=0;
const env=vm.createContext({state:{settings:{},expenseSearchQuery:''},CHICKEN_EXPENSE_ID:'auto-chicken-inventory-cost',document:{getElementById:id=>nodes[id]},expenseList,expenseEmpty:{},accountingExpensePeriodLabel:{},getAccountingMonthLabel:m=>m,isExpenseDueSoon:()=>false,escapeHtml:String,previewText:String,formatTodoDate:String,money:n=>'$'+Number(n).toFixed(2),pendingSecurityAction:null,closeSecurityDialog(){env.pendingSecurityAction=null;},askConfirmation:async()=>confirms,CHANGE_CONFIRMATION:'Confirm',saveSettings(){saves++;},renderAccounting(){},showToast(){}});
vm.runInContext(['getExpensePaymentTotals','getAccountingExpenses','expensePaymentComplete','renderExpenseList','completeSecurityAction'].map(fn).join('\n'),env);
const expenses=[{id:'a',name:'One',amount:0.1,paid:false,date:'2026-08-12'},{id:'b',name:'Two',amount:0.2,paid:false,date:'2026-09-12'},{id:'c',name:'Three',amount:40.23,paid:true,date:'2026-09-12'}, {id:'auto-chicken-inventory-cost',name:'Chickens',amount:1000,paid:false,date:'2026-08-31'}];
env.state.settings={accountingExpenses:expenses,chickenPurchaseBatches:[{quantity:60,unitCost:10,date:'2026-08-31'},{quantity:40,unitCost:10,date:'2026-09-11'}]};
let totals=env.getExpensePaymentTotals(env.getAccountingExpenses());assert.equal(totals.unpaid,1000.3);assert.equal(totals.paid,40.23);
env.renderExpenseList(env.getAccountingExpenses(),'2026-09',true);assert.equal(nodes.expenseUnpaidTotal.textContent,'$1000.30');
let month=env.getAccountingExpenses('2026-09');totals=env.getExpensePaymentTotals(month);assert.equal(totals.unpaid,400.2);assert.equal(totals.paid,40.23);
env.state.expenseSearchQuery='no matching expenses';env.renderExpenseList(month,'2026-09',false);assert.equal(nodes.expenseUnpaidTotal.textContent,'$400.20','search does not change selected-period totals');
expenses[3].paid=true;totals=env.getExpensePaymentTotals(env.getAccountingExpenses('2026-09'));assert.equal(totals.unpaid,0.2);assert.equal(totals.paid,440.23);assert.equal(env.getExpensePaymentTotals(env.getAccountingExpenses()).paid,1040.23);
env.renderExpenseList([],'2026-10',false);assert.equal(nodes.expenseUnpaidTotal.textContent,'$0.00');
// Load/refresh removes legacy payment details from unpaid records only.
const saved={accountingExpenses:[{...expenses[0],paymentType:'credit',paymentDetails:'Visa ending 1234'},{...expenses[2],paymentType:'check',paymentDetails:'Check #123'}]};
Object.assign(env,{localStorage:{getItem:()=>JSON.stringify(saved)},SETTINGS_KEY:'fixture'});
vm.runInContext(html.slice(html.indexOf('    const DEFAULT_TICKET_DELIVERY'),html.indexOf('    const CHICKEN_EXPENSE_ID'))+'\n'+fn('loadSettings'),env);
const loaded=env.loadSettings();assert.equal(loaded.accountingExpenses[0].paymentType,'');assert.equal(loaded.accountingExpenses[0].paymentDetails,'');assert.equal(loaded.accountingExpenses[1].paymentDetails,'Check #123');
// Category follows Name in the actual form DOM order.
const form=html.slice(html.indexOf('<form id="expenseForm">'),html.indexOf('</form>',html.indexOf('<form id="expenseForm">')));
const fieldOrder=[...form.matchAll(/<label for="(expense\w+)"/g)].map(m=>m[1]);assert.deepEqual(fieldOrder.slice(0,3),['expenseName','expenseCategory','expenseAmount']);
(async()=>{
 const paid={id:'paid-fixture',paid:true,paymentType:'credit',paymentDetails:'Visa ending 1234'};env.state.settings.accountingExpenses=[paid];env.pendingSecurityAction='unpay-expenses';confirms=false;await env.completeSecurityAction('fixture');assert.equal(paid.paid,true);assert.equal(paid.paymentType,'credit');assert.equal(saves,0);
 env.pendingSecurityAction='unpay-expenses';confirms=true;await env.completeSecurityAction('fixture');assert.equal(paid.paid,false);assert.equal(paid.paymentType,'');assert.equal(paid.paymentDetails,'');assert.equal(saves,1);
 console.log('PASS: paid/unpaid totals, cents, monthly chicken allocations, search and empty results, state changes, stale payment cleanup on reload, confirmed bulk reset, Category ordering.');
})().catch(e=>{console.error(e);process.exitCode=1;});
