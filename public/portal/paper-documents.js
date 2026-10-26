'use strict';
((root)=>{
 function sourceURL(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null}catch{return null}}
 function previewURL(value){const raw=sourceURL(value);if(!raw)return null;const u=new URL(raw);if(u.hostname==='drive.google.com'){const m=u.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]+)/);const id=m?.[1]||(u.pathname==='/open'?u.searchParams.get('id'):null);if(id&&/^[a-zA-Z0-9_-]+$/.test(id)){const v=new URL('https://drive.google.com/file/d/'+id+'/preview');if(u.searchParams.has('resourcekey'))v.searchParams.set('resourcekey',u.searchParams.get('resourcekey'));return v.href}}if(u.hostname==='docs.google.com'){const m=u.pathname.match(/^\/(document|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]+)/);if(m)return 'https://docs.google.com/'+m[1]+'/d/'+m[2]+'/preview'}return raw}
 function downloadURL(value){const raw=sourceURL(value);if(!raw)return null;const u=new URL(raw);if(u.hostname==='drive.google.com'){const m=u.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]+)/);const id=m?.[1]||(['/', '/open','/uc'].includes(u.pathname)?u.searchParams.get('id'):null);if(id&&/^[a-zA-Z0-9_-]+$/.test(id)){const v=new URL('https://drive.google.com/uc');v.searchParams.set('export','download');v.searchParams.set('id',id);if(u.searchParams.has('resourcekey'))v.searchParams.set('resourcekey',u.searchParams.get('resourcekey'));return v.href}}if(u.hostname==='docs.google.com'){const m=u.pathname.match(/^\/(document|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]+)/);if(m){const v=new URL('https://docs.google.com/'+m[1]+'/d/'+m[2]+'/export'+(m[1]==='presentation'?'/pdf':''));if(m[1]!=='presentation')v.searchParams.set('format','pdf');for(const key of ['gid','resourcekey'])if(u.searchParams.has(key))v.searchParams.set(key,u.searchParams.get(key));return v.href}}return raw}
 if(typeof module!=='undefined'&&module.exports){module.exports={sourceURL,previewURL,downloadURL};return}
 const host=document.getElementById('paperPanel'),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let generation=0,visible=false,lastSignature='',documentSession=null;
 const codeOf=value=>{const raw=String(value||'').trim().toUpperCase();return /^\d{5}$/.test(raw)?'FBN'+raw:raw};
 async function show(quiet=false){
  const ticket=++generation;
  if(!quiet)host.innerHTML='<p role="status">Đang tải đề cương của lớp…</p>';
  try{
   const identity=root.FPTBNFamilySession?.identity();
   let stored;try{stored=JSON.parse(sessionStorage.getItem('ot-student-info'))}catch{}
   const code=codeOf(document.getElementById('studentCode')?.value)||codeOf(identity?.student?.student_code)||codeOf(stored?.student_code);
   if(!/^FBN\d{5}$/.test(code))throw Error('Em hãy đăng nhập trang chính trước.');
   let auth=documentSession?.student?.student_code===code?documentSession.token:identity?.student?.student_code===code?identity.token:stored?.student_code===code?sessionStorage.getItem('ot-student-token'):'';
   async function login(){
    const r=await fetch('/api/ot/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({student_code:code}),cache:'no-store'}),d=await r.json();
    if(!r.ok||!d.success||!d.token||d.student?.student_code!==code)throw Error(d.message||'Phiên đăng nhập chưa sẵn sàng.');
    if(ticket!==generation)return '';
    documentSession={token:d.token,student:d.student};return d.token;
   }
   if(!auth)auth=await login();
   if(ticket!==generation)return;
   const load=token=>fetch('/api/ot/documents',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
   let r=await load(auth);
   if(r.status===401){auth=await login();if(ticket!==generation)return;r=await load(auth)}
   const d=await r.json();
   if(!r.ok||!d.success||!Array.isArray(d.documents))throw Error(d.message||'Không tải được đề cương.');
   if(ticket!==generation)return;
   const packs=d.documents.filter(p=>sourceURL(p.document_url)),signature=JSON.stringify(packs);
   if(quiet&&signature===lastSignature)return;
   lastSignature=signature;
   host.innerHTML=packs.length?packs.map(p=>{const title='ĐỀ CƯƠNG '+String(p.title).replace(/^ĐỀ CƯƠNG\s*/i,'').replace(/tin học/gi,'TIN').replace(/\s*[-–—·]\s*/g,' ').toLocaleUpperCase('vi-VN');return '<div class="paper-viewer-top"><h2>'+esc(title)+'</h2><a class="paper-download" href="'+esc(downloadURL(p.document_url))+'" download target="_blank" rel="noopener noreferrer">Tải về</a></div>'}).join(''):'<p role="status">Chưa có đề cương được gửi cho lớp em.</p>';
  }catch(e){
   if(ticket!==generation||quiet)return;
   lastSignature='';host.innerHTML='<p role="alert">'+esc(e.message)+'</p><button id="paperRetry">Thử lại</button>';host.querySelector('button').onclick=()=>show();
  }
 }
 root.addEventListener('paper-tab-show',()=>{visible=true;show()});
 root.addEventListener('paper-tab-hidden',()=>{visible=false});
 setInterval(()=>{if(visible&&!document.hidden)show(true)},15000);
 root.addEventListener('student-portal-access',e=>{if(e.detail!==true){generation++;visible=false;lastSignature='';documentSession=null;host.innerHTML=''}});
})(globalThis);
