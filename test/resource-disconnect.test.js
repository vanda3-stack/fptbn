const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {createStore} = require('../lib/class-resources');
const {createRoomBroadcast} = require('../lib/room-broadcast');

function session(run) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resource-disconnect-'));
    try {
        const file = path.join(dir, 'data.json');
        const store = createStore(file);
        const source = fs.readFileSync(require.resolve('../server.js'), 'utf8');
        const start = source.indexOf('        socket.on(\n            "disconnect",');
        const code = source.slice(start, source.indexOf('\n    }\n);', start));
        const events = [], teachersByClass = new Map(), examTeachers = new Set();
        const clbBroadcast = createRoomBroadcast();
        function disconnect(id, classCode, role = 'teacher') {
            let handler;
            const to = room => ({emit: (name, data) => events.push({room, name, data})});
            const socket = {id, data: {role, classCode}, to, on: (_, fn) => { handler = fn; }};
            vm.runInNewContext(code, {socket, console: {log() {}, error() {}},
                io: {to}, students: new Map(), teachersByClass, examTeachers,
                clbBroadcast, resourceStore: store,
                normalizeClassCode: value => String(value || '').toUpperCase(),
                getClassRoom: value => 'class:' + value});
            handler('transport close');
        }
        run({store, file, events, disconnect, teachersByClass, examTeachers, clbBroadcast});
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

test('closing teacher tab deletes room content on disk and broadcasts removal only to that class', () => session(({store, file, events, disconnect, teachersByClass}) => {
    for (const room of ['A', 'B']) store.change(room, 'add', {type: 'note', title: room, text: 'Reminder'});
    teachersByClass.set('A', 'teacher');
    disconnect('teacher', 'A');
    assert.deepEqual(store.get('A'), []);
    assert.deepEqual(createStore(file).get('A'), []);
    assert.equal(createStore(file).get('B').length, 1);
    const removed = events.find(event => event.name === 'class-resources');
    assert.equal(removed.room, 'class:A');
    assert.equal(removed.data.length, 0);
    assert.equal(events.some(event => event.room === 'class:B'), false);
}));

test('CLB resources remain while another teacher is present and are deleted when the last teacher closes', () => session(({store, file, events, disconnect, examTeachers}) => {
    store.change('EXAM', 'add', {type: 'link', title: 'Practice', url: 'https://example.com'});
    examTeachers.add('a'); examTeachers.add('b');
    disconnect('a', 'EXAM');
    assert.equal(store.get('EXAM').length, 1);
    assert.equal(events.length, 0);
    disconnect('b', 'EXAM');
    assert.deepEqual(store.get('EXAM'), []);
    assert.equal(fs.existsSync(file), false);
    assert.equal(events[0].name, 'class-resources');
}));

test('closing student or superseded teacher sockets cannot erase the active lesson', () => session(({store, disconnect, teachersByClass}) => {
    store.change('A', 'add', {type: 'note', title: 'Practice', text: 'Questions 1–5'});
    teachersByClass.set('A', 'active-teacher');
    disconnect('student', 'A', 'student');
    disconnect('old-teacher', 'A');
    assert.equal(store.get('A').length, 1);
}));
