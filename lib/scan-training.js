"use strict";
// Human-verified image/transcript pairs. This module never trains or replaces a model.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { bad } = require("./scan-store");
const validField = /^(q(?:[1-9]|1[0-9]|20)|essay[12])$/;
const signature = (paper) =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        answers: paper.review?.answers,
        texts: paper.review?.texts,
      }),
    )
    .digest("hex");
function writerGroup(store, teacherId, tag, fallback) {
  const value = String(tag || "")
    .trim()
    .toUpperCase();
  if (value && !/^[A-Z0-9_-]{1,40}$/.test(value))
    throw bad("Mã nhóm chữ viết dùng 1–40 chữ/số; ví dụ W001.");
  const dir = path.join(store.root, String(teacherId));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, ".writer-salt");
  let salt;
  try {
    salt = fs.readFileSync(file);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    salt = crypto.randomBytes(32);
    fs.writeFileSync(file, salt, { flag: "wx", mode: 0o600 });
  }
  // Never infer a writer identity from an exam's anonymous paper code.
  return crypto
    .createHmac("sha256", salt)
    .update(value ? "writer:" + value : "paper:" + fallback)
    .digest("hex");
}
function validateSample(paper, body) {
  if (paper.status !== "approved" || !paper.review?.verified)
    throw bad("Chốt và kiểm tra bài trước khi chọn dữ liệu chữ viết.", 409);
  if (body.verified !== true)
    throw bad("Xác nhận ảnh cắt khớp chính xác với chữ đã sửa.");
  const field = String(body.field || ""),
    label = String(body.label || "")
      .normalize("NFC")
      .trim();
  if (
    !validField.test(field) ||
    !label ||
    label.length > 200 ||
    /[\r\n\t\x00-\x1f]/.test(label)
  )
    throw bad("Chọn đáp án A–D hoặc một dòng tự luận, tối đa 200 ký tự.");
  if (field.startsWith("q")) {
    const answer = paper.review.answers[Number(field.slice(1)) - 1];
    if (!/^[ABCD]$/.test(answer) || label !== answer)
      throw bad(
        "Nhãn ký tự phải đúng câu trả lời HS đã được duyệt, không dùng đáp án đề.",
      );
  } else {
    const normalize = (s) =>
      String(s || "")
        .normalize("NFC")
        .replace(/\s+/g, " ")
        .trim();
    if (
      !normalize(paper.review.texts[Number(field.slice(-1)) - 1]).includes(
        normalize(label),
      )
    )
      throw bad(
        "Dòng chữ phải có trong nội dung tự luận đã sửa và chốt. Cập nhật văn bản tự luận trước.",
      );
  }
  const b = body.box;
  if (
    !b ||
    ![0, 1].includes(b.page) ||
    b.page >= (paper.imageTypes?.length || 2) ||
    !["x", "y", "w", "h"].every((k) => Number.isFinite(b[k])) ||
    b.x < 0 ||
    b.y < 0 ||
    b.w < 0.002 ||
    b.h < 0.002 ||
    b.x + b.w > 1.00001 ||
    b.y + b.h > 1.00001 ||
    b.w * b.h > 0.15 ||
    (field.startsWith("essay") && b.h > 0.12)
  )
    throw bad(
      "Kéo khung gọn quanh một chữ hoặc một dòng; không chọn cả trang.",
    );
  return {
    field,
    label,
    box: { page: b.page, x: b.x, y: b.y, w: b.w, h: b.h },
    unit: field.startsWith("q") ? "character" : "line",
    reviewSignature: signature(paper),
  };
}
function trainingDirectory(store, teacherId, examId, paperId) {
  return path.join(
    path.dirname(store.image(teacherId, examId, paperId, 0)),
    "training",
  );
}
function sampleFile(store, t, e, p, id) {
  store.uuid(id);
  return path.join(trainingDirectory(store, t, e, p), id + ".jpg");
}
function available(paper) {
  if (paper.status !== "approved" || !paper.review?.verified) return [];
  return (paper.training?.samples || []).filter(
    (s) => !s.withdrawnAt && s.reviewSignature === signature(paper),
  );
}
async function addSample(store, t, e, p, body) {
  const sample = validateSample(p, body);
  if ((p.training?.samples || []).filter((s) => !s.withdrawnAt).length >= 100)
    throw bad("Mỗi bài tối đa 100 mẫu; bỏ mẫu cũ trước khi thêm.");
  const sha = crypto
    .createHash("sha256")
    .update(JSON.stringify(sample))
    .digest("hex");
  if ((p.training?.samples || []).some((s) => s.sha === sha && !s.withdrawnAt))
    throw bad("Mẫu chữ viết này đã được lưu.", 409);
  const sharp = require("sharp");
  const image = sharp(store.image(t, e, p.id, sample.box.page), {
    limitInputPixels: 25000000,
  }).rotate();
  const normalized = await image.toBuffer({ resolveWithObject: true });
  const w = normalized.info.width,
    h = normalized.info.height,
    b = sample.box;
  const left = Math.floor(b.x * w),
    top = Math.floor(b.y * h),
    width = Math.min(w - left, Math.round(b.w * w)),
    height = Math.min(h - top, Math.round(b.h * h));
  if (width < 8 || height < 8) throw bad("Vùng chữ quá nhỏ; chọn ảnh rõ hơn.");
  const jpeg = await sharp(normalized.data)
    .extract({ left, top, width, height })
    .flatten({ background: "#fff" })
    .jpeg({ quality: 95 })
    .toBuffer();
  const id = crypto.randomUUID(),
    dir = trainingDirectory(store, t, e, p.id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const record = {
    ...sample,
    id,
    sha,
    createdAt: new Date().toISOString(),
    writerGroup: p.writerGroup || writerGroup(store, t, "", p.id),
  };
  fs.writeFileSync(sampleFile(store, t, e, p.id, id), jpeg, {
    mode: 0o600,
    flag: "wx",
  });
  return record;
}
function records(store, t, e) {
  return store.papers(t, e).flatMap((p) =>
    available(p).map((s) => ({
      ...s,
      file: sampleFile(store, t, e, p.id, s.id),
    })),
  );
}
function splitGroup(group) {
  const bucket = parseInt(group.slice(0, 8), 16) % 10;
  return bucket === 0 ? "test" : bucket === 1 ? "validation" : "train";
}
function exportDataset(store, t, e, res) {
  const samples = records(store, t, e);
  if (!samples.length) throw bad("Chưa có mẫu chữ viết đã xác nhận trong đợt.");
  if (samples.length > 20000)
    throw bad(
      "Mỗi lần xuất tối đa 20.000 mẫu. Tách đợt dữ liệu trước khi xuất.",
    );
  const zip = new (require("yazl").ZipFile)(),
    seen = new Map(),
    lines = [];
  const annotations = { train: [], validation: [], test: [] };
  for (const s of samples) {
    if (!fs.existsSync(s.file))
      throw bad("Thiếu ảnh mẫu; khôi phục bản sao lưu trước khi xuất.", 409);
    const imageHash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(s.file))
      .digest("hex");
    // Export identical crops only once; contradictory labels block the export.
    const existing = seen.get(imageHash);
    if (existing && existing.label !== s.label)
      throw bad(
        "Hai mẫu ảnh giống nhau có nhãn khác nhau. Kiểm tra và bỏ mẫu sai.",
        409,
      );
    if (seen.has(imageHash)) continue;
    seen.set(imageHash, { label: s.label });
    const image = "images/" + s.id + ".jpg",
      split = splitGroup(s.writerGroup);
    zip.addFile(s.file, image);
    const row = {
      id: s.id,
      image,
      label: s.label,
      unit: s.unit,
      writerGroup: s.writerGroup,
      split,
      imageHash,
    };
    lines.push(row);
    annotations[split].push(image + "\t" + s.label);
  }
  zip.addBuffer(
    Buffer.from(lines.map((s) => JSON.stringify(s)).join("\n") + "\n"),
    "manifest.jsonl",
  );
  for (const [split, rows] of Object.entries(annotations))
    zip.addBuffer(
      Buffer.from(rows.join("\n") + (rows.length ? "\n" : "")),
      split + ".txt",
    );
  zip.addBuffer(
    Buffer.from(
      "Verified handwriting crops only. No grading or automatic model update.\nVietOCR annotations use image_path<TAB>transcript. Character and line samples can be filtered using manifest.jsonl.\nSplits are grouped by writerGroup. If a writer tag was not supplied, this only separates papers, not known writers; consolidate writers before evaluation.\nSmall datasets may have empty splits. Audit labels, groups and splits before fine-tuning.\n",
    ),
    "README.txt",
  );
  res.set(
    "Content-Disposition",
    'attachment; filename="FPTBN-handwriting-dataset.zip"',
  );
  res.type("application/zip");
  zip.outputStream.on("error", () => res.destroy());
  res.on("close", () => {
    if (!res.writableFinished) zip.outputStream.destroy();
  });
  zip.outputStream.pipe(res);
  zip.end();
}
module.exports = {
  writerGroup,
  validateSample,
  addSample,
  available,
  sampleFile,
  records,
  exportDataset,
  signature,
  splitGroup,
};
