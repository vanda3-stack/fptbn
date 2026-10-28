'use strict';
(() => {
 const $ = id => document.getElementById(id);
 const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const capability = location.hash.slice(1);
 let data, loading = false, stopped = false;
 const date = value => value ? new Date(value).toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'}) : '—';
 function target() {return Math.max(2,Math.min(10000,Math.trunc(Number($('threshold').value)||3)));}
 function assess(row) {
  const quiz=Math.max(0,Number(row.quiz_attempts||0));
  const essay=['cloze_attempts','writing_attempts','speech_attempts'].reduce((sum,key)=>sum+Math.max(0,Number(row[key]||0)),0);
  const attempts=quiz+essay;
  const state=attempts===0?'none':quiz<target()||essay<target()?'low':'met';
  const labels=[];
  if(!quiz)labels.push('Chưa ôn TN');else if(quiz<target())labels.push('TN còn ít');
  if(!essay)labels.push('Chưa ôn TL');else if(essay<target())labels.push('TL còn ít');
  const label=state==='none'?'Chưa ôn tập':labels.join(' · ')||'Đã ôn cả hai phần';
  return {...row,quiz,essay,attempts,state,label};
 }
 function selectedRows() {
  const priorities={none:0,low:1,met:2},filter=$('filter').value;
  return data.rows.map(assess).filter(r=>r.state!=='met'&&(filter==='needs'||filter===r.state))
   .sort((a,b)=>priorities[a.state]-priorities[b.state]||a.attempts-b.attempts||a.full_name.localeCompare(b.full_name,'vi'));
 }
 function render() {
  if (!data) return;
  $('title').textContent = data.title;
  $('scope').textContent = 'Lớp '+data.class_code+' · Số lượt đã nộp từ đầu đợt';
  const all=data.rows.map(assess);
  $('summary').innerHTML = `<span><b>${all.filter(r=>r.state==='none').length}</b> chưa ôn tập</span><span><b>${all.filter(r=>r.state==='low').length}</b> ôn chưa đủ lượt</span><span><b>${all.filter(r=>r.state!=='met').length}/${all.length}</b> HS cần nhắc</span>`;
  const rows = selectedRows();
  $('count').textContent = 'Đang hiển thị '+rows.length+' HS cần nhắc · Ngưỡng '+target()+' lượt cho mỗi phần';
  const studentRow=r=>`<tr><td title="${escape(r.student_code+' · Ôn gần nhất: '+date(r.last_practice))}"><strong>${escape(r.full_name)}</strong><small>${escape(r.student_code)}</small></td><td class="gvcn-number ${r.quiz<target()?'gvcn-low':''}">${r.quiz}</td><td class="gvcn-number ${r.essay<target()?'gvcn-low':''}">${r.essay}</td><td><span class="gvcn-state ${r.state}">${escape(r.state==='none'?'Bắt đầu ôn cả TN và TL':r.label)}</span></td></tr>`;
  $('rows').innerHTML = ['none','low'].map(state=>{
   const group=rows.filter(r=>r.state===state);if(!group.length)return '';
   const title=state==='none'?'1. Chưa ôn tập':'2. Ôn chưa đủ lượt';
   return `<tr class="gvcn-group ${state}"><th colspan="4" scope="rowgroup">${title} <span>(${group.length} HS)</span></th></tr>`+group.map(studentRow).join('');
  }).join('') || '<tr><td colspan="4">Không có học sinh cần nhắc trong nhóm đang chọn.</td></tr>';
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
  const list=state=>group(state).map((r,i)=>(i+1)+'. '+r.full_name+' ('+r.student_code+'): '+'TN '+r.quiz+' lượt; TL '+r.essay+' lượt — '+r.label+'.').join('\n')||'Không có.';
  const text='BÁO CÁO ÔN TẬP — LỚP '+data.class_code+'\n'+data.title+'\nCập nhật: '+date(data.updated_at)+'\nToàn lớp: '+all.filter(r=>r.state==='none').length+' HS chưa ôn; '+all.filter(r=>r.state==='low').length+' HS còn thiếu hoặc ôn dưới '+target()+' lượt ở một trong hai phần.\n\nDanh sách cần nhắc theo nhóm đang chọn:\nCHƯA ÔN TẬP:\n'+list('none')+'\n\nÔN CHƯA ĐỦ LƯỢT (ngưỡng '+target()+' lượt/phần):\n'+list('low')+'\n\nKính nhờ thầy/cô GVCN thông báo và nhắc các HS chưa ôn hoặc ôn ít tiếp tục ôn tập, làm lại nhiều lần và học thuộc nội dung tự luận.';
  try {await navigator.clipboard.writeText(text); $('status').textContent = 'Đã sao chép danh sách.';} catch {window.prompt('Sao chép danh sách:', text);}
 };
 setInterval(() => {if (!document.hidden) refresh();}, 60000);
 document.addEventListener('visibilitychange', () => {if (!document.hidden) refresh();});
 refresh();
})();
