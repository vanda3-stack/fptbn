"use strict";
(() => {
  const sourceExample =
    "https://docs.google.com/document/d/17xH-yDghEmgrb3S881JW8cauT_cl6et-Y5xbuqv10us/edit?tab=t.0";
  const $ = (s) => document.querySelector(s),
    esc = (s) =>
      String(s ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  let token = sessionStorage.getItem("ot-teacher-token") || "",
    name = sessionStorage.getItem("ot-teacher-name") || "",
    exams = [],
    exam = null,
    tab = "setup",
    status = {},
    pages = [null, null],
    stream = null,
    reviewPaper = null,
    poll = null,
    imageURLs = [],
    listPage = 0,
    filter = "",
    busy = false;
  const states = {
    review: "Chờ duyệt",
    queued: "Đang xếp hàng",
    processing: "Đang nhận diện",
    approved: "Đã chốt",
    error: "OCR lỗi",
  };
  const fields = [
    "code",
    ...Array.from({ length: 20 }, (_, i) => "q" + (i + 1)),
    "essay1",
    "essay2",
  ];
  const fieldLabel = (k) =>
    k === "code"
      ? "Mã phách"
      : k.startsWith("q")
        ? "TN câu " + k.slice(1)
        : "Tự luận " + k.slice(-1);
  function toast(message) {
    $("#toast").textContent = message;
    $("#toast").hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => ($("#toast").hidden = true), 6500);
  }
  async function api(path, body, method) {
    const options = {
      method: method || (body ? "POST" : "GET"),
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    };
    if (body instanceof FormData) options.body = body;
    else if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    const res = await fetch("/api/scan" + path, options);
    let d;
    try {
      d = await res.json();
    } catch {
      throw Error(
        path === "/capture-exams"
          ? "Máy chủ chưa nạp bản chụp trước. Khởi động lại NodeJS trên VPS rồi tải lại trang."
          : "Máy chủ không trả dữ liệu hợp lệ. Tải lại trang hoặc kiểm tra NodeJS.",
      );
    }
    if (!res.ok) {
      if (res.status === 401) {
        token = "";
        sessionStorage.removeItem("ot-teacher-token");
        login();
      }
      if (path === "/capture-exams" && [400, 404].includes(res.status))
        throw Error(
          "Máy chủ và giao diện chưa cùng phiên bản. Cần cập nhật mã và khởi động lại NodeJS; không cần nhập đáp án để chụp.",
        );
      throw Error(d.message || "Không thể xử lý.");
    }
    return d;
  }
  function run(fn) {
    return async (...args) => {
      try {
        await fn(...args);
      } catch (e) {
        toast(e.message);
      }
    };
  }
  function stopCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    const box = $("#camera");
    if (box) box.hidden = true;
  }
  function cleanup() {
    stopCamera();
    clearTimeout(poll);
    imageURLs.forEach((u) => URL.revokeObjectURL(u));
    imageURLs = [];
  }
  function login() {
    cleanup();
    $("#identity").textContent = "";
    $("#logout").hidden = true;
    $("#app").innerHTML =
      `<div class="login"><span class="eyebrow">FPTBN · Chấm bài giấy</span><h1>Từ bài viết tay<br>đến bảng điểm.</h1><p class="muted">Chụp hai mặt. Kiểm tra đáp án. Chốt điểm theo mã phách.</p><form class="card" id="login"><label>Email giáo viên<input name="email" type="email" autocomplete="username" required></label><label>Mật khẩu<input name="password" type="password" autocomplete="current-password" required></label><button class="primary">Đăng nhập</button><p id="loginError" class="error" role="alert"></p></form><p class="help">Sử dụng tài khoản giáo viên FPTBN Monitor.</p></div>`;
    $("#login").onsubmit = async (e) => {
      e.preventDefault();
      e.submitter.disabled = true;
      try {
        const res = await fetch("/api/teacher/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: e.target.email.value,
              password: e.target.password.value,
            }),
          }),
          d = await res.json();
        if (!res.ok || !d.success)
          throw Error(d.message || "Đăng nhập thất bại.");
        token = d.token;
        name = d.teacher.full_name;
        sessionStorage.setItem("ot-teacher-token", token);
        sessionStorage.setItem("ot-teacher-name", name);
        await init();
      } catch (error) {
        if ($("#loginError")) $("#loginError").textContent = error.message;
      } finally {
        e.submitter.disabled = false;
      }
    };
  }
  async function init() {
    [status, { exams }] = await Promise.all([api("/status"), api("/exams")]);
    status.requiresRestart =
      status.capabilities?.photoFirst !== true ||
      status.capabilities?.rooms !== true;
    if (exam) exam = exams.find((e) => e.id === exam.id) || null;
    render();
  }
  function render() {
    cleanup();
    reviewPaper = null;
    $("#identity").textContent = name;
    $("#logout").hidden = false;
    $("#app").innerHTML =
      `<div class="hero"><div><span class="eyebrow">Chấm bài giấy / Scan</span><h1>Chấm bài theo phòng.</h1><p class="muted">Link đáp án → 2 ảnh mỗi bài → Điểm theo mã phách</p></div><span class="badge ${status.ocr?.ready ? "" : "warn"}">${status.ocr?.ready ? "● OCR đã kết nối" : "● OCR chưa sẵn sàng · vẫn có thể chấm trên ảnh"}</span></div><div class="toolbar scan-exam-toolbar"><label style="flex:1;margin:0">Phòng chấm<select id="examSelect"><option value="">Tạo phòng chấm mới…</option>${exams.map((e) => `<option value="${e.id}" ${exam?.id === e.id ? "selected" : ""}>${esc(e.roomCode ? e.roomCode + " · " + e.title : e.title)} · ${e.count} bài</option>`).join("")}</select></label><button id="newExam" class="primary">＋ Tạo phòng chấm</button></div>${status.requiresRestart ? '<p class="status" role="alert">Giao diện đã cập nhật nhưng máy chủ chưa xác nhận hỗ trợ phòng chấm mới. Cần khởi động lại NodeJS trên VPS rồi tải lại trang. Có thể lưu phòng để chụp trước khi đọc đáp án.</p>' : ""}<nav class="tabs" aria-label="Các bước chấm">${[
        ["setup", "01 · Phòng & đáp án"],
        ["capture", "02 · Chụp 2 ảnh/bài"],
        ["results", "03 · Chấm & Google Sheets"],
      ]
        .map(
          ([id, label]) =>
            `<button data-tab="${id}" class="${tab === id ? "active" : ""}" ${!exam && id !== "setup" ? "disabled" : ""}>${label}</button>`,
        )
        .join("")}</nav><div id="content"></div>`;
    $("#examSelect").onchange = run(async (e) => {
      if (busy) return;
      exam = exams.find((x) => x.id === e.target.value) || null;
      pages = [null, null];
      tab = exam ? "capture" : "setup";
      render();
    });
    $("#newExam").onclick = () => {
      if (busy) return;
      exam = null;
      tab = "setup";
      pages = [null, null];
      render();
    };
    document.querySelectorAll("[data-tab]").forEach(
      (b) =>
        (b.onclick = () => {
          if (busy) {
            toast("Chờ thao tác hiện tại hoàn tất.");
            return;
          }
          tab = b.dataset.tab;
          render();
        }),
    );
    if (tab === "setup") setup();
    else if (tab === "capture") capture();
    else run(results)();
  }
  function setup() {
    let layout = structuredClone(exam?.layout || {}),
      sample = null,
      samplePage = 0,
      selection = "code",
      drag = null;
    const locked = !!exam?.count && !exam?.captureOnly;
    const layoutLocked = !!exam?.hasDerived;
    $("#content").innerHTML =
      `<div class="grid wide"><section><div class="card room-setup"><span class="eyebrow">Bước 1 · Thiết lập phòng chấm</span><h2>Phòng thi & nguồn đáp án</h2><div class="row"><label>Phòng thi<input id="roomCode" maxlength="60" placeholder="Ví dụ: Phòng 01" value="${esc(exam?.roomCode || (exam?.count ? exam.title : ""))}" ${locked ? "disabled" : ""}></label><label>Bài thi / mã đề<input id="title" placeholder="Tin học 8 · Đề 2" value="${esc(exam?.title || "")}" ${locked ? "disabled" : ""}></label></div><label>Link đáp án trên Google Drive / Google Docs<input id="docUrl" type="url" placeholder="https://docs.google.com/document/d/…" value="${esc(exam?.docUrl || sourceExample)}" ${locked ? "disabled" : ""}></label><div class="toolbar"><button id="importDoc" ${locked ? "disabled" : ""}>Đọc đáp án từ link</button><a class="button ghost" id="openSource" href="${esc(exam?.docUrl || sourceExample)}" target="_blank" rel="noopener noreferrer">Mở tài liệu</a></div><p id="sourceNote" class="status">${exam && !exam.captureOnly ? "Đã lưu đáp án: 20 câu trắc nghiệm + 2 câu tự luận." : "Dán link → Đọc đáp án → Kiểm tra 20 câu TN và thang điểm 2 câu TL."}</p><label>Link Google Sheets nhận điểm<input id="sheetUrl" type="url" placeholder="https://docs.google.com/spreadsheets/d/…" value="${esc(exam?.sheetUrl || "")}"></label><p class="help">Kết quả gồm phòng thi, mã phách, điểm TN, TL1, TL2 và tổng điểm. Có thể thêm link Sheets sau khi chụp; cần cấp quyền chỉnh sửa cho tài khoản Google của máy chủ.</p><div class="toolbar"><button class="primary" id="saveExam">${exam ? "Lưu phòng & chuyển sang chụp" : "Tạo phòng & chuyển sang chụp"}</button>${!locked && (!exam || exam.captureOnly) ? '<button id="captureRoom">Lưu phòng, chụp trước khi có đáp án</button>' : ""}</div>${locked ? '<p class="help">Đã có bài chấm: giữ nguyên phòng và đáp án. Muốn dùng mã đề khác, tạo phòng/bộ chấm mới.</p>' : ""}</div><details class="card" id="answerEditor"><summary>Kiểm tra / chỉnh đáp án đã đọc</summary><label style="margin-top:16px">Điểm mỗi câu trắc nghiệm<input id="quizPoint" type="number" min="0.01" max="0.5" step="0.01" value="${exam?.quizPoint ?? 0.25}" ${locked ? "disabled" : ""}></label><div class="key-grid">${Array.from({ length: 20 }, (_, i) => `<label>Câu ${i + 1}<select id="key${i}" ${locked ? "disabled" : ""}><option value="">—</option>${["A", "B", "C", "D"].map((a) => `<option ${exam?.key[i] === a ? "selected" : ""}>${a}</option>`).join("")}</select></label>`).join("")}</div>${[0, 1].map((i) => `<label style="margin-top:20px">Tự luận ${i + 1} · mỗi dòng: điểm | nội dung ý<textarea id="rubric${i}" ${locked ? "disabled" : ""}>${esc((exam?.essays[i].ideas || []).map((x) => x.points + " | " + x.text).join("\n"))}</textarea></label>`).join("")}<p class="help">Tổng thang điểm TN và TL phải bằng 10. Tự luận được GV duyệt theo từng ý.</p></details><details class="card"><summary>Không đọc được link? Dán nội dung đáp án</summary><p class="help">Dán toàn bộ nội dung tài liệu để đọc bảng đáp án và thang điểm.</p><textarea id="sourceText" placeholder="Dán nội dung từ Google Docs"></textarea><button id="parseText" ${locked ? "disabled" : ""}>Đọc nội dung đã dán</button></details></section><aside><div class="card soft"><span class="eyebrow">Một phòng · Một bộ chấm</span><h2>Chụp từng bài, đủ 2 ảnh</h2><ol class="room-flow"><li><b>Thiết lập phòng</b><span>Link đáp án và Google Sheets nhận điểm.</span></li><li><b>Chụp bài</b><span>Nhập mã phách → ảnh mặt 1 → ảnh mặt 2 → lưu bài.</span></li><li><b>Chấm & ghi điểm</b><span>Nhận diện, so với đáp án, kiểm tra rồi ghi điểm cả phòng lên Sheet.</span></li></ol><p class="help">Mỗi phòng quản lý bài riêng. Cùng mã phách ở hai phòng khác nhau không bị gộp.</p></div><details class="card"><summary>Thiết lập vùng đọc ảnh cho OCR</summary><p class="help">Dùng ảnh mẫu cùng loại giấy, chọn mặt và kéo khung từng vùng. Đây là cấu hình cho bộ OCR; không cần để lưu hai ảnh.</p><label>Ảnh mẫu<input id="sampleFile" type="file" accept="image/jpeg,image/png" ${layoutLocked ? "disabled" : ""}></label><div class="row"><label>Mặt<select id="samplePage" ${layoutLocked ? "disabled" : ""}><option value="0">Mặt 1</option><option value="1">Mặt 2</option></select></label><label>Vùng<select id="region" ${layoutLocked ? "disabled" : ""}>${fields.map((k) => `<option value="${k}">${fieldLabel(k)}</option>`).join("")}</select></label></div><div class="canvas-wrap"><canvas id="template" width="600" height="400"></canvas></div><div class="toolbar"><span id="regionCount" class="badge"></span><button id="clearRegion" ${layoutLocked ? "disabled" : ""}>Xóa vùng đang chọn</button></div></details></aside></div>`;
    const canvas = $("#template"),
      ctx = canvas.getContext("2d");
    function draw(temp) {
      canvas.width = sample?.width || 600;
      canvas.height = sample?.height || 400;
      if (sample) ctx.drawImage(sample, 0, 0);
      else {
        ctx.fillStyle = "#edf2e9";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#627571";
        ctx.font = "18px Arial";
        ctx.fillText("Chọn ảnh mẫu để đặt vùng đọc", 35, 190);
      }
      for (const [k, b] of Object.entries(layout)) {
        if (b.page !== samplePage) continue;
        ctx.strokeStyle = k === selection ? "#ee7a38" : "#176c59";
        ctx.lineWidth = 3;
        ctx.strokeRect(
          b.x * canvas.width,
          b.y * canvas.height,
          b.w * canvas.width,
          b.h * canvas.height,
        );
        ctx.fillStyle = ctx.strokeStyle;
        ctx.font = "16px Arial";
        ctx.fillText(
          fieldLabel(k),
          b.x * canvas.width + 3,
          b.y * canvas.height + 18,
        );
      }
      if (temp) {
        ctx.strokeStyle = "#ee7a38";
        ctx.strokeRect(
          temp.x * canvas.width,
          temp.y * canvas.height,
          temp.w * canvas.width,
          temp.h * canvas.height,
        );
      }
      $("#regionCount").textContent = Object.keys(layout).length + "/23 vùng";
    }
    draw();
    const point = (e) => {
      const b = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
        y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)),
      };
    };
    canvas.onpointerdown = (e) => {
      if (locked || !sample) return;
      drag = point(e);
      canvas.setPointerCapture(e.pointerId);
    };
    canvas.onpointermove = (e) => {
      if (!drag) return;
      const p = point(e);
      draw({
        x: Math.min(p.x, drag.x),
        y: Math.min(p.y, drag.y),
        w: Math.abs(p.x - drag.x),
        h: Math.abs(p.y - drag.y),
      });
    };
    canvas.onpointerup = (e) => {
      if (!drag) return;
      const p = point(e),
        box = {
          page: samplePage,
          x: Math.min(p.x, drag.x),
          y: Math.min(p.y, drag.y),
          w: Math.abs(p.x - drag.x),
          h: Math.abs(p.y - drag.y),
        };
      drag = null;
      if (box.w > 0.002 && box.h > 0.002) layout[selection] = box;
      draw();
    };
    canvas.onpointercancel = () => {
      drag = null;
      draw();
    };
    $("#region").onchange = (e) => {
      selection = e.target.value;
      draw();
    };
    $("#samplePage").onchange = (e) => {
      samplePage = Number(e.target.value);
      sample = null;
      $("#sampleFile").value = "";
      draw();
    };
    $("#sampleFile").onchange = run(async (e) => {
      if (!e.target.files[0]) return;
      sample = await bitmap(e.target.files[0]);
      draw();
    });
    $("#clearRegion").onclick = () => {
      delete layout[selection];
      draw();
    };
    function applySource(d) {
      if (locked)
        throw Error("Đợt đã khóa đáp án. Tạo đợt mới để nhập tài liệu khác.");
      d.key.forEach((v, i) => ($("#key" + i).value = v));
      if (d.quizPoint) $("#quizPoint").value = d.quizPoint;
      $("#answerEditor").open = true;
      d.essays.forEach((e, i) => {
        $("#rubric" + i).value = e.ideas
          .map((x) => x.points + " | " + x.text)
          .join("\n");
      });
      $("#sourceText").value = d.text;
      $("#sourceNote").textContent =
        d.warning + " Đã đọc " + d.key.filter(Boolean).length + "/20 câu TN.";
      $("#openSource").href = $("#docUrl").value;
      toast(
        "Đã đọc " +
          d.key.filter(Boolean).length +
          "/20 câu TN; tự luận " +
          d.essays.map((e) => e.ideas.length + " ý").join(" và ") +
          ".",
      );
    }
    $("#importDoc").onclick = run(async (e) => {
      e.target.disabled = true;
      try {
        applySource(await api("/import-doc", { url: $("#docUrl").value }));
      } finally {
        e.target.disabled = false;
      }
    });
    $("#parseText").onclick = run(async () =>
      applySource(await api("/parse-key", { text: $("#sourceText").value })),
    );
    $("#docUrl").oninput = () => {
      const url = $("#docUrl").value;
      $("#openSource").href = /^https:\/\/(?:docs|drive)\.google\.com\//.test(
        url,
      )
        ? url
        : "#";
    };
    if ($("#captureRoom"))
      $("#captureRoom").onclick = run(async (e) => {
        const roomCode = $("#roomCode").value.trim(),
          docUrl = $("#docUrl").value.trim();
        if (!roomCode) throw Error("Nhập tên/số phòng thi trước.");
        if (!docUrl) throw Error("Nhập link đáp án Google Docs.");
        if (status.requiresRestart)
          throw Error(
            "Cần cập nhật và restart NodeJS để tạo phòng chụp trước.",
          );
        e.target.disabled = true;
        try {
          const body = {
            title: $("#title").value.trim() || roomCode,
            roomCode,
            docUrl,
            sheetUrl: $("#sheetUrl").value,
            captureOnly: true,
            layout,
          };
          const d = await api(
            exam ? "/exams/" + exam.id : "/capture-exams",
            body,
            exam ? "PUT" : "POST",
          );
          exam = d.exam;
          tab = "capture";
          await init();
          toast(
            "Đã lưu phòng " + roomCode + ". Chụp đủ 2 ảnh cho mỗi mã phách.",
          );
        } finally {
          e.target.disabled = false;
        }
      });
    $("#saveExam").onclick = run(async (e) => {
      if (status.requiresRestart)
        throw Error("Cần cập nhật và restart NodeJS để dùng phòng chấm mới.");
      if (!$("#roomCode").value.trim())
        throw Error("Nhập tên/số phòng thi trước.");
      if (!$("#docUrl").value.trim())
        throw Error("Nhập link đáp án Google Docs.");
      const essays = [0, 1].map((i) => ({
        ideas: $("#rubric" + i)
          .value.split("\n")
          .filter((x) => x.trim())
          .map((line) => {
            const m = line.match(/^\s*(\d+(?:[.,]\d+)?)\s*\|\s*(.+)$/);
            if (!m)
              throw Error(
                "Tự luận " +
                  (i + 1) +
                  ": mỗi dòng cần định dạng điểm | nội dung.",
              );
            return { points: Number(m[1].replace(",", ".")), text: m[2] };
          }),
      }));
      e.target.disabled = true;
      try {
        const d = await api(
          exam ? "/exams/" + exam.id : "/exams",
          {
            title: $("#title").value.trim() || $("#roomCode").value.trim(),
            roomCode: $("#roomCode").value.trim(),
            key: Array.from({ length: 20 }, (_, i) => $("#key" + i).value),
            quizPoint: Number($("#quizPoint").value),
            essays,
            docUrl: $("#docUrl").value,
            sheetUrl: $("#sheetUrl").value,
            layout,
          },
          exam ? "PUT" : "POST",
        );
        exam = d.exam;
        tab = "capture";
        await init();
        toast("Đã lưu phòng. Chụp 2 ảnh cho từng mã phách.");
      } finally {
        e.target.disabled = false;
      }
    });
  }
  async function bitmap(file) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      const u = URL.createObjectURL(file);
      try {
        const img = new Image();
        img.src = u;
        await img.decode();
        return img;
      } finally {
        URL.revokeObjectURL(u);
      }
    }
  }
  async function normalized(file) {
    if (!file) throw Error("Chưa có ảnh.");
    if (!/^image\/(jpeg|png)$/.test(file.type))
      throw Error("Chọn ảnh JPG hoặc PNG. Với HEIC, hãy xuất sang JPG trước.");
    if (file.size > 30 * 1024 * 1024)
      throw Error("Ảnh nguồn quá lớn; tối đa 30 MB.");
    const img = await bitmap(file),
      scale = Math.min(1, 2400 / Math.max(img.width, img.height)),
      c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    img.close?.();
    return new Promise((resolve) => c.toBlob(resolve, "image/jpeg", 0.92));
  }
  function capture() {
    pages = [null, null];
    $("#content").innerHTML =
      `<div class="grid wide"><section><div class="card"><span class="eyebrow">${esc(exam.roomCode || exam.title)}</span><h2>Chụp 2 ảnh cho từng bài</h2><p class="help">Chụp bằng điện thoại, kiểm tra hai mặt rồi lưu. Bài được lưu trên máy chủ để thầy mở lại và chấm sau.</p><label>Mã phách<input id="code" placeholder="Ví dụ: 00125" maxlength="40" autocomplete="off"></label><label>Mã nhóm chữ viết (tùy chọn)<input id="writerTag" placeholder="Ví dụ W001 · không cần nhập tên HS" maxlength="40" autocomplete="off"></label><div class="grid">${[0, 1].map((i) => `<div class="drop"><strong>Mặt ${i + 1}</strong><img id="preview${i}" alt="Ảnh mặt ${i + 1}" hidden><label>Chọn ảnh / chụp bằng điện thoại<input id="page${i}" type="file" accept="image/jpeg,image/png" capture="environment"></label><button data-camera="${i}">Mở camera trực tiếp</button></div>`).join("")}</div><div id="camera" hidden><video id="video" playsinline autoplay muted></video><div class="toolbar"><button id="shutter" class="accent">Chụp mặt <span id="cameraSide"></span></button><button id="stopCamera">Đóng camera</button></div></div><p class="status" id="captureState">Đã có 0/2 mặt. Ảnh chưa được lưu.</p><div class="toolbar"><button class="primary" id="savePaper">Lưu bài · chấm sau</button><button id="saveNext">Lưu & chụp HS tiếp theo</button></div><p class="help">Camera dừng sau mỗi lần chụp để thầy kiểm tra ảnh. Ảnh phải rõ, đúng hướng và đủ vùng bài làm.</p></div></section><aside><div class="card soft"><span class="eyebrow">Chấm theo đợt</span><h2>Đưa nhiều bài vào cùng lúc</h2><p class="muted">Chọn thư mục ảnh đã chụp. Mỗi mã phách cần một cặp ảnh, tên dạng <b>00125_1.jpg</b> và <b>00125_2.jpg</b>.</p><label>Ảnh hàng loạt<input id="batch" type="file" accept="image/jpeg,image/png" multiple></label><button id="uploadBatch">Kiểm tra & tải cả đợt</button><p id="batchProgress" role="status" class="help">Tải tuần tự, tối đa 2.000 bài/đợt. Không đóng trang khi đang tải.</p></div><div class="card"><h3>Trước khi đưa bài vào</h3><p class="help">① Đúng đợt và mã đề.<br>② Hai mặt cùng một bài.<br>③ Mã phách rõ, không mất số 0 đầu.<br>④ Ảnh cùng chiều và vị trí với ảnh mẫu.</p><button id="toResults">Xem danh sách bài →</button></div></aside></div>`;
    async function setPage(i, blob) {
      pages[i] = blob;
      const u = URL.createObjectURL(blob);
      imageURLs.push(u);
      $("#preview" + i).src = u;
      $("#preview" + i).hidden = false;
      $("#captureState").textContent =
        "Đã có " +
        pages.filter(Boolean).length +
        "/2 mặt. " +
        (pages.every(Boolean) ? "Sẵn sàng lưu." : "Chụp tiếp mặt còn lại.");
    }
    [0, 1].forEach(
      (i) =>
        ($("#page" + i).onchange = run(async (e) => {
          if (e.target.files[0])
            await setPage(i, await normalized(e.target.files[0]));
        })),
    );
    let side = 0;
    document.querySelectorAll("[data-camera]").forEach(
      (b) =>
        (b.onclick = run(async () => {
          stopCamera();
          side = Number(b.dataset.camera);
          if (!navigator.mediaDevices?.getUserMedia)
            throw Error(
              "Trình duyệt chưa hỗ trợ camera. Dùng nút chọn ảnh/chụp phía trên.",
            );
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 2400 },
              height: { ideal: 1800 },
            },
            audio: false,
          });
          $("#video").srcObject = stream;
          $("#cameraSide").textContent = side + 1;
          $("#camera").hidden = false;
          await $("#video").play();
        })),
    );
    $("#stopCamera").onclick = stopCamera;
    $("#shutter").onclick = run(async () => {
      const v = $("#video");
      if (!v.videoWidth) throw Error("Camera chưa sẵn sàng.");
      const c = document.createElement("canvas");
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext("2d").drawImage(v, 0, 0);
      const blob = await new Promise((resolve) =>
        c.toBlob(resolve, "image/jpeg", 0.94),
      );
      await setPage(side, await normalized(blob));
      stopCamera();
      toast("Đã chụp mặt " + (side + 1) + ". Kiểm tra ảnh trước khi lưu.");
    });
    async function upload(code, blobs, writerTag = "") {
      const form = new FormData();
      form.append("code", code);
      form.append("writerTag", writerTag);
      blobs.forEach((b, i) => form.append("pages", b, "page" + i + ".jpg"));
      const d = await api("/exams/" + exam.id + "/papers", form);
      return d.paper;
    }
    async function save(next) {
      if (busy) return;
      if (!pages.every(Boolean)) throw Error("Cần chụp đủ 2 mặt.");
      busy = true;
      $("#savePaper").disabled = $("#saveNext").disabled = true;
      try {
        const p = await upload($("#code").value, pages, $("#writerTag").value);
        exam.count = (exam.count || 0) + 1;
        stopCamera();
        if (next) {
          capture();
          toast("Đã lưu bài. Đưa bài tiếp theo vào.");
        } else {
          tab = "results";
          render();
          toast("Đã lưu hai mặt. Thầy có thể chấm sau trên thiết bị khác.");
        }
      } finally {
        busy = false;
        if ($("#savePaper"))
          $("#savePaper").disabled = $("#saveNext").disabled = false;
      }
    }
    $("#savePaper").onclick = run(() => save(false));
    $("#saveNext").onclick = run(() => save(true));
    $("#toResults").onclick = () => {
      if (!busy) {
        tab = "results";
        render();
      }
    };
    $("#uploadBatch").onclick = run(async (e) => {
      if (busy) return;
      const selected = [...$("#batch").files];
      if (!selected.length) throw Error("Chọn các ảnh cần tải.");
      const groups = new Map();
      for (const f of selected) {
        const m = f.name.match(
          /^([A-Za-z0-9_-]{1,40})_([12])\.(?:jpe?g|png)$/i,
        );
        if (!m) throw Error("Tên ảnh chưa đúng: " + f.name);
        const key = m[1].toUpperCase(),
          g = groups.get(key) || [];
        if (g[Number(m[2]) - 1]) throw Error("Trùng ảnh: " + f.name);
        g[Number(m[2]) - 1] = f;
        groups.set(key, g);
      }
      for (const [code, g] of groups)
        if (!g[0] || !g[1]) throw Error("Thiếu một mặt của mã " + code);
      if (groups.size > 2000) throw Error("Tối đa 2.000 bài/đợt.");
      busy = true;
      e.target.disabled = true;
      $("#savePaper").disabled = $("#saveNext").disabled = true;
      let done = 0;
      const errors = [];
      try {
        for (const [code, g] of groups) {
          $("#batchProgress").textContent =
            "Đang tải " +
            (done + errors.length + 1) +
            "/" +
            groups.size +
            " · " +
            code;
          try {
            await upload(code, [
              await normalized(g[0]),
              await normalized(g[1]),
            ]);
            done++;
            exam.count = (exam.count || 0) + 1;
          } catch (error) {
            errors.push(code + ": " + error.message);
          }
        }
        $("#batchProgress").textContent =
          "Đã lưu " +
          done +
          "/" +
          groups.size +
          " bài." +
          (errors.length ? "\n" + errors.join("\n") : "");
        $("#batchProgress").style.whiteSpace = "pre-wrap";
        toast("Hoàn thành tải ảnh: " + done + " bài.");
      } finally {
        busy = false;
        e.target.disabled = false;
        $("#savePaper").disabled = $("#saveNext").disabled = false;
      }
    });
  }
  async function download(route, filename) {
    const r = await fetch("/api/scan" + route, {
      headers: { Authorization: "Bearer " + token },
    });
    if (!r.ok) {
      const d = await r.json();
      throw Error(d.message || "Không tải được dữ liệu.");
    }
    const u = URL.createObjectURL(await r.blob()),
      a = document.createElement("a");
    a.href = u;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  async function results() {
    const d = await api(
      "/exams/" +
        exam.id +
        "/papers?page=" +
        listPage +
        "&filter=" +
        encodeURIComponent(filter),
    );
    if (tab !== "results" || reviewPaper) return;
    $("#content").innerHTML =
      `<div class="stats"><div class="stat"><b>${d.total}</b><span>Bài đã lưu</span></div><div class="stat"><b>${(d.counts.queued || 0) + (d.counts.processing || 0)}</b><span>Đang nhận diện</span></div><div class="stat"><b>${(d.counts.review || 0) + (d.counts.error || 0)}</b><span>Cần kiểm tra</span></div><div class="stat"><b>${d.counts.approved || 0}</b><span>Đã chốt điểm</span></div></div><div class="card"><div class="toolbar"><h2 style="margin:0;flex:1">${esc(exam.roomCode || exam.title)}</h2><button id="startOcr">Bắt đầu nhận diện các bài đã lưu</button><button id="datasetExport">Tải dữ liệu chữ viết</button><button id="export">Tải CSV</button><button class="primary" id="sync">Ghi điểm phòng lên Sheets</button></div><div class="toolbar"><label style="margin:0">Trạng thái<select id="filter"><option value="">Tất cả</option>${Object.entries(
        states,
      )
        .map(
          ([k, v]) =>
            `<option value="${k}" ${filter === k ? "selected" : ""}>${v}</option>`,
        )
        .join(
          "",
        )}</select></label><button id="reload">Làm mới</button><span class="help">Chỉ bài đã chốt được xuất điểm. Chênh lệch = điểm đã duyệt − điểm chấm tay.</span></div><div class="table-wrap"><table><thead><tr><th>Mã phách</th><th>Trạng thái</th><th>Tổng</th><th>Chênh lệch</th><th></th></tr></thead><tbody>${d.papers.map((p) => `<tr><td><b>${esc(p.code)}</b></td><td><span class="badge ${p.status === "error" ? "warn" : ""}">${states[p.status] || esc(p.status)}</span></td><td>${p.total ?? "—"}</td><td class="${p.difference ? "error" : ""}">${p.difference ?? "—"}</td><td><button data-open="${p.id}">Mở bài →</button></td></tr>`).join("")}</tbody></table>${!d.papers.length ? '<div class="empty">Chưa có bài trong danh sách này. Chọn Chụp 2 ảnh/bài để bắt đầu.</div>' : ""}</div><div class="toolbar"><button id="prev" ${listPage === 0 ? "disabled" : ""}>← Trước</button><span class="help">Trang ${listPage + 1} · ${d.filtered} bài</span><button id="next" ${(listPage + 1) * 50 >= d.filtered ? "disabled" : ""}>Tiếp →</button></div><p id="syncNote" class="help"></p></div>`;
    $("#startOcr").onclick = run(async (e) => {
      e.target.disabled = true;
      try {
        const d = await api("/exams/" + exam.id + "/recognize", {});
        toast("Đã xếp hàng " + d.count + " bài.");
        await results();
      } finally {
        if ($("#startOcr")) $("#startOcr").disabled = false;
      }
    });
    $("#datasetExport").onclick = run(async () =>
      download(
        "/exams/" + exam.id + "/training/export",
        "FPTBN-handwriting-dataset.zip",
      ),
    );
    if (exam.captureOnly) {
      $("#startOcr").disabled = true;
      $("#syncNote").textContent =
        "Đã lưu ảnh. Vào Phòng & đáp án để đọc tài liệu trước khi chấm.";
    }
    $("#filter").onchange = run(async (e) => {
      filter = e.target.value;
      listPage = 0;
      await results();
    });
    $("#reload").onclick = run(results);
    $("#prev").onclick = run(async () => {
      listPage--;
      await results();
    });
    $("#next").onclick = run(async () => {
      listPage++;
      await results();
    });
    document
      .querySelectorAll("[data-open]")
      .forEach((b) => (b.onclick = run(() => openPaper(b.dataset.open))));
    $("#export").onclick = run(async () => {
      const response = await fetch("/api/scan/exams/" + exam.id + "/export", {
        headers: { Authorization: "Bearer " + token },
      });
      if (!response.ok) throw Error("Không tải được CSV.");
      const u = URL.createObjectURL(await response.blob()),
        a = document.createElement("a");
      a.href = u;
      a.download = "FPTBN-scan.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    });
    $("#sync").onclick = run(async (e) => {
      e.target.disabled = true;
      try {
        const d = await api("/exams/" + exam.id + "/sync", {});
        $("#syncNote").textContent =
          "Đã ghi " +
          d.count +
          " bài phòng " +
          (exam.roomCode || exam.title) +
          " vào Google Sheets.";
        toast("Đã đồng bộ Google Sheets.");
      } finally {
        e.target.disabled = false;
      }
    });
    if ((d.counts.queued || 0) + (d.counts.processing || 0) > 0)
      poll = setTimeout(() => run(results)(), 4000);
  }
  async function openPaper(id) {
    clearTimeout(poll);
    imageURLs.forEach((u) => URL.revokeObjectURL(u));
    imageURLs = [];
    const d = await api("/exams/" + exam.id + "/papers/" + id);
    reviewPaper = d.paper;
    if (exam.captureOnly) {
      $("#content").innerHTML =
        '<div class="card"><h2>Ảnh đã lưu · ' +
        esc(d.paper.code) +
        '</h2><p>Đợt chưa có đáp án. Thầy có thể kiểm tra ảnh, nhập đáp án rồi chấm sau.</p><button id="draftBack">← Danh sách bài</button> <button id="draftSetup" class="primary">Nhập đáp án & thang điểm</button><div class="grid" style="margin-top:20px"><img id="draftPage0" class="review-image" alt="Mặt 1 đã lưu"><img id="draftPage1" class="review-image" alt="Mặt 2 đã lưu"></div></div>';
      for (let n = 0; n < 2; n++) {
        const r = await fetch(
          "/api/scan/exams/" + exam.id + "/papers/" + id + "/pages/" + n,
          { headers: { Authorization: "Bearer " + token } },
        );
        if (!r.ok) throw Error("Không tải được ảnh.");
        const u = URL.createObjectURL(await r.blob());
        imageURLs.push(u);
        $("#draftPage" + n).src = u;
      }
      $("#draftBack").onclick = run(async () => {
        reviewPaper = null;
        await results();
      });
      $("#draftSetup").onclick = () => {
        tab = "setup";
        render();
      };
      return;
    }
    const p = reviewPaper,
      approved = p.status === "approved",
      inFlight = ["queued", "processing"].includes(p.status),
      ocr = p.ocr?.fields || {},
      r = p.review || {};
    let answers =
      r.answers ||
      Array.from({ length: 20 }, (_, i) => {
        const text = String(ocr["q" + (i + 1)]?.text || "")
          .trim()
          .toUpperCase();
        return /^[ABCD]$/.test(text) ? text : "";
      });
    let sheetScores =
      r.essayScores || exam.essays.map((e) => e.ideas.map(() => null));
    const texts = r.texts || [ocr.essay1?.text || "", ocr.essay2?.text || ""];
    $("#content").innerHTML =
      `<div class="toolbar"><button id="backList">← Danh sách bài</button><span class="badge">${states[p.status]}</span><span class="help">Mã nhập lúc chụp: ${esc(p.code)}</span></div>${p.error ? '<p class="status">' + esc(p.error) + "</p>" : ""}${inFlight ? '<p class="status">Đang xử lý OCR. Bấm cập nhật sau khi hoàn tất.</p>' : ""}<div class="grid wide"><section class="card"><div class="toolbar"><h2 style="flex:1;margin:0">Bài làm gốc</h2><button data-side="0" class="selected-page">Mặt 1</button><button data-side="1">Mặt 2</button></div><img id="reviewImage" class="review-image" alt="Ảnh bài làm gốc"><p class="help">Chạm ảnh để phóng to. Đối chiếu cả hai mặt trước khi chốt.</p><div class="toolbar"><button id="ocr" ${approved || r.answers || inFlight ? "disabled" : ""}>${p.ocr ? "Nhận diện lại" : "Nhận diện chữ viết"}</button><button id="refreshPaper">Cập nhật trạng thái</button>${approved ? '<button id="trainingOpen">Lưu mẫu chữ viết</button>' : ""}${approved ? '<button id="reopen">Mở lại để sửa</button>' : ""}</div><details><summary>Nhật ký nhận diện và chỉnh sửa</summary><pre>${esc(JSON.stringify({ ocr: p.ocr || "Chưa chạy", history: p.history || [] }, null, 2))}</pre></details></section><section class="card review-pane"><h2>Kiểm tra & cho điểm</h2><p class="help">OCR là bản đọc đề xuất. Tự luận cần GV đối chiếu nội dung theo từng ý. Điểm chưa chốt không được xuất.</p><fieldset ${approved || inFlight ? "disabled" : ""} style="border:0;padding:0;margin:0"><label>Mã phách đã kiểm tra<input id="reviewCode" value="${esc(r.code || p.code)}" maxlength="40"></label>${ocr.code ? '<p class="help">OCR đọc mã: ' + esc(ocr.code.text) + " · đối chiếu với mã nhập khi chụp.</p>" : ""}<h3>20 câu trắc nghiệm</h3><p class="help">“Bỏ trống” và “Nhiều đáp án” được tính 0 điểm. “Chưa xác định” cần kiểm tra trước khi chốt.</p><div class="key-grid">${answers
        .map(
          (a, i) =>
            `<label>Câu ${i + 1} · ĐA ${exam.key[i]}<select data-answer="${i}">${[
              ["", "?"],
              ["A", "A"],
              ["B", "B"],
              ["C", "C"],
              ["D", "D"],
              ["BLANK", "Bỏ trống"],
              ["MULTIPLE", "Nhiều ĐA"],
            ]
              .map(
                ([v, l]) =>
                  `<option value="${v}" ${a === v ? "selected" : ""}>${l}</option>`,
              )
              .join("")}</select></label>`,
        )
        .join(
          "",
        )}</div>${exam.essays.map((e, i) => `<h3 style="margin-top:22px">Tự luận ${i + 1}</h3><label>Nội dung đã nhận diện (có thể sửa)<textarea id="text${i}">${esc(texts[i])}</textarea></label>${e.ideas.map((idea, j) => `<label class="idea"><span>${esc(idea.text)}<small>Tối đa ${idea.points} điểm</small></span><input type="number" data-score="${i}-${j}" min="0" max="${idea.points}" step="0.01" aria-label="Điểm tự luận ${i + 1} ý ${j + 1}" value="${sheetScores[i][j] ?? ""}" placeholder="Chưa chấm"></label>`).join("")}`).join("")}<label style="margin-top:18px">Điểm chấm tay để đối chiếu (không bắt buộc)<input id="manualScore" type="number" min="0" max="10" step="0.01" value="${r.manualScore ?? ""}"></label><label>Ghi chú<textarea id="reviewNote">${esc(r.note || "")}</textarea></label><label class="checkline"><input id="verified" type="checkbox" ${r.verified ? "checked" : ""}>Tôi đã đối chiếu mã phách, hai mặt bài làm, đáp án và điểm từng ý.</label></fieldset><div class="card soft"><span class="eyebrow">Tổng điểm đang duyệt</span><div id="scoreSummary" class="score"></div><div id="difference" class="help"></div></div><div class="toolbar"><button id="saveDraft" ${approved || inFlight ? "disabled" : ""}>Lưu nháp</button><button id="approve" class="primary" ${approved || inFlight ? "disabled" : ""}>Chốt điểm bài này</button></div><p id="reviewNotice" role="status" class="help"></p></section></div><dialog id="zoom"><button id="closeZoom">Đóng ảnh</button><img alt="Ảnh bài làm phóng to" id="zoomImage"></dialog>`;
    let side = 0;
    const urls = {};
    async function image(n) {
      if (!urls[n]) {
        const response = await fetch(
          "/api/scan/exams/" + exam.id + "/papers/" + id + "/pages/" + n,
          { headers: { Authorization: "Bearer " + token } },
        );
        if (!response.ok) throw Error("Không tải được ảnh.");
        urls[n] = URL.createObjectURL(await response.blob());
        imageURLs.push(urls[n]);
      }
      return urls[n];
    }
    async function show(n) {
      side = n;
      $("#reviewImage").src = await image(n);
      document
        .querySelectorAll("[data-side]")
        .forEach((b) =>
          b.classList.toggle("selected-page", Number(b.dataset.side) === n),
        );
    }
    await show(0);
    if ($("#trainingOpen"))
      $("#trainingOpen").onclick = run(() => trainingEditor(p, image));
    document
      .querySelectorAll("[data-side]")
      .forEach((b) => (b.onclick = run(() => show(Number(b.dataset.side)))));
    $("#reviewImage").onclick = () => {
      $("#zoomImage").src = urls[side];
      $("#zoom").showModal();
    };
    $("#closeZoom").onclick = () => $("#zoom").close();
    $("#backList").onclick = run(async () => {
      reviewPaper = null;
      imageURLs.forEach((u) => URL.revokeObjectURL(u));
      imageURLs = [];
      await results();
    });
    $("#refreshPaper").onclick = run(() => openPaper(id));
    $("#ocr").onclick = run(async () => {
      await api("/exams/" + exam.id + "/papers/" + id + "/recognize", {});
      await openPaper(id);
      toast("Đã đưa bài vào hàng đợi OCR.");
    });
    if ($("#reopen"))
      $("#reopen").onclick = run(async () => {
        await api("/exams/" + exam.id + "/papers/" + id + "/reopen", {});
        await openPaper(id);
        toast("Đã mở lại. Cần chốt và đồng bộ Sheet sau khi sửa.");
      });
    function values(approve) {
      return {
        code: $("#reviewCode").value,
        answers: [...document.querySelectorAll("[data-answer]")].map(
          (el) => el.value,
        ),
        essayScores: exam.essays.map((e, i) =>
          e.ideas.map((_, j) => {
            const v = $('[data-score="' + i + "-" + j + '"]').value;
            return v === "" ? null : Number(v);
          }),
        ),
        texts: [$("#text0").value, $("#text1").value],
        manualScore: $("#manualScore").value,
        verified: $("#verified").checked,
        note: $("#reviewNote").value,
        approve,
      };
    }
    function calc() {
      const v = values(false),
        quiz = v.answers.reduce(
          (s, a, i) => s + (a === exam.key[i] ? exam.quizPoint : 0),
          0,
        ),
        essay = v.essayScores.flat().reduce((s, n) => s + (n || 0), 0),
        complete =
          !v.answers.includes("") &&
          v.essayScores.flat().every((x) => x !== null),
        total = Math.round((quiz + essay) * 100) / 100;
      $("#scoreSummary").textContent =
        total.toFixed(2) + " / 10" + (complete ? "" : " · chưa đủ");
      $("#difference").textContent =
        "TN " +
        quiz.toFixed(2) +
        " · TL " +
        essay.toFixed(2) +
        (v.manualScore !== "" && complete
          ? " · Chênh lệch " +
            Math.round((total - Number(v.manualScore)) * 100) / 100
          : "");
      document.querySelectorAll("[data-answer]").forEach((el) => {
        el.classList.toggle(
          "right",
          el.value === exam.key[Number(el.dataset.answer)],
        );
        el.classList.toggle(
          "wrong",
          !!el.value && el.value !== exam.key[Number(el.dataset.answer)],
        );
      });
    }
    document
      .querySelectorAll("[data-answer],[data-score],#manualScore")
      .forEach((el) => (el.oninput = calc));
    calc();
    async function save(approve) {
      if (busy) return;
      busy = true;
      $("#saveDraft").disabled = $("#approve").disabled = true;
      try {
        const d = await api(
          "/exams/" + exam.id + "/papers/" + id + "/review",
          values(approve),
          "PUT",
        );
        reviewPaper = d.paper;
        if (approve) {
          toast("Đã chốt điểm mã phách " + d.paper.review.code);
          await openPaper(id);
        } else {
          $("#reviewNotice").textContent =
            "Đã lưu nháp lúc " + new Date().toLocaleTimeString("vi-VN");
          toast("Đã lưu nháp.");
        }
      } finally {
        busy = false;
        if ($("#saveDraft") && reviewPaper.status !== "approved")
          $("#saveDraft").disabled = $("#approve").disabled = false;
      }
    }
    $("#saveDraft").onclick = run(() => save(false));
    $("#approve").onclick = run(() => save(true));
  }
  async function trainingEditor(p, image) {
    $("#trainingDialog")?.remove();
    const dialog = document.createElement("dialog");
    dialog.id = "trainingDialog";
    dialog.className = "training-dialog";
    dialog.innerHTML = `<div class="toolbar"><h2 style="flex:1;margin:0">Dữ liệu chữ viết đã sửa</h2><button id="trainingClose">Đóng</button></div><p class="help">Chọn một chữ A–D hoặc đúng một dòng tự luận. Chép chính xác chữ HS viết, không chép đáp án mẫu. Chỉ ảnh cắt và nhãn đã xác nhận được xuất để huấn luyện sau.</p><div class="grid"><section><div class="row"><label>Mặt ảnh<select id="trainingPage"><option value="0">Mặt 1</option><option value="1">Mặt 2</option></select></label><label>Nội dung<select id="trainingField">${Array.from({ length: 20 }, (_, i) => `<option value="q${i + 1}">TN ${i + 1} · HS viết ${esc(p.review.answers[i] || "?")}</option>`).join("")}<option value="essay1">Một dòng tự luận 1</option><option value="essay2">Một dòng tự luận 2</option></select></label></div><div class="canvas-wrap"><canvas id="trainingCanvas" width="600" height="800"></canvas></div><p id="trainingRegionNote" class="help">Kéo khung sát quanh chữ hoặc một dòng cần lưu; tránh mã phách và thông tin cá nhân.</p></section><section><label>Chữ đúng trong ảnh cắt<input id="trainingLabel" maxlength="200" autocomplete="off" placeholder="Chép đúng một dòng HS viết"></label><label class="checkline"><input type="checkbox" id="trainingVerified">Tôi đã kiểm tra ảnh cắt và bản chép khớp nhau, không chứa thông tin nhận dạng HS.</label><button id="trainingSave" class="primary">Lưu mẫu đã xác nhận</button><p id="trainingNote" role="status" class="help"></p><div class="status">Lưu dữ liệu không tự huấn luyện hay thay mô hình. Cần huấn luyện theo đợt và so sánh trên tập kiểm thử độc lập.</div><h3>Mẫu đã lưu của bài</h3><div id="trainingSamples"></div><p class="help">Mở lại/sửa nội dung bài sẽ tạm loại các mẫu cũ khỏi bản xuất nếu bản chép thay đổi. Mẫu có thể bỏ chọn hoặc chọn lại.</p></section></div>`;
    $("#content").append(dialog);
    dialog.showModal();
    $("#trainingClose").onclick = () => {
      dialog.close();
      dialog.remove();
    };
    const canvas = $("#trainingCanvas"),
      ctx = canvas.getContext("2d");
    let page = 0,
      field = "q1",
      box = null,
      source = null,
      drag = null;
    function draw(temp) {
      if (!source) return;
      canvas.width = source.naturalWidth;
      canvas.height = source.naturalHeight;
      ctx.drawImage(source, 0, 0);
      const b = temp || box;
      if (b && b.page === page) {
        ctx.strokeStyle = "#ee7a38";
        ctx.lineWidth = Math.max(3, canvas.width / 300);
        ctx.strokeRect(
          b.x * canvas.width,
          b.y * canvas.height,
          b.w * canvas.width,
          b.h * canvas.height,
        );
      }
      $("#trainingRegionNote").textContent = box
        ? "Đã chọn vùng · kiểm tra ảnh và nhãn trước khi lưu."
        : "Kéo khung sát quanh một chữ hoặc một dòng cần lưu.";
    }
    async function showPage() {
      const img = new Image();
      img.src = await image(page);
      await img.decode();
      source = img;
      draw();
    }
    async function selectField() {
      field = $("#trainingField").value;
      const preset = exam.layout?.[field];
      box = field.startsWith("q") && preset ? structuredClone(preset) : null;
      if (box) page = box.page;
      $("#trainingPage").value = String(page);
      $("#trainingLabel").value =
        field.startsWith("q") &&
        /^[ABCD]$/.test(p.review.answers[Number(field.slice(1)) - 1])
          ? p.review.answers[Number(field.slice(1)) - 1]
          : "";
      $("#trainingVerified").checked = false;
      await showPage();
    }
    const point = (e) => {
      const b = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
        y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)),
      };
    };
    canvas.onpointerdown = (e) => {
      drag = point(e);
      canvas.setPointerCapture(e.pointerId);
    };
    canvas.onpointermove = (e) => {
      if (!drag) return;
      const p = point(e);
      draw({
        page,
        x: Math.min(p.x, drag.x),
        y: Math.min(p.y, drag.y),
        w: Math.abs(p.x - drag.x),
        h: Math.abs(p.y - drag.y),
      });
    };
    canvas.onpointerup = (e) => {
      if (!drag) return;
      const p = point(e);
      box = {
        page,
        x: Math.min(p.x, drag.x),
        y: Math.min(p.y, drag.y),
        w: Math.abs(p.x - drag.x),
        h: Math.abs(p.y - drag.y),
      };
      drag = null;
      $("#trainingVerified").checked = false;
      draw();
    };
    canvas.onpointercancel = () => {
      drag = null;
      draw();
    };
    $("#trainingField").onchange = run(selectField);
    $("#trainingPage").onchange = run(async (e) => {
      page = Number(e.target.value);
      box = null;
      $("#trainingVerified").checked = false;
      await showPage();
    });
    $("#trainingLabel").oninput = () =>
      ($("#trainingVerified").checked = false);
    function renderSamples() {
      const samples = p.training?.samples || [];
      $("#trainingSamples").innerHTML = samples.length
        ? samples
            .map(
              (s) =>
                `<div class="training-sample"><span>${esc(s.label)}<small>${s.unit === "character" ? "Ký tự" : "Dòng chữ"} · ${s.withdrawnAt ? "Đã bỏ chọn" : "Đã chọn"}</small></span><button data-training-id="${s.id}" data-include="${!!s.withdrawnAt}">${s.withdrawnAt ? "Chọn lại" : "Bỏ chọn"}</button></div>`,
            )
            .join("")
        : '<p class="help">Chưa có mẫu. Ưu tiên chữ OCR đọc sai đã được thầy sửa.</p>';
      dialog.querySelectorAll("[data-training-id]").forEach(
        (b) =>
          (b.onclick = run(async () => {
            const included = b.dataset.include === "true";
            await api(
              "/exams/" +
                exam.id +
                "/papers/" +
                p.id +
                "/training/" +
                b.dataset.trainingId,
              { included },
              "PUT",
            );
            const s = samples.find((s) => s.id === b.dataset.trainingId);
            s.withdrawnAt = included ? null : new Date().toISOString();
            renderSamples();
          })),
      );
    }
    $("#trainingSave").onclick = run(async (e) => {
      if (!box) throw Error("Chọn vùng chữ trên ảnh trước.");
      if (!$("#trainingVerified").checked)
        throw Error("Kiểm tra ảnh và xác nhận bản chép trước khi lưu.");
      e.target.disabled = true;
      try {
        const d = await api(
          "/exams/" + exam.id + "/papers/" + p.id + "/training",
          { field, label: $("#trainingLabel").value, box, verified: true },
        );
        p.training ||= { samples: [] };
        p.training.samples.push(d.sample);
        $("#trainingVerified").checked = false;
        $("#trainingNote").textContent =
          "Đã lưu mẫu. Có thể xuất dữ liệu ở danh sách bài sau.";
        renderSamples();
      } finally {
        e.target.disabled = false;
      }
    });
    renderSamples();
    await selectField();
  }
  $("#logout").onclick = () => {
    token = "";
    sessionStorage.removeItem("ot-teacher-token");
    sessionStorage.removeItem("ot-teacher-name");
    exam = null;
    login();
  };
  window.addEventListener("pagehide", stopCamera);
  window.addEventListener("beforeunload", (e) => {
    if (busy) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  if (token) run(init)();
  else login();
})();
