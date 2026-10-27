'use strict';
(() => {
 const $ = id => document.getElementById(id);
 const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const capability = location.hash.slice(1);
 let data, loading = false, stopped = false;
 const date = value => value ? new Date(value).toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'}) : '—';
 function selectedRows() {
  const threshold = Math.max(1, Math.min(10000, Number($('threshold').value) || 3));
  return data.rows.filter(r => $('filter').value === 'none' ? Number(r.attempts) === 0 : $('filter').value === 'low' ? Number(r.attempts) > 0 && Number(r.attempts) < threshold : true)
   .sort((a,b) => Number(a.attempts)-Number(b.attempts) || a.full_name.localeCompare(b.full_name, 'vi'));
 }
 function render() {
  if (!data) return;
  $('title').textContent = data.title;
  $('scope').textContent = 'Lớp '+data.class_code+' · Chỉ xem · Tự cập nhật mỗi 60 giây';
  const learners = data.rows.filter(r => Number(r.attempts)>0).length;
  $('summary').innerHTML = `<span><b>${data.rows.length}</b> học sinh</span><span><b>${learners}</b> đã có lượt hoàn thành</span><span><b>${data.rows.length-learners}</b> chưa có lượt hoàn thành</span>`;
  const rows = selectedRows();
  $('count').textContent = 'Đang hiển thị '+rows.length+'/'+data.rows.length+' học sinh';
  $('rows').innerHTML = rows.map(r => `<tr><td>${escape(r.student_code)}</td><td>${escape(r.full_name)}</td>${['quiz_attempts','cloze_attempts','writing_attempts','speech_attempts','flashcard_attempts','attempts'].map(k => `<td>${Number(r[k]||0)}</td>`).join('')}<td>${r.best_quiz == null ? '—' : Number(r.best_quiz)}</td><td>${escape(date(r.last_practice))}</td></tr>`).join('') || '<tr><td colspan="10">Không có học sinh trong bộ lọc này.</td></tr>';
  $('report').hidden = false;
 }
 async function refresh() {
  if (loading || stopped) return;
  loading = true; $('refresh').disabled = true;
  try {
   if (!/^[a-f0-9]{64}$/.test(capability)) {stopped = true; throw Error('Link báo cáo không hợp lệ. Vui lòng xin lại link từ giáo viên bộ môn.');}
   const response = await fetch('/api/ot/shared-report', {headers:{Authorization:'Bearer '+capability}, cache:'no-store'});
   let result; try {result = await response.json();} catch {throw Error('Máy chủ chưa sẵn sàng. Vui lòng cập nhật lại.');}
   if (!response.ok || !result.success) {
    if ([401,403,404].includes(response.status)) {stopped = true; data = null; $('report').hidden = true; $('rows').textContent = ''; $('summary').textContent = ''; $('scope').textContent = ''; $('title').textContent = 'Báo cáo không còn khả dụng';}
    throw Error(result.message || 'Chưa thể cập nhật báo cáo.');
   }
   data = result; render(); $('status').textContent = 'Cập nhật thành công lúc '+date(data.updated_at);
  } catch (error) {
   $('status').textContent = error.message + (data ? ' Đang hiển thị dữ liệu cũ, cập nhật lúc '+date(data.updated_at)+'.' : '');
  } finally {loading = false; $('refresh').disabled = stopped;}
 }
 $('filter').onchange = render; $('threshold').oninput = render; $('refresh').onclick = refresh;
 $('copy').onclick = async () => {
  if (!data) return;
  const rows = selectedRows(), text = data.title+' — Lớp '+data.class_code+'\n'+$('filter').selectedOptions[0].textContent+($('filter').value==='low' ? ' (dưới '+$('threshold').value+' lượt)' : '')+'\nCập nhật: '+date(data.updated_at)+'\n'+(rows.map((r,i) => (i+1)+'. '+r.full_name+' ('+r.student_code+'): '+r.attempts+' lượt hoàn thành').join('\n') || 'Không có học sinh trong bộ lọc.');
  try {await navigator.clipboard.writeText(text); $('status').textContent = 'Đã sao chép danh sách.';} catch {window.prompt('Sao chép danh sách:', text);}
 };
 setInterval(() => {if (!document.hidden) refresh();}, 60000);
 document.addEventListener('visibilitychange', () => {if (!document.hidden) refresh();});
 refresh();
})();
