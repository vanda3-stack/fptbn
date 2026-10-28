'use strict';
(() => {
 const $ = id => document.getElementById(id);
 const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const capability = location.hash.slice(1);
 let data, loading = false, stopped = false;
 const date = value => value ? new Date(value).toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'}) : '—';
 function target() {return Math.max(2,Math.min(10000,Math.trunc(Number($('threshold').value)||3)));}
 function assess(row) {
  const attempts=Math.max(0,Number(row.attempts||0)-Number(row.flashcard_attempts||0));
  const state=attempts===0?'none':attempts<target()?'low':'met';
  const label={none:'Chưa ôn tập',low:'Ôn tập ít lần',met:'Đã ôn nhiều lần'}[state];
  return {...row,attempts,state,label};
 }
 function selectedRows() {
  const priorities={none:0,low:1,met:2},filter=$('filter').value;
  return data.rows.map(assess).filter(r=>filter==='all'||filter==='needs'&&r.state!=='met'||filter===r.state)
   .sort((a,b)=>priorities[a.state]-priorities[b.state]||a.attempts-b.attempts||a.full_name.localeCompare(b.full_name,'vi'));
 }
 function render() {
  if (!data) return;
  $('title').textContent = data.title;
  $('scope').textContent = 'Lớp '+data.class_code+' · Ôn tập từ đầu đợt · Tự cập nhật mỗi 60 giây';
  const all=data.rows.map(assess),count=state=>all.filter(r=>r.state===state).length;
  $('summary').innerHTML = `<span><b>${all.length}</b> học sinh</span><span><b>${count('none')}</b> chưa ôn tập</span><span><b>${count('low')}</b> ôn tập ít lần</span><span><b>${count('met')}</b> đã ôn nhiều lần</span>`;
  const rows = selectedRows();
  $('count').textContent = 'Đang hiển thị '+rows.length+'/'+data.rows.length+' học sinh';
  $('rows').innerHTML = rows.map(r=>`<tr><td><strong>${escape(r.full_name)}</strong><br><small>${escape(r.student_code)}</small></td><td>${r.attempts}</td><td><span class="gvcn-state ${r.state}">${escape(r.label)}</span></td><td>${escape(date(r.attempts?r.last_practice:null))}</td></tr>`).join('') || '<tr><td colspan="4">Không có học sinh trong bộ lọc này.</td></tr>';
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
  const rows=selectedRows(),all=data.rows.map(assess),group=state=>rows.filter(r=>r.state===state);
  const list=state=>group(state).map((r,i)=>(i+1)+'. '+r.full_name+' ('+r.student_code+'): '+r.attempts+' lượt.').join('\n')||'Không có.';
  const text='BÁO CÁO ÔN TẬP — LỚP '+data.class_code+'\n'+data.title+'\nCập nhật: '+date(data.updated_at)+'\nToàn lớp: '+all.filter(r=>r.state==='none').length+' HS chưa ôn; '+all.filter(r=>r.state==='low').length+' HS ôn dưới '+target()+' lượt.\n\nTheo bộ lọc đang chọn:\nCHƯA ÔN TẬP:\n'+list('none')+'\n\nÔN TẬP ÍT LẦN (1–'+(target()-1)+' lượt):\n'+list('low')+($('filter').value==='all'||$('filter').value==='met'?'\n\nĐÃ ÔN NHIỀU LẦN:\n'+list('met'):'')+'\n\nKính nhờ thầy/cô GVCN thông báo và nhắc các HS chưa ôn hoặc ôn ít tiếp tục ôn tập, làm lại nhiều lần và học thuộc nội dung tự luận.';
  try {await navigator.clipboard.writeText(text); $('status').textContent = 'Đã sao chép danh sách.';} catch {window.prompt('Sao chép danh sách:', text);}
 };
 setInterval(() => {if (!document.hidden) refresh();}, 60000);
 document.addEventListener('visibilitychange', () => {if (!document.hidden) refresh();});
 refresh();
})();
