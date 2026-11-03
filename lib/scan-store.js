"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const bad = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const uuid = (s) => {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      s,
    )
  )
    throw bad("Mã bản ghi không hợp lệ.");
  return s;
};
function createStore(root) {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const owner = (id) => {
    if (!/^[0-9]+$/.test(String(id))) throw bad("Tài khoản không hợp lệ.", 403);
    return path.join(root, String(id));
  };
  const dir = (teacher, id) => path.join(owner(teacher), uuid(id));
  function write(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = file + "." + crypto.randomUUID() + ".tmp";
    try {
      fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
      fs.renameSync(tmp, file);
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }
  function read(file) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") throw bad("Không tìm thấy bản ghi.", 404);
      throw e;
    }
  }
  const exam = (t, id) => read(path.join(dir(t, id), "exam.json"));
  const paper = (t, id, pid) =>
    read(path.join(dir(t, id), "papers", uuid(pid), "paper.json"));
  function papers(t, id) {
    exam(t, id);
    const base = path.join(dir(t, id), "papers");
    if (!fs.existsSync(base)) return [];
    return fs
      .readdirSync(base)
      .filter((x) => /^[0-9a-f-]{36}$/.test(x))
      .map((x) => paper(t, id, x))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  function savePaper(t, id, p) {
    write(path.join(dir(t, id), "papers", uuid(p.id), "paper.json"), p);
  }
  function saveExam(t, e) {
    write(path.join(dir(t, e.id), "exam.json"), e);
  }
  function exams(t) {
    const p = owner(t);
    if (!fs.existsSync(p)) return [];
    return fs
      .readdirSync(p)
      .filter((x) => /^[0-9a-f-]{36}$/.test(x))
      .map((x) => exam(t, x))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  function image(t, id, pid, n) {
    uuid(pid);
    if (![0, 1].includes(n)) throw bad("Mặt ảnh không hợp lệ.");
    return path.join(dir(t, id), "papers", pid, "page" + n);
  }
  return {
    exam,
    paper,
    papers,
    savePaper,
    saveExam,
    exams,
    image,
    root,
    uuid,
    owners: () => fs.readdirSync(root).filter((x) => /^\d+$/.test(x)),
  };
}
module.exports = { createStore, bad };
