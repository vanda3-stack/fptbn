# Nâng cấp bộ chấm theo đề cương — không dùng API

## Tài liệu đã đối chiếu

`De_cuong_GK1_Tin_hoc_9_theo_mau.docx`, đề cương giữa kỳ 1 năm học 2026–2027, phần B trang 4: đủ 3 câu tự luận, 15 ý.

[Mở tài liệu nguồn](https://chatgpt.com/library?file_id=libfile_b178e790a070819198e5a86238b68c58&account_id=personal).

| Câu | Nội dung | Số ý |
| --- | --- | --- |
| 1 | Khả năng máy tính, ứng dụng y tế và giao thông | 5 |
| 2 | Yêu cầu tìm trường THPT và đánh giá thông tin | 5 |
| 3 | Hạn chế tác động tiêu cực, bảo vệ bản thân và tôn trọng người khác | 5 |

## Thay đổi

Bộ chấm cũ lấy cụm điền khuyết làm từ khóa và yêu cầu đủ tất cả cụm. Bộ chấm mới có tiêu chí nội dung riêng cho từng ý, gồm các cách diễn đạt tương đương đã khai báo, phạm vi phủ định và dẫn chứng nguyên văn từ bài làm. Không có lời gọi API, không cần API key hay dịch vụ AI; chạy trong tiến trình Node.js hiện tại.

- Viết/nói ở phần 3: mỗi câu tối đa 10 điểm; mỗi ý tối đa 2 điểm. Ý có nhiều nội dung được chia điểm đều cho các thành phần. Đây là cách quy đổi mới cho luyện tập, không phải thang điểm chi tiết do tài liệu gốc ban hành.
- Đáp án “hoặc” ở ứng dụng giao thông: chỉ cần một ví dụ trong hai ví dụ đã nêu.
- Chấp nhận các từ/cách diễn đạt đã khai báo, đảo thứ tự ý, chữ hoa, Unicode và bài gõ không dấu. Không dùng độ giống chuỗi để đoán điểm; chưa tự sửa mọi lỗi chính tả hoặc hiểu mọi cách diễn đạt.
- Phân biệt “giao tiếp lịch sự” với “giao tiếp không lịch sự”; “không xúc phạm” với “có thể xúc phạm”. Phủ định không truyền sang câu mới. Câu phức tạp, phủ định kép hoặc cùng một nội dung vừa khẳng định vừa phủ định chuyển sang “Cần xác nhận”.
- Ý lặp lại không cộng thêm điểm. Bài theo từng ô ý không được lấy nội dung từ ô khác.
- Hiển thị đạt, đạt một phần, chưa nhận diện, nội dung trái đáp án hoặc cần xác nhận, kèm tiêu chí và dẫn chứng.
- Kết quả cần xác nhận được lưu với điểm tổng `null`, không được coi là 0 điểm hoặc lượt hoàn thành. Thống kê dùng điểm thành phần thay vì chỉ đếm ý khớp đủ từ khóa. Ngưỡng hoàn thành vẫn là 80%.
- Thi thử mới dùng phiên bản chấm 3, quy đổi vào quỹ điểm tự luận đã cấu hình. Lượt thi cũ giữ phiên bản chấm trong snapshot; điểm giáo viên vẫn được ưu tiên.

## Phạm vi nhận diện và giới hạn

Bộ tiêu chí được chọn khi **toàn bộ 5 ý đáp án** khớp bộ đáp án đã đối chiếu sau chuẩn hóa chữ, dấu và dấu câu, không dựa vào số thứ tự câu. Vì vậy câu bị đảo thứ tự vẫn được chấm đúng bộ tiêu chí. Không cần nhập lại đề cương nếu nội dung đang lưu đúng bộ đáp án này. Sửa nội dung một ý hoặc dùng đề cương khác sẽ quay về bộ chấm từ khóa hiện có; cần bổ sung và kiểm tra tiêu chí mới.

Nhóm từ khóa giáo viên khai báo vẫn dùng cho các câu chưa có bộ tiêu chí. Với bộ đáp án đã hỗ trợ, tiêu chí riêng được ưu tiên hơn các từ khóa tạo từ mẫu điền khuyết. Thay từ khóa không thay đổi tiêu chí riêng; muốn điều chỉnh cần sửa `lib/outline-rubrics.js` và kiểm tra lại các ca tương ứng.

Đây là bộ luật hữu hạn được kiểm tra với đề cương này, không phải mô hình AI hiểu mọi câu tiếng Việt. Các ví dụ khác có thể hợp lệ vì câu hỏi mở. Một số ví dụ ngoài mẫu đã được nhận diện để chuyển GV xác nhận, như mô phỏng khoa học, robot, mật khẩu mạnh, xác thực hai lớp. Các cách diễn đạt ngoài danh sách vẫn có thể chưa được nhận diện; không khẳng định chấm chính xác tuyệt đối.

Hiện chưa có màn hình GV sửa điểm cho từng lượt **ôn tập** đã lưu; nếu cần xác nhận, GV đối chiếu và HS luyện lại. Thi thử vẫn có màn hình chấm/sửa điểm của GV. Không sửa ngược các bản ghi ôn tập cũ, không tạo lại lịch sử hoàn thành.

## Kiểm tra và triển khai

Chạy `npm test`. Bộ kiểm tra gồm nguyên văn cả 15 ý từ tài liệu nguồn, diễn đạt tương đương cho 3 câu, đảo ý, lặp ý, không dấu, thiếu thành phần, phủ định, mâu thuẫn, ví dụ khác, điểm thành phần trong báo cáo, lưu bài qua API máy chủ, thi thử phiên bản mới/cũ và hiển thị an toàn.

Thay đổi đang ở nhánh riêng `feature/outline-essay-grading`, dựa trên `feature/on-tap-phu-huynh`. Khi cập nhật VPS, lấy đúng nhánh này, chạy kiểm tra, khởi động lại Node.js trong vPanel và tải lại trang. Không cần thay cấu trúc cơ sở dữ liệu hoặc cấu hình API. Kiểm tra thêm trên bản sao dữ liệu thực để xác nhận đề cương đang lưu khớp bộ đáp án nguồn.
