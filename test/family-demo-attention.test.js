'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const create = require('../lib/family-demo-attention');
function harness() {
    let time = 100000, denied = false;
    const viewers = [], child = {id: 1, student_code: 'FBN20310'};
    const tracker = create({parents: id => viewers.filter(p => p.data.child.id === id), blocked: () => denied, now: () => time});
    function socket(id, role = 'student', info = child) {
        const handlers = {}, received = [];
        const s = {id, data: {role, child: info, token: id + '-token'},
            on: (name, fn) => handlers[name] = fn, emit: (name, data) => received.push({name, data}),
            fire: (name, data) => handlers[name]?.(data), get last() {return received.at(-1)?.data;}, received};
        if (role === 'parent') viewers.push(s);
        tracker.connect(s); return s;
    }
    return {tracker, socket, advance: ms => {time += ms; tracker.tick();}, block: value => {denied = value; tracker.refresh();}};
}

test('parents receive thresholds while late logins and other children stay isolated', () => {
    const h = harness(), student = h.socket('student'), parents = Array.from({length: 12}, (_, i) => h.socket('p' + i, 'parent'));
    const other = h.socket('other', 'parent', {id: 2, student_code: 'FBN12345'});
    student.fire('study-visibility', {visibility: 'hidden', sequence: 1});
    assert(parents.every(p => p.last.level === 'pending'));
    h.advance(9999); assert.equal(parents[0].last.level, 'pending');
    h.advance(1); assert(parents.every(p => p.last.level === 'warning' && p.last.since === 100000));
    const late = h.socket('late', 'parent'); assert.equal(late.last.since, null);assert.equal(late.last.priorToLogin, true);assert.equal(late.last.history.length, 0);
    const count = parents[0].received.length;
    h.advance(1000); assert.equal(parents[0].received.length, count, 'no per-second notification flooding');
    h.advance(19000); assert(parents.every(p => p.last.level === 'urgent'));
    student.fire('study-visibility', {visibility: 'visible', sequence: 2});
    assert(parents.every(p => p.last.mode === 'active' && p.last.lastDuration === 30000));
    assert.equal(other.received.length, 1);assert.equal(other.last.mode, 'waiting');assert.equal(other.last.history.length, 0);
});

test('mobile suspension and disconnect stay distinct from known hidden-page events', () => {
    const h = harness(), student = h.socket('student'), parent = h.socket('p', 'parent');
    h.advance(20000); assert.equal(parent.last.mode, 'disconnected');
    student.fire('study-visibility', {visibility: 'visible', sequence: 1}); assert.equal(parent.last.mode, 'active');
    student.fire('study-visibility', {visibility: 'hidden', sequence: 2});
    h.advance(5000); student.fire('disconnect'); h.advance(5000);
    assert.equal(parent.last.mode, 'away'); assert.equal(parent.last.level, 'warning');assert.equal(parent.last.connected,false);
    const next = h.socket('new');
    next.fire('study-visibility', {visibility: 'hidden', sequence: 1});
    assert.equal(parent.last.since, 120000, 'reconnection in the background keeps the original departure');
    student.fire('study-visibility', {visibility: 'visible', sequence: 3}); assert.equal(parent.last.mode, 'away');
    next.fire('study-visibility', {visibility: 'visible', sequence: 2}); assert.equal(parent.last.lastDuration, 10000);
});

test('HTTP fallback authenticates ownership, ignores delayed duplicates, and respects teacher suppression', () => {
    const h = harness(), s = h.socket('student'), p = h.socket('p', 'parent');
    assert.equal(h.tracker.reportHttp({token: 'wrong', socketId: s.id, visibility: 'hidden', sequence: 1}), false);
    assert.equal(h.tracker.reportHttp({token: s.data.token, socketId: s.id, visibility: 'hidden', sequence: 1}), true);
    s.fire('study-visibility', {visibility: 'visible', sequence: 2});
    h.tracker.reportHttp({token: s.data.token, socketId: s.id, visibility: 'hidden', sequence: 1});
    assert.equal(p.last.mode, 'active');
    assert.doesNotThrow(() => {s.fire('study-visibility', null);s.fire('study-visibility', 'hidden');s.fire('study-visibility', {visibility: 'hidden', sequence: Infinity});});
    h.block(true); s.fire('study-visibility', {visibility: 'hidden', sequence: 3}); h.advance(30000);
    assert.equal(p.last.mode, 'paused'); h.block(false); assert.equal(p.last.level, 'urgent');
});

test('demo tablet establishes the family connection without requesting screen capture', async () => {
    const vm = require('node:vm'), fs = require('node:fs'), calls = [];
    const context = {window: {OTFamily: {connect: (...args) => calls.push(['connect', ...args]), attachStream: () => calls.push(['capture']), disconnect() {}}},
        document: {getElementById: () => null}, sessionStorage: {setItem() {}},
        fetch: async () => ({ok: true, json: async () => ({success: true, token: 'demo-token', student: {student_code: 'FBN20310'}})})};
    vm.runInNewContext(fs.readFileSync('public/portal/family-session.js', 'utf8'), context);
    await context.window.FPTBNFamilySession.start('FBN20310', null);
    assert.equal(calls.length, 1); assert.equal(calls[0][0], 'connect'); assert.equal(calls[0][1], 'demo-token');
});

test('mobile visibility adapter sends ordered events and a durable hidden-page beacon without capturing', () => {
    const vm = require('node:vm'), fs = require('node:fs');
    const handlers = {}, events = {}, emitted = [], beacons = [], intervals = [], windowEvents = {};
    const elements = Object.fromEntries(['familyStart', 'familyStop', 'familyMessage'].map(id => [id, {}]));
    const socket = {id: 'demo-socket', connected: true, emit: (...args) => emitted.push(args),
        on: (name, fn) => handlers[name] = fn, disconnect() {}};
    const context = {window: {addEventListener:(name,fn)=>windowEvents[name]=fn}, document: {visibilityState: 'visible',
        addEventListener: (name, fn) => events[name] = fn, getElementById: id => elements[id],
        querySelector: () => ({after() {}}), createElement: () => ({remove() {}})},
        navigator: {sendBeacon: (...args) => {beacons.push(args); return true;}}, Blob,
        io: () => socket, OTFamilySocketOptions: value => value,
        setInterval: fn => {intervals.push(fn); return intervals.length;}, clearInterval() {}, clearTimeout() {}};
    vm.runInNewContext(fs.readFileSync('public/ot/family-student.js', 'utf8'), context);
    context.window.OTFamily.connect('demo-token');
    handlers.ready({rtcConfig: {}, demoAttention: true});
    assert.equal(emitted.at(-1)[1].visibility, 'visible');
    context.document.visibilityState = 'hidden'; events.visibilitychange();
    assert.equal(emitted.at(-1)[1].visibility, 'hidden'); assert.equal(beacons.length, 1);
    const previous = emitted.at(-1)[1].sequence;
    context.document.visibilityState = 'visible'; events.visibilitychange();
    assert(emitted.at(-1)[1].sequence > previous);
    windowEvents.pagehide({persisted:false});
    assert.equal(emitted.at(-1)[1].visibility,'left');assert.equal(beacons.length,3);
    windowEvents.pagehide({persisted:true});assert.equal(emitted.at(-1)[1].visibility,'hidden');
    assert(!emitted.some(([name]) => name === 'stop'), 'leaving the page is not reported as an intentional screen stop');
    assert(!emitted.some(([name]) => name === 'start'), 'no nonexistent mobile video share');
});

test('real Socket.IO broadcasts state to two parents and HTTP fallback rejects invalid tokens', async () => {
    const express = require('express'), http = require('node:http'), {Server} = require('socket.io');
    const {io: client} = require(require('node:path').join(require.resolve('socket.io'), '../../client-dist/socket.io.js'));
    const app = express(), server = http.createServer(app), io = new Server(server), sockets = [];
    const child = {id: 1, student_code: 'FBN20310', full_name: 'Demo', class_code: '9A3'};
    app.use(express.json());
    // The bundled browser client cannot override User-Agent; emulate an iPad transport header.
    io.of('/ot-family').use((s,next)=>{s.handshake.headers['user-agent']='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1';next()});
    const mounted = require('../lib/ot-family')(app, {io, attentionHistory: require('../lib/family-attention-history')(), lookup: async () => child,
        authenticateStudent: async token => {if (token !== 'valid') throw Error('invalid');return child;}});
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const url = 'http://127.0.0.1:' + server.address().port;
    function event(socket, name, predicate = () => true) {return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {socket.off(name, done);reject(Error('Timeout ' + name));}, 2000);
        function done(data) {if (!predicate(data)) return;clearTimeout(timer);socket.off(name, done);resolve(data);}
        socket.on(name, done);
    });}
    async function connect(role, token) {
        const s = client(url + '/ot-family', {auth: {role, token,device:{maxTouchPoints:5}},extraHeaders:{'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1'}, transports: ['websocket'], autoConnect: false, reconnection: false});
        sockets.push(s);s.on('study-status',d=>s.studyData=d); const ready = event(s, 'ready');s.connect();assert.equal((await ready).demoAttention, true);return s;
    }
    try {
        const student = await connect('student', 'valid'), parents = [];
        for (let i = 0; i < 2; i++) {
            const response = await fetch(url + '/api/ot/parent/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: 'FBN20310PH'})});
            parents.push(await connect('parent', (await response.json()).token));
        }
        const hidden = parents.map(s => event(s, 'study-status', d => d.mode === 'away'));
        student.emit('study-visibility', {visibility: 'hidden', sequence: 1});
        const data = await Promise.all(hidden);assert(data.every(d => d.since === data[0].since));assert(data.every(d=>d.device==='iPad'));
        const returned = parents.map(s => event(s, 'study-status', d => d.mode === 'active'));
        const post = (token,visibility='visible',sequence=2) => fetch(url + '/api/ot/demo-attention', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token, socketId: student.id, visibility, sequence})});
        assert.equal((await post('invalid')).status, 403);assert.equal((await post('valid')).status, 204);
        await Promise.all(returned);
        const left=parents.map(s=>event(s,'study-status',d=>d.mode==='left'));
        assert.equal((await post('valid','left',3)).status,204);await Promise.all(left);
    } finally {for (const s of sockets) s.disconnect();mounted.close();await new Promise(r => io.close(r));server.close();}
});

test('ordinary children have separate live states, histories and HTTP ownership', () => {
 const h = harness(), a = h.socket('a'), pa = h.socket('pa', 'parent');
 const childB = {id: 2, student_code: 'FBN12345'};
 const b = h.socket('b', 'student', childB), pb = h.socket('pb', 'parent', childB);
 a.fire('study-visibility', {visibility: 'hidden', sequence: 1});
 assert.equal(pa.last.mode, 'away');assert.equal(pb.last.mode, 'active');assert.equal(pb.last.history.length, 0);
 h.advance(10000);b.fire('study-visibility', {visibility: 'hidden', sequence: 1});
 assert.equal(pa.last.since, 100000);assert.equal(pb.last.since, 110000);
 assert.equal(pa.last.history.length, 1);assert.equal(pb.last.history.length, 1);
 assert.notEqual(pa.last.history[0].id, pb.last.history[0].id);
 assert.equal(h.tracker.reportHttp({token:a.data.token,socketId:b.id,visibility:'visible',sequence:2},childB),false);
 assert.equal(h.tracker.reportHttp({token:b.data.token,socketId:b.id,visibility:'visible',sequence:2},childB),true);
 assert.equal(pb.last.mode,'active');assert.equal(pa.last.mode,'away');
});

test('screen stop has its own timestamp, stays separate from tab status, and ignores other owners', () => {
 const h=harness(), s=h.socket('s'), p=h.socket('p','parent');
 assert.equal(p.last.screen,null,'devices without a shared screen have no screen warning');
 h.tracker.sharing(s,'stopped');assert.equal(p.last.screen,null);
 h.tracker.sharing(s,'live');assert.equal(p.last.screen.state,'live');
 h.advance(5000);h.tracker.sharing(s,'stopped');
 assert.equal(p.last.mode,'active');assert.equal(p.last.screen.state,'stopped');assert.equal(p.last.screen.since,105000);
 s.fire('study-visibility',{visibility:'hidden',sequence:1});h.advance(10000);
 assert.equal(p.last.mode,'away');assert.equal(p.last.since,105000);assert.equal(p.last.screen.since,105000);
 const next=h.socket('next');h.tracker.sharing(next,'live');h.tracker.sharing(s,'stopped');assert.equal(p.last.screen.state,'live');
 h.tracker.sharing(next,'disconnected');assert.equal(p.last.screen.state,'disconnected');
 h.block(true);assert.equal(p.last.mode,'paused');assert.equal(p.last.screen,undefined);
});

test('page departure has a distinct event and timestamp; an unannounced disconnect is never claimed to be a tab closure',()=>{
 const h=harness(),s=h.socket('s'),p=h.socket('p','parent');
 s.fire('study-visibility',{visibility:'hidden',sequence:1});h.advance(5000);
 assert.equal(h.tracker.reportHttp({token:s.data.token,socketId:s.id,visibility:'left',sequence:2}),true);
 assert.equal(p.last.mode,'left');assert.equal(p.last.since,105000);assert.equal(p.last.history[0].kind,'left');
 s.fire('disconnect');assert.equal(p.last.mode,'left');
 const next=h.socket('next');next.fire('study-visibility',{visibility:'visible',sequence:1});assert.equal(p.last.mode,'active');
 next.fire('disconnect');assert.equal(p.last.mode,'disconnected');
});
