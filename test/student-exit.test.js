'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
function main(accepted) {
    const calls = [], handlers = {}, button = {hidden: true}, track = {onended() {}, stop: () => calls.push('track')};
    const context = {joinedClass: true, screenStream: {getTracks: () => [track]}, confirm: () => {calls.push('confirm');return accepted;},
        window: {addEventListener: (name, fn) => handlers[name] = fn, FPTBNFamilySession: {stop: () => calls.push('family')}},
        document: {getElementById: id => id === 'studentExit' ? button : {contentWindow: {OTSpeech: {cancel: () => calls.push('speech')}, OTStudy: {stop: () => calls.push('study')}}}},
        sessionStorage: {getItem: () => 'token', removeItem: key => calls.push(key)}, fetch: () => {calls.push('logout');return Promise.resolve();},
        closeStudentPeer: () => calls.push('studentPeer'), closeTeacherPeer: () => calls.push('teacherPeer'),
        socket: {disconnect: () => calls.push('socket')}, location: {replace: path => calls.push(path)}};
    vm.runInNewContext(fs.readFileSync('public/portal/student-exit.js', 'utf8'), context);
    return {context, calls, handlers, button, track};
}
test('cancel exit keeps the student session and both screen connections intact', () => {
    const h = main(false);h.handlers['student-portal-access']({detail: true});assert.equal(h.button.hidden, false);
    h.button.onclick();assert.deepEqual(h.calls, ['confirm']);assert.equal(h.context.joinedClass, true);assert(h.context.screenStream);
});
test('confirmed exit stops capture, closes peers, revokes revision login and returns to entry without another unload prompt', () => {
    const h = main(true);h.button.onclick();
    assert.equal(h.context.joinedClass, false);assert.equal(h.context.screenStream, null);assert.equal(h.track.onended, null);
    assert.deepEqual(h.calls, ['confirm', 'logout', 'speech', 'study', 'family', 'studentPeer', 'teacherPeer', 'track', 'socket', 'ot-student-token', 'ot-student-info', '/']);
    assert.equal(h.button.disabled, true);
});
test('standalone revision logout confirms before clearing progress or disconnecting', async () => {
    let accept = false;const button = {}, calls = [];
    const context = {token: 'token', student: {}, pack: {}, $: () => button, confirm: () => accept,
        OTSpeech: {cancel: () => calls.push('speech')}, OTStudy: {stop: () => calls.push('study')}, api: async () => calls.push('logout'),
        sessionStorage: {removeItem: key => calls.push(key)}, login: () => calls.push('login'), window: {addEventListener() {}}};
    const source = fs.readFileSync('public/ot/student.js', 'utf8');
    vm.runInNewContext(source.slice(source.indexOf("$('#logout').onclick=")), context);
    await button.onclick();assert.deepEqual(calls, []);assert.equal(context.token, 'token');
    accept = true;await button.onclick();assert.equal(context.token, '');assert.equal(context.pack, null);assert.equal(calls.at(-1), 'login');
});

test('standalone tab closure asks the browser to confirm only while logged in', () => {
    const win = {};win.parent = win;let handler, prevented = 0;
    const context = {window: win, token: 'token', student: {}, addEventListener: (_, fn) => handler = fn};
    const source = fs.readFileSync('public/ot/student.js', 'utf8');
    vm.runInNewContext(source.slice(source.lastIndexOf("globalThis.addEventListener?.('beforeunload'")), context);
    handler({preventDefault: () => prevented++});assert.equal(prevented, 1);
    context.token = '';handler({preventDefault: () => prevented++});assert.equal(prevented, 1);
});
