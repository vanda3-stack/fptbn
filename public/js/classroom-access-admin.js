'use strict';
(() => {
    const form = document.getElementById('classroomAccessForm');
    const checkbox = document.getElementById('classroomAccessEnabled');
    const revision = document.getElementById('revisionPeriodEnabled');
    const modeState = document.getElementById('revisionPeriodState');
    const save = document.getElementById('classroomAccessSave');
    const reload = document.getElementById('classroomAccessReload');
    const message = document.getElementById('classroomAccessMessage');
    let busy = false, loaded = false;
    function status(text, failed = false) {
        message.textContent = text;
        message.style.color = failed ? '#b91c1c' : '#334155';
    }
    function controls() {
        revision.disabled = checkbox.disabled = save.disabled = busy || !loaded;
        reload.disabled = busy;
    }
    async function request(method, body) {
        const token = sessionStorage.getItem('fptbnAdminToken');
        if (!token) throw Error('Vui lòng đăng xuất và đăng nhập lại admin để quản lý cài đặt.');
        const response = await fetch('/api/admin/classroom-access', {
            method, cache:'no-store', headers:{Authorization:'Bearer ' + token, 'Content-Type':'application/json'},
            ...(body ? {body:JSON.stringify(body)} : {})
        });
        let data;try{data=await response.json();}catch{throw Error('Chưa tải được cài đặt. Vui lòng tải lại sau khi cập nhật máy chủ.');}
        if(sessionStorage.getItem('fptbnAdminToken')!==token)throw Error('Phiên admin đã thay đổi. Vui lòng tải lại cài đặt.');
        if (!response.ok || !data.success || (typeof data.settings?.enabled !== 'boolean' || typeof data.settings?.revisionMode !== 'boolean')) throw Error(data.message || 'Không tải hoặc lưu được cài đặt. Vui lòng thử lại.');
        return data.settings;
    }
    function apply(settings){checkbox.checked=settings.enabled;revision.checked=settings.revisionMode;modeState.textContent=settings.revisionMode?'Đang bật':'Đang tắt';modeState.dataset.enabled=String(settings.revisionMode);}
    async function load() {
        if (busy) return;
        busy = true; loaded = false; controls(); status('Đang tải cài đặt…');
        try { apply(await request('GET')); loaded = true; status('Đã tải cài đặt hiện tại.'); }
        catch (error) { status(error.message, true); }
        finally { busy = false; controls(); }
    }
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || !loaded) return;
        busy = true; controls(); status('Đang lưu cài đặt…');
        try { apply(await request('PUT', {enabled:checkbox.checked,revisionMode:revision.checked})); status('Đã lưu cài đặt. Quy định vào lớp áp dụng cho lượt vào tiếp theo; quyền tab được cập nhật cho HS đang online.'); }
        catch (error) { status('Chưa xác nhận việc lưu. Hãy bấm Tải lại để kiểm tra. ' + error.message, true); }
        finally { busy = false; controls(); }
    });
    revision.addEventListener('change',()=>status('Thay đổi thời gian ôn thi chưa được lưu.'));
    checkbox.addEventListener('change', () => status('Thay đổi chưa được lưu.'));
    reload.addEventListener('click', load);
    window.addEventListener('fptbn-admin-logout',()=>{loaded=false;controls();});
    document.querySelector('.menu-item[data-page="settings"]').addEventListener('click', load);
})();
