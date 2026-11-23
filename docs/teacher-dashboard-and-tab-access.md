# Trang mặc định và quyền tab theo khối

Trang `/giaovien` có thanh điều hướng Tổng quan, Đề cương, Ôn tập tại lớp, Thi thử và Trang mặc định. Quyền tab HS nằm trong **Trang mặc định**, áp dụng theo khối 3–12. Không cần chọn từng lớp.

Mỗi khối có một danh sách thả xuống. Mỗi dòng gồm ô tròn chọn **trang mặc định**, tên tab và ô tích **Cho phép**. Hai lựa chọn độc lập:

- Ô tròn giữ cơ chế trang mở đầu cũ: mỗi khối có đúng một trang mặc định. Bấm **Lưu trang mặc định** để lưu bằng API `/api/teacher/default-tabs`; dữ liệu `student_default_tabs` giữ nguyên.
- Ô tích cho phép HS cả khối bấm vào tab đó; bỏ tích để khóa trong giờ học. Bấm **Lưu quyền tab** để lưu đầy đủ năm quyền cho cả 10 khối. Thao tác này không thay đổi trang mặc định.
- Học tại lớp cũng là một lựa chọn có thể tích/bỏ tích, không bắt buộc mở. Nếu trang mặc định bị khóa, HS chuyển sang tab đầu tiên được phép. Nếu cả năm tab bị khóa, chỉ hiển thị thông báo chờ GV cấp quyền.

Quyền theo khối áp dụng trong 08:00 đến trước 17:00, thứ Hai–thứ Sáu, giờ Việt Nam. Ngoài giờ, tất cả tab được mở phục vụ ôn tập như trước. Việc cấp quyền tab không mở lớp và không thay thế điều kiện GV mở lớp để HS vào học.

`GET/POST /api/teacher/student-tab-access/grades` yêu cầu phiên GV còn hạn và tài khoản đang hoạt động. Cấu hình chung cho cả khối, áp dụng cả các lớp có GV khác đang dạy. Máy chủ kiểm tra đủ khối 3–12, kiểu boolean cho cả năm tab; lưu toàn bộ một lần trước khi phát quyền. Lưu lỗi không cập nhật từng phần.

Quyền lưu bền tại trường `grades` trong `data/student-tab-presets.json`. Các cấu hình theo lớp trước đây được giữ để tương thích; khi đã lưu cấu hình khối, quyền khối được ưu tiên. Chỉ cài đặt giao diện mới chưa làm thay đổi quyền: cần bấm Lưu quyền tab. Cấu hình khối vẫn áp dụng sau khi GV mất mạng, nối lại, kết thúc lớp hoặc máy chủ khởi động lại.

Khối của HS được lấy từ lớp xếp học trong cơ sở dữ liệu trên mỗi yêu cầu API và khi kết nối lớp; không tin khối do trình duyệt truyền vào. Quyền cập nhật qua Socket.IO khi lưu, kết nối lại và tối đa 15 giây khi qua mốc giờ học. HS ở phòng EXAM/CLB vẫn nhận quyền theo lớp gốc của mình. API ôn tập, tài liệu, thi thử và ôn tập tại lớp từ chối yêu cầu của tab bị khóa.

Khóa tab đang mở đưa HS sang một tab được phép (hoặc thông báo chờ nếu không có tab nào được mở) và giữ các khung bài để tiếp tục khi được mở lại. **Thời gian thi thử vẫn chạy.** Điều khiển này áp dụng cho các mục bên trong FPTBN Monitor.

Khi tải quyền lỗi hoặc dữ liệu sai phiên bản, ô quyền và nút lưu quyền bị vô hiệu hóa; cấu hình trang mặc định vẫn dùng được nếu tải thành công. Có nút Tải lại và thông báo riêng khi chưa xác nhận được thao tác lưu. Trang GV dùng `Cache-Control: no-store` và phiên bản tài nguyên mới. Sau khi cập nhật VPS, tải lại trang GV và HS.

Kiểm thử tự động dùng DOM thật trong jsdom để kiểm tra danh sách theo khối, ô tròn/ô tích độc lập, dữ liệu gửi đến từng API và lỗi phiên; kiểm thử HTTP kiểm tra xác thực, lưu đầy đủ, quyền API; kiểm thử bộ điều khiển kiểm tra nhiều lớp cùng khối, ngoài giờ, khởi động lại và lỗi ghi file.

Dữ liệu quyền khối phiên bản cũ chỉ có bốn khóa được đọc với quyền Học tại lớp bật để giữ nguyên cài đặt trước khi GV chủ động thay đổi. Cấu hình mới lưu đủ năm khóa, bao gồm `class:false`. Màn hình đăng nhập và kết nối giám sát vẫn giữ hoạt động khi khóa tab Học tại lớp; khóa tab không ngắt phiên chia sẻ hoặc làm mất bài đang làm.
