'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const teacher=fs.readFileSync('public/js/teacher.js','utf8');
const server=fs.readFileSync('server.js','utf8');

test('teacher transport loss clears stale peers and retry timers while preserving capture and student cards',()=>{
 const closed=[],timers=[],statuses=[],studentPeers=new Map(),teacherPeers=new Map();
 studentPeers.set('s',{close(){assert.equal(studentPeers.size,0);closed.push('student');}});
 teacherPeers.set('s',{close(){assert.equal(teacherPeers.size,0);closed.push('teacher');}});
 let handler;const stream={active:true};
 const context={socket:{on:(n,fn)=>{handler=fn;}},console:{warn(){}},teacherStream:stream,
 studentPeers,teacherPeers,studentNames:new Map([['s','HS']]),studentRetryTimers:new Map([['s',1]]),studentConnectTimeouts:new Map([['s',2]]),studentRetryCounts:new Map([['s',3]]),pendingStudentIce:new Map([['s',[]]]),pendingTeacherIce:new Map([['s',[]]]),clearTimeout:id=>timers.push(id),setStudentStatus:(...a)=>statuses.push(a)};
 const start=teacher.indexOf('socket.on(',teacher.indexOf('// SOCKET DISCONNECT'));
 vm.runInNewContext(teacher.slice(start,teacher.indexOf('// TEACHER READY',start)),context);
 handler('transport close');
 assert.deepEqual(closed,['student','teacher']);assert.deepEqual(timers,[1,2]);assert.equal(context.teacherStream,stream);
 assert.equal(context.studentNames.size,1);assert.equal(context.studentRetryCounts.size,0);assert.equal(statuses.length,1);
});

test('end-class is never queued during an outage; deliberate closure while online disables automatic rejoin',()=>{
 let click;const sent=[],alerts=[];
 const context={endClassButton:{addEventListener:(n,fn)=>{click=fn;}},socket:{connected:false,emit:n=>sent.push(n)},alert:m=>alerts.push(m),confirm:()=>true,teacherClassJoined:true,
 teacherStream:null,studentRetryTimers:new Map(),studentConnectTimeouts:new Map(),studentRetryCounts:new Map(),pendingStudentIce:new Map(),pendingTeacherIce:new Map(),studentPeers:new Map(),teacherPeers:new Map(),studentNames:new Map(),studentsBox:{},updateCount(){},empty:{style:{}}};
 const start=teacher.indexOf('endClassButton.addEventListener(');
 vm.runInNewContext(teacher.slice(start,teacher.indexOf('// PAGE CLOSE',start)),context);
 click();assert.equal(sent.length,0);assert.equal(alerts.length,1);assert.equal(context.teacherClassJoined,true);
 context.socket.connected=true;click();assert.deepEqual(sent,['end-class']);assert.equal(context.teacherClassJoined,false);
});

test('server teacher disconnect retains student records and emits only the offline notice',()=>{
 const students=new Map([['s',{studentId:1,classCode:'9A3',resumeToken:'secret'}]]),teachersByClass=new Map([['9A3','gv']]),events=[];
 let handler;const context={socket:{id:'gv',data:{role:'teacher',classCode:'9A3'},on:(n,fn)=>{handler=fn;},to:()=>({emit:n=>events.push(n)})},console:{log(){}},students,teachersByClass,examTeachers:new Set(),revisionModule:{refreshFamilyAccess(){}},normalizeClassCode:c=>c,getClassRoom:c=>'class:'+c,classroomPresence:{disconnect(){assert.fail('teacher loss must not remove a student');}}};
 const start=server.indexOf('socket.on(',server.indexOf('// DISCONNECT',server.indexOf('// END CLASS')));
 const end=server.indexOf('\n    }\n);',start);
 vm.runInNewContext(server.slice(start,end),context);handler('ping timeout');
 assert.equal(students.size,1);assert.equal(teachersByClass.size,0);assert.deepEqual(events,['teacher-offline']);
});

test('classroom presence broadcasts never disclose a resume credential to classmates',()=>{
 let notify;const emitted=[];
 const start=server.indexOf('const classroomPresence =');const end=server.indexOf('const teachersByClass',start);
 vm.runInNewContext(server.slice(start,end),{students:new Map(),require:()=>((students,cb)=>{notify=cb;}),io:{to:()=>({emit:(event,data)=>emitted.push(data)})},getClassRoom:c=>c,revisionModule:{refreshFamilyAccess(){}}});
 notify('student-connection-paused','s',{studentId:1,classCode:'9A3',resumeToken:'private'});
 assert.equal(emitted[0].resumeToken,undefined);assert.equal(emitted[0].studentId,1);
});

test('only the current teacher can deliberately end a class and revoke its retained student sessions',()=>{
 const students=new Map([['s',{classCode:'9A3',resumeToken:'secret'}],['other',{classCode:'9A2'}]]),teachersByClass=new Map([['9A3','current']]),events=[];
 let handler;const socket={id:'stale',data:{role:'teacher',classCode:'9A3'},on:(name,fn)=>{handler=fn;},to:()=>({emit:name=>events.push(name)})};
 const context={socket,students,teachersByClass,examTeachers:new Set(),normalizeClassCode:c=>c,getClassRoom:c=>c,console:{log(){}},resourceStore:{clear(){}},io:{to:()=>({emit(){}})},revisionModule:{refreshFamilyAccess(){}},classroomPresence:{remove:id=>students.delete(id)}};
 const start=server.indexOf('socket.on(',server.indexOf('// END CLASS'));
 vm.runInNewContext(server.slice(start,server.indexOf('// DISCONNECT',start)),context);
 handler();assert.equal(students.size,2);assert.equal(events.length,0);
 socket.id='current';handler();assert.deepEqual(events,['class-ended']);assert.equal(students.has('s'),false);assert.equal(students.has('other'),true);assert.equal(teachersByClass.size,0);
});
