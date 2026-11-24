'use strict';
(() => {
 const form=document.getElementById('analyticsFilters');if(!form)return;
 const report=document.getElementById('analyticsReport'),status=document.getElementById('analyticsStatus'),loadButton=document.getElementById('analyticsLoad'),exportButton=document.getElementById('analyticsExport');
 const from=document.getElementById('analyticsFrom'),to=document.getElementById('analyticsTo'),year=document.getElementById('analyticsYear');
 const day=ms=>new Date(ms+7*3600000).toISOString().slice(0,10);to.value=day(Date.now());from.value=day(Date.now()-29*86400000);from.max=to.max=to.value;
 let busy=false,lastQuery=null,generation=0;
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const numeric=value=>value==null?'—':Number(value).toLocaleString('vi-VN',{maximumFractionDigits:2});
 const timestamp=value=>value?new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'medium',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(value)):'Chưa có';
 const metric=(label,value,note,unit='')=>'<article class="analytics-metric"><span>'+label+'</span><strong>'+numeric(value)+(value==null?'':unit)+'</strong><small>'+note+'</small></article>';
 function controls(){loadButton.disabled=busy;exportButton.disabled=busy||!lastQuery;form.querySelectorAll('input,select').forEach(el=>{el.disabled=busy;});}
 function show(data){
  const m=data.metrics,r=data.runtime,values=data.daily.map(d=>Number(d.active_students)||0),max=Math.max(1,...values);
  const points=values.map((value,index)=>(20+index*920/Math.max(1,values.length-1)).toFixed(1)+','+(150-value/max*125).toFixed(1)).join(' ');
  const table=data.classes.map(row=>'<tr><td>'+escape(row.class_code)+(row.is_active?'':' <small>(đã đóng)</small>')+'</td><td>'+numeric(row.enrolled_students)+'</td><td>'+numeric(row.active_students)+'</td><td>'+numeric(row.practice_attempts)+'</td><td>'+numeric(row.exam_started)+'</td><td>'+numeric(row.exam_submitted)+'</td><td>'+numeric(row.live_answers)+'</td></tr>').join('');
  report.innerHTML='<div class="report-stamp"><strong>'+escape(data.year.name)+' · '+(data.filters.grade?'Khối '+data.filters.grade:'Tất cả khối')+'</strong><span>'+escape(data.filters.from)+' → '+escape(data.filters.to)+' · Giờ Việt Nam</span><small>Tổng hợp lúc '+timestamp(data.generated_at)+' · Đăng nhập bắt đầu ghi từ '+timestamp(data.tracking_since)+'</small></div>'+
   (data.warnings.length?'<div class="analytics-warnings"><strong>Phạm vi dữ liệu</strong><ul>'+data.warnings.map(text=>'<li>'+escape(text)+'</li>').join('')+'</ul></div>':'')+
   '<div class="analytics-metrics">'+[
    metric('HS có hoạt động',m.active_students,'Đếm mỗi HS một lần trong kỳ'),
    metric('HS có hoạt động học tập',m.learning_students,'Có bài ôn, lượt thi hoặc trả lời trên lớp'),
    metric('Độ phủ học tập',m.participation_percent,numeric(m.cohort_participants)+' / '+numeric(m.eligible_students)+' HS đang xếp lớp','%'),
    metric('Lượt ôn tập',m.practice_attempts,'Các lượt làm đã lưu trong kỳ'),
    metric('Bài thi đã nộp',m.exam_submitted,'Trong '+numeric(m.exam_started)+' lượt thi bắt đầu trong kỳ'),
    metric('Tỉ lệ nộp bài thi',m.exam_submission_percent,'Lượt đã nộp / lượt bắt đầu trong kỳ','%'),
    metric('Độ chính xác trắc nghiệm',m.quiz_accuracy_percent,'Câu đúng / câu có điểm hợp lệ khi ôn tập','%'),
    metric('Câu trả lời trên lớp',m.live_answers,'Đã được máy chủ lưu'),
    metric('GV đăng nhập',m.active_teachers,'Toàn hệ thống · '+numeric(m.teacher_logins)+' lượt trong kỳ'),
    metric('Đề cương được tạo',m.packs_created,numeric(m.content_teachers)+' GV tạo nội dung trong phạm vi'),
    metric('Lượt đăng nhập cổng HS',m.student_logins,'Chỉ từ khi bắt đầu thu thập'),
    metric('GV đang hoạt động',data.accounts.enabled_teachers,'Trên '+numeric(data.accounts.teachers)+' tài khoản hiện tại')
   ].join('')+'</div><section class="analytics-card"><div class="analytics-heading"><h3>HS có hoạt động theo ngày</h3><span>Cao nhất '+numeric(max===1&&!values.some(Boolean)?0:max)+' HS/ngày</span></div><svg class="activity-chart" viewBox="0 0 960 180" role="img" aria-label="Biểu đồ số học sinh có hoạt động theo ngày"><path d="M20 150H940" stroke="#cbd5e1" fill="none"/><polyline points="'+points+'" stroke="#2563eb" stroke-width="3" fill="none" stroke-linejoin="round"/><text x="20" y="175">'+escape(data.filters.from)+'</text><text x="940" y="175" text-anchor="end">'+escape(data.filters.to)+'</text></svg><details><summary>Xem số liệu theo ngày</summary><div class="table-wrapper"><table><thead><tr><th>Ngày</th><th>HS hoạt động</th><th>Lượt ôn</th><th>Lượt thi</th><th>Trả lời trên lớp</th></tr></thead><tbody>'+data.daily.map(row=>'<tr><td>'+escape(row.date)+'</td><td>'+numeric(row.active_students)+'</td><td>'+numeric(row.practice_attempts)+'</td><td>'+numeric(row.exam_started)+'</td><td>'+numeric(row.live_answers)+'</td></tr>').join('')+'</tbody></table></div></details></section>'+
   '<section class="analytics-card"><div class="analytics-heading"><h3>Hoạt động theo lớp</h3><span>'+numeric(data.accounts.active_classes)+' lớp đang hoạt động</span></div><div class="table-wrapper"><table><thead><tr><th>Lớp</th><th>HS đang xếp lớp</th><th>HS hoạt động</th><th>Lượt ôn</th><th>Lượt thi</th><th>Đã nộp</th><th>Trả lời trên lớp</th></tr></thead><tbody>'+(table||'<tr><td colspan="7">Chưa có lớp trong phạm vi.</td></tr>')+'</tbody></table></div></section>'+
   '<section class="analytics-card"><div class="analytics-heading"><h3>Trạng thái hệ thống tại thời điểm tổng hợp</h3><span>'+timestamp(r.sampled_at)+'</span></div><div class="runtime-grid">'+[
    metric('HS đang kết nối',r.online_students,'Không tính phiên đã mất kết nối'),metric('GV đang kết nối',r.online_teachers,'Các phiên giám sát lớp'),metric('Lớp đang mở',r.open_classes,'Có GV đang kết nối'),metric('Kết nối Socket.IO',r.socket_connections,'Tổng kết nối vật lý hiện tại'),metric('Phản hồi CSDL',r.database_ms,'Đo truy vấn kiểm tra',' ms'),metric('Bộ nhớ tiến trình',r.rss_mb,'Heap đang dùng '+numeric(r.heap_mb)+' MB',' MB'),metric('Thời gian tiến trình chạy',Math.floor(r.uptime_seconds/60),'Từ lần khởi động gần nhất',' phút'),metric('Yêu cầu API',r.http.requests,numeric(r.http.server_errors)+' lỗi 5xx · '+numeric(r.http.client_errors)+' phản hồi 4xx từ khi khởi động')
   ].join('')+'</div></section><details class="analytics-card report-definitions"><summary>Cách tính và phạm vi sử dụng số liệu</summary><ul>'+data.definitions.map(text=>'<li>'+escape(text)+'</li>').join('')+'</ul></details>';
  report.hidden=false;
 }
 async function load(event){
  event?.preventDefault();if(busy)return;
  const current=++generation,token=sessionStorage.getItem('fptbnAdminToken'),query=new URLSearchParams(new FormData(form)).toString();
  busy=true;lastQuery=null;report.hidden=true;controls();status.textContent='Đang tổng hợp số liệu…';
  try{
   const response=await fetch('/api/admin/analytics?'+query,{cache:'no-store'}),data=await response.json();
   if(current!==generation||token!==sessionStorage.getItem('fptbnAdminToken'))return;
   if(!response.ok||!data.success)throw Error(data.message||'Chưa tải được thống kê.');
   year.replaceChildren();for(const row of data.years){const option=document.createElement('option');option.value=row.id;option.textContent=row.name;year.append(option);}year.value=data.filters.year;
   show(data);lastQuery=new URLSearchParams({...data.filters,grade:data.filters.grade??''}).toString();status.textContent='Đã tổng hợp. Số liệu thiếu được hiển thị bằng dấu —; tệp CSV kèm thời điểm và cách tính.';
  }catch(error){if(current===generation){report.replaceChildren();report.hidden=true;lastQuery=null;status.textContent=error.message||'Chưa tải được thống kê. Vui lòng thử lại.';}}
  finally{if(current===generation){busy=false;controls();}}
 }
 form.addEventListener('submit',load);
 form.addEventListener('change',()=>{lastQuery=null;exportButton.disabled=true;status.textContent='Bộ lọc đã thay đổi. Bấm Xem thống kê để cập nhật trước khi xuất.';});
 exportButton.addEventListener('click',async()=>{
  if(busy||!lastQuery)return;busy=true;controls();const token=sessionStorage.getItem('fptbnAdminToken');
  try{
   const response=await fetch('/api/admin/analytics/export.csv?'+lastQuery,{cache:'no-store'});
   if(!response.ok){let data;try{data=await response.json();}catch{}throw Error(data?.message||'Chưa xuất được báo cáo.');}
   if(token!==sessionStorage.getItem('fptbnAdminToken'))return;
   const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='FPTBN-thong-ke-'+from.value+'-'+to.value+'.csv';document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);status.textContent='Đã xuất CSV tổng hợp kèm phạm vi và cách tính.';
  }catch(error){status.textContent=error.message;}
  finally{busy=false;controls();}
 });
 document.querySelector('[data-page="analytics"]').addEventListener('click',()=>{if(!lastQuery)void load();});
 window.addEventListener('fptbn-admin-logout',()=>{generation++;busy=false;lastQuery=null;report.replaceChildren();report.hidden=true;controls();});controls();
})();
