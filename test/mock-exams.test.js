'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const mount=require('../lib/mock-exams');
const guard=require('../public/portal/exam-input-guard');
function fixture(query,pack={classes:[5]}){const routes={},calls=[];const conn={query:async(s,a)=>{calls.push([s,a]);return query(s,a)},beginTransaction:async()=>calls.push(['BEGIN']),commit:async()=>calls.push(['COMMIT']),rollback:async()=>calls.push(['ROLLBACK']),release:()=>{}};const db={query:conn.query,getConnection:async()=>conn};mount({r:{use(){},get:(p,h)=>routes['GET '+p]=h,post:(p,h)=>routes['POST '+p]=h,patch:(p,h)=>routes['PATCH '+p]=h,delete:(p,h)=>routes['DELETE '+p]=h},db,student(){},teacher(){},packFor:async()=>pack,wrap:f=>f,bad:(message,status)=>Object.assign(Error(message),{status})});return {routes,calls}}
const req={params:{id:'exam'},teacherId:7,student:{id:1,class_id:5,school_year_id:2,student_code:'FBN20310',full_name:'HS',class_code:'9A3'}};
const uuid='11111111-1111-4111-8111-111111111111';
test('Clipboard guard applies only to active essay zone and permits typing',()=>{const inZone={closest:()=>({})},outside={closest:()=>null};for(const type of ['copy','cut','paste','drop','dragover','dragstart','contextmenu']){assert.equal(guard.blocked({type,target:inZone},true),true);assert.equal(guard.blocked({type,target:inZone},false),false);assert.equal(guard.blocked({type,target:outside},true),false)}for(const e of [{type:'keydown',key:'v',metaKey:true},{type:'keydown',key:'Insert',shiftKey:true},{type:'beforeinput',inputType:'insertFromPaste'},{type:'beforeinput',inputType:'insertFromDrop'}])assert.equal(guard.blocked({...e,target:inZone},true),true);assert.equal(guard.blocked({type:'beforeinput',inputType:'insertText',target:inZone},true),false);assert.equal(guard.blocked({type:'keydown',key:'a',ctrlKey:true,target:inZone},true),false)});
test('No individual reset endpoint remains',()=>{const f=fixture(async()=>[[]]);assert.equal(f.routes['POST /teacher/exams/:id/reset'],undefined)});
test('Class grant is owner-scoped and idempotent on retry',async()=>{let grant=null;const f=fixture(async(s,a)=>{if(s.startsWith('SELECT * FROM ot_exams'))return [[{id:'exam',pack_id:'pack'}]];if(s.startsWith('SELECT * FROM ot_exam_class_grants'))return [grant?[grant]:[]];if(s.startsWith('INSERT INTO ot_exam_class_grants'))grant={id:a[0],exam_id:a[1],class_id:a[2],extra:a[3]};return [[]]});const r={...req,body:{id:uuid,class_id:5,extra:2}},res={json(){}};await f.routes['POST /teacher/exams/:id/grants'](r,res);await f.routes['POST /teacher/exams/:id/grants'](r,res);assert.equal(grant.extra,2);assert.equal(f.calls.filter(([s])=>s.startsWith('INSERT INTO ot_exam_class_grants')).length,1);assert(f.calls.some(([s])=>s.includes('teacher_id=? FOR UPDATE')))});
test('Reject granting to another class or without ownership',async()=>{for(const own of [true,false]){const f=fixture(async s=>s.startsWith('SELECT * FROM ot_exams')?[own?[{pack_id:'pack'}]:[]]:[[]]);await assert.rejects(()=>f.routes['POST /teacher/exams/:id/grants']({...req,body:{id:uuid,class_id:9,extra:2}},{json(){}}),e=>e.status===403);assert(f.calls.some(([s])=>s==='ROLLBACK'));assert(!f.calls.some(([s])=>s.startsWith('INSERT')))}});
function startFixture(extra,deleted=false){let current={id:'old',exam_id:'exam',student_id:1,submitted_at:1,snapshot_json:'[]',answers_json:'[]'},archive=[];const f=fixture(async(s,args)=>{if(s.startsWith('SELECT * FROM ot_exams WHERE id=? FOR UPDATE'))return [[{id:'exam',pack_id:'pack',teacher_id:7,question_count:1,minutes:30,is_open:1}]];if(s.startsWith('SELECT deleted_at FROM ot_pack_meta'))return [deleted?[{deleted_at:Date.now()}]:[]];if(s.startsWith('SELECT * FROM ot_packs'))return [[{year_id:2,classes_json:'[5]',content_json:JSON.stringify({questions:[{q:'Q',o:['a','b'],a:1}],essays:[{q:'Essay',ideas:['secret rubric']}]})}]];if(s.startsWith('SELECT * FROM ot_exam_attempts WHERE exam_id'))return [current?[current]:[]];if(s.startsWith('SELECT config_json'))return [[{config_json:JSON.stringify({base_attempts:1,essay_count:1,mcq_points:5})}]];if(s.startsWith('SELECT COUNT(*)'))return [[{n:archive.length}]];if(s.startsWith('SELECT COALESCE'))return [[{extra}]];if(s.startsWith('INSERT INTO ot_exam_archives'))archive.push(args);if(s.startsWith('DELETE FROM ot_exam_attempts'))current=null;if(s.startsWith('INSERT INTO ot_exam_attempts'))current={id:args[0],exam_id:args[1],student_id:args[2],snapshot_json:args[6],answers_json:args[7],deadline:args[9],submitted_at:null,score:null};if(s.startsWith('SELECT * FROM ot_exam_attempts WHERE id'))return [current?[current]:[]];if(s.startsWith('SELECT title,require_share'))return [[{title:'Exam',require_share:0}]];return [[]]});return {...f,archive}}
test('Class allowance permits new mixed exam, archives prior result, resumes active attempt',async()=>{const f=startFixture(1);let first,second;await f.routes['POST /exams/:id/start'](req,{json:d=>first=d.attempt});await f.routes['POST /exams/:id/start'](req,{json:d=>second=d.attempt});assert.equal(first.id,second.id);assert.equal(f.archive.length,1);assert.equal(first.questions.length,1);assert.equal(first.essays.length,1);assert.deepEqual(first.essay_answers,['']);assert.equal(first.questions[0].a,undefined);assert.equal(first.essays[0].ideas,undefined);assert(f.calls.findIndex(([s])=>s.startsWith('INSERT INTO ot_exam_archives'))<f.calls.findIndex(([s])=>s.startsWith('DELETE FROM ot_exam_attempts')))});
test('Exhausted allowance rejects start without replacing previous result',async()=>{const f=startFixture(0);await assert.rejects(()=>f.routes['POST /exams/:id/start'](req,{json(){}}),e=>e.status===409);assert.equal(f.archive.length,0);assert(!f.calls.some(([s])=>s.startsWith('DELETE')))});
test('Teacher grade rejects marks above essay maximum',async()=>{const a={id:'a',exam_id:'exam',student_id:1,submitted_at:1,snapshot_json:JSON.stringify({questions:[],essays:[{q:'E',ideas:['I']}],mcq_points:0}),answers_json:JSON.stringify({choices:[],essays:['text']})};const f=fixture(async s=>s.startsWith('SELECT * FROM ot_exams')?[[{id:'exam'}]]:s.startsWith('SELECT * FROM ot_exam_attempts WHERE id')?[[a]]:[[]]);await assert.rejects(()=>f.routes['POST /teacher/exams/:id/grade']({...req,body:{attempt_id:'a',marks:[11]}},{json(){}}),/Điểm tự luận/);assert(!f.calls.some(([s])=>s.startsWith('INSERT INTO ot_exam_grades')))});
test('Mixed submission persists essay text, scores MCQ on server and awaits essay grade',async()=>{const row={id:'a',exam_id:'exam',student_id:1,deadline:Date.now()+60000,submitted_at:null,score:null,snapshot_json:JSON.stringify({questions:[{q:'Q',o:['A','B'],a:1}],essays:[{q:'E',ideas:['hidden']}],mcq_points:5}),answers_json:JSON.stringify({choices:[null],essays:['']})};const f=fixture(async(s,args)=>{if(s.startsWith('SELECT * FROM ot_exam_attempts'))return [[row]];if(s.startsWith('SELECT is_open FROM ot_exams'))return [[{is_open:1}]];if(s.startsWith('UPDATE ot_exam_attempts SET answers_json'))row.answers_json=args[0];if(s.startsWith('UPDATE ot_exam_attempts SET submitted_at')){row.submitted_at=args[0];row.score=args[1]}if(s.startsWith('SELECT title,require_share'))return [[{title:'Exam',require_share:0}]];return [[]]});let result;await f.routes['POST /exams/attempts/:id']({...req,params:{id:'a'},body:{answers:[1],essay_answers:['Tự viết bằng tiếng Việt'],submit:true}},{json:d=>result=d.attempt});assert.equal(row.score,1);assert.equal(JSON.parse(row.answers_json).essays[0],'Tự viết bằng tiếng Việt');assert.equal(result.total_points,null);assert.equal(result.essays[0].ideas,undefined);assert(f.calls.some(([s])=>s.includes('student_id=? FOR UPDATE')))});
test('Student sees final total after teacher grades essays; legacy MCQ attempts still work',async()=>{for(const legacy of [false,true]){const row={id:'a',exam_id:'exam',student_id:1,deadline:Date.now()-10000,submitted_at:Date.now(),score:1,snapshot_json:JSON.stringify(legacy?[{q:'Q',o:['A'],a:0}]:{questions:[{q:'Q',o:['A'],a:0}],essays:[{q:'E',ideas:['secret']}],mcq_points:5}),answers_json:JSON.stringify(legacy?[0]:{choices:[0],essays:['Answer']})};const f=fixture(async s=>s.startsWith('SELECT * FROM ot_exam_attempts')?[[row]]:s.startsWith('SELECT title,require_share')?[[{title:'Exam',require_share:0}]]:s.startsWith('SELECT marks_json')&&!legacy?[[{marks_json:'[4]'}]]:[[]]);let result;await f.routes['GET /exams/attempts/:id']({...req,params:{id:'a'}},{json:d=>result=d.attempt});assert.equal(result.total_points,legacy?10:9);assert.equal(result.questions[0].a,undefined)}});

test('Deleted outline blocks new exam starts without touching saved attempts',async()=>{const f=startFixture(2,true);await assert.rejects(()=>f.routes['POST /exams/:id/start'](req,{json(){}}),e=>e.status===403);assert(!f.calls.some(([s])=>s.startsWith('DELETE')||s.startsWith('INSERT')))});

test('Delete is scoped to the teacher and keeps historical attempts',async()=>{
 let deleted=false;
 const f=fixture(async(s,args)=>{if(s.startsWith('UPDATE ot_exams SET is_open=-1')){assert.equal(args[1],7);deleted=true;return [{affectedRows:1}]}return [[]]});
 let result;await f.routes['DELETE /teacher/exams/:id'](req,{json:d=>result=d});assert(deleted&&result.success);
 assert(!f.calls.some(([s])=>s.startsWith('DELETE FROM')));
 const denied=fixture(async()=>[{affectedRows:0}]);await assert.rejects(()=>denied.routes['DELETE /teacher/exams/:id'](req,{json(){}}),e=>e.status===404);
});
test('Hosting-compatible POST delete uses the same owner-scoped handler',async()=>{
 const f=fixture(async(s,args)=>{assert.match(s,/UPDATE ot_exams SET is_open=-1/);assert.deepEqual(args,['exam',7]);return [{affectedRows:1}]});
 assert.equal(f.routes['POST /teacher/exams/:id/delete'],f.routes['DELETE /teacher/exams/:id']);
 let result;await f.routes['POST /teacher/exams/:id/delete'](req,{json:d=>result=d});assert(result.success);
 const fs=require('node:fs'),source=fs.readFileSync('public/ot/mock-exams-teacher.js','utf8');
 assert(source.includes("api('/teacher/exams/'+b.dataset.delete+'/delete',{})"));
});
test('Deleted exam rejects start, saved results, writes and management',async()=>{
 const row={id:'a',exam_id:'exam',student_id:1,submitted_at:1,snapshot_json:'[]',answers_json:'[]'};
 const f=fixture(async s=>{
  if(s.startsWith('SELECT * FROM ot_exams'))return [[{id:'exam',is_open:-1}]];
  if(s.startsWith('SELECT * FROM ot_exam_attempts'))return [[row]];
  if(s.startsWith('SELECT title,require_share')||s.startsWith('SELECT is_open'))return [[{title:'Deleted',is_open:-1}]];
  return [[]];
 });
 for(const name of ['POST /exams/:id/start','GET /exams/attempts/:id','POST /exams/attempts/:id'])await assert.rejects(()=>f.routes[name]({...req,body:{}},{json(){}}),e=>e.status===410);
 await assert.rejects(()=>f.routes['PATCH /teacher/exams/:id']({...req,body:{open:true}},{json(){}}),e=>e.status===403);
 assert(!f.calls.some(([s])=>s.startsWith('UPDATE')||s.startsWith('INSERT')));
});

test('Saving and correcting grades publishes exact per-question marks for current and archived attempts, including zero',async()=>{
 for(const archived of [false,true]){
  const row={id:'graded',exam_id:'exam',student_id:1,submitted_at:1000,deadline:1000,score:1,snapshot_json:JSON.stringify({questions:[{q:'Q',o:['A'],a:0}],essays:[{q:'E1',ideas:['private']},{q:'E2',ideas:['private']}],mcq_points:5}),answers_json:JSON.stringify({choices:[0],essays:['a','b']})};let marks=null;
  const f=fixture(async(s,args)=>{
   if(s.startsWith('SELECT * FROM ot_exams'))return [[{id:'exam',is_open:0}]];
   if(s.startsWith('SELECT * FROM ot_exam_attempts WHERE id'))return [archived?[]:[row]];
   if(s.startsWith('SELECT attempt_json'))return [[{attempt_json:JSON.stringify(row)}]];
   if(s.startsWith('SELECT title,require_share'))return [[{title:'Exam',is_open:0}]];
   if(s.startsWith('INSERT INTO ot_exam_grades'))marks=JSON.parse(args[1]);
   if(s.startsWith('SELECT marks_json'))return [marks?[{marks_json:JSON.stringify(marks)}]:[]];
   return [[]];
  });
  for(const values of [[0,0],[2,2.5]]){
   await f.routes['POST /teacher/exams/:id/grade']({...req,body:{attempt_id:row.id,marks:values}},{json(){}});
   let result;await f.routes['GET /exams/attempts/:id']({...req,params:{id:row.id}},{json:d=>result=d.attempt});
   assert.deepEqual(result.essay_marks,values);assert.equal(result.total_points,5+values[0]+values[1]);assert.equal(result.essays[0].ideas,undefined);
  }
  await assert.rejects(()=>f.routes['GET /exams/attempts/:id']({...req,student:{id:2},params:{id:row.id}},{json(){}}),e=>e.status===404);
 }
});
test('Closed exam results remain listed for their student with grade status; other classes and unused closed exams stay hidden',async()=>{
 const f=fixture(async(s,args)=>{
  if(s.startsWith('SELECT e.*,p.year_id')){assert(s.includes('e.is_open<>-1'));return [[{id:'exam',is_open:0,classes_json:'[5]'},{id:'unused',is_open:0,classes_json:'[5]'},{id:'other',is_open:1,classes_json:'[9]'}]]}
  if(s.startsWith('SELECT id,exam_id,submitted_at'))return [[{id:'a',exam_id:'exam',submitted_at:1000}]];
  if(s.startsWith('SELECT id,exam_id,attempt_json'))return [[{id:'old',exam_id:'exam',attempt_json:'{"submitted_at":500}'}]];
  if(s.startsWith('SELECT g.attempt_id')){assert.deepEqual(args,[1,1]);return [[{attempt_id:'old'}]]}
  if(s.startsWith('SELECT COALESCE'))return [[{extra:0}]];
  return [[]];
 });let d;await f.routes['GET /exams'](req,{json:x=>d=x});assert.equal(d.exams.length,1);assert.equal(d.exams[0].remaining,0);assert.equal(d.exams[0].is_open,false);assert.equal(d.exams[0].attempt.graded,false);assert.equal(d.exams[0].history[0].graded,true);
});
test('Teacher exam listing does not require a student session',async()=>{
 const f=fixture(async s=>s.startsWith('SELECT * FROM ot_exams')?[[{id:'exam'}]]:[[]]);let d;await f.routes['GET /teacher/exams']({teacherId:7},{json:x=>d=x});assert.equal(d.exams.length,1);
});

test('Submitted and archived essays auto grade from their own snapshot, never leak rubric before submission, and teacher override wins',async()=>{
 const row={id:'auto',exam_id:'exam',student_id:1,submitted_at:1000,deadline:Date.now()+60000,score:1,snapshot_json:JSON.stringify({questions:[{q:'Q',o:['A'],a:0}],essays:[{q:'E',ideas:['first','second'],keywords:[['internet'],['dữ liệu']]}],mcq_points:5}),answers_json:JSON.stringify({choices:[0],essays:['Internet giúp học tập']})};
 for(const archived of [false,true]){
  let marks=null;const f=fixture(async(s,args)=>{
   if(s.startsWith('SELECT * FROM ot_exams'))return [[{id:'exam',is_open:1}]];
   if(s.startsWith('SELECT * FROM ot_exam_attempts'))return [archived?[]:[row]];
   if(s.startsWith('SELECT attempt_json'))return [[{attempt_json:JSON.stringify(row)}]];
   if(s.startsWith('SELECT title,require_share'))return [[{title:'Exam',is_open:1}]];
   if(s.startsWith('SELECT marks_json'))return [marks?[{marks_json:JSON.stringify(marks)}]:[]];
   if(s.startsWith('INSERT INTO ot_exam_grades'))marks=JSON.parse(args[1]);
   return [[]];
  });
  const read=async()=>{let data;await f.routes['GET /exams/attempts/:id']({...req,params:{id:'auto'}},{json:d=>data=d.attempt});return data};
  let a=await read();assert.equal(a.essay_grade_source,'automatic');assert.equal(a.total_points,7.5);assert.deepEqual(a.essay_marks,[2.5]);assert.equal(a.essays[0].keywords,undefined);assert.equal(JSON.stringify(a).includes('dữ liệu'),false);
  await f.routes['POST /teacher/exams/:id/grade']({...req,body:{attempt_id:'auto',marks:[4]}},{json(){}});a=await read();assert.equal(a.essay_grade_source,'teacher');assert.equal(a.total_points,9);assert.deepEqual(a.essay_marks,[4]);
  row.submitted_at=null;marks=null;a=await read();assert.equal(a.essay_marks,null);assert.equal(a.essay_auto_details,null);assert.equal(a.total_points,null);row.submitted_at=1000;
 }
});
