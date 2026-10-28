const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');

test('teacher presence blocks only that class and exam participants, including multiple exam proctors', () => {
    const source = fs.readFileSync('server.js', 'utf8');
    const match = source.match(/isParentViewingBlocked: (child => \{[\s\S]*?\n    \})\n\}\);/);
    assert(match);
    const teachersByClass = new Map(), examTeachers = new Set(), students = new Map();
    const policy = vm.runInNewContext('(' + match[1] + ')', {teachersByClass, examTeachers, students, normalizeClassCode: code => String(code).toUpperCase()});
    const a = {id: 1, class_code: '9A3'}, b = {id: 2, class_code: '9A2'};
    assert.equal(policy(a), false);
    teachersByClass.set('9A3', 'teacher');
    assert.equal(policy(a), true);assert.equal(policy(b), false);
    teachersByClass.clear();
    examTeachers.add('first');examTeachers.add('second');students.set('s', {studentId: 1, classCode: 'EXAM'});
    assert.equal(policy(a), true);assert.equal(policy(b), false);
    examTeachers.delete('first');assert.equal(policy(a), true);
    examTeachers.delete('second');assert.equal(policy(a), false);
});
