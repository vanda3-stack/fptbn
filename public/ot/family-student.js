'use strict';
(()=>{
 let socket=null,currentToken='',stream=null,config=null,peers=new Map(),panel=null,starting=false,generation=0;
 const el=id=>document.getElementById(id);
 const message=text=>{if(el('familyMessage'))el('familyMessage').textContent=text};
 function closePeers(){for(const p of peers.values())p.close();peers.clear()}
 function stop(notify=true){generation++;if(notify&&socket?.connected)socket.emit('stop');closePeers();if(stream){for(const t of stream.getTracks()){t.onended=null;t.stop()}stream=null}starting=false;if(el('familyStart')){el('familyStart').disabled=!config||!socket?.connected;el('familyStop').hidden=true}message('Chưa chia sẻ màn hình cho PH.')}
 async function start(){if(starting||stream||!socket?.connected||!config)return;starting=true;el('familyStart').disabled=true;const ticket=++generation;let capture;
  try{
   if(!navigator.mediaDevices?.getDisplayMedia)throw Error('Thiết bị này chưa hỗ trợ chia sẻ toàn màn hình trên trình duyệt. Em có thể ôn tập bình thường hoặc dùng máy tính để chia sẻ.');
   capture=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'monitor',frameRate:{ideal:5,max:8}},audio:false});
   if(ticket!==generation){capture.getTracks().forEach(t=>t.stop());return}
   const track=capture.getVideoTracks()[0];
   if(track.getSettings().displaySurface!=='monitor'){capture.getTracks().forEach(t=>t.stop());throw Error('Em hãy chọn Toàn bộ màn hình / Entire Screen, không chọn cửa sổ hoặc thẻ trình duyệt.');}
   stream=capture;track.onended=()=>stop();
   socket.timeout(7000).emit('start',(err)=>{if(ticket!==generation)return;if(err){stop();message('Chưa thể bắt đầu chia sẻ. Hãy thử lại.');return}starting=false;el('familyStop').hidden=false;message('Đang chia sẻ toàn màn hình · Chưa có PH xem.')});
  }catch(e){if(ticket!==generation)return;stop();message(e.name==='NotAllowedError'?'Em chưa cấp quyền chia sẻ. Có thể bấm chia sẻ lại.':e.message)}
 }
 function disconnect(){stop();socket?.disconnect();socket=null;currentToken='';config=null;panel?.remove();panel=null}
 function connect(token){if(socket&&currentToken===token)return;disconnect();currentToken=token;
  panel=document.createElement('section');panel.className='family-panel';panel.innerHTML='<h2>PH đồng hành cùng em</h2><p>Chia sẻ toàn màn hình để PH xem phiên ôn tập. PH có thể thấy cả nội dung ngoài trang này trên màn hình em chọn. Hệ thống không ghi video.</p><p id="familyMessage" role="status">Đang kết nối tính năng chia sẻ…</p><div class="toolbar"><button id="familyStart" class="primary" disabled>Chia sẻ toàn màn hình cho PH</button><button id="familyStop" hidden>Dừng chia sẻ</button></div><p><a href="/PH.html" target="_blank" rel="noopener">Trang đăng nhập dành cho PH ↗</a></p>';
  document.querySelector('header').after(panel);el('familyStart').onclick=start;el('familyStop').onclick=()=>stop();
  socket=io('/ot-family',{auth:{role:'student',token},reconnection:true});
  socket.on('ready',d=>{config=d.rtcConfig;el('familyStart').disabled=false;message('Sẵn sàng. Em bấm chia sẻ và chọn Toàn bộ màn hình.')});
  socket.on('viewers',d=>{if(stream)message('Đang chia sẻ toàn màn hình · '+d.count+' thiết bị PH đang yêu cầu xem.')});
  socket.on('watch',async d=>{if(!stream)return;peers.get(d.peer)?.close();const p=new OTFamilyPeer(socket,d.peer,d.shareId,config,{stream});peers.set(d.peer,p);try{await p.offer()}catch{p.close();peers.delete(d.peer);message('Kết nối với PH chưa thành công. PH có thể bấm Xem lại.')}});
  socket.on('signal',async d=>{const p=peers.get(d.peer);if(p?.shareId===d.shareId)try{await p.receive(d.kind,d.data)}catch{p.close();peers.delete(d.peer)}});
  socket.on('peer-left',d=>{peers.get(d.peer)?.close();peers.delete(d.peer)});
  socket.on('disconnect',()=>{config=null;stop(false);message('Đã ngừng chia sẻ do mất kết nối. Khi kết nối lại, em cần bấm chia sẻ lại.')});
  socket.on('connect_error',e=>{message('Chưa kết nối được chia sẻ: '+e.message)});
  socket.on('family-error',text=>{stop(false);message(text)});
 }
 window.OTFamily={connect,disconnect};
 window.addEventListener('pagehide',()=>stop());
})();
