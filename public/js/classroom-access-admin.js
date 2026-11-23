'use strict';
(() => {
    const form = document.getElementById('classroomAccessForm');
    const checkbox = document.getElementById('classroomAccessEnabled');
    const save = document.getElementById('classroomAccessSave');
    const reload = document.getElementById('classroomAccessReload');
    const message = document.getElementById('classroomAccessMessage');
    let busy = false, loaded = false;
    function status(text, failed = false) {
        message.textContent = text;
        message.style.color = failed ? '#b91c1c' : '#334155';
    }
    function controls() {
        checkbox.disabled = save.disabled = busy || !loaded;
        reload.disabled = busy;
    }
    async function request(method, body) {
        const token = sessionStorage.getItem('fptbnAdminToken');
        if (!token) throw Error('Vui lòng đăng xuất và đăng nhập lại admin để quản lý cài đặt.');
        const response = await fetch('/api/admin/classroom-access', {
            method, cache:'no-store', headers:{Authorization:'Bearer ' + token, 'Content-Type':'application/json'},
            ...(body ? {body:JSON.stringify(body)} : {})
        });
        const data = await response.json();
        if (!response.ok || !data.success || typeof data.settings?.enabled !== 'boolean') throw Error(data.message || 'Không tải hoặc lưu được cài đặt. Vui lòng thử lại.');
        return data.settings;
    }
    async function load() {
        if (busy) return;
        busy = true; loaded = false; controls(); status('Đang tải cài đặt…');
        try { checkbox.checked = (await request('GET')).enabled; loaded = true; status('Đã tải cài đặt hiện tại.'); }
        catch (error) { status(error.message, true); }
        finally { busy = false; controls(); }
    }
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || !loaded) return;
        busy = true; controls(); status('Đang lưu cài đặt…');
        try { checkbox.checked = (await request('PUT', {enabled:checkbox.checked})).enabled; status('Đã lưu cài đặt. Quy định áp dụng cho các lượt vào lớp tiếp theo.'); }
        catch (error) { status('Chưa lưu thay đổi. ' + error.message, true); }
        finally { busy = false; controls(); }
    });
    checkbox.addEventListener('change', () => status('Thay đổi chưa được lưu.'));
    reload.addEventListener('click', load);
    document.querySelector('.menu-item[data-page="settings"]').addEventListener('click', load);
})();
