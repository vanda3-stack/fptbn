'use strict';
(() => {
 const $ = id => document.getElementById(id);
 const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const capability = location.hash.slice(1);
 let data, loading = false, stopped = false;
 const date = value => value ? new Date(value).toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'}) : '—';
 const mobileStyle=document.createElement('style');
 mobileStyle.textContent=`@media(max-width:650px){
 .gvcn-mobile-table{width:100%!important;min-width:0!important;table-layout:fixed;border-collapse:collapse}
 .gvcn-mobile-table th,.gvcn-mobile-table td{box-sizing:border-box;min-width:0!important;overflow-wrap:anywhere;word-break:normal;padding:8px 4px!important;font-size:11px;line-height:1.35;vertical-align:top}
 .gvcn-mobile-table th{font-size:10px;white-space:normal}
 .gvcn-mobile-table th:first-child,.gvcn-mobile-table td:first-child{padding-left:5px!important}
 .gvcn-mobile-table td:first-child strong{display:block;font-size:11px;line-height:1.35;overflow-wrap:anywhere}
 .gvcn-mobile-table td:first-child small{display:block;font-size:10px}
 .gvcn-mobile-table .gvcn-number{text-align:center;font-size:11px;white-space:nowrap;padding-left:1px!important;padding-right:1px!important}
 .gvcn-mobile-table .gvcn-state-full,.gvcn-mobile-table .gvcn-attempts-full{display:none!important}
 .gvcn-mobile-table .gvcn-state-mobile{display:block!important;white-space:normal;font-size:10px;line-height:1.4;font-weight:600}
 }`;
 document.head.appendChild(mobileStyle);
 const threshold=10;
 const score=value=>value===null||value===undefined?'—':Number(value).toLocaleString('vi-VN',{maximumFractionDigits:1});
 function assess(row) {
  const quiz=Math.max(0,Number(row.quiz_attempts||0));
  const essay=['cloze_attempts','writing_attempts','speech_attempts'].reduce((sum,key)=>sum+Math.max(0,Number(row[key]||0)),0);
  const labels=[];
  if(row.has_quiz!==false){if(!quiz)labels.push('Chưa ôn TN');else if(quiz<threshold)labels.push('Ôn TN còn ít ('+quiz+'/10 lượt)');}
  if(row.essay_questions!==0){if(!essay)labels.push('Chưa ôn TL');else if(essay<threshold)labels.push('Ôn TL còn ít ('+essay+'/10 lượt)');
   if(essay&&row.part3_questions_done<row.essay_questions)labels.push('Viết cả câu: '+row.part3_questions_done+'/'+row.essay_questions+' câu');}
  const active=quiz>=threshold&&essay>=threshold;
  const state=active?'met':quiz+essay===0?'none':'low';
  return {...row,quiz,essay,attempts:quiz+essay,state,label:active?'Em đã tích cực ôn tập, chúc em đạt điểm cao':labels.join(' · ')};
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
   const table=header.closest('table');if(table){table.classList.add('gvcn-mobile-table');const width=(42/(questions.length+1)).toFixed(3)+'%';header.querySelectorAll('th').forEach((th,i)=>{th.style.width=i===0?'29%':i===1?'29%':width;});}
  }
  $('rows').innerHTML = rows.map(r=>`<tr><td title="${escape(r.student_code+' · Ôn gần nhất: '+date(r.last_practice))}"><strong>${escape(r.full_name)}</strong><small>${escape(r.student_code)}</small></td><td title="${escape(r.label)}"><span class="gvcn-state gvcn-state-full ${r.state}">${escape(r.label)}</span><small class="gvcn-attempts-full">TN: ${r.quiz} lượt${(r.question_scores||[]).map(q=>' · Câu '+q.number+': '+q.attempts+' lượt').join('')}</small><span class="gvcn-state-mobile" style="display:none">${r.state==='met'?'Đã đủ lượt':r.state==='none'?'Chưa ôn':'Ôn ít'}<br>TN ${r.quiz}/10 · TL ${r.essay}/10</span></td><td class="gvcn-number">${score(r.latest_quiz_score)}</td>${(r.question_scores||[]).map(q=>`<td class="gvcn-number">${score(q.score)}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="6">Chưa có học sinh trong lớp.</td></tr>';
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
