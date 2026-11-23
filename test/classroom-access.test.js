'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {isSchoolTime, createPolicy, mountAdminRoutes} = require('../lib/classroom-access');
const clbRoom = require('../lib/clb-room');
const canResumeClass = require('../lib/classroom-resume');
const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const localDate = value => new Date(value + '+07:00');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fptbn-access-'));
    t.after(() => fs.rmSync(root, {recursive:true, force:true}));
    let instant = localDate('2026-11-23T08:00:00');
    const online = new Set();
    const file = path.join(root, 'data/access.json');
    const options = {file, isTeacherOnline:code => online.has(code), now:() => instant};
    return {root, file, online, options, policy:createPolicy(options), time:value => {instant = localDate(value);}};
}
function response() {
    return {statusCode:200, headers:{}, set(name,value) {this.headers[name]=value;return this;}, status(code) {this.statusCode=code;return this;}, json(body) {this.body=body;return this;}};
}

test('Vietnam school hours include 08:00 and exclude 17:00 on every weekday, regardless of host timezone', () => {
    for (const day of [23,24,25,26,27]) {
        for (const [time,expected] of [['00:00:00',false],['07:59:59',false],['08:00:00',true],['12:00:00',true],['16:59:59',true],['17:00:00',false],['23:59:59',false]]) {
            assert.equal(isSchoolTime(localDate(`2026-11-${day}T${time}`)), expected, `${day} ${time}`);
        }
    }
    for (const day of [28,29]) for (const time of ['00:00:00','08:00:00','12:00:00','16:59:59','17:00:00']) {
        assert.equal(isSchoolTime(localDate(`2026-11-${day}T${time}`)), false);
    }
    assert.equal(isSchoolTime(new Date('2026-11-23T01:00:00Z')), true);
    assert.equal(isSchoolTime(new Date('2026-11-23T10:00:00Z')), false);
});

test('enabled by default, access requires the correct classroom teacher only during school hours', t => {
    const h = fixture(t);
    assert.equal(h.policy.settings().enabled, true);
    assert.equal(h.policy.check('9A3').code, 'CLASS_NOT_OPEN');
    h.online.add('9A2');
    assert.equal(h.policy.check('9A3').allowed, false);
    h.online.add('9A3');
    assert.equal(h.policy.check(' 9a3 ').allowed, true);
    h.online.clear();
    for (const value of ['2026-11-23T07:59:59','2026-11-23T17:00:00','2026-11-28T10:00:00','2026-11-29T10:00:00']) {
        h.time(value);
        assert.equal(h.policy.check('9A3').allowed, true);
    }
});

test('admin setting persists across restart, rejects invalid toggles and keeps active setting when saving fails', t => {
    const h = fixture(t);
    h.policy.save({enabled:false});
    assert.equal(h.policy.check('9A3').allowed, true);
    assert.equal(createPolicy(h.options).settings().enabled, false);
    for (const value of [{}, null, {enabled:'false'}, {enabled:0}]) assert.throws(() => h.policy.save(value), {status:400});
    h.policy.save({enabled:true});
    fs.mkdirSync(h.file + '.tmp');
    assert.throws(() => h.policy.save({enabled:false}));
    assert.equal(h.policy.check('9A3').allowed, false);
    assert.equal(createPolicy(h.options).settings().enabled, true);
});

test('stale, disconnected and wrong-room teacher sockets cannot open a class; EXAM accepts any active proctor', () => {
    const start = source.indexOf('function isClassTeacherOnline(');
    const end = source.indexOf('const classroomAccess =', start);
    const sockets = new Map(), teachersByClass = new Map([['9A3','gv']]), examTeachers = new Set(['exam1','exam2']);
    const context = {io:{sockets:{sockets}}, teachersByClass, examTeachers};
    vm.runInNewContext(source.slice(start,end), context);
    assert.equal(context.isClassTeacherOnline('9A3'), false);
    sockets.set('gv', {connected:false,data:{role:'teacher',classCode:'9A3'}});
    assert.equal(context.isClassTeacherOnline('9A3'), false);
    sockets.get('gv').connected=true;sockets.get('gv').data.classCode='9A2';
    assert.equal(context.isClassTeacherOnline('9A3'), false);
    sockets.get('gv').data.classCode='9A3';
    assert.equal(context.isClassTeacherOnline('9A3'), true);
    sockets.set('exam2', {connected:true,data:{role:'teacher',classCode:'EXAM'}});
    assert.equal(context.isClassTeacherOnline('EXAM'), true);
    sockets.get('exam2').data.role='student';
    assert.equal(context.isClassTeacherOnline('EXAM'), false);
});

test('settings API checks an unexpired server-issued admin session and active admin before reads or writes', async t => {
    const h = fixture(t), routes = {}, tokens = new Map([['admin',{adminId:7,createdAt:Date.now()}],['expired',{adminId:7,createdAt:Date.now()-8*3600000}]]);
    let active = true;
    mountAdminRoutes({get:(p,...handlers) => routes['GET '+p]=handlers, put:(p,...handlers) => routes['PUT '+p]=handlers}, {
        policy:h.policy, adminTokens:tokens, db:{query:async () => [active ? [{id:7}] : []]}
    });
    async function request(method, token, body) {
        const req={headers:{authorization:token ? 'Bearer '+token : ''},body}, res=response(), [auth, handler]=routes[method+' /api/admin/classroom-access'];
        await auth(req,res,() => handler(req,res));
        return res;
    }
    for (const token of ['', 'fake', 'expired']) assert.equal((await request('PUT',token,{enabled:false})).statusCode,401);
    assert.equal(h.policy.settings().enabled,true);
    active=false;assert.equal((await request('PUT','admin',{enabled:false})).statusCode,403);
    active=true;
    assert.equal((await request('GET','admin')).headers['Cache-Control'],'no-store');
    assert.equal((await request('PUT','admin',{enabled:'false'})).statusCode,400);
    assert.equal((await request('PUT','admin',{enabled:false})).body.settings.enabled,false);
    assert.equal((await request('GET','admin')).body.settings.enabled,false);
});

function loginHandler(policy) {
    const start=source.indexOf('app.post("/api/student/login",');
    const end=source.indexOf('// CLASS / ROOM STATE',start);
    let handler;
    vm.runInNewContext(source.slice(start,end), {app:{post:(route,fn) => {handler=fn;}}, clbRoom, classroomAccess:policy,
        db:{query:async () => [[{student_id:1,student_code:'FBN12345',full_name:'HS test',class_code:'9A3',class_id:10}]]}, console});
    return async body => {const res=response();await handler({body},res);return res;};
}

test('HTTP entry rejects a closed class, ignores spoofed class code, and checks the selected EXAM or CLB room', async t => {
    const h=fixture(t), login=loginHandler(h.policy);
    let res=await login({student_code:'FBN12345',classCode:'9A2'});
    assert.equal(res.statusCode,403);assert.equal(res.body.code,'CLASS_NOT_OPEN');
    h.online.add('9A2');assert.equal((await login({student_code:'FBN12345',classCode:'9A2'})).statusCode,403);
    h.online.add('EXAM');
    assert.equal((await login({student_code:'FBN12345',examMode:true})).statusCode,200);
    assert.equal((await login({student_code:'FBN12345',clbMode:true})).statusCode,403);
    h.online.add('CLB');assert.equal((await login({student_code:'FBN12345',clbMode:true})).statusCode,200);
    h.online.clear();h.time('2026-11-23T17:00:00');
    res=await login({student_code:'FBN12345'});
    assert.equal(res.statusCode,200);assert.equal(res.body.student.class_code,'9A3');
});

function socketHandler(policy, beforeLookup = () => {}, {students=new Map(), sockets=new Map(), id='new'} = {}) {
    const start=source.indexOf('socket.on(',source.indexOf('// STUDENT JOIN'));
    const end=source.indexOf('// STUDENT SCREEN READY',start);
    let handler;
    const events=[], rooms=[];
    const socket={id,data:{},connected:true,handshake:{headers:{}}, on:(event,fn) => {if(event==='student-join')handler=fn;},emit:(event,data) => events.push({event,data}),join:room => rooms.push(room),to:() => ({emit(){}})};
    vm.runInNewContext(source.slice(start,end), {socket,students,clbRoom,canResumeClass,crypto,classroomAccess:policy,
        db:{execute:async () => {beforeLookup();return [[{student_id:1,student_code:'FBN12345',full_name:'HS test',class_code:'9A3',class_id:10}]];}},
        normalizeClassCode:s=>String(s).trim().toUpperCase(),getClassRoom:code=>'class:'+code,
        classroomPresence:{remove:id=>students.delete(id)},io:{sockets:{sockets}},revisionModule:{refreshFamilyAccess(){}},identifyStudentDevice:()=> 'desktop',
        examTeachers:new Set(),teachersByClass:new Map(),console:{log(){},error(){}}});
    return {socket,students,events,rooms,join:body => handler({studentId:1,...body})};
}

test('direct socket entry and reconnect cannot bypass the rule; denial leaves no room membership or student record', async t => {
    const h=fixture(t), s=socketHandler(h.policy);
    await s.join({classCode:'9A2'});
    assert.equal(s.events.at(-1).data.code,'CLASS_NOT_OPEN');
    assert.equal(s.rooms.length,0);assert.equal(s.students.size,0);assert.equal(s.socket.data.role,undefined);
    h.online.add('9A3');await s.join({});
    assert.deepEqual(s.rooms,['class:9A3']);assert.equal(s.students.size,1);
    assert.equal(s.events.at(-1).event,'class-info');
    h.online.clear();
    const reconnect=socketHandler(h.policy);await reconnect.join({});
    assert.equal(reconnect.events.at(-1).data.code,'CLASS_NOT_OPEN');
});

test('a confirmed student reconnects during teacher outage with the same private session credential', async t => {
    const h=fixture(t), students=new Map(), sockets=new Map();h.online.add('9A3');
    const first=socketHandler(h.policy,undefined,{students,sockets,id:'old'});
    await first.join({});const token=first.events.at(-1).data.resumeToken;
    assert.match(token,/^[a-f0-9]{64}$/);sockets.set('old',first.socket);
    h.online.clear();first.socket.connected=false;
    const next=socketHandler(h.policy,undefined,{students,sockets,id:'next'});
    await next.join({resumeToken:token});
    assert.deepEqual(next.rooms,['class:9A3']);assert.equal(students.has('old'),false);
    assert.equal(next.events.at(-1).data.resumeToken,token,'do not rotate into a credential lost with its acknowledgement');
    assert.equal(next.events.at(-1).data.teacherOnline,false);
    sockets.set('next',next.socket);
    const duplicate=socketHandler(h.policy,undefined,{students,sockets,id:'duplicate'});
    h.online.add('9A3');await duplicate.join({});assert.equal(duplicate.rooms.length,0,'new login still cannot replace an active session');h.online.clear();
    let disconnected=0;next.socket.disconnect=()=>{disconnected++;next.socket.connected=false;};
    const fast=socketHandler(h.policy,undefined,{students,sockets,id:'fast'});
    await fast.join({resumeToken:token});assert.deepEqual(fast.rooms,['class:9A3']);assert.equal(disconnected,1);
    assert.equal(students.size,1,'fast continuation replaces, rather than duplicates, its old connection');
    const forged=socketHandler(h.policy,undefined,{students,sockets,id:'forged'});
    await forged.join({resumeToken:'0'.repeat(64)});assert.equal(forged.events.at(-1).data.code,'CLASS_NOT_OPEN');
    await forged.join({resumeToken:token,clbMode:true});assert.equal(forged.rooms.length,0,'cannot move a retained session to another room');
    students.clear();
    await forged.join({resumeToken:token});assert.equal(forged.events.at(-1).data.code,'CLASS_NOT_OPEN','end-class or expiry revokes continuation');
});

test('continuation is bound to both the student and current enrollment',()=>{
    const token='a'.repeat(64),entry={resumeToken:token,studentId:1,classId:10,classCode:'9A3'};
    const student={student_id:1,class_id:10,roomCode:'9A3'};
    assert.equal(canResumeClass(entry,student,token),true);
    for(const update of [{student_id:2},{class_id:20},{roomCode:'CLB'}]) assert.equal(canResumeClass(entry,{...student,...update},token),false);
    assert.equal(canResumeClass(undefined,student,token),false);
    assert.equal(canResumeClass(entry,student,{toString:()=>token}),false);
});

test('a teacher leaving during lookup blocks the join; off-hours entry remains available for review', async t => {
    const h=fixture(t);h.online.add('9A3');
    const racing=socketHandler(h.policy, () => h.online.clear());
    await racing.join({});assert.equal(racing.rooms.length,0);
    for (const instant of ['2026-11-23T07:59:59','2026-11-23T17:00:00','2026-11-28T09:00:00']) {
        h.time(instant);const s=socketHandler(h.policy);await s.join({});
        assert.deepEqual(s.rooms,['class:9A3']);assert.equal(s.events.at(-1).event,'class-info');
    }
});

test('successful admin login issues a new opaque session token without changing the login credentials', async () => {
    const start=source.indexOf('app.post("/api/admin/login",');
    const end=source.indexOf('// ADMIN - PREVIEW STUDENT EXCEL',start);
    let handler;const adminLoginTokens=new Map();
    vm.runInNewContext(source.slice(start,end), {app:{post:(p,fn)=>{handler=fn;}},adminLoginTokens,crypto,console,
        db:{query:async()=>[[{id:7,username:'test-admin',full_name:'Test',password_hash:'fixture-only',is_active:1}]]}});
    const denied=response();await handler({body:{username:'test-admin',password:'wrong'}},denied);
    assert.equal(denied.statusCode,401);assert.equal(adminLoginTokens.size,0);
    const allowed=response();await handler({body:{username:'test-admin',password:'fixture-only'}},allowed);
    assert.match(allowed.body.token,/^[a-f0-9]{64}$/);
    assert.equal(adminLoginTokens.get(allowed.body.token).adminId,7);
    assert.equal(allowed.body.admin.password_hash,undefined);
});
