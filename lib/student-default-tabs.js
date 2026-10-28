'use strict';
module.exports = function mountLandingTabs(app, { db, teacherTokens }) {
  const allowed = new Set(['class', 'review', 'exam', 'print']);
  let schemaPromise;
  function ensureSchema() {
    if (!schemaPromise) schemaPromise = db.query(`CREATE TABLE IF NOT EXISTS student_default_tabs (
      grade_level TINYINT UNSIGNED PRIMARY KEY,
      tab_key VARCHAR(16) NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(error => { schemaPromise = null; throw error; });
    return schemaPromise;
  }
  async function handler(req, res, fn) {
    try { await ensureSchema(); await fn(); }
    catch (error) { console.error('Landing tabs:', error); res.status(500).json({success:false,message:'Không thể tải hoặc lưu cài đặt trang mặc định.'}); }
  }
  async function requireTeacher(req, res, next) {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const session = teacherTokens.get(token);
    if (!session || Date.now() - session.createdAt > 8*3600000) return res.status(401).json({success:false,message:'Phiên giáo viên hết hạn.'});
    try {
      const [rows] = await db.query('SELECT id FROM teachers WHERE id=? AND is_active=1 LIMIT 1',[session.teacherId]);
      if (!rows.length) return res.status(403).json({success:false,message:'Tài khoản giáo viên không còn hoạt động.'});
      next();
    } catch (e) { console.error(e); res.status(500).json({success:false,message:'Lỗi xác thực giáo viên.'}); }
  }
  app.get('/api/student/default-tab', (req,res) => {
    const grade = Number(req.query.grade);
    if (!Number.isInteger(grade) || grade < 6 || grade > 9) return res.status(400).json({success:false,message:'Khối không hợp lệ.'});
    res.set('Cache-Control','no-store');
    handler(req,res,async()=>{
      const [rows] = await db.query('SELECT tab_key FROM student_default_tabs WHERE grade_level=?',[grade]);
      res.json({success:true,grade,tab:allowed.has(rows[0]?.tab_key)?rows[0].tab_key:'class'});
    });
  });
  app.get('/api/teacher/default-tabs', requireTeacher, (req,res)=>{
    res.set('Cache-Control','no-store');
    handler(req,res,async()=>{
      const [rows] = await db.query('SELECT grade_level,tab_key FROM student_default_tabs WHERE grade_level BETWEEN 6 AND 9');
      const tabs = Object.fromEntries([6,7,8,9].map(g=>[g,'class']));
      for(const row of rows) if(allowed.has(row.tab_key)) tabs[row.grade_level] = row.tab_key;
      res.json({success:true,tabs});
    });
  });
  app.put('/api/teacher/default-tabs',requireTeacher,(req,res)=>handler(req,res,async()=>{
    const input=req.body?.tabs;
    if (!input || typeof input!=='object' || [6,7,8,9].some(g=>!allowed.has(input[g]))) return res.status(400).json({success:false,message:'Chọn trang mặc định hợp lệ cho cả 4 khối.'});
    for(const grade of [6,7,8,9]) await db.query(
      'INSERT INTO student_default_tabs (grade_level,tab_key) VALUES (?,?) ON DUPLICATE KEY UPDATE tab_key=VALUES(tab_key)',[grade,input[grade]]);
    res.json({success:true,tabs:Object.fromEntries([6,7,8,9].map(g=>[g,input[g]]))});
  }));
};
