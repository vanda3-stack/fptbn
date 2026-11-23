'use strict';
(() => {
 const app=document.getElementById('app');if(!app)return;
 const spaces=[['overview','Tổng quan','Không gian làm việc'],['outline','Đề cương','Tài liệu và kết quả'],['live','Ôn tập tại lớp','Câu hỏi và trò chơi'],['exam','Thi thử','Đề thi và chấm điểm'],['permissions','Quyền học sinh','Khóa, mở các mục học'],['settings','Trang mặc định','Cài đặt theo khối']];
 const labels=Object.fromEntries(spaces.map(([id,label])=>[id,label]));
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const sidebar=document.createElement('aside');sidebar.id='teacherSidebar';sidebar.hidden=true;sidebar.setAttribute('aria-label','Điều hướng giáo viên');
 sidebar.innerHTML='<div class="teacher-side-heading">KHÔNG GIAN GIÁO VIÊN</div><nav>'+spaces.map(([id,label,detail],i)=>'<button type="button" data-teacher-space="'+id+'"><span class="teacher-nav-icon" aria-hidden="true">'+String(i+1).padStart(2,'0')+'</span><span><strong>'+label+'</strong><small>'+detail+'</small></span></button>').join('')+'</nav><div class="teacher-side-links"><span>GIẢNG DẠY</span><a href="/x.html" target="_blank" rel="noopener">Mở lớp giám sát ↗</a><a href="/baocao-gvcn.html" target="_blank" rel="noopener">Báo cáo GVCN ↗</a><a href="/scan" target="_blank" rel="noopener">Chấm bài giấy ↗</a></div><p class="teacher-side-note">FPTBN Monitor<br><small>Quản lý dạy và học</small></p>';
 document.body.append(sidebar);
 let current='overview',lastHeading=null,navigating=false;
 function activate(space){
  current=space;app.dataset.workspace=space;
  sidebar.querySelectorAll('[data-teacher-space]').forEach(button=>{const active=button.dataset.teacherSpace===space;button.classList.toggle('active',active);button.setAttribute('aria-current',active?'page':'false');});
  const title=app.querySelector('.dashboard-heading h1');
  if(title&&title.textContent!==labels[space])title.textContent=labels[space]||'Quản lý giảng dạy';
 }
 async function navigate(space){
  if(navigating)return;navigating=true;
  try{
   if(!app.querySelector('.dashboard-heading'))await dashboard();
   if(!app.querySelector('.dashboard-heading'))return;
   sync();activate(space);
   if(space==='exam')app.querySelector('#mockManage')?.click();
   if(space==='permissions')await window.FPTBNTabPermissions?.load();
   app.querySelector('h1')?.focus({preventScroll:true});
  }catch(error){alert(error.message||'Chưa mở được mục này. Vui lòng thử lại.');}
  finally{navigating=false;}
 }
 function sync(){
  const signedIn=Boolean(sessionStorage.getItem('ot-teacher-token'))&&!app.querySelector('#loginForm');
  sidebar.hidden=!signedIn;document.body.classList.toggle('teacher-authenticated',signedIn);
  const heading=app.querySelector('.dashboard-heading');if(!heading){lastHeading=null;return;}
  const changed=lastHeading!==heading;lastHeading=heading;
  app.querySelector('.student-page-link')?.remove();
  const title=heading.querySelector('h1');if(title)title.tabIndex=-1;
  if(!app.querySelector('#teacherOverview')){
   const items=typeof packs==='undefined'?[]:packs;
   const panel=document.createElement('section');panel.id='teacherOverview';
   panel.innerHTML='<div class="teacher-welcome"><div><span class="tag">GIẢNG DẠY & ÔN TẬP</span><h2>Chào '+escape(sessionStorage.getItem('ot-teacher-name')||'thầy cô')+'</h2><p>Chọn công việc cần thực hiện và quản lý quyền truy cập trong buổi học.</p></div><a class="teacher-open-class" href="/x.html" target="_blank" rel="noopener">Mở lớp giám sát ↗</a></div><div class="teacher-metrics"><article><span>Đề cương đã tạo</span><strong>'+items.length+'</strong></article><article><span>Đề cương đang mở</span><strong>'+items.filter(p=>p.is_open).length+'</strong></article><article><span>Lớp trong năm học</span><strong>'+(typeof classes==='undefined'?0:classes.length)+'</strong></article></div><div class="teacher-section-title"><div><h2>Công việc thường dùng</h2><p>Điều hướng nhanh đến từng khu vực quản lý.</p></div></div><div class="teacher-shortcuts">'+spaces.filter(([id])=>id!=='overview').map(([id,label,detail])=>'<button type="button" data-shortcut="'+id+'"><span>'+detail+'</span><strong>'+label+'</strong><small>Mở khu vực →</small></button>').join('')+'</div>';
   heading.after(panel);panel.querySelectorAll('[data-shortcut]').forEach(button=>button.onclick=()=>navigate(button.dataset.shortcut));
  }
  window.FPTBNTabPermissions?.mount();
  if(changed)activate(current==='exam'?'overview':current);
 }
 sidebar.querySelectorAll('[data-teacher-space]').forEach(button=>button.onclick=()=>navigate(button.dataset.teacherSpace));
 new MutationObserver(sync).observe(app,{childList:true,subtree:true});
 const small=document.querySelector('.wordmark .product-name small');if(small)small.textContent='Không gian giáo viên';
 sync();
})();
