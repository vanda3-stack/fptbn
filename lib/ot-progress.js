'use strict';
// Latest completed attempt per exercise type; never treat keyword matches as semantic grading.
module.exports=function(roster,essays,history){
 const groups=new Map();
 for(const a of history){
  if(!Number.isInteger(a.essay_index)||!essays[a.essay_index]||!['cloze','writing'].includes(a.kind))continue;
  const key=JSON.stringify([a.student_code,a.class_code,a.essay_index]);
  const g=groups.get(key)||{attempts:0};g.attempts++;
  let detail={};try{detail=JSON.parse(a.detail_json||'{}')}catch{}
  g[a.kind]={score:a.score,total:Number(a.total),detail,created_at:a.created_at};groups.set(key,g);
 }
 return roster.flatMap(s=>essays.map((e,i)=>{
  const g=groups.get(JSON.stringify([s.student_code,s.class_code,i]))||{attempts:0},c=g.cloze,w=g.writing;
  const matched=w&&Array.isArray(w.detail.keyword_matches)?w.detail.keyword_matches.filter(x=>x.matched===true).length:null;
  return {student_code:s.student_code,full_name:s.full_name,class_code:s.class_code,essay:i,question:e.q,attempts:g.attempts,
   cloze_percent:c&&c.total>0?Math.round(Number(c.score)/c.total*100):null,
   writing_matched:matched,writing_total:w?w.total:null,
   last_practice:w&&(!c||new Date(w.created_at)>=new Date(c.created_at))?w.created_at:c?c.created_at:null};
 }));
};
