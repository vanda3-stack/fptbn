'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),express=require('express'),{Server}=require('socket.io');
const {io:client}=require(require('node:path').join(require.resolve('socket.io'), '../../client-dist/socket.io.js'));
const accounts=require('../lib/parent-accounts');
function event(socket,name){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.off(name,done);reject(Error('Timeout: '+name))},2000);function done(data){clearTimeout(timer);resolve(data)}socket.once(name,done)})}
const pause=()=>new Promise(r=>setTimeout(r,60));
test('parent password hashing uses salted hashes and verifies passwords',async()=>{const a=await accounts.hash('password-test-2026'),b=await accounts.hash('password-test-2026');assert.notEqual(a,b);assert(await accounts.verify('password-test-2026',a));assert(!await accounts.verify('wrong',a));assert(!await accounts.verify('wrong','invalid'))});
test('family API and signaling bind parents to their child and revoke ended shares',async()=>{
 const app=express(),server=http.createServer(app),io=new Server(server);app.use(express.json());
 const children={FBN001:{id:1,student_code:'FBN001',full_name:'HS A',class_code:'9A3'},FBN002:{id:2,student_code:'FBN002',full_name:'HS B',class_code:'9A2'}};
 const hashes=new Map([[1,await accounts.hash('Parent-secret-001')],[2,await accounts.hash('Parent-secret-002')]]);
 const db={query:async(sql,args)=>{if(sql.startsWith('CREATE'))return [[]];if(sql.startsWith('SELECT password_hash'))return [[{password_hash:hashes.get(args[0])}]];throw Error(sql)}};
 const lookup=async code=>{if(!children[code])throw Object.assign(Error('Mã HS không hợp lệ'),{status:403});return children[code]};
 const mounted=require('../lib/ot-family')(app,{db,io,lookup,authenticateStudent:t=>lookup(t)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port,sockets=[];
 const post=async(path,body,token)=>{const r=await fetch(url+'/api/ot/parent/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(token||'')},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}};
 async function connect(role,token){const s=client(url+'/ot-family',{auth:{role,token},transports:['websocket'],autoConnect:false,reconnection:false});sockets.push(s);const ready=event(s,'ready');s.connect();await ready;return s}
 try{
  assert.equal((await post('login',{username:'FBN001PH',password:'wrong'})).status,401);
  const a=await post('login',{username:'FBN001PH',password:'Parent-secret-001'}),b=await post('login',{username:'FBN002PH',password:'Parent-secret-002'});assert.equal(a.status,200);assert.equal(b.status,200);
  const invalid=client(url+'/ot-family',{auth:{role:'parent',token:'invalid'},transports:['websocket'],autoConnect:false,reconnection:false});sockets.push(invalid);const denied=event(invalid,'connect_error');invalid.connect();assert.match((await denied).message,/hết hạn/);
  const sa=await connect('student','FBN001'),sb=await connect('student','FBN002'),pa=await connect('parent',a.body.token),pb=await connect('parent',b.body.token);
  const states=[];pa.on('status',s=>states.push(s));const started=await new Promise(r=>sa.emit('start',r));await pause();assert.equal(states.at(-1).shareId,started.shareId);
  let receivedA=0,receivedB=0;pa.on('signal',()=>receivedA++);pb.on('signal',()=>receivedB++);
  sa.emit('signal',{peer:pa.id,shareId:started.shareId,kind:'offer',data:{type:'offer',sdp:'before watch'}});await pause();assert.equal(receivedA,0);
  const watching=event(sa,'watch');pa.emit('watch');const w=await watching;assert.equal(w.peer,pa.id);
  sa.emit('signal',{peer:pb.id,shareId:started.shareId,kind:'offer',data:{type:'offer',sdp:'other child'}});
  const delivered=event(pa,'signal');sa.emit('signal',{peer:pa.id,shareId:started.shareId,kind:'offer',data:{type:'offer',sdp:'correct child'}});assert.equal((await delivered).data.sdp,'correct child');await pause();assert.equal(receivedB,0);
  let answerCount=0;sa.on('signal',()=>answerCount++);pb.emit('signal',{peer:sa.id,shareId:started.shareId,kind:'answer',data:{sdp:'attack'}});await pause();assert.equal(answerCount,0);
  sa.emit('stop');await pause();assert.equal(states.at(-1).sharing,false);
  sa.emit('signal',{peer:pa.id,shareId:started.shareId,kind:'offer',data:{sdp:'old'}});await pause();assert.equal(receivedA,1);
  const again=await new Promise(r=>sa.emit('start',r));assert.notEqual(again.shareId,started.shareId);
  const left=event(sa,'peer-left');pa.emit('unwatch');await left;
  const disconnected=event(pa,'disconnect');await post('logout',{},a.body.token);await disconnected;
  const secondStates=[];pb.on('status',s=>secondStates.push(s));await new Promise(r=>sb.emit('start',r));await pause();sb.disconnect();await pause();assert.equal(secondStates.at(-1).sharing,false);
 }finally{for(const s of sockets)s.disconnect();mounted.close();await new Promise(r=>io.close(r));server.close()}
});
