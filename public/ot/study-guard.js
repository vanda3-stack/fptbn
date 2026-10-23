'use strict';
(function(){
 const state=OTAttention.create();let blurTimer=null,promptDepth=0,suppressUntil=0,returnTarget=null,portalVisible=true;
 const badge=document.createElement('span');badge.id='studyBadge';badge.hidden=true;document.querySelector('header').append(badge);
 const dialog=document.createElement('dialog');dialog.className='study-warning';dialog.setAttribute('aria-labelledby','studyWarningTitle');dialog.innerHTML='<div class="study-warning-icon">!</div><h2 id="studyWarningTitle">Em hãy quay lại bài ôn tập</h2><p id="studyWarningReason"></p><p>Giữ trang ôn tập ở phía trước để hoàn thành bài. Chỉ mở nội dung khác khi được giáo viên cho phép.</p><p class="muted" id="studyWarningCount"></p><button class="primary" id="studyWarningContinue">Tiếp tục ôn tập</button>';document.body.append(dialog);
 function refresh(){badge.hidden=!state.active;badge.textContent='● Chế độ tập trung'+(state.count?' · '+state.count+' lần nhắc':'')}
 function clearTimer(){if(blurTimer!==null)clearTimeout(blurTimer);blurTimer=null}
 function show(){if(!portalVisible||!state.active||!state.pending||document.hidden||dialog.open||promptDepth)return;returnTarget=document.activeElement;document.getElementById('studyWarningReason').textContent=state.reason==='hidden'?'Trang ôn tập vừa bị chuyển sang nền.':'Cửa sổ ôn tập vừa mất tiêu điểm.';document.getElementById('studyWarningCount').textContent='Lần nhắc trong lượt này: '+state.count+'. Đây là lời nhắc tập trung, không kết luận em đang làm việc riêng.';dialog.showModal();document.getElementById('studyWarningContinue').focus()}
 function acknowledge(){OTAttention.acknowledge(state);dialog.close();suppressUntil=Date.now()+350;returnTarget?.isConnected&&returnTarget.focus?.();refresh()}
 document.getElementById('studyWarningContinue').onclick=acknowledge;dialog.addEventListener('cancel',e=>{e.preventDefault();acknowledge()});
 function excluded(){return !portalVisible||!state.active||promptDepth||Date.now()<suppressUntil||dialog.open}
 function depart(reason){if(excluded())return;OTAttention.leave(state,reason);refresh();show()}
 document.addEventListener('visibilitychange',()=>{clearTimer();if(document.hidden)depart('hidden');else show()});
 window.addEventListener('blur',()=>{clearTimer();if(excluded())return;blurTimer=setTimeout(()=>{blurTimer=null;if(!document.hasFocus())depart(document.hidden?'hidden':'blur')},1000)});
 window.addEventListener('focus',()=>{clearTimer();show()});
 window.addEventListener('beforeunload',e=>{if(!state.active)return;e.preventDefault();e.returnValue=''});
 // Native app dialogs (validation/exit confirmation) are not evidence of leaving.
 for(const name of ['alert','confirm']){const original=window[name].bind(window);window[name]=function(...args){promptDepth++;clearTimer();try{return original(...args)}finally{promptDepth--;suppressUntil=Date.now()+350}}}
 globalThis.OTStudy={setVisible(visible){portalVisible=!!visible;clearTimer();if(!portalVisible&&dialog.open)dialog.close();suppressUntil=Date.now()+350},start(key){OTAttention.start(state,key);refresh()},stop(){clearTimer();OTAttention.stop(state);if(dialog.open)dialog.close();refresh()}};
})();
