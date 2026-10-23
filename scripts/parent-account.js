'use strict';
require('dotenv').config();
const db=require('../config/database');
const accounts=require('../lib/parent-accounts');
(async()=>{try{
 const code=String(process.env.OT_PARENT_CODE||'').trim().toUpperCase();
 const password=process.env.OT_PARENT_PASSWORD||'';
 if(!/^[A-Z0-9_-]{3,40}$/.test(code)||password.length<10||password.length>128)throw Error('Cần OT_PARENT_CODE là Mã HS gốc và OT_PARENT_PASSWORD dài 10–128 ký tự.');
 const [rows]=await db.query('SELECT id FROM students WHERE student_code=? AND is_active=1',[code]);
 if(rows.length!==1)throw Error('Không tìm thấy duy nhất một HS đang hoạt động.');
 await accounts.schema(db);
 await db.query('INSERT INTO ot_parent_accounts (student_id,password_hash) VALUES (?,?) ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash)',[rows[0].id,await accounts.hash(password)]);
 console.log('Đã tạo/đổi mật khẩu tài khoản '+code+'PH. Phiên PH cũ sẽ bị thu hồi trong tối đa 30 giây.');
 }catch(e){console.error(e.message);process.exitCode=1}finally{await db.end()}})();
