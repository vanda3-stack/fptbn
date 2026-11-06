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
    grades = [],
    grade = null,
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
      `<div class="login"><span class="eyebrow">FPTBN · Chấm bài giấy</span><h1>Từ bài viết tay<br>đến bảng điểm.</h1><p class="muted">Chụp 1–2 mặt. Kiểm tra đáp án. Chốt điểm theo mã phách.</p><form class="card" id="login"><label>Email giáo viên<input name="email" type="email" autocomplete="username" required></label><label>Mật khẩu<input name="password" type="password" autocomplete="current-password" required></label><button class="primary">Đăng nhập</button><p id="loginError" class="error" role="alert"></p></form><p class="help">Sử dụng tài khoản giáo viên FPTBN Monitor.</p></div>`;
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
    status = await api("/status");
    status.requiresRestart = !(
      status.capabilities?.grades && status.capabilities?.flexiblePages
    );
    if (!status.requiresRestart) {
      const [r, g] = await Promise.all([api("/exams"), api("/grades")]);
      exams = r.exams;
      grades = g.grades;
      if (grade && grade.id !== "legacy")
        grade = grades.find((g) => g.id === grade.id) || null;
      if (exam) exam = exams.find((e) => e.id === exam.id) || null;
    }
    render();
  }
  function render() {
    cleanup();
    reviewPaper = null;
    $("#identity").textContent = name;
    $("#logout").hidden = false;
    $("#app").innerHTML =
      `<div class="hero"><div><span class="eyebrow">FPTBN · Chấm bài giấy</span><h1>${esc(exam?.roomCode || grade?.name || "Chấm bài thi")}</h1><p class="muted">Khối → Phòng → Quét bài → Chấm điểm</p></div><a class="button" href="https://drive.google.com/drive/folders/1VAs8HYRjY-nCqRFVkE8I0AmiUkLqEVej" target="_blank" rel="noopener noreferrer">Thư mục bảng điểm ↗</a></div><div id="content"></div>`;
    if (status.requiresRestart) {
      $("#content").innerHTML =
        '<div class="card"><h2>Cần cập nhật máy chủ</h2><p>Giao diện mới cần NodeJS phiên bản scan-20261103-5. Cập nhật mã và restart NodeJS trên VPS rồi mở lại trang.</p><button id="retry">Kiểm tra lại</button></div>';
      $("#retry").onclick = run(init);
      return;
    }
    if (!grade) {
      gradeList();
      return;
    }
    const nav = document.createElement("div");
    nav.className = "toolbar";
    nav.innerHTML =
      '<button id="backGrades">← Khối chấm</button>' +
      (exam ? '<button id="backRooms">← Phòng chấm</button>' : "") +
      (grade.sheetUrl
        ? '<a class="button" href="' +
          esc(grade.sheetUrl) +
          '" target="_blank" rel="noopener noreferrer">Bảng điểm ' +
          esc(grade.name) +
          " ↗</a>"
        : "");
    $("#content").before(nav);
    $("#backGrades").onclick = () => {
      grade = null;
      exam = null;
      tab = "rooms";
      render();
    };
    if ($("#backRooms"))
      $("#backRooms").onclick = () => {
        exam = null;
        tab = "rooms";
        render();
      };
    if (!exam && tab !== "setup") {
      roomList();
      return;
    }
    if (exam) {
      const tabs = document.createElement("nav");
      tabs.className = "tabs";
      tabs.innerHTML = [
        ["setup", "Đáp án"],
        ["capture", "Quét bài"],
        ["results", "Chấm & lưu điểm"],
      ]
        .map(
          ([id, label]) =>
            `<button data-tab="${id}" class="${tab === id ? "active" : ""}">${label}</button>`,
        )
        .join("");
      $("#content").before(tabs);
      tabs.querySelectorAll("button").forEach(
        (b) =>
          (b.onclick = () => {
            if (busy) return;
            tab = b.dataset.tab;
            render();
          }),
      );
    }
    if (tab === "setup") setup();
    else if (tab === "capture") capture();
    else run(results)();
  }
  function gradeList() {
    $("#content").innerHTML =
      `<section class="card"><h2>Khối chấm</h2><form id="gradeForm" class="toolbar"><input id="gradeName" placeholder="Ví dụ: Khối 8" maxlength="80" required aria-label="Tên khối"><button class="primary">＋ Tạo khối</button></form><div class="grade-grid">${grades.map((g) => `<button class="grade-card" data-grade="${g.id}"><b>${esc(g.name)}</b><span>${g.rooms} phòng</span></button>`).join("")}</div>${!grades.length ? '<p class="muted">Tạo khối để bắt đầu.</p>' : ""}</section>${
        exams.some((e) => !e.gradeId)
          ? '<details class="card"><summary>Bài đã lưu trước đây</summary>' +
            exams
              .filter((e) => !e.gradeId)
              .map(
                (e) =>
                  '<button data-legacy="' +
                  e.id +
                  '">' +
                  esc(e.roomCode || e.title) +
                  "</button>",
              )
              .join(" ") +
            "</details>"
          : ""
      }`;
    $("#gradeForm").onsubmit = run(async (e) => {
      e.preventDefault();
      e.submitter.disabled = true;
      try {
        const d = await api("/grades", { name: $("#gradeName").value });
        grade = d.grade;
        tab = "rooms";
        await init();
      } finally {
        e.submitter.disabled = false;
      }
    });
    document.querySelectorAll("[data-grade]").forEach(
      (b) =>
        (b.onclick = () => {
          grade = grades.find((g) => g.id === b.dataset.grade);
          tab = "rooms";
          render();
        }),
    );
    document.querySelectorAll("[data-legacy]").forEach(
      (b) =>
        (b.onclick = () => {
          grade = { id: "legacy", name: "Bài cũ" };
          exam = exams.find((e) => e.id === b.dataset.legacy);
          tab = "results";
          render();
        }),
    );
  }
  function roomList() {
    const rooms = exams.filter((e) => e.gradeId === grade.id);
    $("#content").innerHTML =
      `<section class="card"><div class="toolbar"><h2 style="flex:1;margin:0">Phòng chấm · ${esc(grade.name)}</h2><button id="newRoom" class="primary">＋ Tạo phòng</button>${!grade.sheetUrl ? '<button id="createWorkbook">Tạo bảng điểm khối</button>' : ""}</div><p class="help">Một bảng tính cho khối; mỗi phòng một tab. Chỉ hai cột: Mã phách và Điểm chấm tự động.</p><div class="grade-grid">${rooms.map((e) => `<button class="grade-card" data-room="${e.id}"><b>${esc(e.roomCode)}</b><span>${e.count} bài · ${e.approved} đã chốt</span></button>`).join("")}</div>${!rooms.length ? '<p class="muted">Chưa có phòng chấm.</p>' : ""}</section>`;
    $("#newRoom").onclick = () => {
      exam = null;
      tab = "setup";
      render();
    };
    document.querySelectorAll("[data-room]").forEach(
      (b) =>
        (b.onclick = () => {
          exam = rooms.find((e) => e.id === b.dataset.room);
          tab = "capture";
          render();
        }),
    );
    if ($("#createWorkbook"))
      $("#createWorkbook").onclick = run(async (e) => {
        e.target.disabled = true;
        try {
          const d = await api("/grades/" + grade.id + "/sheet", {});
          grade = d.grade;
          await init();
          toast("Đã tạo bảng điểm trong thư mục TEST CHẤM THI.");
        } finally {
          e.target.disabled = false;
        }
      });
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
      `<div class="card compact-form"><h2>${exam ? "Đáp án phòng" : "Tạo phòng chấm"}</h2><label>Tên phòng<input id="roomCode" placeholder="Ví dụ: Phòng 01" value="${esc(exam?.roomCode || "")}" maxlength="60" ${locked ? "disabled" : ""}></label><input id="title" type="hidden" value="${esc(exam?.title || "")}"><input id="sheetUrl" type="hidden" value="${esc(exam?.sheetUrl || "")}"><label>Link đáp án Google Docs<input id="docUrl" type="url" value="${esc(exam?.docUrl || "")}" placeholder="https://docs.google.com/document/d/…" ${locked ? "disabled" : ""}></label><div class="toolbar"><button id="importDoc" ${locked ? "disabled" : ""}>Đọc đáp án</button><a id="openSource" class="button ghost" href="${esc(exam?.docUrl || sourceExample)}" target="_blank" rel="noopener noreferrer">Mở tài liệu</a></div><p id="sourceNote" class="help">${exam && !exam.captureOnly ? "Đã có 20 câu TN và 2 câu TL." : "Nhập link rồi bấm Đọc đáp án."}</p><button id="saveExam" class="primary">${exam ? "Lưu đáp án" : "Lưu phòng"}</button><details id="answerEditor"><summary>Kiểm tra / sửa đáp án</summary><label>Điểm mỗi câu TN<input id="quizPoint" type="number" value="${exam?.quizPoint ?? 0.25}" min="0.01" max="0.5" step="0.01" ${locked ? "disabled" : ""}></label><div class="key-grid">${Array.from({ length: 20 }, (_, i) => `<label>Câu ${i + 1}<select id="key${i}" ${locked ? "disabled" : ""}><option value="">—</option>${["A", "B", "C", "D"].map((a) => `<option ${exam?.key[i] === a ? "selected" : ""}>${a}</option>`).join("")}</select></label>`).join("")}</div>${[0, 1].map((i) => `<label>Tự luận ${i + 1}<textarea id="rubric${i}" ${locked ? "disabled" : ""}>${esc((exam?.essays[i].ideas || []).map((x) => x.points + " | " + x.text).join("\n"))}</textarea></label>`).join("")}</details><details><summary>Dán nội dung nếu không đọc được link</summary><textarea id="sourceText"></textarea><button id="parseText">Đọc nội dung</button></details></div><details class="card advanced-scan"><summary>Tùy chọn vùng đọc ảnh</summary><label>Ảnh mẫu<input id="sampleFile" type="file" accept="image/jpeg,image/png" ${layoutLocked ? "disabled" : ""}></label><div class="row"><label>Mặt<select id="samplePage"><option value="0">Mặt 1</option><option value="1">Mặt 2</option></select></label><label>Vùng<select id="region">${fields.map((k) => `<option value="${k}">${fieldLabel(k)}</option>`).join("")}</select></label></div><div class="canvas-wrap"><canvas id="template" width="600" height="400"></canvas></div><div class="toolbar"><span id="regionCount"></span><button id="clearRegion">Xóa vùng</button></div></details>`;
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
            "Đã lưu phòng " + roomCode + ". Chụp 1–2 ảnh cho mỗi mã phách.",
          );
        } finally {
          e.target.disabled = false;
        }
      });
    $("#saveExam").onclick = run(async (e) => {
      if (
        !Array.from({ length: 20 }, (_, i) => $("#key" + i).value).some(Boolean)
      )
        applySource(await api("/import-doc", { url: $("#docUrl").value }));

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
            gradeId:
              grade?.id === "legacy" ? "" : grade?.id || exam?.gradeId || "",

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
        toast("Đã lưu phòng. Chụp 1–2 ảnh cho từng mã phách.");
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
      `<div class="card compact-capture"><h2>Quét bài thi</h2><label>Mã phách<input id="code" placeholder="Nhập mã phách" maxlength="40" autocomplete="off"></label><input type="hidden" id="writerTag" value=""><div class="grid"><div class="drop"><strong>Mặt 1</strong><img id="preview0" alt="Mặt 1" hidden><label>Chụp / chọn ảnh<input id="page0" type="file" accept="image/jpeg,image/png" capture="environment"></label></div><div class="drop" id="face2" hidden><strong>Mặt 2 (tùy chọn)</strong><img id="preview1" alt="Mặt 2" hidden><label>Chụp / chọn ảnh<input id="page1" type="file" accept="image/jpeg,image/png" capture="environment"></label><button id="removeFace2">Bỏ mặt 2</button></div></div><button id="addFace2" class="ghost">＋ Thêm mặt 2</button><div id="camera" hidden><video id="video" playsinline autoplay muted></video><button id="shutter">Chụp mặt <span id="cameraSide"></span></button><button id="stopCamera">Đóng camera</button></div><p id="captureState" class="help">Chụp mặt 1; thêm mặt 2 nếu bài còn nội dung.</p><div class="toolbar"><button id="saveNext" class="primary">Lưu & quét bài tiếp</button><button id="savePaper">Lưu & xem danh sách</button></div></div><div class="toolbar"><button id="toResults">Chấm & lưu điểm →</button></div><details class="card"><summary>Tải nhiều ảnh có sẵn</summary><p class="help">Tên ảnh: 00125_1.jpg và 00125_2.jpg (mặt 2 tùy chọn).</p><input id="batch" type="file" accept="image/jpeg,image/png" multiple><button id="uploadBatch">Tải ảnh</button><p id="batchProgress" class="help"></p></details>`;
    async function setPage(i, blob) {
      pages[i] = blob;
      const u = URL.createObjectURL(blob);
      imageURLs.push(u);
      $("#preview" + i).src = u;
      $("#preview" + i).hidden = false;
      $("#captureState").textContent =
        "Đã có " +
        pages.filter(Boolean).length +
        " ảnh. Bấm lưu khi đã đủ nội dung bài.";
    }
    $("#addFace2").onclick = () => {
      $("#face2").hidden = false;
      $("#addFace2").hidden = true;
    };
    $("#removeFace2").onclick = () => {
      pages[1] = null;
      $("#page1").value = "";
      $("#preview1").hidden = true;
      $("#face2").hidden = true;
      $("#addFace2").hidden = false;
      $("#captureState").textContent = pages[0]
        ? "Đã có 1 ảnh. Có thể lưu bài."
        : "Chụp mặt 1 trước.";
    };
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
      if (!pages[0]) throw Error("Chụp mặt 1 trước khi lưu.");
      busy = true;
      $("#savePaper").disabled = $("#saveNext").disabled = true;
      try {
        const p = await upload(
          $("#code").value,
          pages.filter(Boolean),
          $("#writerTag").value,
        );
        exam.count = (exam.count || 0) + 1;
        stopCamera();
        if (next) {
          capture();
          toast("Đã lưu bài. Đưa bài tiếp theo vào.");
        } else {
          tab = "results";
          render();
          toast("Đã lưu bài. Thầy có thể chấm sau trên thiết bị khác.");
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
        if (!g[0]) throw Error("Thiếu mặt 1 của mã " + code);
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
            await upload(
              code,
              g[1]
                ? [await normalized(g[0]), await normalized(g[1])]
                : [await normalized(g[0])],
            );
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
    const d = await api("/exams/" + exam.id + "/papers?page=" + listPage);
    if (tab !== "results" || reviewPaper) return;
    $("#content").innerHTML =
      `<section class="card"><div class="toolbar"><h2 style="flex:1;margin:0">${esc(exam.roomCode)} · ${d.total} bài</h2><button id="startOcr" class="primary" ${exam.captureOnly ? "disabled" : ""}>Chấm bài</button><button id="sync">Lưu Google Sheets</button></div>${!status.ocr?.ready ? '<p class="help">Chưa kết nối bộ nhận diện. Có thể lưu ảnh và kiểm tra bài.</p>' : ""}${exam.captureOnly ? '<p class="help">Nhập đáp án phòng trước khi chấm.</p>' : ""}<div class="table-wrap"><table><thead><tr><th>Mã phách</th><th>Điểm</th><th></th></tr></thead><tbody>${d.papers.map((p) => `<tr><td><b>${esc(p.code)}</b></td><td>${p.total ?? "—"}<small>${p.status === "approved" ? "Đã chốt" : p.status === "queued" || p.status === "processing" ? "Đang chấm" : p.automatic?.needsReview ? "Cần kiểm tra" : p.automatic?.total !== null && p.automatic?.total !== undefined ? "Tự động · cần kiểm tra" : "Đã lưu " + p.pageCount + " ảnh"}</small></td><td><button data-open="${p.id}">Kiểm tra</button></td></tr>`).join("")}</tbody></table></div>${!d.total ? '<p class="muted">Chưa có bài. Chọn Quét bài để bắt đầu.</p>' : ""}<div class="toolbar"><button id="prev" ${listPage === 0 ? "disabled" : ""}>←</button><span class="help">Trang ${listPage + 1}</span><button id="next" ${(listPage + 1) * 50 >= d.total ? "disabled" : ""}>→</button><button id="reload">Làm mới</button></div><p id="syncNote" role="status" class="help"></p></section>`;
    $("#startOcr").onclick = run(async (e) => {
      e.target.disabled = true;
      try {
        const r = await api("/exams/" + exam.id + "/recognize", {});
        toast("Đang chấm " + r.count + " bài.");
        await results();
      } finally {
        if ($("#startOcr")) $("#startOcr").disabled = false;
      }
    });
    $("#sync").onclick = run(async (e) => {
      e.target.disabled = true;
      try {
        const r = await api("/exams/" + exam.id + "/sync", {});
        $("#syncNote").textContent =
          "Đã lưu " +
          r.count +
          " mã phách; " +
          (r.scored ?? r.count) +
          " bài có điểm" +
          (r.pending ? " · " + r.pending + " bài chờ kiểm tra" : "") +
          ".";
        if (r.url) {
          grade.sheetUrl = r.url;
          const a = document.createElement("a");
          a.href = r.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = " Mở bảng điểm ↗";
          $("#syncNote").append(a);
        }
        toast("Đã lưu Google Sheets.");
      } finally {
        e.target.disabled = false;
      }
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
      for (let n = 0; n < d.paper.imageTypes.length; n++) {
        const r = await fetch(
          "/api/scan/exams/" + exam.id + "/papers/" + id + "/pages/" + n,
          { headers: { Authorization: "Bearer " + token } },
        );
        if (!r.ok) throw Error("Không tải được ảnh.");
        const u = URL.createObjectURL(await r.blob());
        imageURLs.push(u);
        $("#draftPage" + n).src = u;
      }
      $("#draftPage1").hidden = d.paper.imageTypes.length < 2;
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
      `<div class="toolbar"><button id="backList">← Danh sách bài</button><span class="badge">${states[p.status]}</span><span class="help">Mã nhập lúc chụp: ${esc(p.code)}</span></div>${p.error ? '<p class="status">' + esc(p.error) + "</p>" : ""}${inFlight ? '<p class="status">Đang xử lý OCR. Bấm cập nhật sau khi hoàn tất.</p>' : ""}<div class="grid wide"><section class="card"><div class="toolbar"><h2 style="flex:1;margin:0">Bài làm gốc</h2><button data-side="0" class="selected-page">Mặt 1</button><button data-side="1">Mặt 2</button></div><img id="reviewImage" class="review-image" alt="Ảnh bài làm gốc"><p class="help">Chạm ảnh để phóng to. Đối chiếu tất cả ảnh trước khi chốt.</p><div class="toolbar"><button id="ocr" ${approved || r.answers || inFlight ? "disabled" : ""}>${p.ocr ? "Nhận diện lại" : "Nhận diện chữ viết"}</button><button id="refreshPaper">Cập nhật trạng thái</button>${approved ? '<button id="trainingOpen">Lưu mẫu chữ viết</button>' : ""}${approved ? '<button id="reopen">Mở lại để sửa</button>' : ""}</div><details><summary>Nhật ký nhận diện và chỉnh sửa</summary><pre>${esc(JSON.stringify({ ocr: p.ocr || "Chưa chạy", history: p.history || [] }, null, 2))}</pre></details></section><section class="card review-pane"><h2>Kiểm tra & cho điểm</h2><p class="help">OCR là bản đọc đề xuất. Tự luận cần GV đối chiếu nội dung theo từng ý. Bài chưa đủ căn cứ được để trống điểm khi xuất.</p><fieldset ${approved || inFlight ? "disabled" : ""} style="border:0;padding:0;margin:0"><label>Mã phách đã kiểm tra<input id="reviewCode" value="${esc(r.code || p.code)}" maxlength="40"></label>${ocr.code ? '<p class="help">OCR đọc mã: ' + esc(ocr.code.text) + " · đối chiếu với mã nhập khi chụp.</p>" : ""}<h3>20 câu trắc nghiệm</h3><p class="help">“Bỏ trống” và “Nhiều đáp án” được tính 0 điểm. “Chưa xác định” cần kiểm tra trước khi chốt.</p><div class="key-grid">${answers
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
        )}</div>${exam.essays.map((e, i) => `<h3 style="margin-top:22px">Tự luận ${i + 1}</h3><label>Nội dung đã nhận diện (có thể sửa)<textarea id="text${i}">${esc(texts[i])}</textarea></label>${e.ideas.map((idea, j) => `<label class="idea"><span>${esc(idea.text)}<small>Tối đa ${idea.points} điểm</small></span><input type="number" data-score="${i}-${j}" min="0" max="${idea.points}" step="0.01" aria-label="Điểm tự luận ${i + 1} ý ${j + 1}" value="${sheetScores[i][j] ?? ""}" placeholder="Chưa chấm"></label>`).join("")}`).join("")}<label hidden style="margin-top:18px">Điểm chấm tay để đối chiếu (không bắt buộc)<input id="manualScore" type="number" min="0" max="10" step="0.01" value="${r.manualScore ?? ""}"></label><label hidden>Ghi chú<textarea id="reviewNote">${esc(r.note || "")}</textarea></label><label class="checkline"><input id="verified" type="checkbox" ${r.verified ? "checked" : ""}>Tôi đã đối chiếu mã phách, các ảnh bài làm, đáp án và điểm từng ý.</label></fieldset><div class="card soft"><span class="eyebrow">Tổng điểm đang duyệt</span><div id="scoreSummary" class="score"></div><div id="difference" class="help"></div></div><div class="toolbar"><button id="saveDraft" ${approved || inFlight ? "disabled" : ""}>Lưu nháp</button><button id="approve" class="primary" ${approved || inFlight ? "disabled" : ""}>Chốt điểm bài này</button></div><p id="reviewNotice" role="status" class="help"></p></section></div><dialog id="zoom"><button id="closeZoom">Đóng ảnh</button><img alt="Ảnh bài làm phóng to" id="zoomImage"></dialog>`;
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
    if (p.imageTypes.length < 2)
      document.querySelector('[data-side="1"]').hidden = true;
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
    grade = null;
    grades = [];
    exams = [];
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
