const test=require('node:test'),assert=require('node:assert/strict'),aggregate=require('../lib/ot-progress'),fs=require('fs'),vm=require('vm');
const roster=[{student_code:'S1',full_name:'An',class_code:'9A1'},{student_code:'S2',full_name:'Bình',class_code:'9A2'}],essays=[{q:'Câu một'},{q:'Câu hai'}];
test('teacher aggregates latest attempts per question/type, preserves zero attempts, excludes other students and classes',()=>{
 const row=(kind,score,total,detail,extra={})=>({student_code:'S1',class_code:'9A1',essay_index:0,kind,score,total,detail_json:JSON.stringify(detail),created_at:'2026-10-21T01:00:00Z',...extra});
 const history=[row('cloze',4,4,{}),row('cloze',1,4,{}, {created_at:'2026-10-21T02:00:00Z'}),row('writing',null,2,{keyword_matches:[{matched:true},{matched:false}]}),row('cloze',4,4,{}, {class_code:'OLD'}),row('cloze',4,4,{}, {student_code:'OTHER'})];
 const r=aggregate(roster,essays,history);assert.equal(r.length,4);assert.equal(r[0].cloze_percent,25);assert.equal(r[0].writing_matched,1);assert.equal(r[0].attempts,3);assert.equal(r[1].attempts,0);assert.equal(r[2].cloze_percent,null);
});
test('teacher class filter applies to question summary, detail and exported CSV',()=>{
 const els={},app={innerHTML:''};const ctx={report:()=>{},reportRows:[],api(){},E:s=>String(s),$:s=>s==='#app'?app:els[s]||(els[s]={}),dashboard(){},alert(){},URL:{createObjectURL:b=>{ctx.blob=b;return 'blob:test'},revokeObjectURL(){}},Blob,setTimeout(){},document:{createElement:()=>({click(){}})}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/ot/report-ui.js','utf8'),ctx);
 ctx.fixture=aggregate(roster,essays,[]);vm.runInContext("reportEssayRows=fixture;reportSelectedClass='9A1';",ctx);const html=vm.runInContext('essayReportHTML()',ctx);assert(html.includes('S1'));assert(!html.includes('S2'));assert(html.includes('0 / 1'));vm.runInContext('exportEssayCSV()',ctx);return ctx.blob.text().then(csv=>{assert(csv.includes('S1'));assert(!csv.includes('S2'))});
});
test('student has no memory report or history request; API report is teacher-only and checks ownership',()=>{
 const student=fs.readFileSync('public/ot/essay-student.js','utf8'),server=fs.readFileSync('lib/ot.js','utf8');assert(!student.includes('essayProgress'));assert(!student.includes('essayHistory'));assert(!server.includes("r.get('/packs/:id/essay-progress'"));assert(server.includes("r.get('/teacher/packs/:id/report',teacher"));assert(server.includes('packFor(req,req.params.id,true)'));
});
