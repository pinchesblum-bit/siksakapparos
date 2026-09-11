const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
function fn(name){const a=html.search(new RegExp('    (?:async )?function '+name+'\\('));assert.ok(a>=0,name);return html.slice(a,html.indexOf('\n    }',a)+6);}
function field(){const classes=new Set();return {value:'',checked:false,disabled:false,hidden:false,textContent:'',classList:{contains:s=>classes.has(s),toggle(s,on){on?classes.add(s):classes.delete(s);},add:s=>classes.add(s),remove:s=>classes.delete(s)},setAttribute(){},setCustomValidity(s){this.validationMessage=s;},focus(){}};}
const ids=['expenseName','expenseAmount','expenseDate','expenseCategory','expenseNote','expensePaid','expensePaymentType','expensePaymentDetails','expensePaymentDetailsField','expensePaymentDetailsLabel','expensePaymentTypeField','expensePaymentNotice','expenseModal','expenseModalTitle','deleteExpenseBtn','cancelExpenseBtn','editExpenseBtn','saveExpenseBtn','accountingMonth'];
const fields=Object.fromEntries(ids.map(id=>[id,field()]));let confirmations=0,saves=0,confirm=true;
const form=field();form.reportValidity=()=>Object.values(fields).every(f=>f.disabled||(!f.required||String(f.value).trim())&&!f.validationMessage);form.reset=()=>{};
const env=vm.createContext({...fields,expenseForm:form,state:{settings:{accountingExpenses:[],chickenExpenseName:'Chickens'},editingExpenseId:null},CHICKEN_EXPENSE_ID:'auto-chicken-inventory-cost',document:{getElementById:id=>fields[id]},getLocalDateValue:()=> '2026-09-11',getChickenPurchaseTotal:()=>1000,setTimeout:f=>f(),crypto:require('node:crypto').webcrypto,CHANGE_CONFIRMATION:'ביסטו זיכער אז דו ווילסט מאכן דעם טויש?',askConfirmation:async()=>{confirmations++;return confirm;},saveSettings(){saves++;},renderAccounting(){},showToast(){}});
vm.runInContext(['expensePaymentComplete','updateExpensePaymentFields','setExpenseFieldMode','showExpenseView','showExpenseEditor','closeExpenseModal'].map(fn).join('\n'),env);
function handler(target,event){const a=html.indexOf("    "+target+".addEventListener('"+event+"', async ");const b=html.indexOf('\n    });',a)+8;assert.ok(a>=0);env[target].addEventListener=(_,f)=>{env[target+'Handler']=f;};vm.runInContext(html.slice(a,b),env);}
handler('expensePaid','change');handler('expenseForm','submit');const submit=()=>env.expenseFormHandler({preventDefault(){}});
const base=()=>({id:'fixture-expense',name:'Supplies',amount:30,date:'2026-09-11',category:'Materials',note:'Keep this exact note',paid:false});
function open(expense){env.state.settings.accountingExpenses=[expense];env.state.editingExpenseId=expense.id;env.showExpenseView(expense);}
(async()=>{
 // Unpaid expenses still save without payment information.
 env.showExpenseEditor();fields.expenseName.value='New expense';fields.expenseAmount.value='20';fields.expenseDate.value='2026-09-11';assert.equal(fields.expensePaymentType.required,false);await submit();assert.equal(env.state.settings.accountingExpenses[0].paid,false);
 let expense=base();open(expense);let before=confirmations, savedBefore=saves;
 fields.expensePaid.checked=true;await env.expensePaidHandler();
 assert.equal(confirmations,before,'Paid click does not ask for confirmation');
 assert.equal(saves,savedBefore);assert.equal(expense.paid,false,'Paid remains a draft until saved');
 assert.equal(form.classList.contains('expense-readonly'),false,'Paid opens full editor');
 assert.equal(fields.expenseName.disabled,false);assert.equal(fields.expenseAmount.disabled,false);
 assert.equal(fields.expensePaymentType.disabled,false);assert.equal(fields.expensePaymentType.required,true);assert.equal(fields.saveExpenseBtn.hidden,false);
 await submit();assert.equal(expense.paid,false);assert.equal(confirmations,before,'missing method blocks save');
 fields.expensePaymentType.value='check';fields.expensePaymentDetails.value='  ';env.updateExpensePaymentFields();await submit();assert.equal(expense.paid,false);
 fields.expensePaymentDetails.value='Check #1042';confirm=false;await submit();assert.equal(expense.paid,false);assert.equal(confirmations,before+1,'normal Save confirmation remains');
 confirm=true;await submit();assert.equal(expense.paid,true);assert.equal(expense.paymentDetails,'Check #1042');assert.equal(expense.amount,30);
 // Unpaid asks immediately, before opening any editor.
 open(expense);confirm=false;before=confirmations;fields.expensePaid.checked=false;await env.expensePaidHandler();assert.equal(confirmations,before+1);assert.equal(expense.paid,true);assert.equal(fields.expensePaid.checked,true);assert.equal(form.classList.contains('expense-readonly'),true);
 confirm=true;fields.expensePaid.checked=false;await env.expensePaidHandler();assert.equal(expense.paid,false);assert.equal(form.classList.contains('expense-readonly'),true);
 // Even with stored payment information, Paid always opens the editor without a prompt.
 before=confirmations;fields.expensePaid.checked=true;await env.expensePaidHandler();assert.equal(confirmations,before);assert.equal(form.classList.contains('expense-readonly'),false);assert.equal(expense.paid,false);assert.equal(fields.expensePaymentType.value,'check');env.closeExpenseModal();assert.equal(expense.paid,false,'cancel does not mark paid');
 // Chicken expense enters editing while keeping name and price protected.
 expense={...base(),id:'auto-chicken-inventory-cost',name:'Chickens',amount:1000};open(expense);before=confirmations;fields.expensePaid.checked=true;await env.expensePaidHandler();assert.equal(confirmations,before);assert.equal(fields.expenseName.disabled,true);assert.equal(fields.expenseAmount.disabled,true);assert.equal(fields.expensePaymentType.disabled,false);fields.expensePaymentType.value='cash';await submit();assert.equal(expense.paid,true);assert.equal(expense.amount,1000);
 expense={...base(),paid:true};open(expense);fields.expensePaid.checked=false;await env.expensePaidHandler();assert.equal(expense.paid,false,'legacy paid record may be marked unpaid without payment info');
 expense=base();open(expense);fields.expensePaid.checked=true;await env.expensePaidHandler();fields.expensePaymentType.value='credit';env.updateExpensePaymentFields();await submit();assert.equal(expense.paid,false);fields.expensePaymentDetails.value='Visa ending 1234';await submit();assert.equal(expense.paid,true);
 expense=base();open(expense);env.showExpenseEditor(expense);fields.expenseNote.value='Edited unpaid';await submit();assert.equal(expense.note,'Edited unpaid');assert.equal(expense.paid,false);
 console.log('PASS: Paid opens the editor without confirmation, including stored methods; payment validation and Save confirmation; Unpaid confirms immediately; cancel keeps saved state; protected chicken fields and unpaid saves.');
})().catch(e=>{console.error(e);process.exitCode=1;});
