const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = file => fs.readFileSync(path.join(__dirname, "..", "public", file), "utf8");

test("exam page provides room information without external resource cards", () => {
    const page = html("exam.html");
    assert.match(page, /Phòng thi trực tuyến/);
    assert.match(page, /class="exam-room-info"/);
    assert.match(page, /Giáo viên giám sát trong suốt thời gian thi\./);
    assert.match(page, /Giữ kết nối và báo giáo viên khi gặp sự cố\./);
    assert.match(page, /\.exam-room-info h1\s*\{/);
    assert.match(page, /text-wrap:balance/);
    assert.match(page, /white-space:nowrap/);
    assert.doesNotMatch(page, /Học sinh tham gia bằng mã học sinh của mình|Trong thời gian thi, hãy duy trì kết nối/);

    assert.doesNotMatch(page, /Tài nguyên phòng thi|forms\.gle\/zdrRxyh1kQZQRXq98|LevelUp-2\.1\.pdf/);
    assert.match(page, /id="teacherVideo"/);
    assert.match(page, /window\.FPTBN_EXAM_MODE = true/);
    assert.match(page, /src="\/js\/student\.js/);
});

test("EXAM and CLB rosters show online participants while ordinary classes keep absence filter", () => {
    const page = html("x.html");
    assert.match(page, /exam\?"👥 Học sinh tham gia phòng thi"/);
    assert.match(page, /filter=\["EXAM","CLB"\]\.includes\(cls\)\?"online":"missing"/);
    assert.match(page, /isMixedRoom/);
    assert.match(page, /Học sinh tham gia CLB/);
    assert.match(page, /tabs\.hidden=exam/);
    assert.match(page, /s\.original_class/);
    assert.match(page, /s\.student_code/);
    assert.match(page, /socket\.on\("student-joined",refresh\)/);
    assert.match(page, /socket\.on\("student-left",refresh\)/);
    const inline = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
        .map(match => match[1]).filter(script => script.trim());
    for (const script of inline) new vm.Script(script);
});


test("exam teacher view has no floating resource widget and retains student messaging", () => {
    const teacherPage = html("x.html");
    const loginScript = fs.readFileSync(path.join(__dirname, "..", "public", "js", "teacher-login.js"), "utf8");
    const messagingScript = fs.readFileSync(path.join(__dirname, "..", "public", "js", "class-resources.js"), "utf8");
    assert.doesNotMatch(loginScript, /teacherExamResources|Tài nguyên phòng thi|Game Manual/);
    assert.match(teacherPage, /src="\/js\/class-resources\.js"/);
    assert.match(messagingScript, /Gửi thông tin đến HS/);
    const nodes = new Map();
    const ids = [
        "teacherLoginPage", "teacherApp", "teacherEmail", "teacherPassword",
        "teacherLoginButton", "teacherClassRow", "teacherClassSelect",
        "teacherEnterClassButton", "teacherLoginStatus", "teacherIdentity",
        "shareTeacher", "endClass"
    ];
    for (const id of ids) {
        nodes.set(id, { style: {}, addEventListener() {}, value: "", textContent: "", disabled: false });
    }
    const listeners = new Map();
    const created = [];
    const document = {
        getElementById(id) { return nodes.get(id) || null; },
        createElement(tag) { created.push(tag); return {}; }
    };
    const socket = {
        on(event, listener) { listeners.set(event, listener); },
        emit() {}
    };
    vm.runInNewContext(loginScript, { document, socket, console: { error() {} } }, { timeout: 1000 });
    const onTeacherReady = listeners.get("teacher-ready");
    assert.equal(typeof onTeacherReady, "function");
    onTeacherReady({ class: { class_code: "EXAM" }, teacher: { full_name: "Test teacher" } });
    assert.deepEqual(created, []);
    assert.equal(nodes.get("teacherApp").style.display, "block");
    assert.equal(nodes.get("shareTeacher").style.display, "none");
    assert.equal(nodes.get("endClass").textContent, "🚪 Rời phòng thi");
    onTeacherReady({ class: { class_code: "CLB" }, teacher: { full_name: "Test teacher" } });
    assert.equal(nodes.get("shareTeacher").style.display, "");
});


test("teacher device badge identifies an unshared iPad, iPhone or tablet and hides when sharing starts", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "public", "js", "teacher.js"), "utf8");
    const badge = {hidden: true};
    const context = {document: {getElementById: id => id === "student-device-1" ? badge : null}};
    const start = source.indexOf("function studentDeviceLabel(");
    const end = source.indexOf("function updateStudentCard(", start);
    vm.runInNewContext(source.slice(start, end), context);
    for (const [device, label] of [["iPad", "iPad"], ["iPhone", "iPhone"], ["Máy tính bảng Android", "Tablet"], ["Máy tính bảng", "Tablet"]]) {
        context.setStudentDeviceBadge("1", device, false);
        assert.equal(badge.hidden, false);
        assert.equal(badge.textContent, label);
        context.setStudentDeviceBadge("1", device, true);
        assert.equal(badge.hidden, true);
    }
    context.setStudentDeviceBadge("1", "", false);
    assert.equal(badge.hidden, true);
});


test("the teacher grid drops a disconnected student silently and shows them again on reconnect", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "public", "js", "teacher.js"), "utf8");
    const events = new Map(), studentNames = new Map(), cards = new Set();
    const context = {
        console: {log() {}}, socket: {on: (event, callback) => events.set(event, callback)},
        studentNames, teacherStream: null, updateCount() {},
        updateStudentCard(student) {studentNames.set(student.id, student.name);cards.add(student.id);},
        removeStudent(id) {studentNames.delete(id);cards.delete(id);},
        showStudentLeftAlert() {assert.fail("a transport pause must never report an exit");}
    };
    const start = source.indexOf('socket.on("student-connection-paused"');
    const end = source.indexOf('socket.on(\n    "student-screen-ready"', start);
    vm.runInNewContext(source.slice(start, end), context);
    const student = {id: "before", name: "HS"};
    events.get("student-list")([student]);
    assert.deepEqual([...cards], ["before"]);
    events.get("student-connection-paused")(student);
    assert.equal(cards.size, 0);
    assert.equal(studentNames.size, 0);
    events.get("student-list")([{...student, connectionPaused: true}]);
    assert.equal(cards.size, 0);
    events.get("student-joined")({...student, id: "after", replacesId: "before"});
    assert.deepEqual([...cards], ["after"]);
});
