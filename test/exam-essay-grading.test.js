const test=require('node:test'),assert=require('node:assert/strict'),grade=require('../lib/exam-essay-grading');
const rubric={questions:[],mcq_points:5,essays:[{q:'E',ideas:['Tạo và sửa','Lưu bài'],keywords:[['tạo','chỉnh sửa'],['lưu tệp']]}]};
test('Auto grade uses all keywords per idea, equal partial credit and Unicode/case/punctuation normalization',()=>{
 const r=grade(rubric,{essays:['TẠO tài liệu, chỉnh sửa; LƯU TỆP.']});assert.deepEqual(r.marks,[5]);assert.deepEqual(r.details[0].checks,[true,true]);
 assert.equal(grade(rubric,{essays:['Tạo tài liệu và chỉnh sửa.']}).marks[0],2.5);
 assert.equal(grade(rubric,{essays:['Tạo tài liệu và lưu tệp.']}).marks[0],2.5);
 assert.equal(grade(rubric,{essays:['']}).marks[0],0);
 assert.equal(grade(rubric,{essays:['taoj chỉnh sửa lưu tệpx']}).marks[0],0);
 assert.equal(grade(rubric,{essays:['tạo chỉnh sửa lưu tệp'.normalize('NFD')]}).marks[0],5);
});
test('Missing rubric stays ungraded rather than turning into zero; empty MCQ-only returns null',()=>{
 for(const keywords of [undefined,[],[[''],['lưu']], [[],['lưu']]])assert.equal(grade({...rubric,essays:[{ideas:['a','b'],keywords}]},{essays:['text']}),null);
 assert.equal(grade({mcq_points:10,essays:[]},{essays:[]}),null);
});
test('Essay-only split remains bounded at ten points and repeated keywords do not inflate score',()=>{
 const essay={ideas:['một ý'],keywords:[['một ý']]};const r=grade({mcq_points:0,essays:[essay,essay,essay]},{essays:['một ý một ý','một ý','một ý']});assert(Math.abs(r.marks.reduce((n,x)=>n+x,0)-10)<1e-9);assert(r.marks.every(x=>x<=10/3));
});
test('Version 2: five ideas at half a point, accepted alternatives, no repeat credit and preserved legacy results',()=>{
 const e={ideas:['1','2','3','4','5'],keywords:[['lưu tệp ~ lưu file'],['máy tính'],['internet'],['dữ liệu'],['an toàn']]};const s={essay_grading_version:2,mcq_points:7.5,essays:[e]};
 const r=grade(s,{essays:['LƯU FILE, máy tính và Internet. Lưu file, internet.']});assert.deepEqual(r.marks,[1.5]);assert.deepEqual(r.details[0].idea_points,[.5,.5,.5,0,0]);
 assert.equal(grade(s,{essays:['lưu tệpx máy tính internet dữ liệu an toàn']}).marks[0],2);
 assert.equal(grade(s,{essays:['không lưu file, máy tính internet']}).details[0].needs_review,true);
 assert.equal(grade({...s,essay_grading_version:undefined},{essays:['lưu file máy tính internet']}).marks[0],1);
});
test('Practice and exam both support accepted alternatives while requiring all keyword groups',()=>{
 const Core=require('../public/ot/core'),e={ideas:['a'],keywords:[['lưu tệp ~ lưu file','máy tính']]};
 assert.equal(Core.keywordCheck(e,['Lưu file trên máy tính'])[0].matched,true);
 assert.equal(Core.keywordCheck(e,['Lưu file'])[0].matched,false);
});
