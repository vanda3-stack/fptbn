'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync('public/ot/teacher-tab-access-multi.js','utf8');
const locked={class:true,review:false,live:false,exam:false,print:false};
function setup(t){
 const dom=new JSDOM('<!doctype html><body><main id="app"><div class="dashboard-heading"><h1>Trang mặc định</h1></div><section id="defaultTabSettings"><div id="studentTabPermissionsMount"></div></section></main></body>',{url:'https://fptbnmonitor.online/giaovien',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const {window}=dom;window.sessionStorage.setItem('ot-teacher-token','fixture-teacher');
 const records=[{class_code:'6A1',grade_level:6,state:'ready',can_edit:true,permissions:{...locked}},{class_code:'6A2',grade_level:6,state:'teaching',can_edit:true,permissions:{...locked,review:true,exam:true}},{class_code:'9A5',grade_level:9,state:'other_teacher',can_edit:false,permissions:{...locked,review:true}}];
 const calls=[];let mode='ok';
 window.fetch=async(url,options)=>{
  calls.push({url,options});
  if(mode==='html')return{status:502,ok:false,json:async()=>{throw SyntaxError('HTML proxy response');}};
  if(mode==='expired')return{status:401,ok:false,json:async()=>{throw SyntaxError('HTML auth response');}};
  if(options.method==='POST'){
   const body=JSON.parse(options.body),classes=records.filter(row=>body.class_codes.includes(row.class_code)).map(row=>({...row,permissions:{...row.permissions,...body.changes}}));
   return{status:200,ok:true,json:async()=>({success:true,classes,applied_count:1,staged_count:1})};
  }
  return{status:200,ok:true,json:async()=>({success:true,selection_mode:mode==='legacy'?undefined:'multiple',classes:structuredClone(records)})};
 };
 window.eval(source);
 const q=selector=>window.document.querySelector(selector);
 const pick=code=>{const input=q('input[data-class-code="'+code+'"]');input.checked=true;input.dispatchEvent(new window.Event('change',{bubbles:true}));};
 return{window,q,pick,calls,load:()=>window.FPTBNTabPermissions.load(),mode:value=>{mode=value;}};
}

test('actual DOM renders class checkboxes and saves the full checked/unchecked tab mask',async t=>{
 const h=setup(t);await h.load();
 assert.equal(h.window.document.querySelectorAll('#permissionClassList input[type="checkbox"]').length,3);
 assert.equal(h.q('#studentTabPermissions select'),null,'the class dropdown has been replaced');
 assert.equal(h.q('input[data-class-code="9A5"]').disabled,true);
 h.pick('6A1');h.pick('6A2');
 assert.match(h.q('#permissionSelectedCount').textContent,/2 \/ 2/);
 assert.equal(h.q('[data-permission="review"]').indeterminate,false);
 assert.equal(h.q('[data-permission="review"]').checked,false,'mixed class rights start unchecked so the teacher sees the mask that will be saved');
 assert.equal(h.q('[data-permission="exam"]').checked,false);
 assert.equal(h.q('#permissionSave').disabled,false,'an all-unchecked mask may be explicitly saved to lock the tabs');
 const live=h.q('[data-permission="live"]');live.checked=true;live.dispatchEvent(new h.window.Event('change'));
 assert.equal(h.q('#permissionSave').disabled,false);
 await h.q('form').onsubmit({preventDefault(){}});
 const post=h.calls.find(call=>call.options.method==='POST');
 assert.equal(post.url,'/api/teacher/student-tab-access/batch');
 assert.deepEqual(JSON.parse(post.options.body),{class_codes:['6A1','6A2'],changes:{review:false,live:true,exam:false,print:false}});
 assert.match(h.q('#permissionNotice').textContent,/Đã lưu quyền cho 2 lớp/);
 assert.equal(h.q('[data-permission="review"]').checked,false,'unchecked tabs are locked on every selected class');
 assert.equal(h.q('#permissionSave').disabled,true);
});

test('search and select-visible respect disabled classes and the clear selection button',async t=>{
 const h=setup(t);await h.load();h.q('#permissionClassSearch').value='6a';h.q('#permissionClassSearch').dispatchEvent(new h.window.Event('input'));
 assert.equal(h.q('.permission-class-item[data-class-code="9A5"]').hidden,true);
 h.q('#permissionSelectAll').click();assert.match(h.q('#permissionSelectedCount').textContent,/2 \/ 2/);
 h.q('#permissionClear').click();assert.match(h.q('#permissionSelectedCount').textContent,/0 \/ 2/);assert.equal(h.q('#permissionFields').disabled,true);
 h.q('#permissionClassSearch').value='6A1';h.q('#permissionClassSearch').dispatchEvent(new h.window.Event('input'));h.q('#permissionSelectAll').click();
 assert.equal(h.q('input[data-class-code="6A1"]').checked,true);assert.equal(h.q('input[data-class-code="6A2"]').checked,false);
 h.q('#permissionClassSearch').value='NO-MATCH';h.q('#permissionClassSearch').dispatchEvent(new h.window.Event('input'));assert.equal(h.q('#permissionClassNoMatch').hidden,false);
});

test('HTML failures, expired sessions and legacy data cannot leave stale rights or an enabled save button',async t=>{
 for(const failure of ['html','expired','legacy']){
  const h=setup(t);await h.load();h.pick('6A2');h.q('#permissionOpenAll').click();assert.equal(h.q('#permissionSave').disabled,false);
  h.mode(failure);await h.load();
  assert.equal(h.window.document.querySelectorAll('#permissionClassList input').length,0);
  assert.equal(h.q('#permissionFields').disabled,true);assert.equal(h.q('#permissionSave').disabled,true);
  assert.equal(h.q('[data-permission="review"]').checked,false,'clear stale granted state');
  const before=h.calls.filter(call=>call.options.method==='POST').length;await h.q('form').onsubmit({preventDefault(){}});assert.equal(h.calls.filter(call=>call.options.method==='POST').length,before);
  assert.match(h.q('#permissionNotice').textContent,failure==='expired'?/đăng xuất/:failure==='legacy'?/phiên bản/:/tải lại trang/);
  assert.equal(h.q('#tabAccessReload').disabled,false);
 }
});

test('teacher entry document uses grade settings and no longer loads the class checkbox component',()=>{
 const html=fs.readFileSync('public/GV.html','utf8');
 assert.doesNotMatch(html,/teacher-tab-access-multi\.js/);
 assert.match(html,/default-tabs-settings\.js\?v=20261123-grade-tabs/);
 assert.doesNotMatch(html,/src="\/ot\/teacher-tab-access\.js/);
});

test('a non-JSON save failure never reports success or silently replays the write',async t=>{
 const h=setup(t);await h.load();h.pick('6A1');h.q('#permissionOpenAll').click();h.mode('html');
 await h.q('form').onsubmit({preventDefault(){}});
 assert.equal(h.calls.filter(call=>call.options.method==='POST').length,1);
 assert.match(h.q('#permissionNotice').textContent,/Chưa xác nhận/);
 assert.doesNotMatch(h.q('#permissionNotice').textContent,/Đã lưu/);
 assert.equal(h.q('input[data-class-code="6A1"]').checked,true);
 assert.equal(h.q('[data-permission="exam"]').checked,true,'keep the teacher’s unsaved choices visible');
});
