'use strict';
(() => {
  const root = document.getElementById('app');
  if (!root) return;
  const grades = [3,4,5,6,7,8,9,10,11,12];
  const choices = [
    ['class','Học tại lớp'],['review','Ôn tập tại nhà'],['live','Ôn tập tại lớp'],
    ['exam','Thi thử'],['print','Đề cương để in']
  ];
  let rendering = false;
  async function request(url, options = {}) {
    let response;
    try {
      response = await fetch(url, {
        cache:'no-store',
        ...options,
        headers: {
          'Accept':'application/json',
          'Authorization':'Bearer ' + (sessionStorage.getItem('ot-teacher-token') || ''),
          ...(options.body ? {'Content-Type':'application/json'} : {})
        }
      });
    } catch(e) {throw new Error('Không kết nối được máy chủ. Kiểm tra mạng và tiến trình Node.js.');}
    const type = response.headers.get('content-type') || '';
    if (!type.includes('application/json')) {
      const hint = response.status === 404
        ? 'API cài đặt chưa hoạt động (404). Cần cập nhật nhánh triển khai và khởi động lại Node.js.'
        : 'Máy chủ hoặc proxy đang trả về HTML thay vì JSON (HTTP ' + response.status + '). Kiểm tra cấu hình chuyển tiếp /api và khởi động lại Node.js.';
      throw new Error(hint);
    }
    let data;
    try {data = await response.json();} catch(e) {throw new Error('Phản hồi API không phải JSON hợp lệ.');}
    if (!response.ok || !data.success) throw new Error(data.message || 'Yêu cầu thất bại (HTTP ' + response.status + ').');
    return data;
  }
  async function render() {
    if (rendering || !sessionStorage.getItem('ot-teacher-token') || !root.querySelector('.dashboard-heading') || root.querySelector('#defaultTabSettings')) return;
    rendering = true;
    const section = document.createElement('section');
    section.id = 'defaultTabSettings';
    section.className = 'landing-preferences';
    section.innerHTML = `
      <div class="landing-head">
        <div><h2>Trang mở mặc định cho học sinh</h2>
          <p>Chọn nội dung hiển thị đầu tiên theo từng khối. Học sinh vẫn sử dụng được tất cả tab.</p>
        </div>
        <span class="landing-tag">Áp dụng khối 3–12</span>
      </div>
      <div class="landing-controls">
        ${grades.map(g=>`<label for="landing-grade-${g}"><span>Khối ${g}</span><select id="landing-grade-${g}" data-grade="${g}">
          ${choices.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}
        </select></label>`).join('')}
      </div>
      <div class="landing-footer">
        <span class="landing-note">Cài đặt lưu trên máy chủ và áp dụng khi học sinh đăng nhập.</span>
        <span class="landing-status" id="defaultTabStatus" role="status" aria-live="polite"></span>
        <button type="button" class="primary" id="saveDefaultTabs">Lưu thay đổi</button>
      </div>`;
    root.querySelector('.dashboard-heading').after(section);
    const status = section.querySelector('#defaultTabStatus');
    const save = section.querySelector('#saveDefaultTabs');
    const setStatus = (message, kind='') => {
      status.textContent=message;
      status.dataset.state=kind;
    };
    save.disabled = true;
    try {
      const data = await request('/api/teacher/default-tabs');
      grades.forEach(g=>{
        const el=section.querySelector('[data-grade="'+g+'"]');
        el.value=data.tabs[g]||'class';
      });
      setStatus('');
      save.disabled = false;
    } catch(e) {
      setStatus(e.message,'error');
      save.disabled = true;
    }
    section.querySelectorAll('select').forEach(el=>el.addEventListener('change',()=>{if(!save.disabled)setStatus('Có thay đổi chưa lưu.');}));
    save.addEventListener('click', async()=>{
      save.disabled=true;
      setStatus('Đang lưu…');
      try {
        const tabs=Object.fromEntries(grades.map(g=>[g,section.querySelector('[data-grade="'+g+'"]').value]));
        await request('/api/teacher/default-tabs',{method:'POST',body:JSON.stringify({tabs})});
        setStatus('Đã lưu thành công.','success');
      } catch(e) {setStatus(e.message,'error');}
      finally {save.disabled=false;}
    });
    rendering = false;
  }
  new MutationObserver(()=>{void render()}).observe(root,{childList:true});
  void render();
})();
