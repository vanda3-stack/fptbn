# Giao diện GV và quyền các mục học sinh

Trang `/giaovien` có thanh điều hướng gồm Tổng quan, Đề cương, Ôn tập tại lớp, Thi thử và Trang mặc định. Phần khóa/mở tab HS được gộp ngay trong Trang mặc định. Các liên kết Mở lớp giám sát, Báo cáo GVCN và Chấm bài giấy mở trang nghiệp vụ tương ứng. Các trình soạn đề, chấm bài, báo cáo, ngân hàng câu hỏi và cài đặt trang mặc định giữ các API hiện có.

## Cấp quyền

1. Vào **Trang mặc định**. Phần **Trang mở đầu theo khối** có thể mở rộng để đổi trang đầu tiên của khối 3–12. Phần **Tab học sinh được phép mở** hiển thị danh sách lớp có ô tích, chia theo khối, có thể thu gọn. Có thể tìm lớp, chọn tất cả lớp đang hiển thị hoặc bỏ chọn tất cả; nút Tải lại lấy dữ liệu mới từ máy chủ.
2. Tích một hoặc nhiều lớp, tích các tab cho phép rồi bấm **Lưu quyền cho N lớp**. Tab được tích cho phép HS bấm vào; tab không tích bị khóa trong giờ học. Có thể dùng **Bỏ tích các tab** hoặc **Tích tất cả tab** trước khi lưu. Khi các lớp có quyền khác nhau, ô chỉ được tích nếu tất cả lớp đang chọn đều cho phép. Lần lưu ghi đầy đủ cả bốn ô tích cho toàn bộ lớp đã chọn, bao gồm cả ô không tích. Các lớp không được chọn giữ nguyên quyền.
3. Trang mở đầu theo khối có nút **Lưu trang mở đầu** riêng. Nếu trang mở đầu bị khóa, HS ở lại Học tại lớp. Với lớp chưa mở buổi học, quyền được lưu trước và áp dụng khi GV mở lớp trên `/x.html` bằng cùng tài khoản. Với lớp đang dạy, quyền áp dụng ngay. Mỗi lớp có bộ quyền riêng.

Học tại lớp luôn mở. Khi GV mở một buổi học trong 08:00 đến trước 17:00, thứ Hai–thứ Sáu theo giờ Việt Nam, hệ thống áp dụng quyền đã lưu cho GV và lớp đó. Nếu chưa lưu quyền, bốn mục còn lại mặc định khóa: Ôn tập tại nhà, Ôn tập tại lớp, Thi thử và Đề cương để in. Ngoài khung giờ này, các mục được mở để HS ôn tập bình thường. Quyền vào lớp theo giờ vẫn dùng quy định hiện có; lưu trước quyền không mở lớp và không cho HS bỏ qua điều kiện GV vào lớp.

Danh sách có nhãn Đang dạy, Chưa mở lớp, GV khác đang dạy hoặc Đang nối lại. GV khác không được đổi quyền của phiên dạy hiện có. GV tạm mất mạng không làm mất quyền đã cấp; cần nối lại lớp trước khi đổi quyền phiên đó. Kết thúc lớp sẽ xóa phiên dạy nhưng giữ cấu hình đã lưu của từng GV, từng ID lớp. GV khác có cấu hình riêng; ID lớp mới của năm học khác không nhận cấu hình lớp năm trước.

Cấu hình lưu tại `data/student-tab-presets.json`, được ghi nguyên tử và giữ qua khởi động lại. Khởi động lại máy chủ vẫn kết thúc các phiên đang dạy; cấu hình được áp dụng lại khi GV mở lớp.

Lưu nhóm lớp dùng `POST /api/teacher/student-tab-access/batch`. Máy chủ kiểm tra toàn bộ lớp trong năm học hiện tại và quyền quản lý trước khi ghi cấu hình một lần. Nếu có lớp không hợp lệ, thuộc GV khác hoặc ghi file thất bại, các lớp trong nhóm không bị cập nhật từng phần. Mục Học tại lớp luôn được mở.

Khi tải lỗi, dữ liệu sai phiên bản hoặc hết phiên đăng nhập, giao diện xóa lựa chọn/quyền cũ và khóa nút Lưu. Trang GV gửi `Cache-Control: no-store` và dùng tên tệp mới cho thành phần ô tích để tránh dùng lại bản hộp chọn lớp cũ. Kiểm thử DOM dùng jsdom 26 (Node 18 trở lên) để kiểm tra các ô tích và trạng thái khi lỗi mà không cần điều khiển trình duyệt.

Máy chủ phát quyền qua Socket.IO khi đổi quyền, vào lớp hoặc kết nối lại. Đồng hồ giờ học cập nhật trạng thái giao diện trong tối đa 15 giây; API kiểm tra giờ hiện tại trên mỗi yêu cầu. API ôn tập, trò chơi, tài liệu và thi thử kiểm tra quyền dựa trên lớp xếp học được truy vấn từ cơ sở dữ liệu. Đăng nhập ôn tập và kết nối phụ huynh không bị dùng như cách cấp quyền.

Khi khóa mục đang hiển thị, HS trở về Học tại lớp. Các khung bài được giữ để có thể tiếp tục sau khi được mở lại; máy chủ từ chối các thao tác học của mục đang khóa. **Thời gian thi thử vẫn chạy**, kể cả khi mục Thi thử bị khóa. Quyền này kiểm soát các mục trong FPTBN Monitor.

Sau khi cập nhật VPS, tải lại trang GV và HS để nhận giao diện và điều khiển quyền mới.
