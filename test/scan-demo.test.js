'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../public/scan/demo-core');
test('keys accept short sequences and numbered answers, preserve order',()=>{
  assert.deepEqual(C.parseKey('a b c d'),['A','B','C','D']);
  assert.deepEqual(C.parseKey('Câu 2: B\nCâu 1. A'),['A','B']);
});
test('keys reject gaps, duplicates and trailing content instead of grading partial key',()=>{
  for(const key of ['1.A 3.C','1.A 1.B','1.A 2.E','1.A hello'])assert.throws(()=>C.parseKey(key));
});
test('unknown, duplicate and absent OCR answers remain pending, not automatic zero',()=>{
  const r=C.normalize({quiz:[{number:1,answer:'A',uncertain:false},{number:2,answer:'B',uncertain:false},{number:2,answer:'B',uncertain:false},{number:3,answer:'D',uncertain:true}]},4,[[],[]]);
  assert.deepEqual(C.score(['A','B','C','D'],.25,r),{total:.25,pending:3,correct:1});
});
test('blank and multiple answers score zero only when explicitly certain',()=>{
  const r=C.normalize({quiz:[{number:1,answer:'BLANK',uncertain:false},{number:2,answer:'MULTIPLE',uncertain:false}]},2,[[],[]]);
  assert.deepEqual(C.score(['A','B'],.25,r),{total:0,pending:0,correct:0});
});
test('malformed or over-maximum essay marks are unresolved, including null and numeric strings',()=>{
  const rubrics=[[{text:'a',points:.5},{text:'b',points:.5},{text:'c',points:.5}],[]];
  const r=C.normalize({quiz:[],essays:[{number:1,text:'abc',ideas:[{index:1,score:null},{index:2,score:1},{index:3,score:'0.5'}]}]},0,rubrics);
  assert.equal(C.score([],1,r).pending,3);
});
test('essay rubric supports decimal comma and computes totals deterministically',()=>{
  const rubric=C.rubric('Ý 1 | 0,5\nÝ 2 | 0.5');
  const r=C.normalize({quiz:[{number:1,answer:'A',uncertain:false}],essays:[{number:1,text:'x',ideas:[{index:1,score:.5},{index:2,score:.25}]}]},1,[rubric,[]]);
  assert.equal(C.score(['A'],.25,r).total,1);
  assert.throws(()=>C.rubric('Ý 1: 0.5'));
});
test('CSV retains leading zero in content and neutralizes spreadsheet formula prefixes',()=>{
  const s=C.csv([{code:'001',score:9.5},{code:'-CMD',score:0}]);
  assert.match(s,/"001","9.5"/);assert.match(s,/"'-CMD","0"/);
});
