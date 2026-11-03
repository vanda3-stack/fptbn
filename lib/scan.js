"use strict";
const express = require("express"),
  multer = require("multer"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const Training = require("./scan-training");
const assess = require("./scan-assess");
const Core = require("./scan-core"),
  { createStore, bad } = require("./scan-store"),
  { createGoogle } = require("./scan-google");
module.exports = function mountScan(
  app,
  {
    db,
    teacherTokens,
    root = process.env.SCAN_DATA_DIR || path.join(__dirname, "../data/scan"),
    env = process.env,
    fetcher = fetch,
  },
) {
  const r = express.Router(),
    store = createStore(root),
    google = createGoogle(env, fetcher),
    pending = [],
    active = new Set(),
    locks = new Set();
  let running = false,
    closed = false;
  const wrap = (fn) => async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (e) {
      next(e);
    }
  };
  r.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  const revision = "scan-20261103-5";
  const photoFirst = (() => {
    try {
      return (
        Core.validateExam({ title: "Compatibility check", captureOnly: true })
          .captureOnly === true
      );
    } catch {
      return false;
    }
  })();
  // Safe public deployment check: no account, file paths or private records.
  r.get("/version", (req, res) =>
    res.json({ success: true, revision, photoFirst }),
  );
  r.use(
    wrap(async (req, res, next) => {
      const token = String(req.headers.authorization || "").replace(
        /^Bearer /,
        "",
      );
      const session = teacherTokens.get(token);
      if (!session || Date.now() - session.createdAt > 8 * 3600000)
        throw bad("Phiên giáo viên hết hạn. Đăng nhập lại.", 401);
      const [rows] = await db.query(
        "SELECT id FROM teachers WHERE id=? AND is_active=1",
        [session.teacherId],
      );
      if (!rows.length) throw bad("Tài khoản đã bị khóa.", 403);
      req.teacherId = session.teacherId;
      next();
    }),
  );
  const paperLocks = new Set();
  r.use((req, res, next) => {
    const m = req.path.match(/^\/exams\/([^/]+)\/papers\/([^/]+)/);
    if (
      req.method !== "GET" &&
      m &&
      paperLocks.has([req.teacherId, m[1], m[2]].join("/"))
    )
      return next(bad("Đang lưu dữ liệu chữ viết của bài. Chờ hoàn tất.", 409));
    next();
  });
  const base = (req) => store.exam(req.teacherId, req.params.id);
  function save(t, e, p) {
    p.updatedAt = new Date().toISOString();
    store.savePaper(t, e, p);
  }
  function enqueue(t, e, p) {
    const k = [t, e, p].join("/");
    if (active.has(k)) return;
    active.add(k);
    pending.push({ t, e, p, k });
    void drain();
  }
  async function drain() {
    if (running || closed) return;
    running = true;
    try {
      while (pending.length && !closed) {
        const job = pending.shift();
        try {
          await recognize(job);
        } catch (error) {
          try {
            const p = store.paper(job.t, job.e, job.p);
            p.status = "error";
            p.error = error.status
              ? error.message
              : "Không kết nối được bộ OCR. Kiểm tra dịch vụ Python rồi thử lại.";
            save(job.t, job.e, p);
          } catch {}
          console.error("Scan OCR:", error.name);
        } finally {
          active.delete(job.k);
        }
      }
    } finally {
      running = false;
    }
  }
  async function recognize({ t, e, p: id }) {
    const p = store.paper(t, e, id),
      exam = store.exam(t, e);
    if (p.status !== "queued") return;
    p.status = "processing";
    save(t, e, p);
    const response = await fetcher(
      env.SCAN_OCR_URL.replace(/\/$/, "") + "/recognize",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + env.SCAN_OCR_TOKEN,
        },
        signal: AbortSignal.timeout(300000),
        body: JSON.stringify({
          pages: p.imageTypes.map((_, n) =>
            fs.readFileSync(store.image(t, e, id, n)).toString("base64"),
          ),
          layout: exam.layout,
        }),
      },
    );
    if (!response.ok)
      throw bad(
        "Bộ OCR trả lỗi " +
          response.status +
          ". Kiểm tra nhật ký dịch vụ Python.",
        502,
      );
    const data = await response.json();
    if (!data.fields || typeof data.fields !== "object")
      throw bad("Kết quả OCR không hợp lệ.", 502);
    // Persist raw proposals separately; they must not overwrite reviewed scores.
    p.ocr = {
      fields: data.fields,
      engine: String(data.engine || "VietOCR"),
      at: new Date().toISOString(),
    };
    p.automatic = assess(exam, p.ocr);
    p.status = "review";
    p.error = "";
    save(t, e, p);
  }
  r.get(
    "/status",
    wrap(async (req, res) => {
      let ocr = {
        configured: !!(env.SCAN_OCR_URL && env.SCAN_OCR_TOKEN),
        ready: false,
      };
      if (ocr.configured)
        try {
          const response = await fetcher(
            env.SCAN_OCR_URL.replace(/\/$/, "") + "/health",
            {
              headers: { Authorization: "Bearer " + env.SCAN_OCR_TOKEN },
              signal: AbortSignal.timeout(3000),
            },
          );
          const data = await response.json();
          ocr.ready = response.ok && data.ready === true;
          ocr.message = data.message;
        } catch {
          ocr.message = "Chưa kết nối được dịch vụ OCR.";
        }
      res.json({
        success: true,
        revision,
        capabilities: {
          photoFirst,
          rooms: true,
          grades: true,
          flexiblePages: true,
        },
        ocr,
        google: google.configured(),
      });
    }),
  );
  r.post(
    "/import-doc",
    wrap(async (req, res) => {
      try {
        res.json({
          success: true,
          ...Core.parseDoc(await google.importDoc(req.body.url)),
        });
      } catch (error) {
        if (error.status) throw error;
        throw bad(
          "Không kết nối được Google Docs từ máy chủ. Kiểm tra kết nối/quyền đọc tài liệu, hoặc dán nội dung đáp án bên dưới.",
          502,
        );
      }
    }),
  );
  r.post(
    "/parse-key",
    wrap(async (req, res) => {
      if (typeof req.body.text !== "string" || req.body.text.length > 100000)
        throw bad("Nội dung đáp án quá dài.");
      res.json({ success: true, ...Core.parseDoc(req.body.text) });
    }),
  );
  function validateRoom(req, value, exclude) {
    if (!value.gradeId) return;
    store.grade(req.teacherId, value.gradeId);
    if (!value.roomCode || /[\[\]:*?/\\]/.test(value.roomCode))
      throw bad("Nhập tên phòng, không dùng ký tự []:*?/ hoặc gạch chéo.");
    if (
      store
        .exams(req.teacherId)
        .some(
          (e) =>
            e.id !== exclude &&
            e.gradeId === value.gradeId &&
            e.roomCode.toLocaleLowerCase("vi") ===
              value.roomCode.toLocaleLowerCase("vi"),
        )
    )
      throw bad("Phòng đã tồn tại trong khối này.", 409);
  }
  r.get(
    "/grades",
    wrap(async (req, res) => {
      const rooms = store.exams(req.teacherId);
      res.json({
        success: true,
        folderUrl: "https://drive.google.com/drive/folders/" + google.folderId,
        grades: store.grades(req.teacherId).map((g) => ({
          ...g,
          rooms: rooms.filter((e) => e.gradeId === g.id).length,
        })),
      });
    }),
  );
  r.post(
    "/grades",
    wrap(async (req, res) => {
      const name = String(req.body.name || "")
        .normalize("NFC")
        .trim();
      if (!name || name.length > 80 || /[\x00-\x1f]/.test(name))
        throw bad("Tên khối cần 1–80 ký tự.");
      if (
        store
          .grades(req.teacherId)
          .some(
            (g) =>
              g.name.toLocaleLowerCase("vi") === name.toLocaleLowerCase("vi"),
          )
      )
        throw bad("Khối chấm đã tồn tại.", 409);
      const grade = {
        id: crypto.randomUUID(),
        name,
        folderId: google.folderId,
        createdAt: new Date().toISOString(),
      };
      store.saveGrade(req.teacherId, grade);
      res.json({ success: true, grade });
    }),
  );
  r.post(
    "/grades/:gid/sheet",
    wrap(async (req, res) => {
      const g = store.grade(req.teacherId, req.params.gid),
        lock = "grade:" + g.id;
      if (locks.has(lock)) throw bad("Bảng điểm đang được tạo/lưu.", 409);
      locks.add(lock);
      try {
        await google.ensureWorkbook(g, (value) =>
          store.saveGrade(req.teacherId, value),
        );
        res.json({
          success: true,
          grade: g,
          url:
            g.sheetUrl ||
            "https://docs.google.com/spreadsheets/d/" +
              g.spreadsheetId +
              "/edit",
        });
      } finally {
        locks.delete(lock);
      }
    }),
  );
  r.get(
    "/exams",
    wrap(async (req, res) => {
      res.json({
        success: true,
        exams: store.exams(req.teacherId).map((e) => {
          const papers = store.papers(req.teacherId, e.id);
          return {
            ...e,
            count: papers.length,
            hasDerived: papers.some(
              (p) =>
                p.review ||
                p.ocr ||
                ["queued", "processing", "approved"].includes(p.status),
            ),
            approved: papers.filter((p) => p.status === "approved").length,
          };
        }),
      });
    }),
  );
  r.post(
    "/capture-exams",
    wrap(async (req, res) => {
      if (!photoFirst)
        throw bad(
          "Máy chủ chưa nạp đủ bản cập nhật chụp trước. Khởi động lại NodeJS trên VPS.",
          503,
        );
      const e = {
        ...Core.validateExam({
          title: req.body.title,
          roomCode: req.body.roomCode,
          gradeId: req.body.gradeId,
          docUrl: req.body.docUrl,
          sheetUrl: req.body.sheetUrl,
          layout: req.body.layout,
          captureOnly: true,
        }),
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      validateRoom(req, e);
      store.saveExam(req.teacherId, e);
      res.json({ success: true, exam: e });
    }),
  );
  r.post(
    "/exams",
    wrap(async (req, res) => {
      const e = {
        ...Core.validateExam(req.body),
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      validateRoom(req, e);
      store.saveExam(req.teacherId, e);
      res.json({ success: true, exam: e });
    }),
  );
  r.get(
    "/exams/:id",
    wrap(async (req, res) => res.json({ success: true, exam: base(req) })),
  );
  r.put(
    "/exams/:id",
    wrap(async (req, res) => {
      const e = base(req),
        value = Core.validateExam(req.body);
      const papers = store.papers(req.teacherId, e.id),
        rawOnly = papers.every(
          (p) => ["review", "error"].includes(p.status) && !p.review && !p.ocr,
        );
      const before = Core.validateExam(e);
      const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const unchanged = equal(
        { ...value, sheetUrl: "" },
        { ...before, sheetUrl: "" },
      );
      const layoutOnly =
        rawOnly &&
        equal(
          { ...value, sheetUrl: "", layout: {} },
          { ...before, sheetUrl: "", layout: {} },
        );
      if (
        papers.length &&
        !(e.captureOnly && rawOnly) &&
        !unchanged &&
        !layoutOnly
      )
        throw bad(
          "Đã có bài: giữ nguyên phòng và đáp án. Vùng đọc chỉ được đổi trước khi chạy OCR/chấm.",
          409,
        );
      validateRoom(req, value, e.id);
      const result = { ...e, ...value };
      store.saveExam(req.teacherId, result);
      res.json({ success: true, exam: result });
    }),
  );
  r.get(
    "/exams/:id/papers",
    wrap(async (req, res) => {
      const e = base(req),
        all = store.papers(req.teacherId, e.id),
        page = Math.max(0, Number.parseInt(req.query.page, 10) || 0),
        filter = String(req.query.filter || "");
      const rows = all.filter((p) => !filter || p.status === filter);
      res.json({
        success: true,
        total: all.length,
        filtered: rows.length,
        counts: all.reduce(
          (m, p) => ((m[p.status] = (m[p.status] || 0) + 1), m),
          {},
        ),
        papers: rows.slice(page * 50, page * 50 + 50).map((p) => ({
          id: p.id,
          code: p.review?.code || p.code,
          status: p.status,
          total: p.review?.total ?? p.automatic?.total,
          automatic: p.automatic,
          pageCount: p.imageTypes?.length || 2,
          difference: p.review?.difference,
          error: p.error,
          createdAt: p.createdAt,
        })),
      });
    }),
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 12 * 1024 * 1024,
      files: 2,
      fields: 5,
      fieldSize: 1000,
    },
  }).array("pages", 2);
  r.post(
    "/exams/:id/papers",
    (req, res, next) => {
      try {
        base(req);
        upload(req, res, next);
      } catch (e) {
        next(e);
      }
    },
    wrap(async (req, res) => {
      const exam = base(req),
        code = Core.code(req.body.code),
        files = req.files;
      if (!files || files.length < 1 || files.length > 2)
        throw bad("Mỗi bài cần 1 hoặc 2 ảnh.");
      const all = store.papers(req.teacherId, exam.id);
      if (all.length >= 2000)
        throw bad("Mỗi đợt tối đa 2.000 bài; tạo đợt tiếp theo.");
      if (all.some((p) => (p.review?.code || p.code) === code))
        throw bad("Mã phách đã có trong đợt này.", 409);
      for (const f of files)
        if (
          !(
            f.buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
            f.buffer
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          )
        )
          throw bad("Chỉ nhận ảnh JPEG hoặc PNG.");
      const p = {
        id: crypto.randomUUID(),
        code,
        status: "review",
        createdAt: new Date().toISOString(),
        writerGroup: Training.writerGroup(
          store,
          req.teacherId,
          req.body.writerTag,
          crypto.randomUUID(),
        ),
        imageTypes: files.map((f) =>
          f.buffer[0] === 255 ? "image/jpeg" : "image/png",
        ),
      };
      try {
        for (let n = 0; n < files.length; n++) {
          const file = store.image(req.teacherId, exam.id, p.id, n);
          fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
          fs.writeFileSync(file, files[n].buffer, { mode: 0o600 });
        }
        store.savePaper(req.teacherId, exam.id, p);
      } catch (e) {
        fs.rmSync(path.dirname(store.image(req.teacherId, exam.id, p.id, 0)), {
          recursive: true,
          force: true,
        });
        throw e;
      }
      res.json({ success: true, paper: p });
    }),
  );
  r.get(
    "/exams/:id/papers/:pid",
    wrap(async (req, res) => {
      base(req);
      res.json({
        success: true,
        paper: store.paper(req.teacherId, req.params.id, req.params.pid),
      });
    }),
  );
  r.get(
    "/exams/:id/papers/:pid/pages/:n",
    wrap(async (req, res) => {
      base(req);
      const p = store.paper(req.teacherId, req.params.id, req.params.pid),
        n = Number(req.params.n),
        file = store.image(req.teacherId, req.params.id, p.id, n);
      if (n >= p.imageTypes.length)
        throw bad("Bài này không có mặt ảnh đã chọn.", 404);
      res.set("X-Content-Type-Options", "nosniff");
      res.type(p.imageTypes[n]);
      res.sendFile(file);
    }),
  );
  function queuePaper(req, e, p) {
    if (e.captureOnly)
      throw bad("Cần nhập đáp án và thang điểm trước khi bắt đầu chấm.");
    if (!env.SCAN_OCR_URL || !env.SCAN_OCR_TOKEN)
      throw bad(
        "Chưa cấu hình bộ OCR. Thầy có thể chấm trực tiếp trên ảnh.",
        503,
      );
    if (p.status === "approved" || p.review)
      throw bad(
        "Bài đã có kết quả duyệt, không nhận diện đè lên kết quả.",
        409,
      );
    if (!["queued", "processing"].includes(p.status)) {
      p.status = "queued";
      p.error = "";
      save(req.teacherId, e.id, p);
      enqueue(req.teacherId, e.id, p.id);
    }
  }
  r.post(
    "/exams/:id/papers/:pid/recognize",
    wrap(async (req, res) => {
      const e = base(req),
        p = store.paper(req.teacherId, e.id, req.params.pid);
      queuePaper(req, e, p);
      res.json({ success: true });
    }),
  );
  r.post(
    "/exams/:id/recognize",
    wrap(async (req, res) => {
      const e = base(req),
        all = store.papers(req.teacherId, e.id);
      let reassessed = 0;
      for (const p of all)
        if (p.ocr && !p.automatic && !p.review) {
          p.automatic = assess(e, p.ocr);
          save(req.teacherId, e.id, p);
          reassessed++;
        }
      const papers = all.filter(
        (p) => !p.review && !p.ocr && ["review", "error"].includes(p.status),
      );
      if (!papers.length && !reassessed)
        throw bad("Không còn bài mới để chấm.");
      // Validate configuration with first paper before scheduling the whole batch.
      for (const p of papers) queuePaper(req, e, p);
      res.json({ success: true, count: papers.length + reassessed });
    }),
  );
  r.get(
    "/exams/:id/training",
    wrap(async (req, res) => {
      const e = base(req),
        samples = Training.records(store, req.teacherId, e.id);
      res.json({
        success: true,
        total: samples.length,
        characters: samples.filter((s) => s.unit === "character").length,
        lines: samples.filter((s) => s.unit === "line").length,
      });
    }),
  );
  r.get(
    "/exams/:id/training/export",
    wrap(async (req, res) => {
      const e = base(req);
      Training.exportDataset(store, req.teacherId, e.id, res);
    }),
  );
  r.post(
    "/exams/:id/papers/:pid/training",
    wrap(async (req, res) => {
      const e = base(req),
        p = store.paper(req.teacherId, e.id, req.params.pid),
        lock = [req.teacherId, e.id, p.id].join("/");
      paperLocks.add(lock);
      try {
        const sample = await Training.addSample(
          store,
          req.teacherId,
          e.id,
          p,
          req.body,
        );
        p.training ||= { samples: [] };
        p.training.samples.push(sample);
        p.history ||= [];
        p.history.push({
          at: new Date().toISOString(),
          event: "training-add",
          sampleId: sample.id,
        });
        save(req.teacherId, e.id, p);
        res.json({ success: true, sample });
      } finally {
        paperLocks.delete(lock);
      }
    }),
  );
  r.put(
    "/exams/:id/papers/:pid/training/:sid",
    wrap(async (req, res) => {
      const e = base(req),
        p = store.paper(req.teacherId, e.id, req.params.pid);
      store.uuid(req.params.sid);
      const sample = p.training?.samples.find((s) => s.id === req.params.sid);
      if (!sample) throw bad("Không tìm thấy mẫu chữ viết.", 404);
      if (typeof req.body.included !== "boolean")
        throw bad("Trạng thái mẫu không hợp lệ.");
      sample.withdrawnAt = req.body.included ? null : new Date().toISOString();
      p.history ||= [];
      p.history.push({
        at: new Date().toISOString(),
        event: req.body.included ? "training-restore" : "training-withdraw",
        sampleId: sample.id,
      });
      save(req.teacherId, e.id, p);
      res.json({ success: true });
    }),
  );
  r.put(
    "/exams/:id/papers/:pid/review",
    wrap(async (req, res) => {
      const e = base(req),
        p = store.paper(req.teacherId, e.id, req.params.pid);
      if (["queued", "processing"].includes(p.status))
        throw bad("OCR đang xử lý; chờ hoàn tất trước khi duyệt.", 409);
      if (p.status === "approved")
        throw bad("Bài đã chốt. Bấm mở lại để sửa và ghi lịch sử.", 409);
      const approve = req.body.approve === true,
        review = Core.review(e, req.body, approve);
      if (
        p.history?.some((h) => h.event === "approve") &&
        p.review?.code !== review.code
      )
        throw bad(
          "Mã phách đã từng chốt được khóa để tránh lệch dòng trên Sheet. Liên hệ quản trị nếu cần sửa mã.",
          409,
        );
      if (
        store
          .papers(req.teacherId, e.id)
          .some(
            (other) =>
              other.id !== p.id &&
              (other.review?.code || other.code) === review.code,
          )
      )
        throw bad("Mã phách trùng với bài khác.", 409);
      p.history ||= [];
      p.history.push({
        at: new Date().toISOString(),
        event: approve ? "approve" : "save",
        review: p.review || null,
      });
      p.review = review;
      p.status = approve ? "approved" : "review";
      save(req.teacherId, e.id, p);
      res.json({ success: true, paper: p });
    }),
  );
  r.post(
    "/exams/:id/papers/:pid/reopen",
    wrap(async (req, res) => {
      const e = base(req),
        p = store.paper(req.teacherId, e.id, req.params.pid);
      if (p.status !== "approved") throw bad("Bài chưa chốt.");
      p.history ||= [];
      p.history.push({
        at: new Date().toISOString(),
        event: "reopen",
        review: p.review,
      });
      p.status = "review";
      p.review.verified = false;
      save(req.teacherId, e.id, p);
      res.json({ success: true, paper: p });
    }),
  );
  r.get(
    "/exams/:id/export",
    wrap(async (req, res) => {
      const e = base(req),
        rows = store
          .papers(req.teacherId, e.id)
          .filter((p) => p.status === "approved")
          .map((p) => Core.sheetRow(e, p));
      res.set("Content-Disposition", 'attachment; filename="FPTBN-scan.csv"');
      res.type("text/csv").send(Core.csv([Core.columns, ...rows]));
    }),
  );
  r.post(
    "/exams/:id/sync",
    wrap(async (req, res) => {
      const e = base(req);
      if (e.gradeId) {
        const g = store.grade(req.teacherId, e.gradeId),
          lock = "grade:" + g.id;
        if (locks.has(lock))
          throw bad("Khối đang lưu Google Sheets. Chờ hoàn tất.", 409);
        locks.add(lock);
        try {
          const papers = store.papers(req.teacherId, e.id);
          if (!papers.length) throw bad("Phòng chưa có bài.");
          const result = await google.syncRoom(g, e, papers, (value) =>
            store.saveGrade(req.teacherId, value),
          );
          return res.json({ success: true, ...result });
        } finally {
          locks.delete(lock);
        }
      }
      if (!e.sheetUrl)
        throw bad("Chưa nhập đường dẫn Google Sheets trong cấu hình đợt.");
      const lock = Core.googleId(e.sheetUrl, "sheet");
      if (locks.has(lock)) throw bad("Sheet đang đồng bộ; chờ hoàn tất.", 409);
      locks.add(lock);
      try {
        const papers = store.papers(req.teacherId, e.id);
        if (!papers.length) throw bad("Chưa có bài để đồng bộ.");
        res.json({ success: true, count: await google.sync(e, papers) });
      } finally {
        locks.delete(lock);
      }
    }),
  );
  r.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error.status || (error instanceof multer.MulterError ? 400 : 500);
    if (status === 500) console.error("Scan:", error.code || error.name);
    res.status(status).json({
      success: false,
      message:
        status === 500
          ? "Không xử lý được bài chấm. Kiểm tra quyền ghi thư mục dữ liệu trên máy chủ."
          : error instanceof multer.MulterError
            ? "Ảnh quá lớn hoặc sai số lượng; tối đa 12 MB/mặt, 2 mặt/bài."
            : error.message,
    });
  });
  app.use("/api/scan", r);
  // Resume only unfinished OCR tasks after a Node restart; completed reviews are untouched.
  if (env.SCAN_OCR_URL && env.SCAN_OCR_TOKEN)
    for (const t of store.owners())
      for (const e of store.exams(t))
        for (const p of store.papers(t, e.id))
          if (["queued", "processing"].includes(p.status)) {
            p.status = "queued";
            save(t, e.id, p);
            enqueue(t, e.id, p.id);
          }
  return {
    store,
    close() {
      closed = true;
    },
    idle: () => !running && pending.length === 0,
  };
};
