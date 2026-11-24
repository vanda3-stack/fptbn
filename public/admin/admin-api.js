'use strict';
(() => {
 const nativeFetch=window.fetch.bind(window);
 window.fetch=async(input,init={})=>{
  const url=new URL(input?.url||String(input),location.href);
  const admin=url.origin===location.origin&&url.pathname.startsWith('/api/admin/')&&url.pathname!=='/api/admin/login';
  const requestToken=admin?sessionStorage.getItem('fptbnAdminToken'):null;
  if(admin){const headers=new Headers(init.headers||input?.headers);const token=requestToken;if(token)headers.set('Authorization','Bearer '+token);init={...init,headers};}
  const response=await nativeFetch(input,init);
  if(admin&&response.status===401&&requestToken&&sessionStorage.getItem('fptbnAdminToken')===requestToken){
   if(typeof window.logout==='function')window.logout();
   const message=document.getElementById('loginMessage');if(message){message.className='message-error';message.textContent='Phiên admin hết hạn. Vui lòng đăng nhập lại.';}
  }
  return response;
 };
})();
