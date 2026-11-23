# Giao diện GV và quyền các mục học sinh

Trang `/giaovien` có thanh điều hướng gồm Tổng quan, Đề cương, Ôn tập tại lớp, Thi thử, Quyền học sinh và Trang mặc định. Các liên kết Mở lớp giám sát, Báo cáo GVCN và Chấm bài giấy mở trang nghiệp vụ tương ứng. Các trình soạn đề, chấm bài, báo cáo, ngân hàng câu hỏi và cài đặt trang mặc định giữ các API hiện có.

## Cấp quyền

1. Vào **Quyền học sinh**, chọn **Tải lại** để xem tất cả lớp đang hoạt động trong năm học hiện tại.
2. Chọn lớp, chọn các mục được phép và bấm **Lưu quyền cho lớp**. Có thể chọn Khóa các mục hoặc Cho phép tất cả trước khi lưu.
3. Với lớp chưa mở buổi học, quyền được lưu trước và áp dụng khi GV mở lớp trên `/x.html` bằng cùng tài khoản. Với lớp đang dạy, quyền áp dụng ngay. Mỗi lớp có bộ quyền riêng.

Học tại lớp luôn mở. Khi GV mở một buổi học trong 08:00 đến trước 17:00, thứ Hai–thứ Sáu theo giờ Việt Nam, hệ thống áp dụng quyền đã lưu cho GV và lớp đó. Nếu chưa lưu quyền, bốn mục còn lại mặc định khóa: Ôn tập tại nhà, Ôn tập tại lớp, Thi thử và Đề cương để in. Ngoài khung giờ này, các mục được mở để HS ôn tập bình thường. Quyền vào lớp theo giờ vẫn dùng quy định hiện có; lưu trước quyền không mở lớp và không cho HS bỏ qua điều kiện GV vào lớp.

Danh sách có nhãn Đang dạy, Chưa mở lớp, GV khác đang dạy hoặc Đang nối lại. GV khác không được đổi quyền của phiên dạy hiện có. GV tạm mất mạng không làm mất quyền đã cấp; cần nối lại lớp trước khi đổi quyền phiên đó. Kết thúc lớp sẽ xóa phiên dạy nhưng giữ cấu hình đã lưu của từng GV, từng ID lớp. GV khác có cấu hình riêng; ID lớp mới của năm học khác không nhận cấu hình lớp năm trước.

Cấu hình lưu tại `data/student-tab-presets.json`, được ghi nguyên tử và giữ qua khởi động lại. Khởi động lại máy chủ vẫn kết thúc các phiên đang dạy; cấu hình được áp dụng lại khi GV mở lớp.

Máy chủ phát quyền qua Socket.IO khi đổi quyền, vào lớp hoặc kết nối lại. Đồng hồ giờ học cập nhật trạng thái giao diện trong tối đa 15 giây; API kiểm tra giờ hiện tại trên mỗi yêu cầu. API ôn tập, trò chơi, tài liệu và thi thử kiểm tra quyền dựa trên lớp xếp học được truy vấn từ cơ sở dữ liệu. Đăng nhập ôn tập và kết nối phụ huynh không bị dùng như cách cấp quyền.

Khi khóa mục đang hiển thị, HS trở về Học tại lớp. Các khung bài được giữ để có thể tiếp tục sau khi được mở lại; máy chủ từ chối các thao tác học của mục đang khóa. **Thời gian thi thử vẫn chạy**, kể cả khi mục Thi thử bị khóa. Quyền này kiểm soát các mục trong FPTBN Monitor.

Sau khi cập nhật VPS, tải lại trang GV và HS để nhận giao diện và điều khiển quyền mới.
