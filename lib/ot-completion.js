'use strict';
const Core=require('../public/ot/core');
// Statistics threshold, not semantic grading of a written or spoken answer.
module.exports=function(kind,detail,essay,score,total){
 let checks=null,unit='ý';
 if((kind==='writing'||kind==='speech')&&detail.grading?.method==='outline_rules_v1'){
  const g=detail.grading,n=essay.ideas.length;
  const valid=!g.pending&&Array.isArray(g.fractions)&&g.fractions.length===n&&g.fractions.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1);
  const matched=valid?g.fractions.reduce((a,b)=>a+b,0):null;
  return {matched,total:n,required:Math.ceil(n*4/5),completed:valid&&matched+1e-9>=n*.8,unit,pending:!valid};
 }
 if(kind==='writing'||kind==='speech'){
  if(Array.isArray(detail.keyword_matches))checks=detail.keyword_matches.map(x=>x?.matched===true);
 }else if(kind==='cloze'){
  if(Array.isArray(detail.idea_checks))checks=detail.idea_checks.map(x=>x===true);
  else if(Array.isArray(detail.checks)&&Array.isArray(essay?.ideas)){
   const custom=essay.templates,generated=essay.ideas.map(s=>Core.cloze(s,Number(detail.level)||2));
   const candidates=detail.custom===false?[generated]:[custom,generated];
   const templates=candidates.find(ts=>Array.isArray(ts)&&ts.length===essay.ideas.length&&ts.flatMap(Core.blanks).length===detail.checks.length);
   if(templates){let offset=0;checks=templates.map(t=>{const n=Core.blanks(t).length,part=detail.checks.slice(offset,offset+n);offset+=n;return n>0&&part.every(x=>x===true)})}
  }
 }
 let matched=checks?checks.filter(Boolean).length:null,count=checks?checks.length:0;
 // Old cloze records may contain only a blank score. Preserve that evidence explicitly.
 if(!checks&&kind==='cloze'&&Number(total)>0&&score!==null&&Number.isFinite(Number(score))){matched=Number(score);count=Number(total);unit='ô'}
 const completed=count>0&&matched>=0&&matched<=count&&matched*5>=count*4;
 return {matched,total:count,required:Math.ceil(count*4/5),completed,unit};
};
