'use strict';
(() => {
    const el = id => document.getElementById(id);
    let state = null, lastSound = '', audio = null, sound = false;
    function beep() {
        if (!sound || audio?.state !== 'running') return;
        for (const delay of [0, .25]) {
            const oscillator = audio.createOscillator(), gain = audio.createGain(), at = audio.currentTime + delay;
            oscillator.frequency.value = 880; gain.gain.setValueAtTime(.0001, at);
            gain.gain.exponentialRampToValueAtTime(.12, at + .02);
            gain.gain.exponentialRampToValueAtTime(.0001, at + .18);
            oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at + .2);
        }
    }
    const stamp = at => at == null ? '—' : new Date(at).toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh', hour12: false});
    const clock = at => at == null ? '' : new Date(at).toLocaleTimeString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh', hour12:false});
    const duration = ms => {const seconds = Math.floor(ms / 1000);return `${Math.floor(seconds / 60)} phút ${seconds % 60} giây`;};
    function renderHistory(data) {
        const rows = data.history || [], body = el('demoHistoryRows');
        if (el('demoHistoryCount')) el('demoHistoryCount').textContent = rows.length ? '(' + rows.length + ')' : '';
        body.replaceChildren();
        el('demoHistory').hidden = data.mode === 'paused';
        el('demoHistorySave').hidden = data.historySaved !== false;
        el('demoHistoryEmpty').hidden = rows.length > 0;
        el('demoHistorySave').textContent = data.historySaved === false ? 'Chưa lưu được nhật ký.' : `Phiên theo dõi từ ${stamp(data.historyCapturedAt)}`;
        for (const row of rows) {
            const tr = document.createElement('tr');
            const kind = {away:'Rời tab ôn tập',left:'Thoát / đóng trang', 'screen-stopped':'Dừng chia sẻ màn hình',disconnected:'Mất kết nối (chưa rõ nguyên nhân)'}[row.kind] || 'Gián đoạn theo dõi';
            const ended = row.endReason === 'returned' ? stamp(row.endedAt)
                : row.endReason === 'state-change' ? 'Đổi trạng thái lúc ' + stamp(row.endedAt)
                : row.endReason === 'server-restart' ? 'Chưa xác định (máy chủ khởi động lại)' : row.kind === 'screen-stopped' ? 'Chưa chia sẻ lại' : 'Chưa ghi nhận quay lại';
            for (const text of [kind, stamp(row.startedAt), ended, row.durationMs == null ? 'Chưa xác định' : duration(row.durationMs)]) {
                const td = document.createElement('td'); td.textContent = text; td.dataset.label = ['Sự kiện', 'Ghi nhận lúc', 'Quay lại / cập nhật', 'Thời gian gián đoạn'][tr.children.length]; tr.append(td);
            }
            body.append(tr);
        }
    }
    function render(data) {
        if (!data?.enabled) return reset();
        state = data;
        const tablet = /iPad|Máy tính bảng/.test(data.device || '');
        const phone = /iPhone|Điện thoại/.test(data.device || '');
        const activityOnly = (tablet || phone) && data.mode !== 'paused';
        if(el('tabletNotice')) {
            el('tabletNotice').hidden = !activityOnly;
            el('tabletNotice').textContent = activityOnly ? `Con đang ôn tập bằng ${phone ? 'điện thoại' : 'máy tính bảng'}. Hệ thống chỉ ghi nhận khi con rời trang ôn tập.` : '';
            el('parentMonitor').dataset.device = activityOnly ? (phone ? 'phone' : 'tablet') : '';
            el('parentFloating').hidden = activityOnly;
            if(activityOnly)window.OTParentFloating?.close();
        }
        const screen = activityOnly ? null : data.screen;
        const box = el('demoAttention'); box.hidden = false; box.dataset.level = !['paused','waiting'].includes(data.mode) && (['left','disconnected'].includes(data.mode) || data.connected === false || screen?.state === 'stopped') ? 'urgent' : data.mode === 'away' ? (data.level === 'urgent' ? 'urgent' : 'warning') : data.level;
        const message = data.mode === 'paused' ? 'Con đang học trên lớp.'
            : data.mode === 'waiting' ? 'Con chưa đăng nhập.'
            : data.connected === false && data.mode !== 'left' ? 'Mất kết nối — chưa rõ nguyên nhân.' : data.mode === 'active' ? 'Con đang ở trang ôn tập.'
            : data.mode === 'left' ? 'Con đã thoát / đóng trang.' : data.mode === 'disconnected' ? 'Mất kết nối — chưa rõ nguyên nhân.' : 'Con đã rời tab ôn tập.';
        el('demoAttentionMessage').textContent = message;
        el('demoAttentionClock').textContent = data.connected === false && data.mode !== 'left' && data.disconnectedAt != null ? `Từ ${clock(data.disconnectedAt)}` : data.mode === 'active' && data.returnedAt
            ? `Quay lại ${clock(data.returnedAt)}`
            : data.priorToLogin ? '' : ['away', 'disconnected', 'left'].includes(data.mode) && data.since != null ? `Từ ${clock(data.since)}` : '';
        const screenRow = el('screenSharingStatus');
        if (screenRow) {
            screenRow.hidden = activityOnly || !screen || ['paused', 'waiting'].includes(data.mode);
            screenRow.dataset.state = screen?.state || '';
            el('screenSharingMessage').textContent = !screen ? '' : screen.state === 'live' ? 'Đang chia sẻ màn hình.' : screen.state === 'stopped' ? 'Đã dừng chia sẻ màn hình.' : 'Mất kết nối màn hình.';
            el('screenSharingTime').textContent = !screen || data.mode === 'paused' || screen.since == null ? '' : `Từ ${clock(screen.since)}`;
        }
        renderHistory(data);
        const key = [data.mode, data.level, data.since, data.returnedAt, screen?.state, screen?.since].join(':');
        if (key !== lastSound && (['warning', 'urgent'].includes(data.level) || data.mode === 'left' || screen?.state === 'stopped')) beep();
        lastSound = key;
    }
    function reset() {state = null; lastSound = ''; el('demoAttention').hidden = true; el('demoHistory').hidden = true;if(el('tabletNotice')){el('tabletNotice').hidden=true;el('parentMonitor').dataset.device='';el('parentFloating').hidden=false;} el('demoHistoryRows').replaceChildren();if(el('screenSharingStatus'))el('screenSharingStatus').hidden=true;}
    el('demoAttentionSound').onclick = async () => {
        try {
            if (sound) {sound = false; el('demoAttentionSound').textContent = 'Bật âm báo'; el('demoAttentionSound').setAttribute?.('aria-pressed', 'false'); return;}
            const Audio = window.AudioContext || window.webkitAudioContext;
            if (!Audio) throw Error('unavailable');
            audio ||= new Audio(); await audio.resume(); sound = true; beep();
            el('demoAttentionSound').textContent = 'Tắt âm báo'; el('demoAttentionSound').setAttribute?.('aria-pressed', 'true');
        } catch {sound = false; el('demoAttentionSound').textContent = 'Âm báo chưa khả dụng';}
    };
    window.OTDemoAttention = {reset, bind(socket) {
        reset(); socket.on('study-status', render);
        socket.on('disconnect', () => {
            if (state) {el('demoAttentionMessage').textContent = 'Máy PH mất kết nối máy chủ. Đang kết nối lại…'; state = null; el('demoAttention').dataset.level = 'waiting';if(el('screenSharingMessage'))el('screenSharingMessage').textContent='Chưa cập nhật được màn hình.';}
        });
    }};
})();
