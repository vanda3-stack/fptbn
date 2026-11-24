'use strict';
(() => {
 document.querySelectorAll('.menu-item').forEach(item=>{item.setAttribute('role','button');item.tabIndex=0;item.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();item.click();}});});
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
