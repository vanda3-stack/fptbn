const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(){
 const elements={},intervals=[],host={innerHTML:'',querySelector:s=>elements[s]||(elements[s]={}),querySelectorAll:()=>[],getClientRects:()=>[{}]};
 let result={id:'a',title:'Exam',submitted_at:1000,server_now:1000,score:1,questions:[{q:'Q',o:['A']}],mcq_points:5,essays:[{q:'<script>unsafe</script>'}],essay_answers:['<b>student answer</b>'],essay_marks:null,total_points:null};
 const ctx={document:{getElementById:()=>host,hidden:false,addEventListener(){}},window:{addEventListener(){}},ExamInputGuard:{install(){}},setInterval:fn=>intervals.push(fn),sessionStorage:{setItem(){},removeItem(){},getItem:()=>''},FPTBNConnection:{ot:async()=>({token:'t',data:{attempt:result,exams:[]}})},Date,crypto:{randomUUID:()=> 'id'}};
 vm.createContext(ctx);const source=fs.readFileSync('public/portal/mock-exams.js','utf8').replace(/\}\)\(\);\s*$/, 'globalThis.testAPI={open,list};})();');vm.runInContext(source,ctx);
 return {ctx,host,elements,intervals,setResult:r=>result=r,getResult:()=>result};
}
test('Submitted result refreshes after grading and corrections; pending marks are distinct from zero; content escaped',async()=>{
 const f=fixture();await f.ctx.testAPI.open('/exams/attempts/a');assert(f.host.innerHTML.includes('Chờ giáo viên chấm'));assert(f.host.innerHTML.includes('&lt;script&gt;'));assert(!f.host.innerHTML.includes('<b>student answer</b>'));
 f.setResult({...f.getResult(),essay_marks:[0],total_points:5});await f.intervals[2]();assert(f.host.innerHTML.includes('Giáo viên đã chấm'));assert(f.host.innerHTML.includes('Tổng điểm: 5.00 / 10'));assert(f.host.innerHTML.includes('0.00 / 5.00'));
 f.setResult({...f.getResult(),essay_marks:[4],total_points:9});await f.elements['#resultRefresh'].onclick();assert(f.host.innerHTML.includes('Tổng điểm: 9.00 / 10'));
});
test('Student sees automatic grading label and teacher confirmation replaces it even when score stays the same',async()=>{
 const f=fixture();f.setResult({...f.getResult(),essay_marks:[4],total_points:9,essay_grade_source:'automatic'});await f.ctx.testAPI.open('/exams/attempts/a');assert(f.host.innerHTML.includes('chấm tự động theo từ khóa'));assert(!f.host.innerHTML.includes('Giáo viên đã chấm'));
 f.setResult({...f.getResult(),essay_grade_source:'teacher'});await f.intervals[2]();assert(f.host.innerHTML.includes('Giáo viên đã chấm'));assert(!f.host.innerHTML.includes('chấm tự động theo từ khóa'));
});
