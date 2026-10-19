# Cập nhật giao diện ôn tập

## Địa chỉ

- HS: `/ontap`
- GV: `/giaovien`
- Đường dẫn cũ `/OT.html`, `/GV.html` được máy chủ chuyển hướng về địa chỉ mới, giữ query string. Các route này phải đi qua Node.js; nếu cấu hình LiteSpeed có chuyển hướng riêng, cần giữ reverse proxy tương tự route `/clb` đang dùng.

## Trắc nghiệm

Giao diện trò chơi với nền tím, bốn thẻ màu A–D, thanh tiến độ, số câu đúng và chuỗi câu đúng liên tiếp. Không giới hạn thời gian, không dùng tốc độ để tính điểm, không thêm bảng xếp hạng. Sau khi chọn, đáp án khóa trong lượt đó; hiển thị cả ký hiệu và chữ đúng/sai. HS chủ động chuyển câu, server chấm kết quả khi hoàn thành cả bộ và chống nộp lặp. Hỗ trợ màn hình hẹp, lựa chọn giảm chuyển động và điều khiển bàn phím bằng các nút chuẩn. Không dùng tài sản hoặc nhận diện thương hiệu của Wayground.

## Tự luận

Ba tab hiển thị cả câu trả lời, không chia màn hình theo từng ý:

1. **Thẻ lật:** tự nhẩm, bấm để mở toàn bộ đáp án, bấm lại để ẩn.
2. **Điền từ:** điền các từ khuyết trong cả câu; kiểm tra và lưu một lượt.
3. **Viết cả câu:** một ô văn bản lớn cho toàn bộ câu trả lời; đối chiếu mẫu và từ khóa tham khảo sau khi kiểm tra. Không chấm ngữ nghĩa tự động.

Bản nháp trong phiên được giữ khi đổi tab và đổi câu hỏi. Chỉ xem thẻ lật không tăng lượt ôn. Tải lại trang hoặc rời phần tự luận chưa giữ bản nháp.

## Báo cáo GV

Báo cáo từng bộ ôn có bộ lọc lớp, mặc định tất cả lớp. Bảng, số HS đã/chưa ôn, tổng lượt và CSV xuất ra đều sử dụng cùng tập dữ liệu đã lọc. Dữ liệu vẫn lấy từ API xác thực GV và giới hạn theo bộ ôn thuộc GV; bộ lọc được thực hiện trong trình duyệt sau khi tải báo cáo của bộ đó.

## Triển khai

`git pull --ff-only origin main`, khởi động lại Node.js để kích hoạt route mới, tải lại trình duyệt. Không cần thêm bảng DB hoặc dependency. Kiểm thử tự động: `node --test test/ot.test.js test/ot-essay.test.js test/ot-play.test.js`. Chưa kiểm chứng trực tiếp trên điện thoại hoặc VPS trong môi trường phát triển.
