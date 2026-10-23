# PH đồng hành cùng HS ôn tập

Nhánh `feature/on-tap-phu-huynh` sao chép từ `feature/on-tap`. Chỉ cập nhật nhánh riêng, không tự gộp vào main hoặc triển khai website đang chạy.

## Nhập mã

- HS mở `/OT.html`: tiền tố **FBN** cố định, chỉ nhập phần còn lại, ví dụ `12345` thành `FBN12345`.
- PH mở `/PH.html`: tiền tố **FBN** và hậu tố **PH** cố định, nhập `12345` thành `FBN12345PH`. Không yêu cầu mật khẩu, tài khoản hoặc bảng mật khẩu PH.
- Tự chuyển chữ nhập/dán thành chữ hoa. Có thể dán nguyên mã `fbn12345` hoặc `fbn12345ph` vào ô tương ứng, hệ thống bỏ phần đầu/đuôi trùng để ghép mã chính xác.
- Máy chủ vẫn kiểm tra HS hoạt động và có đúng một lớp trong năm học hiện tại. PH không được gửi mã HS đích khác trong tín hiệu truyền video.

**Mã theo dõi không xác minh quan hệ PH–HS. Ai biết đúng Mã HS + PH có thể xem khi HS đang chia sẻ.** Giao diện HS nêu rõ điều này trước khi chia sẻ; HS chủ động chọn màn hình, thấy số thiết bị yêu cầu xem và có thể dừng. Luồng HS gốc cũng chỉ nhận diện bằng mã, chưa xác minh danh tính người đang dùng.

## Chia sẻ và theo dõi

1. HS vào ôn tập, bấm **Chia sẻ toàn màn hình cho PH** trên máy tính, cấp quyền và chọn **Toàn bộ màn hình / Entire Screen**.
2. PH nhập mã tại `/PH.html`, bấm **Vào theo dõi**, sau đó **Xem màn hình** khi HS bắt đầu chia sẻ.
3. HS dừng chia sẻ/đóng trang/đăng xuất/mất kết nối thì ngừng truyền; màn hình PH xóa hình cũ. Phiên chia sẻ mới cần HS cấp quyền lại, PH bấm xem lại.

Nút HS gọi trình chọn màn hình trực tiếp từ thao tác bấm, không bị khóa vì chờ máy chủ sẵn sàng. Nếu bắt được màn hình trước kết nối, chỉ công bố chia sẻ sau khi máy chủ xác nhận; quá thời gian chờ thì dừng luồng. Nếu trình duyệt báo rõ đã chọn cửa sổ/thẻ, hệ thống từ chối và yêu cầu chọn lại; nếu trình duyệt không cung cấp `displaySurface`, vẫn cho phép truyền và nhắc HS tự bảo đảm đã chọn toàn màn hình.

Cần HTTPS trên môi trường thực tế. Thiết bị/trình duyệt không hỗ trợ getDisplayMedia vẫn ôn tập bình thường; không có tính năng tự cấp quyền. Trên Mac cần quyền Ghi màn hình của trình duyệt trong Cài đặt hệ thống. Khi có lỗi, giao diện hiển thị hướng xử lý tương ứng.

PH có thể xem trên điện thoại với giao diện co giãn, video giữ tỉ lệ và nút phóng to; có thể xoay ngang để xem rõ. Tối đa hai thiết bị PH cùng theo dõi mỗi HS. Số thiết bị yêu cầu xem không bảo đảm video đã truyền thành công. Không điều khiển máy, không camera/microphone, không ghi video/lưu ảnh, không gửi lời nhắc trong bản này. Chia sẻ gồm mọi nội dung trên màn hình HS đã chọn, kể cả ngoài trang ôn tập.

Khi không nhận thêm khung hình trong 20 giây, trang PH che hình và báo chờ: có thể màn hình đứng yên hoặc kết nối gián đoạn, không kết luận HS làm việc riêng. Có nút kết nối lại. Bộ đệm ICE hỗ trợ tín hiệu kết nối đến trước SDP.

## Cập nhật trên VPS

```bash
cd /home/u_fptbnmonitoronline_fa061ae2/fptbnmonitor.online
git status --short
git fetch origin
git switch feature/on-tap-phu-huynh
git pull --ff-only
node --check server.js
npm test
```

Nếu có thay đổi chưa lưu, lưu riêng trước khi cập nhật; không reset/clean. Nếu chưa có nhánh local, thay lệnh switch bằng `git switch --track origin/feature/on-tap-phu-huynh`. Nếu node_modules chưa được cài, chạy `npm ci --omit=dev`.

Khởi động lại ứng dụng Node.js trong vPanel, sau đó tải lại `/OT.html` và `/PH.html`. Không cần chạy `build:protected`. Các tài nguyên sửa đổi có mã phiên bản mới để tránh trình duyệt dùng script cũ.

Không cần chạy `parent:account` nữa; script và dependency xác thực mật khẩu PH đã được bỏ. Bảng `ot_parent_accounts` nếu đã tạo từ bản cũ sẽ không được đọc hoặc sửa, không tự xóa dữ liệu DB. Phiên theo dõi chỉ lưu trong RAM tối đa 8 giờ, mất khi khởi động lại Node. Hồ sơ HS được kiểm tra lại mỗi 30 giây; thoát theo dõi thu hồi token ngay.

TURN dùng cấu hình cùng dịch vụ với phân hệ giám sát ở nhánh nguồn. Có thể cấu hình `OT_TURN_URLS` (URL cách nhau bằng dấu phẩy), `OT_TURN_USERNAME`, `OT_TURN_PASSWORD` trong `.env`. Nếu dùng tên miền khác, thêm đúng origin vào `ALLOWED_ORIGINS`. Đường truyền qua Internet cần kiểm tra thực tế.

## Kiểm tra

`npm test` kiểm tra ôn tập cũ; mã có FBN/PH cố định và tự viết hoa; PH vào bằng mã không cần mật khẩu/bảng DB phụ; ràng buộc theo HS, dừng và thu hồi phiên; mô phỏng phía HS với máy chủ sẵn sàng muộn, trình duyệt thiếu displaySurface, chọn sai cửa sổ/thẻ, mất kết nối. Không thay thế kiểm thử trình duyệt, MySQL và TURN thực tế.

Trước khi sử dụng rộng: thử một HS trên máy tính và PH trên điện thoại qua 4G/5G; cấp quyền Ghi màn hình; đóng tab; dừng từ nút trình duyệt; ngắt mạng; chọn nhầm loại chia sẻ; gõ/dán mã chữ thường; kiểm tra xoay ngang và Safari iPhone.
