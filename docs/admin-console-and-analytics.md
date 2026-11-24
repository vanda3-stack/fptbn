# Admin: cấu hình cổng HS, thời gian ôn thi và báo cáo hoạt động

## Điều hướng và phân quyền

`/admin/` giữ các trang Học sinh, Giáo viên, Lớp học, Năm học và bổ sung:

- **Trang mặc định & quyền HS**: danh sách thả xuống cho khối 3–12, ô tròn chọn trang đầu và ô tích cho phép từng tab, gồm cả Học tại lớp. Hai nhóm cài đặt lưu độc lập.
- **Cài đặt truy cập**: quy định GV mở lớp trong giờ học và công tắc Thời gian ôn thi.
- **Thống kê & báo cáo**: bộ lọc ngày/năm học/khối, chỉ số, biểu đồ ngày, bảng lớp và xuất CSV.

Tất cả `/api/admin/*` trừ đăng nhập đều yêu cầu Bearer token do máy chủ cấp, còn hạn 8 giờ và tài khoản admin đang hoạt động. Giao diện gửi token cả cho API quản lý dữ liệu cũ và tải Excel/CSV, không gửi token sang host khác. Đăng xuất hủy token máy chủ khi kết nối được và xóa dữ liệu cài đặt/báo cáo trên giao diện. Phiên hết hạn đưa người dùng về đăng nhập; không chấp nhận thông tin admin chỉ được sửa trong sessionStorage.

Trang GV bỏ mục cấu hình mặc định/quyền toàn trường. Khi server được cấu hình với adminTokens, các API cũ `/api/teacher/default-tabs` và `/api/teacher/student-tab-access...` từ chối quyền quản lý; GV không thể tiếp tục sửa bằng client cũ. Bộ điều khiển theo lớp vẫn giữ tương thích cho các cấu hình cũ, quyền theo khối được ưu tiên.

API mới: `GET/POST /api/admin/default-tabs`, `GET/POST /api/admin/student-tab-access/grades`. Dữ liệu `student_default_tabs` và `data/student-tab-presets.json` giữ nguyên; không đặt lại trang mặc định hay các quyền đã lưu. Lưu 10 trang mặc định bằng một câu INSERT nhiều dòng để tránh cập nhật dở dang.

## Thời gian ôn thi

`revisionMode` mặc định false, lưu cùng `enabled` trong `data/classroom-access.json`. File cũ không có trường này được hiểu là tắt. `POST /api/admin/classroom-access` nhận hai boolean hoặc cập nhật riêng một trường; ghi file nguyên tử trước khi áp dụng.

- **Bật**: HS được vào bất kỳ thời điểm nào mà không cần GV mở lớp; cả năm tab được mở phục vụ ôn tập. Không bỏ xác thực mã HS, lớp hiện tại hoặc quy tắc một phiên HS đang hoạt động.
- **Tắt**: khôi phục điều kiện GV mở lớp từ 08:00 đến trước 17:00 thứ Hai–thứ Sáu và quyền tab đã lưu; ngoài giờ vẫn ôn tập bình thường. Nếu admin đã tắt riêng quy định GV mở lớp, công tắc đó vẫn giữ trạng thái cũ.

Thay đổi phát lại quyền tới HS đang kết nối, không ngắt chia sẻ hay xóa bài đang làm. Trạng thái truy cập lớp áp dụng ở cả HTTP đăng nhập và Socket.IO join. Bật ôn thi không sửa cấu hình quyền; trong trang quyền có thông báo khi chế độ này đang bật.

## Dữ liệu thống kê

Nguồn có sẵn:

- Tài khoản, lớp và xếp lớp từ students/teachers/classes/student_enrollments/school_years.
- Lượt ôn và điểm trắc nghiệm từ `ot_attempts`.
- Lượt thi hiện tại từ `ot_exam_attempts`, lượt thi lại cũ từ `ot_exam_archives`, liên kết năm học qua đề thi/đề cương. ID đã có trong bảng hiện tại không được tính lại từ lưu trữ.
- Câu trả lời trên lớp từ `ot_live_answers` và `ot_live_games`.
- Nội dung/GV tạo nội dung từ `ot_packs`.

Đăng nhập bắt đầu ghi sau cập nhật vào `fptbn_activity_events`, metadata thời điểm bắt đầu vào `fptbn_activity_meta`. Tạo bảng tự động khi khởi tạo báo cáo/ghi đăng nhập; yêu cầu quyền CREATE/INSERT trên CSDL ứng dụng. Chỉ ghi vai trò student/teacher, ID nội bộ, ID lớp và thời gian máy chủ khi API đăng nhập cổng HS/GV trả thành công. Không ghi mã HS, tên, email, mật khẩu, token, IP, URL truy cập hay nội dung bài làm vào bảng hoạt động. Đăng nhập ôn tập tự động trong iframe không bị tính thêm thành lượt đăng nhập cổng HS. Nếu ghi thống kê lỗi, đăng nhập vẫn hoạt động; báo cáo ghi rõ nguồn thiếu.

API `GET /api/admin/analytics` và `/export.csv` nhận from/to dạng YYYY-MM-DD (bao gồm hai đầu theo giờ Việt Nam), year ID, grade 3–12 tùy chọn. Mặc định 30 ngày và năm hiện tại; tối đa 366 ngày, không nhận ngày tương lai. Khoảng lọc chuyển thành epoch rồi dùng FROM_UNIXTIME cho cột TIMESTAMP, không phụ thuộc múi giờ host. Nhóm ngày bằng epoch cộng 7 giờ. CSV dùng lại bản tổng hợp được đệm trong 30 giây khi cùng bộ lọc; kèm thời điểm tổng hợp, phạm vi, cách tính và cảnh báo nguồn thiếu.

Báo cáo là số liệu tổng hợp, không xuất danh sách định danh cá nhân. CSV UTF-8 BOM, escape dấu ngoặc kép và chống công thức từ chuỗi bắt đầu bằng =,+,-,@. Bộ lọc thay đổi sẽ khóa Xuất cho đến lần tổng hợp tiếp theo; khi tải lỗi, kết quả cũ bị xóa và không xuất thành tệp số liệu mới.

### Các chỉ số và giới hạn

- HS có hoạt động: distinct mã nội bộ từ đăng nhập cổng HS, bài ôn/lượt thi/câu trả lời đã lưu trong phạm vi; không phải lượt xem hay số người đã xác minh độc lập.
- Độ phủ học tập: distinct HS hiện đang mở tài khoản/xếp lớp trong phạm vi có hoạt động học tập đã lưu, chia cho tổng HS hiện đang mở tài khoản/xếp lớp trong phạm vi. Đây là mẫu số hiện tại; không suy ngược được danh sách tài khoản ở một ngày quá khứ.
- Lượt thi bắt đầu trong kỳ gồm lịch sử thi lại. Đã nộp tính trong các lượt đó và có thời điểm nộp trước cuối kỳ. Lượt quá hạn chưa được hệ thống chốt không tự gán đã nộp khi xem thống kê.
- Độ chính xác trắc nghiệm tính tổng câu đúng/tổng câu có điểm hợp lệ của ôn trắc nghiệm. Không gộp tự luận hoặc dùng chỉ số này làm bằng chứng nhân quả về tiến bộ.
- GV đăng nhập tính toàn trường theo thời gian; nội dung và hoạt động HS lọc theo năm học/khối. Chưa có lịch sử đăng nhập trước thời điểm metadata, không tự tạo số liệu lịch sử.
- Tài khoản và xếp lớp là ảnh chụp hiện tại; ngày hiện tại chưa trọn ngày. Nguồn chưa có bảng được đánh dấu thiếu và hiển thị dấu —; không biến lỗi dữ liệu thành số 0.
- Trực tuyến dựa vào socket thật đang connected, HS/GV được khử trùng ID. Phiên HS giữ lại lúc mất mạng không được coi là đang online. Lớp mở cần GV connected.
- Phản hồi CSDL, RSS/heap, uptime và bộ đếm HTTP đo tiến trình hiện tại; HTTP đặt lại khi restart. Chưa đo thời gian học thực tế hay thời gian sẵn sàng toàn bộ website.

## Kiểm chứng

Kiểm thử DOM khởi chạy toàn bộ inline admin cũ cùng mã mới, kiểm tra token, menu, quyền theo khối, toggle, render báo cáo, escaping, khóa xuất khi lỗi/đổi lọc và xóa dữ liệu lúc đăng xuất. Kiểm thử HTTP kiểm tra admin/GV/phiên hết hạn/khóa tài khoản, API cũ không vượt quyền, cài đặt độc lập và CSV không xuất khi lỗi. Kiểm thử policy kiểm tra bật/tắt ôn thi, khởi động lại và rollback khi lỗi ghi file. Truy vấn thống kê kiểm tra tham số phạm vi, mẫu số, mốc ngày và chống tính trùng lưu trữ.

Truy vấn thống kê chưa được chạy trên CSDL VPS trong phiên sửa mã. Sau triển khai, admin đăng nhập lại, thử một khoảng ngắn và đối chiếu một lớp/đề thi với báo cáo GV trước khi dùng làm minh chứng cuộc thi.


## Giao diện admin và tương thích máy chủ web

Giao diện đăng nhập và bên trong admin dùng nền navy, menu có mô tả, thanh thương hiệu và các thẻ nội dung thống nhất với không gian GV. Trang đăng nhập giữ nguyên API/tài khoản, thêm nút Hiện/Ẩn mật khẩu và trạng thái bàn phím/đọc màn hình. Cài đặt truy cập có hai công tắc, bản xem trước chưa lưu và tóm tắt quy định đang áp dụng.

Kiểm tra không đăng nhập ngày 25/11/2026 cho thấy LiteSpeed trả 403 HTML với PUT tới `/api/admin/classroom-access`, còn POST đi đến ứng dụng và nhận 401 JSON. Không gửi token hoặc ghi cài đặt thật trong phép kiểm tra này.

Máy chủ bổ sung POST có cùng xác thực admin và xử lý lưu như PUT. Client dùng POST trực tiếp, không tự thử lại một thao tác ghi lỗi/chưa xác nhận. Sau phản hồi lưu, client gọi GET để đối chiếu đủ `enabled` và `revisionMode` với yêu cầu. Nếu không đọc xác nhận được, khóa chỉnh sửa cho đến khi Tải lại thành công. Nếu đọc ra trạng thái khác do thay đổi đồng thời, hiển thị trạng thái thực tế thay vì báo lưu đúng lựa chọn. Nút Lưu chỉ mở khi đã tải được cài đặt và có thay đổi.

Đã kiểm tra Chrome headless với hồ sơ riêng, dữ liệu giả lập localhost, viewport 1440px và 390px: đăng nhập, tổng quan, cài đặt, cấu hình theo khối; không tràn ngang. Đã thao tác lưu trên fixture có proxy chặn PUT và xác nhận thành công bằng POST rồi GET. Chưa lưu bằng tài khoản admin thật trên VPS. CI chỉ kiểm thử, không tự triển khai.
