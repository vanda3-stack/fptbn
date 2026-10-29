'use strict';
// Verified against De_cuong_GK1_Tin_hoc_9_theo_mau.docx, B, questions 1–3.
// Exact complete answer sets select a rubric; unrelated/edited outlines cannot inherit it.
const pos=(pattern,extra={})=>({pattern,...extra});
const no=(pattern,extra={})=>({pattern,negative:true,...extra});
const c=(label,...rules)=>({label,rules});
const gap='(?:\\s+[a-z0-9]+){0,5}\\s+';
const caution=object=>pos(object,{governor:'canh giac|than trong|kiem chung|xac minh|kiem tra do tin cay'});
const profiles=[
 {id:'tin9-gk1-2026-q1',question:'Em hãy nêu ba khả năng nổi bật của máy tính và hai ứng dụng thực tế trong khoa học kĩ thuật hoặc đời sống.',ideas:[
  {answer:'Tính toán nhanh, bền bỉ và chính xác.',components:[
   c('Tính toán nhanh',pos('(?:tinh toan|xu ly)'+gap+'(?:nhanh|toc do cao)'),pos('toc do (?:tinh toan|xu ly)'+gap+'(?:nhanh|cao)')),
   c('Hoạt động bền bỉ',pos('ben bi|lien tuc khong met moi|khong (?:biet )?met moi|khong biet met')),
   c('Tính toán chính xác',pos('chinh xac|it sai sot|khong sai sot',{excludeContext:'chan doan|tuyen sinh|thong tin'}))]},
  {answer:'Lưu trữ dữ liệu với dung lượng lớn, truy xuất nhanh.',components:[
   c('Lưu trữ lượng dữ liệu lớn',pos('luu (?:tru )?(?:du lieu|thong tin|tep|file)'+gap+'(?:lon|nhieu)'),pos('luu tru'+gap+'(?:lon|nhieu)'),pos('dung luong (?:luu tru )?(?:rat )?lon')),
   c('Truy xuất nhanh',pos('(?:truy xuat|tim kiem|tra cuu|lay lai)'+gap+'nhanh'))]},
  {answer:'Kết nối toàn cầu với tốc độ cao.',components:[
   c('Kết nối trên phạm vi toàn cầu',pos('(?:ket noi|lien lac)'+gap+'(?:toan cau|toan the gioi|khap the gioi|quoc te)')),
   c('Kết nối tốc độ cao',pos('(?:ket noi|truyen (?:du lieu|tin))'+gap+'(?:nhanh|toc do cao)'),pos('toc do cao',{context:'ket noi|toan cau|internet'}))]},
  {answer:'Trong y tế: hỗ trợ chẩn đoán và quản lí hồ sơ người bệnh.',components:[
   c('Hỗ trợ chẩn đoán bệnh',pos('chan doan|phat hien benh|ho tro kham benh')),
   c('Quản lí hồ sơ người bệnh',pos('(?:quan ly|quan li|luu tru)'+gap+'(?:ho so|benh an)',{context:'benh|y te|bac si'}))]},
  {answer:'Trong giao thông: điều khiển xe tự động hoặc hệ thống đèn tín hiệu.',components:[
   c('Ứng dụng trong giao thông',pos('(?:dieu khien|van hanh)'+gap+'(?:xe tu (?:dong|lai)|den (?:tin hieu|giao thong))'),pos('xe tu (?:lai|dong)|(?:quan ly|quan li)'+gap+'den giao thong'))]}
 ]},
 {id:'tin9-gk1-2026-q2',question:'Em cần chọn trường THPT phù hợp với năng lực và sở thích. Hãy nêu cách xác định yêu cầu tìm kiếm và đánh giá thông tin trước khi quyết định.',ideas:[
  {answer:'Xác định yêu cầu: điểm chuẩn, học phí, môn học, khoảng cách và hoạt động của trường.',components:[
   c('Điểm chuẩn',pos('diem chuan|diem tuyen sinh|diem trung tuyen')),
   c('Học phí',pos('hoc phi|chi phi hoc tap')),
   c('Môn học',pos('mon hoc|to hop mon')),
   c('Khoảng cách',pos('khoang cach|duong di|vi tri truong')),
   c('Hoạt động của trường',pos('hoat dong (?:cua )?truong|hoat dong ngoai khoa|cau lac bo'))]},
  {answer:'Kiểm tra tính mới qua ngày đăng và thời gian thông tin đề cập.',components:[
   c('Ngày đăng hoặc cập nhật',pos('ngay dang|ngay cap nhat|thoi diem (?:dang|cap nhat)')),
   c('Thời gian thông tin đề cập',pos('thoi gian (?:thong tin )?de cap|nam (?:tuyen sinh|ap dung)|thoi diem (?:ap dung|de cap)|thoi gian hieu luc'))]},
  {answer:'Kiểm tra tính chính xác bằng cách đối chiếu các nguồn đáng tin cậy.',components:[
   c('Đối chiếu các nguồn',pos('(?:doi chieu|so sanh|kiem chung)'+gap+'nguon')),
   c('Nguồn đáng tin cậy',pos('nguon'+gap+'(?:dang tin cay|uy tin|chinh thong|chinh thuc)'),pos('(?:website|trang web)'+gap+'(?:so giao duc|bo giao duc|nha truong|truong)'))]},
  {answer:'Kiểm tra tính đầy đủ, bảo đảm có các thông tin cần thiết để so sánh trường.',components:[
   c('Thông tin đầy đủ',pos('(?:kiem tra|danh gia|bao dam|dam bao)'+gap+'(?:day du|khong thieu)'),pos('du (?:cac )?thong tin can thiet')),
   c('Dùng thông tin cần thiết để so sánh trường',pos('thong tin can thiet'+gap+'so sanh'),pos('so sanh (?:cac )?truong',{context:'day du|du thong tin|khong thieu'}))]},
  {answer:'Kiểm tra tính sử dụng được rồi chọn, sắp xếp các trường phù hợp theo thứ tự ưu tiên.',components:[
   c('Thông tin sử dụng được hoặc phù hợp mục tiêu',pos('(?:kiem tra|danh gia)'+gap+'(?:su dung duoc|phu hop|lien quan)'),pos('thong tin'+gap+'(?:phu hop|lien quan)')),
   c('Sắp xếp trường theo thứ tự ưu tiên',pos('(?:sap xep|xep hang|chon)'+gap+'(?:uu tien|nguyen vong)'),pos('thu tu uu tien',{context:'truong|nguyen vong'}))]}
 ]},
 {id:'tin9-gk1-2026-q3',question:'Em hãy nêu năm việc nên làm khi sử dụng công nghệ kĩ thuật số và dịch vụ Internet để hạn chế tác động tiêu cực, bảo vệ bản thân và tôn trọng người khác.',ideas:[
  {answer:'Không dùng thiết bị số quá lâu, dành thời gian vận động và trò chuyện với gia đình.',components:[
   c('Sử dụng thiết bị số hợp lí về thời gian',no('(?:dung|su dung)'+gap+'(?:qua lau|qua nhieu|lien tuc nhieu gio)'),pos('(?:han che|gioi han|giam)'+gap+'(?:thoi gian|thiet bi so|dien thoai|may tinh)'),pos('(?:su dung|dung)'+gap+'(?:hop ly|hop li|vua phai|dieu do)')),
   c('Dành thời gian vận động',pos('van dong|tap the duc|choi the thao')),
   c('Trò chuyện với gia đình',pos('(?:tro chuyen|noi chuyen|giao tiep)'+gap+'(?:gia dinh|bo me|nguoi than)'))]},
  {answer:'Không tự ý công khai thông tin, hình ảnh riêng tư của người khác.',components:[
   c('Bảo vệ thông tin hoặc hình ảnh riêng tư của người khác',no('(?:cong khai|dang|chia se|phat tan)'+gap+'(?:thong tin|hinh anh|anh)',{context:'nguoi khac|ban be|cua ban|cua ho',harmfulList:true,consentAware:true}),pos('(?:bao ve|ton trong|giu kin)'+gap+'(?:quyen rieng tu|thong tin rieng tu|hinh anh rieng tu)',{context:'nguoi khac|ban be|cua ban|cua ho'}),pos('(?:cong khai|dang|chia se)'+gap+'(?:thong tin|anh|hinh anh)',{context:'nguoi khac|ban be|cua ban|cua ho',consent:true}))]},
  {answer:'Tôn trọng bản quyền, xin phép khi sử dụng dữ liệu của người khác.',components:[
   c('Tôn trọng bản quyền',pos('ton trong'+gap+'(?:ban quyen|quyen tac gia|quyen so huu)'),no('vi pham'+gap+'(?:ban quyen|quyen tac gia)')),
   c('Xin phép trước khi sử dụng dữ liệu người khác',pos('xin phep|hoi y kien|duoc tac gia cho phep|duoc chu so huu dong y',{context:'su dung|dung du lieu|tai lieu|tac pham|nguoi khac|tac gia|ban quyen'}))]},
  {answer:'Giao tiếp lịch sự; không xúc phạm, bôi nhọ hoặc bắt nạt trên mạng.',components:[
   c('Giao tiếp lịch sự',pos('(?:giao tiep|ung xu|cu xu|trao doi|noi chuyen)'+gap+'(?:lich su|van minh|co van hoa)'),pos('ton trong (?:nguoi khac|moi nguoi|nguoi doi thoai)')),
   c('Không xúc phạm',no('xuc pham|lang ma|si nhuc|ha nhuc|chui boi',{harmfulList:true})),
   c('Không bôi nhọ',no('boi nho|noi xau|vu khong',{harmfulList:true})),
   c('Không bắt nạt',no('bat nat|quay roi|che gieu',{harmfulList:true}))]},
  {answer:'Cảnh giác với liên kết lạ, thông tin chưa kiểm chứng và các lời mời nhận thưởng.',components:[
   c('Cảnh giác liên kết lạ',caution('lien ket la|duong (?:dan|link) la|link la'),no('(?:bam|nhap|mo|truy cap)'+gap+'(?:lien ket la|link la|duong dan la)')),
   c('Kiểm chứng thông tin',caution('thong tin chua kiem chung|tin chua (?:xac minh|kiem chung)|thong tin khong ro nguon'),pos('(?:kiem chung|xac minh)'+gap+'thong tin'),no('(?:tin|chia se|phat tan)'+gap+'thong tin chua kiem chung')),
   c('Cảnh giác lời mời nhận thưởng',caution('(?:loi moi |loi hua |tin nhan )?(?:nhan thuong|trung thuong|nhan qua|tang qua)'),no('(?:lam theo|tin|chuyen tien)'+gap+'(?:nhan thuong|trung thuong|nhan qua)'))]}
 ]}
];
module.exports=profiles;
