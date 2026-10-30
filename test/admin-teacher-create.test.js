const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const start = serverSource.indexOf('app.post("/api/admin/teachers", async (req, res) => {');
const end = serverSource.indexOf("// ADMIN - UPDATE TEACHER (POST)", start);
assert.ok(start >= 0 && end > start, "Teacher creation route must exist");
const routeSource = serverSource.slice(start, end);

function createRoute(existingTeachers = []) {
    let handler;
    const queries = [];
    const app = {
        post(route, callback) {
            assert.equal(route, "/api/admin/teachers");
            handler = callback;
        }
    };
    const db = {
        async query(sql, params) {
            queries.push({ sql, params });
            if (/SELECT id\s+FROM teachers/i.test(sql)) return [existingTeachers];
            if (/INSERT INTO teachers/i.test(sql)) return [{ insertId: 123 }];
            throw new Error("Unexpected database query");
        }
    };
    vm.runInNewContext(routeSource, { app, db, console: { error() {} } });
    assert.equal(typeof handler, "function");
    return { handler, queries };
}

async function request(body, existingTeachers = []) {
    const { handler, queries } = createRoute(existingTeachers);
    const response = { statusCode: 200, body: undefined };
    const res = {
        status(code) { response.statusCode = code; return this; },
        json(payload) { response.body = payload; return this; }
    };
    await handler({ body }, res);
    return { ...response, queries };
}

test("accepts a valid FE teacher email and creates one account", async () => {
    const result = await request({ email: "  GV.Test@fe.edu.vn  ", full_name: " Giáo viên Thử nghiệm " });
    assert.equal(result.statusCode, 201);
    assert.equal(result.body.success, true);
    assert.equal(result.body.teacher.email, "gv.test@fe.edu.vn");
    assert.equal(result.body.teacher.full_name, "Giáo viên Thử nghiệm");
    assert.equal(result.queries.filter(q => /INSERT INTO teachers/i.test(q.sql)).length, 1);
});

test("rejects non-FE email before touching the database", async () => {
    for (const email of ["gv@example.org", "gv@fe.edu.vn.attacker.test", "gv@feXeduXvn"]) {
        const result = await request({ email, full_name: "Giáo viên Thử nghiệm" });
        assert.equal(result.statusCode, 400, email);
        assert.equal(result.body.success, false, email);
        assert.equal(result.queries.length, 0, email);
    }
});

test("rejects duplicate teacher email without inserting a new teacher", async () => {
    const result = await request(
        { email: "gv.test@fe.edu.vn", full_name: "Giáo viên Thử nghiệm" },
        [{ id: 123 }]
    );
    assert.equal(result.statusCode, 409);
    assert.equal(result.queries.filter(q => /INSERT INTO teachers/i.test(q.sql)).length, 0);
});
