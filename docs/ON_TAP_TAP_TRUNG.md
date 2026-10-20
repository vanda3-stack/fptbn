# Giao diện và chế độ tập trung

Giao diện `/ontap` và `/giaovien` dùng logo trường và logo sản phẩm có sẵn, nền xanh đen, bề mặt thẻ và nút xanh theo giao diện FPTBN Monitor hiện hành. Giữ bốn lựa chọn màu khác nhau khi làm trắc nghiệm, ba tab tự luận và bộ lọc lớp trên trang GV.

Chế độ tập trung tự bật lúc bắt đầu trắc nghiệm hoặc mở tự luận; tắt khi trở về danh sách/bộ ôn, đăng xuất hoặc hoàn thành trắc nghiệm. Dùng Page Visibility để nhận biết trang chuyển nền và window blur với độ trễ một giây để nhắc khi cửa sổ mất tiêu điểm. Không coi hộp xác nhận/alert do ứng dụng mở là rời trang. Nhiều sự kiện cùng một lần rời trang chỉ phát một lời nhắc cho đến khi HS xác nhận.

Khi trang không còn hiển thị, trình duyệt không thể buộc popup xuất hiện trên ứng dụng khác; lời nhắc hiện khi HS quay lại. Nếu chỉ mất tiêu điểm nhưng trang còn nhìn thấy, lời nhắc có thể hiện trên trang đó. Không xác định được HS mở ứng dụng gì, không chặn được hệ điều hành và không kết luận gian lận. Khóa máy, chuyển ứng dụng, nghe cuộc gọi trên điện thoại cũng có thể kích hoạt nhắc. Nút đóng/tải lại trang dùng xác nhận beforeunload chuẩn của trình duyệt; nội dung và việc có hiện hay không do trình duyệt quyết định, nhất là trên điện thoại.

Số lần nhắc chỉ hiển thị trong lượt ôn hiện tại trên máy HS, chưa lưu lên server hoặc gửi thành cảnh báo cho GV. Không truy cập màn hình, camera hoặc nội dung ứng dụng khác. Không thêm bảng DB, dependency hoặc giới hạn mạng.

Cập nhật `git pull --ff-only origin main` và tải lại trang. Không cần khởi động lại Node.js cho riêng thay đổi giao diện và cảnh báo này. Nếu VPS chưa có các route `/ontap` và `/giaovien` của bản trước thì cần restart sau khi cập nhật.
