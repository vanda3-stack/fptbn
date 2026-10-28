'use strict';
const completion = require('./ot-completion');
// Return evidence only: no student answers, keywords or model answers leave the server.
module.exports = function recallReport(roster, essays, history) {
 const groups = new Map();
 for (const a of history) {
  if (!['writing','speech'].includes(a.kind) || !Number.isInteger(a.essay_index) || !essays[a.essay_index]) continue;
  const key = JSON.stringify([a.student_code,a.class_code,a.essay_index]);
  const item = groups.get(key) || {attempts:0, passed:0, latest:null};
  let detail; try {detail=JSON.parse(a.detail_json||'{}');} catch {detail={};}
  const status = completion(a.kind,detail,essays[a.essay_index],a.score,a.total);
  item.attempts++; if (status.completed) item.passed++;
  if (!item.latest || new Date(a.created_at) >= new Date(item.latest.at)) item.latest={matched:status.matched,total:status.total,at:a.created_at};
  groups.set(key,item);
 }
 return roster.map(s => ({...s,recall_questions:essays.map((e,index) => {
  const g = groups.get(JSON.stringify([s.student_code,s.class_code,index]));
  return {number:index+1, attempts:g?.attempts||0, passed:g?.passed||0, latest:g?.latest||null};
 })}));
};
