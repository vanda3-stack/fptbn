'use strict';
(() => {
 const root=document.getElementById('app'),choices=[['review','Ôn tập tại nhà'],['live','Ôn tập tại lớp'],['exam','Thi thử'],['print','Đề cương để in']];
 let records=[],busy=false;
 async function request(path='',body){
  const response=await fetch('/api/teacher/student-tab-access'+path,{method:body?'PUT':'GET',cache:'no-store',headers:{Authorization:'Bearer '+(sessionStorage.getItem('ot-teacher-token')||''),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  let data;try{data=await response.json();}catch{throw Error('Chưa tải được quyền học sinh. Vui lòng thử lại.');}
  if(!response.ok||!data.success)throw Error(data.message||'Không cập nhật được quyền học sinh.');return data;
 }
 function mount(){
  const heading=root.querySelector('.dashboard-heading');if(!heading||root.querySelector('#studentTabPermissions'))return;
  const panel=document.createElement('section');panel.id='studentTabPermissions';panel.className='teacher-permissions card';
  panel.innerHTML='<div class="teacher-section-title"><div><h2>Quyền truy cập của học sinh</h2><p>Chọn lớp trong năm học để cấu hình quyền. Học tại lớp luôn được mở.</p></div><button type="button" id="tabAccessReload">Tải lại</button></div><div class="permission-session"><label for="permissionClass">Chọn lớp<select id="permissionClass" disabled><option>Đang tải danh sách lớp</option></select></label><p>Trong 08:00–17:00, thứ Hai–thứ Sáu. Ngoài giờ, học sinh ôn tập bình thường.</p></div><form id="permissionForm"><fieldset disabled><div class="permission-options"><label class="permission-option permission-fixed"><span><strong>Học tại lớp</strong><small>Luôn cho phép</small></span><input type="checkbox" checked disabled aria-label="Học tại lớp luôn mở"></label>'+choices.map(([id,label])=>'<label class="permission-option"><span><strong>'+label+'</strong><small data-status-for="'+id+'">Đang khóa</small></span><input type="checkbox" data-permission="'+id+'" aria-label="Cho phép '+label+'"></label>').join('')+'</div><div class="permission-actions"><button type="button" id="permissionLockAll">Khóa các mục</button><button type="button" id="permissionOpenAll">Cho phép tất cả</button><button type="submit" class="primary">Lưu quyền cho lớp</button></div></fieldset><p id="permissionNotice" role="status" aria-live="polite">Chọn Tải lại để xem danh sách lớp trong năm học.</p></form><p class="permission-impact">Khóa mục đang mở sẽ đưa HS về Học tại lớp. Thời gian thi thử vẫn tiếp tục chạy.</p><a href="/x.html" target="_blank" rel="noopener">Mở trang giám sát lớp ↗</a>';
  heading.after(panel);
  const form=panel.querySelector('form'),select=panel.querySelector('select'),notice=panel.querySelector('#permissionNotice');
  const canEdit=()=>{const row=records.find(row=>row.class_code===select.value);return Boolean(row&&row.can_edit!==false);};
  const labels=()=>choices.forEach(([id])=>{panel.querySelector('[data-status-for="'+id+'"]').textContent=panel.querySelector('[data-permission="'+id+'"]').checked?'Được phép':'Đang khóa';});
  const display=()=>{
   const row=records.find(row=>row.class_code===select.value);form.querySelector('fieldset').disabled=!canEdit()||busy;
   choices.forEach(([id])=>{panel.querySelector('[data-permission="'+id+'"]').checked=Boolean(row?.permissions[id]);});labels();
   notice.textContent=!row?'Chưa có lớp trong danh sách.':row.state==='other_teacher'?'Lớp đang do giáo viên khác quản lý. Chưa thể đổi quyền.':row.state==='reconnecting'?'Đang chờ giáo viên kết nối lại lớp. Vui lòng tải lại sau.':row.state==='ready'?'Lưu trước quyền cho lớp này. Quyền sẽ áp dụng khi thầy cô mở lớp giám sát.':row.controlled?'Quyền áp dụng ngay cho học sinh trong lớp.':'Ngoài giờ học: học sinh truy cập bình thường. Quyền đã lưu áp dụng trong giờ học.';
  };
  select.onchange=display;panel.querySelector('#tabAccessReload').onclick=load;
  choices.forEach(([id])=>panel.querySelector('[data-permission="'+id+'"]').onchange=()=>{labels();notice.textContent='Có thay đổi chưa lưu.';});
  for(const [button,checked] of [['permissionLockAll',false],['permissionOpenAll',true]])panel.querySelector('#'+button).onclick=()=>{choices.forEach(([id])=>{panel.querySelector('[data-permission="'+id+'"]').checked=checked;});labels();notice.textContent='Có thay đổi chưa lưu.';};
  form.onsubmit=async event=>{
   event.preventDefault();if(busy||form.querySelector('fieldset').disabled||!canEdit())return;
   const code=select.value,tabs=Object.fromEntries(choices.map(([id])=>[id,panel.querySelector('[data-permission="'+id+'"]').checked]));
   busy=true;form.querySelector('fieldset').disabled=true;select.disabled=true;notice.textContent='Đang cập nhật quyền…';
   try{const data=await request('/'+encodeURIComponent(code),{tabs});const i=records.findIndex(row=>row.class_code===code);if(i>=0)records[i]=data.class;labels();notice.textContent='Đã lưu quyền cho lớp '+code+(data.applied?'.':'; áp dụng khi thầy cô mở lớp.');}
   catch(error){notice.textContent=error.message;}
   finally{busy=false;form.querySelector('fieldset').disabled=!canEdit();select.disabled=!records.length;}
  };
  panel.displayPermissions=display;
  panel.canEditPermissions=canEdit;
 }
 async function load(){
  mount();const panel=root.querySelector('#studentTabPermissions');if(!panel||busy)return;
  const select=panel.querySelector('select'),notice=panel.querySelector('#permissionNotice'),previous=select.value;
  busy=true;select.disabled=true;panel.querySelector('fieldset').disabled=true;notice.textContent='Đang tải danh sách lớp trong năm học…';
  try{const data=await request();records=data.classes;select.replaceChildren();for(const row of records){const option=document.createElement('option');option.value=row.class_code;option.textContent=row.class_code+' · '+({teaching:'Đang dạy',ready:'Chưa mở lớp',other_teacher:'GV khác đang dạy',reconnecting:'Đang nối lại'}[row.state]||'');select.append(option);}select.value=records.find(row=>row.class_code===previous)?.class_code||records.find(row=>row.state==='teaching')?.class_code||records[0]?.class_code||'';busy=false;panel.displayPermissions();}
  catch(error){records=[];notice.textContent=error.message;}
  finally{busy=false;select.disabled=!records.length;panel.querySelector('fieldset').disabled=!panel.canEditPermissions();}
 }
 window.FPTBNTabPermissions={mount,load};
})();
