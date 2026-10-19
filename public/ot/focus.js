(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.OTFocus=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function create(count,id){return {id,index:0,values:Array.from({length:count},()=>[]),results:Array(count).fill(null),ratings:Array(count).fill(null),revealed:Array(count).fill(false),saved:false}}
function complete(s){return s.results.length>0&&s.results.every(x=>x!==null)}
function pending(s){return s.results.flatMap((x,i)=>x===null?[i]:[])}
function review(s,mode){return s.results.flatMap((x,i)=>x===null||(mode==='cloze'?!x.every(Boolean):mode==='writing'?!x.matched:s.ratings[i]!=='remembered')?[i]:[])}
function totals(s){return {checked:s.results.filter(x=>x!==null).length,total:s.results.length}}
function resetPart(s,index){s.values[index]=[];s.results[index]=null;s.ratings[index]=null;s.revealed[index]=false}
return {create,complete,pending,review,totals,resetPart};
});
