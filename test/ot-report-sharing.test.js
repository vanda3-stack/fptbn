'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const mount=require('../lib/ot-report-sharing');
function harness(state={}) {
 const routes={},links=new Map(),reportCalls=[];
 const pack={id:'pack-one',teacher_id:7,year_id:2,classes:[10,11],classes_json:'[10,11]',content_json:'{"essays":[]}',title:'Tin 7'};
 const classes=[{id:10,class_code:'7A1'},{id:11,class_code:'7A2'},{id:99,class_code:'9A1'}];
 const db={query:async(sql,args=[])=>{
  if(sql.startsWith('CREATE'))return [[]];
  if(sql.startsWith('SELECT id,class_code'))return [classes.filter(c=>c.class_code===args[0])];
  if(sql.startsWith('INSERT')){const key=args[0]+args[1];if(!links.has(key))links.set(key,{pack_id:args[0],class_id:args[1],token:args[2]});return [{}]}
  if(sql.startsWith('SELECT token'))return [[links.get(args[0]+args[1])].filter(Boolean)];
  if(sql.startsWith('DELETE')){links.delete(args[0]+args[1]);return [{}]}
  if(sql.startsWith('SELECT l.pack_id'))return [[...links.values()].filter(l=>l.token===args[0]).map(l=>({...l,class_code:classes.find(c=>c.id===l.class_id).class_code}))];
  if(sql.startsWith('SELECT * FROM ot_packs'))return [[{...pack,classes_json:JSON.stringify(pack.classes)}]];
  throw Error(sql);
 }};
 const bad=(message,status=400)=>Object.assign(Error(message),{status});
 const wrap=fn=>async(req,res,next)=>{try{await fn(req,res,next)}catch(e){res.status(e.status||500).json({success:false,message:e.message})}};
 const r={};for(const method of ['get','post','delete'])r[method]=(path,...handlers)=>routes[method+' '+path]=handlers;
 const options={r,db,bad,wrap,schema:async()=>{},token:req=>req.headers.authorization.replace('Bearer ',''),teacher:wrap(async(req,res,next)=>{if(req.headers.authorization!=='Bearer teacher')throw bad('Unauthorized',401);return next()}),packFor:async(req,id,owner)=>{assert.equal(owner,true);if(id!==pack.id)throw bad('Forbidden',403);return pack},reportData:async(p,ids,essays)=>{reportCalls.push({ids,essays});return {success:true,title:p.title,rows:[{student_code:'ZERO',full_name:'Chưa ôn',class_code:'7A1',attempts:0},{student_code:'A',attempts:state.count||1}]}}};
 mount(options);
 async function request(method,path,{token='',body={},params={id:'pack-one'},query={}}={}){let status=200,data;const req={body,params,query,headers:{authorization:'Bearer '+token}},res={status(n){status=n;return this},json(v){data=v;return this}};const handlers=routes[method+' '+path].slice();async function next(){if(handlers.length)await handlers.shift()(req,res,next)}await next();return {status,data}}
 return {request,pack,links,reportCalls,remount:()=>mount(options)};
}
test('only pack owner may create class-specific links, repeated creation reuses link',async()=>{
 const h=harness(),path='/teacher/packs/:id/report-link';
 assert.equal((await h.request('post',path,{body:{class_code:'7A1'}})).status,401);
 assert.equal((await h.request('post',path,{token:'teacher',params:{id:'other'},body:{class_code:'7A1'}})).status,403);
 for(const code of ['', '9A1','7A3'])assert.notEqual((await h.request('post',path,{token:'teacher',body:{class_code:code}})).status,200);
 const a=await h.request('post',path,{token:'teacher',body:{class_code:'7A1'}}),b=await h.request('post',path,{token:'teacher',body:{class_code:'7A1'}});
 assert.match(a.data.token,/^[a-f0-9]{64}$/);assert.equal(a.data.token,b.data.token);
});
test('shared report stays in assigned class, reads fresh data after remount, revocation invalidates old links',async()=>{
 const state={count:1},h=harness(state),path='/teacher/packs/:id/report-link';
 const created=await h.request('post',path,{token:'teacher',body:{class_code:'7A1'}}),token=created.data.token;
 assert.equal((await h.request('get','/shared-report',{token:'bad'})).status,404);
 let a=await h.request('get','/shared-report',{token,query:{class_id:11,pack_id:'other'}});
 assert.equal(a.status,200);assert.equal(a.data.rows[0].attempts,0);assert.deepEqual(h.reportCalls.at(-1),{ids:[10],essays:false});assert(!a.data.essay_rows);
 state.count=5;h.remount();a=await h.request('get','/shared-report',{token});assert.equal(a.data.rows[1].attempts,5);
 h.pack.classes=[11];assert.equal((await h.request('get','/shared-report',{token})).status,403);h.pack.classes=[10,11];
 await h.request('delete',path,{token:'teacher',body:{class_code:'7A1'}});
 assert.equal((await h.request('get','/shared-report',{token})).status,404);
 const next=await h.request('post',path,{token:'teacher',body:{class_code:'7A1'}});assert.notEqual(next.data.token,token);
});
test('reader filters zero/low activity, polls every minute and clears revoked report',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),els={};
 const el=id=>els[id]||(els[id]={value:id==='filter'?'all':id==='threshold'?'3':'',hidden:id==='report',textContent:'',innerHTML:'',disabled:false});
 let count=1,revoked=false,poll,requests=[],copied='',onlyQuiz=false;
 const ctx={navigator:{clipboard:{writeText:async text=>{copied=text}}},location:{hash:'#'+'a'.repeat(64)},document:{getElementById:el,hidden:false,addEventListener(){}},setInterval:(fn,ms)=>{assert.equal(ms,60000);poll=fn},fetch:async(url,options)=>{requests.push({url,options});return {ok:!revoked,status:revoked?404:200,json:async()=>revoked?{success:false,message:'Thu hồi'}:{success:true,title:'Ôn tập',class_code:'7A1',updated_at:new Date().toISOString(),rows:[{student_code:'ZERO',full_name:'An',attempts:40,quiz_attempts:0,cloze_attempts:0,writing_attempts:0,speech_attempts:0,flashcard_attempts:40,recall_questions:[{number:1,attempts:0,passed:0,latest:null}]},{student_code:'LOW',full_name:'Bình',attempts:count*2,quiz_attempts:count,writing_attempts:onlyQuiz?0:count,completed_attempts:count,recall_questions:[{number:1,attempts:count,passed:count,latest:{matched:2,total:2,at:'2026-10-28T01:00:00Z'}}]},{student_code:'HIGH',full_name:'Cường',attempts:16,quiz_attempts:8,cloze_attempts:3,writing_attempts:3,speech_attempts:2,completed_attempts:8,recall_questions:[{number:1,attempts:8,passed:8,latest:{matched:2,total:2,at:'2026-10-28T01:00:00Z'}}]}]}}}};
 vm.runInNewContext(fs.readFileSync('public/ot/gvcn-report.js','utf8'),ctx);
 const flush=()=>new Promise(resolve=>setImmediate(resolve));await flush();
 assert.equal(el('report').hidden,false);assert(el('rows').innerHTML.includes('ZERO'));
 el('filter').value='low';el('filter').onchange();assert(el('rows').innerHTML.includes('LOW'));assert(!el('rows').innerHTML.includes('ZERO'));assert(!el('rows').innerHTML.includes('HIGH'));
 el('filter').value='none';el('filter').onchange();assert(el('rows').innerHTML.includes('ZERO'));assert(!el('rows').innerHTML.includes('LOW'));
 count=5;poll();await flush();assert.equal(requests.length,2);el('filter').value='low';el('filter').onchange();assert(!el('rows').innerHTML.includes('LOW'));el('threshold').value='6';el('threshold').oninput();assert(el('rows').innerHTML.includes('LOW'));el('filter').selectedOptions=[{textContent:'Cần ôn lặp lại'}];await el('copy').onclick();assert(copied.includes('HS còn thiếu hoặc ôn dưới 6 lượt'));assert(copied.includes('Bình'));assert(copied.includes('TN 5 lượt; TL 5 lượt'));assert(!copied.includes('Cường'));assert(copied.includes('học thuộc nội dung tự luận'));assert.equal(requests[0].options.headers.Authorization,'Bearer '+'a'.repeat(64));assert(!requests[0].url.includes('a'.repeat(64)));
 onlyQuiz=true;poll();await flush();el('filter').value='missing_essay';el('filter').onchange();assert(el('rows').innerHTML.includes('LOW'));assert(el('rows').innerHTML.includes('Chưa ôn TL'));assert(!el('rows').innerHTML.includes('HIGH'));el('filter').value='low';el('filter').onchange();assert(el('rows').innerHTML.includes('LOW'));revoked=true;poll();await flush();assert.equal(el('report').hidden,true);assert.equal(el('rows').textContent,'');const before=requests.length;poll();await flush();assert.equal(requests.length,before);
});
