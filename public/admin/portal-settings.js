'use strict';
(() => {
 const root=document.getElementById('adminDefaultTabsMount');if(!root)return;
 const grades=[3,4,5,6,7,8,9,10,11,12];
 const choices=[['class','Học tại lớp'],['review','Ôn tập tại nhà'],['live','Ôn tập tại lớp'],['exam','Thi thử'],['print','Đề cương để in']];
 async function request(url,body){
  let response;
  try{response=await fetch(url,{method:body?'POST':'GET',cache:'no-store',headers:{Accept:'application/json',Authorization:'Bearer '+(sessionStorage.getItem('fptbnAdminToken')||''),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
  catch{throw Error(body?'Chưa xác nhận được việc lưu. Bấm Tải lại để kiểm tra.':'Chưa kết nối được máy chủ. Vui lòng bấm Tải lại.');}
  if(response.status===401)throw Error('Phiên admin hết hạn. Vui lòng đăng nhập lại.');
  let data;try{data=await response.json();}catch{throw Error('Chưa tải được dữ liệu. Vui lòng tải lại sau khi cập nhật máy chủ.');}
  if(!response.ok||!data.success)throw Error(data.message||'Chưa xử lý được cài đặt. Vui lòng thử lại.');
  return data;
 }
 function render(){
  if(!sessionStorage.getItem('fptbnAdminToken'))return;
  const previous=root.querySelector('#defaultTabSettings');if(previous){void previous.reloadSettings?.();return;}
  const section=document.createElement('section');section.id='defaultTabSettings';section.className='landing-preferences grade-tab-settings';
  section.innerHTML='<div class="landing-head"><div><h2>Trang mặc định và quyền truy cập</h2><p>Mở danh sách của từng khối: chọn trang mặc định và tích các tab HS được phép bấm vào.</p></div><span class="landing-tag">Khối 3–12</span></div><p id="portalRevisionNotice" class="admin-mode-note" hidden>Thời gian ôn thi đang bật: HS vào bất kỳ lúc nào và tất cả tab được mở. Quyền bên dưới áp dụng lại khi tắt chế độ này.</p><div class="grade-tabs-grid">'+grades.map(grade=>'<article class="grade-tab-card"><h3>Khối '+grade+'</h3><details class="grade-tab-picker" data-grade="'+grade+'"><summary><span data-default-label="'+grade+'">Học tại lớp</span><span aria-hidden="true">⌄</span></summary><div class="grade-tab-menu" role="group" aria-label="Trang mặc định và quyền tab khối '+grade+'"><div class="grade-tab-columns"><span>Mặc định</span><span>Tab học sinh</span><span>Cho phép</span></div>'+choices.map(([key,label])=>'<div class="grade-tab-row"><input type="radio" name="default-grade-'+grade+'" data-default-grade="'+grade+'" value="'+key+'" id="default-'+grade+'-'+key+'" aria-label="Trang mặc định khối '+grade+': '+label+'" '+(key==='class'?'checked ':'')+'disabled><label for="default-'+grade+'-'+key+'">'+label+'</label><input type="checkbox" data-access-grade="'+grade+'" data-tab="'+key+'" aria-label="Cho phép khối '+grade+': '+label+'" '+(key==='class'?'checked ':'')+'disabled></div>').join('')+'</div></details></article>').join('')+'</div><p class="landing-note">Mọi tab, kể cả Học tại lớp, không tích sẽ bị khóa trong 08:00–17:00, thứ Hai–thứ Sáu; ngoài giờ hoặc khi bật Thời gian ôn thi, HS ôn tập bình thường. Quyền áp dụng cho tất cả lớp trong khối.</p><p class="landing-note">Chọn trang mặc định riêng bằng ô tròn. Nếu trang mặc định bị khóa, HS chuyển sang tab được phép. Nếu chưa có tab nào được mở, HS chờ giáo viên cấp quyền.</p><div class="landing-footer"><button type="button" id="reloadGradeTabs">Tải lại</button><button type="button" class="primary" id="saveDefaultTabs" disabled>Lưu trang mặc định</button><button type="button" class="primary" id="saveGradeTabs" disabled>Lưu quyền tab</button></div><p id="defaultTabStatus" class="landing-status" role="status" aria-live="polite"></p>';
  root.append(section);
  const status=section.querySelector('#defaultTabStatus'),saveDefaults=section.querySelector('#saveDefaultTabs'),saveRights=section.querySelector('#saveGradeTabs'),reload=section.querySelector('#reloadGradeTabs');
  let busy=false,defaultsReady=false,rightsReady=false;
  const message=(text,kind='')=>{status.textContent=text;status.dataset.state=kind;};
  function controls(){
   saveDefaults.disabled=busy||!defaultsReady;saveRights.disabled=busy||!rightsReady;reload.disabled=busy;
   section.querySelectorAll('[data-default-grade]').forEach(el=>{el.disabled=busy||!defaultsReady;});
   section.querySelectorAll('[data-access-grade]').forEach(el=>{el.disabled=busy||!rightsReady;});
  }
  function labels(){for(const grade of grades){const value=section.querySelector('[data-default-grade="'+grade+'"]:checked')?.value||'class';section.querySelector('[data-default-label="'+grade+'"]').textContent=choices.find(([key])=>key===value)[1];}}
  const validRights=data=>data.scope==='grade'&&data.grades&&grades.every(g=>choices.every(([key])=>typeof data.grades[g]?.[key]==='boolean'));
  async function load(){
   if(busy)return;busy=true;defaultsReady=false;rightsReady=false;controls();message('Đang tải cài đặt…');
   const token=sessionStorage.getItem('fptbnAdminToken');
   const [defaults,rights,access]=await Promise.allSettled([request('/api/admin/default-tabs'),request('/api/admin/student-tab-access/grades'),request('/api/admin/classroom-access')]);
   if(!section.isConnected||sessionStorage.getItem('fptbnAdminToken')!==token){busy=false;return;}
   section.querySelector('#portalRevisionNotice').hidden=!(access.status==='fulfilled'&&access.value.settings?.revisionMode===true);
   const errors=[];
   if(defaults.status==='fulfilled'&&grades.every(g=>choices.some(([key])=>key===defaults.value.tabs?.[g]))){
    for(const grade of grades)section.querySelector('[data-default-grade="'+grade+'"][value="'+defaults.value.tabs[grade]+'"]').checked=true;
    defaultsReady=true;labels();
   }else errors.push(defaults.status==='rejected'?defaults.reason.message:'Dữ liệu trang mặc định không hợp lệ.');
   if(rights.status==='fulfilled'&&validRights(rights.value)){
    section.querySelectorAll('[data-access-grade]').forEach(el=>{el.checked=rights.value.grades[el.dataset.accessGrade][el.dataset.tab];});rightsReady=true;
   }else{
    section.querySelectorAll('[data-access-grade]').forEach(el=>{el.checked=false;});
    errors.push(rights.status==='rejected'?rights.reason.message:'Dữ liệu quyền theo khối chưa đúng phiên bản. Vui lòng cập nhật máy chủ.');
   }
   busy=false;controls();message(errors.join(' ')||'Chọn trang mặc định và tích các tab cho phép, sau đó lưu.',errors.length?'error':'');
  }
  section.querySelectorAll('[data-default-grade]').forEach(el=>el.addEventListener('change',()=>{labels();message('Trang mặc định có thay đổi chưa lưu.');}));
  section.querySelectorAll('[data-access-grade]').forEach(el=>el.addEventListener('change',()=>message('Quyền tab có thay đổi chưa lưu. Tích: cho phép; bỏ tích: khóa.')));
  section.querySelectorAll('.grade-tab-picker').forEach(picker=>picker.addEventListener('toggle',()=>{if(picker.open)section.querySelectorAll('.grade-tab-picker').forEach(other=>{if(other!==picker)other.open=false;});}));
  section.addEventListener('keydown',event=>{if(event.key==='Escape'){const picker=event.target.closest('.grade-tab-picker');if(picker){picker.open=false;picker.querySelector('summary').focus();}}});
  async function save(kind){
   if(busy||(kind==='defaults'?!defaultsReady:!rightsReady))return;
   const isDefault=kind==='defaults',body=isDefault?{tabs:Object.fromEntries(grades.map(g=>[g,section.querySelector('[data-default-grade="'+g+'"]:checked').value]))}:{grades:Object.fromEntries(grades.map(g=>[g,Object.fromEntries(choices.map(([key])=>[key,section.querySelector('[data-access-grade="'+g+'"][data-tab="'+key+'"]').checked]))]))};
   busy=true;controls();message('Đang lưu…');const token=sessionStorage.getItem('fptbnAdminToken');
   try{
    const data=await request(isDefault?'/api/admin/default-tabs':'/api/admin/student-tab-access/grades',body);
    if(!section.isConnected||sessionStorage.getItem('fptbnAdminToken')!==token)return;
    if(!isDefault&&!validRights(data))throw Error('Chưa xác nhận được quyền đã lưu. Bấm Tải lại để kiểm tra.');
    message(isDefault?'Đã lưu trang mặc định.':'Đã lưu quyền tab cho khối 3–12.','success');
   }catch(error){message(error.message,'error');}
   finally{busy=false;controls();}
  }
  section.reloadSettings=load;reload.onclick=load;saveDefaults.onclick=()=>save('defaults');saveRights.onclick=()=>save('rights');void load();
 }
 window.addEventListener('fptbn-admin-ready',render);
 window.addEventListener('fptbn-admin-logout',()=>root.replaceChildren());
 document.querySelector('[data-page="portal"]')?.addEventListener('click',render);render();
})();
