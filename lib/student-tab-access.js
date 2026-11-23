'use strict';
const {isSchoolTime} = require('./classroom-access');
const keys = ['review','live','exam','print'];
const all = () => Object.fromEntries(['class',...keys].map(key => [key,true]));
const normalize = code => String(code || '').trim().toUpperCase();
const bad = (message,status=400) => Object.assign(Error(message),{status});

function createController({now=()=>new Date(),notify=()=>{}}={}) {
    const sessions=new Map();
    function view(code) {
        const session=sessions.get(normalize(code));
        const controlled=Boolean(session && isSchoolTime(now()));
        return {controlled, tabs:controlled ? {class:true,...session.tabs} : all()};
    }
    function publish(code) {notify(normalize(code),view(code));}
    return {
        view,
        open(code,teacherId) {
            code=normalize(code);
            if (['EXAM','CLB'].includes(code)) return;
            if (sessions.get(code)?.teacherId !== Number(teacherId)) sessions.set(code,{teacherId:Number(teacherId),tabs:Object.fromEntries(keys.map(key=>[key,false]))});
            publish(code);
        },
        close(code) {sessions.delete(normalize(code));publish(code);},
        list(teacherId) {return Array.from(sessions,([code,s])=>({class_code:code,teacherId:s.teacherId,...view(code),permissions:{class:true,...s.tabs}})).filter(s=>s.teacherId===Number(teacherId)).map(({teacherId,...s})=>s);},
        save(code,teacherId,tabs) {
            code=normalize(code);
            const session=sessions.get(code);
            if (!session || session.teacherId!==Number(teacherId)) throw bad('Lớp này không thuộc phiên dạy của giáo viên.',403);
            if (!tabs || typeof tabs!=='object' || keys.some(key=>typeof tabs[key]!=='boolean') || Object.keys(tabs).some(key=>!keys.includes(key)&&key!=='class') || tabs.class===false) throw bad('Chọn quyền hợp lệ; Học tại lớp luôn được mở.');
            session.tabs=Object.fromEntries(keys.map(key=>[key,tabs[key]]));publish(code);
            return {class_code:code,...view(code),permissions:{class:true,...session.tabs}};
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
    app.get('/api/teacher/student-tab-access',teacher,(req,res)=>res.json({success:true,classes:controller.list(req.teacherId)}));
    app.put('/api/teacher/student-tab-access/:classCode',teacher,(req,res)=>{
        try {
            if (!isTeaching(normalize(req.params.classCode),req.teacherId)) throw bad('Giáo viên cần mở đúng lớp trên trang giám sát trước khi đổi quyền.',403);
            res.json({success:true,class:controller.save(req.params.classCode,req.teacherId,req.body?.tabs)});
        } catch(error) {res.status(error.status||500).json({success:false,message:error.status?error.message:'Không lưu được quyền học sinh.'});}
    });
}
module.exports={createController,mountRoutes};
