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
    assert.equal(frames[0].src, '/ontap?embedded=1');
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
        formatStudentCode: s => s.toUpperCase(),
        sessionStorage: {getItem: () => JSON.stringify(stored), removeItem: k => calls.push(k)},
        document: {body: {classList: {add() {}}}, head: {append() {}}, createElement: () => ({}), getElementById: id => els[id]},
        login: () => calls.push('login'), picker: async () => calls.push('picker'),
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
    assert.equal(els.code.value, 'FBN12345');
});

test('standalone review and matching saved identity keep the existing login flow', () => {
    assert.deepEqual(boot({embedded: false}).calls, ['login']);
    assert.deepEqual(boot({code: 'FBN12345', stored: {student_code: 'FBN12345'}, savedToken: 'token'}).calls, ['picker']);
});
