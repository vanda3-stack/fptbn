'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createPolicy,mountAdminRoutes}=require('../lib/classroom-access');
test('POST access settings remains authorized and persistent behind a proxy that rejects PUT',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fptbn-post-settings-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 let active=true;const adminTokens=new Map([['admin',{adminId:1,createdAt:Date.now()}]]),db={query:async()=>[active?[{id:1}]:[]]},options={file:path.join(root,'access.json'),isTeacherOnline:()=>false,now:()=>new Date('2026-11-25T10:00:00+07:00')},policy=createPolicy(options),app=express();
 app.use(express.json());app.use((req,res,next)=>req.method==='PUT'?res.status(403).type('html').send('<h1>Forbidden</h1>'):next());mountAdminRoutes(app,{db,adminTokens,policy});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const url='http://127.0.0.1:'+server.address().port+'/api/admin/classroom-access';
 const request=(method,body,token='admin')=>fetch(url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await request('PUT',{revisionMode:true})).status,403);assert.equal(policy.settings().revisionMode,false);
 assert.equal((await request('POST',{revisionMode:true},'teacher')).status,401);assert.equal((await request('POST',{revisionMode:'true'})).status,400);
 let response=await request('POST',{enabled:true,revisionMode:true});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/json/);assert.equal((await response.json()).settings.revisionMode,true);
 response=await request('GET');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).settings.revisionMode,true);assert.equal(createPolicy(options).check('6A1').allowed,true);
 await request('POST',{revisionMode:false});assert.equal(policy.check('6A1').allowed,false);assert.equal(createPolicy(options).settings().revisionMode,false);
 active=false;assert.equal((await request('POST',{revisionMode:true})).status,403);active=true;
 fs.mkdirSync(options.file+'.tmp');response=await request('POST',{revisionMode:true});assert.equal(response.status,500);assert.match(response.headers.get('content-type'),/json/);assert.equal((await (await request('GET')).json()).settings.revisionMode,false);
});
