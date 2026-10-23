const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function setup({capture = 'unsupported', duplicate = false} = {}) {
    const elements = {}, handlers = {}, sent = [], events = [], alerts = [];
    const element = id => elements[id] ||= {value: '', textContent: '', disabled: false, style: {},
        addEventListener(type, fn) {this[type] = fn;}, focus() {}};
    let captures = 0;
    const track = {getSettings: () => ({displaySurface: 'monitor'}), addEventListener() {}};
    const stream = {active: true, getVideoTracks: () => [track], getTracks: () => [track]};
    const socket = {connected: true, on(name, fn) {handlers[name] = fn;}, emit(name, data) {sent.push({name, data});}};
    const context = {io: () => socket, navigator: capture === 'unsupported' ? {maxTouchPoints: 5} : {mediaDevices: {getDisplayMedia() {}}},
        FPTBNScreenCapture: {async capture() {captures++; if (capture === 'not-supported') throw Object.assign(new Error('Unsupported'), {name: 'NotSupportedError'}); if (capture === 'denied') throw Object.assign(new Error('Permission denied'), {name: 'NotAllowedError'}); return stream;}},
        document: {getElementById: element},
        window: {addEventListener() {}, dispatchEvent(event) {events.push(event);}},
        CustomEvent: class {constructor(type, options) {this.type = type; this.detail = options.detail;}},
        console: {log() {}, error() {}, warn() {}}, alert(message) {alerts.push(message);},
        fetch: async url => ({ok: true, json: async () => url.endsWith('/session-check') ? {success: true, alreadyActive: duplicate} : {success: true, student: {id: 1, student_code: 'FBN12345', full_name: 'HS', class_id: 1, class_code: '9A3', school_year: '2026-2027'}}})};
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('public/js/student.js', 'utf8'), context);
    element('studentCode').value = 'FBN12345';
    return {context, element, handlers, sent, events, alerts, get captures() {return captures;}};
}

test('unsupported mobile browser enters class and gets tabs without advertising a live student screen', async () => {
    const h = setup();
    assert.equal(h.element('shareButton').textContent, 'Vào lớp học →');
    await h.element('shareButton').click();
    assert.equal(h.captures, 0);
    assert(h.sent.some(event => event.name === 'student-join'));
    assert.equal(h.element('joinPage').style.display, 'none');
    assert.equal(h.element('classroom').style.display, 'block');
    h.handlers['class-info']({classCode: '9A3', teacherOnline: true});
    assert(h.events.some(event => event.type === 'student-portal-access' && event.detail === true));
    assert(!h.sent.some(event => event.name === 'screen-ready'));
    assert.match(h.element('studentStatus').textContent, /không hỗ trợ chia sẻ/);
});

test('desktop still captures a full screen and registers it as ready after room confirmation', async () => {
    const h = setup({capture: 'supported'});
    await h.element('shareButton').click();
    assert.equal(h.captures, 1);
    h.handlers['class-info']({classCode: '9A3'});
    assert(h.sent.some(event => event.name === 'screen-ready'));
    assert(h.events.some(event => event.type === 'student-portal-access' && event.detail === true));
});

test('desktop permission rejection and duplicate sessions cannot enter class through the mobile fallback', async () => {
    for (const options of [{capture: 'denied'}, {duplicate: true}]) {
        const h = setup(options);
        await h.element('shareButton').click();
        assert(!h.sent.some(event => event.name === 'student-join'));
        assert(!h.events.some(event => event.detail === true));
        assert.equal(h.element('shareButton').disabled, false);
    }
});


test('a browser exposing an unavailable capture API can still enter without a student screen', async () => {
    const h = setup({capture: 'not-supported'});
    await h.element('shareButton').click();
    assert.equal(h.captures, 1);
    h.handlers['class-info']({classCode: '9A3'});
    assert(h.sent.some(event => event.name === 'student-join'));
    assert(!h.sent.some(event => event.name === 'screen-ready'));
    assert(h.events.some(event => event.type === 'student-portal-access' && event.detail === true));
});


test('view-only tablets rejoin after a transport reconnect and resend device hints', async () => {
 const h=setup();await h.element('shareButton').click();
 h.handlers.connect();
 const joins=h.sent.filter(event=>event.name==='student-join');
 assert.equal(joins.length,2);
 assert.equal(joins[0].data.device.maxTouchPoints,5);
 assert.equal(joins[1].data.device.maxTouchPoints,5);
 assert.equal(h.captures,0);
});
