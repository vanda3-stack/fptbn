/* Class resources use the authenticated classroom socket; never client-selected rooms. */
(() => {
    const teacher = !!document.getElementById('students');
    const panel = document.createElement('section');
    panel.className = 'class-resources'; panel.hidden = true;
    panel.setAttribute('aria-label', 'Nội dung & Tài nguyên');
    const style = document.createElement('style');
    style.textContent = `.class-resources{grid-column:1/-1;padding:18px;margin:12px 0;background:#14243a;color:#f1f5f9;border:1px solid #37516f;border-radius:14px;font:15px/1.6 system-ui}.class-resources[hidden]{display:none}.class-resources h2{font-size:20px;margin:0 0 10px}.class-resources article{padding:12px;margin:10px 0;background:#0d192b;border-radius:10px;overflow-wrap:anywhere}.class-resources p{white-space:pre-wrap;margin:6px 0}.class-resources button,.class-resources a{display:inline-block;padding:8px 12px;margin:4px;border:0;border-radius:7px;background:#ea670d;color:white;cursor:pointer;text-decoration:none;font:inherit}.class-resources label{display:block;margin:8px 0}.class-resources input,.class-resources textarea,.class-resources select{display:block;box-sizing:border-box;width:100%;padding:10px;border-radius:7px;border:1px solid #65778b;background:#fff;color:#111;font:inherit}.class-resources form{max-width:720px}.class-resources small{color:#cbd5e1}.class-resources summary{cursor:pointer;font-weight:700}`;
    document.head.append(style);
    const anchor = teacher ? document.getElementById('students') : document.querySelector('#classroom .teacher-panel');
    if (!anchor) return;
    anchor.before(panel);
    const title = document.createElement('h2'); title.textContent = 'Nội dung & Tài nguyên';
    const list = document.createElement('div');
    const status = document.createElement('p'); status.setAttribute('role','status');
    panel.append(title, list);
    let form, composer, toggle, editing = null;
    function change(action, item) {
        status.textContent = 'Đang lưu…';
        socket.timeout(10000).emit('resources-change', { action, item }, (error, result) => {
            status.textContent = error ? 'Chưa nhận được xác nhận. Kiểm tra kết nối và danh sách trước khi thử lại.' : result?.success ? 'Đã lưu và cập nhật cho học sinh trong lớp.' : result?.message || 'Không thể lưu.';
            if (!error && result?.success && (action === 'add' || action === 'edit')) { form.reset(); editing = null; updateFields(); }
        });
    }
    function button(text, action) { const b = document.createElement('button'); b.type='button'; b.textContent=text; b.onclick=action; return b; }
    function render(items) {
        list.replaceChildren(); if (!teacher) panel.hidden = !items.length;
        if (teacher && !items.length) { const p=document.createElement('p'); p.textContent='Chưa có nội dung. Thêm link hoặc lời nhắc để gửi đến lớp.'; list.append(p); }
        for (const item of items) {
            const card=document.createElement('article');
            const heading=document.createElement('strong'); heading.textContent=item.title + (teacher && !item.visible ? ' · Đang ẩn' : ''); card.append(heading);
            if (item.text) { const p=document.createElement('p'); p.textContent=item.text; card.append(p); }
            if (item.type==='link') { const a=document.createElement('a'); a.textContent='Mở tài nguyên ↗'; a.href=item.url; a.target='_blank'; a.rel='noopener noreferrer'; card.append(a); }
            if (teacher) {
                card.append(button('Sửa',()=>{editing=item.id; for(const key of ['type','title','text','url']) form.elements[key].value=item[key]||''; updateFields(); composer.open=true; form.scrollIntoView({block:'nearest'});}),button(item.visible?'Ẩn':'Hiển thị',()=>change('edit',{...item,visible:!item.visible})),button('Gỡ',()=>change('delete',{id:item.id})));
            }
            list.append(card);
        }
    }
    function updateFields() { form.elements.url.closest('label').hidden=form.elements.type.value!=='link'; form.elements.url.required=form.elements.type.value==='link'; form.elements.text.required=form.elements.type.value==='note'; }
    if (teacher) {
        const details=document.createElement('details'); composer=details; details.open=true;
        toggle=button('Gửi thông tin đến HS',()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));});
        toggle.id='sendClassInfo'; toggle.disabled=true; toggle.setAttribute('aria-expanded','false');
        document.getElementById('shareTeacher').before(toggle);
        const summary=document.createElement('summary'); summary.textContent='Thêm / chỉnh sửa nội dung';
        form=document.createElement('form');
        form.innerHTML='<label>Loại nội dung<select name="type"><option value="link">Đường dẫn tài nguyên</option><option value="note">Lời nhắc</option></select></label><label>Tiêu đề<input name="title" maxlength="120" required placeholder="Ví dụ: Bài tập Tin học 6"></label><label>Đường dẫn<input name="url" type="url" maxlength="2048" placeholder="https://…"></label><label>Nội dung lời nhắc / hướng dẫn<textarea name="text" maxlength="3000" rows="3"></textarea></label><button type="submit">Gửi đến lớp</button>';
        form.append(button('Hủy chỉnh sửa',()=>{editing=null;form.reset();updateFields();}));
        form.elements.type.onchange=updateFields; updateFields();
        form.onsubmit=event=>{event.preventDefault();const item=Object.fromEntries(new FormData(form)); item.visible=true;if(editing)item.id=editing; change(editing?'edit':'add',item);};
        details.append(summary,form);panel.append(details,status);
    }
    socket.on('resources-cleanup-error', data => { if (teacher) window.alert(data.message); });
    socket.on('class-resources',render);
    socket.on(teacher?'teacher-ready':'class-info',()=>{editing=null;render([]);if(toggle)toggle.disabled=false;socket.emit('resources-get');});
    socket.on('disconnect',()=>{panel.hidden=true;if(toggle){toggle.disabled=true;toggle.setAttribute('aria-expanded','false');}});
    socket.on('class-ended',()=>{panel.hidden=true;});
})();
