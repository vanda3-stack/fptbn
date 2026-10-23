'use strict';
(()=>{
 let socket=null,currentToken='',stream=null,config=null,peers=new Map(),panel=null,starting=false,generation=0,announced=false,waitTimer=null,previewTimer=null,currentShare=null;
 const el=id=>document.getElementById(id);
 const message=text=>{if(el('familyMessage'))el('familyMessage').textContent=text};
 function closePeers(){for(const p of peers.values())p.close();peers.clear()}
 function stop(notify=true){generation++;clearInterval(previewTimer);previewTimer=null;currentShare=null;clearTimeout(waitTimer);waitTimer=null;if(notify&&socket?.connected)socket.emit('stop');closePeers();if(stream){for(const t of stream.getTracks()){t.onended=null;t.stop()}stream=null}starting=false;announced=false;if(el('familyStart')){el('familyStart').disabled=false;el('familyStop').hidden=false;el('familyStop').disabled=true;el('familyStop').textContent='Dừng chia sẻ'}const video=el('familyLocalVideo');if(video){video.srcObject=null;video.hidden=true}message('Chưa chia sẻ màn hình cho PH.')}
 function previews(count){clearInterval(previewTimer);previewTimer=null;if(!count||!stream)return;
  const frame=()=>{const video=el('familyLocalVideo');if(!stream||!currentShare||!socket?.connected||!video?.videoWidth)return;try{const canvas=document.createElement('canvas'),scale=Math.min(1,960/video.videoWidth);canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);let image=canvas.toDataURL('image/jpeg',.45);if(image.length>80000)image=canvas.toDataURL('image/jpeg',.2);if(image.length<=80000)socket.volatile.emit('preview',{shareId:currentShare,image})}catch{}};
  frame();previewTimer=setInterval(frame,2000);
 }
 function announce(){
  if(!stream||!socket?.connected||!config||announced)return;
  announced=true;const ticket=generation;
  socket.timeout(10000).emit('start',(err,result)=>{
   if(ticket!==generation)return;
   if(err||!result?.shareId){stop();message('Máy chủ chưa xác nhận chia sẻ. Em hãy tải lại trang và thử lại.');return}
   clearTimeout(waitTimer);waitTimer=null;starting=false;currentShare=result.shareId;
   message('Đang chia sẻ toàn màn hình · Chưa có PH xem.');
  });
 }
 async function start(){if(starting||stream)return;starting=true;el('familyStart').disabled=true;const ticket=++generation;let capture;el('familyStop').hidden=false;el('familyStop').disabled=false;el('familyStop').textContent='Hủy yêu cầu chia sẻ';message('Đang chờ chọn màn hình: chọn Toàn bộ màn hình, bấm vào ảnh màn hình rồi bấm Chia sẻ trong hộp thoại trình duyệt.');
  try{
   if(!window.isSecureContext)throw Error('Em cần mở trang bằng HTTPS để chia sẻ màn hình.');
   if(!navigator.mediaDevices?.getDisplayMedia)throw Error('Thiết bị này chưa hỗ trợ chia sẻ toàn màn hình trên trình duyệt. Em có thể ôn tập bình thường hoặc dùng máy tính để chia sẻ.');
   // Keep this call in the click handler, before waiting for any network activity.
   capture=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'monitor',frameRate:{ideal:5,max:8}},audio:false});
   if(ticket!==generation){capture.getTracks().forEach(t=>t.stop());return}
   const track=capture.getVideoTracks()[0];
   if(!track){capture.getTracks().forEach(t=>t.stop());throw Error('Không nhận được hình từ màn hình đã chọn. Em hãy thử lại.')}
   const surface=track.getSettings?.().displaySurface;
   // Some browsers capture correctly without exposing displaySurface metadata.
   if(surface&&surface!=='monitor'){capture.getTracks().forEach(t=>t.stop());throw Error('Em hãy chọn Toàn bộ màn hình / Entire Screen, không chọn cửa sổ hoặc thẻ trình duyệt.');}
   stream=capture;track.onended=()=>stop();el('familyStop').hidden=false;el('familyStop').disabled=false;el('familyStop').textContent='Dừng chia sẻ';const localVideo=el('familyLocalVideo');if(localVideo){localVideo.srcObject=stream;localVideo.hidden=false;localVideo.play().catch(()=>{})}
   message(surface?'Đã chọn toàn màn hình. Đang kết nối chia sẻ…':'Đã nhận màn hình. Trình duyệt không xác nhận loại chia sẻ; hãy bảo đảm em đã chọn Toàn bộ màn hình. Đang kết nối…');
   waitTimer=setTimeout(()=>{if(ticket===generation){stop();message('Chưa kết nối được chức năng chia sẻ. Em hãy tải lại trang và thử lại.')}},15000);
   announce();
  }catch(e){if(ticket!==generation)return;stop();const notices={NotAllowedError:'Em chưa cấp quyền chia sẻ. Nếu dùng Mac, hãy kiểm tra quyền Ghi màn hình dành cho trình duyệt trong Cài đặt hệ thống.',NotReadableError:'Không đọc được màn hình. Em hãy kiểm tra quyền Ghi màn hình của trình duyệt rồi thử lại.',InvalidStateError:'Em hãy bấm trực tiếp nút Chia sẻ khi đang mở trang ôn tập.',AbortError:'Đã hủy chia sẻ. Em có thể bấm chia sẻ lại.'};message(notices[e.name]||e.message)}
 }
 function disconnect(){stop();socket?.disconnect();socket=null;currentToken='';config=null;panel?.remove();panel=null}
 function connect(token){if(socket&&currentToken===token)return;disconnect();currentToken=token;
  panel=document.createElement('section');panel.className='family-panel';panel.innerHTML='<h2>PH đồng hành cùng em</h2><p>Chọn Toàn bộ màn hình để chia sẻ phiên ôn tập. Người nhập đúng Mã HS + PH có thể xem màn hình em chia sẻ, kể cả nội dung ngoài trang này. Hệ thống không ghi video.</p><p id="familyMessage" role="status">Em bấm chia sẻ và chọn Toàn bộ màn hình.</p><div class="toolbar"><button id="familyStart" class="primary">Chia sẻ toàn màn hình cho PH</button><button id="familyStop" disabled>Dừng chia sẻ</button></div><video id="familyLocalVideo" autoplay muted playsinline hidden aria-label="Màn hình máy HS đang chia sẻ"></video><p><a href="/PH.html" target="_blank" rel="noopener">Trang theo dõi dành cho PH ↗</a></p>';
  document.querySelector('header').after(panel);el('familyStart').onclick=start;el('familyStop').onclick=()=>stop();
  if(typeof io!=='function'){message('Chưa tải được chức năng chia sẻ. Em hãy tải lại trang.');return}
  socket=io('/ot-family',{auth:{role:'student',token},reconnection:true});
  socket.on('ready',d=>{config=d.rtcConfig;if(stream)announce();else{el('familyStart').disabled=starting;message('Sẵn sàng. Em bấm chia sẻ và chọn Toàn bộ màn hình.')}});
  socket.on('preview-needed',d=>previews(d.count));
  socket.on('share-replaced',()=>{stop(false);message('Đã dừng chia sẻ vì em bắt đầu chia sẻ ở một tab khác.')});
  socket.on('viewers',d=>{if(stream)message('Đang chia sẻ màn hình · '+d.count+' thiết bị đang yêu cầu xem.')});
  socket.on('watch',async d=>{if(!stream)return;peers.get(d.peer)?.close();let p;try{p=new OTFamilyPeer(socket,d.peer,d.shareId,config,{stream});peers.set(d.peer,p);await p.offer()}catch{p?.close();peers.delete(d.peer);message('Kết nối với PH chưa thành công. PH có thể bấm Kết nối lại.')}});
  socket.on('signal',async d=>{const p=peers.get(d.peer);if(p?.shareId===d.shareId)try{await p.receive(d.kind,d.data)}catch{p.close();peers.delete(d.peer)}});
  socket.on('peer-left',d=>{peers.get(d.peer)?.close();peers.delete(d.peer)});
  socket.on('disconnect',()=>{config=null;stop(false);message('Đã ngừng chia sẻ do mất kết nối. Khi kết nối lại, em cần bấm chia sẻ lại.')});
  socket.on('connect_error',()=>{if(!stream)message('Chưa kết nối được chức năng chia sẻ. Em hãy tải lại trang hoặc báo giáo viên.')});
  socket.on('family-error',text=>{stop(false);message(text)});
 }
 window.OTFamily={connect,disconnect};
 window.addEventListener('pagehide',()=>stop());
})();
