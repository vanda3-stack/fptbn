const test=require('node:test'),assert=require('node:assert/strict');
const completion=require('../lib/ot-completion'),aggregate=require('../lib/ot-progress');
const matches=(yes,total)=>Array.from({length:total},(_,i)=>({matched:i<yes}));
test('80 percent boundary applies independently to writing and speech, rounded up',()=>{
 for(const kind of ['writing','speech']){
  assert.equal(completion(kind,{keyword_matches:matches(12,15)},{}).completed,true);
  assert.equal(completion(kind,{keyword_matches:matches(11,15)},{}).completed,false);
  assert.equal(completion(kind,{keyword_matches:matches(2,3)},{}).required,3);
  assert.equal(completion(kind,{},{}).completed,false);
 }
});
test('cloze counts whole ideas rather than averaging blank correctness',()=>{
 const essay={ideas:['a','b','c','d','e'],templates:['[[a]] [[b]]','[[c]]','[[d]]','[[e]]','[[f]]']};
 const result=completion('cloze',{checks:[true,false,true,true,true,true],custom:true},essay,5,6);
 assert.equal(result.total,5);assert.equal(result.matched,4);assert.equal(result.completed,true);
 assert.equal(completion('cloze',{},essay,11,15).completed,false);
 assert.equal(completion('cloze',{},essay,12,15).unit,'ô');
});
test('repeated successful attempts count separately; later failure preserves completions and latest result',()=>{
 const roster=[{student_code:'S',class_code:'9A3'}],essays=[{q:'Q'}];
 const history=[12,15,11].map((n,i)=>({student_code:'S',class_code:'9A3',essay_index:0,kind:'writing',total:15,detail_json:JSON.stringify({keyword_matches:matches(n,15)}),created_at:`2026-10-27T0${i}:00:00Z`}));
 const row=aggregate(roster,essays,history)[0];
 assert.equal(row.writing_completed,2);assert.equal(row.writing_attempts,3);assert.equal(row.completed,2);
 assert.equal(row.writing_status.matched,11);assert.equal(row.writing_status.completed,false);
 assert.equal(row.cloze_completed,0);assert.equal(row.speech_completed,0);
});
