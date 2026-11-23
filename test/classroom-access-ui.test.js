'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');

function admin({token='admin',failure=false}={}) {
    const nodes={}, calls=[];
    const element=id => nodes[id] ||= {disabled:false,checked:false,style:{},handlers:{},addEventListener(type,handler){this.handlers[type]=handler;}};
    const context={sessionStorage:{getItem:()=>token}, document:{getElementById:element,querySelector:()=>element('menu')},
        fetch:async(url,options)=>{calls.push({url,options});return {ok:!failure,json:async()=>failure?{success:false,message:'Phiên hết hạn'}:{success:true,settings:{enabled:options.method==='PUT'?JSON.parse(options.body).enabled:true}}};}};
    vm.runInNewContext(fs.readFileSync('public/js/classroom-access-admin.js','utf8'),context);
    return {nodes,calls,load:()=>element('menu').handlers.click(),save:()=>element('classroomAccessForm').handlers.submit({preventDefault(){}})};
}

test('admin loads the server setting before editing, saves an explicit toggle and uses its session token',async()=>{
    const h=admin();await h.save();assert.equal(h.calls.length,0);
    await h.load();assert.equal(h.nodes.classroomAccessEnabled.checked,true);assert.equal(h.nodes.classroomAccessSave.disabled,false);
    assert.equal(h.calls[0].options.headers.Authorization,'Bearer admin');assert.equal(h.calls[0].options.cache,'no-store');
    h.nodes.classroomAccessEnabled.checked=false;await h.save();
    assert.equal(JSON.parse(h.calls.at(-1).options.body).enabled,false);
    assert.match(h.nodes.classroomAccessMessage.textContent,/Đã lưu/);
});

test('admin cannot overwrite settings after a failed or unauthenticated load',async()=>{
    for(const options of [{token:''},{failure:true}]) {
        const h=admin(options);await h.load();
        assert.equal(h.nodes.classroomAccessEnabled.disabled,true);
        assert.equal(h.nodes.classroomAccessSave.disabled,true);
        const before=h.calls.length;await h.save();assert.equal(h.calls.length,before);
        assert.ok(h.nodes.classroomAccessMessage.textContent);
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
