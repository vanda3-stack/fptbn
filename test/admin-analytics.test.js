'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {parseRange,eventSources,runtimeSnapshot,createService,csv,mountRoutes}=require('../lib/admin-analytics');
const NOW=Date.parse('2026-11-24T10:00:00+07:00');
function fixture({missing=[],failure=false}={}){
 const calls=[],tables=['ot_attempts','ot_packs','ot_exam_attempts','ot_exam_archives','ot_exams','ot_live_answers','ot_live_games','fptbn_activity_events','fptbn_activity_meta'].filter(x=>!missing.includes(x));
 const db={query:async(sql,args=[])=>{
  calls.push({sql,args});const tag=sql.match(/analytics:([\w-]+)/)?.[1];
  if(failure&&tag==='summary')throw Error('database fixture failure');
  const data={years:[{id:2,name:'2026-2027',is_current:1}],tables:tables.map(name=>({name})),classes:[{id:10,class_code:'6A1',grade_level:6,is_active:1,enrolled_students:4,registered_students:4},{id:20,class_code:'6A2',grade_level:6,is_active:1,enrolled_students:2,registered_students:2}],cohort:[{eligible_students:6,registered_students:8,locked_students:2}],teachers:[{total:3,enabled:2}],summary:[{active_students:3,learning_students:2,active_classes:1,student_logins:4,practice_attempts:5,exam_started:3,exam_submitted:2,live_answers:8,quiz_attempts:2,quiz_correct:7,quiz_questions:10}],penetration:[{participants:2}],daily:[{day_index:Math.floor((NOW+7*3600000)/86400000),active_students:3,practice_attempts:5,exam_started:3,live_answers:8}],'class-events':[{class_id:10,active_students:3,practice_attempts:5,exam_started:3,exam_submitted:2,live_answers:8}],'teacher-logins':[{teacher_logins:4,active_teachers:2}],tracking:[{started_at_ms:NOW-86400000}],content:[{packs_created:2,content_teachers:1}]};
  if(tag)return [data[tag]];return [[]];
 }};
 return{calls,db,service:createService({db,now:()=>NOW,getRuntime:()=>({online_students:2,online_teachers:1,open_classes:1,socket_connections:5})})};
}

test('report dates are inclusive Vietnamese calendar dates and reject rollover, injection and unbounded/future ranges',()=>{
 const r=parseRange({from:'2026-11-23',to:'2026-11-24',grade:'6',year:'2'},NOW);
 assert.equal(r.start,Date.parse('2026-11-22T17:00:00Z'));assert.equal(r.end,Date.parse('2026-11-24T17:00:00Z'));assert.equal(r.grade,6);
 assert.equal(parseRange({},NOW).to,'2026-11-24');
 for(const query of [{from:'2026-02-30'},{from:'2025-01-01',to:'2026-11-24'},{to:'2026-11-25'},{from:'2026-11-24',to:'2026-11-23'},{grade:'6 OR 1=1'},{year:'0'},{grade:'13'}])assert.throws(()=>parseRange(query,NOW),{status:400});
});

test('historical sources include archived retakes without double counting current attempts, using epoch date boundaries',()=>{
 const r=parseRange({},NOW),s=eventSources(new Set(['ot_exam_attempts','ot_exam_archives','ot_exams','ot_packs']),r);
 assert.equal(s.coverage.exams,true);assert.equal(s.coverage.archives,true);assert.equal(s.coverage.practice,false);
 assert.match(s.sql,/NOT EXISTS.*current_attempt.id=a.id/);assert.match(s.sql,/JSON_VALID/);assert.ok(s.args.every(value=>value===r.start||value===r.end));
});

test('aggregate report keeps unique students, explicit denominators, missing-source markers, cached export snapshots and safe CSV',async()=>{
 const h=fixture(),data=await h.service.report({from:'2026-11-23',to:'2026-11-24',grade:'6'});
 assert.equal(data.metrics.participation_percent,33.33);assert.equal(data.metrics.quiz_accuracy_percent,70);assert.equal(data.metrics.exam_submission_percent,66.67);assert.equal(data.classes[1].practice_attempts,0);assert.equal(data.daily.length,2);assert.equal(data.daily[0].active_students,0);assert.equal(data.daily[1].active_students,3);
 assert.equal(data.tracking_since,new Date(NOW-86400000).toISOString());assert.equal(data.metrics.active_teachers,2);
 const classQuery=h.calls.find(c=>c.sql.includes('analytics:class-events'));assert.deepEqual(classQuery.args.slice(-2),[2,6]);assert.match(classQuery.sql,/c.school_year_id=\? AND c.grade_level=\?/);
 const count=h.calls.length,again=await h.service.report({from:'2026-11-23',to:'2026-11-24',grade:'6',year:'2'});assert.equal(again,data);assert.equal(h.calls.length,count,'export using resolved year shares the loaded snapshot');
 const exported=csv({...data,year:{...data.year,name:'=HYPERLINK("bad")'}});assert.equal(exported.charCodeAt(0),0xFEFF);assert.match(exported,/Độ phủ học tập/);assert.match(exported,/'=HYPERLINK/);assert.match(exported,/Bắt đầu ghi đăng nhập/);assert.doesNotMatch(exported,/full_name|student_code|password_hash/);
 const partial=await fixture({missing:['ot_attempts','ot_live_answers','fptbn_activity_events','fptbn_activity_meta']}).service.report({});assert.equal(partial.metrics.practice_attempts,null);assert.equal(partial.metrics.live_answers,null);assert.equal(partial.metrics.student_logins,null);assert.equal(partial.metrics.quiz_accuracy_percent,null);assert.equal(partial.classes[0].practice_attempts,null);assert.ok(partial.warnings.length>=3);
});

test('activity logging accepts only internal numeric identities and failures do not break successful user requests',async()=>{
 const h=fixture();await h.service.record({role:'student',id:7,classId:10,full_name:'not stored',token:'not stored'});
 const insert=h.calls.find(c=>c.sql.startsWith('INSERT INTO fptbn_activity_events'));assert.equal(insert.args[1],'student');assert.deepEqual(insert.args.slice(2,4),[7,10]);assert.equal(insert.args.length,5);
 const before=h.calls.length;for(const actor of [{role:'admin',id:7},{role:'teacher',id:-1},{role:'student',id:'not-id'}])await h.service.record(actor);assert.equal(h.calls.length,before);
 const broken=createService({db:{query:async()=>{throw Object.assign(Error(),{code:'FIXTURE_OFFLINE'});}}});await assert.doesNotReject(()=>broken.record({role:'student',id:7}));
});

test('analytics HTTP endpoints require an active admin, return real snapshot data and never export after database failure',async t=>{
 let active=true;const h=fixture(),tokens=new Map([['admin',{adminId:1,createdAt:Date.now()}],['expired',{adminId:1,createdAt:Date.now()-8*3600000}]]);
 const admin=require('../lib/admin-auth')({adminTokens:tokens,db:{query:async()=>[active?[{id:1}]:[]]}}),app=express();let reportService=h.service;mountRoutes(app,{service:{report:q=>reportService.report(q),health:()=>reportService.health()},admin});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;
 const get=(url,token='')=>fetch(base+url,{headers:{Authorization:'Bearer '+token}});
 for(const path of ['/api/admin/analytics','/api/admin/analytics/export.csv','/api/admin/analytics/health'])for(const token of ['','teacher','expired'])assert.equal((await get(path,token)).status,401);
 active=false;assert.equal((await get('/api/admin/analytics','admin')).status,403);active=true;
 const response=await get('/api/admin/analytics?grade=6','admin');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).runtime.online_students,2);
 const exported=await get('/api/admin/analytics/export.csv?grade=6','admin');assert.match(exported.headers.get('content-type'),/text\/csv/);assert.match(await exported.text(),/2026-2027/);
 const broken=fixture({failure:true});reportService=broken.service;const rejected=await get('/api/admin/analytics/export.csv','admin');assert.equal(rejected.status,503);assert.match(rejected.headers.get('content-type'),/application\/json/);
 await assert.rejects(()=>broken.service.report({}));await assert.rejects(()=>broken.service.report({}),'failed results must not remain cached');
});


test('runtime counts distinct connected identities and excludes retained, disconnected and stale role/room sockets',()=>{
 const sockets=new Map([
  ['s1',{connected:true,data:{role:'student'}}],['s2',{connected:true,data:{role:'student'}}],['s3',{connected:false,data:{role:'student'}}],
  ['t1',{connected:true,data:{role:'teacher',classCode:'6A1',teacherId:7}}],['t2',{connected:true,data:{role:'teacher',classCode:'EXAM',teacherId:7}}],['t3',{connected:true,data:{role:'teacher',classCode:'EXAM',teacherId:8}}],['wrong',{connected:true,data:{role:'student',classCode:'6A2',teacherId:9}}]
 ]);
 const result=runtimeSnapshot({students:new Map([['s1',{studentId:1}],['s2',{studentId:1}],['s3',{studentId:2}],['missing',{studentId:3}],['t1',{studentId:4}]]),teachersByClass:new Map([['6A1','t1'],['6A2','wrong'],['6A3','missing'],['6A4','t1']]),examTeachers:new Set(['t2','t3']),sockets,connections:7});
 assert.deepEqual(result,{online_students:1,online_teachers:2,open_classes:2,socket_connections:7});
});
