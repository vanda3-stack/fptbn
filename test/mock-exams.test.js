const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mount = require('../lib/mock-exams');

async function setup(t) {
 const exams = [], attempts = [], events = [];
 const pack = {id:'pack', teacher_id:1, year_id:1, classes_json:'[1]', content_json:JSON.stringify({questions:[{q:'Q1',o:['A','B'],a:0},{q:'Q2',o:['A','B'],a:1}]})};
 const db = {async query(sql, p=[]) {
  if(sql.startsWith('CREATE'))return [{}];
  if(sql.startsWith('INSERT INTO ot_exams')) {
   let e;
   if(sql.includes('SELECT')) {
    const old=exams.find(e=>e.id===p[1]&&e.teacher_id===p[2]&&e.is_open!==-1);
    if(!old)return [{affectedRows:0}];
    e={...old,id:p[0],is_open:1};
   }else e={id:p[0],pack_id:p[1],teacher_id:p[2],title:p[3],question_count:p[4],minutes:p[5],require_share:p[6],is_open:1};
   e.created_at=new Date().toISOString();exams.push(e);return [{affectedRows:1}];
  }
  if(sql.startsWith('UPDATE ot_exams')) {
   const e=exams.find(e=>e.id===p[0]&&e.teacher_id===p[1]&&e.is_open!==-1);
   if(e)e.is_open=sql.includes('=-1')?-1:0;
   return [{affectedRows:e?1:0}];
  }
  if(sql.startsWith('SELECT e.*'))return [exams.filter(e=>e.is_open===1).map(e=>({...e,year_id:1,classes_json:'[1]'}))];
  if(sql.startsWith('SELECT * FROM ot_exams'))return [exams.filter(e=>e.is_open!==-1 && (sql.includes('WHERE teacher_id')?e.teacher_id===p[0]:e.id===p[0]&&(!sql.includes('teacher_id')||e.teacher_id===p[1])))];
  if(sql.startsWith('SELECT * FROM ot_packs'))return [[pack]];
  if(sql.startsWith('INSERT IGNORE INTO ot_exam_attempts')) {
   if(!exams.some(e=>e.id===p[11]&&e.is_open===1))return [{affectedRows:0}];
   if(!attempts.some(a=>a.exam_id===p[1]&&a.student_id===p[2]))attempts.push(Object.fromEntries(['id','exam_id','student_id','student_code','full_name','class_code','snapshot_json','answers_json','started_at','deadline','last_seen'].map((k,i)=>[k,p[i]]).concat([['submitted_at',null],['score',null]])));
   return [{affectedRows:1}];
  }
  if(sql.startsWith('SELECT a.*'))return [attempts.filter(a=>a.id===p[0]&&a.student_id===p[1]).map(a=>({...a,...Object.fromEntries(['title','require_share','is_open'].map(k=>[k,exams.find(e=>e.id===a.exam_id)[k]]))}))];
  if(sql.startsWith('SELECT')&&sql.includes('FROM ot_exam_attempts')) {
   if(sql.includes('WHERE student_id'))return [attempts.filter(a=>a.student_id===p[0])];
   let rows=attempts.filter(a=>a.exam_id===p[0]);
   if(sql.includes('AND student_id'))rows=rows.filter(a=>a.student_id===p[1]);
   if(sql.includes('deadline<='))rows=rows.filter(a=>!a.submitted_at&&a.deadline<=p[1]);
   return [rows.map(a=>({...a}))];
  }
  if(sql.startsWith('UPDATE ot_exam_attempts SET answers')) {const a=attempts.find(a=>a.id===p[2]);a.answers_json=p[0];a.last_seen=p[1];return [{}]}
  if(sql.startsWith('UPDATE ot_exam_attempts SET submitted')) {const a=attempts.find(a=>a.id===p[2]);if(!a.submitted_at){a.submitted_at=p[0];a.score=p[1]}return [{}]}
  if(sql.startsWith('SELECT ev.*'))return [events.filter(ev=>attempts.some(a=>a.exam_id===p[0]&&a.id===ev.attempt_id))];
  throw Error('Unhandled SQL: '+sql);
 }};
 const app=express(),r=express.Router();app.use(express.json());
 const student=(req,res,next)=>{req.student={id:1,school_year_id:1,class_id:1,student_code:'FBN20310',full_name:'HS',class_code:'9A3'};next()};
 const teacher=(req,res,next)=>{req.teacherId=Number(req.headers['x-teacher']||1);next()};
 const bad=(message,status=400)=>Object.assign(Error(message),{status});
 const wrap=fn=>async(req,res,next)=>{try{await fn(req,res,next)}catch(e){res.status(e.status||500).json({success:false,message:e.message})}};
 mount({r,db,student,teacher,packFor:async()=>({...pack,content:JSON.parse(pack.content_json)}),wrap,bad});app.use(r);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const call=async(path,method='GET',body,teacher=1)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{'Content-Type':'application/json','x-teacher':String(teacher)},body:body?JSON.stringify(body):undefined});return {status:response.status,...await response.json()}};
 const create=async()=> (await call('/teacher/exams','POST',{pack_id:'pack',title:'Thi thử',count:2,minutes:30})).id;
 return {call,create,attempts,exams};
}

test('new rounds have fresh attempts and reports; reload resumes the same round',async t=>{
 const {call,create,attempts}=await setup(t),first=await create();
 const started=await call('/exams/'+first+'/start','POST',{});assert.equal(started.status,200);
 const id=started.attempt.id;
 assert.equal((await call('/exams/'+first+'/start','POST',{})).attempt.id,id);
 const snapshot=JSON.parse(attempts[0].snapshot_json);
 const submitted=await call('/exams/attempts/'+id,'POST',{answers:snapshot.map(q=>q.a),submit:true});
 assert.equal(submitted.attempt.score,2);
 await call('/teacher/exams/'+first,'PATCH',{open:false});
 const second=(await call('/teacher/exams/'+first,'PATCH',{open:true})).id;assert.notEqual(second,first);
 const list=await call('/exams');assert.deepEqual(list.exams.map(e=>e.id),[second]);assert.equal(list.exams[0].attempt,null);
 const next=await call('/exams/'+second+'/start','POST',{});assert.notEqual(next.attempt.id,id);assert.deepEqual(next.attempt.answers,[null,null]);
 assert.equal((await call('/teacher/exams/'+first+'/report')).rows[0].score,2);
 const report=await call('/teacher/exams/'+second+'/report');assert.equal(report.rows.length,1);assert.equal(report.rows[0].score,null);assert.deepEqual(report.events,[]);
});

test('deleted exams disappear and stale start, restore, save, submit and reopen requests fail',async t=>{
 const {call,create}=await setup(t),id=await create();
 const {attempt}=await call('/exams/'+id+'/start','POST',{});
 assert.equal((await call('/teacher/exams/'+id,'DELETE',undefined,2)).status,404);
 assert.equal((await call('/exams')).exams.length,1);
 assert.equal((await call('/teacher/exams/'+id,'DELETE')).status,200);
 assert.deepEqual((await call('/exams')).exams,[]);assert.deepEqual((await call('/teacher/exams')).exams,[]);
 assert.equal((await call('/exams/'+id+'/start','POST',{})).status,410);
 assert.equal((await call('/exams/attempts/'+attempt.id)).status,410);
 for(const submit of [false,true])assert.equal((await call('/exams/attempts/'+attempt.id,'POST',{answers:[0,0],submit})).status,410);
 assert.equal((await call('/teacher/exams/'+id,'PATCH',{open:true})).status,404);
 assert.equal((await call('/teacher/exams/'+id+'/report')).status,403);
});

function browser() {
 const vm=require('node:vm'),fs=require('node:fs'),listeners={},intervals=[],storage=new Map([['ot-student-token','token']]);
 const elements=new Map(),node=()=>({textContent:'',onclick:null});
 const host={innerHTML:'',getClientRects:()=>[{}],querySelector(s){if(!elements.has(s))elements.set(s,node());return elements.get(s)},querySelectorAll(s){return s==='[data-start]'&&this.innerHTML.includes('data-start=')?[button]:[]}};
 const button={dataset:{start:'exam'},disabled:false};let deleted=false;
 const exam={id:'exam',title:'Đề thi',created_at:new Date().toISOString(),question_count:1,minutes:30,attempt:null};
 const attempt={id:'attempt',title:'Đề thi',questions:[{q:'Q',o:['A','B']}],answers:[null],deadline:Date.now()+60000,server_now:Date.now(),submitted_at:null};
 const c={document:{hidden:false,getElementById:id=>id==='examPanel'?host:null,addEventListener(){}},window:{addEventListener:(name,fn)=>listeners[name]=fn},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:require('node:crypto'),confirm:()=>true,setInterval:(fn,ms)=>intervals.push({fn,ms}),fetch:async url=>({ok:!deleted||url.endsWith('/exams'),status:deleted&&!url.endsWith('/exams')?410:200,json:async()=>deleted&&!url.endsWith('/exams')?{success:false,message:'Đề thi đã được giáo viên xoá.'}:{success:true,...(url.endsWith('/exams')?{exams:deleted?[]:[exam]}:{attempt})}})};
 vm.runInNewContext(fs.readFileSync('public/portal/mock-exams.js','utf8'),c);
 return {host,button,listeners,storage,elements,remove:()=>{deleted=true},poll:()=>intervals.find(i=>i.ms===5000).fn()};
}

test('student list refresh removes deleted exams without reloading the page',async()=>{
 const b=browser();await b.listeners['mock-tab-show']();assert.match(b.host.innerHTML,/data-start=/);
 b.remove();await b.poll();assert.doesNotMatch(b.host.innerHTML,/data-start=/);assert.match(b.host.innerHTML,/Chưa có lượt thi/);
});

test('deleting an active exam clears the saved attempt and stops its interface',async()=>{
 const b=browser();await b.listeners['mock-tab-show']();await b.button.onclick();assert.equal(b.storage.get('mock-active'),'attempt');
 b.remove();await b.poll();assert.equal(b.storage.has('mock-active'),false);assert.doesNotMatch(b.host.innerHTML,/examSubmit/);assert.match(b.elements.get('[data-status]').textContent,/xoá/);
});
