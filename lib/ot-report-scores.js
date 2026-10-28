'use strict';
const completion=require('./ot-completion');
// Only return aggregate scores, never answers or keyword details.
module.exports=function(roster,content,history){
 const groups=new Map();
 for(const a of history){
  const key=JSON.stringify([a.student_code,a.class_code]);
  const g=groups.get(key)||{quiz:null,essays:new Map()};
  if(a.kind==='quiz')g.quiz=a;
  if(['writing','speech'].includes(a.kind)&&content.essays[a.essay_index])g.essays.set(a.essay_index,a);
  groups.set(key,g);
 }
 return roster.map(row=>{
  const g=groups.get(JSON.stringify([row.student_code,row.class_code]));
  const q=g?.quiz;
  const quiz=q&&Number(q.total)>0&&q.score!==null?10*Number(q.score)/Number(q.total):null;
  let matched=0,total=0,unknown=false;
  const question_scores=[];
  content.essays.forEach((e,i)=>{
   total+=1;
   const attempts=history.filter(a=>a.student_code===row.student_code&&a.class_code===row.class_code&&a.essay_index===i&&['cloze','writing','speech'].includes(a.kind)).length;
   const item={number:i+1,attempts,score:null};question_scores.push(item);
   const a=g?.essays.get(i);if(!a)return;
   let detail={};try{detail=JSON.parse(a.detail_json)}catch{}
   const s=completion(a.kind,detail,e,a.score,a.total);
   if(s.total!==e.ideas.length||s.matched===null)unknown=true;
   else {matched+=s.matched/s.total;item.score=10*s.matched/s.total;}
  });
  const essay=g?.essays.size&&total&&!unknown?10*matched/total:null;
  return {...row,question_scores,latest_quiz_score:quiz,part3_essay_score:essay,part3_questions_done:g?.essays.size||0,essay_questions:content.essays.length,has_quiz:content.questions.length>0};
 });
};
