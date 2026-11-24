'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');

function admin({token='admin',failure=false,htmlSave=false,verifyFailure=false,mismatch=false}={}) {
    const nodes={},calls=[];let settings={enabled:true,revisionMode:false},posted=false;
    const element=id=>nodes[id]||={disabled:false,checked:false,dataset:{},handlers:{},addEventListener(type,handler){this.handlers[type]=handler;}};
    const context={window:{addEventListener(){}},sessionStorage:{getItem:()=>token},document:{getElementById:element,querySelector:()=>element('menu')},fetch:async(url,options)=>{
        calls.push({url,options});
        if(options.method==='POST'){posted=true;if(!htmlSave&&!failure)settings=mismatch?{enabled:true,revisionMode:false}:JSON.parse(options.body);}
        if((htmlSave&&options.method==='POST')||(verifyFailure&&posted&&options.method==='GET'))return{status:403,ok:false,json:async()=>{throw Error('HTML fixture');}};
        return{status:failure?401:200,ok:!failure,json:async()=>failure?{success:false,message:'Phiên hết hạn'}:{success:true,settings:{...settings}}};
    }};
    vm.runInNewContext(fs.readFileSync('public/js/classroom-access-admin.js','utf8'),context);
    return{nodes,calls,load:()=>element('menu').handlers.click(),change:()=>element('revisionPeriodEnabled').handlers.change(),save:()=>element('classroomAccessForm').handlers.submit({preventDefault(){}})};
}

test('admin saves with POST through the proxy, verifies via GET and distinguishes unsaved preview from applied state',async()=>{
    const h=admin();await h.save();assert.equal(h.calls.length,0);await h.load();
    assert.equal(h.nodes.classroomAccessEnabled.checked,true);assert.equal(h.nodes.classroomAccessSave.disabled,true,'unchanged state cannot write');
    assert.equal(h.calls[0].options.headers.Authorization,'Bearer admin');assert.equal(h.calls[0].options.cache,'no-store');
    h.nodes.revisionPeriodEnabled.checked=true;h.nodes.classroomAccessEnabled.checked=false;h.change();
    assert.equal(h.nodes.revisionPeriodState.textContent,'Sẽ bật');assert.equal(h.nodes.classroomAccessMessage.dataset.state,'dirty');assert.equal(h.nodes.classroomAccessSave.disabled,false);
    await h.save();assert.deepEqual(h.calls.map(c=>c.options.method),['GET','POST','GET']);
    assert.deepEqual(JSON.parse(h.calls[1].options.body),{enabled:false,revisionMode:true});
    assert.equal(h.nodes.revisionPeriodState.textContent,'Đang bật');assert.equal(h.nodes.classroomAccessSave.disabled,true);assert.equal(h.nodes.classroomAccessMessage.dataset.state,'success');
});

test('HTML or unverifiable saves never report success, automatically replay writes, or keep editing enabled',async()=>{
    for(const options of [{htmlSave:true},{verifyFailure:true}]){
        const h=admin(options);await h.load();h.nodes.revisionPeriodEnabled.checked=true;h.change();await h.save();
        assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1);assert.equal(h.nodes.classroomAccessMessage.dataset.state,'error');assert.match(h.nodes.classroomAccessMessage.textContent,/Chưa xác nhận/);
        assert.equal(h.nodes.classroomAccessSave.disabled,true);assert.equal(h.nodes.revisionPeriodEnabled.disabled,true);assert.equal(h.nodes.classroomAccessReload.disabled,false);
        await h.save();assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1);
    }
    const conflict=admin({mismatch:true});await conflict.load();conflict.nodes.revisionPeriodEnabled.checked=true;conflict.change();await conflict.save();
    assert.equal(conflict.nodes.revisionPeriodEnabled.checked,false);assert.equal(conflict.nodes.classroomAccessMessage.dataset.state,'error');assert.match(conflict.nodes.classroomAccessMessage.textContent,/cài đặt khác/);
});

test('admin cannot overwrite settings after a failed or unauthenticated load',async()=>{
    for(const options of [{token:''},{failure:true}]){
        const h=admin(options);await h.load();assert.equal(h.nodes.classroomAccessEnabled.disabled,true);assert.equal(h.nodes.classroomAccessSave.disabled,true);
        const before=h.calls.length;await h.save();assert.equal(h.calls.length,before);assert.ok(h.nodes.classroomAccessMessage.textContent);
    }
});

test('a rejected socket join makes the reason visible and stops sharing before allowing another attempt',()=>{
    const code=fs.readFileSync('public/js/student.js','utf8');
    const start=code.lastIndexOf('socket.on(',code.indexOf('"student-join-error",'));
    const end=code.indexOf('// CHẤT LƯỢNG MÀN HÌNH HS',start);
    let handler,stopped=0;
    const context={socket:{on:(name,fn)=>{handler=fn;}},console:{error(){}},joinedClass:true,
        window:{dispatchEvent(){},FPTBNFamilySession:{stop(){}}},CustomEvent:class{},
        screenStream:{getTracks:()=>[{stop(){stopped++;}}]},closeStudentPeer(){},closeTeacherPeer(){},
        classroom:{style:{}},joinPage:{style:{}},statusBox:{hidden:true},button:{disabled:true}};
    vm.runInNewContext(code.slice(start,end),context);
    handler({message:'Chờ giáo viên mở lớp'});
    assert.equal(context.statusBox.hidden,false);assert.match(context.statusBox.textContent,/Chờ giáo viên/);
    assert.equal(context.joinedClass,false);assert.equal(stopped,1);assert.equal(context.button.disabled,false);
});
