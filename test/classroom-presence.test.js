'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const presence = require('../lib/classroom-presence');

function setup() {
    const student = {screenReady: true};
    const students = new Map([['old', student]]);
    const events = [], timers = new Map();
    const tracker = presence(students, (event, id) => events.push([event, id]), {
        schedule(fn, delay) {const timer = {};timers.set(timer, {fn, delay});return timer;},
        cancel(timer) {timers.delete(timer);}
    });
    return {student, students, events, timers, tracker};
}

test('Safari suspension retains attendance and a replacement connection cancels cleanup', () => {
    const {student, students, events, timers, tracker} = setup();
    tracker.disconnect('old', 'ping timeout');
    assert.equal(students.get('old'), student);
    assert.equal(student.connectionPaused, true);
    assert.equal(student.screenReady, false);
    assert.deepEqual(events, [['student-connection-paused', 'old']]);
    const [{fn, delay}] = timers.values();
    assert.equal(delay, 60 * 60 * 1000);
    tracker.remove('old');
    students.set('new', {screenReady: false});
    assert.equal(timers.size, 0);
    fn(); // A stale cleanup cannot remove a replacement or issue an alert.
    assert.equal(students.size, 1);
    assert(students.has('new'));
    assert.equal(events.length, 1);
});

test('unconfirmed closure expires quietly; explicit logout sends a leave alert', () => {
    const suspended = setup();
    suspended.tracker.disconnect('old', 'transport close');
    const [{fn}] = suspended.timers.values();
    fn();
    assert.equal(suspended.students.size, 0);
    assert.deepEqual(suspended.events, [['student-connection-paused', 'old'], ['student-removed', 'old']]);
    const explicit = setup();
    explicit.tracker.disconnect('old', 'client namespace disconnect');
    assert.equal(explicit.students.size, 0);
    assert.deepEqual(explicit.events, [['student-left', 'old']]);
    assert.equal(explicit.timers.size, 0);
});
