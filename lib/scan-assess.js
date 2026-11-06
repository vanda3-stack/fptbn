"use strict";
const gradeOutline = require("./outline-essay-grading");
const norm = (s) =>
  String(s || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
const round = (n) => Math.round(n * 100) / 100;
module.exports = function assess(exam, ocr) {
  if (exam.captureOnly)
    return { total: null, needsReview: true, reason: "Chưa có đáp án." };
  const fields = ocr?.fields || {},
    answers = exam.key.map((_, i) => {
      const value = String(fields["q" + (i + 1)]?.text || "")
        .trim()
        .toUpperCase();
      return /^[ABCD]$/.test(value) ? value : "";
    });
  const quiz = round(
    answers.reduce(
      (s, a, i) => s + (a === exam.key[i] ? exam.quizPoint : 0),
      0,
    ),
  );
  const essays = exam.essays.map((rubric, i) => {
    const text = String(fields["essay" + (i + 1)]?.text || "").trim();
    if (!text) return { score: null, reason: "Chưa đọc rõ phần tự luận." };
    const rules = gradeOutline(
      { ideas: rubric.ideas.map((i) => i.text) },
      { text },
    );
    if (rules && !rules.pending)
      return {
        score: round(
          rules.fractions.reduce(
            (s, f, j) => s + f * rubric.ideas[j].points,
            0,
          ),
        ),
        method: rules.method,
      };
    // Exact complete transcription is a safe baseline. No guessed partial semantic marks.
    if (norm(text) === norm(rubric.ideas.map((i) => i.text).join(" ")))
      return {
        score: round(rubric.ideas.reduce((s, i) => s + i.points, 0)),
        method: "exact_complete_answer",
      };
    return { score: null, reason: "Cần GV kiểm tra nội dung theo thang điểm." };
  });
  const complete =
    answers.every(Boolean) && essays.every((e) => e.score !== null);
  return {
    answers,
    quiz,
    essays,
    total: complete
      ? round(quiz + essays.reduce((s, e) => s + e.score, 0))
      : null,
    needsReview: !complete,
    at: new Date().toISOString(),
  };
};
