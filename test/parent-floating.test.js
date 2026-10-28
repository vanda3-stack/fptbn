'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function harness({documentPip=true,native=false,deferred=false}={}){
 const node=()=>({hidden:false,textContent:'',dataset:{},attrs:{},children:[],events:{},srcObject:null,readyState:3,
  append(n){this.children.push(n)},setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]||null},removeAttribute(k){delete this.attrs[k]},
  addEventListener(k,fn){this.events[k]=fn},play(){return Promise.resolve()},pause(){this.paused=true}});
 const ids=['childScreen','parentFloating','floatingHelp','parentDashboard','childName','childClass','parentStatus','demoAttention','demoAttentionMessage','demoAttentionClock','childPreview','screenPlaceholder'];
 const els=Object.fromEntries(ids.map(id=>[id,node()]));els.childScreen.srcObject={id:'one-stream'};els.childName.textContent='Con A';els.childClass.textContent='9A3';els.demoAttentionMessage.textContent='Rời trang';els.demoAttention.dataset.level='warning';els.childPreview.hidden=true;
 let observer,requests=0,exits=0,resolve;
 const doc={getElementById:id=>els[id],pictureInPictureEnabled:native,pictureInPictureElement:null,exitPictureInPicture:async()=>{exits++;doc.pictureInPictureElement=null}};
 if(native)els.childScreen.requestPictureInPicture=async()=>{requests++;doc.pictureInPictureElement=els.childScreen};
 const floatingDoc={head:node(),body:node(),createElement:node},floating={document:floatingDoc,events:{},closed:false,addEventListener(k,fn){this.events[k]=fn},close(){this.closed=true;this.events.pagehide?.()}};
 const win={events:{},addEventListener(k,fn){this.events[k]=fn}};
 if(documentPip)win.documentPictureInPicture={requestWindow:()=>{requests++;return deferred?new Promise(r=>resolve=r):Promise.resolve(floating)}};
 const sandbox={window:win,document:doc,MutationObserver:class{constructor(fn){this.fn=fn;observer=this}observe(){}disconnect(){this.disconnected=true}}};
 vm.runInNewContext(fs.readFileSync('public/ot/parent-floating.js','utf8'),sandbox);
 return {els,doc,win,floating,api:win.OTParentFloating,get requests(){return requests},get exits(){return exits},mutate(){observer.fn()},get observer(){return observer},resolve(){resolve(floating)}};
}
test('floating document reuses the stream, follows fallback images and alerts, and clears revoked content',async()=>{
 const h=harness();await h.els.parentFloating.onclick();assert.equal(h.requests,1);
 const [name,status,alert,video,image,placeholder]=h.floating.document.body.children;
 assert.match(name.textContent,/Con A/);assert.equal(video.srcObject,h.els.childScreen.srcObject);assert.equal(alert.dataset.level,'warning');
 h.els.childScreen.hidden=true;h.els.childPreview.hidden=false;h.els.childPreview.attrs.src='data:image/jpeg;base64,YQ==';h.els.demoAttention.dataset.level='urgent';h.mutate();
 assert.equal(video.srcObject,null);assert.equal(video.hidden,true);assert.equal(image.hidden,false);assert.equal(alert.dataset.level,'urgent');
 h.api.clear('Con đang học trên lớp');assert.equal(image.hidden,true);assert.equal(video.srcObject,null);assert.equal(placeholder.textContent,'Con đang học trên lớp');
 h.api.close();assert.equal(h.floating.closed,true);assert.equal(h.observer.disconnected,true);
});
test('closing a document PiP window releases the mirror but keeps the original stream',async()=>{
 const h=harness();const original=h.els.childScreen.srcObject;await h.els.parentFloating.onclick();h.floating.close();
 assert.equal(h.els.childScreen.srcObject,original);assert.equal(h.observer.disconnected,true);assert.match(h.els.parentFloating.textContent,/Mở/);
});
test('logout during pending PiP opening cannot reveal the former child',async()=>{
 const h=harness({deferred:true});const pending=h.els.parentFloating.onclick();h.api.close();h.els.parentDashboard.hidden=true;h.resolve();await pending;
 assert.equal(h.floating.closed,true);assert.equal(h.floating.document.body.children.length,0);
});
test('native PiP requires live video, exits on revocation, and unsupported browsers explain the limitation',async()=>{
 const h=harness({documentPip:false,native:true});h.els.childScreen.hidden=true;await h.els.parentFloating.onclick();assert.equal(h.requests,0);assert.match(h.els.floatingHelp.textContent,/ảnh cập nhật/);
 h.els.childScreen.hidden=false;await h.els.parentFloating.onclick();assert.equal(h.requests,1);h.api.clear();assert.equal(h.exits,1);
 const unsupported=harness({documentPip:false});assert.equal(unsupported.els.parentFloating.disabled,true);assert.match(unsupported.els.floatingHelp.textContent,/chưa hỗ trợ/);
});
test('revoking a share while a floating window opens discards the pending window',async()=>{
 const h=harness({deferred:true});const pending=h.els.parentFloating.onclick();h.api.clear('Theo dõi tạm dừng');h.resolve();await pending;
 assert.equal(h.floating.closed,true);assert.equal(h.floating.document.body.children.length,0);
});
