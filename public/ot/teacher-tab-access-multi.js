'use strict';
(() => {
 const root=document.getElementById('app');
 const choices=[['review','Ôn tập tại nhà'],['live','Ôn tập tại lớp'],['exam','Thi thử'],['print','Đề cương để in']];
 const stateLabels={teaching:'Đang dạy',ready:'Chưa mở lớp',other_teacher:'GV khác đang dạy',reconnecting:'Đang nối lại'};
 async function request(body){
  let response;
  try{response=await fetch('/api/teacher/student-tab-access'+(body?'/batch':''),{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+(sessionStorage.getItem('ot-teacher-token')||''),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
  catch{throw Error(body?'Chưa xác nhận được việc lưu quyền. Vui lòng tải lại danh sách trước khi thử lại.':'Chưa kết nối được máy chủ. Vui lòng bấm Tải lại.');}
  if(response.status===401)throw Error('Phiên giáo viên đã hết hạn. Vui lòng đăng xuất rồi đăng nhập lại.');
  let data;try{data=await response.json();}catch{throw Error(body?'Chưa xác nhận được việc lưu quyền. Vui lòng tải lại danh sách trước khi thử lại.':'Chưa tải được dữ liệu quyền. Vui lòng tải lại trang sau khi cập nhật máy chủ.');}
  if(!response.ok||!data.success)throw Error(data.message||'Chưa xử lý được yêu cầu. Vui lòng thử lại.');
  if(!Array.isArray(data.classes)||data.classes.some(row=>typeof row.class_code!=='string'||typeof row.can_edit!=='boolean'||!row.permissions||choices.some(([key])=>typeof row.permissions[key]!=='boolean'))||(!body&&data.selection_mode!=='multiple'))throw Error('Dữ liệu quyền chưa đúng phiên bản. Vui lòng tải lại trang sau khi cập nhật máy chủ.');
  return data;
 }
 function mount(){
  const host=root.querySelector('#studentTabPermissionsMount');if(!host)return null;
  const previous=root.querySelector('#studentTabPermissions');if(previous){if(!host.contains(previous))host.append(previous);return previous;}
  const panel=document.createElement('section');panel.id='studentTabPermissions';panel.className='teacher-permissions integrated-tab-permissions';
  panel.innerHTML='<div class="teacher-section-title"><div><h2>Tab học sinh được phép mở</h2><p>Tích tab để cho phép HS bấm vào; bỏ tích để khóa tab trong giờ học.</p></div><button type="button" id="tabAccessReload">Tải lại</button></div><details id="permissionClassPicker" class="permission-class-picker" open><summary>Chọn lớp áp dụng <strong id="permissionSelectedCount" role="status">Chưa chọn lớp</strong></summary><div class="permission-class-toolbar"><label for="permissionClassSearch">Tìm lớp<input id="permissionClassSearch" type="search" placeholder="Ví dụ: 6A5 hoặc 9A" autocomplete="off" disabled></label><button type="button" id="permissionSelectAll" disabled>Chọn tất cả đang hiện</button><button type="button" id="permissionClear" disabled>Bỏ chọn tất cả</button></div><div id="permissionClassList" class="permission-class-list" role="group" aria-label="Danh sách lớp để tích chọn"><p>Đang chờ tải danh sách lớp…</p></div></details><p class="permission-scope">Trong 08:00–17:00, thứ Hai–thứ Sáu. Ngoài giờ, học sinh ôn tập bình thường.</p><form id="permissionForm"><fieldset id="permissionFields" disabled><div class="permission-options"><label class="permission-option permission-fixed"><span><strong>Học tại lớp</strong><small>Luôn cho phép</small></span><input type="checkbox" checked disabled aria-label="Học tại lớp luôn mở"></label>'+choices.map(([key,label])=>'<label class="permission-option"><span><strong>'+label+'</strong><small data-status-for="'+key+'">Chưa chọn lớp</small></span><input type="checkbox" data-permission="'+key+'" aria-label="Cho phép '+label+'"></label>').join('')+'</div><div class="permission-actions"><button type="button" id="permissionLockAll">Bỏ tích các tab</button><button type="button" id="permissionOpenAll">Tích tất cả tab</button><button type="submit" id="permissionSave" class="primary" disabled>Lưu quyền tab</button></div></fieldset><p id="permissionNotice" role="status" aria-live="polite">Chọn Tải lại để xem danh sách lớp.</p></form><p class="permission-impact">Tab được tích: cho phép. Tab không tích: khóa trong giờ học. Khóa tab đang mở sẽ đưa HS về Học tại lớp; thời gian thi thử vẫn chạy.</p><a href="/x.html" target="_blank" rel="noopener">Mở trang giám sát lớp ↗</a>';
  host.append(panel);
  let records=[],selected=new Set(),changes={},busy=false,loaded=false,dirty=false;
  const list=panel.querySelector('#permissionClassList'),search=panel.querySelector('#permissionClassSearch'),fields=panel.querySelector('#permissionFields'),save=panel.querySelector('#permissionSave'),notice=panel.querySelector('#permissionNotice');
  const selectedRows=()=>records.filter(row=>selected.has(row.class_code));
  function controls(){
   fields.disabled=busy||!loaded||!selected.size;
   search.disabled=busy||!loaded;
   panel.querySelector('#tabAccessReload').disabled=busy;
   panel.querySelector('#permissionSelectAll').disabled=busy||!loaded;
   panel.querySelector('#permissionClear').disabled=busy||!loaded||!selected.size;
   list.querySelectorAll('input[data-class-code]').forEach(input=>{input.disabled=busy||records.find(row=>row.class_code===input.dataset.classCode)?.can_edit!==true;});
   save.disabled=busy||!loaded||!selected.size||!dirty;
   save.textContent=selected.size?'Lưu quyền cho '+selected.size+' lớp':'Lưu quyền tab';
   panel.querySelector('#permissionSelectedCount').textContent='Đã chọn '+selected.size+' / '+records.filter(row=>row.can_edit).length+' lớp có thể sửa';
  }
  function permissions(){
   const rows=selectedRows();
   choices.forEach(([key])=>{
    const input=panel.querySelector('[data-permission="'+key+'"]'),values=new Set(rows.map(row=>row.permissions[key]));
    input.indeterminate=false;
    input.checked=Object.hasOwn(changes,key)?changes[key]:rows.length>0&&values.size===1&&values.has(true);
    panel.querySelector('[data-status-for="'+key+'"]').textContent=!rows.length?'Chưa chọn lớp':input.indeterminate?'Khác nhau giữa các lớp':input.checked?'Được phép':'Đang khóa';
   });controls();
  }
  function selectionChanged(){
   dirty=true;
   permissions();
   notice.textContent=!selected.size?'Tích chọn lớp cần cấu hình.':'Tích tab được phép mở. Tab không tích sẽ bị khóa cho '+selected.size+' lớp đã chọn sau khi bấm Lưu.';
  }
  function filter(){
   const query=search.value.trim().toUpperCase();
   list.querySelectorAll('.permission-class-item').forEach(item=>{item.hidden=!item.dataset.classCode.includes(query);});
   list.querySelectorAll('.permission-class-group').forEach(group=>{group.hidden=!Array.from(group.querySelectorAll('.permission-class-item')).some(item=>!item.hidden);});
   panel.querySelector('#permissionClassNoMatch').hidden=Array.from(list.querySelectorAll('.permission-class-item')).some(item=>!item.hidden);
  }
  function renderClasses(){
   list.replaceChildren();
   const groups=new Map();
   for(const row of records){
    const grade=String(row.grade_level??'Khác');
    if(!groups.has(grade)){const group=document.createElement('fieldset');group.className='permission-class-group';const legend=document.createElement('legend');legend.textContent='Khối '+grade;group.append(legend);const grid=document.createElement('div');grid.className='permission-class-grid';group.append(grid);list.append(group);groups.set(grade,grid);}
    const item=document.createElement('label');item.className='permission-class-item';item.dataset.classCode=row.class_code;
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.dataset.classCode=row.class_code;checkbox.checked=selected.has(row.class_code);checkbox.disabled=!row.can_edit;
    checkbox.setAttribute('aria-label','Chọn lớp '+row.class_code);
    const text=document.createElement('span'),name=document.createElement('strong'),status=document.createElement('small');name.textContent=row.class_code;status.textContent=stateLabels[row.state]||'Chưa mở lớp';text.append(name,status);item.append(checkbox,text);groups.get(grade).append(item);
    checkbox.onchange=()=>{if(busy||!loaded||!row.can_edit)return;if(checkbox.checked)selected.add(row.class_code);else selected.delete(row.class_code);selectionChanged();};
   }
   const empty=document.createElement('p');empty.id='permissionClassNoMatch';empty.textContent=records.length?'Không có lớp phù hợp với từ khóa.':'Chưa có lớp đang hoạt động trong năm học hiện tại.';list.append(empty);filter();controls();
  }
  search.oninput=filter;
  panel.querySelector('#permissionSelectAll').onclick=()=>{if(busy||!loaded)return;list.querySelectorAll('.permission-class-item').forEach(item=>{const input=item.querySelector('input');if(!item.hidden&&!input.disabled){input.checked=true;selected.add(input.dataset.classCode);}});selectionChanged();};
  panel.querySelector('#permissionClear').onclick=()=>{if(busy)return;selected.clear();list.querySelectorAll('input[data-class-code]').forEach(input=>{input.checked=false;});selectionChanged();};
  choices.forEach(([key])=>panel.querySelector('[data-permission="'+key+'"]').onchange=()=>{if(busy||!loaded||!selected.size)return;changes[key]=panel.querySelector('[data-permission="'+key+'"]').checked;selectionChanged();});
  for(const [id,value] of [['permissionLockAll',false],['permissionOpenAll',true]])panel.querySelector('#'+id).onclick=()=>{if(busy||!loaded||!selected.size)return;changes=Object.fromEntries(choices.map(([key])=>[key,value]));selectionChanged();};
  panel.querySelector('form').onsubmit=async event=>{
   event.preventDefault();if(busy||!loaded||!selected.size||!dirty)return;
   const codes=Array.from(selected),tabs=Object.fromEntries(choices.map(([key])=>[key,panel.querySelector('[data-permission="'+key+'"]').checked]));busy=true;controls();notice.textContent='Đang lưu quyền cho '+codes.length+' lớp…';
   try{
    const data=await request({class_codes:codes,changes:tabs});
    if(data.classes.length!==codes.length||data.classes.some(row=>!codes.includes(row.class_code)))throw Error('Chưa xác nhận được đầy đủ các lớp. Vui lòng tải lại danh sách.');
    const updates=new Map(data.classes.map(row=>[row.class_code,row]));records=records.map(row=>updates.get(row.class_code)||row);changes={};dirty=false;renderClasses();permissions();
    notice.textContent='Đã lưu quyền cho '+data.classes.length+' lớp.'+(data.staged_count?' '+data.staged_count+' lớp sẽ áp dụng khi thầy cô mở lớp.':'');
   }catch(error){notice.textContent=error.message;}
   finally{busy=false;controls();}
  };
  panel.loadPermissions=async()=>{
   if(busy)return;
   const token=sessionStorage.getItem('ot-teacher-token');busy=true;loaded=false;controls();notice.textContent='Đang tải danh sách lớp…';
   try{
    const data=await request();
    if(!panel.isConnected||sessionStorage.getItem('ot-teacher-token')!==token)return;
    records=data.classes;selected=new Set(Array.from(selected).filter(code=>records.some(row=>row.class_code===code&&row.can_edit)));changes={};dirty=false;loaded=true;renderClasses();permissions();
    notice.textContent=records.length?'Chọn lớp, tích các tab cho phép rồi lưu quyền.':'Chưa có lớp trong năm học hiện tại.';
   }catch(error){records=[];selected.clear();changes={};dirty=false;list.replaceChildren();const message=document.createElement('p');message.textContent='Danh sách lớp chưa tải được.';list.append(message);permissions();notice.textContent=error.message;}
   finally{busy=false;controls();}
  };
  panel.querySelector('#tabAccessReload').onclick=()=>panel.loadPermissions();controls();
  return panel;
 }
 async function load(){const panel=mount();if(panel)await panel.loadPermissions();}
 window.FPTBNTabPermissions={mount,load};
})();
