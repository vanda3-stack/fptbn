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
            const kind = row.kind === 'away' ? 'Trang ôn tập bị ẩn' : 'Mất tín hiệu thiết bị';
            const ended = row.endReason === 'returned' ? stamp(row.endedAt)
                : row.endReason === 'state-change' ? 'Đổi trạng thái lúc ' + stamp(row.endedAt)
                : row.endReason === 'server-restart' ? 'Chưa xác định (máy chủ khởi động lại)' : 'Chưa ghi nhận quay lại';
            for (const text of [kind, stamp(row.startedAt), ended, row.durationMs == null ? 'Chưa xác định' : duration(row.durationMs)]) {
                const td = document.createElement('td'); td.textContent = text; td.dataset.label = ['Sự kiện', 'Ghi nhận lúc', 'Quay lại / cập nhật', 'Thời gian vắng'][tr.children.length]; tr.append(td);
            }
            body.append(tr);
        }
    }
    function render(data) {
        if (!data?.enabled) return reset();
        state = data;
        const box = el('demoAttention'); box.hidden = false; box.dataset.level = data.screen?.state === 'stopped' && !['paused', 'waiting', 'urgent', 'warning'].includes(data.level) ? 'warning' : data.level;
        const message = data.mode === 'paused' ? 'Con đang học trên lớp.'
            : data.mode === 'waiting' ? 'Con chưa đăng nhập.'
            : data.mode === 'active' ? 'Con đang ở trang ôn tập.'
            : data.mode === 'disconnected' ? 'Mất kết nối thiết bị.' : 'Con đã rời tab ôn tập.';
        el('demoAttentionMessage').textContent = message;
        el('demoAttentionClock').textContent = data.mode === 'active' && data.returnedAt
            ? `Quay lại ${stamp(data.returnedAt)}`
            : data.priorToLogin ? '' : ['away', 'disconnected'].includes(data.mode) && data.since != null ? `Từ ${stamp(data.since)}` : '';
        const screenRow = el('screenSharingStatus');
        if (screenRow) {
            const screen = data.screen;
            screenRow.hidden = !screen || ['paused', 'waiting'].includes(data.mode);
            screenRow.dataset.state = screen?.state || '';
            el('screenSharingMessage').textContent = !screen ? '' : screen.state === 'live' ? 'Đang chia sẻ màn hình.' : screen.state === 'stopped' ? 'Đã dừng chia sẻ màn hình.' : 'Mất kết nối màn hình.';
            el('screenSharingTime').textContent = !screen || data.mode === 'paused' || screen.since == null ? '' : `Từ ${stamp(screen.since)}`;
        }
        renderHistory(data);
        const key = [data.mode, data.level, data.since, data.returnedAt, data.screen?.state, data.screen?.since].join(':');
        if (key !== lastSound && (['warning', 'urgent'].includes(data.level) || data.screen?.state === 'stopped')) beep();
        lastSound = key;
    }
    function reset() {state = null; lastSound = ''; el('demoAttention').hidden = true; el('demoHistory').hidden = true; el('demoHistoryRows').replaceChildren();if(el('screenSharingStatus'))el('screenSharingStatus').hidden=true;}
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
