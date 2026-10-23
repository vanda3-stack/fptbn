(function(root){
 'use strict';
 // Shared by the classroom student page and the homework student page.
 function constraints(mode='initial'){
  const video={displaySurface:'monitor',frameRate:mode==='retry'?{ideal:5,max:6}:{ideal:3,max:3}};
  if(mode!=='retry'){video.width={ideal:854,max:960};video.height={ideal:480,max:540}}
  return {video,audio:false,preferCurrentTab:false,selfBrowserSurface:'exclude',surfaceSwitching:'exclude'};
 }
 const api={constraints,capture:mode=>navigator.mediaDevices.getDisplayMedia(constraints(mode))};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.FPTBNScreenCapture=api;
})(typeof window==='object'?window:globalThis);
