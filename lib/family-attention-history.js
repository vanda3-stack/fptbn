'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');

// One server-side journal for the 20310 demo, outside public/ and ignored by Git.
module.exports = function createHistory(file) {
    let entries = [], saved = true, writable = true;
    try {
        if (file) {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (!Array.isArray(data) || data.some(row => !row || !['away', 'disconnected'].includes(row.kind) || !Number.isFinite(row.startedAt))) throw Error('Invalid attention history');
            entries = data;
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {saved = false; writable = false; console.error('Demo attention history could not be read:', error.message);}
    }
    function persist() {
        if (!file) return;
        if (!writable) return;
        try {
            fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700});
            fs.writeFileSync(file + '.tmp', JSON.stringify(entries), {mode: 0o600});
            fs.renameSync(file + '.tmp', file); saved = true;
        } catch (error) {saved = false; console.error('Demo attention history could not be saved:', error.message);}
    }
    // A server outage cannot establish when a child actually returned.
    let recovered = false;
    for (const row of entries) if (row.endedAt === null && !row.endReason) {row.endReason = 'server-restart'; recovered = true;}
    if (recovered) persist();
    const pending = () => entries.findLast(row => row.endedAt === null && !row.endReason);
    return {
        clear() {if (!entries.length) return; entries = []; persist();},
        begin(kind, at) {
            const previous = pending();
            if (previous?.kind === kind) return;
            if (previous) this.finish(at, 'state-change');
            entries.push({id: crypto.randomUUID(), kind, startedAt: at, endedAt: null, durationMs: null, endReason: null});
            persist();
        },
        finish(at, reason = 'returned') {
            const row = pending(); if (!row) return;
            row.endedAt = at; row.durationMs = Math.max(0, at - row.startedAt); row.endReason = reason; persist();
        },
        recent() {return entries.slice(-100).reverse().map(row => ({...row}));},
        get saved() {return saved;}
    };
};
