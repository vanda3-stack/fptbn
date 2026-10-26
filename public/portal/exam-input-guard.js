'use strict';
((root)=>{
 function blocked(e,active){if(!active||!e.target?.closest?.('[data-essay-zone]'))return false;
  if(['copy','cut','paste','contextmenu','dragstart','dragover','drop'].includes(e.type))return true;
  if(e.type==='beforeinput')return ['insertFromPaste','insertFromPasteAsQuotation','insertFromDrop','deleteByCut','insertFromYank'].includes(e.inputType);
  if(e.type==='keydown'){const k=e.key.toLowerCase();return ((e.ctrlKey||e.metaKey)&&['c','v','x'].includes(k))||(e.shiftKey&&['insert','delete'].includes(k))||(e.ctrlKey&&k==='insert')}
  return false;
 }
 function install(host,isActive){for(const type of ['copy','cut','paste','contextmenu','dragstart','dragover','drop','beforeinput','keydown'])host.addEventListener(type,e=>{if(blocked(e,isActive()))e.preventDefault()},true)}
 const api={blocked,install};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ExamInputGuard=api;
})(globalThis);
