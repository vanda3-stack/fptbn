'use strict';

// Only the presentation account participates. No video capture is required.
module.exports = function createDemoAttention({parents, blocked, now = Date.now}) {
    let current = null, lastSignature = '';
    const isDemo = child => child.student_code === 'FBN20310';
    function snapshot(child) {
        const at = now();
        if (blocked(child)) return {enabled: true, mode: 'paused', level: 'paused', serverNow: at};
        if (!current) return {enabled: true, mode: 'waiting', level: 'waiting', serverNow: at};
        const elapsed = current.since === null ? 0 : at - current.since;
        const level = current.mode === 'active' ? 'active' : elapsed >= 30000 ? 'urgent' : elapsed >= 10000 ? 'warning' : 'pending';
        return {enabled: true, mode: current.mode, level, since: current.since,
            returnedAt: current.returnedAt, lastDuration: current.lastDuration, serverNow: at};
    }
    function publish(child, force = false) {
        const data = snapshot(child), signature = JSON.stringify({...data, serverNow: 0});
        if (!force && signature === lastSignature) return;
        lastSignature = signature;
        for (const parent of parents(child.id)) parent.emit('study-status', data);
    }
    function report(socket, data) {
        if (!data || typeof data !== 'object') return;
        const {visibility, sequence} = data;
        if (!current || current.owner !== socket.id || !['visible', 'hidden'].includes(visibility) || !Number.isSafeInteger(sequence) || sequence <= current.sequence) return;
        current.sequence = sequence;
        const at = now();
        current.lastSeen = at;
        if (visibility === 'hidden') {
            if (current.mode !== 'away') { current.mode = 'away'; current.since = at; }
        } else if (current.mode !== 'active') {
            current.lastDuration = Math.max(0, at - current.since);
            current.returnedAt = at; current.mode = 'active'; current.since = null;
        }
        publish(current.child);
    }
    return {
        connect(socket) {
            const {child, role} = socket.data;
            if (!isDemo(child)) return;
            if (role === 'parent') { socket.emit('study-status', snapshot(child)); return; }
            // The newest student session owns the demo; stale tabs cannot clear it.
            const previous = current;
            current = {child, owner: socket.id, token: socket.data.token, lastSeen: now(), mode: previous?.mode || 'active', since: previous?.since ?? null, sequence: 0,
                returnedAt: previous?.returnedAt ?? null, lastDuration: previous?.lastDuration || 0};
            publish(child, true);
            socket.on('study-visibility', value => report(socket, value));
            socket.on('disconnect', () => {
                if (current?.owner !== socket.id) return;
                if (current.mode === 'active') { current.mode = 'disconnected'; current.since = now(); }
                publish(child);
            });
        },
        reportHttp({token, socketId, visibility, sequence}) {
            if (!current || token !== current.token || socketId !== current.owner) return false;
            report({id: socketId}, {visibility, sequence}); return true;
        },
        tick() {
            if (!current) return;
            // Covers mobile suspension even before Socket.IO declares a disconnect.
            if (current.mode === 'active' && now() - current.lastSeen >= 20000) {
                current.mode = 'disconnected'; current.since = current.lastSeen;
            }
            publish(current.child);
        },
        refresh() { if (current) publish(current.child); },
        close() { current = null; }
    };
};
