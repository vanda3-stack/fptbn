'use strict';
(()=>{
 const el=id=>document.getElementById(id);
 let socket=null,peer=null,config=null,shareId=null,wanted=false,paused=false,lastFrames=0,lastAt=0,checkBusy=false,previewMode=false,fallbackTimer=null,lastPreviewAt=0;
 const status=text=>el('parentStatus').textContent=text;
 function blank(text){clearTimeout(fallbackTimer);fallbackTimer=null;previewMode=false;lastPreviewAt=0;el('childPreview').hidden=true;el('childPreview').removeAttribute('src');peer?.close();peer=null;el('childScreen').srcObject=null;el('childScreen').hidden=true;el('screenPlaceholder').hidden=false;el('screenPlaceholder').textContent=text;el('expand').disabled=true;lastAt=0;el('lastFrame').textContent=''}
 function fallback(){if(!wanted||!shareId||!socket?.connected)return;previewMode=true;socket.emit('request-preview',true);status('Đang yêu cầu ảnh màn hình cập nhật…')}
 function scheduleFallback(){clearTimeout(fallbackTimer);fallbackTimer=setTimeout(fallback,8000)}
 function watch(){if(!socket?.connected||!shareId)return;paused=false;blank('Đang kết nối màn hình…');wanted=true;el('watch').textContent='Kết nối lại';el('unwatch').hidden=false;status('Đang kết nối màn hình của con…');socket.emit('watch');scheduleFallback()}
 function unwatch(){wanted=false;paused=true;socket?.emit('unwatch');blank('Đã dừng xem. Bấm Xem màn hình để kết nối lại.');el('unwatch').hidden=true}
 function logout(){wanted=false;const t=sessionStorage.getItem('ot-parent-token');if(t)fetch('/api/ot/parent/logout',{method:'POST',headers:{Authorization:'Bearer '+t}}).catch(()=>{});socket?.disconnect();socket=null;sessionStorage.removeItem('ot-parent-token');blank('');el('parentLogin').hidden=false;el('parentDashboard').hidden=true;el('parentLogout').hidden=true}
 function videoReceived(stream){el('childScreen').srcObject=stream;el('childScreen').hidden=true;el('screenPlaceholder').hidden=false;el('screenPlaceholder').textContent='Đang chờ hình đầu tiên…';el('expand').disabled=true;lastAt=Date.now();lastFrames=0;el('childScreen').play().catch(()=>status('Chạm vào màn hình để phát.'))}
 function connectionChanged(state){
  if(state==='connected'&&!previewMode)status('Đã kết nối, đang chờ hình…');
  if(['failed','disconnected','closed'].includes(state)){if(!previewMode){el('childScreen').hidden=true;el('screenPlaceholder').hidden=false;el('screenPlaceholder').textContent='Đang thử kết nối lại màn hình…';el('expand').disabled=true}fallback()}
 }
 function connect(token){paused=false;el('parentLogin').hidden=true;el('parentDashboard').hidden=false;el('parentLogout').hidden=false;status('Đang kiểm tra mã và kết nối…');
  socket=io('/ot-family',{auth:{role:'parent',token}});
  socket.on('ready',d=>{config=d.rtcConfig});
  socket.on('status',d=>{
   el('childName').textContent=d.studentName;el('childClass').textContent='Lớp '+d.classCode;el('watch').disabled=!d.sharing;el('watch').textContent=wanted?'Kết nối lại':'Xem màn hình';
   if(!d.sharing){shareId=null;wanted=false;blank('Con chưa chia sẻ hoặc đã kết thúc phiên chia sẻ.');el('unwatch').hidden=true;status('Đang chờ con bắt đầu chia sẻ màn hình.');return}
   if(shareId!==d.shareId){blank('Con đã chia sẻ màn hình.');wanted=false;el('unwatch').hidden=true;shareId=d.shareId;if(!paused)watch()}
  });
  // As on the teacher page, the viewer creates a recvonly offer.
  socket.on('watch',async d=>{
   if(!wanted||d.shareId!==shareId)return;
   try{blank('Đang kết nối màn hình…');scheduleFallback();peer=new OTFamilyPeer(socket,d.peer,d.shareId,config,{receiveOnly:true,onstream:videoReceived,onstate:connectionChanged});await peer.offer()}
   catch{blank('Chưa kết nối được video. Đang thử ảnh cập nhật…');fallback()}
  });
  socket.on('signal',async d=>{const current=peer;if(!wanted||!current||d.shareId!==shareId||current.peer!==d.peer)return;try{await current.receive(d.kind,d.data)}catch{if(peer===current){blank('Chưa kết nối được video. Đang thử ảnh cập nhật…');fallback()}}});
  socket.on('preview',frame=>{if(!wanted||!previewMode||frame.shareId!==shareId)return;lastPreviewAt=Date.now();el('childPreview').src=frame.image;el('childPreview').hidden=false;el('childScreen').hidden=true;el('screenPlaceholder').hidden=true;el('expand').disabled=false;el('lastFrame').textContent='Ảnh nhận lúc: '+new Date(lastPreviewAt).toLocaleTimeString('vi-VN');status('Đang xem ảnh màn hình cập nhật khoảng 2 giây/lần.')});
  socket.on('disconnect',()=>{shareId=null;wanted=false;blank('Mất kết nối máy chủ. Đang thử kết nối lại…');el('watch').disabled=true;el('unwatch').hidden=true;status('Mất kết nối máy chủ.')});
  socket.on('connect_error',e=>{blank('Không thể kết nối.');status(e.message);if(/hết hạn|xác thực|Mã HS/.test(e.message)){logout();el('parentError').textContent=e.message}});
  socket.on('family-error',text=>{logout();el('parentError').textContent=text});
 }
 OTCodes.bind(el('parentUsername'),true);
 el('parentForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;el('parentError').textContent='';try{
  const res=await fetch('/api/ot/parent/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:OTCodes.full(el('parentUsername').value,true)})});const d=await res.json();if(!res.ok||!d.success)throw Error(d.message||'Chưa thể mở theo dõi. Hãy kiểm tra mã.');sessionStorage.setItem('ot-parent-token',d.token);connect(d.token);
 }catch(e){el('parentError').textContent=e.message}finally{b.disabled=false}};
 el('parentLogout').onclick=logout;el('watch').onclick=watch;el('unwatch').onclick=unwatch;
 el('expand').onclick=async()=>{try{if(el('screenStage').requestFullscreen)await el('screenStage').requestFullscreen();else if(!previewMode&&el('childScreen').webkitEnterFullscreen)el('childScreen').webkitEnterFullscreen();else status('Hãy xoay ngang điện thoại để xem rõ hơn.')}catch{status('Hãy xoay ngang điện thoại để xem rõ hơn.')}};
 el('childScreen').onclick=()=>el('childScreen').play().catch(()=>{});
 setInterval(async()=>{
  if(previewMode&&lastPreviewAt&&Date.now()-lastPreviewAt>12000){el('childPreview').hidden=true;el('screenPlaceholder').hidden=false;el('screenPlaceholder').textContent='Đang chờ ảnh mới. Hình cũ đã được ẩn.';status('Chưa nhận thêm ảnh màn hình.')}
  if(!peer||checkBusy)return;checkBusy=true;const current=peer;
  try{const stats=await current.pc.getStats();if(peer!==current)return;for(const r of stats.values())if(r.type==='inbound-rtp'&&(r.kind==='video'||r.mediaType==='video')){
   const frames=r.framesDecoded||0;
   if(frames>lastFrames){lastFrames=frames;lastAt=Date.now();previewMode=false;clearTimeout(fallbackTimer);socket.emit('request-preview',false);el('childPreview').hidden=true;el('childScreen').hidden=false;el('screenPlaceholder').hidden=true;el('expand').disabled=false;status('Đang nhận màn hình trực tiếp.')}
   if(lastAt&&!previewMode)el('lastFrame').textContent='Hình gần nhất: '+new Date(lastAt).toLocaleTimeString('vi-VN');
   if(!previewMode&&lastAt&&Date.now()-lastAt>20000){el('childScreen').hidden=true;el('screenPlaceholder').hidden=false;el('screenPlaceholder').textContent='Chưa nhận thêm hình trong 20 giây.';el('expand').disabled=true;fallback()}
  }}catch{}finally{checkBusy=false}
 },3000);
 window.addEventListener('pagehide',()=>{socket?.disconnect();blank('Đã ngừng xem.')});
 window.addEventListener('pageshow',e=>{if(e.persisted){socket?.connect();status('Đang kết nối lại…')}});
 const token=sessionStorage.getItem('ot-parent-token');if(token)connect(token);
})();
