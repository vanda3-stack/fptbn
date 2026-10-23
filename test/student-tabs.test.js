const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

test('portal switches in place, creates review only once and preserves classroom stream and review draft', () => {
    const elements = {}, frames = [], events = [];
    function element(id) {
        return elements[id] ||= {hidden: id === 'reviewPanel', handlers: {}, attrs: {},
            addEventListener(type, fn) {this.handlers[type] = fn;},
            setAttribute(k, v) {this.attrs[k] = v;}, focus() {this.focused = true;},
            append(frame) {frames.push(frame);}};
    }
    const stream = {active: true};
    const context = {joinedClass: true, screenStream: stream,
        document: {getElementById: element, createElement() {
            return {contentWindow: {draft: 'Câu trả lời đang làm', dispatchEvent(e) {events.push(e.detail);}},
                addEventListener(type, fn) {this[type] = fn;}};
        }}, CustomEvent: class {constructor(type, args) {this.type = type; this.detail = args.detail;}}};
    vm.runInNewContext(fs.readFileSync('public/portal/student-tabs.js', 'utf8'), context);
    assert.equal(frames.length, 0);
    element('reviewTab').handlers.click();
    assert.equal(frames.length, 1);
    assert.equal(frames[0].src, '/OT.html?embedded=1');
    assert(element('classPanel').hidden);
    assert(!element('reviewClassNotice').hidden);
    element('classTab').handlers.click();
    assert(element('reviewPanel').hidden);
    assert.equal(events.at(-1), false);
    element('reviewTab').handlers.keydown({key: 'End', preventDefault() {}});
    assert.equal(frames.length, 1);
    assert.equal(frames[0].contentWindow.draft, 'Câu trả lời đang làm');
    assert.equal(context.screenStream, stream);
    assert.equal(element('reviewTab').attrs['aria-selected'], 'true');
});

function boot({embedded = true, code = '', stored = null, savedToken = ''} = {}) {
    const calls = [], els = {code: {}, loginForm: {requestSubmit() {calls.push('submit');}}};
    const context = {location: {origin: 'https://example.test', search: embedded ? '?embedded=1' : ''},
        URLSearchParams, token: savedToken, student: null,
        OTCodes: {middle: s => s.replace(/^FBN/, '')},
        sessionStorage: {getItem: () => JSON.stringify(stored), removeItem: k => calls.push(k)},
        document: {body: {classList: {add() {}}}, head: {append() {}}, createElement: () => ({}), querySelector: () => ({}), getElementById: id => els[id]},
        login: () => calls.push('login'), enterStudy: async () => calls.push('picker'),
        window: {parent: {location: {origin: 'https://example.test'}, document: {getElementById: () => ({value: code})}}, addEventListener() {}}};
    vm.runInNewContext(fs.readFileSync('public/portal/review-embed.js', 'utf8'), context);
    return {calls, els, context};
}

test('review works without screen-capture APIs and authenticates the main-page code instead of another saved student', () => {
    const {calls, els} = boot({code: 'fbn12345', stored: {student_code: 'FBN54321'}, savedToken: 'old-token'});
    assert(calls.includes('ot-student-token'));
    assert(calls.includes('login'));
    assert(calls.includes('submit'));
    assert(!calls.includes('picker'));
    assert.equal(els.code.value, '12345');
});

test('standalone review and matching saved identity keep the existing login flow', () => {
    assert.deepEqual(boot({embedded: false}).calls, ['login']);
    assert.deepEqual(boot({code: 'FBN12345', stored: {student_code: 'FBN12345'}, savedToken: 'token'}).calls, ['picker']);
});

test('a tablet can load class revision packs without capture and keeps its draft on return', async () => {
    const elements = {}, calls = [];
    const node = selector => elements[selector] ||= {hidden: false, innerHTML: '', textContent: ''};
    const context = {navigator: {}, window: {OTFamily: {connect() {assert.fail('Tablet must not require a screen-sharing session');}}},
        document: {documentElement: {dataset: {}}, querySelector: node, querySelectorAll: () => []},
        sessionStorage: {getItem: () => null}, crypto: {randomUUID: () => 'id'},
        fetch: async url => {calls.push(url); return {ok: true, json: async () => ({success: true, packs: []})};},
        alert: message => assert.fail(message)};
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('public/ot/student.js', 'utf8'), context);
    await vm.runInContext("token='token';student={full_name:'HS',class_code:'9A3'};enterStudy()", context);
    assert.deepEqual(calls, ['/api/ot/packs']);
    assert.equal(node('#app').hidden, false);
    node('#app').innerHTML = 'Bài đang làm';
    await vm.runInContext('enterStudy()', context);
    assert.equal(node('#app').innerHTML, 'Bài đang làm');
    assert.equal(calls.length, 1);
});
