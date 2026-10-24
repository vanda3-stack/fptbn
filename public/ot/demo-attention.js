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
        body.replaceChildren();
        el('demoHistory').hidden = data.mode === 'paused';
        el('demoHistoryEmpty').hidden = rows.length > 0;
        el('demoHistorySave').textContent = data.historySaved === false ? 'Chưa lưu được nhật ký trên máy chủ. Các mốc hiện tại chưa được bảo đảm lưu lại.' : 'Mốc ghi nhận theo giờ Việt Nam · Hiển thị 100 lần gần nhất.';
        for (const row of rows) {
            const tr = document.createElement('tr');
            const kind = row.kind === 'away' ? 'Trang ôn tập bị ẩn' : 'Mất tín hiệu thiết bị';
            const ended = row.endReason === 'returned' ? stamp(row.endedAt)
                : row.endReason === 'state-change' ? 'Đổi trạng thái lúc ' + stamp(row.endedAt)
                : row.endReason === 'server-restart' ? 'Chưa xác định (máy chủ khởi động lại)' : 'Chưa ghi nhận quay lại';
            for (const text of [kind, stamp(row.startedAt), ended, row.durationMs == null ? 'Chưa xác định' : duration(row.durationMs)]) {
                const td = document.createElement('td'); td.textContent = text; tr.append(td);
            }
            body.append(tr);
        }
    }
    function render(data) {
        if (!data?.enabled) return reset();
        state = data;
        const box = el('demoAttention'); box.hidden = false; box.dataset.level = data.level;
        const message = data.mode === 'paused' ? 'Con đang học trên lớp. Theo dõi PH tạm dừng.'
            : data.mode === 'waiting' ? 'Đang chờ HS 20310 đăng nhập.'
            : data.mode === 'active' ? (data.returnedAt ? 'HS 20310 đã quay lại trang ôn tập.' : 'HS 20310 đang mở trang ôn tập.')
            : data.mode === 'disconnected' ? 'Mất tín hiệu từ thiết bị HS — chưa xác định nguyên nhân.'
            : data.level === 'pending' ? 'Trang ôn tập vừa bị ẩn. Đang chờ HS quay lại…'
            : data.level === 'urgent' ? 'HS 20310 đã rời trang ôn tập quá 30 giây.' : 'HS 20310 đã rời trang ôn tập từ 10 giây.';
        el('demoAttentionMessage').textContent = message;
        el('demoAttentionClock').textContent = data.mode === 'active' && data.returnedAt
            ? `Quay lại lúc ${stamp(data.returnedAt)} · Thời gian vắng: ${duration(data.lastDuration)}`
            : ['away', 'disconnected'].includes(data.mode) ? `Ghi nhận lúc ${stamp(data.since)}` : '';
        renderHistory(data);
        const key = [data.mode, data.level, data.since, data.returnedAt].join(':');
        if (key !== lastSound && ['warning', 'urgent'].includes(data.level)) beep();
        lastSound = key;
    }
    function reset() {state = null; lastSound = ''; el('demoAttention').hidden = true; el('demoHistory').hidden = true; el('demoHistoryRows').replaceChildren();}
    el('demoAttentionSound').onclick = async () => {
        try {
            if (sound) {sound = false; el('demoAttentionSound').textContent = 'Bật âm báo'; return;}
            const Audio = window.AudioContext || window.webkitAudioContext;
            if (!Audio) throw Error('unavailable');
            audio ||= new Audio(); await audio.resume(); sound = true; beep();
            el('demoAttentionSound').textContent = 'Tắt âm báo';
        } catch {sound = false; el('demoAttentionSound').textContent = 'Âm báo chưa khả dụng';}
    };
    window.OTDemoAttention = {reset, bind(socket) {
        reset(); socket.on('study-status', render);
        socket.on('disconnect', () => {
            if (state) {el('demoAttentionMessage').textContent = 'Máy PH mất kết nối máy chủ. Đang kết nối lại…'; state = null;}
        });
    }};
})();
