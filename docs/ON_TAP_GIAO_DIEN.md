# Giao diện tự luận theo cả câu

Giao diện HS giữ nguyên câu hỏi và hiển thị toàn bộ đáp án có đánh số trong cùng một khung; không chuyển màn hình theo từng ý.

1. **Học đáp án:** đọc trọn câu trả lời và tự nhẩm các ý chính.
2. **Tự luyện:** ẩn đáp án mẫu, chọn điền từ còn thiếu (mặc định, dùng mẫu GV đã duyệt) hoặc tự viết toàn bộ vào một ô lớn. Có một nút Kiểm tra đáp án cho cả câu. Kết quả được chấm/lưu từ máy chủ; chỉ sau khi nhận thành công mới mở phản hồi.

Điền khuyết tô đúng/sai và đặt từ đúng cạnh ô cần sửa. Tự viết hiển thị cả đáp án mẫu và mức đối chiếu từ khóa tham khảo, không chấm ngữ nghĩa. Tính một lượt cho cả câu theo chế độ; bấm kiểm tra/lưu lặp cùng lượt không tăng lượt. Nút luyện lại tạo UUID mới. Không tính việc chỉ đọc đáp án là một lượt hoàn thành.

Bản nháp được giữ trong cùng phiên học khi đổi câu, đổi cách luyện hoặc quay lại xem đáp án. Chưa lưu bản nháp khi rời phần tự luận hoặc tải lại trang. Lịch sử đã hoàn thành và các bộ ôn cũ giữ nguyên. API vẫn nhận bài viết từng ý từ trình duyệt cũ và nhận thêm trường `text` cho bài viết cả câu (tối đa 12.000 ký tự), lưu một lần nội dung đó.

Cập nhật bằng `git pull --ff-only origin main`, khởi động lại Node.js vì API nhận thêm bài viết cả câu, rồi tải lại `/OT.html` để lấy giao diện mới. Không cần migration cơ sở dữ liệu hoặc cài thư viện.
