'use strict';
(()=>{
 const el=id=>document.getElementById(id);
 let socket=null,peer=null,config=null,shareId=null,wanted=false,blocked=false,previewMode=false,lastAt=0,lastFrames=0,lastPreviewAt=0,checkBusy=false,fallbackTimer=null;
 const status=text=>el('parentStatus').textContent=text;
 function blank(text){clearTimeout(fallbackTimer);fallbackTimer=null;previewMode=false;lastPreviewAt=0;peer?.close();peer=null;const video=el('childScreen');try{if(video.webkitDisplayingFullscreen)video.webkitExitFullscreen?.()}catch{}video.pause();video.srcObject=null;video.hidden=true;el('childPreview').hidden=true;el('childPreview').removeAttribute('src');el('screenPlaceholder').hidden=false;el('screenPlaceholder').textContent=text;lastAt=0;el('screenStage').classList.remove('expanded');if(document.fullscreenElement===el('screenStage'))document.exitFullscreen?.().catch(()=>{})}
 function fallback(){if(blocked||!wanted||!shareId||!socket?.connected)return;previewMode=true;socket.emit('request-preview',true);status('Đang kết nối màn hình…')}
 function scheduleFallback(){clearTimeout(fallbackTimer);fallbackTimer=setTimeout(fallback,8000)}
 function watch(){if(blocked||!socket?.connected||!shareId)return;blank('Đang kết nối màn hình…');wanted=true;socket.emit('watch');scheduleFallback()}
 function logout(){wanted=false;shareId=null;blocked=false;const token=sessionStorage.getItem('ot-parent-token');if(token)fetch('/api/ot/parent/logout',{method:'POST',headers:{Authorization:'Bearer '+token}}).catch(()=>{});socket?.disconnect();socket=null;sessionStorage.removeItem('ot-parent-token');blank('');el('parentLogin').hidden=false;el('parentDashboard').hidden=true;el('parentLogout').hidden=true}
 function videoReceived(stream){if(blocked)return;el('childScreen').srcObject=stream;lastAt=Date.now();lastFrames=0;el('childScreen').play().catch(()=>status('Chạm vào màn hình để phát.'))}
 function connectionChanged(state){if(blocked)return;if(['failed','disconnected','closed'].includes(state))fallback()}
 function connect(token){socket?.disconnect();blocked=false;wanted=false;shareId=null;el('parentLogin').hidden=true;el('parentDashboard').hidden=false;el('parentLogout').hidden=false;status('Đang kết nối…');
  socket=io('/ot-family',OTFamilySocketOptions({role:'parent',token}));
  socket.on('ready',d=>{config=d.rtcConfig});
  socket.on('status',d=>{
   el('childName').textContent=d.studentName;el('childClass').textContent='Lớp '+d.classCode;
   blocked=d.blocked===true;
   if(blocked){wanted=false;shareId=null;blank(d.message||'Con đang học trên lớp, chức năng theo dõi của PH tạm dừng.');status('Con đang học trên lớp');return}
   if(!d.sharing){wanted=false;shareId=null;blank('Đang chờ con chia sẻ màn hình.');status('Con chưa chia sẻ màn hình');return}
   if(shareId!==d.shareId){wanted=false;shareId=d.shareId;watch()}
  });
  socket.on('watch',async d=>{if(blocked||!wanted||d.shareId!==shareId)return;try{blank('Đang kết nối màn hình…');scheduleFallback();peer=new OTFamilyPeer(socket,d.peer,d.shareId,config,{receiveOnly:true,onstream:videoReceived,onstate:connectionChanged});await peer.offer()}catch{fallback()}});
  socket.on('signal',async d=>{const current=peer;if(blocked||!wanted||!current||d.shareId!==shareId||current.peer!==d.peer)return;try{await current.receive(d.kind,d.data)}catch{if(peer===current)fallback()}});
  socket.on('preview',frame=>{if(blocked||!wanted||!previewMode||frame.shareId!==shareId)return;lastPreviewAt=Date.now();el('childPreview').src=frame.image;el('childPreview').hidden=false;el('childScreen').hidden=true;el('screenPlaceholder').hidden=true;status('Đang xem màn hình cập nhật')});
  socket.on('disconnect',()=>{shareId=null;wanted=false;blank('Mất kết nối. Đang tự kết nối lại…');status('Đang kết nối lại…')});
  socket.on('connect_error',e=>{blank('Chưa kết nối được màn hình.');status(e.message);if(/hết hạn|xác thực|Mã HS/.test(e.message)){logout();el('parentError').textContent=e.message}});
  socket.on('family-error',text=>{logout();el('parentError').textContent=text});
 }
 OTCodes.bind(el('parentUsername'),true);
 el('parentForm').onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;el('parentError').textContent='';try{const code=OTCodes.middle(el('parentUsername').value,true);if(!/^\d{5}$/.test(code))throw Error('Vui lòng nhập đủ 5 chữ số của mã học sinh.');const response=await fetch('/api/ot/parent/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:OTCodes.full(code,true)})});const data=await response.json();if(!response.ok||!data.success)throw Error(data.message||'Không thể đăng nhập.');sessionStorage.setItem('ot-parent-token',data.token);connect(data.token)}catch(error){el('parentError').textContent=error.message}finally{button.disabled=false}};
 el('parentLogout').onclick=logout;
 function expand(){const stage=el('screenStage'),video=el('childScreen');if(blocked||(!video.srcObject&&el('childPreview').hidden))return;if(document.fullscreenElement===stage){document.exitFullscreen?.();return}if(stage.classList.contains('expanded')){stage.classList.remove('expanded');return}video.play().catch(()=>{});try{if(stage.requestFullscreen)stage.requestFullscreen().catch(()=>stage.classList.add('expanded'));else if(!previewMode&&video.webkitEnterFullscreen)video.webkitEnterFullscreen();else stage.classList.add('expanded')}catch{stage.classList.add('expanded')}}
 el('screenStage').onclick=expand;el('screenStage').onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();expand()}};
 document.addEventListener('keydown',event=>{if(event.key==='Escape')el('screenStage').classList.remove('expanded')});
 setInterval(async()=>{
  if(blocked)return;
  if(previewMode&&lastPreviewAt&&Date.now()-lastPreviewAt>12000){el('childPreview').hidden=true;el('screenPlaceholder').hidden=false;el('screenPlaceholder').textContent='Đang chờ hình mới…'}
  if(!peer||checkBusy)return;checkBusy=true;const current=peer;
  try{const stats=await current.pc.getStats();if(blocked||peer!==current)return;for(const r of stats.values())if(r.type==='inbound-rtp'&&(r.kind==='video'||r.mediaType==='video')){const frames=r.framesDecoded||0;if(frames>lastFrames){lastFrames=frames;lastAt=Date.now();previewMode=false;clearTimeout(fallbackTimer);socket.emit('request-preview',false);el('childPreview').hidden=true;el('childScreen').hidden=false;el('screenPlaceholder').hidden=true;status('Đang xem màn hình trực tiếp')}if(!previewMode&&lastAt&&Date.now()-lastAt>20000)fallback()}}catch{}finally{checkBusy=false}
 },3000);
 window.addEventListener('pagehide',()=>{wanted=false;socket?.disconnect();blank('Đã ngừng xem.')});window.addEventListener('pageshow',event=>{if(event.persisted)socket?.connect()});
 const token=sessionStorage.getItem('ot-parent-token');if(token)connect(token);
})();
