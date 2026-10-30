'use strict';
const crypto=require('crypto');
const multer=require('multer');
const XLSX=require('xlsx');
module.exports=function({r,db,teacher,wrap,bad}){
 let ready;
 const schema=()=>ready||(ready=db.query("CREATE TABLE IF NOT EXISTS ot_live_sets (id CHAR(36) PRIMARY KEY,teacher_id INT NOT NULL,title VARCHAR(200) NOT NULL,questions_json LONGTEXT NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX live_set_teacher(teacher_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").catch(e=>{ready=null;throw e}));
 const columns=['STT','Câu hỏi','Đáp án A','Đáp án B','Đáp án C','Đáp án D','Đáp án đúng'];
 const makeSheet=()=>{const ws=XLSX.utils.aoa_to_sheet([columns,[1,'Thiết bị nào là thiết bị nhập?','Màn hình','Bàn phím','Máy in','Loa','B'],[2,'1 KB tương đương bao nhiêu byte?','100','1000','1024','2048','C']]);ws['!cols']=[{wch:7},{wch:65},{wch:27},{wch:27},{wch:27},{wch:27},{wch:15}];return ws};
 r.get('/live/template',teacher,wrap(async(req,res)=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,makeSheet(),'Cau hoi');const buffer=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.set('Content-Disposition','attachment; filename="Mau-cau-hoi-on-tap-tai-lop.xlsx"');res.send(buffer)}));
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024},fileFilter:(req,file,cb)=>cb(null,/\.xlsx$/i.test(file.originalname))}).single('file');
 r.post('/live/sets/import',teacher,(req,res,next)=>upload(req,res,e=>{if(e)return res.status(400).json({success:false,message:'Chỉ nhận file .xlsx tối đa 2MB.'});next()}),wrap(async(req,res)=>{
  if(!req.file)throw bad('Vui lòng chọn file Excel .xlsx theo mẫu.');
  let wb;try{wb=XLSX.read(req.file.buffer,{type:'buffer'})}catch{throw bad('Không thể đọc file Excel.')}
  const ws=wb.Sheets[wb.SheetNames[0]];if(!ws)throw bad('File Excel chưa có dữ liệu.');
  const data=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false,blankrows:false});
  if(data.length<2)throw bad('File cần tối thiểu một câu hỏi.');
  if(columns.some((v,i)=>String(data[0][i]||'').trim()!==v))throw bad('Sai tiêu đề cột. Hãy tải mẫu mới và giữ nguyên hàng đầu tiên.');
  const questions=[];const errors=[];
  for(let i=1;i<data.length;i++){
   const row=data[i],fields=row.slice(1,7).map(x=>String(x??'').trim());
   if(fields.every(x=>!x))continue;
   const [q,...opts]=fields.slice(0,5),key=fields[5].toUpperCase();
   if(!q||q.length>3000||opts.length!==4||opts.some(o=>!o||o.length>1500)||!/^[ABCD]$/.test(key)){errors.push('Dòng '+(i+1)+': thiếu câu hỏi, phương án A–D hoặc đáp án đúng A/B/C/D.');continue}
   questions.push({q,o:opts,a:key.charCodeAt(0)-65});
  }
  if(errors.length)throw bad(errors.slice(0,8).join(' ')+(errors.length>8?' Và '+(errors.length-8)+' lỗi khác.':''));
  if(questions.length<1||questions.length>200)throw bad('Một bộ phải có 1–200 câu hỏi.');
  const title=String(req.body?.title||'').trim();if(!title||title.length>200)throw bad('Tên bộ câu hỏi phải có 1–200 ký tự.');
  await schema();const id=crypto.randomUUID();await db.query('INSERT INTO ot_live_sets(id,teacher_id,title,questions_json) VALUES (?,?,?,?)',[id,req.teacherId,title,JSON.stringify(questions)]);
  res.json({success:true,id,title,count:questions.length});
 }));
 r.post('/live/sets/text',teacher,wrap(async(req,res)=>{
  const title=String(req.body?.title||'').trim();
  if(!title||title.length>200)throw bad('Vui lòng nhập tên bộ câu hỏi tối đa 200 ký tự.');
  let questions;try{questions=require('./live-text-parser').parse(req.body?.text)}catch(error){throw bad(error.message)}
  await schema();const id=crypto.randomUUID();
  await db.query('INSERT INTO ot_live_sets(id,teacher_id,title,questions_json) VALUES (?,?,?,?)',[id,req.teacherId,title,JSON.stringify(questions)]);
  res.json({success:true,id,title,count:questions.length});
 }));
 r.get('/live/sets',teacher,wrap(async(req,res)=>{await schema();const [rows]=await db.query('SELECT id,title,JSON_LENGTH(questions_json) question_count,created_at FROM ot_live_sets WHERE teacher_id=? ORDER BY created_at DESC',[req.teacherId]);res.json({success:true,sets:rows})}));
 r.delete('/live/sets/:id',teacher,wrap(async(req,res)=>{await schema();const [used]=await db.query('SELECT id FROM ot_live_games WHERE pack_id=? LIMIT 1',[req.params.id]);if(used.length)throw bad('Bộ câu hỏi đã có lịch sử trò chơi, không thể xóa.',409);const [result]=await db.query('DELETE FROM ot_live_sets WHERE id=? AND teacher_id=?',[req.params.id,req.teacherId]);if(!result.affectedRows)throw bad('Không tìm thấy bộ câu hỏi.',404);res.json({success:true})}));
};