'use strict';
// Deterministic rubric matching. This does not infer meaning or judge correctness.
const normalize=s=>String(s??'').normalize('NFC').toLocaleLowerCase('vi').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
module.exports=function gradeEssay(snapshot,answers){
 const essays=snapshot.essays||[];
 if(!essays.length)return null;
 const maximum=(10-Number(snapshot.mcq_points))/essays.length;
 if(!Number.isFinite(maximum)||maximum<0)return null;
 const details=essays.map((essay,i)=>{
  if(snapshot.essay_grading_version===3){
   const g=require('./outline-essay-grading')(essay,{text:String(answers.essays?.[i]??'')});
   if(g){
    if(g.pending)return null; // A contradiction awaits the teacher, never becomes a numeric zero.
    return {method:g.method,rubric:g.rubric,matched:g.fractions.reduce((a,b)=>a+b,0),total:essay.ideas.length,checks:g.checks,maximum,points:g.points*maximum/10,idea_points:g.idea_points.map(x=>x*maximum/10),feedback:g.feedback,needs_review:false};
   }
  }
  const ideas=essay.ideas,keys=essay.keywords;
  if(!Array.isArray(ideas)||!ideas.length||!Array.isArray(keys)||keys.length!==ideas.length)return null;
  const text=' '+normalize(answers.essays?.[i])+' ',v2=[2,3].includes(snapshot.essay_grading_version);
  const checks=keys.map(group=>{
   if(!Array.isArray(group)||!group.length||group.some(k=>typeof k!=='string'||!normalize(k)))return null;
   return group.every(k=>(v2?k.split('~'):[k]).filter(x=>normalize(x)).some(x=>text.includes(' '+normalize(x)+' ')));
  });
  if(checks.includes(null))return null;
  const matched=checks.filter(Boolean).length;
  // Keep precision for fractions such as 5 points split over three questions.
  return {matched,total:ideas.length,checks,maximum,points:maximum*matched/ideas.length,idea_points:checks.map(ok=>ok?maximum/ideas.length:0),needs_review:v2&&checks.some(Boolean)&&/(?:^| )(?:không|chưa|chẳng)(?: |$)/u.test(text)};
 });
 if(details.includes(null))return null; // Missing rubric is not a zero mark.
 return {method:snapshot.essay_grading_version===3?'outline_v3':snapshot.essay_grading_version===2?'keywords_v2':'keywords_v1',marks:details.map(d=>d.points),details};
};
