const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function validate(input) {
    if (!input || !['link', 'note'].includes(input.type)) throw Error('Chọn link hoặc lời nhắc.');
    const title = String(input.title || '').trim();
    const text = String(input.text || '').trim();
    if (!title || title.length > 120 || text.length > 3000) throw Error('Tiêu đề tối đa 120 ký tự; nội dung tối đa 3000 ký tự.');
    let url = '';
    if (input.type === 'link') {
        try { const parsed = new URL(String(input.url || '').trim()); if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw Error(); url = parsed.href; } catch { throw Error('Nhập đường dẫn http:// hoặc https:// hợp lệ.'); }
        if (url.length > 2048) throw Error('Đường dẫn quá dài.');
    } else if (!text) throw Error('Nhập nội dung lời nhắc.');
    return { type: input.type, title, text, url, visible: input.visible !== false };
}
function createStore(file) {
    let data = {};
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    return {
        get(room) { return data[room] || []; },
        change(room, action, input) {
            const items = this.get(room).slice();
            if (action === 'add') { if (items.length >= 30) throw Error('Mỗi lớp tối đa 30 nội dung.'); items.push({ ...validate(input), id: crypto.randomUUID() }); }
            else {
                const index = items.findIndex(item => item.id === input?.id);
                if (index < 0) throw Error('Nội dung đã được gỡ. Vui lòng tải lại danh sách.');
                if (action === 'delete') items.splice(index, 1);
                else if (action === 'edit') items[index] = { ...validate(input), id: items[index].id };
                else throw Error('Thao tác không hợp lệ.');
            }
            const next = { ...data, [room]: items };
            fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
            const temporary = file + '.tmp';
            fs.writeFileSync(temporary, JSON.stringify(next), { mode: 0o600 });
            fs.renameSync(temporary, file);
            data = next;
            return items;
        }
    };
}
function register(socket, io, store, roomName) {
    const send = target => { const items = store.get(socket.data.classCode); target.emit('class-resources', socket.data.role === 'teacher' ? items : items.filter(item => item.visible)); };
    socket.on('resources-get', () => { if (socket.data.classCode && ['teacher','student'].includes(socket.data.role)) send(socket); });
    socket.on('resources-change', (request, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        if (socket.data.role !== 'teacher' || !socket.data.classCode) return reply({ success: false, message: 'Cần đăng nhập giáo viên và vào lớp.' });
        try {
            store.change(socket.data.classCode, request?.action, request?.item);
            for (const id of io.sockets.adapter.rooms.get(roomName(socket.data.classCode)) || []) {
                const peer = io.sockets.sockets.get(id);
                if (!peer) continue;
                const items = store.get(socket.data.classCode);
                peer.emit('class-resources', peer.data.role === 'teacher' ? items : items.filter(item => item.visible));
            }
            reply({ success: true });
        } catch (error) { console.error('Resource update failed:', error.message); reply({ success: false, message: error.code ? 'Không thể lưu nội dung trên máy chủ.' : error.message }); }
    });
}
module.exports = { validate, createStore, register };
