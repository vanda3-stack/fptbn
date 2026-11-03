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
  assert.equal((await upload(e.id, "00124", 1)).status, 200);
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
  assert.equal(reopened.range, "FPTBN_SCAN!A2:K2");
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
  assert.equal(publicVersion.data.revision, "scan-20261103-5");
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

test("reads the provided Tin 8 answer-document table layout: 20 keys and five half-point ideas per essay", () => {
  const expected = [
    "B",
    "B",
    "D",
    "B",
    "C",
    "B",
    "A",
    "A",
    "B",
    "D",
    "D",
    "B",
    "A",
    "B",
    "C",
    "B",
    "C",
    "D",
    "C",
    "D",
  ];
  const text =
    "ĐÁP ÁN VÀ THANG ĐIỂM\r\nA. PHẦN TRẮC NGHIỆM (5,0 điểm)\r\nMỗi câu trả lời đúng được 0,25 điểm.\r\n" +
    Array.from({ length: 10 }, (_, i) => i + 1).join("\r\n\t") +
    "\r\n\t" +
    expected.slice(0, 10).join("\r\n\t") +
    "\r\n\t" +
    Array.from({ length: 10 }, (_, i) => i + 11).join("\r\n\t") +
    "\r\n\t" +
    expected.slice(10).join("\r\n\t") +
    "\r\nB. PHẦN TỰ LUẬN (5,0 điểm)\r\nCâu 1 (2,5 điểm): Em hãy nêu bốn cách đánh giá độ tin cậy và một ví dụ.\r\nNội dung\r\n\tĐiểm\r\nKiểm tra nguồn và uy tín nơi cung cấp.\r\n\t0,5\r\nPhân biệt ý kiến với sự kiện.\r\n\t0,5\r\nKiểm tra chứng cứ của kết luận.\r\n\t0,5\r\nXem thời điểm công bố, cập nhật.\r\n\t0,5\r\nVí dụ: Kiểm tra tin nghỉ học qua thông báo mới của trường.\r\n\t0,5\r\nCâu 2 (2,5 điểm): Em hãy nêu năm lưu ý khi tạo sản phẩm số.\r\nNội dung\r\n\tĐiểm\r\nDùng thông tin đã kiểm chứng.\r\n\t0,5\r\nKhông nhận sản phẩm của người khác là của mình.\r\n\t0,5\r\nƯu tiên tư liệu tự tạo; xin phép hoặc mua quyền sử dụng khi cần.\r\n\t0,5\r\nGhi nguồn và tên tác giả.\r\n\t0,5\r\nDùng từ ngữ, hình ảnh phù hợp; tôn trọng riêng tư.\r\n\t0,5\r\nLưu ý: Chấp nhận cách diễn đạt khác đúng.";
  const d = Core.parseDoc(text);
  assert.deepEqual(d.key, expected);
  assert.equal(d.quizPoint, 0.25);
  assert.equal(d.complete, true);
  assert.deepEqual(
    d.essays.map((e) => e.ideas.length),
    [5, 5],
  );
  assert(d.essays.flatMap((e) => e.ideas).every((x) => x.points === 0.5));
  assert.equal(
    Core.validateExam({
      ...exam(),
      key: d.key,
      essays: d.essays,
      quizPoint: d.quizPoint,
    }).maximum,
    10,
  );
});
test("different rooms isolate the same anonymous code and export room with score", async (t) => {
  const { api, upload } = await server(t);
  const rooms = [];
  for (const roomCode of ["Phòng 01", "Phòng 02"]) {
    const {
      data: { exam: e },
    } = await api("/exams", { ...exam(), roomCode });
    rooms.push(e);
    const {
      data: { paper: p },
    } = await upload(e.id, "00125");
    const r = await api(
      "/exams/" + e.id + "/papers/" + p.id + "/review",
      { ...review(), approve: true },
      "PUT",
    );
    assert.equal(r.status, 200);
    assert.equal(Core.sheetRow(e, r.data.paper)[10], roomCode);
    assert.equal((await api("/exams/" + e.id + "/papers")).data.total, 1);
  }
  assert.notEqual(rooms[0].id, rooms[1].id);
  const draft = await api("/capture-exams", {
    title: "Tin 8",
    roomCode: "Phòng 03",
    docUrl:
      "https://docs.google.com/document/d/17xH-yDghEmgrb3S881JW8cauT_cl6et-Y5xbuqv10us/edit?tab=t.0",
    sheetUrl: "https://docs.google.com/spreadsheets/d/abcdefghijk/edit",
  });
  assert.equal(draft.data.exam.roomCode, "Phòng 03");
  assert(draft.data.exam.docUrl.includes("17xH-y"));
  assert(draft.data.exam.sheetUrl);
});
test("Sheets migration accepts the earlier ten-column header and appends room without moving old scores", async () => {
  const calls = [],
    old = Core.columns.slice(0, 10);
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("?fields="))
      return Response.json({
        sheets: [
          {
            properties: {
              title: "FPTBN_SCAN",
              sheetId: 7,
              gridProperties: { rowCount: 2000, columnCount: 10 },
            },
          },
        ],
      });
    if (url.includes("/values/FPTBN_SCAN"))
      return Response.json({
        values: [
          old,
          ["other-room", "00125", 5, 2.5, 2.5, 10, "", "", "Đã chốt", "Old"],
        ],
      });
    return Response.json({});
  };
  const e = {
      ...exam(),
      id: "new-room",
      roomCode: "Phòng 02",
      sheetUrl: "https://docs.google.com/spreadsheets/d/abcdefghijk/edit",
    },
    p = { status: "approved", review: Core.review(exam(), review(), true) };
  await require("../lib/scan-google")
    .createGoogle({}, fetcher, async () => "test")
    .sync(e, [p]);
  const writes = calls
    .filter((c) => c.url.endsWith("/values:batchUpdate"))
    .flatMap((c) => JSON.parse(c.options.body).data);
  assert.equal(writes[0].range, "FPTBN_SCAN!A1:K1");
  assert.equal(writes[1].range, "FPTBN_SCAN!A3:K3");
  assert.equal(writes[1].values[0][10], "Phòng 02");
  assert(
    calls.some(
      (c) =>
        c.url.endsWith(":batchUpdate") &&
        JSON.parse(c.options.body).requests[0].appendDimension?.dimension ===
          "COLUMNS",
    ),
  );
});

test("room can configure OCR crop regions after taking photos, before any derived result", async (t) => {
  const { api, upload } = await server(t);
  const config = { ...exam(), roomCode: "Phòng 04" };
  const {
    data: { exam: e },
  } = await api("/exams", config);
  const {
    data: { paper: p },
  } = await upload(e.id);
  const changed = {
    ...config,
    layout: { q1: { page: 0, x: 0.1, y: 0.1, w: 0.1, h: 0.1 } },
  };
  assert.equal((await api("/exams/" + e.id, changed, "PUT")).status, 200);
  await api(
    "/exams/" + e.id + "/papers/" + p.id + "/review",
    { ...review(), approve: true },
    "PUT",
  );
  assert.equal(
    (
      await api(
        "/exams/" + e.id,
        {
          ...changed,
          layout: { q1: { page: 0, x: 0.2, y: 0.1, w: 0.1, h: 0.1 } },
        },
        "PUT",
      )
    ).status,
    409,
  );
});

test("network error reading Docs is reported as a source connection problem, not a disk-permission error", async (t) => {
  const { api } = await server(t, {
    fetcher: async () => {
      throw new TypeError("fetch failed");
    },
  });
  const result = await api("/import-doc", {
    url: "https://docs.google.com/document/d/17xH-yDghEmgrb3S881JW8cauT_cl6et-Y5xbuqv10us/edit?tab=t.0",
  });
  assert.equal(result.status, 502);
  assert.match(result.data.message, /Google Docs/);
  assert.doesNotMatch(result.data.message, /quyền ghi/);
});

test("grade creation persists hierarchy, isolates owners and forbids duplicate room inside a grade", async (t) => {
  const { api } = await server(t);
  const {
    data: { grade: g },
  } = await api("/grades", { name: "Khối 8" });
  assert(g.id);
  assert.equal((await api("/grades", { name: "Khối 8" })).status, 409);
  const a = await api("/exams", {
    ...exam(),
    gradeId: g.id,
    roomCode: "Phòng 01",
  });
  assert.equal(a.status, 200);
  assert.equal(a.data.exam.gradeId, g.id);
  assert.equal(
    (await api("/exams", { ...exam(), gradeId: g.id, roomCode: "Phòng 01" }))
      .status,
    409,
  );
  assert.equal(
    (
      await api(
        "/exams",
        { ...exam(), gradeId: g.id, roomCode: "Phòng 02" },
        "POST",
        "two",
      )
    ).status,
    404,
  );
  assert.equal((await api("/grades")).data.grades[0].rooms, 1);
  assert.deepEqual((await api("/grades", null, "GET", "two")).data.grades, []);
  const pending = await api("/grades/" + g.id + "/sheet", {});
  assert.equal(pending.status, 503);
});

test("one- and two-face uploads persist real page count; unavailable second image is never served", async (t) => {
  const { api, upload, base } = await server(t);
  const {
    data: { exam: e },
  } = await api("/exams", exam());
  const {
    data: { paper: p },
  } = await upload(e.id, "00125", 1);
  assert.equal(p.imageTypes.length, 1);
  const response = await fetch(
    base + "/api/scan/exams/" + e.id + "/papers/" + p.id + "/pages/1",
    { headers: { Authorization: "Bearer one" } },
  );
  assert.equal(response.status, 404);
  assert.equal(
    (await api("/exams/" + e.id + "/papers")).data.papers[0].pageCount,
    1,
  );
  assert.equal(
    (await upload(e.id, "00126", 2)).data.paper.imageTypes.length,
    2,
  );
});

test("automatic assessment leaves unresolved writing ungraded instead of assigning guessed zero", () => {
  const assess = require("../lib/scan-assess"),
    e = exam();
  const fields = Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => ["q" + (i + 1), { text: "A" }]),
  );
  assert.equal(assess(e, { fields }).total, null);
  fields.essay1 = { text: "Ý 1" };
  fields.essay2 = { text: "Ý 2" };
  assert.equal(assess(e, { fields }).total, 10);
  fields.q1 = { text: "A hoặc B" };
  assert.equal(assess(e, { fields }).total, null);
});

test("one workbook per grade is created inside target folder, one tab per room, two RAW columns, repeat save updates exact row", async () => {
  const create = require("../lib/scan-grade-sheets"),
    folder = create.FOLDER_ID,
    calls = [],
    tabs = [],
    dataByTitle = new Map();
  let fileCreated = 0;
  const request = async (url, opts = {}) => {
    calls.push({ url, opts });
    const body = opts.body ? JSON.parse(opts.body) : null;
    if (url.includes("/drive/v3/files/" + folder))
      return Response.json({
        id: folder,
        mimeType: "application/vnd.google-apps.folder",
        capabilities: { canAddChildren: true },
      });
    if (url.includes("/drive/v3/files/book-id"))
      return Response.json({
        id: "book-id",
        mimeType: "application/vnd.google-apps.spreadsheet",
        parents: [folder],
      });
    if (url.includes("/drive/v3/files?q=")) return Response.json({ files: [] });
    if (url.includes("/drive/v3/files?fields=") && opts.method === "POST") {
      fileCreated++;
      assert.deepEqual(body.parents, [folder]);
      assert.equal(body.name, "Khối 8");
      return Response.json({
        id: "book-id",
        webViewLink: "https://docs.google.com/spreadsheets/d/book-id/edit",
        parents: [folder],
      });
    }
    if (url.includes("?fields=sheets.properties"))
      return Response.json({ sheets: tabs });
    if (url.endsWith(":batchUpdate") && !url.includes("/values")) {
      const p = body.requests[0].addSheet?.properties;
      if (p) {
        tabs.push({ properties: p });
        return Response.json({ replies: [{ addSheet: { properties: p } }] });
      }
      return Response.json({});
    }
    if (url.includes("/values/") && !url.endsWith("batchUpdate")) {
      const range = decodeURIComponent(url.split("/values/")[1]),
        title = range.match(/^'(.+)'!/)[1];
      return Response.json({ values: dataByTitle.get(title) || [] });
    }
    if (url.endsWith("/values:batchUpdate")) {
      assert.equal(body.valueInputOption, "RAW");
      for (const entry of body.data) {
        assert(entry.values.every((row) => row.length === 2));
        const title = entry.range.match(/^'(.+)'!/)[1],
          n = Number(entry.range.match(/!A(\d+):/)[1]),
          rows = dataByTitle.get(title) || [];
        rows[n - 1] = entry.values[0];
        dataByTitle.set(title, rows);
      }
      return Response.json({});
    }
    throw Error(url);
  };
  const google = create({ request }),
    g = { id: crypto.randomUUID(), name: "Khối 8" },
    save = () => {};
  const p = { code: "00125", status: "review", automatic: { total: 9 } };
  const a = { id: crypto.randomUUID(), roomCode: "Phòng 01" },
    b = { id: crypto.randomUUID(), roomCode: "Phòng 02" };
  await google.syncRoom(g, a, [p], save);
  await google.syncRoom(g, b, [{ ...p, automatic: { total: null } }], save);
  p.automatic.total = 9.5;
  await google.syncRoom(g, a, [p], save);
  assert.equal(fileCreated, 1);
  assert.equal(tabs.length, 2);
  assert.deepEqual(dataByTitle.get("Phòng 01"), [
    ["Mã phách", "Điểm chấm tự động"],
    ["00125", 9.5],
  ]);
  assert.deepEqual(dataByTitle.get("Phòng 02"), [
    ["Mã phách", "Điểm chấm tự động"],
    ["00125", ""],
  ]);
});

test('a single uploaded face reaches OCR unchanged and produces a provisional automatic score',async t=>{
 let pages;
 const fields=Object.fromEntries(Array.from({length:20},(_,i)=>['q'+(i+1),{text:'A'}]));fields.essay1={text:'Ý 1'};fields.essay2={text:'Ý 2'};
 const {api,upload,feature}=await server(t,{env:{SCAN_OCR_URL:'http://worker',SCAN_OCR_TOKEN:'test'},fetcher:async(url,options)=>{pages=JSON.parse(options.body).pages;return Response.json({fields,engine:'contract-test'})}});
 const {data:{exam:e}}=await api('/exams',exam());const {data:{paper:p}}=await upload(e.id,'00125',1);
 assert.equal((await api('/exams/'+e.id+'/papers/'+p.id+'/recognize',{})).status,200);
 for(let i=0;i<30&&!feature.idle();i++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(pages.length,1);assert.equal((await api('/exams/'+e.id+'/papers/'+p.id)).data.paper.automatic.total,10);
});
