'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const grades=[3,4,5,6,7,8,9,10,11,12],locked={class:true,review:false,live:false,exam:false,print:false};
const script=file=>fs.readFileSync('public/ot/'+file,'utf8');
const settle=()=>new Promise(setImmediate);
function fixture(t,fetcher){
 const dom=new JSDOM('<!doctype html><body><header><span class="wordmark"><span class="product-name"><small>Giáo viên</small></span></span></header><main id="app"><section class="teacher-dashboard"><div class="dashboard-heading"><h1>Quản lý</h1><div class="dashboard-actions"><button id="create">Tạo</button></div></div><div class="dashboard-filter"></div><div class="pack-grid"></div></section></main></body>',{url:'https://fptbnmonitor.online/giaovien',runScripts:'outside-only'});
 t.after(()=>dom.window.close());const w=dom.window;w.sessionStorage.setItem('ot-teacher-token','teacher');w.alert=message=>{throw Error(message);};w.fetch=fetcher;
 w.eval(script('default-tabs-settings.js'));w.eval(script('teacher-workspaces.js'));return{w,doc:w.document};
}
const response=data=>({status:200,ok:true,json:async()=>data});
const defaults=()=>({success:true,tabs:Object.fromEntries(grades.map(g=>[g,g===6?'review':'class']))});
const rights=()=>({success:true,scope:'grade',grades:Object.fromEntries(grades.map(g=>[g,{...locked,...(g===6?{review:true}:{})}]))});

test('grade dropdowns keep default-page radios independent of the adjacent access checkboxes',async t=>{
 const posts=[];const {w,doc}=fixture(t,async(url,opts)=>{if(opts.method==='POST'){posts.push({url,body:JSON.parse(opts.body)});return response(url.endsWith('/grades')?{success:true,scope:'grade',...JSON.parse(opts.body)}:defaults());}return response(url.endsWith('/grades')?rights():defaults());});
 await settle();await doc.querySelector('[data-teacher-space="settings"]').onclick();
 assert.equal(doc.getElementById('app').dataset.workspace,'settings');assert.equal(doc.querySelector('[data-teacher-space="permissions"]'),null);assert.equal(doc.querySelector('#permissionClassList'),null);
 assert.equal(doc.querySelectorAll('.grade-tab-picker').length,10);assert.equal(doc.querySelectorAll('[data-default-grade]').length,50);assert.equal(doc.querySelectorAll('[data-access-grade]').length,50);
 assert.equal(doc.querySelector('[data-default-label="6"]').textContent,'Ôn tập tại nhà');
 const picker=doc.querySelector('.grade-tab-picker[data-grade="6"]');picker.open=true;
 const review=doc.querySelector('[data-access-grade="6"][data-tab="review"]');review.checked=false;review.dispatchEvent(new w.Event('change'));
 assert.equal(doc.querySelector('[data-default-grade="6"]:checked').value,'review','unchecking access must not change the saved default selection');
 const exam=doc.querySelector('[data-default-grade="6"][value="exam"]');exam.checked=true;exam.dispatchEvent(new w.Event('change'));
 assert.equal(doc.querySelector('[data-default-label="6"]').textContent,'Thi thử');assert.equal(doc.querySelector('[data-access-grade="6"][data-tab="exam"]').checked,false,'choosing a default does not grant access');
 assert.equal(doc.querySelector('[data-access-grade="6"][data-tab="class"]').disabled,true);
 await doc.querySelector('#saveDefaultTabs').onclick();assert.equal(posts.length,1);assert.equal(posts[0].url,'/api/teacher/default-tabs');assert.equal(posts[0].body.tabs[6],'exam');assert.equal(posts[0].body.grades,undefined);
 const live=doc.querySelector('[data-access-grade="6"][data-tab="live"]');live.checked=true;live.dispatchEvent(new w.Event('change'));
 await doc.querySelector('#saveGradeTabs').onclick();assert.equal(posts.length,2);assert.equal(posts[1].url,'/api/teacher/student-tab-access/grades');assert.equal(Object.keys(posts[1].body.grades).length,10);
 assert.deepEqual(posts[1].body.grades[6],{...locked,live:true});assert.equal(posts[1].body.tabs,undefined,'permission save must leave default-page preferences untouched');
 await doc.querySelector('[data-teacher-space="overview"]').onclick();await doc.querySelector('[data-teacher-space="settings"]').onclick();assert.equal(doc.querySelectorAll('#defaultTabSettings').length,1);
 picker.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(picker.open,false);
});

test('failed or legacy permission data disables grade access saves while defaults remain usable',async t=>{
 let mode='legacy';const {doc}=fixture(t,async url=>url.endsWith('/grades')?(mode==='legacy'?response({success:true,classes:[]}):{status:401,ok:false,json:async()=>({})}):response(defaults()));
 await settle();assert.equal(doc.querySelector('#saveGradeTabs').disabled,true);assert.equal(doc.querySelector('#saveDefaultTabs').disabled,false);assert.match(doc.querySelector('#defaultTabStatus').textContent,/phiên bản/);
 mode='expired';await doc.querySelector('#reloadGradeTabs').onclick();assert.match(doc.querySelector('#defaultTabStatus').textContent,/hết hạn/);assert.equal(doc.querySelector('#saveGradeTabs').disabled,true);
 assert.equal(doc.querySelector('[data-access-grade="6"][data-tab="review"]').checked,false);
});
