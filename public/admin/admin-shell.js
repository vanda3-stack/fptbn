'use strict';
(() => {
 const descriptions={dashboard:'Không gian làm việc',students:'Hồ sơ và trạng thái',teachers:'Tài khoản giảng dạy',classes:'Danh sách và xếp lớp',years:'Cấu hình năm học',analytics:'Hoạt động và báo cáo',portal:'Trang mở đầu và quyền tab',settings:'Giờ học và thời gian ôn thi'};
 const items=Array.from(document.querySelectorAll('.menu-item'));
 function markCurrent(){for(const item of items)item.setAttribute('aria-current',item.classList.contains('active')?'page':'false');}
 items.forEach((item,index)=>{
  item.setAttribute('role','button');item.tabIndex=0;
  const icon=item.querySelector(':scope > span'),label=item.querySelector('.menu-label'),strong=document.createElement('strong'),small=document.createElement('small');
  strong.textContent=label.textContent.trim();small.textContent=descriptions[item.dataset.page]||'';label.replaceChildren(strong,small);
  if(icon){icon.className='menu-icon';icon.textContent=String(index+1).padStart(2,'0');icon.setAttribute('aria-hidden','true');}
  item.addEventListener('click',markCurrent);
  item.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();item.click();}});
 });markCurrent();
 const password=document.getElementById('password'),toggle=document.getElementById('adminPasswordToggle');
 function concealPassword(){password.type='password';toggle.textContent='Hiện';toggle.setAttribute('aria-pressed','false');}
 toggle.addEventListener('click',()=>{const show=password.type==='password';password.type=show?'text':'password';toggle.textContent=show?'Ẩn':'Hiện';toggle.setAttribute('aria-pressed',String(show));});
 window.addEventListener('fptbn-admin-logout',concealPassword);
 window.addEventListener('fptbn-admin-ready',()=>{concealPassword();password.value='';});
 async function health(){
  const server=document.getElementById('adminServerStatus'),database=document.getElementById('adminDatabaseStatus');
  server.textContent=database.textContent='Đang kiểm tra…';
  try{const response=await fetch('/api/admin/analytics/health',{cache:'no-store'}),data=await response.json();if(!response.ok||!data.success)throw Error();server.textContent='Đang hoạt động';database.textContent='Kết nối · '+data.runtime.database_ms+' ms';}
  catch{server.textContent=database.textContent='Chưa xác nhận được';}
 }
 window.addEventListener('fptbn-admin-ready',health);
 document.querySelector('[data-page="dashboard"]').addEventListener('click',()=>{if(sessionStorage.getItem('fptbnAdminToken'))void health();});
 if(sessionStorage.getItem('fptbnAdminToken'))void health();
})();
