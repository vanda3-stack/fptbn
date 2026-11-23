'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function portal(){
 const elements={},handlers={},frames=[],events=[];
 const node=id=>elements[id]||={hidden:false,attrs:{},handlers:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.handlers[k]=fn;},focus(){this.focused=true;},append(frame){frames.push(frame);}};
 const context={URLSearchParams,location:{search:'?tab=review'},window:{addEventListener:(k,fn)=>{handlers[k]=fn;},dispatchEvent:e=>events.push(e)},document:{getElementById:node,createElement:()=>({contentWindow:{draft:'Đang làm bài',dispatchEvent(){}},addEventListener(){}})},Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type,o){this.type=type;this.detail=o?.detail;}}};
 vm.runInNewContext(fs.readFileSync('public/portal/student-tabs.js','utf8'),context);
 return{node,handlers,frames,events,access:tabs=>handlers['student-tab-access']({detail:{tabs}})};
}
test('deep links, clicks, keyboard and document events cannot open locked tabs; granting and relocking preserve drafts',()=>{
 const h=portal(),closed={class:true,review:false,live:false,exam:false,print:false};
 h.access(closed);h.handlers['student-portal-access']({detail:true});
 h.node('reviewTab').handlers.click();h.handlers['portal-open-paper']({detail:{packId:'p'}});
 assert.equal(h.frames.length,0);assert.equal(h.node('reviewTab').disabled,true);assert.equal(h.node('classTab').disabled,false);
 h.node('classTab').handlers.keydown({key:'ArrowRight',preventDefault(){}});assert.equal(h.node('classTab').focused,true);
 h.access({...closed,review:true});h.node('reviewTab').handlers.click();assert.equal(h.frames.length,1);
 const frame=h.frames[0];h.access(closed);assert.equal(h.node('reviewPanel').hidden,true);assert.equal(h.node('classPanel').hidden,false);
 h.access({...closed,review:true});h.node('reviewTab').handlers.click();assert.equal(h.frames.length,1);assert.equal(h.frames[0],frame);assert.equal(frame.contentWindow.draft,'Đang làm bài');
 h.access({class:true,review:true,live:true,exam:true,print:true});h.node('paperTab').handlers.click();assert.equal(h.node('paperPanel').hidden,false);
});
