'use strict';
const grade=require('./exam-essay-grading');
module.exports=function(essay,detail){
 const rubric=require('./outline-essay-grading')(essay,detail);
 if(rubric)return rubric;
 if(!Array.isArray(essay?.ideas)||!essay.ideas.length)return null;
 const texts=typeof detail.text==='string'?essay.ideas.map(()=>detail.text):detail.texts;
 if(!Array.isArray(texts)||texts.length!==essay.ideas.length)return null;
 // Each practice idea is worth 0.5; keep legacy per-idea inputs separate.
 const result=grade({essay_grading_version:2,mcq_points:10-essay.ideas.length*.5,
  essays:essay.ideas.map((idea,i)=>({ideas:[idea],keywords:essay.keywords?.[i]?[essay.keywords[i]]:undefined}))},{essays:texts});
 if(!result)return null;
 return {method:result.method,points:result.marks.reduce((n,x)=>n+x,0)*20/essay.ideas.length,maximum:10,
  idea_points:result.marks.map(x=>x*20/essay.ideas.length),checks:result.details.map(d=>d.checks[0]),needs_review:result.details.some(d=>d.needs_review)};
};
