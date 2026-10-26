'use strict';
const crypto=require('node:crypto');
module.exports=function mountFamily(app,{db,io,lookup,authenticateStudent,isParentViewingBlocked=()=>false,attentionHistory}){
 const sessions=new Map(),students=new Map(),limits=new Map(),accessState=new Map(),ns=io.of('/ot-family');
 const rtcConfig={iceServers:[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}]};
 // Match the existing classroom TURN service; environment variables may override it.
 rtcConfig.iceServers.push({urls:(process.env.OT_TURN_URLS||'turn:103.82.26.166:3478?transport=udp,turn:103.82.26.166:3478?transport=tcp').split(','),username:process.env.OT_TURN_USERNAME||'fptbn',credential:process.env.OT_TURN_PASSWORD||'FPTBN2026Turn'});
 const fail=(res,status,message)=>res.status(status).json({success:false,message});
 const bearer=req=>String(req.headers.authorization||'').replace(/^Bearer /,'');
 async function parent(t){
  const session=sessions.get(t);if(!session||session.expires<=Date.now())throw Error('Phiên PH hết hạn. Vui lòng đăng nhập lại.');
  const child=await lookup(session.code);
  return child;
 }
 app.post('/api/ot/parent/login',async(req,res)=>{
  res.set('Cache-Control','no-store');
  const username=String(req.body?.username||'').trim().toUpperCase();
  const ip=(req.ip||req.socket.remoteAddress)+':'+username.slice(0,32);
  let bucket=limits.get(ip);if(!bucket||bucket.until<Date.now()){if(limits.size>=10000&&!bucket)return fail(res,503,'Máy chủ đang bận.');bucket={count:0,until:Date.now()+60000};limits.set(ip,bucket)}
  if(++bucket.count>10)return fail(res,429,'Vui lòng chờ một phút rồi thử lại.');
  if(!/^FBN\d{1,5}PH$/.test(username))return fail(res,400,'Nhập mã HS bắt đầu bằng FBN và kết thúc bằng PH.');
  try{
   const child=await lookup(username.slice(0,-2));
   if(sessions.size>=5000)return fail(res,503,'Máy chủ đang bận.');
   const token=crypto.randomBytes(32).toString('hex');sessions.set(token,{code:child.student_code,expires:Date.now()+8*3600000,attentionSnapshot:attention.captureHistory(child)});
   res.json({success:true,token,student:{full_name:child.full_name,class_code:child.class_code}});
  }catch(e){if(e.status)return fail(res,401,'Mã HS không hợp lệ hoặc chưa có lớp hiện tại.');console.error('OT parent login:',e.code||e.message);fail(res,503,'Chưa thể đăng nhập. Vui lòng thử lại.')}
 });
 app.post('/api/ot/parent/logout',(req,res)=>{const t=bearer(req);sessions.delete(t);for(const s of ns.sockets.values())if(s.data.token===t)s.disconnect(true);attention.clearIfUnobserved();res.set('Cache-Control','no-store').json({success:true})});
 ns.use(async(socket,next)=>{try{
  const {role,token}=socket.handshake.auth||{};if(!['student','parent'].includes(role))throw Error('Vai trò không hợp lệ.');
  const child=await(role==='student'?authenticateStudent(token):parent(token));
  socket.data={role,token,child,device:role==='student'?require('./student-device')(socket.handshake.headers,socket.handshake.auth?.device):'',share:null,attentionSnapshot:role==='parent'?sessions.get(token)?.attentionSnapshot:null};next();
 }catch(e){next(Error(e.message||'Không thể xác thực.'))}});
 function parents(id){return [...ns.sockets.values()].filter(s=>s.data.role==='parent'&&s.data.child.id===id)}
 const blockedMessage='Con đang học trên lớp, chức năng theo dõi của PH tạm dừng.';
 function blocked(child){return Boolean(isParentViewingBlocked(child))}
 function status(id){const publisher=students.get(id),viewers=parents(id),child=publisher?.data.child||viewers[0]?.data.child;
  const denied=child?blocked(child):false,share=denied?null:publisher?.data.share||null;
  for(const p of viewers)p.emit('status',{sharing:!!share,shareId:share,blocked:denied,message:denied?blockedMessage:'',studentName:p.data.child.full_name,classCode:p.data.child.class_code});
  publisher?.emit('viewers',{count:denied?0:viewers.filter(p=>p.data.watching===share&&share).length});
 }
 const injectedHistories=new Map();
 const historyForChild=child=>{
  if(typeof attentionHistory==='function')return attentionHistory(child);
  if(attentionHistory){
   if(!injectedHistories.has(child.student_code))injectedHistories.set(child.student_code,injectedHistories.size===0?attentionHistory:require('./family-attention-history')());
   return injectedHistories.get(child.student_code);
  }
  return require('./family-attention-history')(require('node:path').join(__dirname,'../data/attention',crypto.createHash('sha256').update(child.student_code).digest('hex')+'.json'));
 };
 const attention=require('./family-demo-attention')({parents,blocked,historyForChild,hasObservers:child=>[...sessions.values()].some(session=>session.code===child.student_code&&session.expires>Date.now())});
 app.post('/api/ot/demo-attention',async(req,res)=>{
  const body=req.body||{};
  if(!['visible','hidden','left'].includes(body.visibility)||typeof body.token!=='string'||typeof body.socketId!=='string')return res.sendStatus(400);
  try{const child=await authenticateStudent(body.token);res.set('Cache-Control','no-store').sendStatus(attention.reportHttp(body,child)?204:403)}catch{res.sendStatus(403)}
 });
 const attentionTimer=setInterval(()=>attention.tick(),1000);attentionTimer.unref();
 function previewNeeded(id){const publisher=students.get(id);publisher?.emit('preview-needed',{count:blocked(publisher.data.child)?0:parents(id).filter(p=>p.data.preview&&p.data.watching===publisher.data.share).length})}
 function refreshAccess(){
  attention.refresh();
  const children=new Map([...ns.sockets.values()].map(s=>[s.data.child.id,s.data.child]));
  for(const [id,child]of children){const denied=blocked(child),publisher=students.get(id);
   if(denied){for(const p of parents(id)){p.data.watching=null;p.data.preview=false}}
   if(accessState.get(id)!==denied){publisher?.emit('parent-access',{blocked:denied,message:denied?blockedMessage:''});accessState.set(id,denied)}
   status(id);previewNeeded(id);
  }
  for(const id of accessState.keys())if(!children.has(id))accessState.delete(id);
 }
 function stop(s,reason='stopped'){const wasSharing=!!s.data.share;s.data.share=null;if(students.get(s.data.child.id)!==s)return;students.delete(s.data.child.id);if(wasSharing)attention.sharing(s,reason);for(const p of parents(s.data.child.id)){p.data.watching=null;p.data.preview=false}status(s.data.child.id);s.emit('preview-needed',{count:0})}
 ns.on('connection',s=>{
  const {role,child}=s.data;
  if(role==='parent'&&parents(child.id).length>2){s.emit('family-error','Tối đa hai thiết bị PH cùng theo dõi.');s.disconnect(true);return}
  s.emit('ready',{rtcConfig,demoAttention:true});s.emit('parent-access',{blocked:blocked(child),message:blocked(child)?blockedMessage:''});status(child.id);
  let count=0,until=Date.now()+10000;
  s.use((_packet,next)=>{if(Date.now()>until){count=0;until=Date.now()+10000}if(++count>250){s.disconnect(true);return}next()});
  attention.connect(s);
  s.on('start',ack=>{if(role!=='student')return;const existing=students.get(child.id);if(existing){stop(existing);if(existing!==s)existing.emit('share-replaced')}students.set(child.id,s);s.data.share=crypto.randomUUID();s.data.lastPreview=0;attention.sharing(s,'live');status(child.id);if(typeof ack==='function')ack({shareId:s.data.share})});
  s.on('stop',()=>{if(role==='student')stop(s)});
  // Same direction as the classroom: the viewer offers recvonly video,
  // the student answers with tracks from the screen they have already shared.
  s.on('watch',()=>{if(role!=='parent')return;if(blocked(child))return status(child.id);const publisher=students.get(child.id);if(!publisher?.data.share)return status(child.id);s.data.watching=publisher.data.share;s.data.preview=false;s.emit('watch',{peer:publisher.id,shareId:publisher.data.share});status(child.id);previewNeeded(child.id)});
  s.on('request-preview',enabled=>{if(role!=='parent'||blocked(child))return;const publisher=students.get(child.id);if(!publisher?.data.share||s.data.watching!==publisher.data.share)return;s.data.preview=enabled===true;previewNeeded(child.id)});
  s.on('preview',frame=>{
   if(blocked(child)||role!=='student'||students.get(child.id)!==s||!s.data.share||frame?.shareId!==s.data.share||typeof frame.image!=='string'||frame.image.length>80000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(frame.image))return;
   const viewers=parents(child.id).filter(p=>p.data.preview&&p.data.watching===s.data.share);if(!viewers.length)return;
   const now=Date.now();if(now-s.data.lastPreview<1500)return;s.data.lastPreview=now;
   for(const p of viewers)p.emit('preview',{shareId:s.data.share,image:frame.image});
  });
  s.on('signal',message=>{
   if(blocked(child)||!message||typeof message.peer!=='string')return;
   const target=ns.sockets.get(message.peer),publisher=students.get(child.id);
   if(!target||target.data.child.id!==child.id||target.data.role===role||!publisher?.data.share||message.shareId!==publisher.data.share)return;
   if((role==='student'&&publisher!==s)||(role==='parent'&&publisher!==target))return;
   const viewer=role==='parent'?s:target;if(viewer.data.watching!==message.shareId)return;
   const {kind,data}=message;
   if(!['offer','answer','candidate'].includes(kind)||(kind==='offer'&&role!=='parent')||(kind==='answer'&&role!=='student'))return;
   if(JSON.stringify(data||{}).length>64000)return;
   target.emit('signal',{peer:s.id,shareId:message.shareId,kind,data});
  });
  s.on('unwatch',()=>{if(role!=='parent')return;s.data.watching=null;s.data.preview=false;students.get(child.id)?.emit('peer-left',{peer:s.id});status(child.id);previewNeeded(child.id)});
  s.on('disconnect',()=>{if(role==='student')stop(s,'disconnected');else if(role==='parent'){students.get(child.id)?.emit('peer-left',{peer:s.id});status(child.id);previewNeeded(child.id)}});
 });
 const timer=setInterval(async()=>{
  refreshAccess();
  for(const [t,s]of sessions)if(s.expires<=Date.now())sessions.delete(t);
  attention.clearIfUnobserved();
  for(const [ip,b]of limits)if(b.until<Date.now())limits.delete(ip);
  for(const s of ns.sockets.values())try{await(s.data.role==='student'?authenticateStudent(s.data.token):parent(s.data.token))}catch{s.emit('family-error','Phiên đăng nhập hết hạn hoặc tài khoản đã thay đổi.');s.disconnect(true)}
 },30000);timer.unref();
 return {refreshAccess,revokeStudent(token){for(const s of ns.sockets.values())if(s.data.role==='student'&&s.data.token===token)s.disconnect(true)},close(){clearInterval(attentionTimer);attention.close();clearInterval(timer);for(const s of ns.sockets.values())s.disconnect(true);sessions.clear()}};
};
