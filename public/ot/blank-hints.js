(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.OTBlankHints=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
// Count space-separated units as used by the canonical answer comparison.
function count(s){let t=String(s??'').normalize('NFC').replace(/[.,;:!?()]/g,' ').trim();return t?t.split(/\s+/u).length:0}
function info(answer,value){return {required:count(answer),entered:count(value),valid:count(answer)===count(value)}}
function mismatch(answers,values){return answers.flatMap((answer,i)=>{let v=info(answer,values[i]);return v.valid?[]:[{index:i,...v}]})}
return {count,info,mismatch};
});
