'use strict';
let reportSourceRows=[],reportTitle='',reportSelectedClass='',reportEssayRows=[],reportPackId='';
function reportFilteredRows(rows,classCode){return classCode?rows.filter(r=>r.class_code===classCode):rows.slice()}
report=async function(id){try{reportPackId=id;const d=await api('/teacher/packs/'+id+'/report');reportSourceRows=d.rows;reportTitle=d.title;reportEssayRows=d.essay_rows||[];reportSelectedClass='';drawClassReport()}catch(e){error(e)}};
function drawClassReport(){
 reportRows=reportFilteredRows(reportSourceRows,reportSelectedClass);
 const classNames=[...new Set(reportSourceRows.map(r=>r.class_code))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
 const assess=r=>{const quiz=Number(r.quiz_attempts||0),essay=['cloze_attempts','writing_attempts','speech_attempts'].reduce((n,k)=>n+Number(r[k]||0),0),active=quiz>=10&&essay>=10,labels=[];
 if(!quiz)labels.push('Chưa ôn TN');else if(quiz<10)labels.push('Ôn TN còn ít ('+quiz+'/10 lượt)');
 if(!essay)labels.push('Chưa ôn TL');else if(essay<10)labels.push('Ôn TL còn ít ('+essay+'/10 lượt)');
 return {...r,quiz,essay,state:active?'met':quiz+essay===0?'none':'low',label:active?'Em đã tích cực ôn tập, chúc em đạt điểm cao':labels.join(' · ')};};
 const priorities={none:0,low:1,met:2},rows=reportRows.map(assess).sort((a,b)=>priorities[a.state]-priorities[b.state]||(a.quiz+a.essay)-(b.quiz+b.essay)||a.full_name.localeCompare(b.full_name,'vi'));
 const score=n=>n==null?'—':Number(n).toLocaleString('vi-VN',{maximumFractionDigits:1});
 $('#app').innerHTML=`<button id="reportBack">← Bộ ôn</button><h1>${E(reportTitle)}</h1><div class="card"><div class="report-filterbar"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><label for="reportClass">Lọc theo lớp <select id="reportClass"><option value="">Tất cả các lớp (${classNames.length})</option>${classNames.map(c=>`<option value="${E(c)}" ${c===reportSelectedClass?'selected':''}>${E(c)}</option>`).join('')}</select></label><button id="reportShare" class="primary" ${reportSelectedClass?'':'disabled'}>Tạo link GVCN</button></div><button id="reportCSV">Tải CSV theo bộ lọc</button></div><div id="reportShareResult" role="status" style="margin-top:14px"></div><div class="report-summary"><span><b>${rows.length}</b>học sinh</span><span><b>${rows.filter(r=>r.state==='none').length}</b>chưa ôn</span><span><b>${rows.filter(r=>r.state==='low').length}</b>ôn ít</span></div><div class="table-wrap"><table><thead><tr><th>Học sinh</th><th>Lớp</th><th>Điểm TN</th>${(rows[0]?.question_scores||[]).map(q=>`<th>TL câu ${q.number}</th>`).join('')}<th>Cần nhắc</th></tr></thead><tbody>${rows.map(r=>`<tr><td><strong>${E(r.full_name)}</strong><br><small>${E(r.student_code)}</small></td><td>${E(r.class_code)}</td><td>${score(r.latest_quiz_score)}</td>${(r.question_scores||[]).map(q=>`<td>${score(q.score)}</td>`).join('')}<td>${E(r.label)}<br><small>TN: ${r.quiz} lượt${(r.question_scores||[]).map(q=>' · Câu '+q.number+': '+q.attempts+' lượt').join('')}</small></td></tr>`).join('')||'<tr><td colspan="7">Chưa có học sinh.</td></tr>'}</tbody></table></div><p class="muted">Mốc tích cực: 10 lượt TN và 10 lượt TL. Điểm TL tự viết tự động, tham khảo.</p></div>`;
 $('#reportBack').onclick=dashboard;$('#reportShare').onclick=()=>createClassReportLink();if(reportSelectedClass)createClassReportLink(true);
 $('#reportClass').onchange=e=>{reportSelectedClass=e.target.value;drawClassReport()};$('#reportCSV').onclick=()=>exportCSV();
}

function essayReportFiltered(){return reportFilteredRows(reportEssayRows,reportSelectedClass)}
function essayStatusHTML(status){if(!status||!status.total)return 'Chưa có dữ liệu';return `${status.matched}/${status.total} ${E(status.unit)} · ${status.completed?'Đạt':'Chưa đạt'} (cần ${status.required})`}
function essayReportHTML(){
 const rows=essayReportFiltered(),qs=[...new Map(rows.map(r=>[r.essay,r.question])).entries()];
 const kinds=[['cloze','Điền từ'],['writing','Viết cả câu'],['speech','Luyện nói']];
 return `<section class="card" style="margin-top:20px"><h2>Hoàn thành tự luận · Ngưỡng 80%</h2><p class="muted">Mỗi lượt kiểm tra đạt từ 80% số ý được tính 1 lần hoàn thành cho cách luyện đó. Điền từ: một ý đạt khi đúng tất cả ô trống của ý. Viết/nói: dựa trên ý khớp từ khóa để thống kê, không thay thế chấm nội dung của GV. Chỉ lật thẻ xem bài không tính hoàn thành.</p><button id="essayCSV">Tải CSV tự luận theo lớp</button><h3>Tổng hợp theo câu hỏi</h3><div class="table-wrap"><table><thead><tr><th>Câu hỏi</th><th>HS đã luyện / tổng</th>${kinds.map(([,label])=>`<th>${label}: HS đạt / tổng · Số lần đạt</th>`).join('')}</tr></thead><tbody>${qs.map(([i,q])=>{const rr=rows.filter(r=>r.essay===i);return `<tr><td><b>Câu ${i+1}.</b> ${E(q)}</td><td>${rr.filter(r=>r.attempts>0).length} / ${rr.length}</td>${kinds.map(([kind])=>`<td>${rr.filter(r=>r[kind+'_completed']>0).length} / ${rr.length} HS · <b>${rr.reduce((n,r)=>n+(r[kind+'_completed']||0),0)} lần</b></td>`).join('')}</tr>`}).join('')||'<tr><td colspan="5">Chưa có dữ liệu tự luận trong lớp đang lọc.</td></tr>'}</tbody></table></div><h3>Chi tiết từng học sinh và câu hỏi</h3><p class="muted">Mỗi ô hiển thị số lần đạt / số lượt đã luyện và kết quả gần nhất. Lần gần nhất chưa đạt không xoá các lần đã hoàn thành trước đó.</p><div class="table-wrap"><table><thead><tr><th>Mã HS · Họ tên</th><th>Lớp</th><th>Câu</th>${kinds.map(([,label])=>`<th>${label}</th>`).join('')}<th>Tổng lần đạt</th><th>Lần gần nhất</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${E(r.student_code)}<br>${E(r.full_name)}</td><td>${E(r.class_code)}</td><td>${r.essay+1}</td>${kinds.map(([kind])=>`<td><b>${r[kind+'_completed']||0} lần đạt</b> / ${kind==='speech'?r.speech_attempts||0:r[kind+'_attempts']||0} lượt luyện<br><small>Gần nhất: ${essayStatusHTML(r[kind+'_status'])}</small></td>`).join('')}<td><b>${r.completed||0}</b></td><td>${r.last_practice?E(new Date(r.last_practice).toLocaleString('vi-VN')):'—'}</td></tr>`).join('')||'<tr><td colspan="8">Chưa có học sinh trong bộ lọc này.</td></tr>'}</tbody></table></div></section>`;
}
function exportEssayCSV(){
 const rows=essayReportFiltered();if(!rows.length){alert('Bộ lọc hiện tại không có dữ liệu tự luận.');return}
 const fields=['student_code','full_name','class_code','essay','question','attempts','cloze_percent','writing_matched','writing_total','speech_attempts','speech_matched','speech_total','cloze_completed','writing_completed','speech_completed','completed','cloze_latest','writing_latest','speech_latest','last_practice'];
 const cell=x=>'"'+String(x??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
 const data=[['Mã HS','Họ tên','Lớp','Câu','Câu hỏi','Lượt luyện','% điền đúng gần nhất','Ý khớp từ khóa','Tổng ý viết','Lượt nói','Ý khớp khi nói','Tổng ý nói','Lần điền từ đạt','Lần viết đạt','Lần nói đạt','Tổng lần đạt','Điền từ gần nhất','Viết gần nhất','Nói gần nhất','Lần gần nhất'],...rows.map(r=>fields.map(k=>k==='essay'?r[k]+1:k.endsWith('_latest')?essayStatusHTML(r[k.replace('_latest','_status')]):r[k]))];
 const url=URL.createObjectURL(new Blob(['\uFEFF'+data.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='ghi-nho-tu-luan.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}


async function createClassReportLink(existingOnly=false){
 const classCode=reportSelectedClass,packId=reportPackId,button=$('#reportShare');
 if(!classCode)return;
 button.disabled=true;
 try{
  const d=existingOnly?await api('/teacher/packs/'+encodeURIComponent(packId)+'/report-link?class_code='+encodeURIComponent(classCode)):await api('/teacher/packs/'+encodeURIComponent(packId)+'/report-link',{class_code:classCode});
  if(reportPackId!==packId||reportSelectedClass!==classCode||!$('#reportShareResult'))return;
  if(!d.token)return;
  button.textContent='Link GVCN đã lưu';
  if(reportPackId!==packId||reportSelectedClass!==classCode||!$('#reportShareResult'))return;
  const url=new URL('/baocao-gvcn.html',location.origin);url.hash=d.token;
  const panel=$('#reportShareResult');
  panel.innerHTML=`<p>Link báo cáo lớp <b>${E(classCode)}</b> · Tự cập nhật mỗi phút. Gửi riêng cho GVCN.</p><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><input id="reportShareURL" aria-label="Link báo cáo GVCN" readonly style="flex:1 1 220px;min-width:0;width:auto;margin:0"><a id="reportShareOpen" target="_blank" rel="noopener noreferrer" style="white-space:nowrap;padding:10px 12px">Mở link ↗</a><button id="reportShareCopy" style="margin:0;white-space:nowrap">Sao chép</button><button id="reportShareRevoke" style="margin:0;white-space:nowrap">Thu hồi</button></div><p id="reportShareNotice" role="status"></p>`;
  $('#reportShareURL').value=url.href;$('#reportShareOpen').href=url.href;
  $('#reportShareCopy').onclick=async()=>{try{await navigator.clipboard.writeText(url.href);$('#reportShareNotice').textContent='Đã sao chép. Thầy/cô có thể gửi link qua Zalo.'}catch{const input=$('#reportShareURL');input.focus();input.select();$('#reportShareNotice').textContent='Nhấn giữ hoặc Ctrl/Cmd+C để sao chép link.'}};
  $('#reportShareRevoke').onclick=async()=>{if(!confirm('Thu hồi link lớp '+classCode+'? GVCN sẽ không mở được link cũ.'))return;try{await api('/teacher/packs/'+encodeURIComponent(packId)+'/report-link',{class_code:classCode},'DELETE');if(reportPackId===packId&&reportSelectedClass===classCode&&$('#reportShareResult')){$('#reportShareResult').textContent='Đã thu hồi link. Bấm Tạo link GVCN để cấp link mới.';$('#reportShare').textContent='Tạo link GVCN'}}catch(e){error(e)}};
 }catch(e){error(e)}finally{if(button.isConnected)button.disabled=false}
}
