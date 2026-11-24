'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const adminAuth=require('../lib/admin-auth'),{createPolicy}=require('../lib/classroom-access'),{createController,mountRoutes}=require('../lib/student-tab-access');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const levels=[3,4,5,6,7,8,9,10,11,12],mask={class:false,review:true,live:false,exam:false,print:false};

test('admin owns landing pages and all five grade rights; teacher and anonymous callers cannot use legacy writes',async t=>{
 let active=true;const defaults=new Map(),adminTokens=new Map([['admin',{adminId:1,createdAt:Date.now()}],['expired',{adminId:1,createdAt:Date.now()-8*3600000}]]),teacherTokens=new Map([['teacher',{teacherId:7,createdAt:Date.now()}]]);
 const db={query:async(sql,args=[])=>{
  if(sql.startsWith('SELECT id FROM admins'))return [active?[{id:1}]:[]];if(sql.startsWith('SELECT id FROM teachers'))return [[{id:7}]];
  if(sql.startsWith('SELECT c.id'))return [[{id:10,class_code:'6A1',grade_level:6}]];
  if(sql.startsWith('SELECT grade_level'))return [Array.from(defaults,([grade_level,tab_key])=>({grade_level,tab_key}))];
  if(sql.startsWith('SELECT tab_key'))return [[{tab_key:defaults.get(args[0])||'class'}]];
  if(sql.startsWith('INSERT INTO student_default_tabs'))for(const [grade,tab] of args[0])defaults.set(grade,tab);return [[]];
 }};
 const app=express();app.use(express.json());const admin=adminAuth({db,adminTokens});
 app.use('/api/admin',admin);app.get('/api/admin/legacy-data',(req,res)=>res.json({success:true}));
 require('../lib/student-default-tabs')(app,{db,teacherTokens,adminTokens});const c=createController({now:()=>new Date('2026-11-29T10:00:00+07:00')});mountRoutes(app,{db,teacherTokens,adminTokens,controller:c,isTeaching:()=>true});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;
 const request=async(url,token='',body,method=body?'POST':'GET')=>{const r=await fetch(base+url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json()};};
 for(const token of ['','teacher','expired'])for(const url of ['/api/admin/legacy-data','/api/admin/default-tabs','/api/admin/student-tab-access/grades'])assert.equal((await request(url,token)).status,401);
 const tabs=Object.fromEntries(levels.map(g=>[g,'exam'])),grades=Object.fromEntries(levels.map(g=>[g,{...mask}]));
 for(const [url,body,method] of [['/api/teacher/default-tabs',{tabs},'POST'],['/api/teacher/student-tab-access/grades',{grades},'POST'],['/api/teacher/student-tab-access/batch',{class_codes:['6A1'],changes:{review:true}},'POST'],['/api/teacher/student-tab-access/6A1',{tabs:{review:true,live:false,exam:false,print:false}},'PUT']])assert.equal((await request(url,'teacher',body,method)).status,403,url);
 assert.equal((await request('/api/admin/default-tabs','admin',{tabs})).status,200);assert.equal((await request('/api/student/default-tab?grade=6')).data.tab,'exam');
 assert.equal((await request('/api/admin/student-tab-access/grades','admin',{grades})).status,200);
 assert.deepEqual((await request('/api/admin/student-tab-access/grades','admin')).data.grades[6],mask);assert.equal(c.view('6A1',6).tabs.class,true,'outside hours the effective policy remains free');
 assert.equal((await request('/api/admin/default-tabs','admin')).data.tabs[6],'exam','saving permissions preserves default-page choices');
 active=false;assert.equal((await request('/api/admin/default-tabs','admin',{tabs})).status,403);
});

test('revision period persists, bypasses both the entry schedule and tab masks, then restores saved restrictions',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fptbn-review-mode-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const instant=new Date('2026-11-24T10:00:00+07:00');let events=0;
 const options={file:path.join(root,'access.json'),isTeacherOnline:()=>false,now:()=>instant,onChange:()=>c.refresh()};
 const policy=createPolicy(options),c=createController({file:path.join(root,'tabs.json'),now:()=>instant,bypass:()=>policy.settings().revisionMode,notify:()=>events++});
 const grades=Object.fromEntries(levels.map(g=>[g,{class:false,review:false,live:false,exam:false,print:false}]));c.configureGrades(grades,[{class_code:'6A1',grade_level:6}]);
 assert.equal(policy.check('6A1').allowed,false);assert.equal(c.view('6A1').tabs.review,false);
 policy.save({revisionMode:true});assert.equal(policy.check('6A1').allowed,true);assert.equal(Object.values(c.view('6A1').tabs).every(Boolean),true);assert.equal(createPolicy(options).settings().revisionMode,true);assert.ok(events>=2);
 policy.save({revisionMode:false});assert.equal(policy.settings().enabled,true);assert.equal(policy.check('6A1').allowed,false);assert.deepEqual(c.view('6A1').tabs,grades[6]);
 fs.mkdirSync(options.file+'.tmp');assert.throws(()=>policy.save({revisionMode:true}));assert.equal(policy.settings().revisionMode,false);assert.equal(c.view('6A1').tabs.exam,false);
});
