'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const codes=require('../public/ot/codes');
test('fixed FBN/PH affixes normalize lowercase, full pasted codes and whitespace',()=>{
 assert.equal(codes.full('12345'),'FBN12345');assert.equal(codes.full(' fbn12345 '),'FBN12345');
 assert.equal(codes.full('fbn12345ph',true),'FBN12345PH');assert.equal(codes.full('12345ph',true),'FBN12345PH');
 const handlers={},input={value:'fbn12abph',addEventListener:(name,fn)=>handlers[name]=fn};codes.bind(input,true);assert.equal(input.value,'12AB');input.value='fbn12345ph';handlers.input();assert.equal(input.value,'12345');
});
function harness(surface='monitor'){
 const elements=Object.fromEntries(['familyStart','familyStop','familyMessage'].map(id=>[id,{disabled:false,hidden:true,textContent:''}]));
 const handlers={},sent=[],track={stopped:false,stop(){this.stopped=true},getSettings:()=>surface===null?{}:{displaySurface:surface}};
 const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};let captures=0,options,active=false;
 const socket={connected:false,on:(name,fn)=>handlers[name]=fn,emit:(name)=>sent.push(name),timeout(){return {emit:(name,cb)=>{sent.push(name);cb(null,{shareId:'share-1'})}}},disconnect(){this.connected=false}};
 const sandbox={window:{isSecureContext:true,addEventListener(){}},document:{getElementById:id=>elements[id],querySelector:()=>({after(){}}),createElement:()=>({remove(){}})},navigator:{mediaDevices:{getDisplayMedia:async o=>{assert(active,'capture must be called directly from click');captures++;options=o;return stream}}},io:()=>socket,setTimeout:()=>1,clearTimeout(){},setInterval:()=>2,clearInterval(){}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/ot/family-student.js'),'utf8'),sandbox);
 sandbox.window.OTFamily.connect('student-token');
 return {elements,handlers,sent,track,socket,get captures(){return captures},get options(){return options},async click(){active=true;const promise=elements.familyStart.onclick();active=false;await promise},ready(){socket.connected=true;handlers.ready({rtcConfig:{iceServers:[]}})}};
}
test('capture opens from click before socket readiness and announces when ready',async()=>{const h=harness();assert.equal(h.elements.familyStart.disabled,false);await h.click();assert.equal(h.captures,1);assert.equal(h.track.stopped,false);assert.equal(h.sent.includes('start'),false);h.ready();assert.equal(h.sent.includes('start'),true);assert.match(h.elements.familyMessage.textContent,/Đang chia sẻ/);assert.equal(h.options.audio,false);h.track.onended();assert.equal(h.track.stopped,true);assert.equal(h.elements.familyStart.disabled,false);assert.equal(h.elements.familyStop.hidden,false);assert.equal(h.elements.familyStop.disabled,true)});
test('browsers without surface metadata can share; known window/tab capture is rejected',async()=>{const unknown=harness(null);unknown.ready();await unknown.click();assert.equal(unknown.track.stopped,false);assert(unknown.sent.includes('start'));for(const surface of ['window','browser']){const h=harness(surface);h.ready();await h.click();assert.equal(h.track.stopped,true);assert(!h.sent.includes('start'));assert.match(h.elements.familyMessage.textContent,/Toàn bộ màn hình/)} });
test('disconnect stops capture and clears the sharing state',async()=>{const h=harness();h.ready();await h.click();h.socket.connected=false;h.handlers.disconnect();assert.equal(h.track.stopped,true);assert.equal(h.elements.familyStart.disabled,false);assert.match(h.elements.familyMessage.textContent,/mất kết nối/)});

test('stop remains available while choosing a screen and cancels late capture',async()=>{const h=harness();const pending=h.click();assert.equal(h.elements.familyStop.hidden,false);assert.equal(h.elements.familyStop.disabled,false);assert.match(h.elements.familyStop.textContent,/Hủy/);h.elements.familyStop.onclick();await pending;assert.equal(h.track.stopped,true);assert(!h.sent.includes('start'));assert.equal(h.elements.familyStop.disabled,true)});
