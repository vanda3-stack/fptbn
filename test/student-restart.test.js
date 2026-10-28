'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), {EventEmitter} = require('node:events');
const express = require('express');
function client(fetcher, saved = {}) {
    const context = {fetch: fetcher, AbortController, setTimeout, clearTimeout, Math,
        sessionStorage: {getItem: key => saved[key] || null, setItem: (key, value) => saved[key] = value}};
    vm.runInNewContext(fs.readFileSync('public/js/student-connection.js', 'utf8'), context);
    return context.FPTBNConnection;
}
const response = (status, data) => ({status, ok: status >= 200 && status < 300, json: async () => data});
test('login waits through proxy HTML 503 and database 503 without reloading', async () => {
    let calls = 0;
    const c = client(async () => {
        calls++;
        if (calls === 1) return {status: 503, ok: false, json: async () => {throw Error('HTML');}};
        return response(calls === 2 ? 503 : 200, {success: calls !== 2});
    });
    assert.equal((await c.json('/api/student/login', {method: 'POST'}, true)).success, true);
    assert.equal(calls, 3);
});
test('writes are not replayed after network errors, and invalid codes are not retried', async () => {
    let calls = 0;
    const c = client(async () => {calls++; throw Error('network');});
    await assert.rejects(c.ot('/packs/id/attempts', {id: 'same-id'}, undefined, 't', 'FBN12345'));
    assert.equal(calls, 1);
    const invalid = client(async () => {calls++; return response(403, {success: false, message: 'Mã HS sai'});});
    await assert.rejects(invalid.refresh('FBN12345'), /Mã HS sai/);
    assert.equal(calls, 2);
});
test('socket startup waits for connect and cleans listeners on success and timeout', async () => {
    const socket = new EventEmitter(); socket.connected = false;
    socket.connect = () => setImmediate(() => {socket.connected = true; socket.emit('connect');});
    await client().waitForSocket(socket, 100);
    assert.equal(socket.listenerCount('connect'), 0);
    socket.connected = false; socket.connect = () => {};
    await assert.rejects(client().waitForSocket(socket, 5), /Chưa kết nối/);
    assert.equal(socket.listenerCount('connect'), 0);
});
test('OT HTTP routes recover a stale token after restart and save original answers once', async () => {
    let mounted, writes = 0;
    const id = '11111111-1111-4111-8111-111111111111';
    const pack = {id: 'pack', teacher_id: 1, is_open: 1, year_id: 2, classes_json: '[10]',
        content_json: JSON.stringify({questions: [{q: 'Q', o: ['A','B','C','D'], a: 2}], essays: []})};
    const savedAttempts = new Map();
    const db = {query: async (sql, args) => {
        if (sql.startsWith('CREATE')) return [[]];
        if (sql.startsWith('SELECT s.id,s.student_code')) return [[{id: 1, student_code: 'FBN12345', class_id: 10, school_year_id: 2}]];
        if (sql.startsWith('SELECT p.*,m.document_url,m.root_id,m.revision')) return [[pack]];
        if (sql.startsWith('INSERT IGNORE')) {
            if (!savedAttempts.has(args[0])) {writes++; savedAttempts.set(args[0], {student_id: 1, pack_id: 'pack', kind: 'quiz', score: 1, total: 1, detail_json: JSON.stringify({answers: [2]})});}
            return [{}];
        }
        if (sql.startsWith('SELECT student_id,pack_id')) return [[savedAttempts.get(args[0])]];
        throw Error('Unexpected SQL ' + sql);
    }};
    const app = express(); app.use(express.json());
    let router;
    function boot() {
        router = express();
        mounted = require('../lib/ot')(router, {db, teacherTokens: new Map()});
    }
    boot(); app.use((req, res, next) => router(req, res, next));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`, saved = {};
    const c = client((url, options) => fetch(base + url, options), saved);
    try {
        const old = (await c.refresh('FBN12345')).token;
        mounted.close(); boot(); // Durable DB retained, process-local sessions lost.
        const body = {id, kind: 'quiz', answers: [2]};
        const result = await c.ot('/packs/pack/attempts', body, undefined, old, 'FBN12345');
        assert.notEqual(result.token, old);
        assert.equal(result.data.result.score, 1);
        assert.equal(saved['ot-student-token'], result.token);
        assert.equal(body.id, id);
        assert.deepEqual(body.answers, [2]);
        assert.equal(writes, 1);
        await c.ot('/packs/pack/attempts', body, undefined, result.token, 'FBN12345');
        assert.equal(writes, 1);
    } finally { mounted.close(); await new Promise(resolve => server.close(resolve)); }
});
test('parallel recovery shares a login and permanent database errors remain visible', async () => {
    let logins = 0;
    const c = client(async (url, options) => {
        if (url === '/api/ot/login') {logins++; await new Promise(resolve => setTimeout(resolve, 10)); return response(200, {success: true, token: 'new', student: {student_code: 'FBN12345'}});}
        return options.headers.Authorization === 'Bearer new' ? response(200, {success: true}) : response(401, {success: false});
    });
    await Promise.all([c.ot('/packs', undefined, undefined, 'old', 'FBN12345'), c.ot('/documents', undefined, undefined, 'old', 'FBN12345')]);
    assert.equal(logins, 1);
    const temporary = require('../lib/transient-db-error');
    assert(temporary({code: 'ECONNRESET'}));
    assert(!temporary({code: 'ER_ACCESS_DENIED_ERROR'}));
    assert(!temporary({code: 'ER_NO_SUCH_TABLE'}));
});
