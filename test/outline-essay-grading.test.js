'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const grade=require('../lib/practice-essay-grading'),profiles=require('../lib/outline-rubrics');
const completion=require('../lib/ot-completion');
// Golden source transcription, independent of matching patterns.
const answers=[[
 'Tính toán nhanh, bền bỉ và chính xác.',
 'Lưu trữ dữ liệu với dung lượng lớn, truy xuất nhanh.',
 'Kết nối toàn cầu với tốc độ cao.',
 'Trong y tế: hỗ trợ chẩn đoán và quản lí hồ sơ người bệnh.',
 'Trong giao thông: điều khiển xe tự động hoặc hệ thống đèn tín hiệu.'
],[
 'Xác định yêu cầu: điểm chuẩn, học phí, môn học, khoảng cách và hoạt động của trường.',
 'Kiểm tra tính mới qua ngày đăng và thời gian thông tin đề cập.',
 'Kiểm tra tính chính xác bằng cách đối chiếu các nguồn đáng tin cậy.',
 'Kiểm tra tính đầy đủ, bảo đảm có các thông tin cần thiết để so sánh trường.',
 'Kiểm tra tính sử dụng được rồi chọn, sắp xếp các trường phù hợp theo thứ tự ưu tiên.'
],[
 'Không dùng thiết bị số quá lâu, dành thời gian vận động và trò chuyện với gia đình.',
 'Không tự ý công khai thông tin, hình ảnh riêng tư của người khác.',
 'Tôn trọng bản quyền, xin phép khi sử dụng dữ liệu của người khác.',
 'Giao tiếp lịch sự; không xúc phạm, bôi nhọ hoặc bắt nạt trên mạng.',
 'Cảnh giác với liên kết lạ, thông tin chưa kiểm chứng và các lời mời nhận thưởng.'
]];
const essay=i=>({q:profiles[i].question,ideas:answers[i],keywords:answers[i].map(()=>['cụm điền khuyết không khớp'])});
const mark=(i,text)=>grade(essay(i),{text});
test('All 15 original ideas score fully, independently of broken cloze-derived keywords',()=>{
 for(let i=0;i<3;i++){
  const g=mark(i,answers[i].join('\n'));assert.equal(g.points,10,'Question '+(i+1));assert.equal(g.needs_review,false);assert.deepEqual(g.idea_points,[2,2,2,2,2]);
  for(let j=0;j<5;j++)assert.equal(grade(essay(i),{texts:answers[i]}).idea_points[j],2);
 }
});
test('Verified common paraphrases for all three questions are recognized',()=>{
 const texts=[
  'Máy tính xử lý rất nhanh, hoạt động bền bỉ và tính toán chính xác. Lưu trữ nhiều dữ liệu và tìm kiếm nhanh. Kết nối khắp thế giới với tốc độ cao. Trong bệnh viện, máy tính giúp chẩn đoán bệnh, lưu trữ bệnh án. Trong giao thông, vận hành xe tự lái.',
  'Tìm điểm tuyển sinh, chi phí học tập, tổ hợp môn, đường đi và câu lạc bộ của trường. Xem ngày cập nhật và năm tuyển sinh. So sánh nhiều nguồn uy tín. Đảm bảo đầy đủ thông tin cần thiết để so sánh các trường. Đánh giá thông tin liên quan và xếp hạng các trường theo nguyện vọng ưu tiên.',
  'Sử dụng điện thoại vừa phải; chơi thể thao; nói chuyện với bố mẹ. Không đăng ảnh của bạn khi chưa được phép. Tôn trọng quyền tác giả, hỏi ý kiến tác giả trước khi sử dụng tác phẩm. Ứng xử văn minh, không lăng mạ, nói xấu hay quấy rối mọi người trên mạng. Thận trọng với link lạ, tin chưa xác minh và tin nhắn trúng thưởng.'
 ];
 for(let i=0;i<3;i++){const g=mark(i,texts[i]);assert.equal(g.points,10,JSON.stringify(g.feedback.filter(f=>f.status!=='correct')))}
});
test('Reordering, case, Unicode, accentless typing and repetition preserve bounds',()=>{
 const text=answers[2].slice().reverse().join('\n');
 for(const s of [text.toUpperCase(),text.normalize('NFD'),text.normalize('NFD').replace(/\p{M}/gu,'').replace(/đ/g,'d'),text+'\n'+text])assert.equal(mark(2,s).points,10);
 const shuffled={...essay(2),ideas:answers[2].slice().reverse()};assert.equal(grade(shuffled,{text}).points,10);
 assert.equal(mark(2,Array(8).fill(answers[2][3]).join('\n')).points,2);
});
test('Missing content earns proportional credit within an idea; either traffic example satisfies the OR',()=>{
 assert.equal(mark(0,'Tính toán nhanh, chính xác.').idea_points[0],4/3);
 assert.equal(mark(2,'Giao tiếp lịch sự.').idea_points[3],.5);
 assert.equal(mark(1,'Điểm chuẩn; học phí.').idea_points[0],.8);
 assert.equal(mark(0,'Điều khiển hệ thống đèn tín hiệu.').idea_points[4],2);
 assert.equal(mark(0,'Điều khiển xe tự động.').idea_points[4],2);
});
test('Screenshot regression: negation of harmful actions is correct, reversed meaning is not',()=>{
 for(const s of [answers[2][3],'Đừng xúc phạm, bôi nhọ hoặc bắt nạt trên mạng. Giao tiếp lịch sự.','Không chỉ giao tiếp lịch sự mà còn không xúc phạm, bôi nhọ hoặc bắt nạt.']){
  const g=mark(2,s);assert.equal(g.idea_points[3],2,s);assert.equal(g.pending,false);
 }
 for(const s of ['Không cần giao tiếp lịch sự. Có thể xúc phạm, bôi nhọ hoặc bắt nạt.','Giao tiếp không lịch sự. Nên xúc phạm, bôi nhọ và bắt nạt.'])assert.equal(mark(2,s).idea_points[3],0,s);
 assert.equal(mark(2,'Không dùng thiết bị số quá lâu. Có thể xúc phạm người khác.').idea_points[3],0);
 assert.equal(mark(2,'Không cần cảnh giác với liên kết lạ, thông tin chưa kiểm chứng và lời mời nhận thưởng.').idea_points[4],0);
 assert.equal(mark(0,'Tính toán không nhanh.').idea_points[0],0);
});
test('Explicit permission is accepted; disclosure without permission and wrong subject are rejected',()=>{
 for(const s of ['Chỉ đăng ảnh người khác khi họ đồng ý.','Không đăng ảnh người khác khi chưa được phép.'])assert.equal(mark(2,s).idea_points[1],2,s);
 assert.equal(mark(2,'Tự ý đăng ảnh của người khác khi chưa được phép.').idea_points[1],0);
 assert.equal(mark(2,'Không công khai thông tin của mình.').idea_points[1],0);
});
test('Lexical negatives and grammatical alternatives do not reverse a correct answer',()=>{
 assert.equal(mark(2,'Giao tiếp lịch sự; không xúc phạm, vu khống hoặc bắt nạt.').idea_points[3],2);
 assert.equal(mark(2,'Giao tiếp khi tranh luận lịch sự; không xúc phạm, bôi nhọ hoặc bắt nạt.').idea_points[3],2);
 assert.equal(mark(2,'Giao tiếp lịch sự là không cần thiết.').idea_points[3],0);
});
test('Open-question examples beyond the supplied sample are flagged for review, not silently rejected',()=>{
 assert.equal(mark(0,'Mô phỏng phản ứng hóa học trong nghiên cứu khoa học.').points,null);
 assert.equal(mark(2,'Dùng mật khẩu mạnh và xác thực hai lớp.').points,null);
});
test('New mock exam snapshots use the same rubric and scale scores, while old snapshots retain their grading',()=>{
 const exam=require('../lib/exam-essay-grading'),s={essay_grading_version:3,mcq_points:7.5,essays:[essay(2)]};
 const g=exam(s,{essays:[answers[2].join('\n')]});assert.equal(g.marks[0],2.5);assert.deepEqual(g.details[0].idea_points,[.5,.5,.5,.5,.5]);
 assert.equal(exam(s,{essays:['Giao tiếp lịch sự.']}).marks[0],.125);
 assert.equal(exam(s,{essays:['Không được không xúc phạm.']}),null);
 assert.equal(exam({...s,essay_grading_version:2},{essays:[answers[2].join('\n')]}).marks[0],0);
});
test('Contradictions, double negations and unclear conditions require confirmation rather than a false numeric score',()=>{
 for(const s of [answers[2].join('\n')+'\nCó thể xúc phạm người khác.','Không được không xúc phạm người khác.','Nếu không giao tiếp lịch sự.']){
  const g=mark(2,s);assert.equal(g.points,null,s);assert.equal(g.pending,true);
  const c=completion('writing',{grading:g,keyword_matches:g.checks.map(matched=>({matched}))},essay(2));assert.equal(c.matched,null);assert.equal(c.completed,false);
 }
});
test('An answer box cannot borrow content from another box; changed or unfamiliar outlines retain legacy grading',()=>{
 const g=grade(essay(2),{texts:answers[2].slice().reverse()});assert(g.points<10);
 const changed={...essay(2),ideas:answers[2].slice()};changed.ideas[3]='Đáp án khác.';
 assert.equal(grade(changed,{text:answers[2].join('\n')}).method,'keywords_v2');
});
test('Fractional scores persist into completion and summary; evidence remains exact original student text',()=>{
 const text='Giao tiếp lịch sự.';const g=mark(2,text),d={grading:g,keyword_matches:g.checks.map(matched=>({matched}))};
 assert.equal(completion('writing',d,essay(2)).matched,.25);
 const r=require('../lib/ot-report-scores')([{student_code:'S',class_code:'C'}],{questions:[],essays:[essay(2)]},[{student_code:'S',class_code:'C',kind:'writing',essay_index:0,detail_json:JSON.stringify(d)}]);
 assert.equal(r[0].part3_essay_score,.5);
 const roster=[{student_code:'S',class_code:'C'}],history=[{student_code:'S',class_code:'C',kind:'writing',essay_index:0,detail_json:JSON.stringify(d),total:5,created_at:'2026-10-28'}];
 const progress=require('../lib/ot-progress')(roster,[essay(2)],history);assert.equal(progress[0].writing_matched,.25);
 history[0].detail_json=JSON.stringify({grading:mark(2,'Không được không xúc phạm.')});
 assert.equal(require('../lib/ot-report-scores')(roster,{questions:[],essays:[essay(2)]},history)[0].part3_essay_score,null);
 assert.equal(require('../lib/ot-progress')(roster,[essay(2)],history)[0].writing_matched,null);
 for(const f of g.feedback)for(const c of f.components)for(const evidence of c.evidence)assert(text.includes(evidence));
});
test('Feedback escapes both student text and rubric labels, keeps partial points and pending distinct from zero',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),ctx={E:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')};vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/ot/essay-student.js','utf8'),ctx);
 ctx.e=essay(2);ctx.d={result:{detail:{grading:mark(2,'Giao tiếp lịch sự <script>alert(1)</script>.' )}}};
 vm.runInContext("essayMethod='writing'",ctx);let html=vm.runInContext('essayFeedback(d,e)',ctx);assert(html.includes('Đạt một phần'));assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('Bài có từ phủ định'));
 ctx.d.result.detail.grading=mark(2,'Không được không xúc phạm.');html=vm.runInContext('essayFeedback(d,e)',ctx);assert(html.includes('Chưa có điểm tổng'));assert(!html.includes('Điểm: 0'));
});
test('Latest two-column writing result keeps partial rubric feedback and pending score without converting null to zero',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),elements={},ctx={E:s=>String(s).replaceAll('<','&lt;'),essayIndex:0,pack:{content:{essays:[essay(2)]}},$:s=>elements[s]||(elements[s]={innerHTML:'',onclick:null})};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/ot/essay-student.js','utf8'),ctx);
 ctx.draft={result:{detail:{grading:mark(2,'Giao tiếp lịch sự.'),keyword_matches:[]}},text:'Giao tiếp lịch sự.'};
 vm.runInContext("essayMethod='writing';essayDrafts={'0:writing':draft};essayResultScreen()",ctx);
 assert(elements['#app'].innerHTML.includes('essay-result-columns'));assert(elements['#app'].innerHTML.includes('Đạt một phần'));assert(elements['#app'].innerHTML.includes('Điểm: 0,5'));
 ctx.draft.result.detail.grading=mark(2,'Không được không xúc phạm.');
 vm.runInContext('essayResultScreen()',ctx);
 const html=elements['#app'].innerHTML;assert(html.includes('Cần xác nhận'));assert(!html.includes('Điểm: 0'));assert(!html.includes('Chúc mừng'));assert(!html.includes('id="essayResultNext"'));
});
