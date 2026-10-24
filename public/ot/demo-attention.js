'use strict';
(() => {
    const el = id => document.getElementById(id);
    let state = null, offset = 0, lastSound = '', audio = null, sound = false;
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
    function clock() {
        if (!state || !['away', 'disconnected'].includes(state.mode)) return;
        const seconds = Math.max(0, Math.floor((Date.now() + offset - state.since) / 1000));
        const time = new Date(state.since).toLocaleTimeString('vi-VN', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
        el('demoAttentionClock').textContent = `Từ ${time} · ${Math.floor(seconds / 60)} phút ${seconds % 60} giây`;
    }
    function render(data) {
        if (!data?.enabled) return reset();
        state = data; offset = data.serverNow - Date.now();
        const box = el('demoAttention'); box.hidden = false; box.dataset.level = data.level;
        const message = data.mode === 'paused' ? 'Con đang học trên lớp. Theo dõi PH tạm dừng.'
            : data.mode === 'waiting' ? 'Đang chờ HS 20310 đăng nhập.'
            : data.mode === 'active' ? (data.returnedAt ? 'HS 20310 đã quay lại trang ôn tập.' : 'HS 20310 đang mở trang ôn tập.')
            : data.mode === 'disconnected' ? 'Mất tín hiệu từ thiết bị HS — chưa xác định nguyên nhân.'
            : data.level === 'pending' ? 'Trang ôn tập vừa bị ẩn. Đang chờ HS quay lại…'
            : data.level === 'urgent' ? 'HS 20310 đã rời trang ôn tập quá 30 giây.' : 'HS 20310 đã rời trang ôn tập từ 10 giây.';
        el('demoAttentionMessage').textContent = message;
        el('demoAttentionClock').textContent = data.mode === 'active' && data.returnedAt
            ? `Thời gian vắng tín hiệu hoặc rời trang: ${Math.round(data.lastDuration / 1000)} giây` : '';
        clock();
        const key = [data.mode, data.level, data.since, data.returnedAt].join(':');
        if (key !== lastSound && ['warning', 'urgent'].includes(data.level)) beep();
        lastSound = key;
    }
    function reset() {state = null; lastSound = ''; el('demoAttention').hidden = true;}
    el('demoAttentionSound').onclick = async () => {
        try {
            if (sound) {sound = false; el('demoAttentionSound').textContent = 'Bật âm báo'; return;}
            const Audio = window.AudioContext || window.webkitAudioContext;
            if (!Audio) throw Error('unavailable');
            audio ||= new Audio(); await audio.resume(); sound = true; beep();
            el('demoAttentionSound').textContent = 'Tắt âm báo';
        } catch {sound = false; el('demoAttentionSound').textContent = 'Âm báo chưa khả dụng';}
    };
    setInterval(clock, 1000);
    window.OTDemoAttention = {reset, bind(socket) {
        reset(); socket.on('study-status', render);
        socket.on('disconnect', () => {
            if (state) {el('demoAttentionMessage').textContent = 'Máy PH mất kết nối máy chủ. Đang kết nối lại…'; state = null; el('demoAttentionClock').textContent = '';}
        });
    }};
})();
