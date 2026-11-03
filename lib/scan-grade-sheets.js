"use strict";
const crypto = require("node:crypto");
const { bad } = require("./scan-store");
const FOLDER_ID = "1VAs8HYRjY-nCqRFVkE8I0AmiUkLqEVej";
const HEADERS = ["Mã phách", "Điểm chấm tự động"];
const escape = (s) => String(s).replace(/'/g, "''");
module.exports = function ({ request }) {
  async function json(url, options) {
    return (await request(url, options)).json();
  }
  async function ensureWorkbook(grade, save) {
    const base = "https://www.googleapis.com/drive/v3/files";
    if (grade.spreadsheetId) {
      const f = await json(
        base +
          "/" +
          grade.spreadsheetId +
          "?fields=id,mimeType,parents,trashed",
      );
      if (
        f.trashed ||
        f.mimeType !== "application/vnd.google-apps.spreadsheet" ||
        !f.parents?.includes(FOLDER_ID)
      )
        throw bad(
          "Bảng tính đã bị chuyển khỏi thư mục đích hoặc không còn khả dụng.",
          409,
        );
      if (!grade.sheetUrl) {
        grade.sheetUrl =
          "https://docs.google.com/spreadsheets/d/" +
          grade.spreadsheetId +
          "/edit";
        save(grade);
      }
      return grade.spreadsheetId;
    }
    const folder = await json(
      base + "/" + FOLDER_ID + "?fields=id,mimeType,capabilities",
    );
    if (
      folder.mimeType !== "application/vnd.google-apps.folder" ||
      folder.capabilities?.canAddChildren === false
    )
      throw bad(
        "Tài khoản Google của máy chủ chưa có quyền tạo bảng tính trong thư mục TEST CHẤM THI.",
        403,
      );
    const q =
      "'" +
      FOLDER_ID +
      "' in parents and trashed=false and appProperties has { key='fptbn_scan_grade' and value='" +
      grade.id +
      "' }";
    const found = await json(
      base +
        "?q=" +
        encodeURIComponent(q) +
        "&fields=files(id,mimeType)&pageSize=100",
    );
    if (found.files?.length > 1)
      throw bad(
        "Có nhiều bảng tính cho cùng khối. Kiểm tra tệp trùng trước khi tiếp tục.",
        409,
      );
    if (found.files?.length) {
      grade.spreadsheetId = found.files[0].id;
      grade.sheetUrl =
        "https://docs.google.com/spreadsheets/d/" +
        grade.spreadsheetId +
        "/edit";
      grade.creationPending = false;
      save(grade);
      return grade.spreadsheetId;
    }
    if (grade.creationPending)
      throw bad(
        "Lần tạo bảng tính trước chưa được xác nhận. Kiểm tra thư mục Drive trước khi tạo lại để tránh tệp trùng.",
        409,
      );
    grade.creationPending = true;
    save(grade);
    let created;
    try {
      created = await json(base + "?fields=id,webViewLink,parents", {
        method: "POST",
        body: JSON.stringify({
          name: grade.name,
          mimeType: "application/vnd.google-apps.spreadsheet",
          parents: [FOLDER_ID],
          appProperties: { fptbn_scan_grade: grade.id },
        }),
      });
    } catch (error) {
      if (
        error.upstreamStatus >= 400 &&
        error.upstreamStatus < 500 &&
        ![408, 429].includes(error.upstreamStatus)
      ) {
        grade.creationPending = false;
        save(grade);
      }
      throw error;
    }
    grade.spreadsheetId = created.id;
    grade.sheetUrl =
      created.webViewLink ||
      "https://docs.google.com/spreadsheets/d/" + created.id + "/edit";
    grade.creationPending = false;
    save(grade);
    return created.id;
  }
  async function syncRoom(grade, exam, papers, save) {
    const id = await ensureWorkbook(grade, save),
      base = "https://sheets.googleapis.com/v4/spreadsheets/" + id;
    const meta = await json(base + "?fields=sheets.properties");
    grade.roomSheets ||= {};
    const assigned = grade.roomSheets[exam.id];
    const tabId =
      assigned?.sheetId ??
      parseInt(
        crypto.createHash("sha256").update(exam.id).digest("hex").slice(0, 7),
        16,
      );
    let tab = meta.sheets?.find((s) => s.properties.sheetId === tabId);
    if (tab && !assigned && tab.properties.title !== exam.roomCode)
      throw bad("Mã tab bị trùng. Kiểm tra bảng tính trước khi ghi.", 409);
    if (!tab) {
      const title = String(exam.roomCode || exam.title).trim();
      if (!title || title.length > 100 || /[\[\]:*?/\\]/.test(title))
        throw bad("Tên phòng có ký tự không hợp lệ cho tab Sheets.");
      if (
        meta.sheets?.some(
          (s) => s.properties.title.toLowerCase() === title.toLowerCase(),
        )
      )
        throw bad(
          "Tab cùng tên phòng đã tồn tại nhưng chưa được liên kết. Kiểm tra trước khi ghi để giữ dữ liệu cũ.",
          409,
        );
      const created = await json(base + ":batchUpdate", {
        method: "POST",
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  sheetId: tabId,
                  title,
                  gridProperties: { rowCount: 2000, columnCount: 2 },
                },
              },
            },
          ],
        }),
      });
      tab = created.replies[0].addSheet;
      grade.roomSheets[exam.id] = { sheetId: tabId };
      save(grade);
    }
    const title = tab.properties.title,
      range = "'" + escape(title) + "'!";
    const existing = await json(
      base + "/values/" + encodeURIComponent(range + "A1:B10000"),
    );
    const rows = existing.values || [];
    if (rows.length && JSON.stringify(rows[0]) !== JSON.stringify(HEADERS))
      throw bad("Tab phòng có tiêu đề khác. Không ghi đè dữ liệu.", 409);
    const locations = new Map();
    rows.slice(1).forEach((row, i) => {
      const code = String(row[0] || "");
      if (!code) return;
      if (locations.has(code))
        throw bad("Mã phách trong tab phòng bị trùng.", 409);
      locations.set(code, i + 2);
    });
    let end = Math.max(rows.length, 1),
      scored = 0;
    const data = [{ range: range + "A1:B1", values: [HEADERS] }];
    for (const p of papers) {
      const code = p.review?.code || p.code;
      const score =
        p.status === "approved" && p.review?.verified
          ? p.review.total
          : p.review
            ? null
            : (p.automatic?.total ?? null);
      const n = locations.get(code) || ++end;
      locations.set(code, n);
      if (score !== null) scored++;
      data.push({
        range: range + "A" + n + ":B" + n,
        values: [[String(code), score ?? ""]],
      });
    }
    const capacity = tab.properties.gridProperties?.rowCount || 1000;
    if (end > capacity)
      await json(base + ":batchUpdate", {
        method: "POST",
        body: JSON.stringify({
          requests: [
            {
              appendDimension: {
                sheetId: tabId,
                dimension: "ROWS",
                length: end - capacity,
              },
            },
          ],
        }),
      });
    for (let i = 0; i < data.length; i += 200)
      await json(base + "/values:batchUpdate", {
        method: "POST",
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: data.slice(i, i + 200),
        }),
      });
    return {
      count: papers.length,
      scored,
      pending: papers.length - scored,
      url:
        grade.sheetUrl ||
        "https://docs.google.com/spreadsheets/d/" + id + "/edit",
      sheetId: tabId,
    };
  }
  return { ensureWorkbook, syncRoom, folderId: FOLDER_ID };
};
module.exports.FOLDER_ID = FOLDER_ID;
