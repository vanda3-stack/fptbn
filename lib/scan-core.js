"use strict";
// Shared by the HTTP API and tests. OCR output is evidence, never an approved grade.
const fail = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
function code(value) {
  const s = String(value || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9_-]{1,40}$/.test(s))
    fail("Mã phách chỉ gồm 1–40 chữ, số, gạch ngang hoặc gạch dưới.");
  return s;
}
function googleId(value, kind) {
  let u;
  try {
    u = new URL(String(value));
  } catch {
    fail("Nhập đường dẫn Google hợp lệ.");
  }
  if (
    u.protocol !== "https:" ||
    u.hostname !== "docs.google.com" ||
    u.username ||
    u.password ||
    u.port
  )
    fail("Chỉ nhận đường dẫn https://docs.google.com.");
  const match = u.pathname.match(
    new RegExp(
      "^/" +
        (kind === "sheet" ? "spreadsheets" : "document") +
        "/d/([A-Za-z0-9_-]{10,160})(?:/|$)",
    ),
  );
  if (!match) fail("Đường dẫn không đúng loại tài liệu Google.");
  return match[1];
}
function validateExam(input) {
  const title = String(input.title || "").trim();
  if (!title || title.length > 160) fail("Tên đợt chấm cần từ 1–160 ký tự.");
  if (
    !Array.isArray(input.key) ||
    input.key.length !== 20 ||
    input.key.some((x) => !/^[ABCD]$/.test(x))
  )
    fail("Cần đủ 20 đáp án A–D.");
  const quizPoint = Number(input.quizPoint);
  if (!Number.isFinite(quizPoint) || quizPoint <= 0 || quizPoint > 0.5)
    fail("Điểm mỗi câu TN phải lớn hơn 0, tối đa 0,5.");
  if (!Array.isArray(input.essays) || input.essays.length !== 2)
    fail("Cần thang điểm cho 2 câu tự luận.");
  const essays = input.essays.map((e, i) => {
    if (!Array.isArray(e.ideas) || !e.ideas.length || e.ideas.length > 30)
      fail("Tự luận " + (i + 1) + " cần 1–30 ý chấm.");
    return {
      ideas: e.ideas.map((idea) => {
        const text = String(idea.text || "").trim(),
          points = Number(idea.points);
        if (
          !text ||
          text.length > 2000 ||
          !Number.isFinite(points) ||
          points <= 0 ||
          points > 10
        )
          fail("Mỗi ý cần nội dung và điểm hợp lệ.");
        return { text, points };
      }),
    };
  });
  const maximum = round(
    20 * quizPoint +
      essays.flatMap((e) => e.ideas).reduce((s, x) => s + x.points, 0),
  );
  if (maximum !== 10)
    fail("Tổng thang điểm phải bằng 10. Hiện tại: " + maximum);
  const layout = input.layout || {};
  for (const [name, box] of Object.entries(layout)) {
    if (
      !/^(code|q(?:[1-9]|1[0-9]|20)|essay[12])$/.test(name) ||
      !box ||
      ![0, 1].includes(box.page) ||
      !["x", "y", "w", "h"].every((k) => Number.isFinite(box[k])) ||
      box.x < 0 ||
      box.y < 0 ||
      box.w < 0.002 ||
      box.h < 0.002 ||
      box.x + box.w > 1.001 ||
      box.y + box.h > 1.001
    )
      fail("Vùng đọc ảnh không hợp lệ.");
  }
  const docUrl = String(input.docUrl || "").trim(),
    sheetUrl = String(input.sheetUrl || "").trim();
  if (docUrl) googleId(docUrl, "doc");
  if (sheetUrl) googleId(sheetUrl, "sheet");
  return {
    title,
    key: input.key,
    quizPoint,
    essays,
    layout,
    docUrl,
    sheetUrl,
    maximum,
  };
}
function review(exam, body, approve) {
  const answers = body.answers;
  if (
    !Array.isArray(answers) ||
    answers.length !== 20 ||
    answers.some(
      (x) => !["", "A", "B", "C", "D", "BLANK", "MULTIPLE"].includes(x),
    )
  )
    fail("Danh sách 20 câu trả lời không hợp lệ.");
  if (!Array.isArray(body.essayScores) || body.essayScores.length !== 2)
    fail("Thiếu điểm tự luận.");
  const essayScores = body.essayScores.map((scores, i) => {
    if (!Array.isArray(scores) || scores.length !== exam.essays[i].ideas.length)
      fail("Thiếu điểm từng ý tự luận.");
    return scores.map((v, j) => {
      if (v === null || v === "") return null;
      if (
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        v < 0 ||
        v > exam.essays[i].ideas[j].points
      )
        fail("Điểm ý tự luận vượt thang điểm.");
      return round(v);
    });
  });
  const manualScore =
    body.manualScore === null ||
    body.manualScore === "" ||
    body.manualScore === undefined
      ? null
      : Number(body.manualScore);
  if (
    manualScore !== null &&
    (!Number.isFinite(manualScore) || manualScore < 0 || manualScore > 10)
  )
    fail("Điểm chấm tay phải từ 0–10.");
  const complete =
    !answers.includes("") && essayScores.flat().every((x) => x !== null);
  if (approve && (!complete || body.verified !== true))
    fail("Xác nhận mã phách, đủ 20 đáp án và điểm từng ý trước khi chốt.");
  const quiz = round(
    answers.reduce(
      (s, a, i) => s + (a === exam.key[i] ? exam.quizPoint : 0),
      0,
    ),
  );
  const essayTotals = essayScores.map((s) =>
    round(s.reduce((n, v) => n + (v || 0), 0)),
  );
  const total = complete ? round(quiz + essayTotals[0] + essayTotals[1]) : null;
  return {
    code: code(body.code),
    answers,
    essayScores,
    texts: [0, 1].map((i) => String(body.texts?.[i] || "").slice(0, 20000)),
    manualScore,
    quiz,
    essayTotals,
    total,
    difference:
      total === null || manualScore === null
        ? null
        : round(total - manualScore),
    verified: approve && body.verified === true,
    note: String(body.note || "").slice(0, 2000),
  };
}
function parseDoc(text) {
  const key = Array(20).fill("");
  // Deliberately only parse explicit numbered answers; never invent a missing key.
  for (const m of String(text).matchAll(
    /(?:^|[\s|;,])(?:Câu\s*)?(\d{1,2})\s*[.):=\-]\s*([ABCD])(?=$|[\s|;,.)])/gimu,
  )) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 20) {
      const a = m[2].toUpperCase();
      if (key[n - 1] && key[n - 1] !== a)
        fail("Tài liệu có đáp án mâu thuẫn ở câu " + n);
      key[n - 1] = a;
    }
  }
  const essays = [{ ideas: [] }, { ideas: [] }];
  let active = -1;
  for (const line of String(text).split(/\r?\n/)) {
    const heading = line
      .trim()
      .match(/^(?:TỰ\s*LUẬN\s*|TL\s*)([12])\s*[:.)-]?/iu);
    if (heading) {
      active = Number(heading[1]) - 1;
      continue;
    }
    if (active >= 0) {
      const m = line.trim().match(/^(\d+(?:[.,]\d+)?)\s*\|\s*(.+)$/u);
      if (m)
        essays[active].ideas.push({
          points: Number(m[1].replace(",", ".")),
          text: m[2],
        });
    }
  }
  return {
    key,
    essays,
    text: String(text),
    warning:
      "Đáp án mới được trích xuất sơ bộ. Kiểm tra đủ 20 câu và thang điểm tự luận trước khi lưu.",
  };
}
const columns = [
  "Mã đợt",
  "Mã phách",
  "TN đã duyệt",
  "TL1 đã duyệt",
  "TL2 đã duyệt",
  "Tổng đã duyệt",
  "Điểm chấm tay",
  "Chênh lệch",
  "Trạng thái",
  "Tên đợt",
];
function sheetRow(exam, paper) {
  const r = paper.review;
  return [
    exam.id,
    r.code,
    r.quiz,
    ...r.essayTotals,
    r.total,
    r.manualScore ?? "",
    r.difference ?? "",
    "Đã chốt",
    exam.title,
  ];
}
function csv(rows) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              String(v ?? "")
                .replace(/^[=+@\-]/, "'$&")
                .replace(/"/g, '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n")
  );
}
module.exports = {
  code,
  googleId,
  validateExam,
  review,
  parseDoc,
  columns,
  sheetRow,
  csv,
};
