'use strict';
(() => {
 const $ = id => document.getElementById(id);
 const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const capability = location.hash.slice(1);
 let data, loading = false, stopped = false;
 const date = value => value ? new Date(value).toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'}) : '—';
 function target() {return Math.max(1,Math.min(100,Math.trunc(Number($('threshold').value)||3)));}
 function assess(row) {
  const questions=row.recall_questions||[], total=questions.length;
  const attempts=questions.reduce((sum,q)=>sum+q.attempts,0);
  const full=questions.filter(q=>q.latest&&q.latest.total>0&&q.latest.matched===q.latest.total).length;
  const repeated=questions.filter(q=>q.passed>=target()).length;
  const needs=questions.filter(q=>!q.latest||q.latest.total<=0||q.latest.matched!==q.latest.total||q.passed<target());
  const state=!total?'empty':!attempts?'none':full<total?'content':repeated<total?'low':'met';
  const label={empty:'Chưa có tự luận',none:'Chưa tự kiểm tra',content:'Cần ôn đủ ý',low:'Cần ôn lặp lại',met:'Đạt mục tiêu ôn'}[state];
  const last=questions.map(q=>q.latest?.at).filter(Boolean).sort((a,b)=>new Date(b)-new Date(a))[0];
  return {...row,questions,total,attempts,full,repeated,needs,state,label,last};
 }
 function selectedRows() {
  const priorities={none:0,content:1,low:2,met:3,empty:4},filter=$('filter').value;
  return data.rows.map(assess).filter(r=>filter==='all'||filter==='needs'&&['none','content','low'].includes(r.state)||filter===r.state)
   .sort((a,b)=>priorities[a.state]-priorities[b.state]||a.full-b.full||a.repeated-b.repeated||a.full_name.localeCompare(b.full_name,'vi'));
 }
 function reason(r) {
  if(r.state==='none')return 'Chưa có lượt viết/nói tự kiểm tra.';
  if(r.state==='empty')return 'Bộ ôn chưa có câu tự luận.';
  if(r.state==='met')return 'Duy trì ôn tập và kiểm tra lại.';
  return 'Cần ôn thêm câu '+r.needs.map(q=>q.number).join(', ')+'.';
 }
 function detail(r) {
  if(!r.total)return '';
  return `<details><summary>Xem từng câu</summary><ul>${r.questions.map(q=>`<li>Câu ${q.number}: ${q.passed}/${target()} lượt đạt; gần nhất ${q.latest&&q.latest.total>0?q.latest.matched+'/'+q.latest.total+' ý':'chưa có kết quả đủ dữ liệu'}.</li>`).join('')}</ul></details>`;
 }
 function render() {
  if (!data) return;
  $('title').textContent = data.title;
  $('scope').textContent = 'Lớp '+data.class_code+' · Ôn tự luận từ đầu đợt · Tự cập nhật mỗi 60 giây';
  const all=data.rows.map(assess),count=state=>all.filter(r=>r.state===state).length;
  $('summary').innerHTML = `<span><b>${all.length}</b> học sinh</span><span><b>${count('none')}</b> chưa tự kiểm tra</span><span><b>${count('content')+count('low')}</b> cần ôn thêm</span><span><b>${count('met')}</b> đạt mục tiêu ôn</span>`;
  const rows = selectedRows();
  $('count').textContent = 'Đang hiển thị '+rows.length+'/'+data.rows.length+' học sinh';
  $('rows').innerHTML = rows.map(r=>`<tr><td><strong>${escape(r.full_name)}</strong><br><small>${escape(r.student_code)}</small></td><td>${r.attempts}</td><td>${r.full}/${r.total}</td><td>${r.repeated}/${r.total}</td><td><span class="gvcn-state ${r.state}">${escape(r.label)}</span><p>${escape(reason(r))}</p>${detail(r)}</td><td>${escape(date(r.last))}</td></tr>`).join('') || '<tr><td colspan="6">Không có học sinh trong bộ lọc này.</td></tr>';
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
  const rows=selectedRows(),all=data.rows.map(assess);
  const text='BÁO CÁO ÔN TỰ LUẬN — LỚP '+data.class_code+'\n'+data.title+'\nCập nhật: '+date(data.updated_at)+'\nMục tiêu mỗi câu: '+target()+' lượt viết/nói đạt ≥80% ý; lần gần nhất đủ ý theo hệ thống.\nĐạt mục tiêu: '+all.filter(r=>r.state==='met').length+'/'+all.length+' HS.\n\n'+$('filter').selectedOptions[0].textContent+':\n'+(rows.map((r,i)=>(i+1)+'. '+r.full_name+': '+r.label+'; đủ ý '+r.full+'/'+r.total+' câu; ôn lặp đủ '+r.repeated+'/'+r.total+' câu. '+reason(r)).join('\n')||'Không có học sinh trong bộ lọc.')+'\n\nKính nhờ GVCN nhắc các con tự viết/nói lại, bổ sung ý thiếu và ôn lặp từng câu. Kết quả tự động để tham khảo; GV/PH kiểm tra lại việc học thuộc.';
  try {await navigator.clipboard.writeText(text); $('status').textContent = 'Đã sao chép danh sách.';} catch {window.prompt('Sao chép danh sách:', text);}
 };
 setInterval(() => {if (!document.hidden) refresh();}, 60000);
 document.addEventListener('visibilitychange', () => {if (!document.hidden) refresh();});
 refresh();
})();
