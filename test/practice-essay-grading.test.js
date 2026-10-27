const test=require('node:test'),assert=require('node:assert/strict'),grade=require('../lib/practice-essay-grading'),vm=require('node:vm'),fs=require('node:fs');
const essay={ideas:['Lưu bài','Máy tính','Internet','Dữ liệu','An toàn'],keywords:[['lưu tệp ~ lưu file'],['máy tính'],['internet'],['dữ liệu'],['an toàn']]};
test('Whole answer practice awards half a point per idea, accepts alternatives and does not add points for repetition',()=>{
 const g=grade(essay,{text:'LƯU FILE, máy tính, internet, dữ liệu. Lưu file internet.'});assert.equal(g.points,2);assert.equal(g.maximum,2.5);assert.deepEqual(g.idea_points,[.5,.5,.5,.5,0]);assert.equal(grade(essay,{text:'Trả lời khác'}).points,0);assert.equal(grade(essay,{text:'không lưu file'}).needs_review,true);assert.equal(grade({...essay,keywords:[]},{text:'lưu file'}),null);
});
test('Legacy per-idea inputs cannot borrow keywords from another answer box',()=>{
 assert.equal(grade(essay,{texts:['máy tính','lưu file','internet','dữ liệu','an toàn']}).points,1.5);
});
test('Writing feedback shows total and per-idea points, escapes answer content and leaves cloze feedback intact',()=>{
 const ctx={E:s=>String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;')};vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/ot/essay-student.js','utf8'),ctx);ctx.e={...essay,ideas:['<script>secret</script>',...essay.ideas.slice(1)]};ctx.d={result:{detail:{grading:grade(essay,{text:'lưu file máy tính internet dữ liệu'}),keyword_matches:[true,true,true,true,false].map(matched=>({matched}))}}};
 vm.runInContext("essayMethod='writing'",ctx);const html=vm.runInContext('essayFeedback(d,e)',ctx);assert(html.includes('2,5'));assert(html.includes('Điểm: 2'));assert(html.includes('Chưa khớp · 0 điểm'));assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));
 vm.runInContext("essayMethod='cloze';d.result.score=1;d.result.total=2",ctx);assert(vm.runInContext('essayFeedback(d,e)',ctx).includes('Đúng 1/2 ô'));
});
