(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.OTAttention=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
function create(){return {key:null,active:false,pending:false,count:0,reason:''}}
function start(s,key){if(s.active&&s.key===key)return;Object.assign(s,{key,active:true,pending:false,count:0,reason:''})}
function stop(s){s.active=false;s.pending=false}
function leave(s,reason){if(!s.active||s.pending)return false;s.pending=true;s.reason=reason;s.count++;return true}
function acknowledge(s){s.pending=false;s.reason=''}
return {create,start,stop,leave,acknowledge};
});
