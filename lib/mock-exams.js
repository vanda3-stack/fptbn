'use strict';
const crypto = require('crypto');
module.exports = function mount({r, db, student, teacher, packFor, wrap, bad}) {
 // is_open: 1 = open, 0 = closed, -1 = deleted (retain historical records).
 let ready;
 const schema = () => ready || (ready = (async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS ot_exams (id CHAR(36) PRIMARY KEY, pack_id CHAR(36) NOT NULL, teacher_id INT NOT NULL, title VARCHAR(200) NOT NULL, question_count INT NOT NULL, minutes INT NOT NULL, require_share TINYINT NOT NULL DEFAULT 0, is_open TINYINT NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query(`CREATE TABLE IF NOT EXISTS ot_exam_attempts (id CHAR(36) PRIMARY KEY, exam_id CHAR(36) NOT NULL, student_id INT NOT NULL, student_code VARCHAR(100) NOT NULL, full_name VARCHAR(255) NOT NULL, class_code VARCHAR(100) NOT NULL, snapshot_json LONGTEXT NOT NULL, answers_json LONGTEXT NOT NULL, started_at BIGINT NOT NULL, deadline BIGINT NOT NULL, submitted_at BIGINT NULL, last_seen BIGINT NOT NULL, score INT NULL, UNIQUE KEY one_exam_student(exam_id,student_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query(`CREATE TABLE IF NOT EXISTS ot_exam_events (id CHAR(36) PRIMARY KEY, attempt_id CHAR(36) NOT NULL, kind VARCHAR(40) NOT NULL, created_at BIGINT NOT NULL, INDEX attempt_events(attempt_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
 })().catch(e => {ready=null;throw e}));
 r.use('/exams', student, wrap(async(req,res,next)=>{await schema();next()}));
 r.use('/teacher/exams', teacher, wrap(async(req,res,next)=>{await schema();next()}));
 const shuffle = a => {a=a.slice();for(let i=a.length-1;i>0;i--){let j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
 async function finish(a) {
  const qs=JSON.parse(a.snapshot_json), ans=JSON.parse(a.answers_json);
  await db.query('UPDATE ot_exam_attempts SET submitted_at=?,score=? WHERE id=? AND submitted_at IS NULL',[Math.min(Date.now(),Number(a.deadline)),qs.reduce((n,q,i)=>n+(ans[i]===q.a?1:0),0),a.id]);
 }
 async function attempt(req) {
  const [rows]=await db.query('SELECT a.*,e.title,e.require_share,e.is_open FROM ot_exam_attempts a JOIN ot_exams e ON e.id=a.exam_id WHERE a.id=? AND a.student_id=?',[req.params.id,req.student.id]);
  if(!rows.length)throw bad('Không tìm thấy lượt thi.',404);
  if(Number(rows[0].is_open)===-1)throw bad('Đề thi đã được giáo viên xoá.',410);
  return rows[0];
 }
 async function view(a) {
  if(!a.submitted_at && Date.now()>=Number(a.deadline)){await finish(a);const [rows]=await db.query('SELECT * FROM ot_exam_attempts WHERE id=?',[a.id]);a={...a,...rows[0]}}
  return {id:a.id,title:a.title,require_share:!!a.require_share,deadline:Number(a.deadline),server_now:Date.now(),submitted_at:a.submitted_at,score:a.score,answers:JSON.parse(a.answers_json),questions:JSON.parse(a.snapshot_json).map(q=>({q:q.q,o:q.o}))};
 }
 r.get('/exams',wrap(async(req,res)=>{
  const [rows]=await db.query('SELECT e.*,p.year_id,p.classes_json FROM ot_exams e JOIN ot_packs p ON p.id=e.pack_id WHERE e.is_open=1 AND p.year_id=? ORDER BY e.created_at DESC',[req.student.school_year_id]);
  const [attempts]=await db.query('SELECT id,exam_id,submitted_at,score,deadline FROM ot_exam_attempts WHERE student_id=?',[req.student.id]);
  res.json({success:true,exams:rows.filter(e=>JSON.parse(e.classes_json).includes(req.student.class_id)).map(e=>({id:e.id,title:e.title,question_count:e.question_count,minutes:e.minutes,created_at:e.created_at,require_share:!!e.require_share,attempt:attempts.find(a=>a.exam_id===e.id)||null}))});
 }));
 r.post('/exams/:id/start',wrap(async(req,res)=>{
  const [exams]=await db.query('SELECT * FROM ot_exams WHERE id=? AND is_open<>-1',[req.params.id]);
  if(!exams.length)throw bad('Đề thi đã được giáo viên xoá hoặc không còn tồn tại.',410);
  const e=exams[0];
  // Access is tied to the original outline classes, even after the review is closed.
  const [packs]=await db.query('SELECT * FROM ot_packs WHERE id=?',[e.pack_id]);const p=packs[0];
  if(!p||p.year_id!==req.student.school_year_id||!JSON.parse(p.classes_json).includes(req.student.class_id))throw bad('Lượt thi chưa giao cho lớp em.',403);
  const [old]=await db.query('SELECT * FROM ot_exam_attempts WHERE exam_id=? AND student_id=?',[e.id,req.student.id]);
  if(old.length)return res.json({success:true,attempt:await view({...old[0],title:e.title,require_share:e.require_share})});
  if(!e.is_open)throw bad('Lượt thi đã đóng.',403);
  const source=JSON.parse(p.content_json).questions;
  if(source.length<e.question_count)throw bad('Bộ câu hỏi không đủ số câu.');
  const questions=shuffle(source).slice(0,e.question_count).map(q=>{let order=shuffle(q.o.map((_,i)=>i));return {q:q.q,o:order.map(i=>q.o[i]),a:order.indexOf(q.a)}});
  const id=crypto.randomUUID(),now=Date.now();
  await db.query('INSERT IGNORE INTO ot_exam_attempts (id,exam_id,student_id,student_code,full_name,class_code,snapshot_json,answers_json,started_at,deadline,last_seen) SELECT ?,?,?,?,?,?,?,?,?,?,? FROM ot_exams WHERE id=? AND is_open=1',[id,e.id,req.student.id,req.student.student_code,req.student.full_name,req.student.class_code,JSON.stringify(questions),JSON.stringify(questions.map(()=>null)),now,now+e.minutes*60000,now,e.id]);
  const [saved]=await db.query('SELECT id FROM ot_exam_attempts WHERE exam_id=? AND student_id=?',[e.id,req.student.id]);
  if(!saved.length)throw bad('Lượt thi đã đóng hoặc bị xoá.',410);
  res.json({success:true,attempt:await view(await attempt({...req,params:{id:saved[0].id}}))});
 }));
 r.get('/exams/attempts/:id',wrap(async(req,res)=>res.json({success:true,attempt:await view(await attempt(req))})));
 r.post('/exams/attempts/:id',wrap(async(req,res)=>{
  let a=await attempt(req);
  if(!a.submitted_at && Date.now()<Number(a.deadline)) {
   let ans=req.body.answers,qs=JSON.parse(a.snapshot_json);
   if(!Array.isArray(ans)||ans.length!==qs.length||ans.some((x,i)=>x!==null&&(!Number.isInteger(x)||x<0||x>=qs[i].o.length)))throw bad('Đáp án không hợp lệ.');
   await db.query('UPDATE ot_exam_attempts SET answers_json=?,last_seen=? WHERE id=? AND submitted_at IS NULL',[JSON.stringify(ans),Date.now(),a.id]);a.answers_json=JSON.stringify(ans);
   const events=Array.isArray(req.body.events)?req.body.events.slice(0,30):[];
   for(const ev of events){if(!/^[0-9a-f-]{36}$/i.test(ev.id)||!['page_leave','page_return','fullscreen_exit','share_stopped','connection_return','heartbeat','exit'].includes(ev.kind))continue;await db.query('INSERT IGNORE INTO ot_exam_events (id,attempt_id,kind,created_at) VALUES (?,?,?,?)',[ev.id,a.id,ev.kind,Date.now()]);}
  }
  if(!a.submitted_at&&(req.body.submit===true||Date.now()>=Number(a.deadline)))await finish(a);
  a=await attempt(req);res.json({success:true,attempt:await view(a)});
 }));
 r.post('/teacher/exams',wrap(async(req,res)=>{
  let b=req.body,p=await packFor(req,b.pack_id,true);
  if(typeof b.title!=='string'||!b.title.trim()||b.title.length>200||!Number.isInteger(b.count)||b.count<1||b.count>p.content.questions.length||!Number.isInteger(b.minutes)||b.minutes<1||b.minutes>180)throw bad('Kiểm tra tên, số câu và thời gian (1–180 phút).');
  if(p.content.questions.some(q=>!Number.isInteger(q.a)||q.a<0||q.a>=q.o.length))throw bad('Đề cương còn câu chưa có đáp án.');
  const id=crypto.randomUUID();
  await db.query('INSERT INTO ot_exams (id,pack_id,teacher_id,title,question_count,minutes,require_share) VALUES (?,?,?,?,?,?,?)',[id,p.id,req.teacherId,b.title.trim(),b.count,b.minutes,b.require_share===true?1:0]);res.json({success:true,id});
 }));
 r.get('/teacher/exams',wrap(async(req,res)=>{const [exams]=await db.query('SELECT * FROM ot_exams WHERE teacher_id=? AND is_open<>-1 ORDER BY created_at DESC,id DESC',[req.teacherId]);res.json({success:true,exams})}));
 r.patch('/teacher/exams/:id',wrap(async(req,res)=>{
  if(typeof req.body.open!=='boolean')throw bad('Trạng thái không hợp lệ.');
  const [rows]=await db.query('SELECT * FROM ot_exams WHERE id=? AND teacher_id=? AND is_open<>-1',[req.params.id,req.teacherId]);
  if(!rows.length)throw bad('Không tìm thấy đề thi.',404);
  if(req.body.open){
   // Opening another round always creates a new exam ID and separate statistics.
   const e=rows[0],p=await packFor(req,e.pack_id,true),id=crypto.randomUUID();
   if(p.content.questions.length<e.question_count)throw bad('Đề cương không đủ số câu.');
   if(p.content.questions.some(q=>!Number.isInteger(q.a)||q.a<0||q.a>=q.o.length))throw bad('Đề cương còn câu chưa có đáp án.');
   const [created]=await db.query('INSERT INTO ot_exams (id,pack_id,teacher_id,title,question_count,minutes,require_share) SELECT ?,pack_id,teacher_id,title,question_count,minutes,require_share FROM ot_exams WHERE id=? AND teacher_id=? AND is_open<>-1',[id,e.id,req.teacherId]);
   if(!created.affectedRows)throw bad('Không tìm thấy đề thi.',404);
   return res.json({success:true,id});
  }
  await db.query('UPDATE ot_exams SET is_open=0 WHERE id=? AND teacher_id=? AND is_open<>-1',[req.params.id,req.teacherId]);res.json({success:true,id:req.params.id});
 }));
 r.delete('/teacher/exams/:id',wrap(async(req,res)=>{
  const [result]=await db.query('UPDATE ot_exams SET is_open=-1 WHERE id=? AND teacher_id=? AND is_open<>-1',[req.params.id,req.teacherId]);
  if(!result.affectedRows)throw bad('Không tìm thấy đề thi hoặc không có quyền xoá.',404);
  res.json({success:true});
 }));
 r.get('/teacher/exams/:id/report',wrap(async(req,res)=>{
  const [exams]=await db.query('SELECT * FROM ot_exams WHERE id=? AND teacher_id=? AND is_open<>-1',[req.params.id,req.teacherId]);if(!exams.length)throw bad('Không có quyền xem.',403);
  const [expired]=await db.query('SELECT * FROM ot_exam_attempts WHERE exam_id=? AND submitted_at IS NULL AND deadline<=?',[req.params.id,Date.now()]);for(const a of expired)await finish(a);
  const [rows]=await db.query('SELECT id,student_code,full_name,class_code,started_at,deadline,submitted_at,last_seen,score FROM ot_exam_attempts WHERE exam_id=? ORDER BY class_code,full_name',[req.params.id]);
  const [events]=await db.query('SELECT ev.* FROM ot_exam_events ev JOIN ot_exam_attempts a ON a.id=ev.attempt_id WHERE a.exam_id=? ORDER BY ev.created_at',[req.params.id]);res.json({success:true,exam:exams[0],rows,events});
 }));
};
