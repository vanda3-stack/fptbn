(function(root){
 'use strict';
 function middle(value,parent=false){let s=String(value||'').toUpperCase().replace(/\s/g,'').replace(/^FBN/,'');if(parent)s=s.replace(/PH$/,'');return s.replace(/[^A-Z0-9_-]/g,'').slice(0,37)}
 const codes={middle,full:(value,parent=false)=>'FBN'+middle(value,parent)+(parent?'PH':''),bind(input,parent=false){const update=()=>{input.value=middle(input.value,parent)};input.addEventListener('input',update);input.addEventListener('change',update);update()}};
 if(typeof module==='object'&&module.exports)module.exports=codes;else root.OTCodes=codes;
})(typeof window==='object'?window:globalThis);
