'use strict';
(function(){
 let active=false,portalVisible=true;
 const badge=document.createElement('span');badge.id='studyBadge';badge.textContent='● Đang ôn tập';document.querySelector('header').append(badge);
 function refresh(){badge.hidden=!active||!portalVisible}
 refresh();
 globalThis.OTStudy={setVisible(visible){portalVisible=!!visible;refresh()},start(){active=true;refresh()},stop(){active=false;refresh()}};
})();
