# Phân hệ ôn tập FPTBN Monitor

- HS: `/OT.html` — nhập mã HS hiện có; nhận lớp từ năm học hiện tại trên máy chủ. Không cần chia sẻ màn hình.
- GV: `/GV.html` — đăng nhập bằng email/mật khẩu GV hiện có. Mỗi GV chỉ quản lý bộ ôn và báo cáo do mình tạo; được giao cho một hoặc nhiều lớp hiện tại.
- API riêng: `/api/ot`. Không sửa giao diện hay luồng WebRTC cũ.

## Triển khai nhánh riêng

Trên VPS, trong thư mục ứng dụng:

```bash
cd /home/u_fptbnmonitoronline_fa061ae2/fptbnmonitor.online
git status --short
git fetch origin
git switch --track origin/feature/on-tap
```

Nếu đã có nhánh local, dùng `git switch feature/on-tap` rồi `git pull --ff-only`. Nếu `git status` báo thay đổi chưa lưu, giữ lại thay đổi trước khi chuyển nhánh; không dùng reset hoặc clean. Khởi động lại ứng dụng Node.js trong vPanel theo cách đang vận hành. Không cần cài thêm dependency npm.

Lần gọi API được xác thực đầu tiên sẽ tạo hai bảng MySQL `ot_packs`, `ot_attempts` bằng `CREATE TABLE IF NOT EXISTS`; tài khoản DB cần quyền CREATE. Bảng dùng UTF-8, lưu nội dung và kết quả, không giữ file Word gốc. Thêm hai bảng này vào lịch sao lưu DB của trường. Không tự xóa lịch sử khi kết thúc lớp giám sát. Không có dữ liệu HS mẫu được thêm vào DB.

## Nhập đề cương

Tải Word `.docx` hoặc văn bản `.txt`, tối đa 10 MB, với cấu trúc:

```
A. PHẦN TRẮC NGHIỆM
Câu 1: Nội dung câu hỏi?
A. Phương án 1.
B. Phương án 2.
C. Phương án 3.
D. Phương án 4.
B. PHẦN TỰ LUẬN
Câu 1: Câu hỏi tự luận?
Gợi ý trả lời:
• Ý thứ nhất.
• Ý thứ hai.
C. ĐÁP ÁN PHẦN TRẮC NGHIỆM
1
A
```

Bảng Word được đọc theo thứ tự ô trong tài liệu; mẫu bảng đáp án phải đi theo cặp số câu/đáp án như đề cương đã cung cấp. Tự luận chấp nhận dấu chấm đầu dòng hoặc từng ý trên dòng riêng. GV kiểm tra nội dung/đáp án được nhận diện trước khi lưu. Chưa hỗ trợ `.doc`, PDF, hình vẽ, ảnh quét, công thức hoặc lựa chọn chứa nhiều đoạn/bảng phức tạp. File được đọc trong trình duyệt, không tải bản Word lên server; server nhận JSON đã kiểm tra. Không yêu cầu phần giải thích trắc nghiệm.

## Tự luận

1. Thẻ hai mặt: tự nhẩm, lật xem đáp án, tự đánh giá chưa thuộc / nhớ một phần / nhớ đủ ý.
2. Điền khuyết: ba mức tự sinh nhiều ô trống; mức khó che nhiều cụm từ hơn. Mẫu riêng của GV đặt `[[cụm từ]]` ngay trong từng ý; giữ nguyên nội dung khi bỏ dấu ngoặc. Chỉ chấm ô khuyết theo cụm từ chuẩn, có dấu, bỏ qua hoa/thường, khoảng trắng thừa và một số dấu câu. Không hỗ trợ đáp án đồng nghĩa cho ô khuyết ở bản này.
3. Luyện viết: mỗi ý một ô viết. Hiện mức khớp các từ khóa do GV kiểm tra, giữ bài viết trên máy chủ. Đây là đối chiếu từ khóa, không chấm ngữ nghĩa, không đánh giá được câu phủ định hay mọi cách diễn đạt tương đương, không quy thành điểm tự luận.

Mỗi hoạt động hoàn thành có UUID riêng để gửi lặp cùng lượt không tăng lượt. Trắc nghiệm chỉ lưu khi đủ bộ, chấm bằng đáp án máy chủ. Tự luận tính lượt theo từng câu và chế độ; thống kê tách từng loại. Thẻ nhớ là tự đánh giá, không được hiểu là đã thuộc thật. Không tính việc chỉ mở trang là lượt ôn. Khi mất kết nối, HS giữ trang và thử lưu lại; chưa hỗ trợ tiếp tục bản nháp sau khi đóng/tải lại trang.

## Tái sử dụng

Đóng bộ cũ rồi dùng “Sao chép / chỉnh cho kỳ mới” để tạo bộ mới. Không sửa đè câu hỏi đã có kết quả; lịch sử tiếp tục đối chiếu với bộ gốc. Chọn các lớp của năm học hiện tại. HS chuyển lớp được kiểm tra lại trên từng API request.

## Vận hành và kiểm tra

```bash
node --test test/ot.test.js
```

Kiểm tra thực tế sau khi restart: GV tạo bộ ôn cho một lớp, đăng nhập HS thuộc lớp đó và HS lớp khác, làm đủ một lượt trắc nghiệm, một lượt điền khuyết và một bài viết; kiểm tra báo cáo trên máy GV. Thử điện thoại Safari/Chrome. Kiểm thử tự động sử dụng DB giả lập để kiểm tra quyền và logic; chưa thay thế kiểm thử trên MySQL thật.

Phiên HS/GV kéo dài tối đa 8 giờ và mất hiệu lực sau khi Node.js khởi động lại. Mã HS chỉ nhận diện hồ sơ, không xác minh người đang sử dụng; phù hợp ôn tập, không dùng như xác thực cho kỳ thi lấy điểm. Bộ ôn là nội dung luyện tập nên đáp án được gửi xuống sau khi API xác minh lớp. Route GV dùng token được xác thực ở máy chủ, không dựa vào việc giấu đường dẫn.
