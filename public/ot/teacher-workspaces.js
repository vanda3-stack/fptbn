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
 let outlines=bar.querySelector('#teacherOutlinesTop');
 if(!outlines){
   outlines=document.createElement('button');
   outlines.id='teacherOutlinesTop';
   outlines.type='button';
   outlines.textContent='📚 Đề cương đã tạo';
   bar.insertBefore(outlines,create);
 }
 outlines.dataset.workspace='outline';
 outlines.onclick=async()=>{
   try{
     // Reload from the existing teacher API to reflect the latest saved packs.
     await dashboard();
     activate('outline');
   }catch(error){alert(error.message||'Không tải được danh sách đề cương')}
 };
 const oldMock=bar.querySelector('#mockManage');if(oldMock){if(oldMock.textContent!=='+ Tạo đề thi thử')oldMock.textContent='+ Tạo đề thi thử';oldMock.classList.add('primary');oldMock.dataset.workspace='exam';}
 const live=bar.querySelector('#liveCreateTop');if(live)live.dataset.workspace='live';
 let settings=bar.querySelector('#teacherSettingsTop');
 if(!settings){settings=document.createElement('button');settings.id='teacherSettingsTop';settings.textContent='⚙ Trang mặc định';settings.type='button';bar.append(settings)}
 settings.dataset.workspace='settings';
 if(live&&!live.dataset.boundWorkspace){live.dataset.boundWorkspace='1';live.addEventListener('click',()=>activate('live'),true)}
 if(oldMock&&!oldMock.dataset.boundWorkspace){oldMock.dataset.boundWorkspace='1';oldMock.addEventListener('click',()=>activate('exam'),true)}
 settings.onclick=()=>activate('settings');
 create.dataset.workspace='outline';
 if(!create.dataset.boundWorkspace){create.dataset.boundWorkspace='1';create.addEventListener('click',()=>activate('outline'),true)}
 if(changed||!app.dataset.workspace)activate('settings');
}
const header=document.querySelector('body > header');
if(header&&!document.getElementById('teacherHomeButton')){
 const home=document.createElement('button');home.id='teacherHomeButton';home.type='button';home.textContent='← Về trang chủ';header.append(home);
 home.onclick=async()=>{if(!sessionStorage.getItem('ot-teacher-token'))return;try{if(!app.querySelector('.dashboard-heading'))await dashboard();activate('settings')}catch(error){alert(error.message||'Không mở được trang chủ')}};
}
new MutationObserver(()=>{sync();const b=document.getElementById('teacherHomeButton');if(b)b.hidden=!sessionStorage.getItem('ot-teacher-token')||!!(app.querySelector('.dashboard-heading')&&app.dataset.workspace==='settings')}).observe(app,{childList:true,subtree:true});
sync();
})();