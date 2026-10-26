'use strict';
(() => {
 const el=id=>document.getElementById(id),video=el('childScreen'),button=el('parentFloating'),help=el('floatingHelp');
 let floating=null,observer=null,mirror=null,opening=false,generation=0;
 const documentSupported=Boolean(window.documentPictureInPicture?.requestWindow);
 const videoSupported=Boolean(document.pictureInPictureEnabled&&video.requestPictureInPicture);
 const safariSupported=typeof video.webkitSetPresentationMode==='function';
 function nativeActive(){return document.pictureInPictureElement===video||video.webkitPresentationMode==='picture-in-picture'}
 function label(){button.textContent=floating||nativeActive()?'Đóng cửa sổ nổi':'Mở cửa sổ nổi'}
 function clear(text='Đang chờ màn hình mới…'){
  generation++;
  if(mirror){mirror.video.pause();mirror.video.srcObject=null;mirror.video.hidden=true;mirror.image.hidden=true;mirror.image.removeAttribute('src');mirror.placeholder.textContent=text;mirror.placeholder.hidden=false;}
  if(document.pictureInPictureElement===video)document.exitPictureInPicture?.().catch(()=>{});
  if(video.webkitPresentationMode==='picture-in-picture')try{video.webkitSetPresentationMode('inline')}catch{}
 }
 function close(){generation++;observer?.disconnect();observer=null;clear();floating?.close();floating=null;mirror=null;label()}
 function sync(){
  if(!mirror)return;
  mirror.name.textContent=el('childName').textContent+' · '+el('childClass').textContent;
  mirror.status.textContent=el('parentStatus').textContent;
  const alert=el('demoAttention');mirror.alert.hidden=alert.hidden;
  mirror.alert.dataset.level=alert.dataset.level||'waiting';
  mirror.alert.textContent=el('demoAttentionMessage').textContent+' '+el('demoAttentionClock').textContent;
  const live=!video.hidden&&video.srcObject;
  if(mirror.video.srcObject!==(live?video.srcObject:null)){mirror.video.srcObject=live?video.srcObject:null;if(live)mirror.video.play().catch(()=>{})}
  mirror.video.hidden=!live;
  const image=el('childPreview'),src=!image.hidden&&image.getAttribute('src');
  mirror.image.hidden=!src;if(src)mirror.image.src=src;else mirror.image.removeAttribute('src');
  mirror.placeholder.hidden=Boolean(live||src);mirror.placeholder.textContent=el('screenPlaceholder').textContent;
 }
 async function open(){
  if(opening)return;
  if(floating||nativeActive()){close();return}
  opening=true;const ticket=++generation;
  try{
   if(documentSupported){
    // Called directly from the click: the browser requires user activation.
    const win=await window.documentPictureInPicture.requestWindow({width:480,height:390});
    if(ticket!==generation||el('parentDashboard').hidden){win.close();return}
    floating=win;const doc=win.document;doc.title='Màn hình của con · FPTBN';
    const style=doc.createElement('style');style.textContent=':root{color-scheme:dark;font:14px Arial,sans-serif;background:#080f1e;color:#eaf2ff}*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;padding:12px}h1{font-size:16px;margin:0 0 7px}p{line-height:1.5;margin:8px 0;color:#b9cce5}.alert{padding:10px;border-radius:8px;background:#102d26;border-left:4px solid #34d399}.alert[data-level=warning]{background:#422f11;border-color:#e5a737}.alert[data-level=urgent]{background:#481b25;border-color:#fb7185}.alert[data-level=waiting],.alert[data-level=paused],.alert[data-level=pending]{background:#14243a;border-color:#7894b6}video,img{display:block;width:100%;max-height:65vh;object-fit:contain;background:#000;border-radius:8px}.placeholder{padding:30px 12px;text-align:center;background:#03070d;border-radius:8px}';doc.head.append(style);
    mirror={};for(const [key,tag]of [['name','h1'],['status','p'],['alert','p'],['video','video'],['image','img'],['placeholder','p']]){mirror[key]=doc.createElement(tag);doc.body.append(mirror[key])}
    mirror.alert.className='alert';mirror.alert.setAttribute('role','status');mirror.alert.setAttribute('aria-live','polite');mirror.placeholder.className='placeholder';mirror.video.autoplay=true;mirror.video.muted=true;mirror.video.playsInline=true;mirror.image.alt='Màn hình học sinh';
    observer=new MutationObserver(sync);observer.observe(el('parentDashboard'),{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','src','data-level']});sync();
    win.addEventListener('pagehide',()=>{if(floating!==win)return;observer?.disconnect();observer=null;mirror?.video.pause();if(mirror)mirror.video.srcObject=null;floating=null;mirror=null;label()},{once:true});
    help.textContent='Cửa sổ nổi đang mở. PH có thể chuyển ứng dụng; hãy giữ trang theo dõi này mở.';
   }else{
    if(video.hidden||!video.srcObject||video.readyState<2){help.textContent='Cửa sổ video nổi cần hình trực tiếp. Hãy chờ con chia sẻ và video kết nối thành công; ảnh cập nhật chưa hỗ trợ trên trình duyệt này.';return}
    if(videoSupported)await video.requestPictureInPicture();
    else if(safariSupported)video.webkitSetPresentationMode('picture-in-picture');
    else throw Error('unsupported');
    if(ticket!==generation){clear();return}
    help.textContent='Đang mở video nổi. Cảnh báo chi tiết vẫn ở trang theo dõi; trình duyệt và thiết bị quyết định khả năng tiếp tục phát khi chuyển ứng dụng.';
   }
  }catch{help.textContent='Chưa mở được cửa sổ nổi. Hãy bấm lại khi có hình; nếu trình duyệt không hỗ trợ, PH có thể dùng chia đôi màn hình.'}
  finally{opening=false;label()}
 }
 button.onclick=open;
 if(!documentSupported&&!videoSupported&&!safariSupported){button.disabled=true;help.textContent='Trình duyệt này chưa hỗ trợ cửa sổ nổi qua nút này. PH có thể dùng tính năng video nổi của trình duyệt hoặc chia đôi màn hình.'}
 video.addEventListener('enterpictureinpicture',label);video.addEventListener('leavepictureinpicture',label);video.addEventListener('webkitpresentationmodechanged',label);
 window.addEventListener('pagehide',close);
 window.OTParentFloating={clear,close};
})();
