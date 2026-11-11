'use strict';

const RETAIN_MS = 60 * 60 * 1000;

// A transport drop cannot tell us whether the browser is suspended or closed.
module.exports = function classroomPresence(students, notify, {schedule = setTimeout, cancel = clearTimeout} = {}) {
    const pending = new Map();

    function remove(id) {
        if (pending.has(id)) cancel(pending.get(id));
        pending.delete(id);
        return students.delete(id);
    }

    return {
        remove,
        disconnect(id, reason) {
            const student = students.get(id);
            if (!student || pending.has(id)) return;
            if (reason === 'client namespace disconnect') {
                remove(id);
                notify('student-left', id, student);
                return;
            }
            student.connectionPaused = true;
            student.screenReady = false;
            const timer = schedule(() => {
                if (students.get(id) !== student) return;
                remove(id);
                notify('student-removed', id, student);
            }, RETAIN_MS);
            pending.set(id, timer);
            timer.unref?.();
            notify('student-connection-paused', id, student);
        }
    };
};
