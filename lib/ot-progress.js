'use strict';
// Latest completed attempt per exercise type; never treat keyword matches as semantic grading.
module.exports=function(roster,essays,history){
 const groups=new Map();
 for(const a of history){
  if(!Number.isInteger(a.essay_index)||!essays[a.essay_index]||!['cloze','writing','speech'].includes(a.kind))continue;
  const key=JSON.stringify([a.student_code,a.class_code,a.essay_index]);
  const g=groups.get(key)||{attempts:0};g.attempts++;
  let detail={};try{detail=JSON.parse(a.detail_json||'{}')}catch{}
  if(a.kind==='speech')g.speech_count=(g.speech_count||0)+1;
  g[a.kind]={score:a.score,total:Number(a.total),detail,created_at:a.created_at};groups.set(key,g);
 }
 return roster.flatMap(s=>essays.map((e,i)=>{
  const g=groups.get(JSON.stringify([s.student_code,s.class_code,i]))||{attempts:0},c=g.cloze,w=g.writing,v=g.speech;
  const matched=w&&Array.isArray(w.detail.keyword_matches)?w.detail.keyword_matches.filter(x=>x.matched===true).length:null;
  return {student_code:s.student_code,full_name:s.full_name,class_code:s.class_code,essay:i,question:e.q,attempts:g.attempts,
   cloze_percent:c&&c.total>0?Math.round(Number(c.score)/c.total*100):null,
   writing_matched:matched,writing_total:w?w.total:null,
   speech_attempts:g.speech_count||0,
   speech_matched:v&&Array.isArray(v.detail.keyword_matches)?v.detail.keyword_matches.filter(x=>x.matched===true).length:null,speech_total:v?v.total:null,
   last_practice:[c,w,v].filter(Boolean).map(x=>x.created_at).sort((a,b)=>new Date(b)-new Date(a))[0]||null};
 }));
};

