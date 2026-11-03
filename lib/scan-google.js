"use strict";
const { googleId, columns, sheetRow } = require("./scan-core");
const bad = (message, status = 400) =>
  Object.assign(new Error(message), { status });
function createGoogle(
  env = process.env,
  fetcher = fetch,
  tokenProvider = null,
) {
  let auth;
  function configured() {
    return !!env.SCAN_GOOGLE_CREDENTIALS_FILE;
  }
  async function token() {
    if (tokenProvider) return tokenProvider();
    if (!configured())
      throw bad(
        "Máy chủ chưa cấu hình tài khoản Google. Có thể dùng Docs được chia sẻ đọc bằng liên kết hoặc dán nội dung đáp án.",
        503,
      );
    if (!auth) {
      const { GoogleAuth } = require("google-auth-library");
      auth = new GoogleAuth({
        keyFile: env.SCAN_GOOGLE_CREDENTIALS_FILE,
        scopes: [
          "https://www.googleapis.com/auth/drive.readonly",
          "https://www.googleapis.com/auth/spreadsheets",
        ],
      });
    }
    const client = await auth.getClient();
    return (await client.getAccessToken()).token;
  }
  async function request(url, options = {}) {
    const bearer = await token();
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetcher(url, {
        ...options,
        redirect: "error",
        signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: "Bearer " + bearer,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });
      // Only retry safe reads and idempotent value overwrites, never append/addSheet.
      if (
        ![429, 500, 502, 503].includes(response.status) ||
        !["GET", "PUT"].includes(options.method || "GET") ||
        attempt === 2
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
    if (!response.ok)
      throw bad(
        "Google từ chối thao tác (" +
          response.status +
          "). Kiểm tra quyền chia sẻ tài liệu và API đã bật.",
        502,
      );
    return response;
  }
  async function importDoc(url) {
    const id = googleId(url, "doc");
    let response;
    if (configured())
      response = await request(
        "https://www.googleapis.com/drive/v3/files/" +
          id +
          "/export?mimeType=text%2Fplain",
      );
    else {
      // No user-controlled network destination; do not follow sign-in redirects.
      let endpoint =
        "https://docs.google.com/document/d/" + id + "/export?format=txt";
      for (let i = 0; i < 4; i++) {
        response = await fetcher(endpoint, {
          redirect: "manual",
          signal: AbortSignal.timeout(20000),
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const next = new URL(response.headers.get("location"), endpoint);
        if (
          next.protocol !== "https:" ||
          next.port ||
          next.username ||
          next.password ||
          !(
            next.hostname === "docs.google.com" ||
            next.hostname.endsWith(".googleusercontent.com")
          )
        )
          throw bad(
            "Docs đang yêu cầu đăng nhập. Chia sẻ quyền đọc cho tài khoản máy chủ hoặc dán nội dung đáp án.",
          );
        endpoint = next.href;
      }
    }
    if (
      !response.ok ||
      /text\/html/i.test(response.headers.get("content-type") || "")
    )
      throw bad(
        "Không đọc được Google Docs. Kiểm tra quyền đọc hoặc dán nội dung đáp án.",
      );
    let size = 0,
      chunks = [];
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 1024 * 1024) {
        await response.body.cancel().catch(() => {});
        throw bad("Đáp án quá lớn; tối đa 1 MB văn bản.");
      }
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  async function sync(exam, papers) {
    const id = googleId(exam.sheetUrl, "sheet"),
      base = "https://sheets.googleapis.com/v4/spreadsheets/" + id;
    const metadata = await (
      await request(base + "?fields=sheets.properties")
    ).json();
    let tab = metadata.sheets?.find((s) => s.properties.title === "FPTBN_SCAN");
    if (!tab) {
      const created = await (
        await request(base + ":batchUpdate", {
          method: "POST",
          body: JSON.stringify({
            requests: [
              {
                addSheet: {
                  properties: {
                    title: "FPTBN_SCAN",
                    gridProperties: { rowCount: 2000, columnCount: 11 },
                  },
                },
              },
            ],
          }),
        })
      ).json();
      tab = created.replies[0].addSheet;
    }
    const existing = await (
      await request(base + "/values/FPTBN_SCAN!A1:K100000")
    ).json();
    const rows = existing.values || [];
    const legacyHeaders = columns.slice(0, 10);
    const legacy =
      rows.length && JSON.stringify(rows[0]) === JSON.stringify(legacyHeaders);
    if (
      rows.length &&
      !legacy &&
      JSON.stringify(rows[0]) !== JSON.stringify(columns)
    )
      throw bad(
        "Tab FPTBN_SCAN có tiêu đề khác. Đổi tên tab cũ trước khi đồng bộ.",
        409,
      );
    const locations = new Map();
    rows.slice(1).forEach((row, i) => {
      const k = String(row[0]) + "\0" + String(row[1]);
      if (locations.has(k))
        throw bad(
          "Sheet có mã phách trùng trong cùng đợt; cần xử lý trước khi ghi.",
          409,
        );
      locations.set(k, i + 2);
    });
    let end = Math.max(rows.length, 1);
    const data = [{ range: "FPTBN_SCAN!A1:K1", values: [columns] }];
    for (const p of papers) {
      const k = exam.id + "\0" + (p.review?.code || p.code);
      // Reopened rows must not keep an old finalized grade on the next sync.
      if (p.status !== "approved" && !locations.has(k)) continue;
      const row =
        p.status === "approved"
          ? sheetRow(exam, p)
          : [
              exam.id,
              p.review?.code || p.code,
              "",
              "",
              "",
              "",
              "",
              "",
              "Chờ duyệt lại",
              exam.title,
              exam.roomCode || exam.title,
            ];
      const n = locations.get(k) || ++end;
      locations.set(k, n);
      data.push({ range: "FPTBN_SCAN!A" + n + ":K" + n, values: [row] });
    }
    if ((tab.properties.gridProperties?.columnCount || 10) < 11)
      await request(base + ":batchUpdate", {
        method: "POST",
        body: JSON.stringify({
          requests: [
            {
              appendDimension: {
                sheetId: tab.properties.sheetId,
                dimension: "COLUMNS",
                length: 11 - (tab.properties.gridProperties?.columnCount || 10),
              },
            },
          ],
        }),
      });
    const capacity = tab.properties.gridProperties?.rowCount || 1000;
    if (end > capacity)
      await request(base + ":batchUpdate", {
        method: "POST",
        body: JSON.stringify({
          requests: [
            {
              appendDimension: {
                sheetId: tab.properties.sheetId,
                dimension: "ROWS",
                length: end - capacity,
              },
            },
          ],
        }),
      });
    // Fixed ranges and RAW preserve leading zero codes and prevent formula execution.
    for (let i = 0; i < data.length; i += 200)
      await request(base + "/values:batchUpdate", {
        method: "POST",
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: data.slice(i, i + 200),
        }),
      });
    return papers.filter((p) => p.status === "approved").length;
  }
  return { configured, importDoc, sync };
}
module.exports = { createGoogle };
