const test=require('node:test'),assert=require('node:assert/strict'),A=require('../public/ot/attention-core');
test('attention reminders are scoped to an active practice and deduplicated until acknowledged',()=>{let s=A.create();assert.equal(A.leave(s,'blur'),false);A.start(s,'quiz:1');assert(A.leave(s,'hidden'));assert.equal(A.leave(s,'blur'),false);A.start(s,'quiz:1');assert.equal(s.count,1);assert(s.pending);A.acknowledge(s);assert(A.leave(s,'blur'));assert.equal(s.count,2);A.stop(s);assert.equal(A.leave(s,'hidden'),false);A.start(s,'quiz:2');assert.equal(s.count,0)});
test('practice stays active across browser tab changes without a reminder', () => {
    const vm = require('node:vm'), fs = require('node:fs');
    const events = new Map(), badge = {};
    const document = {hidden:false, createElement: () => badge, querySelector: () => ({append() {}}),
        addEventListener(name, handler) {events.set(name, handler);}};
    const context = {document, window: {addEventListener(name, handler) {events.set(name, handler);}}};
    vm.runInNewContext(fs.readFileSync('public/ot/study-guard.js','utf8'), context);
    assert.equal(badge.hidden, true);
    context.OTStudy.start('quiz:1');assert.equal(badge.hidden, false);
    document.hidden = true;events.get('visibilitychange')?.();
    document.hidden = false;events.get('visibilitychange')?.();
    assert.equal(badge.hidden, false);assert.equal(badge.textContent, '● Đang ôn tập');
    context.OTStudy.setVisible(false);assert.equal(badge.hidden, true);
    context.OTStudy.setVisible(true);assert.equal(badge.hidden, false);
    context.OTStudy.stop();assert.equal(badge.hidden, true);
});
