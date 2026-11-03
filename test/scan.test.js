"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const Core = require("../lib/scan-core"),
  { createStore } = require("../lib/scan-store");
const express = require("express"),
  mount = require("../lib/scan");
function exam() {
  return {
    title: "Tin 9 / Đề 01",
    key: Array(20).fill("A"),
    quizPoint: 0.25,
    essays: [
      { ideas: [{ text: "Ý 1", points: 2.5 }] },
      { ideas: [{ text: "Ý 2", points: 2.5 }] },
    ],
    layout: {},
    sheetUrl: "",
  };
}
function review() {
  return {
    code: "00125",
    answers: Array(20).fill("A"),
    essayScores: [[2.5], [2]],
    texts: ["A", "B"],
    manualScore: 9,
    verified: true,
  };
}
test("exam enforces 20 answers, ten points and bounded regions", () => {
  assert.equal(Core.validateExam(exam()).maximum, 10);
  for (const e of [
    { ...exam(), key: ["A"] },
    { ...exam(), quizPoint: 0 },
    { ...exam(), layout: { q1: { page: 0, x: 0.9, y: 0, w: 0.2, h: 0.2 } } },
    { ...exam(), essays: [{ ideas: [] }, { ideas: [] }] },
  ])
    assert.throws(() => Core.validateExam(e));
});
test("grading: unknown is pending, explicit blank is zero, rubric and hand grade independent", () => {
  const e = exam(),
    b = review(),
    r = Core.review(e, b, true);
  assert.equal(r.total, 9.5);
  assert.equal(r.difference, 0.5);
  assert.equal(r.code, "00125");
  b.answers[0] = "";
  assert.equal(Core.review(e, b, false).total, null);
  assert.throws(() => Core.review(e, b, true));
  b.answers[0] = "BLANK";
  assert.equal(Core.review(e, b, true).total, 9.25);
  b.essayScores[0][0] = 3;
  assert.throws(() => Core.review(e, b, true));
  b.essayScores[0][0] = null;
  assert.throws(() => Core.review(e, b, true));
  assert.throws(() => Core.review(e, { ...review(), verified: false }, true));
});
test("Docs parser never invents answers and rejects conflicting keys", () => {
  const r = Core.parseDoc("1. A | 2. B\nTL1\n0,5 | Đúng ý\nTL2\n1 | Ý tiếp");
  assert.equal(r.key[0], "A");
  assert.equal(r.key[1], "B");
  assert.equal(r.key[2], "");
  assert.equal(r.essays[0].ideas[0].points, 0.5);
  assert.throws(() => Core.parseDoc("1. A\n1. B"));
  for (const url of [
    "https://docs.google.com.evil.test/document/d/abcdefghijk",
    "http://docs.google.com/document/d/abcdefghijk",
    "https://docs.google.com/spreadsheets/d/abcdefghijk",
    "https://user:pass@docs.google.com/document/d/abcdefghijk",
  ])
    assert.throws(() => Core.googleId(url, "doc"));
});
test("store survives restart, preserves zero codes, and isolates teacher paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-"));
  try {
    const s = createStore(root),
      e = {
        ...exam(),
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
    s.saveExam(1, e);
    const p = {
      id: crypto.randomUUID(),
      code: "00125",
      createdAt: new Date().toISOString(),
    };
    s.savePaper(1, e.id, p);
    assert.equal(createStore(root).papers(1, e.id)[0].code, "00125");
    assert.throws(() => s.exam(2, e.id));
    assert.throws(() => s.exam(1, "../"));
    assert.throws(() => s.exams("../"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
async function server(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-http-")),
    app = express();
  app.use(express.json({ limit: "1mb" }));
  const teacherTokens = new Map([
    ["one", { teacherId: 1, createdAt: Date.now() }],
    ["two", { teacherId: 2, createdAt: Date.now() }],
  ]);
  const feature = mount(app, {
    root,
    teacherTokens,
    db: { query: async () => [[{ id: 1 }]] },
    env: {},
    ...options,
  });
  const s = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => s.once("listening", resolve));
  const base = "http://127.0.0.1:" + s.address().port;
  t.after(async () => {
    feature.close();
    await new Promise((resolve) => s.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });
  async function api(route, body, method, token = "one") {
    const res = await fetch(base + "/api/scan" + route, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        Authorization: "Bearer " + token,
        ...(!(body instanceof FormData) && body
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: body
        ? body instanceof FormData
          ? body
          : JSON.stringify(body)
        : undefined,
    });
    const data = await res.json();
    return { status: res.status, data };
  }
  async function upload(id, code = "00125", count = 2) {
    const b = new FormData();
    b.append("code", code);
    for (let i = 0; i < count; i++)
      b.append(
        "pages",
        new Blob([Buffer.from([255, 216, 255, 0])], { type: "image/jpeg" }),
        "side.jpg",
      );
    return api("/exams/" + id + "/papers", b);
  }
  return { api, upload, feature, base };
}
test("HTTP auth, private two-sided uploads, duplicate rejection, approval, reopen and CSV", async (t) => {
  const { api, upload, base } = await server(t);
  assert.equal((await api("/exams", null, "GET", "")).status, 401);
  const {
    data: { exam: e },
  } = await api("/exams", exam());
  const prefix = "/exams/" + e.id;
  assert.equal((await api(prefix, null, "GET", "two")).status, 404);
  assert.equal((await upload(e.id, "00125", 1)).status, 400);
  const {
    data: { paper: p },
  } = await upload(e.id);
  const paper = prefix + "/papers/" + p.id;
  assert.equal((await upload(e.id)).status, 409);
  assert.equal(
    (await api(prefix, { ...exam(), key: Array(20).fill("B") }, "PUT")).status,
    409,
  );
  assert.equal((await api(paper + "/recognize", {})).status, 503);
  assert.equal(
    (await api(paper + "/review", { ...review(), approve: true }, "PUT")).data
      .paper.review.total,
    9.5,
  );
  assert.equal(
    (await api(paper + "/review", { ...review(), approve: true }, "PUT"))
      .status,
    409,
  );
  assert.equal(
    (await fetch(base + "/api/scan" + paper + "/pages/0")).status,
    401,
  );
  assert.equal(
    (
      await fetch(base + "/api/scan" + paper + "/pages/0", {
        headers: { Authorization: "Bearer two" },
      })
    ).status,
    404,
  );
  const image = await fetch(base + "/api/scan" + paper + "/pages/0", {
    headers: { Authorization: "Bearer one" },
  });
  assert.equal(image.status, 200);
  assert.match(image.headers.get("cache-control"), /no-store/);
  const csv = await fetch(base + "/api/scan" + prefix + "/export", {
    headers: { Authorization: "Bearer one" },
  });
  assert.match(await csv.text(), /"00125"/);
  assert.equal((await api(paper + "/reopen", {})).data.paper.status, "review");
  const exported = await fetch(base + "/api/scan" + prefix + "/export", {
    headers: { Authorization: "Bearer one" },
  });
  assert.doesNotMatch(await exported.text(), /"00125"/);
});
test("OCR proposals persist without becoming approved scores", async (t) => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return new Response(
      JSON.stringify({ engine: "test", fields: { q1: { text: "A" } } }),
      { headers: { "Content-Type": "application/json" } },
    );
  };
  const { api, upload, feature } = await server(t, {
    env: { SCAN_OCR_URL: "http://localhost:8010", SCAN_OCR_TOKEN: "secret" },
    fetcher,
  });
  const e = exam();
  for (const key of [
    "code",
    ...Array.from({ length: 20 }, (_, i) => "q" + (i + 1)),
    "essay1",
    "essay2",
  ])
    e.layout[key] = { page: 0, x: 0, y: 0, w: 0.1, h: 0.1 };
  const {
    data: { exam: saved },
  } = await api("/exams", e);
  const {
    data: { paper: p },
  } = await upload(saved.id);
  const prefix = "/exams/" + saved.id + "/papers/" + p.id;
  assert.equal((await api(prefix + "/recognize", {})).status, 200);
  for (let i = 0; i < 30 && !feature.idle(); i++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  const result = (await api(prefix)).data.paper;
  assert.equal(calls, 1);
  assert.equal(result.status, "review");
  assert.equal(result.ocr.fields.q1.text, "A");
  assert.equal(result.review, undefined);
});
test("CSV escapes formula content", () =>
  assert.match(Core.csv([['=IMPORTXML("x")']]), /"'=IMPORTXML/));
test("Sheets sync batches 1000 reviewed rows, preserves leading zero and clears reopened grades", async () => {
  const calls = [],
    headers = Core.columns;
  const fetcher = async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes("?fields="))
      return Response.json({
        sheets: [
          {
            properties: {
              title: "FPTBN_SCAN",
              sheetId: 7,
              gridProperties: { rowCount: 2000 },
            },
          },
        ],
      });
    if (url.includes("/values/FPTBN_SCAN"))
      return Response.json({
        values: [
          headers,
          ["exam-id", "00125", 5, 2.5, 2.5, 10, "", "", "Đã chốt", "X"],
        ],
      });
    return Response.json({});
  };
  const google = require("../lib/scan-google").createGoogle(
    {},
    fetcher,
    async () => "test-only-token",
  );
  const e = {
    ...exam(),
    id: "exam-id",
    sheetUrl: "https://docs.google.com/spreadsheets/d/abcdefghijk/edit",
  };
  const papers = Array.from({ length: 1000 }, (_, i) => ({
    status: "approved",
    code: String(i + 1).padStart(5, "0"),
    review: Core.review(
      e,
      { ...review(), code: String(i + 1).padStart(5, "0") },
      true,
    ),
  }));
  papers[124].status = "review";
  assert.equal(await google.sync(e, papers), 999);
  const writes = calls
    .filter((c) => c.url.endsWith("/values:batchUpdate"))
    .map((c) => JSON.parse(c.opts.body));
  assert.equal(writes.length, 6);
  assert(writes.every((w) => w.valueInputOption === "RAW"));
  const data = writes.flatMap((w) => w.data);
  const reopened = data.find((d) => d.values[0][1] === "00125");
  assert.equal(reopened.range, "FPTBN_SCAN!A2:J2");
  assert.equal(reopened.values[0][5], "");
  assert.equal(reopened.values[0][8], "Chờ duyệt lại");
  assert(data.some((d) => d.values[0][1] === "00001"));
  assert.equal(data.length, 1001);
});

test("phone-first capture draft saves two faces without OCR; key may be supplied later and is then locked", async (t) => {
  const { api, upload, feature } = await server(t);
  const {
    data: { exam: e },
  } = await api("/exams", { title: "Chụp trước", captureOnly: true });
  assert.equal(e.captureOnly, true);
  assert(e.key.every((a) => a === ""));
  assert.equal(e.maximum, null);
  const {
    data: { paper: p },
  } = await upload(e.id);
  assert.equal(p.status, "review");
  assert(feature.idle());
  assert(!p.ocr);
  const prefix = "/exams/" + e.id;
  assert.equal(
    (
      await api(
        prefix + "/papers/" + p.id + "/review",
        { ...review(), approve: true },
        "PUT",
      )
    ).status,
    400,
  );
  assert.equal((await api(prefix + "/recognize", {})).status, 400);
  assert.equal((await api(prefix, exam(), "PUT")).data.exam.captureOnly, false);
  assert.equal(
    (await api(prefix, { ...exam(), key: Array(20).fill("B") }, "PUT")).status,
    409,
  );
  assert.equal(
    (
      await api(
        prefix + "/papers/" + p.id + "/review",
        { ...review(), approve: true },
        "PUT",
      )
    ).status,
    200,
  );
});

async function unzip(buffer) {
  const yauzl = require("yauzl");
  return new Promise((resolve, reject) =>
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const files = {};
      zip.on("error", reject);
      zip.on("end", () => resolve(files));
      zip.on("entry", (entry) =>
        zip.openReadStream(entry, (error, stream) => {
          if (error) return reject(error);
          const chunks = [];
          stream.on("data", (b) => chunks.push(b));
          stream.on("error", reject);
          stream.on("end", () => {
            files[entry.fileName] = Buffer.concat(chunks);
            zip.readEntry();
          });
        }),
      );
      zip.readEntry();
    }),
  );
}

test("human-verified training stores only selected crops, keeps writers pseudonymous, exports no paper code, supports withdrawal and invalidation", async (t) => {
  const { api, base, feature } = await server(t),
    Training = require("../lib/scan-training");
  const {
    data: { exam: e },
  } = await api("/exams", exam());
  const jpeg = await require("sharp")({
    create: { width: 400, height: 600, channels: 3, background: "#fff" },
  })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  form.append("code", "PHACH_SECRET_125");
  form.append("writerTag", "W001");
  for (let n = 0; n < 2; n++)
    form.append("pages", new Blob([jpeg], { type: "image/jpeg" }), "page.jpg");
  const {
    data: { paper: p },
  } = await api("/exams/" + e.id + "/papers", form);
  const prefix = "/exams/" + e.id + "/papers/" + p.id;
  const sample = {
    field: "q1",
    label: "A",
    box: { page: 0, x: 0.1, y: 0.1, w: 0.1, h: 0.05 },
    verified: true,
  };
  assert.equal((await api(prefix + "/training", sample)).status, 409);
  assert.equal(
    (
      await api(
        prefix + "/review",
        { ...review(), code: "PHACH_SECRET_125", approve: true },
        "PUT",
      )
    ).status,
    200,
  );
  assert.equal(
    (await api(prefix + "/training", { ...sample, label: "B" })).status,
    400,
  );
  assert.equal(
    (await api(prefix + "/training", { ...sample, field: "code" })).status,
    400,
  );
  assert.equal(
    (await api(prefix + "/training", { ...sample, verified: false })).status,
    400,
  );
  assert.equal(
    (
      await api(prefix + "/training", {
        ...sample,
        box: { page: 0, x: 0, y: 0, w: 1, h: 1 },
      })
    ).status,
    400,
  );
  assert.equal(
    (await api(prefix + "/training", sample, "POST", "two")).status,
    404,
  );
  const {
    data: { sample: s },
  } = await api(prefix + "/training", sample);
  assert(s.id);
  assert.equal((await api(prefix + "/training", sample)).status, 409);
  const response = await fetch(
    base + "/api/scan/exams/" + e.id + "/training/export",
    { headers: { Authorization: "Bearer one" } },
  );
  assert.equal(response.status, 200);
  const files = await unzip(Buffer.from(await response.arrayBuffer()));
  const manifest = files["manifest.jsonl"].toString();
  assert(!manifest.includes("PHACH_SECRET"));
  assert(!manifest.includes("W001"));
  assert(!manifest.includes(p.id));
  const row = JSON.parse(manifest.trim());
  assert.equal(row.label, "A");
  assert.equal(row.unit, "character");
  const meta = await require("sharp")(files[row.image]).metadata();
  assert.equal(meta.width, 40);
  assert.equal(meta.height, 30);
  assert.equal((await api("/exams/" + e.id + "/training")).data.total, 1);
  assert.equal(
    (await api(prefix + "/training/" + s.id, { included: false }, "PUT"))
      .status,
    200,
  );
  assert.equal((await api("/exams/" + e.id + "/training")).data.total, 0);
  await api(prefix + "/training/" + s.id, { included: true }, "PUT");
  await api(prefix + "/reopen", {});
  assert.equal((await api("/exams/" + e.id + "/training")).data.total, 0);
  const changed = {
    ...review(),
    code: "PHACH_SECRET_125",
    answers: ["B", ...Array(19).fill("A")],
    approve: true,
  };
  await api(prefix + "/review", changed, "PUT");
  assert.equal((await api("/exams/" + e.id + "/training")).data.total, 0);
  assert.equal(
    Training.writerGroup(feature.store, 1, "W001", "other"),
    p.writerGroup,
  );
  assert.notEqual(
    Training.writerGroup(feature.store, 2, "W001", "other"),
    p.writerGroup,
  );
});

test("deployment revision can be checked without login and reports actual photo-first support", async (t) => {
  const { api, base } = await server(t);
  const publicVersion = await api("/version", null, "GET", "");
  assert.equal(publicVersion.status, 200);
  assert.equal(publicVersion.data.revision, "scan-20261103-3");
  assert.equal(publicVersion.data.photoFirst, true);
  assert.deepEqual(Object.keys(publicVersion.data).sort(), [
    "photoFirst",
    "revision",
    "success",
  ]);
  const response = await fetch(base + "/api/scan/version");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await api("/status", null, "GET", "")).status, 401);
  const status = await api("/status");
  assert.equal(status.data.capabilities.photoFirst, true);
});
test("dedicated photo-first endpoint does not enter answer-key validation, and still requires teacher login", async (t) => {
  const { api } = await server(t);
  assert.equal(
    (await api("/capture-exams", { title: "Điện thoại" }, "POST", "")).status,
    401,
  );
  const result = await api("/capture-exams", { title: "Điện thoại" });
  assert.equal(result.status, 200);
  assert.equal(result.data.exam.captureOnly, true);
  assert(result.data.exam.key.every((a) => a === ""));
  assert.equal(result.data.exam.maximum, null);
  assert.equal(
    (await api("/exams", { title: "Đề chấm cần đáp án" })).status,
    400,
  );
});
