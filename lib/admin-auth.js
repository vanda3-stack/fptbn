'use strict';
module.exports=function adminAuth({db,adminTokens}){
 return async(req,res,next)=>{
  res.set('Cache-Control','no-store');
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim(),session=adminTokens.get(token);
  if(!session||Date.now()-session.createdAt>=8*3600000)return res.status(401).json({success:false,message:'Phiên admin hết hạn. Vui lòng đăng nhập lại.'});
  try{
   const [rows]=await db.query('SELECT id FROM admins WHERE id=? AND is_active=1 LIMIT 1',[session.adminId]);
   if(!rows.length)return res.status(403).json({success:false,message:'Tài khoản admin không còn hoạt động.'});
   req.adminId=session.adminId;next();
  }catch{res.status(503).json({success:false,message:'Chưa xác thực được admin. Vui lòng thử lại.'});}
 };
};
