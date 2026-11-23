'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const script=file=>fs.readFileSync('public/ot/'+file,'utf8');

test('default-page settings contain the compact tab controls without a separate permissions navigation item',async t=>{
 const dom=new JSDOM('<!doctype html><body><header><span class="wordmark"><span class="product-name"><small>Giáo viên</small></span></span></header><main id="app"><section class="teacher-dashboard"><div class="dashboard-heading"><h1>Quản lý</h1><div class="dashboard-actions"><button id="create">Tạo</button></div></div><div class="dashboard-filter"></div><div class="pack-grid"></div></section></main></body>',{url:'https://fptbnmonitor.online/giaovien',runScripts:'outside-only'});
 t.after(()=>dom.window.close());const {window}=dom,doc=window.document;
 window.sessionStorage.setItem('ot-teacher-token','teacher');window.sessionStorage.setItem('ot-teacher-name','GV kiểm thử');
 window.alert=message=>{throw Error(message);};
 window.fetch=async url=>({status:200,ok:true,headers:{get:()=> 'application/json'},json:async()=>url==='/api/teacher/default-tabs'?{success:true,tabs:Object.fromEntries([3,4,5,6,7,8,9,10,11,12].map(g=>[g,'class']))}:{success:true,selection_mode:'multiple',classes:[{class_code:'6A5',grade_level:6,state:'teaching',can_edit:true,permissions:{class:true,review:false,live:false,exam:false,print:false}}]}});
 window.eval(script('default-tabs-settings.js'));window.eval(script('teacher-tab-access-multi.js'));window.eval(script('teacher-workspaces.js'));
 await new Promise(setImmediate);
 const settings=doc.querySelector('[data-teacher-space="settings"]');assert.ok(settings);
 assert.equal(doc.querySelector('[data-teacher-space="permissions"]'),null);
 assert.equal(doc.querySelector('[data-shortcut="permissions"]'),null);
 await settings.onclick();
 assert.equal(doc.getElementById('app').dataset.workspace,'settings');
 assert.equal(doc.querySelectorAll('#defaultTabSettings #studentTabPermissions').length,1);
 assert.equal(doc.getElementById('defaultLandingPreferences').open,false,'grade defaults collapse to keep the page compact');
 assert.equal(doc.querySelectorAll('#defaultLandingPreferences select').length,10);
 assert.equal(doc.getElementById('studentTabPermissionsMount').contains(doc.getElementById('studentTabPermissions')),true);
 const pick=doc.querySelector('input[data-class-code="6A5"]');pick.checked=true;pick.dispatchEvent(new window.Event('change'));
 assert.equal(doc.querySelector('#permissionFields').disabled,false);
 assert.equal(doc.querySelector('[data-permission="exam"]').checked,false);
 await doc.querySelector('[data-teacher-space="overview"]').onclick();await settings.onclick();
 assert.equal(doc.querySelectorAll('#studentTabPermissions').length,1,'switching pages must not duplicate the tab controls');
});
