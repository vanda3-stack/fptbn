# Demo chấm thử — scan-demo-20261103-1

`/scan` hiện mở bản demo gọn, không đăng nhập và không gọi API dữ liệu chấm chính thức. Bản quản lý cũ vẫn ở `/scan-full.html`; API và dữ liệu khối/phòng không thay đổi.

1. Dán Gemini API key, bấm **Kiểm tra kết nối**, chọn mô hình từ danh sách thực tế của key. Đọc danh sách thành công chưa khẳng định còn quota tạo nội dung. Không cung cấp key chung trong mã, không lưu key vào storage hoặc VPS.
2. Dán đáp án TN (1–100 câu) và điểm/câu. Google Docs mở để sao chép phần đáp án; demo chưa tự tải tài liệu cần quyền Google. Tùy chọn thêm rubric TL 1/2, mỗi dòng `Nội dung ý | 0,5`. Tổng thang điểm không vượt 10.
3. Nhập mã phách, chụp/tải 1 hoặc 2 mặt. Camera trực tiếp yêu cầu HTTPS và quyền camera; trên điện thoại có nút chụp/tải dùng camera hệ điều hành. Ảnh co cạnh dài tối đa 2400 px.
4. **Chấm thử bằng AI** gửi ảnh và rubric trực tiếp từ trình duyệt tới Google Gemini. Không gửi đáp án chuẩn TN cho AI; JavaScript đối chiếu TN độc lập. Nội dung ảnh không được xem là chỉ dẫn cho mô hình. Chưa rõ, thiếu/trùng câu hoặc điểm TL không hợp lệ giữ pending.
5. Kết quả dừng để GV so ảnh, sửa đáp án/điểm, xác nhận các mục chưa rõ. Chỉ lưu sau khi GV tích đã đối chiếu và không còn pending. Bấm **Quét bài tiếp theo** mới chuyển bài. Nút nhập thủ công ghi rõ chỉ thử tính điểm, không kiểm chứng OCR.
6. Điểm và ảnh chỉ trong bộ nhớ tab, đóng/tải lại sẽ mất. Tải CSV hai cột trước khi đóng; chưa ghi Google Sheets. CSV giữ mã dạng chuỗi trong nội dung; khi nhập Excel/Sheets chọn cột mã là Text để giữ số 0 đầu.

Không cần cài VietOCR cho demo. Cần key Gemini có quyền và quota phù hợp; lỗi key, quota, mô hình, timeout đều báo lỗi thật, không tạo điểm giả. Chưa kiểm chứng độ chính xác chữ viết tay khi chưa có bài mẫu và key của người dùng.

## Đưa demo lên VPS

Chỉ cập nhật các file tĩnh, không đổi server/dependencies. Chạy lần lượt và dừng nếu có lỗi:

```bash
cd /home/u_fptbnmonitoronline_fa061ae2/fptbnmonitor.online
git fetch origin feature/paper-scan
git merge --ff-only origin/feature/paper-scan
```

Sau đó tải lại `/scan`. Footer phải có `scan-demo-20261103-1`. API `/api/scan/version` vẫn có revision của bộ chấm chính thức vì API không thay đổi. Không cần restart Node cho riêng thay đổi file tĩnh này. Nếu merge báo diverged hoặc có thay đổi cục bộ, không reset hard; xử lý trạng thái Git trước.

## Kiểm chứng

- `node --check public/scan/demo.js` và `demo-core.js`.
- `node --test test/scan.test.js test/scan-demo.test.js`: 29/29 đạt.
- Toàn repo: 207/212 đạt; 5 lỗi cũng tái hiện trên commit gốc `4bbfeaf` trong các test luồng điền từ/báo cáo/chuyển giọng nói, ngoài phạm vi scan.
- Trình duyệt từ xa không truy cập được máy preview nội bộ (connection refused). Chưa kiểm tra UI/camera/API Gemini thực tế. Cần chấm bài thật trên thiết bị sau triển khai.

---

# Chấm bài giấy — scan-20261103-5

## Luồng chính

1. **Tạo khối chấm:** ví dụ Khối 6/7/8/9, chỉ tạo khối GV chọn.
2. **Tạo phòng:** mỗi phòng thuộc đúng một khối, tên phòng không trùng trong khối.
3. **Nhập link đáp án:** Google Docs chứa 20 câu TN và 2 câu TL. Bấm Đọc đáp án và lưu phòng. Có mục thu gọn để sửa đáp án hoặc dán văn bản khi không đọc được link.
4. **Quét bài:** mã phách + ảnh mặt 1 bắt buộc; bấm Thêm mặt 2 nếu cần. Lưu và quét tiếp. Có thể chụp trên điện thoại rồi đăng nhập cùng tài khoản trên máy tính để chấm.
5. **Chấm điểm:** bấm Chấm bài. VietOCR đọc ảnh, thuật toán đối chiếu TN; TL áp dụng rubric có sẵn hoặc khớp đầy đủ nội dung chuẩn. Câu chưa đủ căn cứ giữ trạng thái cần kiểm tra, không tự gán 0. GV có thể mở bài, sửa bản đọc/điểm theo từng ý và chốt.
6. **Lưu Google Sheets:** một file cho mỗi khối, mỗi phòng là một tab. Chỉ có hai cột:

| Mã phách | Điểm chấm tự động |
| --- | --- |

Bài chưa có điểm để trống ô điểm. Điểm đã được GV chốt ưu tiên hơn điểm đề xuất của bộ chấm. Khi mở lại bài, kết quả chưa được chốt lại sẽ không được ghi như điểm đã chốt. Cùng mã phách ở hai phòng khác nhau là hai bản ghi độc lập. Đồng bộ lại cập nhật dòng theo mã phách, không thêm trùng.

Thư mục đích cố định do người dùng chỉ định: https://drive.google.com/drive/folders/1VAs8HYRjY-nCqRFVkE8I0AmiUkLqEVej (TEST CHẤM THI). File của khối được tạo khi bấm Tạo bảng điểm khối hoặc Lưu Google Sheets lần đầu. Không tạo các khối/Sheet mẫu chưa được chọn. Không sửa/xóa các bảng cũ FPTBN_SCAN nhiều cột.

## Cập nhật VPS

```bash
cd /home/u_fptbnmonitoronline_fa061ae2/fptbnmonitor.online
git fetch origin feature/paper-scan
git merge --ff-only origin/feature/paper-scan
npm ci --omit=dev --no-audit --no-fund
node --check server.js
```

Chạy các lệnh theo thứ tự, dừng nếu lỗi; không reset hard. Restart đúng ứng dụng trong vPanel. Cấu hình service của repo là `vpanel-node@1-2.service`; tài khoản có quyền có thể dùng `sudo /usr/bin/systemctl restart vpanel-node@1-2.service`. Nếu worker Python đang chạy, cũng restart worker sau khi cập nhật mã worker.

Kiểm tra `curl -fsS https://fptbnmonitor.online/api/scan/version` phải có `scan-20261103-5`. Giao diện phát hiện thiếu capability grades/flexiblePages và báo cần cập nhật/restart thay vì gửi yêu cầu sai giao thức.

Đảm bảo LiteSpeed proxy `/scan`, `/scan/*`, `/api/scan/*` tới Node và cho phép upload tối thiểu 25 MB. POST phải đến Node, không bị LiteSpeed chặn. Giao diện có phiên bản asset để tránh lẫn mã cũ.

## Kết nối Google trên VPS — một lần

Quyền Google của ChatGPT không tự chuyển cho VPS. Để tạo/lưu bảng tính, cần credentials Google hợp lệ có quyền đọc đáp án, tạo file trong thư mục TEST CHẤM THI và sửa Sheets.

- Cấu hình `SCAN_GOOGLE_CREDENTIALS_FILE=/duong/dan/bao/mat/google-credentials.json`, ngoài public và ngoài Git. GoogleAuth hỗ trợ cấu hình service account hoặc authorized-user OAuth phù hợp.
- Bật Drive API và Sheets API. Scopes trong mã: Drive read-only (đọc tài liệu), Drive file (tạo/quản lý file ứng dụng tạo), Spreadsheets (ghi điểm). Với authorized-user OAuth, refresh token phải được cấp đúng scopes từ trước; thay biến môi trường không tự cấp thêm quyền.
- Chia sẻ quyền phù hợp cho tài khoản ứng dụng trong thư mục đích/Docs. Tài khoản cần quyền tạo file và đáp ứng yêu cầu lưu trữ của Google. Nếu Google từ chối tạo file, lỗi được báo; không giả tạo link thành công. Với thư mục My Drive, kiểm chứng quyền tạo bằng chính loại tài khoản cấu hình.
- File mới có appProperties gắn ID khối để tìm lại khi thử lại. Nếu một lần tạo bị gián đoạn và chưa xác nhận file có tồn tại, ứng dụng chặn tạo lại mù để tránh file trùng.
- Chưa kết nối Google vẫn tạo khối/phòng, lưu ảnh và điểm trên VPS được. Nút tạo/lưu Google báo cần cấu hình. Không đưa credentials vào trình duyệt hoặc gửi trong chat.

## VietOCR miễn phí trên máy chủ — một lần

Dùng môi trường Python riêng (khuyên 3.10/3.11), cài PyTorch phù hợp CPU/GPU rồi:

```bash
cd services/scan-ocr
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Cùng secret ngẫu nhiên dài ít nhất 24 ký tự trong Node và worker:

```text
SCAN_OCR_URL=http://127.0.0.1:8010
SCAN_OCR_TOKEN=<secret-rieng>
```

Worker thêm `SCAN_OCR_DEVICE=cpu`, `SCAN_OCR_MODEL=vgg_seq2seq`; tùy chọn `SCAN_OCR_WEIGHTS` trỏ weights tương thích đã tải.

```bash
uvicorn app:app --host 127.0.0.1 --port 8010 --workers 1
```

Lần đầu cần Internet để tải weights. Không mở cổng OCR ra Internet. Nếu worker ở máy khác, dùng mạng riêng/VPN hoặc HTTPS có xác thực.

Worker nhận **1 hoặc 2 ảnh**. Nếu chưa có template vùng đọc, dùng phân đoạn dòng để đọc toàn trang và dò số câu A–D/các mốc Câu 1, Câu 2 hoặc Câu 21, Câu 22. Vùng không đọc được hoặc mâu thuẫn không bị ép thành một đáp án. Chế độ template trước đây vẫn hoạt động; vùng thuộc mặt 2 nhưng bài chỉ có mặt 1 được đánh dấu thiếu, không tự suy ra.

Đây là nhận diện đề xuất, chưa được kiểm chứng trên chữ viết tay thật của trường. Không có cam kết 1.000 bài nhanh/chính xác khi chưa đo trên phần cứng và bộ ảnh thật. Kiểm thử parser/HTTP bằng dữ liệu giả không thay thế kiểm thử mô hình. Tự luận không dùng phép đếm từ khóa chung để giả lập hiểu nội dung; câu chưa có quy tắc phù hợp cần GV kiểm tra. Phần nhập đáp án hỗ trợ bảng Docs của tài liệu Tin 8 Đề 2 đã cung cấp.

## Dữ liệu và tương thích

- Metadata khối: `data/scan/<teacherId>/grades.json`; phòng/bài giữ cấu trúc cũ theo UUID. Ảnh nằm ngoài public, API yêu cầu đăng nhập và kiểm tra chủ sở hữu.
- Sao lưu cả `data/scan`, không chỉ MySQL. Có thể đổi bằng `SCAN_DATA_DIR`. Dùng một tiến trình Node, không cluster, để khóa hàng đợi/tạo file/đồng bộ có hiệu lực.
- Tối đa 2.000 bài/phòng, 12 MB/ảnh trên API. Trình duyệt giảm cạnh dài tối đa 2.400 px. Cần mạng để lưu; chưa có chụp ngoại tuyến. HEIC cần chuyển JPG/PNG.
- Bài cũ không có khối được giữ trong mục Bài đã lưu trước đây; không xóa hoặc viết đè bảng điểm cũ.
- Dữ liệu ảnh cắt/nhãn huấn luyện và API xuất dữ liệu đã có vẫn được giữ, không đưa lên giao diện chính. Không tự huấn luyện hoặc đổi weights.

## Kiểm thử

```bash
node --test test/scan.test.js
python services/scan-ocr/test_protocol.py
```

Test Python kiểm tra bộ tách văn bản một/hai mặt bằng model giả, không tải weights. Trước dùng thật, lấy mẫu chữ đa dạng để đo lỗi mã phách, từng đáp án, phân đoạn TL, điểm và thời gian xử lý. Chấm thử/duyệt trước khi xuất điểm chính thức.
