'use strict';
const crypto = require('node:crypto');

// Each capability grants read-only access to one pack and one class.
module.exports = function mountReportSharing({r, db, teacher, packFor, wrap, bad, schema, reportData, token}) {
 let ready;
 function ensureLinks() {
  if (!ready) ready = db.query(`CREATE TABLE IF NOT EXISTS ot_report_links (
   pack_id CHAR(36) NOT NULL, class_id INT NOT NULL, token CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
   PRIMARY KEY(pack_id,class_id), UNIQUE KEY ot_report_token(token)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(e => {ready = null; throw e;});
  return ready;
 }
 async function selectedClass(req, pack) {
  const code = req.body?.class_code;
  if (typeof code !== 'string' || !code.trim() || code.length > 100) throw bad('Vui lòng chọn một lớp để tạo link.');
  const [rows] = await db.query('SELECT id,class_code FROM classes WHERE class_code=? AND school_year_id=? AND is_active=1', [code, pack.year_id]);
  const allowed = rows.filter(c => pack.classes.includes(c.id));
  if (allowed.length !== 1) throw bad('Lớp không thuộc bộ ôn này.', 403);
  return allowed[0];
 }
 r.post('/teacher/packs/:id/report-link', teacher, wrap(async (req, res) => {
  const pack = await packFor(req, req.params.id, true), selected = await selectedClass(req, pack);
  await ensureLinks();
  // Repeated clicks reuse the link, so previously sent links keep working.
  await db.query('INSERT INTO ot_report_links (pack_id,class_id,token) VALUES (?,?,?) ON DUPLICATE KEY UPDATE pack_id=VALUES(pack_id)', [pack.id, selected.id, crypto.randomBytes(32).toString('hex')]);
  const [rows] = await db.query('SELECT token FROM ot_report_links WHERE pack_id=? AND class_id=?', [pack.id, selected.id]);
  res.json({success:true, token:rows[0].token});
 }));
 r.delete('/teacher/packs/:id/report-link', teacher, wrap(async (req, res) => {
  const pack = await packFor(req, req.params.id, true), selected = await selectedClass(req, pack);
  await ensureLinks();
  await db.query('DELETE FROM ot_report_links WHERE pack_id=? AND class_id=?', [pack.id, selected.id]);
  res.json({success:true});
 }));
 r.get('/shared-report', wrap(async (req, res) => {
  const capability = token(req);
  if (!/^[a-f0-9]{64}$/.test(capability)) throw bad('Link báo cáo không hợp lệ hoặc đã bị thu hồi.', 404);
  await schema(); await ensureLinks();
  const [links] = await db.query(`SELECT l.pack_id,l.class_id,c.class_code FROM ot_report_links l
   JOIN ot_packs p ON p.id=l.pack_id JOIN teachers t ON t.id=p.teacher_id AND t.is_active=1
   JOIN classes c ON c.id=l.class_id AND c.school_year_id=p.year_id AND c.is_active=1
   WHERE l.token=?`, [capability]);
  if (!links.length) throw bad('Link báo cáo không hợp lệ hoặc đã bị thu hồi.', 404);
  const link = links[0];
  const [packs] = await db.query('SELECT * FROM ot_packs WHERE id=?', [link.pack_id]);
  if (!packs.length) throw bad('Bộ ôn không còn tồn tại.', 404);
  const pack = {...packs[0], classes:JSON.parse(packs[0].classes_json)};
  if (!pack.classes.includes(link.class_id)) throw bad('Lớp không còn được giao bộ ôn này.', 403);
  // Never accept a pack/class scope from the reader. No answers or essay texts are returned.
  const data = await reportData(pack, [link.class_id], false);
  res.json({...data, class_code:link.class_code, updated_at:new Date().toISOString()});
 }));
};
