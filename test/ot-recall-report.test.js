'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),recall=require('../lib/ot-recall-report');
const roster=[{student_code:'A',class_code:'7A1',full_name:'An'},{student_code:'B',class_code:'7A1',full_name:'Bình'}],essays=[{ideas:['a','b','c','d','e']},{ideas:['a']}];
function attempt(kind,checks,date,extra={}) {return {student_code:'A',class_code:'7A1',essay_index:0,kind,detail_json:JSON.stringify({keyword_matches:checks.map(matched=>({matched})),text:'PRIVATE STUDENT ANSWER'}),created_at:date,...extra};}
test('recall report separates self-recall from cloze/quiz and uses latest evidence, retains unpractised questions',()=>{
 const history=[attempt('writing',[true,true,true,true,true],'2026-10-27T01:00:00Z'),attempt('speech',[true,true,true,true,false],'2026-10-28T01:00:00Z'),attempt('cloze',[true,true,true,true,true],'2026-10-28T02:00:00Z'),attempt('writing',[true,true,true,true,true],'2026-10-28T03:00:00Z',{class_code:'OTHER'}),attempt('writing',[true,true,true,true,true],'2026-10-28T04:00:00Z',{student_code:'OTHER'})];
 const result=recall(roster,essays,history),q=result[0].recall_questions[0];
 assert.equal(q.attempts,2);assert.equal(q.passed,2);assert.equal(q.latest.matched,4);assert.equal(q.latest.total,5);
 assert.equal(result[0].recall_questions[1].attempts,0);assert.equal(result[1].recall_questions[0].latest,null);assert(!JSON.stringify(result).includes('PRIVATE'));
});
test('repeated partial answers are not added together to imply full recall; unknown old records remain unknown',()=>{
 const history=[attempt('writing',[true,true,false,false,false],'2026-10-27T01:00:00Z'),attempt('writing',[false,false,true,true,true],'2026-10-28T01:00:00Z'),attempt('speech',[],'2026-10-28T02:00:00Z')];
 const q=recall(roster,essays,history)[0].recall_questions[0];assert.equal(q.passed,0);assert.equal(q.attempts,3);assert.equal(q.latest.total,0);
});
