'use strict';
(() => {
 const form=document.getElementById('classroomAccessForm');
 const checkbox=document.getElementById('classroomAccessEnabled'),revision=document.getElementById('revisionPeriodEnabled');
 const modeState=document.getElementById('revisionPeriodState'),schoolState=document.getElementById('classroomAccessState');
 const summary=document.getElementById('classroomAccessSummary'),summaryTitle=document.getElementById('classroomAccessSummaryTitle'),summaryPanel=document.getElementById('classroomAccessSummaryPanel');
 const save=document.getElementById('classroomAccessSave'),reload=document.getElementById('classroomAccessReload'),message=document.getElementById('classroomAccessMessage');
 let busy=false,loaded=false,saved=null,operation=0,uncertain=false;
 const draft=()=>({enabled:checkbox.checked,revisionMode:revision.checked});
 const same=(a,b)=>a.enabled===b.enabled&&a.revisionMode===b.revisionMode;
 const dirty=()=>loaded&&saved&&!same(draft(),saved);
 function status(text,state=''){message.textContent=text;message.dataset.state=state;}
 function render(){
  revision.disabled=checkbox.disabled=busy||!loaded;save.disabled=busy||!loaded||!dirty();reload.disabled=busy;
  if(!loaded){
   modeState.textContent=schoolState.textContent=uncertain?'Chưa xác nhận':'Chưa tải';modeState.dataset.enabled=schoolState.dataset.enabled='false';modeState.dataset.state=schoolState.dataset.state='';
   summaryPanel.dataset.state='';summaryTitle.textContent='CHẾ ĐỘ ĐANG ÁP DỤNG';summary.textContent=busy?'Đang kiểm tra cài đặt hiện tại…':'Chưa xác nhận cài đặt đang áp dụng. Bấm Tải lại để kiểm tra.';return;
  }
  const preview=dirty(),value=draft();
  modeState.textContent=(preview?'Sẽ ':'Đang ')+(value.revisionMode?'bật':'tắt');
  schoolState.textContent=value.revisionMode?'Tạm bỏ qua khi ôn thi':(preview?'Sẽ ':'Đang ')+(value.enabled?'bật':'tắt');
  modeState.dataset.enabled=String(value.revisionMode);schoolState.dataset.enabled=String(value.enabled&&!value.revisionMode);
  modeState.dataset.state=schoolState.dataset.state=preview?'preview':'';summaryPanel.dataset.state=preview?'preview':'';
  summaryTitle.textContent=preview?'SAU KHI LƯU THAY ĐỔI':'CHẾ ĐỘ ĐANG ÁP DỤNG';
  summary.textContent=value.revisionMode?'HS được vào bất kỳ lúc nào, không cần GV mở lớp. Tất cả tab được mở phục vụ ôn tập.':value.enabled?'Trong 08:00–17:00, thứ Hai–thứ Sáu, HS cần GV mở lớp. Ngoài giờ HS được ôn tập bình thường; quyền từng tab giữ theo cấu hình đã lưu.':'HS được vào bất kỳ lúc nào mà không cần GV mở lớp. Quyền từng tab trong giờ học vẫn giữ theo cấu hình đã lưu.';
 }
 function apply(settings){saved={enabled:settings.enabled,revisionMode:settings.revisionMode};checkbox.checked=saved.enabled;revision.checked=saved.revisionMode;loaded=true;uncertain=false;}
 async function request(method,body){
  const token=sessionStorage.getItem('fptbnAdminToken');if(!token)throw Error('Vui lòng đăng nhập lại admin để quản lý cài đặt.');
  let response;try{response=await fetch('/api/admin/classroom-access',{method,cache:'no-store',headers:{Accept:'application/json',Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
  catch{throw Error('Chưa kết nối được máy chủ. Bấm Tải lại để kiểm tra.');}
  if(response.status===401)throw Error('Phiên admin hết hạn. Vui lòng đăng nhập lại.');
  let data;try{data=await response.json();}catch{throw Error(response.status===403?'Máy chủ đang chặn yêu cầu này. Bấm Tải lại để kiểm tra.':'Máy chủ chưa trả về cài đặt hợp lệ. Vui lòng tải lại sau khi cập nhật.');}
  if(sessionStorage.getItem('fptbnAdminToken')!==token)throw Error('Phiên admin đã thay đổi. Vui lòng tải lại cài đặt.');
  if(!response.ok||!data.success)throw Error(data.message||'Chưa xử lý được cài đặt. Vui lòng thử lại.');
  if(typeof data.settings?.enabled!=='boolean'||typeof data.settings?.revisionMode!=='boolean')throw Error('Cài đặt máy chủ chưa đúng phiên bản. Vui lòng cập nhật rồi tải lại.');
  return data.settings;
 }
 async function load(){
  if(busy)return;const current=++operation;busy=true;loaded=false;uncertain=false;render();status('Đang tải cài đặt…');
  try{const data=await request('GET');if(current!==operation)return;apply(data);status('Đã tải cài đặt hiện tại.');}
  catch(error){if(current===operation){uncertain=true;status(error.message,'error');}}
  finally{if(current===operation){busy=false;render();}}
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!loaded||!dirty())return;
  const current=++operation,target=draft();busy=true;render();save.textContent='Đang lưu…';status('Đang lưu và kiểm tra lại cài đặt…');
  try{
   await request('POST',target);
   // Verify the stored state with a separate read; never replay an unconfirmed write.
   const actual=await request('GET');if(current!==operation)return;apply(actual);
   if(same(actual,target))status('Đã lưu và xác nhận cài đặt.','success');
   else status('Máy chủ đang có cài đặt khác. Đã tải trạng thái hiện tại; vui lòng kiểm tra trước khi lưu lại.','error');
  }catch(error){if(current===operation){loaded=false;saved=null;uncertain=true;status('Chưa xác nhận việc lưu. Bấm Tải lại để kiểm tra. '+error.message,'error');}}
  finally{if(current===operation){busy=false;save.textContent='Lưu thay đổi';render();}}
 });
 for(const input of [revision,checkbox])input.addEventListener('change',()=>{render();status(dirty()?'Thay đổi chưa được lưu.':'Cài đặt trùng với trạng thái đã lưu.',dirty()?'dirty':'');});
 reload.addEventListener('click',load);document.querySelector('.menu-item[data-page="settings"]').addEventListener('click',load);
 window.addEventListener('fptbn-admin-logout',()=>{operation++;busy=false;loaded=false;saved=null;uncertain=false;checkbox.checked=revision.checked=false;save.textContent='Lưu thay đổi';status('');render();});
 render();
})();
