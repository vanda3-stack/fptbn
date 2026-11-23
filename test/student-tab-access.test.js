'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const {createController,mountRoutes}=require('../lib/student-tab-access');

function setup(){let instant=new Date('2026-11-23T10:00:00+07:00');const events=[];const controller=createController({now:()=>instant,notify:(code,access)=>events.push({code,access})});return{controller,events,time:v=>{instant=new Date(v);}};}
const locked={review:false,live:false,exam:false,print:false};

test('classes start with only the classroom open; permissions are scoped and survive teacher reconnect',()=>{
 const h=setup(),c=h.controller;c.open('9A3',7);c.open('9A2',8);
 assert.deepEqual(c.view('9A3').tabs,{class:true,...locked});
 assert.throws(()=>c.assert({class_code:'9A3'},'/packs'),{status:403});
 c.save('9A3',7,{...locked,review:true});c.open('9A3',7);
 assert.equal(c.view('9A3').tabs.review,true);assert.equal(c.view('9A2').tabs.review,false);
 assert.equal(c.list(7).length,1);assert.equal(c.list(7)[0].class_code,'9A3');
 assert.throws(()=>c.save('9A3',8,locked),{status:403});
 for(const tabs of [null,{}, {...locked,review:'true'},{...locked,class:false},{...locked,unknown:true}])assert.throws(()=>c.save('9A3',7,tabs),{status:400});
 c.open('9A3',9);assert.equal(c.view('9A3').tabs.review,false,'new teacher receives locked defaults');
 c.close('9A3');assert.equal(c.view('9A3').controlled,false);assert.equal(h.events.at(-1).access.tabs.review,true);
});

test('off-hours and weekends preserve home revision, then school-hour permissions resume',()=>{
 const h=setup(),c=h.controller;c.open('9A3',7);
 for(const date of ['2026-11-23T07:59:59+07:00','2026-11-23T17:00:00+07:00','2026-11-28T10:00:00+07:00','2026-11-29T10:00:00+07:00']){h.time(date);for(const path of ['/packs','/live/student','/exams','/documents'])assert.doesNotThrow(()=>c.assert({class_code:'9A3'},path));}
 h.time('2026-11-23T16:59:59+07:00');assert.throws(()=>c.assert({class_code:'9A3'},'/packs'),{status:403});
 c.save('9A3',7,{...locked,exam:true});assert.doesNotThrow(()=>c.assert({class_code:'9A3'},'/exams/attempts/1?view=result'));assert.throws(()=>c.assert({class_code:'9A3'},'/documents'),{status:403});
});

test('real HTTP routes reject direct student API access and restrict grants to the authenticated teaching owner',async t=>{
 const h=setup(),c=h.controller;c.open('9A3',7,10);c.open('9A2',8,20);
 let teaching=true;const tokens=new Map([['teacher',{teacherId:7,createdAt:Date.now()}]]);
 const db={query:async(sql,args=[])=>{
  if(sql.startsWith('SELECT id FROM teachers'))return [[{id:7}]];
  if(sql.startsWith('SELECT c.id,c.class_code,c.grade_level')){const rows=[{id:10,class_code:'9A3',grade_level:9},{id:20,class_code:'9A2',grade_level:9},{id:30,class_code:'6A1',grade_level:6}];return [Array.isArray(args[0])?rows.filter(row=>args[0].includes(row.class_code)):args.length?rows.filter(row=>row.class_code===args[0]):rows];}
  if(sql.startsWith('SELECT s.id,s.student_code'))return [[{id:1,student_code:'FBN12345',class_code:'9A3',class_id:10,school_year_id:2}]];
  return [[]];
 }};
 const app=express();app.use(express.json());
 mountRoutes(app,{db,teacherTokens:tokens,controller:c,isTeaching:(code,id)=>teaching&&['9A3','6A1'].includes(code)&&id===7});
 const mounted=require('../lib/ot')(app,{db,teacherTokens:tokens,assertStudentTabAccess:(s,p)=>c.assert(s,p)});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{mounted.close();await new Promise(resolve=>server.close(resolve));});
 const base='http://127.0.0.1:'+server.address().port;
 const request=async(path,token='',body,method=body?'PUT':'GET')=>{const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json()};};
 const login=await fetch(base+'/api/ot/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({student_code:'FBN12345'})});const student=(await login.json()).token;
 for(const path of ['/packs','/packs/id','/documents','/live/student','/exams','/exams/attempts/id'])assert.equal((await request('/api/ot'+path,student)).status,403,path);
 assert.equal((await request('/api/teacher/student-tab-access',student)).status,401);
 const listed=(await request('/api/teacher/student-tab-access','teacher')).data.classes;
 assert.equal(listed.length,3,'list includes current-year classes without an open session');
 assert.equal(listed.find(row=>row.class_code==='9A2').can_edit,false);
 assert.equal(listed.find(row=>row.class_code==='6A1').can_edit,true);
 const staged=await request('/api/teacher/student-tab-access/6A1','teacher',{tabs:{...locked,review:true}});
 assert.equal(staged.status,200);assert.equal(staged.data.applied,false);
 c.open('6A1',7,30);assert.equal(c.view('6A1').tabs.review,true);
 assert.equal((await request('/api/teacher/student-tab-access/UNKNOWN','teacher',{tabs:locked})).status,404);
 assert.equal((await request('/api/teacher/student-tab-access/9A2','teacher',{tabs:locked})).status,403);
 assert.equal((await request('/api/teacher/student-tab-access/9A3','teacher',{tabs:{...locked,exam:true,print:true,review:true}})).status,200);
 assert.equal((await request('/api/ot/documents',student)).status,200);
 assert.equal((await request('/api/ot/packs',student)).status,200);
 assert.equal((await request('/api/ot/live/student',student)).status,403);
 assert.equal((await request('/api/ot/exams',student)).status,200,'mounted /exams middleware must retain the full route for permission checks');
 const batch=(body,token='teacher')=>request('/api/teacher/student-tab-access/batch',token,body,'POST');
 assert.equal((await batch({class_codes:['9A3'],changes:{live:true}},student)).status,401);
 assert.equal((await batch({class_codes:[],changes:{live:true}})).status,400);
 assert.equal((await batch({class_codes:['9a3','9A3'],changes:{live:true}})).status,400);
 assert.equal((await batch({class_codes:['9A3'],changes:{class:false}})).status,400);
 const applied=await batch({class_codes:['9A3','6A1'],changes:{live:true}});
 assert.equal(applied.status,200);assert.equal(applied.data.classes.length,2);assert.equal(applied.data.applied_count,2);
 assert.equal(c.view('9A3').tabs.review,true);assert.equal(c.view('6A1').tabs.exam,false,'unchanged per-class differences are preserved');
 assert.equal((await batch({class_codes:['9A3','9A2'],changes:{live:false}})).status,403);assert.equal(c.view('9A3').tabs.live,true,'reject the whole batch when one class is unauthorized');
 assert.equal((await batch({class_codes:['9A3','UNKNOWN'],changes:{live:false}})).status,409);assert.equal(c.view('9A3').tabs.live,true);
 teaching=false;assert.equal((await request('/api/teacher/student-tab-access/9A3','teacher',{tabs:locked})).status,403);assert.equal(c.view('9A3').tabs.review,true);
 c.save('9A3',7,locked);assert.equal((await request('/api/ot/packs',student)).status,403);
});
