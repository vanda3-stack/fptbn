const test = require('node:test'), assert = require('node:assert/strict');
const identify = require('../lib/student-device');
const vm = require('node:vm'), fs = require('node:fs');

test('device labels distinguish iPad desktop mode, phones and Android tablets without guessing unknown devices', () => {
    for (const [ua, points, label] of [
        ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', 5, 'iPad'],
        ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit Safari/605.1', 5, 'iPad'],
        ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit Safari/605.1', 0, ''],
        ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148', 5, 'iPhone'],
        ['Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile Safari/537', 5, 'Điện thoại Android'],
        ['Mozilla/5.0 (Linux; Android 15; Tablet) Chrome/140 Safari/537', 10, 'Máy tính bảng Android'],
        ['Mozilla/5.0 (Windows NT 10.0) Chrome/140', 10, ''],
        ['', 0, ''],
        ['unknown', 5, ''],
    ]) assert.equal(identify({'user-agent': ua}, {maxTouchPoints: points}), label);
    assert.equal(identify({'user-agent': 'Macintosh'}, {maxTouchPoints: '5'}), '');
    assert.equal(identify({'user-agent': 'Macintosh'}, {maxTouchPoints: 9999}), '');
});

function roster({exam = false, token = 'valid'} = {}) {
    const source = fs.readFileSync('server.js', 'utf8');
    const start = source.indexOf('app.get("/api/teacher/class-roster"');
    const end = source.indexOf('app.get("/api/teacher/classes"', start);
    let handler, result, code = 200;
    const context = {app: {get: (_path, fn) => handler = fn},
        teacherLoginTokens: new Map([['valid', {}]]), normalizeClassCode: value => value,
        students: new Map([['session', {studentId: 1, studentCode: 'FBN12345', name: 'HS', classCode: 'EXAM', device: 'iPad'}]]),
        db: {execute: async sql => sql.startsWith('SELECT c.id') ? [[{id: 1}]] : [[{id: 1, full_name: 'HS'}, {id: 2, full_name: 'HS ngoại tuyến'}]]},
        getClassRoom: code => code,
        io: {in: () => ({fetchSockets: async () => [
            {data: {role: 'student', classCode: '9A3', studentId: 1, device: 'iPad'}},
            {data: {role: 'student', classCode: '9A4', studentId: 2, device: 'iPhone'}},
        ]})}, console};
    vm.runInNewContext(source.slice(start, end), context);
    const response = {status(value) {code = value; return this;}, json(value) {result = value;}};
    return handler({headers: {'x-teacher-token': token}, query: {classCode: exam ? 'EXAM' : '9A3'}}, response).then(() => ({result, code}));
}

test('class roster attaches only current class devices to online students and clears offline labels', async () => {
    const {result} = await roster();
    assert.equal(result.students[0].device, 'iPad');
    assert.equal(result.students[0].online, true);
    assert.equal(result.students[1].device, '');
    assert.equal(result.students[1].online, false);
});

test('exam roster includes device hints and still requires a teacher session', async () => {
    const {result} = await roster({exam: true});
    assert.equal(result.students[0].device, 'iPad');
    assert.equal(result.students[0].online, true);
    assert.equal((await roster({token: ''})).code, 401);
});
