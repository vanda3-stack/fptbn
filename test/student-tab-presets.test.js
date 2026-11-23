'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createController}=require('../lib/student-tab-access');
const locked={review:false,live:false,exam:false,print:false};
const row={id:10,class_code:'6A1',grade_level:6};
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fptbn-tab-presets-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const options={file:path.join(dir,'presets.json'),now:()=>new Date('2026-11-23T10:00:00+07:00')};return{options,c:createController(options)};}

test('multiple classes keep independent staged permissions, across restart and subsequent teaching sessions',t=>{
 const h=setup(t),other={id:20,class_code:'7A2',grade_level:7};
 assert.equal(h.c.configure(row,7,{...locked,review:true},false).applied,false);
 h.c.configure(other,7,{...locked,exam:true},false);
 assert.equal(h.c.view('6A1').controlled,false,'staging never opens a classroom or changes a live session');
 const restored=createController(h.options);
 assert.equal(restored.describe(row,7,false).permissions.review,true);
 assert.equal(restored.describe(other,7,false).permissions.exam,true);
 restored.open('6A1',7,10);restored.open('7A2',7,20);
 assert.equal(restored.view('6A1').tabs.review,true);assert.equal(restored.view('6A1').tabs.exam,false);
 assert.equal(restored.view('7A2').tabs.review,false);assert.equal(restored.view('7A2').tabs.exam,true);
 restored.close('6A1');restored.open('6A1',7,10);assert.equal(restored.view('6A1').tabs.review,true);
 restored.close('6A1');restored.open('6A1',8,10);assert.equal(restored.view('6A1').tabs.review,false,'another teacher does not inherit the saved preset');
 restored.close('6A1');restored.open('6A1',7,99);assert.equal(restored.view('6A1').tabs.review,false,'a new school-year class ID does not inherit last-year grants');
});

test('write failure leaves both the persisted and active permissions unchanged',t=>{
 const h=setup(t);h.c.configure(row,7,{...locked,review:true},false);h.c.open('6A1',7,10);
 fs.mkdirSync(h.options.file+'.tmp');
 assert.throws(()=>h.c.configure(row,7,locked,true));
 assert.equal(h.c.view('6A1').tabs.review,true);
 assert.equal(createController(h.options).describe(row,7,false).permissions.review,true);
});

test('staged saves cannot modify another teacher or a disconnected active session',t=>{
 const h=setup(t);h.c.open('6A1',8,10);
 h.c.save('6A1',8,{...locked,review:true});
 assert.equal(h.c.describe(row,7,false).state,'other_teacher');
 assert.equal(h.c.describe(row,7,false).permissions.review,true,'read-only rows show the active session permissions');
 assert.throws(()=>h.c.configure(row,7,{...locked,review:true},false),{status:403});
 h.c.close('6A1');h.c.open('6A1',7,10);
 assert.equal(h.c.describe(row,7,false).state,'reconnecting');
 assert.throws(()=>h.c.configure(row,7,{...locked,review:true},false),{status:403});
 assert.equal(h.c.configure(row,7,{...locked,review:true},true).applied,true);
});

test('batch changes save selected classes together and preserve their unchanged permission differences',t=>{
 const h=setup(t),other={id:20,class_code:'7A2',grade_level:7};
 h.c.configure(row,7,{...locked,review:true},false);h.c.configure(other,7,{...locked,exam:true},false);h.c.open('6A1',7,10);
 const saved=h.c.configureMany([row,other],7,{live:true},code=>code==='6A1');
 assert.equal(saved.classes.length,2);assert.equal(saved.applied_count,1);assert.equal(saved.staged_count,1);
 assert.equal(h.c.view('6A1').tabs.live,true);assert.equal(h.c.view('6A1').tabs.review,true);
 const restored=createController(h.options);restored.open('7A2',7,20);
 assert.equal(restored.view('7A2').tabs.live,true);assert.equal(restored.view('7A2').tabs.exam,true);assert.equal(restored.view('7A2').tabs.review,false);
});

test('a rejected or failed batch leaves every selected class and its saved preset unchanged',t=>{
 const h=setup(t),other={id:20,class_code:'7A2',grade_level:7};
 h.c.configure(row,7,{...locked,review:true},false);h.c.open('6A1',7,10);h.c.open('7A2',8,20);
 const before=fs.readFileSync(h.options.file,'utf8');
 assert.throws(()=>h.c.configureMany([row,other],7,{review:false},()=>true),{status:403});
 assert.equal(fs.readFileSync(h.options.file,'utf8'),before);assert.equal(h.c.view('6A1').tabs.review,true);
 h.c.close('7A2');fs.mkdirSync(h.options.file+'.tmp');
 assert.throws(()=>h.c.configureMany([row,other],7,{review:false},()=>true));
 assert.equal(fs.readFileSync(h.options.file,'utf8'),before);assert.equal(h.c.view('6A1').tabs.review,true);
 assert.equal(h.c.describe(other,7,false).permissions.review,false);
 for(const changes of [{},{class:false},{review:'false'},null])assert.throws(()=>h.c.configureMany([row],7,changes,()=>true),{status:400});
});
