'use strict';
(() => {
 const labels={class:'Học tại lớp',review:'Ôn tập tại nhà',exam:'Thi thử',print:'Đề cương để in'};
 const grades=[6,7,8,9], root=document.getElementById('app');
 let loading=false;
 async function render() {
   if (!root || !sessionStorage.getItem('ot-teacher-token') || !root.querySelector('#create') || root.querySelector('#defaultTabSettings') || loading) return;
   loading=true;
   const block=document.createElement('section');
   block.id='defaultTabSettings';
   block.className='card';
   block.innerHTML='<h2>Cài đặt trang mở mặc định</h2><p class="muted">Chọn nội dung học sinh khối 6–9 sẽ nhìn thấy đầu tiên sau khi vào trang chính. Các tab khác vẫn dùng bình thường.</p>'+
    '<div class="classes" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">'+grades.map(g=>
       '<label>Khối '+g+'<select data-grade="'+g+'" style="display:block;width:100%;margin-top:6px">'+
       Object.entries(labels).map(([key,label])=>'<option value="'+key+'">'+label+'</option>').join('')+'</select></label>'
     ).join('')+'</div><div class="toolbar" style="margin-top:12px"><button type="button" class="primary" id="saveDefaultTabs">Lưu cài đặt</button><span id="defaultTabStatus" role="status"></span></div>';
   const toolbar=root.querySelector('.toolbar');
   if (!toolbar) {loading=false;return;}
   toolbar.after(block);
   const message=block.querySelector('#defaultTabStatus');
   const auth=()=>({'Authorization':'Bearer '+sessionStorage.getItem('ot-teacher-token'),'Content-Type':'application/json'});
   try {
     const r=await fetch('/api/teacher/default-tabs',{headers:auth(),cache:'no-store'});
     const data=await r.json();
     if (!r.ok || !data.success) throw Error(data.message||'Không đọc được cài đặt');
     grades.forEach(g=>block.querySelector('[data-grade="'+g+'"]').value=data.tabs[g]||'class');
   } catch(e) {message.textContent='Không tải được: '+e.message;}
   block.querySelector('#saveDefaultTabs').onclick=async()=>{
     const button=block.querySelector('#saveDefaultTabs');
     button.disabled=true;message.textContent='Đang lưu…';
     try {
       const tabs=Object.fromEntries(grades.map(g=>[g,block.querySelector('[data-grade="'+g+'"]').value]));
       const r=await fetch('/api/teacher/default-tabs',{method:'PUT',headers:auth(),body:JSON.stringify({tabs})});
       const data=await r.json();
       if(!r.ok||!data.success)throw Error(data.message||'Lưu thất bại');
       message.textContent='✓ Đã lưu. Học sinh sẽ nhận cài đặt khi đăng nhập lần tiếp theo.';
     } catch(e){message.textContent='Lỗi: '+e.message;} finally {button.disabled=false;}
   };
   loading=false;
 }
 new MutationObserver(()=>{render()}).observe(root,{childList:true});
 render();
})();
