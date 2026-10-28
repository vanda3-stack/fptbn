'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const routes={};
require('../lib/review-pages')({get:(paths,handler)=>{for(const p of Array.isArray(paths)?paths:[paths])routes[p]=handler}},{path,root:'/project'});
function request(route,query={},dest='document'){let result={};routes[route]({query,get:()=>dest},{set:(k,v)=>result[k]=v,redirect:(code,url)=>{result.code=code;result.url=url},sendFile:file=>result.file=file});return result}
test('legacy review links open the main-page review tab, including OT.html embedded links',()=>{
 for(const p of ['/OT.html','/OT.html/','/ontap','/ontap/']){assert.equal(request(p).url,'/?tab=review');assert.equal(request(p,{embedded:'1'}).url,'/?tab=review')}
 assert.equal(request('/OT.html',{embedded:'1'},'iframe').url,'/?tab=review');
});
test('embedded review continues to load its document, including an old mounted iframe',()=>{
 for(const p of ['/portal/review','/ontap']){assert.equal(request(p,{embedded:'1'},'iframe').file,path.join('/project','views/review.html'));assert.equal(request(p).url,'/?tab=review');assert.equal(request(p,{},'iframe').url,'/?tab=review')}
 const server=fs.readFileSync('server.js','utf8');assert(server.indexOf('require("./lib/review-pages")')<server.indexOf('express.static('));
});
test('review deep link waits for login, then opens the embedded review exactly once',()=>{
 const nodes={},events={},frames=[];
 const node=id=>nodes[id]||=( {hidden:false,handlers:{},setAttribute(){},addEventListener(k,v){this.handlers[k]=v},append(f){frames.push(f)},focus(){}} );
 vm.runInNewContext(fs.readFileSync('public/portal/student-tabs.js','utf8'),{URLSearchParams,location:{search:'?tab=review'},window:{addEventListener:(k,v)=>events[k]=v,dispatchEvent(){}},Event:class{},CustomEvent:class{},document:{getElementById:node,createElement:()=>({addEventListener(){},contentWindow:{dispatchEvent(){}}})}});
 assert.equal(frames.length,0);events['student-portal-access']({detail:true});assert.equal(nodes.reviewPanel.hidden,false);assert.equal(frames[0].src,'/portal/review?embedded=1');events['student-portal-access']({detail:true});assert.equal(frames.length,1);
});

test('standalone review HTML is absent from the public document root',()=>{assert.equal(fs.existsSync('public/OT.html'),false);assert.equal(fs.existsSync('views/review.html'),true)});
