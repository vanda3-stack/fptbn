'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(){
 const locked={class:true,review:false,live:false,exam:false,print:false};
 const records=[{class_code:'6A1',state:'ready',can_edit:true,permissions:{...locked}},{class_code:'6A5',state:'teaching',can_edit:true,controlled:true,permissions:{...locked,review:true}},{class_code:'7A2',state:'other_teacher',can_edit:false,permissions:{...locked}}];
 const nodes={},calls=[];let mounted,failed=false;
 const node=selector=>nodes[selector]||={value:'',checked:false,disabled:true,textContent:'',options:[],replaceChildren(){this.options=[];this.value='';},append(option){this.options.push(option);if(!this.value)this.value=option.value;},querySelector:selector=>node(selector)};
 const panel={querySelector:node};
 const root={querySelector:selector=>selector==='.dashboard-heading'?{after:p=>{mounted=p;}}:selector==='#studentTabPermissions'?mounted:null};
 const context={window:{},sessionStorage:{getItem:()=> 'teacher'},document:{getElementById:()=>root,createElement:tag=>tag==='section'?panel:{}},fetch:async(url,options)=>{
  calls.push({url,options});if(failed)return{ok:false,json:async()=>({success:false,message:'Chưa tải được lớp'})};
  if(options.method==='PUT'){const code=decodeURIComponent(url.split('/').at(-1));return{ok:true,json:async()=>({success:true,applied:false,class:{...records.find(row=>row.class_code===code),permissions:JSON.parse(options.body).tabs}})};}
  return{ok:true,json:async()=>({success:true,classes:structuredClone(records)})};
 }};
 vm.runInNewContext(fs.readFileSync('public/ot/teacher-tab-access.js','utf8'),context);
 return{api:context.window.FPTBNTabPermissions,node,calls,fail:()=>{failed=true;}};
}

test('teacher sees several classes, can stage a chosen class and cannot edit another teaching owner',async()=>{
 const h=harness();await h.api.load();const select=h.node('select');
 assert.equal(select.options.length,3);assert.equal(select.value,'6A5');
 select.value='7A2';select.onchange();assert.equal(h.node('fieldset').disabled,true);
 const before=h.calls.length;await h.node('form').onsubmit({preventDefault(){}});assert.equal(h.calls.length,before);
 select.value='6A1';select.onchange();assert.equal(h.node('fieldset').disabled,false);
 h.node('[data-permission="exam"]').checked=true;
 await h.node('form').onsubmit({preventDefault(){}});
 assert.equal(h.calls.at(-1).url,'/api/teacher/student-tab-access/6A1');assert.equal(JSON.parse(h.calls.at(-1).options.body).tabs.exam,true);
 assert.match(h.node('#permissionNotice').textContent,/áp dụng khi/);
 select.value='7A2';select.onchange();assert.equal(h.node('fieldset').disabled,true);
 h.fail();await h.api.load();assert.equal(h.node('fieldset').disabled,true);assert.equal(select.disabled,true);
});
