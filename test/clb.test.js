const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createRoomBroadcast} = require('../lib/room-broadcast');

// Execute the production Socket.IO handlers with two teacher sockets.
function room() {
    const source = fs.readFileSync(require.resolve('../server.js'), 'utf8');
    const start = source.indexOf('// TEACHER START / STOP SHARE');
    const code = source.slice(start, source.indexOf('// END CLASS', start));
    const broadcast = createRoomBroadcast();
    const events = [];
    function client(id, role = 'teacher', classCode = 'EXAM') {
        const handlers = {};
        const socket = {
            id, data: {role, classCode},
            on: (name, handler) => { handlers[name] = handler; },
            to: room => ({emit: name => events.push({id, room, name})})
        };
        vm.runInNewContext(code, {socket, clbBroadcast: broadcast,
            normalizeClassCode: value => value, getClassRoom: value => 'class:' + value});
        return handlers;
    }
    return {client, events, broadcast};
}

test('CLB presenter broadcasts; another teacher cannot interrupt or stop it', () => {
    const {client, events, broadcast} = room();
    const a = client('a'), b = client('b');
    let result;
    a['teacher-share-started'](response => { result = response; });
    assert.equal(result.success, true);
    assert.equal(events.length, 1);
    assert.equal(events[0].room, 'class:EXAM');
    b['teacher-share-started'](response => { result = response; });
    assert.equal(result.success, false);
    b['teacher-share-stopped']();
    assert.equal(events.length, 1);
    assert.equal(broadcast.owns('a'), true);
    a['teacher-share-stopped']();
    assert.equal(events[1].name, 'teacher-share-stopped');
    b['teacher-share-started'](response => { result = response; });
    assert.equal(result.success, true);
});

test('students cannot start broadcasts; ordinary classes remain independent', () => {
    const {client, events} = room();
    client('student', 'student')['teacher-share-started']();
    assert.equal(events.length, 0);
    client('a')['teacher-share-started']();
    client('b', 'teacher', '9A3')['teacher-share-started']();
    assert.equal(events.length, 2);
    assert.equal(events[1].room, 'class:9A3');
});

test('teacher ready restores sharing, removes old exam resources and labels CLB', () => {
    const nodes = new Map();
    const get = id => {
        if (!nodes.has(id)) nodes.set(id, {style: {}, addEventListener() {}});
        return nodes.get(id);
    };
    const handlers = {};
    const code = fs.readFileSync(require.resolve('../public/js/teacher-login.js'), 'utf8');
    vm.runInNewContext(code, {
        document: {getElementById: get},
        socket: {on: (name, handler) => { handlers[name] = handler; }}
    });
    handlers['teacher-ready']({class: {class_code: 'EXAM'}, teacher: {full_name: 'GV'}});
    assert.equal(get('shareTeacher').style.display, '');
    assert.match(get('endClass').textContent, /CLB/);
    assert.match(get('teacherIdentity').textContent, /CLB/);
    assert.equal(nodes.has('teacherExamResources'), false);
    handlers['teacher-ready']({class: {class_code: '9A3'}});
    assert.match(get('endClass').textContent, /Kết thúc lớp/);
});

test('CLB page has a visible teacher video and no fixed exam links', () => {
    const html = fs.readFileSync(require.resolve('../public/clb.html'), 'utf8');
    assert.match(html, /window.FPTBN_EXAM_MODE = true/);
    assert.match(html, /window.FPTBN_CLB_MODE = true/);
    assert.match(html, /<video\s+id="teacherVideo"\s+autoplay\s+playsinline\s*>/);
    assert.doesNotMatch(html, /forms\.gle|LevelUp-2\.1|Tài nguyên phòng thi/);
});
