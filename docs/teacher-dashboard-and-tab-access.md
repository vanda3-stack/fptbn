# Giao diện GV và quyền các mục học sinh

Trang `/giaovien` có thanh điều hướng gồm Tổng quan, Đề cương, Ôn tập tại lớp, Thi thử, Quyền học sinh và Trang mặc định. Các liên kết Mở lớp giám sát, Báo cáo GVCN và Chấm bài giấy mở trang nghiệp vụ tương ứng. Các trình soạn đề, chấm bài, báo cáo, ngân hàng câu hỏi và cài đặt trang mặc định giữ các API hiện có.

## Cấp quyền

1. GV mở lớp trên `/x.html` bằng tài khoản đang dùng ở `/giaovien`.
2. Vào **Quyền học sinh**, chọn **Tải lại**, chọn lớp đang quản lý.
3. Chọn các mục được phép và bấm **Lưu quyền cho lớp**. Có thể chọn Khóa các mục hoặc Cho phép tất cả trước khi lưu.

Học tại lớp luôn mở. Khi GV mở một buổi học trong 08:00 đến trước 17:00, thứ Hai–thứ Sáu theo giờ Việt Nam, bốn mục còn lại mặc định khóa: Ôn tập tại nhà, Ôn tập tại lớp, Thi thử và Đề cương để in. Ngoài khung giờ này, các mục được mở để HS ôn tập bình thường. Quyền vào lớp theo giờ vẫn dùng quy định hiện có.

Quyền gắn với lớp và GV đang mở lớp. GV khác không được đổi quyền của lớp này. GV tạm mất mạng không làm mất quyền đã cấp. Kết thúc lớp chủ động sẽ xóa quyền của buổi học; GV mới mở lớp bắt đầu với các mục khóa mặc định. Quyền buổi học lưu trong bộ nhớ máy chủ; sau khởi động lại, GV vào lớp lại và cấp quyền mới.

Máy chủ phát quyền qua Socket.IO khi đổi quyền, vào lớp hoặc kết nối lại. Đồng hồ giờ học cập nhật trạng thái giao diện trong tối đa 15 giây; API kiểm tra giờ hiện tại trên mỗi yêu cầu. API ôn tập, trò chơi, tài liệu và thi thử kiểm tra quyền dựa trên lớp xếp học được truy vấn từ cơ sở dữ liệu. Đăng nhập ôn tập và kết nối phụ huynh không bị dùng như cách cấp quyền.

Khi khóa mục đang hiển thị, HS trở về Học tại lớp. Các khung bài được giữ để có thể tiếp tục sau khi được mở lại; máy chủ từ chối các thao tác học của mục đang khóa. **Thời gian thi thử vẫn chạy**, kể cả khi mục Thi thử bị khóa. Quyền này kiểm soát các mục trong FPTBN Monitor.

Sau khi cập nhật VPS, tải lại trang GV và HS để nhận giao diện và điều khiển quyền mới.
