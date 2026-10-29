'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const hints = require('../public/ot/blank-hints');
const core = require('../public/ot/core');
const studentSource = fs.readFileSync(path.join(__dirname, '../public/ot/essay-student.js'), 'utf8');

test('Điền từ: gợi ý số từ không phải điều kiện chặn nộp bài', () => {
  assert.equal(hints.info('thông tin chính xác', 'thông tin rất chính xác').required, 3);
  assert.equal(hints.info('thông tin chính xác', 'thông tin rất chính xác').entered, 4);
  assert.doesNotMatch(studentSource, /OTBlankHints\.mismatch\s*\(/);
  assert.match(studentSource, /Số từ chỉ là gợi ý/);
});
test('Điền từ: các ô bắt buộc có nội dung trước khi kiểm tra', () => {
  assert.match(studentSource, /Em hãy điền đủ các ô trước khi kiểm tra/);
  assert.match(studentSource, /d\.answers\[i\]\?\.trim\(\)/);
});
test('Điền từ: đối chiếu theo nội dung, bỏ qua khác biệt hoa thường và dấu câu', () => {
  assert.deepEqual(core.checkBlanks(['[[Thông tin chính xác]]'], ['thông tin chính xác!']), [true]);
  assert.deepEqual(core.checkBlanks(['[[Thông tin chính xác]]'], ['thông tin sai']), [false]);
});
test('Điền từ: thứ tự ô trống và kết quả đúng sai bảo toàn', () => {
  const templates=['A [[máy tính]] và [[Internet]].', 'B [[thông tin]].'];
  assert.deepEqual(templates.flatMap(core.blanks), ['máy tính', 'Internet', 'thông tin']);
  assert.deepEqual(core.checkBlanks(templates, ['máy tính', 'internet', 'thông tin']), [true,true,true]);
});
test('Điền từ: tiếp tục gửi API và hiển thị đáp án cho ô sai', () => {
  assert.match(studentSource, /await api\('\/packs\/'\+pack\.id\+'\/attempts',body\)/);
  assert.match(studentSource, /essay-correction/);
});
