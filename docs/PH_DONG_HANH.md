# PH đồng hành cùng HS ôn tập

Nhánh `feature/on-tap-phu-huynh` sao chép trực tiếp từ `feature/on-tap`, commit `f81c14d`. Không tự gộp vào main hoặc triển khai website đang hoạt động.

## Sử dụng

- HS: `/OT.html`, đăng nhập Mã HS như trước. Bấm **Chia sẻ toàn màn hình cho PH**, chọn **Toàn bộ màn hình / Entire Screen**. Nếu chọn cửa sổ/thẻ, hệ thống dừng luồng vừa chọn và yêu cầu chọn lại. Cần HTTPS khi sử dụng thực tế. Không thể tự cấp quyền hoặc giấu thao tác dừng chia sẻ của trình duyệt.
- PH: `/PH.html`, đăng nhập **Mã HS + PH** (ví dụ `FBN12345PH`) và mật khẩu riêng do quản trị cấp. Bấm **Xem màn hình** khi HS chia sẻ. Chỉ được xem HS gắn với tài khoản ở máy chủ; tối đa hai thiết bị PH đồng thời cho mỗi HS.
- Điện thoại của PH: giao diện co giãn, video giữ tỉ lệ, nút phóng to và hỗ trợ xoay ngang. iPhone có thể dùng chế độ phát video toàn màn hình tùy trình duyệt. Đây là xem trên điện thoại; chia sẻ toàn màn hình ở máy HS phụ thuộc thiết bị/trình duyệt. Thiết bị HS không hỗ trợ vẫn ôn tập bình thường.
- HS thấy số thiết bị PH yêu cầu xem. Con số này không đảm bảo thiết bị đã nhận video thành công. PH chỉ xem, không điều khiển máy và không gửi lời nhắc ở phiên bản này.
- Chia sẻ bao gồm mọi nội dung xuất hiện trên màn hình HS chọn, kể cả ngoài trang ôn tập. Không lấy camera, microphone, không ghi video hoặc lưu ảnh màn hình. Bài làm và lịch sử ôn tập cũ vẫn được lưu theo phân hệ ôn tập.
- Dừng chia sẻ/đóng trang/đăng xuất/mất kết nối sẽ kết thúc phiên truyền. Kết nối lại cần HS chủ động cấp quyền chia sẻ lại; PH bấm xem lại. Khi chưa nhận thêm khung hình trong 20 giây, giao diện che video và hiện trạng thái chờ, vì có thể màn hình đứng yên hoặc đường truyền gián đoạn. Không kết luận là HS làm việc riêng.

## Triển khai thử nghiệm trên VPS

Kiểm tra thay đổi tại máy chủ trước khi chuyển nhánh. Nếu có thay đổi chưa lưu, lưu riêng trước; không dùng reset/clean. Bản sao nhánh ôn tập có thể chưa chứa những thay đổi mới hơn trên main.

```bash
cd /home/u_fptbnmonitoronline_fa061ae2/fptbnmonitor.online
git status --short
git fetch origin
git switch --track origin/feature/on-tap-phu-huynh
node --check server.js
npm test
```

Nếu nhánh local đã tồn tại, dùng `git switch feature/on-tap-phu-huynh` và `git pull --ff-only`. Không thêm dependency chạy ứng dụng; nếu VPS chưa có node_modules tương ứng package-lock, chạy `npm ci --omit=dev`. Nhánh này không có lệnh `build:protected`. Khởi động lại ứng dụng Node.js trong vPanel như cách đang vận hành; sau đó kiểm tra `/OT.html` và `/PH.html`.

## Cấp hoặc đặt lại mật khẩu PH

Quản trị thực hiện trên VPS với cấu hình DB `.env` hiện tại. Không có mật khẩu PH mặc định; tài khoản không tự tồn tại chỉ nhờ thêm hậu tố PH. Cấp tài khoản sau khi xác nhận đúng PH của HS qua quy trình nhà trường.

```bash
read -r -p 'Mã HS gốc: ' OT_PARENT_CODE
read -r -s -p 'Mật khẩu riêng của PH (ít nhất 10 ký tự): ' OT_PARENT_PASSWORD
export OT_PARENT_CODE OT_PARENT_PASSWORD
npm run parent:account
unset OT_PARENT_CODE OT_PARENT_PASSWORD
```

Gõ Mã HS gốc, không thêm PH trong lệnh này. Ví dụ mã `FBN12345` tạo tài khoản đăng nhập `FBN12345PH`. Chạy lại cùng mã sẽ đổi mật khẩu; phiên PH cũ bị thu hồi tối đa 30 giây sau. Mật khẩu lưu dạng scrypt với salt ngẫu nhiên. Không gửi mật khẩu trong đường link.

Bảng bổ sung duy nhất: `ot_parent_accounts` (student_id, password_hash, updated_at). Tài khoản DB cần quyền CREATE cho lần đầu. Phiên PH kéo dài tối đa 8 giờ; phiên và thông tin chia sẻ nằm trong RAM, mất khi Node khởi động lại. Đăng xuất PH thu hồi token ngay. Trạng thái HS và tài khoản PH được kiểm tra lại tối đa mỗi 30 giây.

TURN mặc định dùng cấu hình cùng dịch vụ với phân hệ giám sát ở nhánh nguồn. Có thể đặt `OT_TURN_URLS` (nhiều URL cách nhau bằng dấu phẩy), `OT_TURN_USERNAME`, `OT_TURN_PASSWORD` trong `.env` để dùng cấu hình khác. Nếu chạy ở tên miền thử nghiệm khác, thêm đúng origin vào `ALLOWED_ORIGINS` của server. Cần kiểm tra đường truyền TURN thực tế trước khi sử dụng nhiều gia đình đồng thời.

## Kiểm tra

`npm test`: kiểm tra chức năng ôn tập cũ, mật khẩu, đăng nhập PH, xác thực socket, giới hạn tín hiệu theo HS, chỉ truyền khi PH yêu cầu xem, dừng phiên và không phát lại tín hiệu phiên cũ, đăng xuất và mất kết nối. Dùng DB giả lập và kết nối HTTP/Socket.IO thật; chưa xác nhận MySQL production hoặc truyền video qua mạng Internet.

Trước khi mở rộng: thử một HS trên máy tính với PH dùng điện thoại qua 4G/5G; chọn nhầm thẻ/cửa sổ; dừng share bằng nút trình duyệt; đóng tab HS; ngắt mạng; đổi mật khẩu PH; thử tài khoản PH của HS khác; kiểm tra xoay ngang và Safari iPhone. Không có dữ liệu HS mẫu được thêm vào DB.

Luồng đăng nhập HS vẫn giữ cơ chế Mã HS của phân hệ gốc. Mã HS chỉ nhận diện hồ sơ, chưa xác minh danh tính người đang dùng; tính năng này không được dùng làm bằng chứng nhận diện hoặc giám sát thi lấy điểm. PH có mật khẩu riêng và không được chọn/đổi Mã HS đích từ trình duyệt.
