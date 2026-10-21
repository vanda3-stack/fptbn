# Bảo vệ mã nguồn trình duyệt

`server.js` tự chuẩn bị thư mục `.protected-public` trước khi mở máy chủ.
Các tuyến `/ontap`, `/giaovien`, `/clb` và các tệp tĩnh đều lấy từ bản này.
JavaScript của dự án, kể cả mã nhúng trong HTML, được làm rối. Tệp JS thư
viện đã minify giữ nguyên giấy phép. Bản đồ mã nguồn `.map` và tệp ẩn không
được đưa vào bản phục vụ. HTML, CSS, hình ảnh và URL vẫn giữ bố cục hiện tại.

Mã gốc trong `public/` được giữ để sửa lỗi và bảo trì. Backend, SQL và thông
tin `.env` nằm ngoài thư mục công khai; không cần làm rối backend để ngăn
người dùng trình duyệt tải chúng xuống. Làm rối không phải mã hóa không thể
giải ngược, không bảo vệ đáp án/khóa API nếu đưa chúng tới trình duyệt và
không thay thế xác thực hoặc phân quyền API. Kho GitHub công khai vẫn cho
phép xem mã gốc; tính năng này không thay đổi quyền riêng tư của repository.

## Cập nhật VPS

Chạy trong thư mục dự án hiện tại:

```bash
git pull --ff-only
npm ci --omit=dev
npm run build:protected
```

Sau đó dùng thao tác Restart Node.js đang áp dụng trên vPanel. Có thể tiếp
tục dùng startup file `server.js`; không bắt buộc đổi sang `npm start`.
Build trước giúp kiểm tra lỗi trước khi khởi động lại dịch vụ. Lần khởi động
sau dùng lại bản đã build nếu mã nguồn và nội dung đầu ra không thay đổi.
Thư mục đầu ra cần quyền ghi của tài khoản chạy Node.js. Không chạy build
đồng thời với nhiều tiến trình khởi động; trên cấu hình nhiều worker hãy
build một lần trước khi khởi động tất cả worker.

Nếu build bằng root và Node.js chạy dưới tài khoản website, bản đầu ra dùng
quyền thư mục `755` và tệp `644` để tài khoản dịch vụ đọc được. Không cần
cấp quyền `777` hoặc thay quyền cho `.env`. Với bản đầu ra cũ có quyền
`700`, chạy lại `npm run build:protected` sau khi lấy bản sửa mới rồi restart.

Nếu LiteSpeed/vPanel đang phục vụ trực tiếp các tệp từ `public/`, cần chuyển
document root tĩnh sang `.protected-public` hoặc chuyển toàn bộ yêu cầu
website qua Node.js. Nếu không, các yêu cầu bỏ qua Node.js vẫn đọc mã gốc.
Chỉ công khai bản đầu ra, không công khai thư mục gốc chứa `.env`, `config`,
`lib` và `server.js`.

## Kiểm tra

```bash
npm test
npm run build:protected
```

Kiểm tra DevTools → Network: `/ot/student.js`, `/ot/teacher.js` và
`/js/teacher.js` phải là mã đã làm rối; `*.js.map` không tồn tại. Kiểm thử
đăng nhập HS/GV, tạo/giao/làm bài, chia sẻ màn hình và kết thúc lớp trên VPS.
Build không dùng chống debugger, tự bảo vệ hay làm phẳng luồng điều khiển
để hạn chế ảnh hưởng hiệu năng trong buổi học.

Kết quả kiểm tra khi triển khai: 3 kiểm tra bảo vệ mới và 16 kiểm tra hành
vi trên tệp đã làm rối đạt; HTTP thực tế của máy chủ Node.js trả 200 cho
các trang chính và 404 cho `.map`, `.env`, `server.js`. Bộ kiểm tra cũ còn
một lỗi có sẵn ở `ot-essay.test.js` vì mong đợi dòng “Mức độ ghi nhớ từng
câu” đã bị bỏ khỏi giao diện. Lỗi này tái hiện trên bản trước thay đổi;
không sửa giao diện ôn tập trong lần cập nhật này. Chưa kiểm thử trên VPS.
