const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = file => fs.readFileSync(path.join(__dirname, "..", "public", file), "utf8");

test("exam page provides room information without external resource cards", () => {
    const page = html("exam.html");
    assert.match(page, /Phòng thi trực tuyến/);
    assert.doesNotMatch(page, /Tài nguyên phòng thi|forms\.gle\/zdrRxyh1kQZQRXq98|LevelUp-2\.1\.pdf/);
    assert.match(page, /id="teacherVideo"/);
    assert.match(page, /window\.FPTBN_EXAM_MODE = true/);
    assert.match(page, /src="\/js\/student\.js/);
});

test("exam roster lists active participants while ordinary classes keep absence filter", () => {
    const page = html("x.html");
    assert.match(page, /exam\?"👥 Học sinh tham gia phòng thi"/);
    assert.match(page, /filter=cls==="EXAM"\?"online":"missing"/);
    assert.match(page, /tabs\.hidden=exam/);
    assert.match(page, /s\.original_class/);
    assert.match(page, /s\.student_code/);
    assert.match(page, /socket\.on\("student-joined",refresh\)/);
    assert.match(page, /socket\.on\("student-left",refresh\)/);
    const inline = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
        .map(match => match[1]).filter(script => script.trim());
    for (const script of inline) new vm.Script(script);
});
