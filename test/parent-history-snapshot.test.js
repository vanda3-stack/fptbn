'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), http = require('node:http');
const express = require('express'), {Server} = require('socket.io');
const {io: client} = require(require('node:path').join(require.resolve('socket.io'), '../../client-dist/socket.io.js'));

test('each parent login starts a fresh journal; reconnection preserves it and another login cannot erase it', async () => {
    const app = express(), server = http.createServer(app), io = new Server(server), sockets = [];
    const history = require('../lib/family-attention-history')(), child = {id: 1, student_code: 'FBN20310', full_name: 'Demo', class_code: '9A3'};
    app.use(express.json());
    const mounted = require('../lib/ot-family')(app, {io, attentionHistory: history, lookup: async () => child, authenticateStudent: async () => child});
    await new Promise(r => server.listen(0, '127.0.0.1', r)); const url = 'http://127.0.0.1:' + server.address().port;
    function event(s, name, predicate = () => true) {return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {s.off(name, handler);reject(Error('Timeout ' + name));}, 2000);
        function handler(data) {if (!predicate(data)) return;clearTimeout(timer);s.off(name, handler);resolve(data);}
        s.on(name, handler);
    });}
    async function login() {const res = await fetch(url + '/api/ot/parent/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: 'FBN20310PH'})});return (await res.json()).token;}
    async function parent(token) {
        const s = client(url + '/ot-family', {auth: {role: 'parent', token}, autoConnect: false, reconnection: false, transports: ['websocket']});
        sockets.push(s);const state = event(s, 'study-status');s.connect();return {socket: s, state: await state};
    }
    try {
        history.begin('away', 1000);history.finish(11000);
        const token = await login();
        // This change occurs after login but before the first socket connects.
        history.begin('away', 20000);history.finish(35000);
        const first = await parent(token);assert.equal(first.state.history.length, 0);
        const captured = first.state.historyCapturedAt;
        const student = client(url + '/ot-family', {auth: {role: 'student', token: 'student'}, autoConnect: false, reconnection: false, transports: ['websocket']});
        sockets.push(student);const ready = event(student, 'ready');student.connect();await ready;
        const changed = event(first.socket, 'study-status', data => data.mode === 'away');
        student.emit('study-visibility', {visibility: 'hidden', sequence: 1});
        const state = await changed;assert.equal(state.history.length, 1);assert.equal(state.historyCapturedAt, captured);
        first.socket.disconnect();const reconnected = await parent(token);
        assert.equal(reconnected.state.history.length, 1);assert.equal(reconnected.state.historyCapturedAt, captured);
        const nextToken = await login(), next = await parent(nextToken);assert.equal(next.state.history.length, 0);
        const returned = event(reconnected.socket, 'study-status', data => data.mode === 'active');
        const nextReturned = event(next.socket, 'study-status', data => data.mode === 'active');
        student.emit('study-visibility', {visibility: 'visible', sequence: 2});
        const previous = await returned;assert.equal(previous.history.length, 1);assert.equal(previous.history[0].endReason, 'returned');
        assert.equal((await nextReturned).history.length, 0, 'an incident that started before this login is excluded');
        const previousHidden = event(reconnected.socket, 'study-status', data => data.mode === 'away');
        const nextHidden = event(next.socket, 'study-status', data => data.mode === 'away');
        student.emit('study-visibility', {visibility: 'hidden', sequence: 3});
        assert.equal((await previousHidden).history.length, 2);assert.equal((await nextHidden).history.length, 1);
        for (const value of [token, nextToken]) await fetch(url + '/api/ot/parent/logout', {method: 'POST', headers: {Authorization: 'Bearer ' + value}});
        assert.equal(history.recent().length, 0, 'last PH logout deletes the old journal');
        student.emit('study-visibility', {visibility: 'visible', sequence: 4});
        student.emit('study-visibility', {visibility: 'hidden', sequence: 5});
        await new Promise(resolve => setTimeout(resolve, 30));
        assert.equal(history.recent().length, 0, 'no journal accumulates before a PH logs in');
    } finally {for (const s of sockets) s.disconnect();mounted.close();await new Promise(r => io.close(r));server.close();}
});
