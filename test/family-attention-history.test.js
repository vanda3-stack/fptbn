'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const createHistory = require('../lib/family-attention-history');

test('journal persists departure, return and duration across reloads without overwriting older incidents', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-history-')), file = path.join(folder, 'data', 'history.json');
    try {
        const journal = createHistory(file);
        journal.begin('away', 1000);journal.begin('away', 1500);journal.finish(16000);
        journal.begin('disconnected', 20000);journal.finish(30000);
        const restored = createHistory(file), rows = restored.recent();
        assert.equal(rows.length, 2);assert.equal(rows[1].startedAt, 1000);assert.equal(rows[1].endedAt, 16000);
        assert.equal(rows[1].durationMs, 15000);assert.equal(rows[1].endReason, 'returned');
        assert.equal(rows[0].kind, 'disconnected');assert.equal(restored.saved, true);
        rows[1].startedAt = 0;assert.equal(restored.recent()[1].startedAt, 1000);
        restored.clear();assert.equal(createHistory(file).recent().length, 0);assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), []);
    } finally {fs.rmSync(folder, {recursive: true, force: true});}
});

test('restart preserves an unfinished incident without inventing a return or a duration', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-history-')), file = path.join(folder, 'history.json');
    try {
        createHistory(file).begin('away', 1000);
        const restored = createHistory(file);restored.finish(60000);
        assert.deepEqual({...restored.recent()[0], id: ''}, {id: '', kind: 'away', startedAt: 1000, endedAt: null, durationMs: null, endReason: 'server-restart'});
        restored.begin('away', 70000);restored.finish(80000);assert.equal(restored.recent().length, 2);
        assert.equal(createHistory(file).recent()[1].endedAt, null);
    } finally {fs.rmSync(folder, {recursive: true, force: true});}
});

test('a new parent login starts empty even if older incidents exist', () => {
    const history = createHistory();history.begin('away', 1000);history.finish(11000);
    const tracker = require('../lib/family-demo-attention')({parents: () => [], blocked: () => false, now: () => 20000, history});
    let snapshot;
    tracker.connect({data: {role: 'parent', child: {id: 1, student_code: 'FBN20310'}}, emit: (_, data) => snapshot = data});
    assert.equal(snapshot.mode, 'waiting');assert.equal(snapshot.history.length, 0);assert.equal(snapshot.historySaved, true);
});

test('malformed existing journal remains intact and reports a save failure', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-history-')), file = path.join(folder, 'history.json');
    try {
        fs.writeFileSync(file, 'broken');
        const history = createHistory(file);history.begin('away', 1000);
        assert.equal(history.saved, false);assert.equal(fs.readFileSync(file, 'utf8'), 'broken');
    } finally {fs.rmSync(folder, {recursive: true, force: true});}
});

test('PH shows fixed timestamps and retained evidence, with no local countdown', () => {
    function node() {return {hidden: true, textContent: '', dataset: {}, children: [], append(child) {this.children.push(child);}, replaceChildren() {this.children = [];}};}
    const ids = ['demoAttention', 'demoAttentionClock', 'demoAttentionMessage', 'demoAttentionSound', 'demoHistory', 'demoHistoryRows', 'demoHistoryEmpty', 'demoHistorySave', 'screenSharingStatus', 'screenSharingMessage', 'screenSharingTime'];
    const elements = Object.fromEntries(ids.map(id => [id, node()])), handlers = {};
    const context = {window: {}, document: {getElementById: id => elements[id], createElement: node}, setInterval() {throw Error('No live countdown should be installed');}};
    vm.runInNewContext(fs.readFileSync('public/ot/demo-attention.js', 'utf8'), context);
    context.window.OTDemoAttention.bind({on: (event, fn) => handlers[event] = fn});
    const since = Date.UTC(2026, 9, 24, 1, 30, 15);
    handlers['study-status']({enabled: true, mode: 'away', level: 'warning', since, historySaved: true,
        history: [{kind: 'away', startedAt: since, endedAt: null, durationMs: null}]});
    assert.equal(elements.screenSharingStatus.hidden,true);
    handlers['study-status']({enabled:true,mode:'away',level:'warning',since,screen:{state:'stopped',since},history:[]});
    assert.equal(elements.screenSharingStatus.hidden,false);
    assert.match(elements.screenSharingMessage.textContent,/Đã dừng chia sẻ/);
    assert.match(elements.screenSharingTime.textContent,/08:30:15/);
    handlers['study-status']({enabled: true, mode: 'away', level: 'warning', since, historySaved: true,
        history: [{kind: 'away', startedAt: since, endedAt: null, durationMs: null}]});
    const stamp = elements.demoAttentionClock.textContent;
    assert.match(stamp, /08:30:15/);assert.match(stamp, /24/);assert.doesNotMatch(stamp, /phút/);
    const row = elements.demoHistoryRows.children[0];assert.equal(row.children[2].textContent, 'Chưa ghi nhận quay lại');
    handlers.disconnect();assert.equal(elements.demoAttentionClock.textContent, stamp);assert.equal(elements.demoHistory.hidden, false);
    handlers['study-status']({enabled: true, mode: 'active', level: 'active', returnedAt: since + 45000, lastDuration: 45000,
        history: [{kind: 'away', startedAt: since, endedAt: since + 45000, durationMs: 45000, endReason: 'returned'}]});
    assert.match(elements.demoHistoryRows.children[0].children[3].textContent, /45 giây/);
    handlers['study-status']({enabled: true, mode: 'paused', level: 'paused'});assert.equal(elements.demoHistory.hidden, true);
});
