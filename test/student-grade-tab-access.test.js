'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createController}=require('../lib/student-tab-access');
const levels=[3,4,5,6,7,8,9,10,11,12],locked={review:false,live:false,exam:false,print:false};
const policies=()=>Object.fromEntries(levels.map(g=>[g,{class:true,...locked,...(g===6?{review:true}:{})}]));
const rows=[{id:1,class_code:'6A1',grade_level:6},{id:2,class_code:'6A2',grade_level:6},{id:3,class_code:'7A1',grade_level:7}];

test('grade permissions cover every enrolled class, override old class grants and survive reconnect, closure and restart',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fptbn-grade-tabs-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let instant=new Date('2026-11-23T10:00:00+07:00');const events=[],opts={file:path.join(dir,'tabs.json'),now:()=>instant,notify:(code,access)=>events.push({code,access})};
 const c=createController(opts);c.open('7A1',20,3,7);c.save('7A1',20,{...locked,exam:true});c.configureGrades(policies(),rows);
 for(const code of ['6A1','6A2'])assert.deepEqual(c.view(code).tabs,{class:true,...locked,review:true});
 assert.throws(()=>c.assert({class_code:'7A1',grade_level:7},'/exams'),{status:403},'a legacy class grant cannot bypass the grade mask');
 assert.doesNotThrow(()=>c.assert({class_code:'NEW6',grade_level:6},'/packs'),'new/current enrollment uses the database grade without requiring a teacher session');
 assert.throws(()=>c.assert({class_code:'NEW6',grade_level:6},'/documents'),{status:403});
 c.open('6A1',99,1,6);c.close('6A1');assert.equal(c.view('6A1').tabs.review,true);assert.equal(c.view('6A1').tabs.exam,false);
 const restored=createController(opts);assert.equal(restored.view('6A2',6).tabs.review,true);assert.equal(restored.view('7A1',7).tabs.exam,false);
 const next=policies();next[6].review=false;restored.configureGrades(next,rows);assert.equal(restored.view('6A2').tabs.review,false);assert.equal(events.some(e=>e.code==='6A2'&&e.access.tabs.review===false),true);
 for(const date of ['2026-11-23T17:00:00+07:00','2026-11-28T10:00:00+07:00']){instant=new Date(date);restored.refresh();assert.equal(restored.view('6A2').controlled,false);assert.doesNotThrow(()=>restored.assert({class_code:'6A2',grade_level:6},'/exams'));}
 instant=new Date('2026-11-24T08:00:00+07:00');assert.throws(()=>restored.assert({class_code:'6A2',grade_level:6},'/packs'),{status:403});
});

test('invalid grade masks and disk errors never partially apply or broadcast changes',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fptbn-grade-errors-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const events=[];
 const opts={file:path.join(dir,'tabs.json'),now:()=>new Date('2026-11-23T10:00:00+07:00'),notify:(...args)=>events.push(args)},c=createController(opts);c.configureGrades(policies(),rows);events.length=0;
 const before=fs.readFileSync(opts.file,'utf8');
 for(const mutate of [p=>delete p[12],p=>p[6].class='false',p=>p[6].review='false',p=>p[13]={...locked},p=>p[6].unknown=true]){const p=policies();mutate(p);assert.throws(()=>c.configureGrades(p,rows),{status:400});}
 const next=policies();next[6].review=false;fs.mkdirSync(opts.file+'.tmp');assert.throws(()=>c.configureGrades(next,rows));assert.equal(c.view('6A1').tabs.review,true);assert.equal(fs.readFileSync(opts.file,'utf8'),before);assert.equal(events.length,0);
});


test('classroom checkbox is an independent grade permission and legacy grade files retain their previous classroom access',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fptbn-class-tab-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'tabs.json'),opts={file,now:()=>new Date('2026-11-23T10:00:00+07:00')};
 const legacy=Object.fromEntries(levels.map(g=>[g,{...locked}]));fs.writeFileSync(file,JSON.stringify({version:2,presets:{},grades:legacy}));
 const c=createController(opts);assert.equal(c.view('6A1',6).tabs.class,true,'existing saved settings must retain access until the teacher changes the checkbox');
 const next=policies();next[6].class=false;c.configureGrades(next,rows);
 assert.deepEqual(c.view('6A1').tabs,{class:false,...locked,review:true});
 assert.equal(c.view('7A1').tabs.class,true,'changing grade 6 must not lock grade 7');
 const restored=createController(opts);assert.equal(restored.view('6A2',6).tabs.class,false);assert.equal(restored.gradePermissions()[6].class,false);
 next[6].review=false;restored.configureGrades(next,rows);assert.deepEqual(restored.view('6A1').tabs,{class:false,...locked},'all five tabs may be locked');
 next[6].class=true;restored.configureGrades(next,rows);assert.equal(restored.view('6A1').tabs.class,true);
});
