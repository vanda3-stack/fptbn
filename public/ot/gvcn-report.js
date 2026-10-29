'use strict';
(() => {
 const $ = id => document.getElementById(id);
 const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const capability = location.hash.slice(1);
 let data, loading = false, stopped = false;
 const date = value => value ? new Date(value).toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'}) : '—';
 const mobileStyle=document.createElement('style');
 mobileStyle.textContent=`.gvcn-mobile-table{width:100%!important;min-width:0!important;table-layout:auto;border-collapse:separate;border-spacing:0}
.gvcn-mobile-table thead{display:none!important}
.gvcn-mobile-table tbody{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;width:100%}
.gvcn-mobile-table tbody tr{display:grid!important;grid-template-columns:repeat(var(--gvcn-score-columns,4),minmax(0,1fr));align-content:start;gap:0;min-width:0;width:100%;padding:14px;border:1px solid #344d6b!important;border-radius:14px;background:#192a43!important;color:#eef5ff!important;box-sizing:border-box}
.gvcn-mobile-table tbody td{display:block;min-width:0!important;box-sizing:border-box;padding:8px 4px!important;overflow-wrap:break-word;white-space:normal;vertical-align:top;border:0!important;color:#e8f1ff!important;font-size:13px;line-height:1.45}
.gvcn-mobile-table tbody td:first-child{grid-column:1/-1;padding:2px 4px 9px!important;border-bottom:1px solid #38516d!important}
.gvcn-mobile-table tbody td:first-child strong{display:block;font-size:17px!important;line-height:1.4;color:#fff!important;font-weight:700;overflow-wrap:break-word}
.gvcn-mobile-table tbody td:first-child small{display:block;color:#b6cce5!important;font-size:12px!important;margin-top:2px}
.gvcn-mobile-table tbody td:nth-child(2){grid-column:1/-1;padding:9px 4px!important;border-bottom:1px solid #38516d!important}
.gvcn-mobile-table .gvcn-number{text-align:center;color:#fff!important;font-size:18px!important;font-weight:700;white-space:nowrap;padding:11px 1px 3px!important}
.gvcn-mobile-table .gvcn-number::before{display:none!important}
.gvcn-mobile-table .gvcn-score-heading{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:3px;color:#aac3e3!important;font-size:11px!important;font-weight:600;line-height:1.3;margin-bottom:4px;white-space:normal}
.gvcn-mobile-table .gvcn-score-heading small{color:#b6d6ff!important;font-size:10px!important;font-weight:500}
.gvcn-mobile-table .gvcn-number strong{display:block;color:#fff!important;font-size:inherit}
.gvcn-mobile-table .gvcn-state-full,.gvcn-mobile-table .gvcn-attempts-full{display:none!important}
.gvcn-mobile-table .gvcn-state-mobile{display:block!important;color:#ffcd91!important;font-size:13px!important;line-height:1.45;font-weight:600;white-space:normal}
.gvcn-mobile-table .gvcn-state-mobile.none{color:#ffaaa8!important}
.gvcn-mobile-table .gvcn-state-mobile.met{color:#96e5b9!important}
.gvcn-mobile-table tbody tr:has(td[colspan]){display:block}
@media(max-width:800px){.gvcn-mobile-table tbody{grid-template-columns:1fr}}
@media(max-width:650px){.gvcn-mobile-table tbody{gap:10px}.gvcn-mobile-table tbody tr{padding:12px}.gvcn-mobile-table tbody td:first-child strong{font-size:15px!important}.gvcn-mobile-table .gvcn-number{font-size:16px!important}}`;
 document.head.appendChild(mobileStyle);
 const threshold=10;
 const score=value=>value===null||value===undefined?'—':Number(value).toLocaleString('vi-VN',{maximumFractionDigits:1});
 function assess(row) {
  const quiz=Math.max(0,Number(row.quiz_attempts||0));
  const essay=['cloze_attempts','writing_attempts','speech_attempts'].reduce((sum,key)=>sum+Math.max(0,Number(row[key]||0)),0);
  const parts=[];
  if(row.has_quiz!==false)parts.push({name:'TN',attempts:quiz});
  if(row.essay_questions!==0)(row.question_scores||[]).forEach(q=>parts.push({name:'TL'+q.number,attempts:Math.max(0,Number(q.attempts)||0)}));
  const never=parts.filter(p=>p.attempts===0).map(p=>p.name);
  const few=parts.filter(p=>p.attempts>0&&p.attempts<threshold).map(p=>p.name);
  const active=parts.length>0&&parts.every(p=>p.attempts>=threshold);
  const state=active?'met':parts.every(p=>p.attempts===0)?'none':'low';
  const labels=[];
  if(never.length)labels.push('Chưa ôn: '+never.join(', '));
  if(few.length)labels.push('Cần ôn thêm: '+few.join(', '));
  return {...row,quiz,essay,attempts:quiz+essay,state,label:active?'Đã đủ lượt ôn các phần':labels.join(' · ')||'Chưa có nội dung ôn tập'};
 }
 function selectedRows() {
  const priorities={none:0,low:1,met:2};
  return data.rows.map(assess).sort((a,b)=>priorities[a.state]-priorities[b.state]||a.attempts-b.attempts||a.full_name.localeCompare(b.full_name,'vi'));
 }
 function render() {
  if (!data) return;
  $('title').textContent = data.title;
  $('scope').textContent = 'Lớp '+data.class_code;
  const rows=selectedRows();
  $('summary').innerHTML = `<span><b>${rows.length}</b> học sinh</span><span><b>${rows.filter(r=>r.state==='none').length}</b> chưa ôn</span><span><b>${rows.filter(r=>r.state==='low').length}</b> ôn ít</span>`;
  $('count').textContent = 'Danh sách toàn lớp · HS cần nhắc xếp trước · Mốc nhắc: 10 lượt/phần';
  const questions=rows[0]?.question_scores||[];
  const header=$('reportHead');if(header){header.innerHTML='<th>Học sinh</th><th>Cần nhắc</th><th>Điểm TN</th>'+questions.map(q=>`<th>TL câu ${q.number}</th>`).join('');
   const table=header.closest('table');if(table){table.classList.add('gvcn-mobile-table');table.style.setProperty('--gvcn-score-columns',String(questions.length+1));header.querySelectorAll('th').forEach(th=>th.style.removeProperty('width'));}
  }
  $('rows').innerHTML = rows.map(r=>`<tr><td title="${escape(r.student_code+' · Ôn gần nhất: '+date(r.last_practice))}"><strong>${escape(r.full_name)}</strong><small>${escape(r.student_code)}</small></td><td title="${escape(r.label)}"><span class="gvcn-state gvcn-state-full ${r.state}">${escape(r.label)}</span><small class="gvcn-attempts-full">TN: ${r.quiz} lượt${(r.question_scores||[]).map(q=>' · Câu '+q.number+': '+q.attempts+' lượt').join('')}</small><span class="gvcn-state-mobile ${r.state}" style="display:none">${escape(r.label)}</span></td><td class="gvcn-number" data-label="TN"><span class="gvcn-score-heading">TN <small>${r.quiz} lượt</small></span><strong>${score(r.latest_quiz_score)}</strong></td>${(r.question_scores||[]).map(q=>`<td class="gvcn-number" data-label="TL ${q.number}"><span class="gvcn-score-heading">TL${q.number} <small>${Math.max(0,Number(q.attempts)||0)} lượt</small></span><strong>${score(q.score)}</strong></td>`).join('')}</tr>`).join('') || '<tr><td colspan="6">Chưa có học sinh trong lớp.</td></tr>';
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
   data = result; render(); $('status').textContent = 'Cập nhật: '+date(data.updated_at);
  } catch (error) {
   $('status').textContent = error.message + (data ? ' Đang hiển thị dữ liệu cũ, cập nhật lúc '+date(data.updated_at)+'.' : '');
  } finally {loading = false; $('refresh').disabled = stopped;}
 }
 $('refresh').onclick = refresh;
 $('copy').onclick = async () => {
  if (!data) return;
  const rows=selectedRows().filter(r=>r.state!=='met');
  const list=rows.map((r,i)=>(i+1)+'. '+r.full_name+': TN '+r.quiz+' lượt, TL '+r.essay+' lượt; điểm TN '+score(r.latest_quiz_score)+'/10, TL phần 3 '+score(r.part3_essay_score)+'/10. Cần nhắc: '+r.label+'.').join('\n');
  const text='THÔNG BÁO ÔN TẬP — LỚP '+data.class_code+'\n'+data.title+'\nCập nhật: '+date(data.updated_at)+'\n\n'+(rows.length?'Kính nhờ thầy/cô GVCN nhắc các học sinh sau tiếp tục ôn tập:\n'+list+'\n\nCác con cần ôn lại nhiều lần cả trắc nghiệm và tự luận, luyện viết cả câu ở phần 3 để ghi nhớ nội dung. Mốc nhắc: dưới 10 lượt/phần.':'Cả lớp đã đủ lượt ôn theo mốc theo dõi.')+'\nĐiểm trên thang 10; TN: lượt nộp gần nhất; TL: lần viết/nói gần nhất từng câu ở phần 3, câu chưa làm tính 0. Điểm TL tự động chỉ mang tính tham khảo; — là chưa có dữ liệu chấm.';
  try {await navigator.clipboard.writeText(text); $('status').textContent = 'Đã sao chép thông báo GVCN.';} catch {window.prompt('Sao chép thông báo:', text);}
 };
 setInterval(() => {if (!document.hidden) refresh();}, 60000);
 document.addEventListener('visibilitychange', () => {if (!document.hidden) refresh();});
 refresh();
})();
