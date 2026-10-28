'use strict';
const profiles=require('./outline-rubrics');
const normalize=s=>String(s??'').replace(/đừng|chớ/giu,'không').replace(/dừng/giu,'ngừng').normalize('NFD').replace(/\p{M}/gu,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/[^a-z0-9,]+/g,' ').trim().replace(/\s+/g,' ');
const fingerprint=s=>normalize(s).replace(/,/g,' ').replace(/\s+/g,' ').trim();
const rx=pattern=>new RegExp('(?<![a-z0-9])(?:'+pattern+')(?![a-z0-9])','g');
const has=(text,p)=>rx(p).test(text);
function profileFor(essay){
 if(!Array.isArray(essay?.ideas))return null;
 const ideas=essay.ideas.map(fingerprint);
 return profiles.find(p=>p.ideas.length===ideas.length&&new Set(ideas).size===ideas.length&&p.ideas.every(i=>ideas.includes(fingerprint(i.answer))))||null;
}
function polarity(text,index,rule){
 let prefix=text.slice(0,index);
 const comma=prefix.lastIndexOf(',');
 if(comma>=0){
  const continuation=prefix.slice(comma+1).trim();
  // Negation carries through an enumerated list of prohibited actions, not a new action.
  if(!rule.harmfulList||!/^((va|hoac|hay|boi nho|noi xau|vu khong|xuc pham|bat nat|lang ma|che gieu)\s*)*$/.test(continuation))prefix=prefix.slice(comma+1);
 }
 prefix=prefix.replace(/\bkhong chi\b/g,'');
 const tail=prefix.split(' ').filter(Boolean).slice(-10).join(' ');
 if(has(tail,'neu|gia su|khong phai|khong the thieu'))return null;
 const lexical=tail.replace(/vu khong|khong gian|tranh luan/g,'');
 const negatives=[...lexical.matchAll(/\b(khong|chua|chang|cam|tranh|ngung)\b/g)];
 if(negatives.length>1)return null;
 return negatives.length===1?-1:1;
}
function evaluateRule(rule,sentence){
 const text=normalize(sentence),results=[];
 if(rule.context&&!has(text,rule.context))return [];
 if(rule.excludeContext&&has(text,rule.excludeContext)&&!has(text,'tinh toan|xu ly'))return [];
 for(const match of text.matchAll(rx(rule.pattern))){
  const consent=has(text,'(?:chi|khi|sau khi)(?:\\s+[a-z0-9]+){0,8}\\s+(?:duoc phep|dong y|cho phep)')&&!has(text,'chua|khong');
  if(rule.consent){
   // Affirmative sharing is accepted only with an explicit permission condition.
   if(!consent)continue;
  }
  let index=match.index;
  if(rule.governor){
   let governors=[...text.matchAll(rx(rule.governor))].filter(m=>!/^(kiem chung|xac minh)$/.test(m[0])||!/(?:chua|khong)\s+$/.test(text.slice(0,m.index)));
   const caution=governors.filter(m=>/^(canh giac|than trong)$/.test(m[0]));
   if(caution.length)governors=caution;
   if(!governors.length)continue;
   // No inference across contrast clauses: sentences were split before evaluation.
   index=governors.sort((a,b)=>Math.abs(a.index-match.index)-Math.abs(b.index-match.index))[0].index;
  }
  let p=polarity(text,index,rule);
  // A negation inside a flexible phrase matters too: 'giao tiếp không lịch sự'.
  // These explicit negative-form aliases have positive meanings in the rubric.
  const inner=match[0].replace(/vu khong|khong gian|tranh luan|khong (?:sai sot|(?:biet )?met moi|biet met|thieu)/g,'');
  const innerNeg=[...inner.matchAll(/\b(?:khong|chua|chang|cam|tranh|ngung)\b/g)].length;
  if(innerNeg&&!rule.governor)p=p===null||p===-1||innerNeg>1?null:-1;
  if(rule.negative&&/^(?:\s+la)?\s+(?:dieu |hanh vi )?khong nen\b/.test(text.slice(match.index+match[0].length)))p=-1;
  if(/^\s+(?:la )?(?:sai|khong can thiet)\b/.test(text.slice(match.index+match[0].length)))p=p===-1?null:-1;
  if(rule.consentAware&&consent)p=-1;
  results.push({ok:p===null?null:p===(rule.negative?-1:1),evidence:sentence.trim()});
 }
 return results;
}
function sentences(text){return text.split(/[.!?;\n]+|\bnhưng\b|\btuy nhiên\b|\bnhung\b|\btuy nhien\b/iu).map(s=>s.trim()).filter(Boolean)}
module.exports=function grade(essay,detail){
 const profile=profileFor(essay);if(!profile)return null;
 const texts=typeof detail.text==='string'?essay.ideas.map(()=>detail.text):detail.texts;
 if(!Array.isArray(texts)||texts.length!==essay.ideas.length||texts.some(x=>typeof x!=='string'))return null;
 const feedback=essay.ideas.map((answer,i)=>{
  const idea=profile.ideas.find(x=>fingerprint(x.answer)===fingerprint(answer)),parts=sentences(texts[i]);
  const components=idea.components.map(component=>{
   const hits=component.rules.flatMap(rule=>parts.flatMap(s=>evaluateRule(rule,s)));
   const yes=hits.some(x=>x.ok===true),no=hits.some(x=>x.ok===false),uncertain=hits.some(x=>x.ok===null);
   const status=uncertain||(yes&&no)?'review':yes?'correct':no?'incorrect':'missing';
   return {label:component.label,status,evidence:[...new Set(hits.map(h=>h.evidence))]};
  });
  // These open questions allow other valid examples. Recognized alternatives outside
  // the supplied answer need a teacher rather than being silently marked absent.
  const application=profile.id.endsWith('-q1')&&profile.ideas.indexOf(idea)>=3&&has(normalize(texts[i]),'mo phong|nong nghiep|giao duc|du bao thoi tiet|robot|san xuat|hoc truc tuyen');
  const safety=profile.id.endsWith('-q3')&&has(normalize(texts[i]),'mat khau manh|xac thuc hai lop|khong (?:chia se|cung cap) (?:mat khau|ma otp)|cap nhat phan mem|bao (?:cho )?nguoi lon');
  if((application||safety)&&components.every(c=>c.status==='missing'))components[0].status='review';
  const review=components.some(c=>c.status==='review'),count=components.filter(c=>c.status==='correct').length;
  const fraction=review?null:count/components.length;
  return {status:review?'review':count===components.length?'correct':count?'partial':components.some(c=>c.status==='incorrect')?'incorrect':'missing',fraction,components};
 });
 const fractions=feedback.map(f=>f.fraction),pending=fractions.includes(null),maximum=10,unit=maximum/essay.ideas.length;
 const idea_points=fractions.map(x=>x===null?null:x*unit);
 return {method:'outline_rules_v1',rubric:profile.id,points:pending?null:idea_points.reduce((a,b)=>a+b,0),maximum,idea_points,fractions,checks:fractions.map(x=>x===1),feedback,needs_review:pending,pending};
};
module.exports.profileFor=profileFor;
