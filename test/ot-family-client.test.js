'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const codes=require('../public/ot/codes'),capture=require('../public/js/screen-capture');
test('fixed FBN/PH affixes normalize lowercase, full pasted codes and whitespace',()=>{
 assert.equal(codes.full('12345'),'FBN12345');assert.equal(codes.full(' fbn12345 '),'FBN12345');
 assert.equal(codes.full('fbn12345ph',true),'FBN12345PH');assert.equal(codes.full('12345ph',true),'FBN12345PH');
 const handlers={},input={value:'fbn12abph',addEventListener:(name,fn)=>handlers[name]=fn};codes.bind(input,true);assert.equal(input.value,'12AB');input.value='fbn12345ph';handlers.input();assert.equal(input.value,'12345');
});
function harness(surface='monitor',captureError=null){
 const elements=Object.fromEntries(['familyStart','familyStop','familyMessage','familyCaptureState'].map(id=>[id,{disabled:false,hidden:true,textContent:'',dataset:{}}]));
 const handlers={},sent=[],track={stopped:false,stop(){this.stopped=true},getSettings:()=>surface===null?{}:{displaySurface:surface}};
 const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};let captures=0,options,active=false;const timers=[];
 const socket={connected:false,on:(name,fn)=>handlers[name]=fn,emit:(name)=>sent.push(name),timeout(){return {emit:(name,cb)=>{sent.push(name);cb(null,{shareId:'share-1'})}}},disconnect(){this.connected=false}};
 const sandbox={window:{isSecureContext:true,addEventListener(){}},document:{getElementById:id=>elements[id],querySelector:()=>({after(){}}),createElement:()=>({remove(){}})},navigator:{mediaDevices:{getDisplayMedia:async o=>{assert(active,'capture must be called directly from click');captures++;options=o;if(captureError)throw captureError;return stream}}},io:()=>socket,setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},setInterval:()=>2,clearInterval(){}};
 sandbox.FPTBNScreenCapture={capture:()=>sandbox.navigator.mediaDevices.getDisplayMedia(capture.constraints())};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/ot/family.js'),'utf8'),sandbox);
 sandbox.OTFamilySocketOptions=sandbox.window.OTFamilySocketOptions;
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/ot/family-student.js'),'utf8'),sandbox);
 sandbox.window.OTFamily.connect('student-token');
 return {elements,handlers,sent,track,socket,expire:()=>timers.forEach(fn=>fn()),get captures(){return captures},get options(){return options},async click(){active=true;const promise=elements.familyStart.onclick();active=false;await promise},ready(){socket.connected=true;handlers.ready({rtcConfig:{iceServers:[]}})}};
}
test('capture opens from click before socket readiness and announces when ready',async()=>{const h=harness();assert.equal(h.elements.familyStart.disabled,false);await h.click();assert.equal(h.captures,1);assert.equal(h.track.stopped,false);assert.equal(h.sent.includes('start'),false);h.ready();assert.equal(h.sent.includes('start'),true);assert.match(h.elements.familyMessage.textContent,/Đang chia sẻ/);assert.equal(h.options.audio,false);h.track.onended();assert.equal(h.track.stopped,true);assert.equal(h.elements.familyStart.disabled,false);assert.equal(h.elements.familyStop.hidden,false);assert.equal(h.elements.familyStop.disabled,true)});
test('browsers without surface metadata can share; known window/tab capture is rejected',async()=>{const unknown=harness(null);unknown.ready();await unknown.click();assert.equal(unknown.track.stopped,false);assert(unknown.sent.includes('start'));for(const surface of ['window','browser']){const h=harness(surface);h.ready();await h.click();assert.equal(h.track.stopped,true);assert(!h.sent.includes('start'));assert.match(h.elements.familyMessage.textContent,/Toàn bộ màn hình/)} });
test('transport disconnect preserves capture and automatically announces a fresh share on reconnect',async()=>{const h=harness();h.ready();await h.click();const starts=h.sent.filter(x=>x==='start').length;h.socket.connected=false;h.handlers.disconnect('transport close');assert.equal(h.track.stopped,false);assert.equal(h.elements.familyStop.disabled,false);assert.match(h.elements.familyMessage.textContent,/không cần chọn lại/);h.ready();assert.equal(h.captures,1);assert.equal(h.sent.filter(x=>x==='start').length,starts+1);h.elements.familyStop.onclick();assert.equal(h.track.stopped,true)});
test('server revocation still stops capture instead of reconnecting an unauthorized share',async()=>{const h=harness();h.ready();await h.click();h.socket.connected=false;h.handlers.disconnect('io server disconnect');assert.equal(h.track.stopped,true);assert.match(h.elements.familyMessage.textContent,/đăng xuất/)});

test('stop remains available while choosing a screen and cancels late capture',async()=>{const h=harness();const pending=h.click();assert.equal(h.elements.familyStop.hidden,false);assert.equal(h.elements.familyStop.disabled,false);assert.match(h.elements.familyStop.textContent,/Hủy/);h.elements.familyStop.onclick();await pending;assert.equal(h.track.stopped,true);assert(!h.sent.includes('start'));assert.equal(h.elements.familyStop.disabled,true)});

test('homework and classroom load the same screen capture helper with the original classroom constraints',()=>{const c=capture.constraints();assert.equal(c.video.frameRate.max,3);assert.equal(c.video.width.max,960);assert.equal(c.video.height.max,540);assert.equal(c.video.displaySurface,'monitor');assert.equal(c.selfBrowserSurface,'exclude');assert.equal(c.audio,false);assert.equal(capture.constraints('retry').video.frameRate.max,6);for(const name of ['index.html','exam.html','baitap.html','OT.html']){const html=fs.readFileSync(require('node:path').join(__dirname,'../public',name),'utf8');assert(html.indexOf('/js/screen-capture.js')<html.indexOf(name==='index.html'||name==='exam.html'?'/js/student.js':'/ot/family-student.js'))}});

test('permission rejection remains visible when socket readiness or disconnect arrives',async()=>{const h=harness('monitor',Object.assign(Error('denied'),{name:'NotAllowedError'}));await h.click();assert.equal(h.elements.familyCaptureState.dataset.state,'error');const notice=h.elements.familyCaptureState.textContent;h.ready();assert.equal(h.elements.familyCaptureState.textContent,notice);h.handlers.disconnect();assert.equal(h.elements.familyCaptureState.textContent,notice);assert(!h.sent.includes('start'))});

test('a slow server never silently stops a screen the student has already granted',async()=>{const h=harness();await h.click();assert.equal(h.elements.familyCaptureState.dataset.state,'live');h.expire();assert.equal(h.track.stopped,false);assert.equal(h.elements.familyStop.disabled,false);assert.match(h.elements.familyMessage.textContent,/Chưa kết nối/);h.ready();assert(h.sent.includes('start'));assert.equal(h.track.stopped,false);h.elements.familyStop.onclick();assert.equal(h.track.stopped,true)});

test('OT and homework require sharing on restored login and preserve the exercise when sharing stops',async()=>{
 for(const homework of [false,true]){
  const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',innerHTML:'',before(){},remove(){}});return nodes.get(id)};
  let sharing=false,onChange,starts=0,packRequests=0;
  const family={connect(_token,cb){if(cb)onChange=cb},disconnect(){},isSharing:()=>sharing,start(){starts++}};
  const sandbox={window:{OTFamily:family},document:{documentElement:{dataset:{homework:String(homework)}},querySelector:node,querySelectorAll:()=>[],createElement:()=>node('gate')},sessionStorage:{getItem:key=>key==='ot-student-token'?'valid':JSON.stringify({full_name:'HS',student_code:'FBN12345',class_code:'9A3'}),removeItem(){}},crypto:{randomUUID:()=> 'attempt'},fetch:async()=>{packRequests++;return {ok:true,json:async()=>({success:true,packs:[]})}},alert:message=>assert.fail(message)};
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/ot/student.js'),'utf8'),sandbox);
  assert.equal(packRequests,0);assert.equal(node('#app').hidden,true);assert.match(node('gate').innerHTML,/chia sẻ toàn màn hình/);
  node('#beginHomework').onclick();assert.equal(starts,1);
  sharing=true;onChange(true);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(packRequests,1);assert.equal(node('#app').hidden,false);assert.equal(node('gate').hidden,true);
  node('#app').innerHTML='exercise draft with answers';sharing=false;onChange(false);
  assert.equal(node('#app').hidden,true);assert.equal(node('gate').hidden,false);
  sharing=true;onChange(true);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(packRequests,1);assert.equal(node('#app').innerHTML,'exercise draft with answers');assert.equal(node('#app').hidden,false);
 }
});

test('both family clients use WebSocket first with polling fallback',()=>{
 const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../public/ot/family.js'),'utf8'),sandbox);
 const auth={role:'student',token:'test-only'};const options=sandbox.window.OTFamilySocketOptions(auth);
 assert.deepEqual(Array.from(options.transports),['websocket','polling']);assert.equal(options.tryAllTransports,true);assert.equal(options.reconnection,true);assert.equal(options.auth,auth);
 for(const file of ['family-student.js','parent.js'])assert.match(fs.readFileSync(require.resolve('../public/ot/'+file),'utf8'),/io\('\/ot-family',OTFamilySocketOptions\(/);
});
