/* Resources are scoped to the authenticated classroom by the server. */
(() => {
    const teacher = !!document.getElementById('students');
    const anchor = teacher ? document.getElementById('students') : document.querySelector('#classroom .teacher-panel');
    if (!anchor) return;
    const style = document.createElement('style');
    style.textContent = `
.class-resources{box-sizing:border-box;color:#f1f5f9;font:14px/1.6 system-ui}
.class-resources[hidden],.resource-shade[hidden]{display:none!important}
.class-resources article{margin:8px 0;padding:12px;background:#14243a;border:1px solid #37516f;border-radius:10px;overflow-wrap:anywhere}
.resource-line{display:flex;align-items:center;gap:14px;flex-wrap:nowrap}
.resource-line p{flex:1;min-width:0;margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.class-resources button,.class-resources a,#sendClassInfo{box-sizing:border-box;display:inline-block;padding:9px 12px;border:0;border-radius:8px;background:#ea670d;color:#fff;cursor:pointer;text-decoration:none;font:inherit}
.resource-line a{flex-shrink:0;white-space:nowrap}
.class-resources .resource-actions{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
.class-resources .resource-actions button{background:#273c57;padding:5px 10px;font-size:12px}
.class-resources label{display:block;margin:14px 0}
.class-resources input,.class-resources textarea{box-sizing:border-box;display:block;width:100%;margin-top:6px;padding:11px;border-radius:8px;border:1px solid #40536c;background:#0c1626;color:white;font:inherit}
.class-resources textarea{resize:vertical;min-height:110px}
.resource-student{margin:0 0 10px}
#classroom .teacher-video-box.resources-centered{background:linear-gradient(145deg,#0b1931,#152e55)}
#classroom .teacher-video-box.resources-centered #waitingTeacher{display:none!important}
#classroom .resource-student.resource-center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;margin:0;padding:clamp(14px,3vw,40px);overflow:auto}
.resource-center>div{width:100%;max-width:900px;max-height:100%;overflow:auto}
.resource-center article{padding:clamp(16px,3vw,30px);border-radius:16px;background:#142d50;border-color:#41699a;box-shadow:0 12px 32px #0003}
.resource-center .resource-line{gap:20px;font-size:clamp(17px,2.2vw,25px)}
.resource-center .resource-line a{padding:12px 20px;font-size:16px}

.resource-drawer{position:fixed;inset:0 0 0 auto;width:min(420px,94vw);height:100dvh;background:#121e30;border-left:1px solid #34465e;box-shadow:-15px 0 50px #0007;z-index:2100;padding:18px;overflow-y:auto}
.resource-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.resource-top h2{font-size:18px;margin:0}
.resource-top button{background:none;font-size:22px;padding:0 5px}
.resource-shade{position:fixed;inset:0;z-index:2099;background:#0006}
.resource-status{color:#cbd5e1;white-space:pre-wrap}
.resource-drawer h3{font-size:14px;margin:22px 0 8px;color:#cbd5e1}
#sendClassInfo{border:1px solid #3b536e;background:#1e293b;font-weight:700}
#sendClassInfo:disabled{opacity:.5;cursor:default}
`;
    document.head.append(style);
    const panel=document.createElement('section');
    panel.id='classResources'; panel.className='class-resources '+(teacher?'resource-drawer':'resource-student'); panel.hidden=true;
    panel.setAttribute('aria-label','Gửi thông tin đến HS');
    const list=document.createElement('div');
    const status=document.createElement('p'); status.className='resource-status';status.setAttribute('role','status');
    let form,toggle,shade,editing=null,busy=false;
    function button(text,action){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=action;return b;}
    function close(restoreFocus=true){panel.hidden=true;if(shade)shade.hidden=true;if(toggle){toggle.setAttribute('aria-expanded','false');if(restoreFocus)toggle.focus();}}
    function open(){
        document.getElementById('rosterClose')?.click();
        panel.hidden=false;shade.hidden=false;toggle.setAttribute('aria-expanded','true');form.elements.text.focus();
    }
    function reset(){editing=null;form.reset();form.querySelector('[type=submit]').textContent='Gửi đến lớp';}
    function change(action,item,resetForm=false){
        if(busy)return;busy=true;status.textContent='Đang cập nhật…';
        form.querySelector('[type=submit]').disabled=true;
        socket.timeout(10000).emit('resources-change',{action,item},(error,result)=>{
            busy=false;form.querySelector('[type=submit]').disabled=false;
            status.textContent=error?'Chưa nhận được xác nhận. Kiểm tra kết nối và danh sách trước khi thử lại.':result?.success?'Đã cập nhật thông tin đến học sinh.':result?.message||'Không thể lưu.';
            if(!error&&result?.success&&resetForm)reset();
        });
    }
    function placeStudentResources(){
        if(teacher || window.FPTBN_EXAM_MODE === true)return;
        const video=document.getElementById('teacherVideo');
        const box=anchor.querySelector('.teacher-video-box');
        if(!box || !video)return;
        const stream=video.srcObject;
        const sharing=!!stream && stream.getVideoTracks().some(track=>track.readyState==='live');
        const centered=!panel.hidden && !sharing;
        box.classList.toggle('resources-centered',centered);
        panel.classList.toggle('resource-center',centered);
        if(centered){if(panel.parentElement!==box)box.append(panel);}
        else if(panel.parentElement!==anchor.parentElement || panel.nextElementSibling!==anchor)anchor.before(panel);
    }
    window.addEventListener('teacher-screen-changed',placeStudentResources);
    function render(items){
        list.replaceChildren();if(!teacher)panel.hidden=!items.length;
        if(teacher&&!items.length){const p=document.createElement('p');p.textContent='Chưa có thông tin được gửi trong buổi học này.';list.append(p);}
        for(const item of items){
            const card=document.createElement('article');const row=document.createElement('div');row.className='resource-line';
            const p=document.createElement('p');p.textContent=item.text||item.title;row.append(p);
            if(item.type==='link'&&item.url){const a=document.createElement('a');a.textContent='Truy cập ↗';a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';row.append(a);}
            card.append(row);
            if(teacher){
                if(!item.visible){const label=document.createElement('small');label.textContent='Đang ẩn với HS';card.append(label);}
                const actions=document.createElement('div');actions.className='resource-actions';
                actions.append(button('Sửa',()=>{editing=item.id;form.elements.text.value=item.text||item.title;form.elements.url.value=item.url||'';form.querySelector('[type=submit]').textContent='Lưu thay đổi';form.elements.text.focus();}),button(item.visible?'Ẩn':'Hiển thị',()=>change('edit',{...item,visible:!item.visible})),button('Gỡ',()=>change('delete',{id:item.id})));
                card.append(actions);
            }
            list.append(card);
        }
        placeStudentResources();
    }
    if(teacher){
        panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
        shade=document.createElement('div');shade.className='resource-shade';shade.hidden=true;shade.onclick=()=>close();
        const top=document.createElement('div');top.className='resource-top';const heading=document.createElement('h2');heading.textContent='Gửi thông tin đến HS';
        const dismiss=button('×',()=>close());dismiss.setAttribute('aria-label','Đóng bảng gửi thông tin');top.append(heading,dismiss);
        form=document.createElement('form');
        form.innerHTML='<label>Nội dung lời nhắc<textarea name="text" maxlength="3000" rows="4" required placeholder="Ví dụ: Hoàn thành câu 1–5 trước 9 giờ."></textarea></label><label>Đường link (nếu có)<input name="url" type="url" maxlength="2048" placeholder="https://…"></label><button type="submit">Gửi đến lớp</button>';
        form.append(button('Hủy chỉnh sửa',reset));
        form.onsubmit=event=>{event.preventDefault();const text=form.elements.text.value.trim(),url=form.elements.url.value.trim();if(!text){form.elements.text.focus();return;}const item={type:url?'link':'note',title:text.slice(0,120),text,url,visible:true};if(editing)item.id=editing;change(editing?'edit':'add',item,true);};
        const sent=document.createElement('h3');sent.textContent='Thông tin đã gửi';panel.append(top,form,status,sent,list);document.body.append(shade,panel);
        toggle=button('Gửi thông tin đến HS',()=>panel.hidden?open():close());toggle.id='sendClassInfo';toggle.disabled=true;toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',panel.id);document.getElementById('shareTeacher').before(toggle);
        document.getElementById('rosterToggle')?.addEventListener('click',()=>close(false));
        panel.addEventListener('keydown',event=>{
            if(event.key==='Escape'){event.preventDefault();close();}
            if(event.key==='Tab'){const all=[...panel.querySelectorAll('button,input,textarea,a[href]')].filter(el=>!el.disabled);const first=all[0],last=all.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
        });
    }else{panel.append(list);anchor.before(panel);}
    socket.on('resources-cleanup-error',data=>{if(teacher)window.alert(data.message);});
    socket.on('class-resources',render);
    socket.on(teacher?'teacher-ready':'class-info',()=>{if(teacher){reset();status.textContent='';toggle.disabled=false;}render([]);socket.emit('resources-get');});
    socket.on('disconnect',()=>{render([]);close(false);if(teacher)reset();if(toggle)toggle.disabled=true;});
    socket.on('teacher-offline',()=>{render([]);close(false);});
    socket.on('class-ended',()=>{render([]);close(false);});
})();

