'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),scores=require('../lib/ot-report-scores');
const roster=[{student_code:'A',class_code:'9A3'},{student_code:'B',class_code:'9A3'}];
const content={questions:[{}],essays:[{ideas:['a','b']},{ideas:['c','d']}]};
const a=(kind,checks,extra={})=>({student_code:'A',class_code:'9A3',kind,essay_index:0,detail_json:JSON.stringify({text:'PRIVATE',keyword_matches:checks.map(matched=>({matched}))}),...extra});
test('scores use latest submitted quiz and latest part 3 per question, missing questions count zero',()=>{
 const history=[a('quiz',[],{score:10,total:10}),a('writing',[true,true]),a('quiz',[],{score:2,total:4}),a('writing',[true,false]),a('cloze',[true,true])];
 let rows=scores(roster,content,history);assert.equal(rows[0].latest_quiz_score,5);assert.equal(rows[0].part3_essay_score,2.5);assert.equal(rows[0].part3_questions_done,1);assert.equal(rows[1].part3_essay_score,null);assert.equal(rows[1].latest_quiz_score,null);assert(!JSON.stringify(rows).includes('PRIVATE'));
 history.push(a('speech',[true,true],{essay_index:1}));rows=scores(roster,content,history);assert.equal(rows[0].part3_essay_score,7.5);
});
test('other class and old unknown evidence cannot become a score; zero remains zero',()=>{
 const rows=scores(roster,content,[a('writing',[true,true],{class_code:'OTHER'}),a('writing',[]),a('quiz',[],{score:0,total:4})]);assert.equal(rows[0].part3_essay_score,null);assert.equal(rows[0].latest_quiz_score,0);
});
