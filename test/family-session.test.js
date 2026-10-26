const test = require('node:test'), assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs');

function setup({delayed = false} = {}) {
    const calls = [], saved = {};
    let resolveLogin;
    const response = {ok: true, json: async () => ({success: true, token: 'family-token', student: {student_code: 'FBN12345'}})};
    const context = {sessionStorage: {setItem: (key, value) => saved[key] = value},
        window: {OTFamily: {connect: (...args) => calls.push(['connect', ...args]), attachStream: stream => calls.push(['attach', stream]), disconnect: () => calls.push(['disconnect'])}},
        document: {getElementById: () => ({textContent: ''})},
        fetch: () => {calls.push(['login']); return delayed ? new Promise(resolve => resolveLogin = () => resolve(response)) : Promise.resolve(response);}};
    vm.runInNewContext(fs.readFileSync('public/portal/family-session.js', 'utf8'), context);
    return {session: context.window.FPTBNFamilySession, calls, saved, resolve: () => resolveLogin()};
}

test('initial class confirmation authenticates PH publishing and attaches the existing stream once', async () => {
    const h = setup(), stream = {active: true};
    await h.session.start('FBN12345', stream);
    assert.equal(h.calls.filter(x => x[0] === 'login').length, 1);
    assert.equal(h.calls.find(x => x[0] === 'attach')[1], stream);
    assert.equal(h.saved['ot-student-token'], 'family-token');
    await h.session.start('FBN12345', stream);
    assert.equal(h.calls.filter(x => x[0] === 'attach').length, 1);
    h.session.stop();
    assert.equal(h.calls.at(-1)[0], 'disconnect');
    const next = {active: true};
    await h.session.start('FBN12345', next);
    assert.equal(h.calls.filter(x => x[0] === 'login').length, 1);
    assert.equal(h.calls.at(-1)[1], next);
});

test('a late login response cannot resume PH viewing after the student leaves', async () => {
    const h = setup({delayed: true});
    const pending = h.session.start('FBN12345', {active: true});
    h.session.stop();h.resolve();await pending;
    assert(!h.calls.some(x => x[0] === 'attach' || x[0] === 'connect'));
});

test('unsupported devices authenticate revision without publishing a nonexistent image', async () => {
    const h = setup();await h.session.start('FBN12345', null);
    assert(h.session.identity());
    assert(h.calls.some(x => x[0] === 'connect'));
    assert(!h.calls.some(x => x[0] === 'attach'));
});

test('the main classroom starts family publishing on its first room confirmation', async () => {
    const code = fs.readFileSync('public/js/student.js', 'utf8');
    const block = code.slice(code.indexOf('"class-info",'), code.indexOf('"student-join-error",'));
    const calls = [], context = {joinedClass: true, screenStream: {active: true}, classroomViewOnly: false,
        studentCode: 'FBN12345', studentName: 'HS', studentClassCode: '', studentClassName: '', studentSchoolYear: '',
        studentBadge: {}, studentStatus: {}, console: {log() {}},
        socket: {on: (_name, fn) => context.classInfo = fn, emit() {}},
        window: {dispatchEvent() {}, FPTBNFamilySession: {start: (code, stream) => calls.push({code, stream})}},
        CustomEvent: class {constructor() {}}};
    // Extract the actual handler; stop before the next socket.on registration.
    const end = block.lastIndexOf('socket.on(');
    vm.runInNewContext('socket.on(' + (end > 0 ? block.slice(0, end) : block), context);
    context.classInfo({classCode: '9A3'});
    assert.equal(calls.length, 1);
    assert.equal(calls[0].stream, context.screenStream);
});
