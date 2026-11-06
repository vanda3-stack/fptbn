'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const mount=require('../lib/scan'),{validateConfig}=require('../lib/scan-trial');
const configuration=()=>({key:Array(20).fill('A'),point:.25,rubrics:[[],[]]});
async function setup(t,options={}){
 const app=express(),root=fs.mkdtempSync(path.join(os.tmpdir(),'scan-trial-'));
 const feature=mount(app,{root,env:{SCAN_OCR_URL:'http://worker',SCAN_OCR_TOKEN:'private-worker-secret'},teacherTokens:new Map([['teacher',{teacherId:1,createdAt:Date.now()}]]),db:{query:async()=>[[{id:1}]]},...options});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{feature.close();await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});});
 const post=(form,token='teacher')=>fetch('http://127.0.0.1:'+server.address().port+'/api/scan/trial/recognize',{method:'POST',headers:{Authorization:'Bearer '+token},body:form});
 return {post,feature};
}
function form(c=configuration(),faces=1,valid=true){
 const f=new FormData();f.append('configuration',JSON.stringify(c));
 for(let i=0;i<faces;i++)f.append('pages',new Blob([valid?Buffer.from([255,216,255,0]):Buffer.from('invalid')],{type:'image/jpeg'}),'page.jpg');return f;
}
test('trial validates actual OCR limits and never accepts impossible point totals',()=>{
 assert.equal(validateConfig(configuration()).key.length,20);
 for(const c of [{...configuration(),key:['A']},{...configuration(),point:.6},{...configuration(),rubrics:[[{text:'x',points:6}],[]]},{...configuration(),rubrics:[[{text:'x',points:'1'}],[]]}])assert.throws(()=>validateConfig(c));
});
test('trial requires ordinary teacher auth and configured OCR, without a public bypass',async t=>{
 let calls=0;const {post}=await setup(t,{env:{},fetcher:async()=>{calls++;}});
 assert.equal((await post(form(),'')).status,401);
 const res=await post(form());assert.equal(res.status,503);assert.match((await res.json()).message,/VietOCR/);assert.equal(calls,0);
});
test('one and two face trial sends only images to the configured worker, no persistence or guessed marks',async t=>{
 const sent=[];
 const {post,feature}=await setup(t,{fetcher:async(url,options)=>{
   assert.equal(url,'http://worker/recognize');assert.equal(options.headers.Authorization,'Bearer private-worker-secret');
   const payload=JSON.parse(options.body);sent.push(payload);assert.deepEqual(Object.keys(payload).sort(),['layout','pages']);
   return Response.json({engine:'VietOCR/test',fields:{q1:{text:'A'},q2:{text:'AB'},essay1:{text:'Một ý khác'}}});
 }});
 const c={...configuration(),rubrics:[[{text:'Ý chuẩn',points:1}],[]]};
 for(const faces of [1,2]){
   const res=await post(form(c,faces));assert.equal(res.status,200);const d=await res.json();
   assert.equal(d.quiz.length,20);assert.equal(d.quiz[0].answer,'A');assert.equal(d.quiz[0].uncertain,true);
   assert.equal(d.quiz[1].answer,'');assert.equal(d.quiz[19].answer,'');assert.equal(d.essays[0].ideas[0].score,null);
   assert.equal(sent.at(-1).pages.length,faces);
 }
 assert.deepEqual(feature.store.exams(1),[]);assert.deepEqual(feature.store.grades(1),[]);
});
test('bad images and worker failures return errors and release trial capacity for retry',async t=>{
 let calls=0;const {post}=await setup(t,{fetcher:async()=>{calls++;if(calls===1)return new Response('',{status:503});return Response.json({fields:{}});}});
 assert.equal((await post(form(configuration(),1,false))).status,400);
 assert.equal((await post(form())).status,502);
 assert.equal((await post(form())).status,200);
});
