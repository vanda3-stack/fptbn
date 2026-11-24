'use strict';
const crypto=require('node:crypto');
const DAY=86400000,OFFSET=7*3600000;
const bad=message=>Object.assign(Error(message),{status:400});
const dateAt=ms=>new Date(ms+OFFSET).toISOString().slice(0,10);
function parseRange(query={},now=Date.now()){
 const parse=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw bad('Chọn ngày theo định dạng năm-tháng-ngày.');
  const ms=Date.parse(value+'T00:00:00+07:00');
  if(!Number.isFinite(ms)||dateAt(ms)!==value)throw bad('Ngày không hợp lệ.');return ms;
 };
 const from=query.from??dateAt(now-29*DAY),to=query.to??dateAt(now),start=parse(from),end=parse(to)+DAY;
 if(end<=start||end-start>366*DAY)throw bad('Chọn khoảng từ 1 đến 366 ngày.');
 if(start>now||parse(to)>parse(dateAt(now)))throw bad('Không chọn ngày ở tương lai.');
 const grade=query.grade==null||query.grade===''?null:Number(query.grade),year=query.year==null||query.year===''?null:Number(query.year);
 if(grade!==null&&(!Number.isInteger(grade)||grade<3||grade>12))throw bad('Khối phải từ 3 đến 12.');
 if(year!==null&&(!Number.isInteger(year)||year<1))throw bad('Năm học không hợp lệ.');
 return{from,to,start,end,grade,year};
}
const number=value=>Number(value)||0;
const percent=(a,b)=>b>0?Math.round(a/b*10000)/100:null;
const TABLES=['ot_attempts','ot_packs','ot_exam_attempts','ot_exam_archives','ot_exams','ot_live_answers','ot_live_games','fptbn_activity_events','fptbn_activity_meta'];
function eventSources(tables,range){
 const has=(...names)=>names.every(name=>tables.has(name)),parts=[],args=[],coverage={};
 coverage.practice=has('ot_attempts');
 if(coverage.practice){parts.push("SELECT a.id event_id,a.student_id,a.class_id,UNIX_TIMESTAMP(a.created_at)*1000 at_ms,'practice' kind,a.kind subtype,a.score,a.total,NULL submitted_at FROM ot_attempts a WHERE a.created_at>=FROM_UNIXTIME(?) AND a.created_at<FROM_UNIXTIME(?)");args.push(range.start/1000,range.end/1000);}
 coverage.exams=has('ot_exam_attempts','ot_exams','ot_packs');
 if(coverage.exams){parts.push("SELECT a.id,a.student_id,c.id,a.started_at,'exam','exam',NULL,NULL,a.submitted_at FROM ot_exam_attempts a JOIN ot_exams x ON x.id=a.exam_id JOIN ot_packs p ON p.id=x.pack_id JOIN classes c ON c.class_code=a.class_code AND c.school_year_id=p.year_id WHERE a.started_at>=? AND a.started_at<?");args.push(range.start,range.end);}
 coverage.archives=has('ot_exam_archives','ot_exams','ot_packs');
 if(coverage.archives){
  const field=key=>"JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(a.attempt_json),a.attempt_json,'{}'),'$."+key+"'))";
  const start='CAST('+field('started_at')+' AS UNSIGNED)',submitted="CAST(NULLIF("+field('submitted_at')+",'null') AS UNSIGNED)";
  parts.push("SELECT a.id,a.student_id,c.id,"+start+",'exam','exam',NULL,NULL,"+submitted+" FROM ot_exam_archives a JOIN ot_exams x ON x.id=a.exam_id JOIN ot_packs p ON p.id=x.pack_id JOIN classes c ON c.class_code="+field('class_code')+" AND c.school_year_id=p.year_id WHERE "+start+">=? AND "+start+"<?"+(has('ot_exam_attempts')?' AND NOT EXISTS (SELECT 1 FROM ot_exam_attempts current_attempt WHERE current_attempt.id=a.id)':''));args.push(range.start,range.end);
 }
 coverage.live=has('ot_live_answers','ot_live_games');
 if(coverage.live){parts.push("SELECT CONCAT(a.game_id,':',a.student_id,':',a.question_index),a.student_id,g.class_id,UNIX_TIMESTAMP(a.created_at)*1000,'live','answer',IF(a.points>0,1,0),1,NULL FROM ot_live_answers a JOIN ot_live_games g ON g.id=a.game_id WHERE a.created_at>=FROM_UNIXTIME(?) AND a.created_at<FROM_UNIXTIME(?)");args.push(range.start/1000,range.end/1000);}
 coverage.logins=has('fptbn_activity_events');
 if(coverage.logins){parts.push("SELECT a.id,a.actor_id,a.class_id,a.created_at_ms,'login','login',NULL,NULL,NULL FROM fptbn_activity_events a WHERE a.actor_role='student' AND a.created_at_ms>=? AND a.created_at_ms<?");args.push(range.start,range.end);}
 if(!parts.length)parts.push("SELECT NULL event_id,NULL student_id,NULL class_id,NULL at_ms,NULL kind,NULL subtype,NULL score,NULL total,NULL submitted_at WHERE 1=0");
 return{sql:parts.join(' UNION ALL '),args,coverage};
}
function runtimeSnapshot({students,teachersByClass,examTeachers,sockets,connections}){
 const teacher=(id,code)=>{const peer=sockets.get(id);return peer?.connected&&peer.data.role==='teacher'&&peer.data.classCode===code?peer:null;};
 const normal=Array.from(teachersByClass,([code,id])=>teacher(id,code)).filter(Boolean),exam=Array.from(examTeachers,id=>teacher(id,'EXAM')).filter(Boolean);
 const onlineStudents=Array.from(students).filter(([id])=>{const peer=sockets.get(id);return peer?.connected&&peer.data.role==='student';}).map(([,s])=>Number(s.studentId)).filter(id=>id>0);
 return{online_students:new Set(onlineStudents).size,online_teachers:new Set([...normal,...exam].map(peer=>Number(peer.data.teacherId)).filter(id=>id>0)).size,open_classes:normal.length+(exam.length?1:0),socket_connections:connections};
}
function createService({db,now=Date.now,getRuntime=()=>({})}){
 let schemaPromise;const cache=new Map();const startedAt=now(),http={requests:0,errors:0,client_errors:0,total_ms:0};
 function schema(){
  if(!schemaPromise)schemaPromise=(async()=>{
   await db.query('CREATE TABLE IF NOT EXISTS fptbn_activity_events (id CHAR(36) PRIMARY KEY,actor_role VARCHAR(12) NOT NULL,actor_id INT NOT NULL,class_id INT NULL,created_at_ms BIGINT NOT NULL,INDEX activity_time(created_at_ms),INDEX activity_actor(actor_role,actor_id,created_at_ms)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
   await db.query('CREATE TABLE IF NOT EXISTS fptbn_activity_meta (id TINYINT PRIMARY KEY,started_at_ms BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
   await db.query('INSERT IGNORE INTO fptbn_activity_meta (id,started_at_ms) VALUES (1,?)',[now()]);
  })().catch(error=>{schemaPromise=null;throw error;});return schemaPromise;
 }
 async function record(actor){
  if(!actor||!['student','teacher'].includes(actor.role)||!Number.isInteger(Number(actor.id))||Number(actor.id)<1)return;
  try{await schema();await db.query('INSERT INTO fptbn_activity_events (id,actor_role,actor_id,class_id,created_at_ms) VALUES (?,?,?,?,?)',[crypto.randomUUID(),actor.role,Number(actor.id),Number.isInteger(Number(actor.classId))&&Number(actor.classId)>0?Number(actor.classId):null,now()]);}
  catch(error){console.error('Activity logging unavailable:',error.code||'WRITE_ERROR');}
 }
 function observe(req,res){
  if(!req.path.startsWith('/api/'))return;const begin=now();
  res.once('finish',()=>{
   http.requests++;http.total_ms+=Math.max(0,now()-begin);if(res.statusCode>=500)http.errors++;else if(res.statusCode>=400)http.client_errors++;
   if(res.statusCode>=200&&res.statusCode<300&&req.activityActor)void record(req.activityActor);
  });
 }
 async function health(){const begin=now();await db.query('SELECT 1 AS ok');const memory=process.memoryUsage();return{...getRuntime(),sampled_at:new Date(now()).toISOString(),database_ms:Math.max(0,now()-begin),process_started_at:new Date(startedAt).toISOString(),uptime_seconds:Math.floor(process.uptime()),rss_mb:Math.round(memory.rss/1048576),heap_mb:Math.round(memory.heapUsed/1048576),http:{requests:http.requests,server_errors:http.errors,client_errors:http.client_errors,average_ms:http.requests?Math.round(http.total_ms/http.requests):null}};}
 async function build(range){
  const warnings=[];
  try{await schema();}catch{warnings.push('Chưa thể ghi lịch sử đăng nhập. Các nguồn dữ liệu học tập hiện có vẫn được tổng hợp.');}
  const [years]=await db.query('/* analytics:years */ SELECT id,name,is_current FROM school_years ORDER BY id DESC');
  const year=years.find(y=>Number(y.id)===(range.year??Number(years.find(y=>Number(y.is_current)===1)?.id)));
  if(!year)throw bad('Không tìm thấy năm học.');
  range={...range,year:Number(year.id)};
  const [tableRows]=await db.query('/* analytics:tables */ SELECT TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?)',[TABLES]);
  const tables=new Set(tableRows.map(row=>row.name)),source=eventSources(tables,range);
  for(const [key,label] of Object.entries({practice:'ôn tập',exams:'thi thử hiện tại',archives:'lịch sử thi thử',live:'ôn tập tại lớp',logins:'đăng nhập'}))if(!source.coverage[key])warnings.push('Chưa có nguồn dữ liệu '+label+'; chỉ số liên quan chưa đầy đủ.');
  const scope=' c.school_year_id=?'+(range.grade===null?'':' AND c.grade_level=?'),scopeArgs=[range.year,...(range.grade===null?[]:[range.grade])];
  const from=' FROM ('+source.sql+') e JOIN classes c ON c.id=e.class_id WHERE'+scope;
  const [classes]=await db.query('/* analytics:classes */ SELECT c.id,c.class_code,c.grade_level,c.is_active,COUNT(DISTINCT CASE WHEN s.is_active=1 THEN s.id END) enrolled_students,COUNT(DISTINCT s.id) registered_students FROM classes c LEFT JOIN student_enrollments se ON se.class_id=c.id LEFT JOIN students s ON s.id=se.student_id WHERE'+scope+' GROUP BY c.id,c.class_code,c.grade_level,c.is_active ORDER BY c.grade_level,c.class_code',scopeArgs);
  const [[cohort]]=await db.query('/* analytics:cohort */ SELECT COUNT(DISTINCT s.id) registered_students,COUNT(DISTINCT CASE WHEN s.is_active=1 AND c.is_active=1 THEN s.id END) eligible_students,COUNT(DISTINCT CASE WHEN s.is_active<>1 THEN s.id END) locked_students FROM students s JOIN student_enrollments se ON se.student_id=s.id JOIN classes c ON c.id=se.class_id WHERE'+scope,scopeArgs);
  const [[teachers]]=await db.query('/* analytics:teachers */ SELECT COUNT(*) total,SUM(is_active=1) enabled FROM teachers');
  const [summaryRows]=await db.query(`/* analytics:summary */ SELECT COUNT(DISTINCT e.student_id) active_students,COUNT(DISTINCT CASE WHEN e.kind<>'login' THEN e.student_id END) learning_students,COUNT(DISTINCT e.class_id) active_classes,SUM(e.kind='login') student_logins,SUM(e.kind='practice') practice_attempts,SUM(e.kind='exam') exam_started,SUM(e.kind='exam' AND e.submitted_at IS NOT NULL AND e.submitted_at<?) exam_submitted,SUM(e.kind='live') live_answers,SUM(e.kind='practice' AND e.subtype='quiz') quiz_attempts,SUM(CASE WHEN e.kind='practice' AND e.subtype='quiz' AND e.total>0 AND e.score BETWEEN 0 AND e.total THEN e.score ELSE 0 END) quiz_correct,SUM(CASE WHEN e.kind='practice' AND e.subtype='quiz' AND e.total>0 AND e.score BETWEEN 0 AND e.total THEN e.total ELSE 0 END) quiz_questions`+from,[range.end,...source.args,...scopeArgs]);
  const [penetrationRows]=await db.query("/* analytics:penetration */ SELECT COUNT(DISTINCT e.student_id) participants"+from+" AND e.kind<>'login' AND EXISTS (SELECT 1 FROM student_enrollments se2 JOIN students s2 ON s2.id=se2.student_id JOIN classes c2 ON c2.id=se2.class_id WHERE se2.student_id=e.student_id AND s2.is_active=1 AND c2.is_active=1 AND c2.school_year_id=?"+(range.grade===null?'':' AND c2.grade_level=?')+")",[...source.args,...scopeArgs,...scopeArgs]);
  const [daily]=await db.query("/* analytics:daily */ SELECT FLOOR((e.at_ms+25200000)/86400000) day_index,COUNT(DISTINCT e.student_id) active_students,SUM(e.kind='practice') practice_attempts,SUM(e.kind='exam') exam_started,SUM(e.kind='live') live_answers"+from+' GROUP BY day_index ORDER BY day_index',[...source.args,...scopeArgs]);
  const [classEvents]=await db.query("/* analytics:class-events */ SELECT e.class_id,COUNT(DISTINCT e.student_id) active_students,SUM(e.kind='practice') practice_attempts,SUM(e.kind='exam') exam_started,SUM(e.kind='exam' AND e.submitted_at IS NOT NULL AND e.submitted_at<?) exam_submitted,SUM(e.kind='live') live_answers"+from+' GROUP BY e.class_id',[range.end,...source.args,...scopeArgs]);
  let logins=null,trackingSince=null;
  if(source.coverage.logins){const [rows]=await db.query("/* analytics:teacher-logins */ SELECT COUNT(*) teacher_logins,COUNT(DISTINCT actor_id) active_teachers FROM fptbn_activity_events WHERE actor_role='teacher' AND created_at_ms>=? AND created_at_ms<?",[range.start,range.end]);logins=rows[0];}
  if(tables.has('fptbn_activity_meta')){const [rows]=await db.query('/* analytics:tracking */ SELECT started_at_ms FROM fptbn_activity_meta WHERE id=1');if(rows[0])trackingSince=new Date(Number(rows[0].started_at_ms)).toISOString();}
  let content=null;
  if(tables.has('ot_packs')){const [rows]=await db.query("/* analytics:content */ SELECT COUNT(*) packs_created,COUNT(DISTINCT p.teacher_id) content_teachers FROM ot_packs p WHERE p.year_id=? AND p.created_at>=FROM_UNIXTIME(?) AND p.created_at<FROM_UNIXTIME(?)"+(range.grade===null?'':" AND EXISTS (SELECT 1 FROM classes c WHERE c.school_year_id=p.year_id AND c.grade_level=? AND JSON_CONTAINS(p.classes_json,CAST(c.id AS CHAR),'$'))"),[range.year,range.start/1000,range.end/1000,...(range.grade===null?[]:[range.grade])]);content=rows[0];}
  const metrics=Object.fromEntries(Object.entries(summaryRows[0]||{}).map(([key,value])=>[key,number(value)]));
  metrics.eligible_students=number(cohort?.eligible_students);metrics.cohort_participants=number(penetrationRows[0]?.participants);metrics.participation_percent=percent(metrics.cohort_participants,metrics.eligible_students);
  metrics.quiz_accuracy_percent=source.coverage.practice?percent(metrics.quiz_correct,metrics.quiz_questions):null;
  metrics.exam_submission_percent=(source.coverage.exams||source.coverage.archives)?percent(metrics.exam_submitted,metrics.exam_started):null;
  metrics.active_teachers=logins?number(logins.active_teachers):null;metrics.teacher_logins=logins?number(logins.teacher_logins):null;
  metrics.packs_created=content?number(content.packs_created):null;metrics.content_teachers=content?number(content.content_teachers):null;
  if(!source.coverage.practice)for(const key of ['practice_attempts','quiz_attempts','quiz_correct','quiz_questions'])metrics[key]=null;
  if(!source.coverage.exams&&!source.coverage.archives)for(const key of ['exam_started','exam_submitted'])metrics[key]=null;
  if(!source.coverage.live)metrics.live_answers=null;if(!source.coverage.logins)metrics.student_logins=null;
  const hasLearning=source.coverage.practice||source.coverage.exams||source.coverage.archives||source.coverage.live;
  if(!hasLearning)for(const key of ['learning_students','cohort_participants','participation_percent'])metrics[key]=null;
  const dailyMap=new Map(daily.map(row=>[number(row.day_index),row])),days=[];
  for(let ms=range.start;ms<range.end;ms+=DAY){const index=Math.floor((ms+OFFSET)/DAY),row=dailyMap.get(index)||{};days.push({date:dateAt(ms),active_students:number(row.active_students),practice_attempts:source.coverage.practice?number(row.practice_attempts):null,exam_started:source.coverage.exams||source.coverage.archives?number(row.exam_started):null,live_answers:source.coverage.live?number(row.live_answers):null});}
  const byClass=new Map(classEvents.map(row=>[Number(row.class_id),row]));
  return{success:true,generated_at:new Date(now()).toISOString(),filters:{from:range.from,to:range.to,grade:range.grade,year:range.year},year:{id:range.year,name:year.name},years,timezone:'Asia/Ho_Chi_Minh',tracking_since:trackingSince,coverage:source.coverage,warnings,metrics,accounts:{registered_students:number(cohort?.registered_students),locked_students:number(cohort?.locked_students),eligible_students:metrics.eligible_students,teachers: number(teachers?.total),enabled_teachers:number(teachers?.enabled),active_classes:classes.filter(row=>Number(row.is_active)===1).length},daily:days,classes:classes.map(row=>{const event=byClass.get(Number(row.id))||{};return{class_code:row.class_code,grade_level:number(row.grade_level),is_active:Number(row.is_active)===1,enrolled_students:number(row.enrolled_students),active_students:number(event.active_students),practice_attempts:source.coverage.practice?number(event.practice_attempts):null,exam_started:source.coverage.exams||source.coverage.archives?number(event.exam_started):null,exam_submitted:source.coverage.exams||source.coverage.archives?number(event.exam_submitted):null,live_answers:source.coverage.live?number(event.live_answers):null};}),runtime:await health(),definitions:[
   'HS có hoạt động: mỗi mã HS được đếm một lần trong kỳ, từ đăng nhập cổng HS hoặc bài ôn, lượt thi, câu trả lời trên lớp đã lưu; không phải số lượt xem trang.',
   'Độ phủ học tập: HS đang hoạt động và đang xếp lớp trong phạm vi có bài ôn/lượt thi/câu trả lời đã lưu, chia cho HS đang hoạt động được xếp lớp trong phạm vi tại thời điểm xuất báo cáo.',
   'Bài thi: lượt bắt đầu trong kỳ, gồm lịch sử thi lại; đã nộp là các lượt này có thời điểm nộp trước cuối kỳ. Không coi lượt quá hạn chưa được hệ thống chốt là đã nộp.',
   'Độ chính xác trắc nghiệm: tổng câu đúng/tổng câu có điểm hợp lệ của các lượt ôn trắc nghiệm trong kỳ. Chỉ số mô tả kết quả thực hiện, không chứng minh tác động hay mức tiến bộ.',
   'Đăng nhập chỉ có từ thời điểm bắt đầu thu thập; GV đăng nhập tính toàn hệ thống, không lọc theo lớp/khối/năm. GV tạo nội dung và lượt học tập lọc theo năm học, khối đã chọn.',
   'Ngày hiện tại chỉ có số liệu đến lúc tổng hợp. Tài khoản và số HS xếp lớp là ảnh chụp hiện tại. Trạng thái trực tuyến, bộ nhớ và HTTP là ảnh chụp của tiến trình hiện tại; bộ đếm HTTP đặt lại khi khởi động. Chưa đo thời gian học thực tế.'
  ]};
 }
 async function report(query){
  const range=parseRange(query,now()),key=JSON.stringify(range),cached=cache.get(key);
  if(cached&&now()-cached.at<30000)return cached.promise;
  if(cache.size>=16)cache.delete(cache.keys().next().value);
  const promise=build(range).then(data=>{const canonical=JSON.stringify({...range,year:data.filters.year});if(canonical!==key)cache.set(canonical,{at:now(),promise:Promise.resolve(data)});return data;}).catch(error=>{cache.delete(key);throw error;});cache.set(key,{at:now(),promise});return promise;
 }
 return{record,observe,health,report};
}
function csv(report){
 const rows=[['Mục','Chỉ số','Giá trị','Đơn vị / mô tả']];
 rows.push(['Phạm vi','Từ ngày',report.filters.from,'Giờ Việt Nam'],['Phạm vi','Đến ngày',report.filters.to,'Bao gồm cả ngày'],['Phạm vi','Năm học',report.year.name,''],['Phạm vi','Khối',report.filters.grade??'Tất cả',''],['Phạm vi','Thời điểm tổng hợp',report.generated_at,'ISO 8601'],['Phạm vi','Bắt đầu ghi đăng nhập',report.tracking_since??'Chưa có','ISO 8601']);
 const labels={registered_students:'HS đã đăng ký/xếp lớp trong năm',locked_students:'Tài khoản HS bị khóa',active_students:'HS có hoạt động',learning_students:'HS có hoạt động học tập',active_classes:'Lớp có hoạt động',student_logins:'Lượt đăng nhập cổng HS',practice_attempts:'Lượt ôn tập',exam_started:'Lượt thi bắt đầu',exam_submitted:'Bài thi đã nộp',live_answers:'Câu trả lời trên lớp',quiz_attempts:'Lượt ôn trắc nghiệm',quiz_correct:'Câu trắc nghiệm đúng',quiz_questions:'Câu trắc nghiệm có điểm hợp lệ',eligible_students:'HS đang hoạt động được xếp lớp',cohort_participants:'HS hiện đang xếp lớp có hoạt động học tập',participation_percent:'Độ phủ học tập (%)',quiz_accuracy_percent:'Độ chính xác trắc nghiệm (%)',exam_submission_percent:'Tỉ lệ nộp bài thi (%)',active_teachers:'GV đăng nhập trong kỳ',teacher_logins:'Lượt đăng nhập GV',packs_created:'Đề cương được tạo',content_teachers:'GV tạo đề cương',teachers:'Tổng tài khoản GV',enabled_teachers:'Tài khoản GV đang hoạt động',enrolled_students:'HS đang xếp lớp',online_students:'HS đang kết nối',online_teachers:'GV đang kết nối',open_classes:'Lớp đang mở',socket_connections:'Kết nối Socket.IO',database_ms:'Phản hồi CSDL (ms)',uptime_seconds:'Thời gian tiến trình chạy (giây)',rss_mb:'Bộ nhớ tiến trình (MB)',heap_mb:'Heap (MB)',process_started_at:'Tiến trình khởi động lúc',sampled_at:'Đo trạng thái lúc'};
 const label=key=>labels[key]||key;
 for(const [key,value] of Object.entries(report.metrics))rows.push(['Chỉ số',label(key),value??'Chưa có dữ liệu',key.endsWith('_percent')?'%':'']);
 for(const [key,value] of Object.entries(report.accounts))rows.push(['Tài khoản hiện tại',key==='active_classes'?'Lớp đang hoạt động':label(key),value,'']);
 for(const row of report.daily)for(const [key,value] of Object.entries(row))if(key!=='date')rows.push(['Ngày '+row.date,label(key),value??'Chưa có dữ liệu','']);
 for(const row of report.classes)for(const [key,value] of Object.entries(row))if(!['class_code','grade_level','is_active'].includes(key))rows.push(['Lớp '+row.class_code,label(key),value??'Chưa có dữ liệu','Khối '+row.grade_level]);
 for(const [key,value] of Object.entries(report.runtime||{}))if(key!=='http')rows.push(['Hệ thống hiện tại',label(key),value??'Chưa có dữ liệu','']);
 for(const [key,value] of Object.entries(report.runtime?.http||{}))rows.push(['HTTP từ khi khởi động',key,value??'Chưa có dữ liệu','']);
 for(const text of [...report.definitions,...report.warnings])rows.push(['Chú thích','',text,'']);
 const cell=value=>{let s=String(value);if(/^[\s]*[=+\-@]/.test(s)||/^[\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
function mountRoutes(app,{service,admin}){
 const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(error){res.status(error.status||503).json({success:false,message:error.status?error.message:'Chưa tải được thống kê. Vui lòng thử lại; số liệu cũ không được dùng để xuất báo cáo.'});}};
 app.get('/api/admin/analytics/health',admin,wrap(async(req,res)=>res.json({success:true,runtime:await service.health()})));
 app.get('/api/admin/analytics',admin,wrap(async(req,res)=>res.json(await service.report(req.query))));
 app.get('/api/admin/analytics/export.csv',admin,wrap(async(req,res)=>{const data=await service.report(req.query);res.set('Content-Type','text/csv; charset=utf-8');res.set('Content-Disposition','attachment; filename="fptbn-report-'+data.filters.from+'-'+data.filters.to+'.csv"');res.send(csv(data));}));
}
module.exports={parseRange,eventSources,runtimeSnapshot,createService,csv,mountRoutes};
