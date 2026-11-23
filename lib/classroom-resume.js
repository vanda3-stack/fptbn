'use strict';

// Only a server-issued credential for the retained classroom session may bypass
// the new-entry gate. Knowing a student ID or a class code is not sufficient.
module.exports = function canResumeClass(entry, student, token) {
    return Boolean(entry && typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) &&
        entry.resumeToken === token && Number(entry.studentId) === Number(student.student_id) &&
        Number(entry.classId) === Number(student.class_id) && entry.classCode === student.roomCode);
};
