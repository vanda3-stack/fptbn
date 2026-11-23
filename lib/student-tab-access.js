'use strict';
const {isSchoolTime} = require('./classroom-access');
const fs = require('node:fs');
const path = require('node:path');
const keys = ['review','live','exam','print'];
const all = () => Object.fromEntries(['class',...keys].map(key => [key,true]));
const normalize = code => String(code || '').trim().toUpperCase();
const bad = (message,status=400) => Object.assign(Error(message),{status});

function validateTabs(tabs) {
    if (!tabs || typeof tabs!=='object' || keys.some(key=>typeof tabs[key]!=='boolean') || Object.keys(tabs).some(key=>!keys.includes(key)&&key!=='class') || (Object.hasOwn(tabs,'class')&&tabs.class!==true)) throw bad('Chọn quyền hợp lệ; Học tại lớp luôn được mở.');
    return Object.fromEntries(keys.map(key=>[key,tabs[key]]));
}

function createController({now=()=>new Date(),notify=()=>{},file}={}) {
    const sessions=new Map();
    let presets={};
    if(file)try{
        const stored=JSON.parse(fs.readFileSync(file,'utf8'));
        for(const [key,tabs] of Object.entries(stored.presets||{}))if(/^[1-9]\d*:[1-9]\d*$/.test(key))presets[key]=validateTabs(tabs);
    }catch(error){if(error.code!=='ENOENT')console.error('Student tab presets: using locked defaults for unavailable settings.');}
    const preset=(teacherId,classId)=>presets[Number(teacherId)+':'+Number(classId)];
    function persist(next){
        if(file){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file+'.tmp',JSON.stringify({version:1,presets:next}),{mode:0o600});fs.renameSync(file+'.tmp',file);}
        presets=next;
    }
    function view(code) {
        const session=sessions.get(normalize(code));
        const controlled=Boolean(session && isSchoolTime(now()));
        return {controlled, tabs:controlled ? {class:true,...session.tabs} : all()};
    }
    function publish(code) {notify(normalize(code),view(code));}
    return {
        view,
        open(code,teacherId,classId=null) {
            code=normalize(code);
            if (['EXAM','CLB'].includes(code)) return;
            if (sessions.get(code)?.teacherId !== Number(teacherId) || sessions.get(code)?.classId !== classId) sessions.set(code,{teacherId:Number(teacherId),classId,tabs:{...(preset(teacherId,classId)||Object.fromEntries(keys.map(key=>[key,false])))}});
            publish(code);
        },
        close(code) {sessions.delete(normalize(code));publish(code);},
        list(teacherId) {return Array.from(sessions,([code,s])=>({class_code:code,teacherId:s.teacherId,...view(code),permissions:{class:true,...s.tabs}})).filter(s=>s.teacherId===Number(teacherId)).map(({teacherId,...s})=>s);},
        save(code,teacherId,tabs) {
            code=normalize(code);
            const session=sessions.get(code);
            if (!session || session.teacherId!==Number(teacherId)) throw bad('Lớp này không thuộc phiên dạy của giáo viên.',403);
            session.tabs=validateTabs(tabs);publish(code);
            return {class_code:code,...view(code),permissions:{class:true,...session.tabs}};
        },
        describe(row,teacherId,isTeaching){
            const code=normalize(row.class_code),session=sessions.get(code),own=session?.teacherId===Number(teacherId);
            const state=!session?'ready':!own?'other_teacher':isTeaching?'teaching':'reconnecting';
            return {class_id:row.id,class_code:code,grade_level:row.grade_level,state,can_edit:state==='ready'||state==='teaching',...view(code),permissions:{class:true,...(session?session.tabs:preset(teacherId,row.id)||Object.fromEntries(keys.map(key=>[key,false])))}};
        },
        configure(row,teacherId,tabs,isTeaching){
            const code=normalize(row.class_code),session=sessions.get(code);
            if(session&&(session.teacherId!==Number(teacherId)||!isTeaching))throw bad('Lớp đang có phiên dạy khác hoặc giáo viên chưa kết nối lại. Chưa thể đổi quyền.',403);
            const validated=validateTabs(tabs);
            persist({...presets,[Number(teacherId)+':'+Number(row.id)]:validated});
            if(session){session.tabs={...validated};publish(code);}
            return {class:this.describe(row,teacherId,isTeaching),applied:Boolean(session&&isTeaching)};
        },
        assert(student,requestPath) {
            const route=String(requestPath||'').split('?')[0];
            const key=/^\/live(?:\/|$)/.test(route)?'live':/^\/exams(?:\/|$)/.test(route)?'exam':/^\/documents(?:\/|$)/.test(route)?'print':'review';
            if (!view(student.class_code).tabs[key]) throw bad('Mục này đang khóa. Em vui lòng chờ giáo viên cấp quyền.',403);
        },
        refresh() {for (const code of sessions.keys()) publish(code);}
    };
}

function mountRoutes(app,{db,teacherTokens,controller,isTeaching}) {
    async function teacher(req,res,next) {
        res.set('Cache-Control','no-store');
        const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim(),session=teacherTokens.get(token);
        if (!session || Date.now()-session.createdAt>=8*3600000) return res.status(401).json({success:false,message:'Phiên giáo viên đã hết hạn. Vui lòng đăng nhập lại.'});
        try {const [rows]=await db.query('SELECT id FROM teachers WHERE id=? AND is_active=1 LIMIT 1',[session.teacherId]);if(!rows.length)return res.status(403).json({success:false,message:'Tài khoản giáo viên không hoạt động.'});req.teacherId=session.teacherId;next();}
        catch {res.status(503).json({success:false,message:'Chưa xác thực được giáo viên. Vui lòng thử lại.'});}
    }
    app.get('/api/teacher/student-tab-access',teacher,async(req,res)=>{
        try {
            const [rows]=await db.query('SELECT c.id,c.class_code,c.grade_level FROM classes c JOIN school_years sy ON sy.id=c.school_year_id WHERE c.is_active=1 AND sy.is_current=1 ORDER BY c.grade_level,c.class_code');
            res.json({success:true,classes:rows.map(row=>controller.describe(row,req.teacherId,isTeaching(normalize(row.class_code),req.teacherId)))});
        }catch{res.status(503).json({success:false,message:'Chưa tải được danh sách lớp. Vui lòng thử lại.'});}
    });
    app.put('/api/teacher/student-tab-access/:classCode',teacher,async(req,res)=>{
        try {
            const code=normalize(req.params.classCode);
            const [rows]=await db.query('SELECT c.id,c.class_code,c.grade_level FROM classes c JOIN school_years sy ON sy.id=c.school_year_id WHERE c.class_code=? AND c.is_active=1 AND sy.is_current=1 LIMIT 1',[code]);
            if(rows.length!==1)throw bad('Không tìm thấy lớp trong năm học hiện tại.',404);
            res.json({success:true,...controller.configure(rows[0],req.teacherId,req.body?.tabs,isTeaching(code,req.teacherId))});
        } catch(error) {res.status(error.status||500).json({success:false,message:error.status?error.message:'Không lưu được quyền học sinh.'});}
    });
}
module.exports={createController,mountRoutes};
