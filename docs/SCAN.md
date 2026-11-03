# Chấm bài giấy tại /scan

Trang dùng tài khoản giáo viên hiện có, độc lập với luồng giám sát lớp học. Không thu tiền API. Đây là phiên bản chấm có GV duyệt; nhận diện chữ viết chưa được kiểm chứng trên bài thi thực tế và không tự chấm ý tự luận.

## Cập nhật Node trên VPS

Chạy từ thư mục đang chứa server.js của fptbn, bằng tài khoản đang chạy ứng dụng:

```bash
git pull --ff-only origin feature/outline-essay-grading
npm ci --ignore-scripts
npm test
```

Sau đó khởi động lại Node bằng trình quản lý ứng dụng vPanel đang sử dụng. Nếu dùng PM2, dùng `pm2 list` để xác định đúng tên ứng dụng rồi `pm2 restart TEN_UNG_DUNG --update-env`. Không chạy thêm bản server mới trên cùng cổng.

Đảm bảo LiteSpeed chuyển cả `/scan`, `/scan/*` và `/api/scan/*` tới Node; giới hạn upload tối thiểu 25 MB (multipart). Các tuyến POST của ứng dụng phải qua proxy Node giống tuyến đăng nhập giáo viên; nếu POST bị LiteSpeed chặn thì không chỉ sửa mã frontend.

## Dữ liệu và dung lượng

Mặc định lưu `data/scan/<teacherId>/<examId>/`, ngoài public, hoặc đặt `SCAN_DATA_DIR` tới thư mục tuyệt đối có quyền ghi. Metadata JSON ghi bằng rename nguyên tử, hai ảnh gốc được giữ riêng. Sao lưu cả thư mục này, không chỉ MySQL. Một tiến trình Node quản lý hàng đợi và ghi Sheet; dùng PM2 `instances: 1` (không cluster). Với 1.000 bài × 2 ảnh cần đo kích thước ảnh thực tế để dự trù ổ đĩa; ảnh trên trình duyệt được giảm cạnh dài tối đa 2.400 px. Đặt thư mục scan trên ổ riêng khi cần. Không tự xóa ảnh hoặc bài đã chấm.

## Thiết lập VietOCR miễn phí (tùy chọn)

Khuyên dùng Python 3.10 hoặc 3.11 trong virtualenv riêng. PyTorch/VietOCR có thể không tương thích Python/macOS quá cũ. Máy VPS phải đủ RAM để nạp mô hình; tốc độ phải đo trên bài thật. Cài PyTorch theo https://pytorch.org/get-started/locally/ cho CPU hoặc GPU đang dùng trước khi cài requirements.

```bash
cd services/scan-ocr
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Đặt cùng `SCAN_OCR_TOKEN` ngẫu nhiên dài ít nhất 24 ký tự trong môi trường dịch vụ Python và Node. Không đưa secret vào Git, mã trình duyệt hay log. Node cần:

```text
SCAN_OCR_URL=http://127.0.0.1:8010
SCAN_OCR_TOKEN=<cung-secret-voi-python>
```

Python cần:

```text
SCAN_OCR_TOKEN=<cung-secret-voi-node>
SCAN_OCR_DEVICE=cpu
SCAN_OCR_MODEL=vgg_seq2seq
```

Chạy worker riêng bằng supervisor/systemd/PM2:

```bash
uvicorn app:app --host 127.0.0.1 --port 8010 --workers 1
```

Lần đầu VietOCR tải weights nên cần Internet; có thể dùng `SCAN_OCR_WEIGHTS` để trỏ tới weights tương thích đã tải. Không mở cổng 8010 ra Internet. Nếu chạy máy khác, dùng mạng riêng/VPN hoặc HTTPS có xác thực; không public worker HTTP. Trang hiển thị sức khỏe worker sau đăng nhập, không giả lập kết quả khi chưa cài mô hình.

Engine ban đầu là VietOCR cho cả chữ rời và dòng chữ. CNN/EMNIST A–D chưa tích hợp vì chưa kiểm thử ảnh thực tế. Có thể thay worker sau khi so sánh trên bộ ảnh đã gán nhãn. `modelScore` chỉ là chỉ số nội bộ của mô hình, không phải xác suất đọc đúng đã hiệu chuẩn. Toàn bộ OCR cần người duyệt.

## Google Docs và Google Sheets

- Docs chia sẻ đọc bằng liên kết: nhập URL, bấm Đọc tài liệu, không cần API key.
- Docs riêng tư và ghi Sheets: tạo Google Cloud service account, bật Drive API và Sheets API, đặt JSON credentials ngoài public và ngoài Git. Node dùng `SCAN_GOOGLE_CREDENTIALS_FILE=/duong/dan/bao/mat/service-account.json`. Chia sẻ Docs quyền đọc, Sheet quyền sửa cho email `client_email` của service account. Không đưa JSON lên giao diện.
- Việc cấp quyền Google cho ChatGPT không tự cấp quyền cho VPS. Nếu Workspace chặn chia sẻ service account, cần quản trị viên cho phép hoặc dán đáp án và xuất CSV.
- Lấy đáp án chỉ là trích xuất có quy tắc; không suy đoán đề không đọc được. Docs có định dạng khác: dán hoặc nhập trực tiếp 20 đáp án và 2 thang điểm. Hỗ trợ tốt nhất:

```text
1. A
2. B
...
20. D
TL1
0,5 | Ý thứ nhất
1 | Ý thứ hai
TL2
0,5 | Ý thứ nhất
```

Thang điểm tổng phải bằng 10; ví dụ mặc định 20 × 0,25 + mỗi TL 2,5. Kiểm tra lại đáp án trước khi tạo đợt. Mỗi mã đề tạo đợt riêng.

Sheet dùng tab riêng `FPTBN_SCAN`, không ghi các tab hiện có. Khóa dòng là **mã đợt + mã phách**. Dùng RAW để giữ số 0 đầu và tránh công thức. Sau khi mở lại bài đã chốt, bấm đồng bộ để xóa điểm cũ trên dòng đó và đánh dấu Chờ duyệt lại; sau khi chốt lại cần đồng bộ lần nữa. Mã phách đã từng chốt được khóa để giữ đúng liên kết Sheet; không tự ghi lên Sheet sau mỗi thay đổi. Nếu lỗi giữa đợt đồng bộ, bấm đồng bộ lại để cập nhật đúng các dòng, tránh thêm trùng. Không chỉnh/sắp xếp tab trong khi đồng bộ.

## Luồng sử dụng

1. Truy cập `/scan`, đăng nhập giáo viên.
2. Tạo đợt: lấy đáp án từ Docs hoặc nhập tay; nhập rubric điểm | nội dung cho 2 câu.
3. Muốn OCR: trước khi có bài, tải ảnh mẫu mỗi mặt, chọn từng trường (mã phách, TN1–20, TL1–2), kéo khung; cần đủ 23 vùng. Mẫu lưu tọa độ tương đối. Chụp cùng chiều, cùng tỉ lệ và vị trí; hiện chưa tự phát hiện trang, căn phối cảnh hoặc dò bố cục tự do. Mỗi TL chỉ một vùng trên một mặt; câu kéo dài qua hai mặt cần đọc tay.
4. Chụp/chọn hai mặt, nhập mã phách. Camera dừng sau mỗi lần chụp. Lưu và xem hoặc lưu bài tiếp. Ảnh HEIC cần chuyển JPG/PNG.
5. Với ảnh có sẵn, chọn nhiều ảnh tên `00125_1.jpg`, `00125_2.jpg`; kiểm tra đủ cặp rồi tải tuần tự. Giữ trang mở đến hết. Nếu tải gián đoạn, chọn lại: mã đã lưu bị chặn trùng, những bài còn lại tiếp tục.
6. OCR chạy tuần tự và lưu tiến độ; Node khởi động lại sẽ tiếp tục việc chưa xong. Mã phách nhập khi chụp là khóa ban đầu; OCR mã phách chỉ để đối chiếu, không tự thay khóa.
7. Mở bài: xem cả hai mặt, sửa 20 đáp án; chỗ bỏ trống hoặc nhiều đáp án được ghi tường minh. Kiểm tra văn bản OCR, cho điểm từng ý tự luận. Điểm máy thuần không tồn tại cho tự luận: đây là **điểm GV duyệt có OCR hỗ trợ**. OCR thô được lưu riêng, không dùng điểm chấm tay để sinh đáp án.
8. Nhập điểm chấm tay nếu cần, xem chênh lệch, xác nhận và chốt. Bài chưa đủ đáp án/điểm hoặc chưa xác nhận không được chốt. Điểm chấm tay được lưu riêng.
9. Xuất CSV hoặc ghi Google Sheets. Chỉ điểm đã chốt được xuất.

## Kiểm thử trước khi chấm thật

Thử tối thiểu 50 bài đa dạng chữ viết, đối chiếu từng đáp án và mã phách với ảnh. Đo riêng lỗi OCR, sai số điểm, thời gian/bài và số bài cần sửa. Không cam kết tốc độ hay chính xác cho 1.000 bài khi chưa có kết quả đo. Bộ test mã nguồn không thay cho kiểm chứng mô hình chữ viết tay.

## Bổ sung: chụp bằng điện thoại trước, chấm và tích lũy dữ liệu sau

- Nút **Chụp trước, nhập đáp án sau** tạo đợt chỉ lưu ảnh, không tạo đáp án giả và không chạy OCR. Điện thoại chụp hai mặt rồi bấm **Lưu & chụp HS tiếp theo**. Chỉ coi ảnh đã lưu khi máy chủ xác nhận thành công. Cần mạng khi lưu; chưa hỗ trợ chụp ngoại tuyến.
- Sau đó đăng nhập cùng tài khoản giáo viên trên máy tính để mở lại đợt. Vào **Đáp án & vùng đọc** để nhập đáp án/rubric. Khi đã chuyển sang đợt chấm, đáp án bị khóa để không đổi điểm của bài cũ. Bấm **Bắt đầu nhận diện các bài đã lưu** để xếp hàng các bài mới; không tự nhận diện ngay khi chụp.
- Mã phách liên kết hai mặt và bảng điểm. **Mã nhóm chữ viết** tùy chọn (ví dụ W001) dùng để nhóm cùng người viết qua các đợt; không suy đoán danh tính từ mã phách. Mã nhóm được biến đổi bằng HMAC với khóa riêng từng GV; chỉ mã nhóm biến đổi được lưu. Nếu không có mã nhóm, mỗi bài là một nhóm riêng. Tải ảnh hàng loạt không tự gán chung người viết.
- Sau khi sửa/chốt bài, bấm **Lưu mẫu chữ viết**: kéo khung gọn quanh một ký tự TN hoặc đúng một dòng TL, nhập bản chép đúng và xác nhận. Không dùng đáp án đề làm nhãn chữ viết: nhãn TN phải đúng câu HS thực sự viết, kể cả khi HS chọn sai. Dòng TL phải có trong bản chép đã sửa/chốt. Không lấy vùng mã phách hoặc vùng thông tin cá nhân.
- Lưu vùng cắt JPG cùng nhãn tại thư mục `training` riêng của bài; ảnh gốc vẫn được giữ. Lưu mẫu là lựa chọn riêng từng mẫu, không đưa mọi bài đã chụp vào tập huấn luyện.
- Nút **Tải dữ liệu chữ viết** xuất ZIP gồm ảnh cắt, `manifest.jsonl`, `train.txt`, `validation.txt`, `test.txt` theo định dạng `image_path<TAB>transcript`. Tên ảnh là UUID, manifest không chứa mã phách, tên HS hay mã bài. Tối đa 20.000 mẫu trong một lần xuất. Chỉ mẫu của bài đã chốt và bản chép không thay đổi mới được xuất; có thể bỏ chọn/chọn lại mẫu. Nếu sửa bản chép, chọn lại vùng và tạo mẫu mới sau khi chốt. Ảnh trùng được gộp; nhãn mâu thuẫn phải kiểm tra trước khi xuất.
- Đây là **chuẩn bị dữ liệu**, chưa có tác vụ tự huấn luyện. Mô hình nền phải đọc được nhiều nét chữ; không cần huấn luyện riêng cho từng HS ngay từ đầu. Ưu tiên thêm các kiểu chữ và lỗi OCR đa dạng đã được GV sửa.
- Trước khi fine-tune: kiểm tra ảnh cắt/nhãn; gom cùng người viết vào cùng nhóm; tách nhóm thành train/validation/test; so CER/WER, tỷ lệ đọc đúng A–D và mã phách trên tập kiểm thử không dùng để học. Nếu không có mã nhóm nhất quán, cần rà soát nhóm người viết thủ công để tránh rò rỉ giữa các tập. Tập nhỏ có thể có split rỗng; không dùng để kết luận chất lượng.
- Chỉ triển khai weights mới khi kiểm thử đạt và giữ weights cũ để quay lại. Không có cam kết cứ lưu thêm ảnh là nhận diện tốt lên. Dữ liệu được lưu riêng trên VPS, không tự gửi tới nhà cung cấp mô hình.

## Nếu Chụp trước vẫn báo "Cần đủ 20 đáp án A–D"

Đây là dấu hiệu giao diện mới nhưng Node đang chạy mã cũ, hoặc chưa cập nhật đủ tệp. Tải JS/CSS mới không tự làm Node nạp lại các module đã require. Sau khi git merge và npm ci thành công, phải restart đúng tiến trình phục vụ tên miền. Với cấu hình dịch vụ đang có trong workflow của repository, tên dịch vụ là `vpanel-node@1-2.service`; dùng tài khoản có quyền restart dịch vụ hoặc thao tác đúng ứng dụng trong vPanel. Không chạy thêm một Node mới trên cổng đang dùng.

Bản `scan-20261103-3` bổ sung GET `/api/scan/version` không yêu cầu đăng nhập, chỉ trả revision và photoFirst, không trả dữ liệu bài chấm. Sau restart, kiểm tra:

```bash
curl -fsS https://fptbnmonitor.online/api/scan/version
```

Cần thấy `revision: scan-20261103-3` và `photoFirst: true`. Nếu 401/404 hoặc HTML thì tiến trình/proxy đang chạy bản cũ hoặc sai ứng dụng; không cố nhập 20 đáp án để vượt lỗi. Nếu revision đúng nhưng iPhone còn giao diện cũ, đóng tab /scan và mở lại. Tệp JS/CSS có version và API dùng no-store để tránh lẫn bản.

Nút chụp dùng endpoint riêng `/api/scan/capture-exams`. Giao diện kiểm tra capability trước khi tạo đợt, hiển thị cảnh báo cố định nếu máy chủ chưa xác nhận hỗ trợ. OCR chưa sẵn sàng là tình trạng độc lập: không cản tạo đợt/chụp/lưu ảnh, nhưng chưa thể nhận diện chữ tự động.
