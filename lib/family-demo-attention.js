'use strict';

// Each child has an independent tracker and journal. No video capture is required.
function createChildAttention({parents, blocked, now = Date.now, history = require('./family-attention-history')(), hasObservers = () => true}) {
    let current = null, lastSignature = '';
    function snapshot(child) {
        const at = now();
        if (blocked(child)) return {enabled: true, mode: 'paused', level: 'paused', serverNow: at};
        if (!current) return {enabled: true, mode: 'waiting', level: 'waiting', serverNow: at};
        const elapsed = current.since === null ? 0 : at - current.since;
        const level = current.mode === 'active' ? 'active' : elapsed >= 30000 ? 'urgent' : elapsed >= 10000 ? 'warning' : 'pending';
        return {enabled: true, mode: current.mode, level, since: current.since,
            returnedAt: current.returnedAt, lastDuration: current.lastDuration, serverNow: at};
    }
    function clearIfUnobserved() {if (!hasObservers()) history.clear();}
    clearIfUnobserved();
    function captureHistory() {
        clearIfUnobserved();
        return {historyStartedAt: now(), excludedIds: history.recent().map(row => row.id)};
    }
    function forParent(parent, data) {
        parent.data.attentionSnapshot ||= captureHistory();
        const session = parent.data.attentionSnapshot;
        if (data.mode === 'paused') return {...data, history: []};
        const rows = history.recent().filter(row => row.startedAt >= session.historyStartedAt && !session.excludedIds.includes(row.id));
        const priorToLogin = data.since != null && data.since < session.historyStartedAt;
        return {...data, since: priorToLogin ? null : data.since, priorToLogin,
            returnedAt: data.returnedAt >= session.historyStartedAt ? data.returnedAt : null,
            lastDuration: data.returnedAt >= session.historyStartedAt ? data.lastDuration : 0,
            history: rows, historySaved: history.saved, historyCapturedAt: session.historyStartedAt};
    }
    function publish(child, force = false) {
        const data = snapshot(child), signature = JSON.stringify({...data, serverNow: 0});
        if (!force && signature === lastSignature) return;
        lastSignature = signature;
        for (const parent of parents(child.id)) parent.emit('study-status', forParent(parent, data));
    }
    function report(socket, data) {
        if (!data || typeof data !== 'object') return;
        const {visibility, sequence} = data;
        if (!current || current.owner !== socket.id || !['visible', 'hidden'].includes(visibility) || !Number.isSafeInteger(sequence) || sequence <= current.sequence) return;
        current.sequence = sequence;
        const at = now();
        current.lastSeen = at;
        if (visibility === 'hidden') {
            if (current.mode !== 'away') { current.mode = 'away'; current.since = at; if(hasObservers()) history.begin('away', at); }
        } else if (current.mode !== 'active') {
            if(hasObservers()) history.finish(at);
            current.lastDuration = Math.max(0, at - current.since);
            current.returnedAt = at; current.mode = 'active'; current.since = null;
        }
        publish(current.child);
    }
    return {
        captureHistory,
        clearIfUnobserved,
        connect(socket) {
            const {child, role} = socket.data;
            if (role === 'parent') { socket.emit('study-status', forParent(socket, snapshot(child))); return; }
            // The newest student session owns this child’s tracker; stale tabs cannot clear it.
            const previous = current;
            current = {child, owner: socket.id, token: socket.data.token, lastSeen: now(), mode: previous?.mode || 'active', since: previous?.since ?? null, sequence: 0,
                returnedAt: previous?.returnedAt ?? null, lastDuration: previous?.lastDuration || 0};
            publish(child, true);
            socket.on('study-visibility', value => report(socket, value));
            socket.on('disconnect', () => {
                if (current?.owner !== socket.id) return;
                if (current.mode === 'active') { current.mode = 'disconnected'; current.since = now(); if(hasObservers()) history.begin('disconnected', current.since); }
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
                current.mode = 'disconnected'; current.since = now(); if(hasObservers()) history.begin('disconnected', current.since);
            }
            publish(current.child);
        },
        refresh() { if (current) publish(current.child); },
        close() { current = null; }
    };
};

module.exports = function createAttention(options) {
    const trackers = new Map();
    function forChild(child) {
        if (!child) throw Error('Child required');
        const key = child.student_code;
        if (!trackers.has(key)) trackers.set(key, createChildAttention({...options,
            history: options.historyForChild ? options.historyForChild(child) : (trackers.size === 0 && options.history ? options.history : require('./family-attention-history')()),
            hasObservers: () => options.hasObservers ? options.hasObservers(child) : true}));
        return trackers.get(key);
    }
    return {
        connect(socket) {forChild(socket.data.child).connect(socket);},
        captureHistory(child) {return forChild(child).captureHistory();},
        clearIfUnobserved() {for (const tracker of trackers.values()) tracker.clearIfUnobserved();},
        reportHttp(data, child) {
            if (child) return trackers.get(child.student_code)?.reportHttp(data) || false;
            for (const tracker of trackers.values()) if (tracker.reportHttp(data)) return true;
            return false;
        },
        tick() {for (const tracker of trackers.values()) tracker.tick();},
        refresh() {for (const tracker of trackers.values()) tracker.refresh();},
        close() {for (const tracker of trackers.values()) tracker.close();trackers.clear();}
    };
};
