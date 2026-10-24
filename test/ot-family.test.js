'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),express=require('express'),{Server}=require('socket.io');
const {io:client}=require(require('node:path').join(require.resolve('socket.io'), '../../client-dist/socket.io.js'));
function event(socket,name,predicate=()=>true){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.off(name,done);reject(Error('Timeout: '+name))},2000);function done(data){if(!predicate(data))return;socket.off(name,done);clearTimeout(timer);resolve(data)}socket.on(name,done)})}
const pause=()=>new Promise(r=>setTimeout(r,60));
test('family API and signaling bind parents to their child and revoke ended shares',async()=>{
 const app=express(),server=http.createServer(app),io=new Server(server);app.use(express.json());
 const children={FBN001:{id:1,student_code:'FBN001',full_name:'HS A',class_code:'9A3'},FBN002:{id:2,student_code:'FBN002',full_name:'HS B',class_code:'9A2'}};
 const db={query:async()=>{throw Error('Parent code access must not need a password table')}};
 const lookup=async code=>{if(!children[code])throw Object.assign(Error('Mã HS không hợp lệ'),{status:403});return children[code]};
 const mounted=require('../lib/ot-family')(app,{db,io,lookup,authenticateStudent:t=>lookup(t)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port,sockets=[];
 const post=async(path,body,token)=>{const r=await fetch(url+'/api/ot/parent/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(token||'')},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}};
 async function connect(role,token){const s=client(url+'/ot-family',{auth:{role,token},transports:['websocket'],autoConnect:false,reconnection:false});sockets.push(s);const ready=event(s,'ready');s.connect();await ready;return s}
 try{
  assert.equal((await post('login',{username:'FBN001'})).status,400);
  assert.equal((await post('login',{username:'FBN999PH'})).status,401);
  const a=await post('login',{username:'fbn001ph'}),b=await post('login',{username:'FBN002PH'});assert.equal(a.status,200);assert.equal(b.status,200);
  const invalid=client(url+'/ot-family',{auth:{role:'parent',token:'invalid'},transports:['websocket'],autoConnect:false,reconnection:false});sockets.push(invalid);const denied=event(invalid,'connect_error');invalid.connect();assert.match((await denied).message,/hết hạn/);
  const sa=await connect('student','FBN001'),sb=await connect('student','FBN002'),pa=await connect('parent',a.body.token),pb=await connect('parent',b.body.token);
  const states=[];pa.on('status',s=>states.push(s));const started=await new Promise(r=>sa.emit('start',r));await pause();assert.equal(states.at(-1).shareId,started.shareId);
  let previewsA=0,previewsB=0;pa.on('preview',()=>previewsA++);pb.on('preview',()=>previewsB++);
  const image='data:image/jpeg;base64,YQ==';
  sa.emit('preview',{shareId:started.shareId,image});await pause();assert.equal(previewsA,0);
  let receivedA=0,receivedB=0;pa.on('signal',()=>receivedA++);pb.on('signal',()=>receivedB++);
  let offers=0,otherOffers=0;sa.on('signal',()=>offers++);sb.on('signal',()=>otherOffers++);
  pa.emit('signal',{peer:sa.id,shareId:started.shareId,kind:'offer',data:{type:'offer',sdp:'before watch'}});await pause();assert.equal(offers,0);
  const watching=event(pa,'watch');pa.emit('watch');const w=await watching;assert.equal(w.peer,sa.id);
  const needed=event(sa,'preview-needed',d=>d.count===1);pa.emit('request-preview',true);assert.equal((await needed).count,1);
  const receivedImage=event(pa,'preview');sa.emit('preview',{shareId:started.shareId,image});assert.equal((await receivedImage).image,image);await pause();assert.equal(previewsA,1);assert.equal(previewsB,0);
  sb.emit('preview',{shareId:started.shareId,image});await pause();assert.equal(previewsA,1);
  pa.emit('signal',{peer:sb.id,shareId:started.shareId,kind:'offer',data:{type:'offer',sdp:'other child'}});
  const delivered=event(sa,'signal');pa.emit('signal',{peer:sa.id,shareId:started.shareId,kind:'offer',data:{type:'offer',sdp:'correct child'}});assert.equal((await delivered).data.sdp,'correct child');await pause();assert.equal(otherOffers,0);
  const answered=event(pa,'signal');sa.emit('signal',{peer:pa.id,shareId:started.shareId,kind:'answer',data:{type:'answer',sdp:'student screen'}});assert.equal((await answered).data.sdp,'student screen');assert.equal(receivedA,1);assert.equal(receivedB,0);
  pb.emit('signal',{peer:sa.id,shareId:started.shareId,kind:'offer',data:{sdp:'attack'}});await pause();assert.equal(offers,1);
  sa.emit('stop');await pause();assert.equal(states.at(-1).sharing,false);
  sa.emit('signal',{peer:pa.id,shareId:started.shareId,kind:'answer',data:{sdp:'old'}});await pause();assert.equal(receivedA,1);
  const again=await new Promise(r=>sa.emit('start',r));assert.notEqual(again.shareId,started.shareId);
  const sa2=await connect('student','FBN001');await pause();assert.equal(states.at(-1).shareId,again.shareId);
  const replaced=event(sa,'share-replaced'),newShare=await new Promise(r=>sa2.emit('start',r));await replaced;await pause();assert.equal(states.at(-1).shareId,newShare.shareId);
  sa.disconnect();await pause();assert.equal(states.at(-1).sharing,true);
  const activeWatch=event(pa,'watch');pa.emit('watch');await activeWatch;pa.emit('request-preview',true);await pause();
  sa2.emit('preview',{shareId:again.shareId,image});await pause();assert.equal(previewsA,1);
  const newImage=event(pa,'preview');sa2.emit('preview',{shareId:newShare.shareId,image});await newImage;assert.equal(previewsA,2);
  const left=event(sa2,'peer-left');pa.emit('unwatch');await left;
  const disconnected=event(pa,'disconnect');await post('logout',{},a.body.token);await disconnected;
  const secondStates=[];pb.on('status',s=>secondStates.push(s));await new Promise(r=>sb.emit('start',r));await pause();sb.disconnect();await pause();assert.equal(secondStates.at(-1).sharing,false);
 }finally{for(const s of sockets)s.disconnect();mounted.close();await new Promise(r=>io.close(r));server.close()}
});

test('teacher presence revokes active parent viewing and denies signaling and previews until the class is free', async () => {
 const app=express(),server=http.createServer(app),io=new Server(server);app.use(express.json());
 const child={id:1,student_code:'FBN12345',full_name:'HS',class_code:'9A3'};
 let teacherPresent=false;
 const mounted=require('../lib/ot-family')(app,{io,db:{},lookup:async code=>{assert.equal(code,child.student_code);return child},authenticateStudent:async()=>child,isParentViewingBlocked:()=>teacherPresent});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port,sockets=[];
 async function connect(role,token){const s=client(url+'/ot-family',{auth:{role,token},transports:['websocket'],autoConnect:false,reconnection:false});sockets.push(s);const ready=event(s,'ready');s.connect();await ready;return s}
 try{
  const response=await fetch(url+'/api/ot/parent/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'FBN12345PH'})});
  const login=await response.json(),student=await connect('student','student'),parent=await connect('parent',login.token);
  const started=await new Promise(r=>student.emit('start',r));
  const watching=event(parent,'watch');parent.emit('watch');await watching;
  let offers=0,images=0,watches=0;student.on('signal',()=>offers++);parent.on('preview',()=>images++);parent.on('watch',()=>watches++);
  const denied=event(parent,'status',d=>d.blocked===true),closePeer=event(student,'parent-access',d=>d.blocked===true);
  teacherPresent=true;mounted.refreshAccess();
  const state=await denied;await closePeer;assert.equal(state.sharing,false);assert.equal(state.shareId,null);assert.match(state.message,/đang học trên lớp/);
  parent.emit('watch');parent.emit('request-preview',true);
  parent.emit('signal',{peer:student.id,shareId:started.shareId,kind:'offer',data:{sdp:'blocked'}});
  student.emit('preview',{shareId:started.shareId,image:'data:image/jpeg;base64,YQ=='});
  await pause();assert.equal(offers,0);assert.equal(images,0);assert.equal(watches,0);
  const resumed=event(parent,'status',d=>d.blocked===false&&d.sharing===true);
  teacherPresent=false;mounted.refreshAccess();await resumed;
  // Old viewing authorization was cleared even though the original capture remains available.
  parent.emit('signal',{peer:student.id,shareId:started.shareId,kind:'offer',data:{sdp:'not reauthorized'}});await pause();assert.equal(offers,0);
  const watchingAgain=event(parent,'watch');parent.emit('watch');await watchingAgain;
  const offered=event(student,'signal');parent.emit('signal',{peer:student.id,shareId:started.shareId,kind:'offer',data:{sdp:'resumed'}});assert.equal((await offered).data.sdp,'resumed');
 }finally{for(const s of sockets)s.disconnect();mounted.close();await new Promise(r=>io.close(r));server.close()}
});

test('FBN20310 demo allows many parent sessions while ordinary children keep the two-device limit', async () => {
 const app=express(),server=http.createServer(app),io=new Server(server);app.use(express.json());
 const lookup=async code=>({id:code==='FBN20310'?1:2,student_code:code,full_name:'Demo',class_code:'9A3'});
 const mounted=require('../lib/ot-family')(app,{io,lookup,authenticateStudent:lookup,attentionHistory:require('../lib/family-attention-history')()});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port,sockets=[];
 const login=async username=>{const r=await fetch(url+'/api/ot/parent/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username})});return {status:r.status,...await r.json()}};
 const open=(token)=>{const s=client(url+'/ot-family',{auth:{role:'parent',token},transports:['websocket'],autoConnect:false,reconnection:false});sockets.push(s);return s};
 try{
  // A shared event Wi-Fi must allow more than ten demo logins in a minute.
  const tokens=[];for(let i=0;i<12;i++){const r=await login('FBN20310PH');assert.equal(r.status,200);tokens.push(r.token)}
  for(const token of tokens){const s=open(token),ready=event(s,'ready');s.connect();await ready}
  assert.equal(sockets.filter(s=>s.connected).length,12);
  // Signing out one session does not revoke the other audience members.
  await fetch(url+'/api/ot/parent/logout',{method:'POST',headers:{Authorization:'Bearer '+tokens[0]}});await pause();
  assert.equal(sockets.filter(s=>s.connected).length,11);
  for(let i=0;i<3;i++){const r=await login('FBN12345PH'),s=open(r.token);const result=event(s,i<2?'ready':'family-error');s.connect();const message=await result;if(i===2)assert.match(message,/hai thiết bị/)}
  // Demo traffic has a separate bucket and cannot exhaust ordinary PH logins.
  for(let i=0;i<7;i++)assert.equal((await login('FBN12345PH')).status,200);
  assert.equal((await login('FBN12345PH')).status,429);
 }finally{for(const s of sockets)s.disconnect();mounted.close();await new Promise(r=>io.close(r));server.close()}
});

