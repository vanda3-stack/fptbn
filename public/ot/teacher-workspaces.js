'use strict';
(()=>{
const app=document.getElementById('app');if(!app)return;
let lastHeading=null;
function activate(space){
 if(!app.querySelector('.dashboard-heading'))return;
 app.dataset.workspace=space;
 app.querySelectorAll('.dashboard-actions [data-workspace]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.workspace===space)));
}
function sync(){
 const heading=app.querySelector('.dashboard-heading');if(!heading){lastHeading=null;return}
 const changed=heading!==lastHeading;
 lastHeading=heading;
 const bar=heading.querySelector('.dashboard-actions');if(!bar)return;
 const create=bar.querySelector('#create');if(!create)return;
 const oldLink=bar.querySelector('.student-page-link');oldLink?.remove();
 const oldMock=bar.querySelector('#mockManage');if(oldMock){oldMock.textContent='+ Tạo đề thi thử';oldMock.classList.add('primary');oldMock.dataset.workspace='exam';}
 const live=bar.querySelector('#liveCreateTop');if(live)live.dataset.workspace='live';
 let settings=bar.querySelector('#teacherSettingsTop');
 if(!settings){settings=document.createElement('button');settings.id='teacherSettingsTop';settings.textContent='⚙ Trang mặc định';settings.type='button';bar.append(settings)}
 settings.dataset.workspace='settings';
 if(live&&!live.dataset.boundWorkspace){live.dataset.boundWorkspace='1';live.addEventListener('click',()=>activate('live'),true)}
 if(oldMock&&!oldMock.dataset.boundWorkspace){oldMock.dataset.boundWorkspace='1';oldMock.addEventListener('click',()=>activate('exam'),true)}
 settings.onclick=()=>activate('settings');
 create.dataset.workspace='outline';
 if(!create.dataset.boundWorkspace){create.dataset.boundWorkspace='1';create.addEventListener('click',()=>activate('outline'),true)}
 if(changed||!app.dataset.workspace)activate('outline');
}
new MutationObserver(sync).observe(app,{childList:true,subtree:true});sync();
})();