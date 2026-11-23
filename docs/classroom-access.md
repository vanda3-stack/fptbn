# Quy định học sinh vào lớp

Mặc định bật yêu cầu giáo viên mở đúng lớp trong giờ học:

- Thứ Hai đến thứ Sáu: từ 08:00 (bao gồm) đến trước 17:00.
- Múi giờ: `Asia/Ho_Chi_Minh`, do máy chủ tính, độc lập với đồng hồ thiết bị HS và múi giờ VPS.
- Trước 08:00, từ 17:00 trở đi và cả ngày thứ Bảy, Chủ nhật: HS vào bình thường để ôn tập.

Giáo viên mở lớp bằng thao tác vào phòng lớp trên trang GV. Chỉ phiên GV còn kết nối và đang ở đúng phòng mới được tính là mở lớp. Phòng CLB kiểm tra GV trong CLB; phòng EXAM kiểm tra các giám thị đang kết nối.

Admin vào **Cài đặt → Quy định học sinh vào lớp** để bật/tắt và lưu. Cấu hình được lưu trong `data/classroom-access.json` và giữ qua lần khởi động lại. Không có file cấu hình thì quy định mặc định bật. Chỉ phiên đăng nhập admin được máy chủ xác thực mới đọc/lưu được cài đặt; phiên quản lý cài đặt có hạn 8 giờ. Admin đã đăng nhập từ bản cũ cần đăng xuất và đăng nhập lại.

Máy chủ kiểm tra cả `/api/student/login` (trước bước chọn chia sẻ màn hình) và sự kiện `student-join`, kể cả kết nối lại. Lớp của HS được lấy lại từ dữ liệu xếp lớp, không dùng mã lớp tự gửi từ trình duyệt. Khi bị chặn, giao diện hiện lý do và cho phép thử lại sau khi GV mở lớp.

Thay đổi cài đặt áp dụng cho lượt vào lớp tiếp theo. Quy định này kiểm soát việc vào phòng lớp; không chủ động kết thúc phiên HS đang ở trong lớp. Nút kết thúc lớp của GV giữ hành vi hiện có.

## Mất mạng tạm thời

GV mất mạng, đóng tab hoặc tải lại trang không tự kết thúc lớp của HS. HS giữ nguyên bài đang làm và màn hình đang chia sẻ. Khi GV vào lại lớp, kết nối giám sát được tạo lại mà không yêu cầu HS đăng nhập hoặc chọn lại màn hình.

Nếu cả HS và GV cùng mất mạng, HS có thể tiếp tục phiên đã được máy chủ xác nhận bằng mã nối lại riêng. Mã chỉ lưu trong bộ nhớ của trang HS, gắn với đúng HS, lớp xếp học và phòng đã vào; không phát trong danh sách lớp hoặc thông báo cho bạn khác. Lượt vào mới vẫn cần GV mở lớp trong giờ học.

Máy chủ giữ phiên HS mất kết nối tối đa 60 phút theo cơ chế hiện có. Thoát chủ động, GV bấm kết thúc lớp, hết thời hạn giữ phiên hoặc khởi động lại máy chủ sẽ làm mất quyền nối lại. Khi mất mạng, nút kết thúc lớp của GV không gửi lệnh chờ để tránh đóng lớp bất ngờ lúc kết nối trở lại.

Kiểm tra trước khi cập nhật VPS:

```bash
node --check server.js
node --check lib/classroom-access.js
node --check public/js/student.js
node --check public/js/classroom-access-admin.js
npm test
```
