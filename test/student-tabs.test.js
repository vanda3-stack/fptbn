const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

test('portal switches in place, creates review only once and preserves classroom stream and review draft', () => {
    const elements = {}, frames = [], events = [], handlers = {};
    function element(id) {
        return elements[id] ||= {hidden: id === 'reviewPanel', handlers: {}, attrs: {},
            addEventListener(type, fn) {this.handlers[type] = fn;},
            setAttribute(k, v) {this.attrs[k] = v;}, focus() {this.focused = true;},
            append(frame) {frames.push(frame);}};
    }
    const stream = {active: true};
    const context = {URLSearchParams, location: {search: ''}, Event: class {constructor(type){this.type=type;}}, joinedClass: true, screenStream: stream, window: {dispatchEvent() {}, addEventListener(type, fn) {handlers[type] = fn;}},
        document: {getElementById: element, createElement() {
            return {contentWindow: {draft: 'Câu trả lời đang làm', dispatchEvent(e) {events.push(e.detail);}},
                addEventListener(type, fn) {this[type] = fn;}};
        }}, CustomEvent: class {constructor(type, args) {this.type = type; this.detail = args.detail;}}};
    vm.runInNewContext(fs.readFileSync('public/portal/student-tabs.js', 'utf8'), context);
    assert.equal(frames.length, 0);
    assert.equal(element('studentTabs').hidden, true);
    element('reviewTab').handlers.click();
    assert.equal(frames.length, 0, 'review stays unavailable before successful login and capture');
    handlers['student-portal-access']({detail: true});
    assert.equal(element('studentTabs').hidden, false);
    element('reviewTab').handlers.click();
    assert.equal(frames.length, 1);
    assert.equal(frames[0].src, '/portal/review?embedded=1');
    assert(element('classPanel').hidden);
    assert(!element('reviewClassNotice').hidden);
    element('classTab').handlers.click();
    assert(element('reviewPanel').hidden);
    assert.equal(events.at(-1), false);
    element('classTab').handlers.keydown({key: 'ArrowRight', preventDefault() {}});
    assert.equal(frames.length, 1);
    assert.equal(frames[0].contentWindow.draft, 'Câu trả lời đang làm');
    assert.equal(context.screenStream, stream);
    assert.equal(element('reviewTab').attrs['aria-selected'], 'true');
    handlers['student-portal-access']({detail: false});
    assert.equal(element('studentTabs').hidden, true);
    assert.equal(element('classPanel').hidden, false);
    assert.equal(element('reviewPanel').hidden, true);
    assert.equal(events.at(-1), false);
    element('reviewTab').handlers.click();
    assert.equal(element('reviewPanel').hidden, true);

});

function boot({embedded = true, code = '', stored = null, savedToken = '', parentSession = null} = {}) {
    const calls = [], embedEvents = {}, els = {code: {}, loginForm: {requestSubmit() {calls.push('submit');}}};
    const context = {location: {origin: 'https://example.test', search: embedded ? '?embedded=1' : ''},
        URLSearchParams, token: savedToken, student: null,
        formatStudentCode: s => s.toUpperCase(),
        sessionStorage: {getItem: () => JSON.stringify(stored), removeItem: k => calls.push(k)},
        document: {body: {classList: {add() {}}}, head: {append() {}}, createElement: () => ({}), querySelector: () => ({}), getElementById: id => els[id]},
        login: () => calls.push('login'), picker: async () => calls.push('picker'),
        window: {parent: {location: {origin: 'https://example.test'}, FPTBNFamilySession: {identity: () => parentSession}, document: {getElementById: () => ({value: code})}}, addEventListener(type, handler) {embedEvents[type] = handler;}}};
    vm.runInNewContext(fs.readFileSync('public/portal/review-embed.js', 'utf8'), context);
    return {calls, els, context, embedEvents};
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

test('a tablet can load class revision packs without capture and keeps its draft on return', async () => {
    const elements = {}, calls = [];
    const node = selector => elements[selector] ||= {hidden: false, innerHTML: '', textContent: ''};
    const context = {navigator: {}, window: {OTFamily: {connect() {assert.fail('Tablet must not require a screen-sharing session');}}},
        document: {body:{classList:{remove(){}}},documentElement: {dataset: {}}, querySelector: node, querySelectorAll: () => []},
        sessionStorage: {getItem: () => null}, crypto: {randomUUID: () => 'id'},
        fetch: async url => {calls.push(url); return {ok: true, json: async () => ({success: true, packs: []})};},
        alert: message => assert.fail(message)};
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('public/ot/student.js', 'utf8'), context);
    await vm.runInContext("token='token';student={full_name:'HS',class_code:'9A3'};picker()", context);
    assert.deepEqual(calls, ['/api/ot/packs']);
    assert.equal(node('#app').hidden, false);
    node('#app').innerHTML = 'Bài đang làm';
    // Returning to a mounted portal does not call picker or reload the exercise.
    assert.equal(node('#app').innerHTML, 'Bài đang làm');
    assert.equal(calls.length, 1);
});


test('embedded full revision reuses initial login and switching tabs leaves parent publishing untouched', () => {
 const parentSession={token:'from-homepage',student:{student_code:'FBN12345'}};
 const h=boot({code:'FBN12345',parentSession});
 assert.equal(h.context.token,'from-homepage');assert.deepEqual(h.calls,['picker']);
 h.context.window.OTFamily={disconnect(){assert.fail('Tab changes must not disconnect PH')}};
 h.embedEvents['ot-portal-visibility']({detail:false});
 h.embedEvents['ot-portal-visibility']({detail:true});
 assert.deepEqual(h.calls,['picker'],'Returning must preserve the exercise instead of loading packs again');
});
