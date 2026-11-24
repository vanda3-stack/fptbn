'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync('public/admin/index.html','utf8'),script=file=>fs.readFileSync('public/admin/'+file,'utf8'),settle=()=>new Promise(setImmediate);
const grades=Object.fromEntries([3,4,5,6,7,8,9,10,11,12].map(g=>[g,{class:false,review:true,live:false,exam:false,print:false}]));
function fixture(t){const dom=new JSDOM(html,{url:'https://fptbnmonitor.online/admin/',runScripts:'outside-only'});t.after(()=>dom.window.close());dom.window.Headers=Headers;return{w:dom.window,doc:dom.window.document};}
function report(){return{success:true,filters:{from:'2026-11-23',to:'2026-11-24',year:2,grade:null},year:{id:2,name:'2026-2027'},years:[{id:2,name:'2026-2027'}],generated_at:'2026-11-24T03:00:00Z',tracking_since:'2026-11-23T03:00:00Z',warnings:['Chưa có nguồn dữ liệu thử nghiệm'],metrics:{active_students:3,learning_students:2,eligible_students:6,cohort_participants:2,participation_percent:33.33,practice_attempts:null,exam_started:3,exam_submitted:2,exam_submission_percent:66.67,quiz_accuracy_percent:null,live_answers:8,active_teachers:1,teacher_logins:2,packs_created:2,content_teachers:1,student_logins:4},accounts:{enabled_teachers:2,teachers:3,active_classes:1},daily:[{date:'2026-11-23',active_students:0,practice_attempts:null,exam_started:0,live_answers:0},{date:'2026-11-24',active_students:3,practice_attempts:null,exam_started:3,live_answers:8}],classes:[{class_code:'<img src=x onerror=alert(1)>',is_active:true,enrolled_students:6,active_students:3,practice_attempts:null,exam_started:3,exam_submitted:2,live_answers:8}],runtime:{online_students:2,online_teachers:1,open_classes:1,socket_connections:5,database_ms:1,uptime_seconds:60,rss_mb:100,heap_mb:20,sampled_at:'2026-11-24T03:00:00Z',http:{requests:10,server_errors:1,client_errors:1}},definitions:['Mỗi HS đếm một lần; không phải lượt xem trang.']};}

test('full admin document boots legacy data screens with bearer auth and mounts moved settings only in admin',async t=>{
 const {w,doc}=fixture(t),calls=[],errors=[];w.console.error=(...args)=>errors.push(args);w.sessionStorage.setItem('fptbnAdminToken','fixture-admin');w.sessionStorage.setItem('fptbnAdmin',JSON.stringify({id:1,full_name:'Admin kiểm thử'}));
 w.fetch=async(url,options={})=>{calls.push({url,options});return{status:200,ok:true,headers:{get:()=> 'application/json'},json:async()=>url.includes('student-tab-access')?{success:true,scope:'grade',grades}:url.includes('default-tabs')?{success:true,tabs:Object.fromEntries(Object.keys(grades).map(g=>[g,'review']))}:url.includes('classroom-access')?{success:true,settings:{enabled:true,revisionMode:false}}:url.includes('/analytics/health')?{success:true,runtime:{database_ms:1}}:{success:true,students:[],teachers:[],classes:[],school_years:[{id:2,name:'2026-2027',is_current:1}]}};};
 w.eval(script('admin-api.js'));
 for(const el of doc.querySelectorAll('script:not([src])'))w.eval(el.textContent);
 w.eval(script('portal-settings.js'));w.eval(script('admin-shell.js'));w.eval(fs.readFileSync('public/js/classroom-access-admin.js','utf8'));
 await settle();
 assert.equal(doc.getElementById('adminApp').style.display,'block');assert.equal(doc.getElementById('loginPage').style.display,'none');
 assert.ok(calls.some(c=>c.url==='/api/admin/students'));assert.ok(calls.filter(c=>c.url.startsWith('/api/admin/')).every(c=>c.options.headers.get('Authorization')==='Bearer fixture-admin'));
 doc.querySelector('[data-page="portal"]').click();await settle();assert.equal(doc.querySelector('#page-portal').classList.contains('active'),true);assert.equal(doc.querySelectorAll('.grade-tab-picker').length,10);
 assert.equal(doc.querySelector('[data-access-grade="6"][data-tab="class"]').disabled,false);assert.equal(doc.querySelector('[data-access-grade="6"][data-tab="class"]').checked,false);
 doc.querySelector('[data-page="settings"]').click();await settle();assert.equal(doc.querySelector('#revisionPeriodEnabled').disabled,false);
 assert.equal(doc.querySelector('#adminDatabaseStatus').textContent,'Kết nối · 1 ms');
 w.logout();await settle();assert.equal(w.sessionStorage.getItem('fptbnAdminToken'),null);assert.equal(doc.getElementById('adminDefaultTabsMount').children.length,0);assert.equal(doc.getElementById('loginPage').style.display,'flex');
 assert.ok(calls.some(c=>c.url==='/api/admin/logout'));assert.deepEqual(errors,[]);
});

test('API bridge keeps multipart options, never sends admin token cross-origin and ignores stale 401 responses from an older login',async t=>{
 const {w}=fixture(t);let release;const calls=[];let loggedOut=0;w.logout=()=>loggedOut++;
 w.fetch=async(url,options)=>{calls.push({url,options});if(url.includes('slow'))return new Promise(resolve=>{release=resolve;});return{status:200};};w.sessionStorage.setItem('fptbnAdminToken','old');w.eval(script('admin-api.js'));
 await w.fetch('/api/admin/students/import',{method:'POST',body:'multipart-fixture'});assert.equal(calls[0].options.body,'multipart-fixture');assert.equal(calls[0].options.headers.has('Content-Type'),false);assert.equal(calls[0].options.headers.get('Authorization'),'Bearer old');
 await w.fetch('https://other.example/api/admin/data');assert.equal(calls[1].options.headers,undefined);
 const pending=w.fetch('/api/admin/slow');w.sessionStorage.setItem('fptbnAdminToken','new');release({status:401});await pending;assert.equal(loggedOut,0);
});

test('analytics renders aggregates safely, invalidates exports after filter edits and clears stale results on failure/logout',async t=>{
 const {w,doc}=fixture(t);let failed=false,downloaded=0;const calls=[];w.sessionStorage.setItem('fptbnAdminToken','admin');w.URL.createObjectURL=()=> 'blob:fixture';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>downloaded++;
 w.fetch=async url=>{calls.push(url);if(url.includes('export.csv'))return{ok:true,blob:async()=>new w.Blob(['csv'])};return{ok:!failed,json:async()=>failed?{success:false,message:'Lỗi dữ liệu kiểm thử'}:report()};};
 w.eval(script('analytics.js'));doc.querySelector('[data-page="analytics"]').click();await settle();
 assert.equal(doc.getElementById('analyticsReport').hidden,false);assert.ok(doc.querySelector('.activity-chart'));assert.equal(doc.querySelector('#analyticsReport img'),null,'class names are rendered as text');assert.match(doc.getElementById('analyticsReport').textContent,/33,33/);assert.match(doc.getElementById('analyticsReport').textContent,/—/);
 assert.equal(doc.getElementById('analyticsExport').disabled,false);doc.getElementById('analyticsExport').click();await settle();assert.equal(downloaded,1);assert.ok(calls.some(url=>url.includes('export.csv')&&url.includes('year=2')));
 doc.getElementById('analyticsGrade').value='6';doc.getElementById('analyticsGrade').dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(doc.getElementById('analyticsExport').disabled,true);
 failed=true;doc.getElementById('analyticsFilters').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();assert.equal(doc.getElementById('analyticsReport').hidden,true);assert.equal(doc.getElementById('analyticsExport').disabled,true);assert.match(doc.getElementById('analyticsStatus').textContent,/Lỗi dữ liệu/);
 w.dispatchEvent(new w.Event('fptbn-admin-logout'));assert.equal(doc.getElementById('analyticsReport').children.length,0);
});
