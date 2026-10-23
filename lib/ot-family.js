'use strict';
const crypto=require('node:crypto');
const accounts=require('./parent-accounts');
module.exports=function mountFamily(app,{db,io,lookup,authenticateStudent}){
 const sessions=new Map(),students=new Map(),limits=new Map(),ns=io.of('/ot-family');
 let ready;
 const schema=()=>ready||(ready=accounts.schema(db).catch(e=>{ready=null;throw e}));
 const rtcConfig={iceServers:[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}]};
 // Match the existing classroom TURN service; environment variables may override it.
 rtcConfig.iceServers.push({urls:(process.env.OT_TURN_URLS||'turn:103.82.26.166:3478?transport=udp,turn:103.82.26.166:3478?transport=tcp').split(','),username:process.env.OT_TURN_USERNAME||'fptbn',credential:process.env.OT_TURN_PASSWORD||'FPTBN2026Turn'});
 const fail=(res,status,message)=>res.status(status).json({success:false,message});
 const bearer=req=>String(req.headers.authorization||'').replace(/^Bearer /,'');
 async function parent(t){
  const session=sessions.get(t);if(!session||session.expires<=Date.now())throw Error('Phiên PH hết hạn. Vui lòng đăng nhập lại.');
  const child=await lookup(session.code);
  const [rows]=await db.query('SELECT password_hash FROM ot_parent_accounts WHERE student_id=?',[child.id]);
  if(!rows.length||rows[0].password_hash!==session.version){sessions.delete(t);throw Error('Tài khoản đã đổi mật khẩu. Đăng nhập lại.')}
  return child;
 }
 app.post('/api/ot/parent/login',async(req,res)=>{
  res.set('Cache-Control','no-store');
  const ip=req.ip||req.socket.remoteAddress;
  let bucket=limits.get(ip);if(!bucket||bucket.until<Date.now()){if(limits.size>=10000&&!bucket)return fail(res,503,'Máy chủ đang bận.');bucket={count:0,until:Date.now()+60000};limits.set(ip,bucket)}
  if(++bucket.count>10)return fail(res,429,'Vui lòng chờ một phút rồi thử lại.');
  const username=String(req.body?.username||'').trim().toUpperCase(),password=req.body?.password;
  if(!/^[A-Z0-9_-]{3,40}PH$/.test(username)||typeof password!=='string'||password.length>128)return fail(res,401,'Tài khoản hoặc mật khẩu không đúng.');
  try{
   await schema();const child=await lookup(username.slice(0,-2));
   const [rows]=await db.query('SELECT password_hash FROM ot_parent_accounts WHERE student_id=?',[child.id]);
   // Equal-cost password check even if this child has no parent account.
   const dummy='0'.repeat(32)+':'+ '0'.repeat(128);
   if(!await accounts.verify(password,rows[0]?.password_hash||dummy)||!rows.length)return fail(res,401,'Tài khoản hoặc mật khẩu không đúng.');
   if(sessions.size>=5000)return fail(res,503,'Máy chủ đang bận.');
   const token=crypto.randomBytes(32).toString('hex');sessions.set(token,{code:child.student_code,version:rows[0].password_hash,expires:Date.now()+8*3600000});
   res.json({success:true,token,student:{full_name:child.full_name,class_code:child.class_code}});
  }catch(e){if(e.status)return fail(res,401,'Tài khoản hoặc mật khẩu không đúng.');console.error('OT parent login:',e.code||e.message);fail(res,503,'Chưa thể đăng nhập. Vui lòng thử lại.')}
 });
 app.post('/api/ot/parent/logout',(req,res)=>{const t=bearer(req);sessions.delete(t);for(const s of ns.sockets.values())if(s.data.token===t)s.disconnect(true);res.set('Cache-Control','no-store').json({success:true})});
 ns.use(async(socket,next)=>{try{
  const {role,token}=socket.handshake.auth||{};if(!['student','parent'].includes(role))throw Error('Vai trò không hợp lệ.');
  const child=await(role==='student'?authenticateStudent(token):parent(token));
  socket.data={role,token,child,share:null};next();
 }catch(e){next(Error(e.message||'Không thể xác thực.'))}});
 function parents(id){return [...ns.sockets.values()].filter(s=>s.data.role==='parent'&&s.data.child.id===id)}
 function status(id){const publisher=students.get(id),share=publisher?.data.share||null;
  for(const p of parents(id))p.emit('status',{sharing:!!share,shareId:share,studentName:p.data.child.full_name,classCode:p.data.child.class_code});
  publisher?.emit('viewers',{count:parents(id).filter(p=>p.data.watching===share&&share).length});
 }
 function stop(s){s.data.share=null;for(const p of parents(s.data.child.id))p.data.watching=null;status(s.data.child.id)}
 ns.on('connection',s=>{
  const {role,child}=s.data;
  if(role==='student'){
   const existing=students.get(child.id);
   if(existing&&existing!==s){s.emit('family-error','Mã HS đang có phiên chia sẻ khác. Hãy đóng phiên đó trước.');s.disconnect(true);return}
   students.set(child.id,s);
  }else if(parents(child.id).length>2){s.emit('family-error','Tối đa hai thiết bị PH cùng theo dõi.');s.disconnect(true);return}
  s.emit('ready',{rtcConfig});status(child.id);
  let count=0,until=Date.now()+10000;
  s.use((_packet,next)=>{if(Date.now()>until){count=0;until=Date.now()+10000}if(++count>250){s.disconnect(true);return}next()});
  s.on('start',ack=>{if(role!=='student')return;if(s.data.share)stop(s);s.data.share=crypto.randomUUID();status(child.id);if(typeof ack==='function')ack({shareId:s.data.share})});
  s.on('stop',()=>{if(role==='student')stop(s)});
  s.on('watch',()=>{if(role!=='parent')return;const publisher=students.get(child.id);if(!publisher?.data.share)return status(child.id);s.data.watching=publisher.data.share;publisher.emit('watch',{peer:s.id,shareId:publisher.data.share});status(child.id)});
  s.on('signal',message=>{
   if(!message||typeof message.peer!=='string')return;
   const target=ns.sockets.get(message.peer),publisher=students.get(child.id);
   if(!target||target.data.child.id!==child.id||target.data.role===role||!publisher?.data.share||message.shareId!==publisher.data.share)return;
   const viewer=role==='parent'?s:target;if(viewer.data.watching!==message.shareId)return;
   const {kind,data}=message;
   if(!['offer','answer','candidate'].includes(kind)||(kind==='offer'&&role!=='student')||(kind==='answer'&&role!=='parent'))return;
   if(JSON.stringify(data||{}).length>64000)return;
   target.emit('signal',{peer:s.id,shareId:message.shareId,kind,data});
  });
  s.on('unwatch',()=>{if(role!=='parent')return;s.data.watching=null;students.get(child.id)?.emit('peer-left',{peer:s.id});status(child.id)});
  s.on('disconnect',()=>{if(role==='student'&&students.get(child.id)===s){students.delete(child.id);stop(s)}else if(role==='parent'){students.get(child.id)?.emit('peer-left',{peer:s.id});status(child.id)}});
 });
 const timer=setInterval(async()=>{
  for(const [t,s]of sessions)if(s.expires<=Date.now())sessions.delete(t);
  for(const [ip,b]of limits)if(b.until<Date.now())limits.delete(ip);
  for(const s of ns.sockets.values())try{await(s.data.role==='student'?authenticateStudent(s.data.token):parent(s.data.token))}catch{s.emit('family-error','Phiên đăng nhập hết hạn hoặc tài khoản đã thay đổi.');s.disconnect(true)}
 },30000);timer.unref();
 return {revokeStudent(token){for(const s of ns.sockets.values())if(s.data.role==='student'&&s.data.token===token)s.disconnect(true)},close(){clearInterval(timer);for(const s of ns.sockets.values())s.disconnect(true);sessions.clear()}};
};
