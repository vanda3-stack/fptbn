'use strict';
(()=>{
 const el=id=>document.getElementById(id);let socket=null,peer=null,config=null,shareId=null,wanted=false,lastFrames=0,lastAt=0,checkBusy=false;
 const status=text=>el('parentStatus').textContent=text;
 function blank(text){peer?.close();peer=null;el('childScreen').srcObject=null;el('childScreen').hidden=true;el('screenPlaceholder').hidden=false;el('screenPlaceholder').textContent=text;el('expand').disabled=true;lastAt=0;el('lastFrame').textContent=''}
 function unwatch(){wanted=false;socket?.emit('unwatch');blank('Đã dừng xem. Bấm Xem màn hình để kết nối lại.');el('unwatch').hidden=true}
 function logout(){const t=sessionStorage.getItem('ot-parent-token');if(t)fetch('/api/ot/parent/logout',{method:'POST',headers:{Authorization:'Bearer '+t}}).catch(()=>{});socket?.disconnect();socket=null;sessionStorage.removeItem('ot-parent-token');blank('');el('parentLogin').hidden=false;el('parentDashboard').hidden=true;el('parentLogout').hidden=true}
 function connect(token){el('parentLogin').hidden=true;el('parentDashboard').hidden=false;el('parentLogout').hidden=false;status('Đang xác thực và kết nối…');
  socket=io('/ot-family',{auth:{role:'parent',token}});
  socket.on('ready',d=>{config=d.rtcConfig});
  socket.on('status',d=>{
   el('childName').textContent=d.studentName;el('childClass').textContent='Lớp '+d.classCode;el('watch').disabled=!d.sharing;el('watch').textContent=wanted?'Kết nối lại':'Xem màn hình';
   if(!d.sharing){shareId=null;wanted=false;blank('Con chưa chia sẻ hoặc đã kết thúc phiên chia sẻ.');el('unwatch').hidden=true;status('Chưa có màn hình đang chia sẻ.');return}
   if(shareId!==d.shareId){blank('Con đang chia sẻ. Bấm Xem màn hình để theo dõi.');wanted=false;el('unwatch').hidden=true;status('Con đã bắt đầu chia sẻ màn hình.');shareId=d.shareId}
  });
  socket.on('signal',async d=>{if(!wanted||d.shareId!==shareId)return;
   try{if(d.kind==='offer'){
    blank('Đang kết nối màn hình…');
    peer=new OTFamilyPeer(socket,d.peer,d.shareId,config,{onstream:stream=>{el('childScreen').srcObject=stream;el('childScreen').hidden=false;el('screenPlaceholder').hidden=true;el('expand').disabled=false;lastAt=Date.now();lastFrames=0;el('childScreen').play().catch(()=>status('Chạm vào màn hình để phát.'));},onstate:state=>{if(state==='connected')status('Đang nhận màn hình trực tiếp.');else if(['failed','disconnected','closed'].includes(state)){el('childScreen').hidden=true;el('screenPlaceholder').hidden=false;el('screenPlaceholder').textContent='Kết nối bị gián đoạn. Bấm Kết nối lại.';status('Không nhận được hình trực tiếp.');el('expand').disabled=true;}}});
   }if(peer?.peer===d.peer)await peer.receive(d.kind,d.data);
   }catch{blank('Chưa nhận được màn hình. Bấm Kết nối lại.');status('Kết nối chưa thành công.')}
  });
  socket.on('disconnect',()=>{shareId=null;wanted=false;blank('Mất kết nối máy chủ. Đang thử kết nối lại…');el('watch').disabled=true;el('unwatch').hidden=true;status('Mất kết nối máy chủ.')});
  socket.on('connect_error',e=>{blank('Không thể kết nối.');status(e.message);if(/hết hạn|mật khẩu|xác thực|Mã HS/.test(e.message)){logout();el('parentError').textContent=e.message}});
  socket.on('family-error',text=>{logout();el('parentError').textContent=text});
 }
 el('parentForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;el('parentError').textContent='';try{
  const res=await fetch('/api/ot/parent/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:el('parentUsername').value,password:el('parentPassword').value})});const d=await res.json();if(!res.ok||!d.success)throw Error(d.message||'Không thể đăng nhập.');el('parentPassword').value='';sessionStorage.setItem('ot-parent-token',d.token);connect(d.token);
 }catch(e){el('parentError').textContent=e.message}finally{b.disabled=false}};
 el('parentLogout').onclick=logout;
 el('watch').onclick=()=>{if(!socket?.connected||!shareId)return;blank('Đang kết nối màn hình…');wanted=true;el('watch').textContent='Kết nối lại';el('unwatch').hidden=false;status('Đang kết nối màn hình…');socket.emit('watch')};
 el('unwatch').onclick=unwatch;
 el('expand').onclick=async()=>{try{if(el('screenStage').requestFullscreen)await el('screenStage').requestFullscreen();else if(el('childScreen').webkitEnterFullscreen)el('childScreen').webkitEnterFullscreen()}catch{status('Hãy xoay ngang điện thoại để xem rõ hơn.')}};
 el('childScreen').onclick=()=>el('childScreen').play().catch(()=>{});
 setInterval(async()=>{if(!peer||checkBusy)return;checkBusy=true;const current=peer;try{const stats=await current.pc.getStats();if(peer!==current)return;for(const r of stats.values())if(r.type==='inbound-rtp'&&r.kind==='video'){
  const frames=r.framesDecoded||0;if(frames>lastFrames){lastFrames=frames;lastAt=Date.now();el('childScreen').hidden=false;el('screenPlaceholder').hidden=true;el('expand').disabled=false;status('Đang nhận màn hình trực tiếp.')}
  if(lastAt)el('lastFrame').textContent='Hình gần nhất: '+new Date(lastAt).toLocaleTimeString('vi-VN');
  if(lastAt&&Date.now()-lastAt>20000){el('childScreen').hidden=true;el('screenPlaceholder').hidden=false;el('screenPlaceholder').textContent='Chưa nhận thêm hình trong 20 giây. Có thể màn hình đứng yên hoặc kết nối bị gián đoạn.';status('Đang chờ hình mới.');el('expand').disabled=true}
 }}catch{}finally{checkBusy=false}},3000);
 window.addEventListener('pagehide',()=>{socket?.disconnect();blank('Đã ngừng xem.')});
 window.addEventListener('pageshow',e=>{if(e.persisted){socket?.connect();status('Đang kết nối lại…')}});
 const token=sessionStorage.getItem('ot-parent-token');if(token)connect(token);
})();
