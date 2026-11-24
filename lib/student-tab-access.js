'use strict';
const {isSchoolTime} = require('./classroom-access');
const fs = require('node:fs');
const path = require('node:path');
const keys = ['review','live','exam','print'];
const grades = [3,4,5,6,7,8,9,10,11,12];
const locked = () => Object.fromEntries(keys.map(key=>[key,false]));
const all = () => Object.fromEntries(['class',...keys].map(key => [key,true]));
const normalize = code => String(code || '').trim().toUpperCase();
const bad = (message,status=400) => Object.assign(Error(message),{status});

function validateTabs(tabs) {
    if (!tabs || typeof tabs!=='object' || keys.some(key=>typeof tabs[key]!=='boolean') || Object.keys(tabs).some(key=>!keys.includes(key)&&key!=='class') || (Object.hasOwn(tabs,'class')&&tabs.class!==true)) throw bad('Chọn quyền hợp lệ; Học tại lớp luôn được mở.');
    return Object.fromEntries(keys.map(key=>[key,tabs[key]]));
}

function validateGradeTabs(tabs,legacy=false) {
    const gradeKeys=['class',...keys];
    if(!tabs||typeof tabs!=='object'||Array.isArray(tabs)||Object.keys(tabs).some(key=>!gradeKeys.includes(key)))throw bad('Chọn quyền hợp lệ cho cả năm tab.');
    // Version 2 stored only four keys because classroom access was always allowed.
    const input={...(legacy?{class:true}:{}),...tabs};
    if(gradeKeys.some(key=>typeof input[key]!=='boolean'))throw bad('Chọn quyền hợp lệ cho cả năm tab.');
    return Object.fromEntries(gradeKeys.map(key=>[key,input[key]]));
}

function createController({now=()=>new Date(),notify=()=>{},file,bypass=()=>false}={}) {
    const sessions=new Map(),classGrades=new Map();
    let presets={},gradeTabs={};
    if(file)try{
        const stored=JSON.parse(fs.readFileSync(file,'utf8'));
        for(const [key,tabs] of Object.entries(stored.presets||{}))if(/^[1-9]\d*:[1-9]\d*$/.test(key))presets[key]=validateTabs(tabs);
        for(const grade of grades)if(Object.hasOwn(stored.grades||{},grade))gradeTabs[grade]=validateGradeTabs(stored.grades[grade],true);
    }catch(error){if(error.code!=='ENOENT')console.error('Student tab presets: using locked defaults for unavailable settings.');}
    const preset=(teacherId,classId)=>presets[Number(teacherId)+':'+Number(classId)];
    function persist(next,nextGrades=gradeTabs){
        if(file){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file+'.tmp',JSON.stringify({version:3,presets:next,grades:nextGrades}),{mode:0o600});fs.renameSync(file+'.tmp',file);}
        presets=next;gradeTabs=nextGrades;
    }
    function view(code,grade) {
        code=normalize(code);
        if(grades.includes(Number(grade)))classGrades.set(code,Number(grade));
        const session=sessions.get(code),policy=gradeTabs[classGrades.get(code)];
        const controlled=Boolean((policy||session) && !bypass() && isSchoolTime(now()));
        return {controlled, tabs:controlled ? {class:true,...(policy||session.tabs)} : all()};
    }
    function publish(code) {notify(normalize(code),view(code));}
    return {
        view,
        gradePermissions() {return Object.fromEntries(grades.map(grade=>[grade,{class:true,...(gradeTabs[grade]||locked())}]));},
        configureGrades(input,rows=[]) {
            if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==grades.length||Object.keys(input).some(grade=>!grades.includes(Number(grade))))throw bad('Chọn quyền hợp lệ cho đủ khối 3–12.');
            const next=Object.fromEntries(grades.map(grade=>[grade,validateGradeTabs(input[grade])]));
            // Persist every grade together before changing live rights or broadcasting.
            persist(presets,next);
            for(const row of rows)if(grades.includes(Number(row.grade_level)))classGrades.set(normalize(row.class_code),Number(row.grade_level));
            for(const code of new Set([...classGrades.keys(),...sessions.keys()]))publish(code);
            return this.gradePermissions();
        },
        open(code,teacherId,classId=null,grade=null) {
            code=normalize(code);
            if (['EXAM','CLB'].includes(code)) return;
            if(grades.includes(Number(grade)))classGrades.set(code,Number(grade));
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
        configureMany(rows,teacherId,changes,isTeaching){
            if(!Array.isArray(rows)||!rows.length||rows.length>200)throw bad('Hãy chọn ít nhất một lớp.');
            if(!changes||typeof changes!=='object'||Array.isArray(changes)||!Object.keys(changes).length||Object.entries(changes).some(([key,value])=>!keys.includes(key)||typeof value!=='boolean'))throw bad('Hãy chọn quyền cần thay đổi.');
            if(new Set(rows.map(row=>Number(row.id))).size!==rows.length)throw bad('Danh sách lớp bị trùng.');
            const plans=rows.map(row=>{
                const code=normalize(row.class_code),session=sessions.get(code),teaching=isTeaching(code,teacherId);
                if(session&&(session.teacherId!==Number(teacherId)||!teaching))throw bad('Lớp '+code+' đang do giáo viên khác quản lý hoặc chưa kết nối lại. Chưa lưu thay đổi cho các lớp đã chọn.',403);
                const tabs={...(session?.tabs||preset(teacherId,row.id)||Object.fromEntries(keys.map(key=>[key,false]))),...changes};
                return{row,code,session,teaching,tabs};
            });
            const next={...presets};for(const p of plans)next[Number(teacherId)+':'+Number(p.row.id)]=p.tabs;
            // Validate the entire selection, then persist once before changing live sessions.
            persist(next);
            for(const p of plans)if(p.session)p.session.tabs={...p.tabs};
            for(const p of plans)if(p.session)publish(p.code);
            return{classes:plans.map(p=>this.describe(p.row,teacherId,p.teaching)),applied_count:plans.filter(p=>p.session&&p.teaching).length,staged_count:plans.filter(p=>!p.session).length};
        },
        assert(student,requestPath) {
            const route=String(requestPath||'').split('?')[0];
            const key=/^\/live(?:\/|$)/.test(route)?'live':/^\/exams(?:\/|$)/.test(route)?'exam':/^\/documents(?:\/|$)/.test(route)?'print':'review';
            if (!view(student.class_code,student.grade_level).tabs[key]) throw bad('Mục này đang khóa. Em vui lòng chờ giáo viên cấp quyền.',403);
        },
        refresh() {for (const code of new Set([...sessions.keys(),...classGrades.keys()])) publish(code);}
    };
}

function mountRoutes(app,{db,teacherTokens,adminTokens,controller,isTeaching}) {
    const admin=adminTokens?require('./admin-auth')({db,adminTokens}):null;
    const adminOnly=(req,res,next)=>admin?res.status(403).json({success:false,message:'Cài đặt quyền HS đã chuyển về trang admin.'}):next();
    async function teacher(req,res,next) {
        res.set('Cache-Control','no-store');
        const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim(),session=teacherTokens.get(token);
        if (!session || Date.now()-session.createdAt>=8*3600000) return res.status(401).json({success:false,message:'Phiên giáo viên đã hết hạn. Vui lòng đăng nhập lại.'});
        try {const [rows]=await db.query('SELECT id FROM teachers WHERE id=? AND is_active=1 LIMIT 1',[session.teacherId]);if(!rows.length)return res.status(403).json({success:false,message:'Tài khoản giáo viên không hoạt động.'});req.teacherId=session.teacherId;next();}
        catch {res.status(503).json({success:false,message:'Chưa xác thực được giáo viên. Vui lòng thử lại.'});}
    }
    if(admin){
        app.get('/api/admin/student-tab-access/grades',admin,(req,res)=>res.json({success:true,scope:'grade',grades:controller.gradePermissions()}));
        app.post('/api/admin/student-tab-access/grades',admin,async(req,res)=>{
            try{
                const [rows]=await db.query('SELECT c.id,c.class_code,c.grade_level FROM classes c JOIN school_years sy ON sy.id=c.school_year_id WHERE c.is_active=1 AND sy.is_current=1 ORDER BY c.grade_level,c.class_code');
                res.json({success:true,scope:'grade',grades:controller.configureGrades(req.body?.grades,rows)});
            }catch(error){res.status(error.status||500).json({success:false,message:error.status?error.message:'Chưa lưu được quyền theo khối. Vui lòng tải lại để kiểm tra.'});}
        });
    }
    app.get('/api/teacher/student-tab-access/grades',teacher,adminOnly,(req,res)=>{
        res.json({success:true,scope:'grade',grades:controller.gradePermissions()});
    });
    app.post('/api/teacher/student-tab-access/grades',teacher,adminOnly,async(req,res)=>{
        try {
            const [rows]=await db.query('SELECT c.id,c.class_code,c.grade_level FROM classes c JOIN school_years sy ON sy.id=c.school_year_id WHERE c.is_active=1 AND sy.is_current=1 ORDER BY c.grade_level,c.class_code');
            res.json({success:true,scope:'grade',grades:controller.configureGrades(req.body?.grades,rows)});
        } catch(error) {
            if(!error.status)console.error('Student grade tab save:',error.code||'GRADE_SAVE_ERROR');
            res.status(error.status||500).json({success:false,message:error.status?error.message:'Chưa lưu được quyền theo khối. Vui lòng tải lại để kiểm tra.'});
        }
    });
    app.get('/api/teacher/student-tab-access',teacher,adminOnly,async(req,res)=>{
        try {
            const [rows]=await db.query('SELECT c.id,c.class_code,c.grade_level FROM classes c JOIN school_years sy ON sy.id=c.school_year_id WHERE c.is_active=1 AND sy.is_current=1 ORDER BY c.grade_level,c.class_code');
            res.json({success:true,selection_mode:'multiple',classes:rows.map(row=>controller.describe(row,req.teacherId,isTeaching(normalize(row.class_code),req.teacherId)))});
        }catch(error){console.error('Student tab class list:',error.code||'CLASS_LIST_ERROR');res.status(503).json({success:false,message:'Chưa tải được danh sách lớp. Vui lòng bấm Tải lại.'});}
    });
    app.post('/api/teacher/student-tab-access/batch',teacher,adminOnly,async(req,res)=>{
        try{
            const input=req.body?.class_codes;
            if(!Array.isArray(input)||!input.length||input.length>200||input.some(code=>typeof code!=='string'||!code.trim()||code.trim().length>40))throw bad('Hãy tích chọn lớp cần áp dụng quyền.');
            const codes=input.map(normalize);
            if(new Set(codes).size!==codes.length)throw bad('Danh sách lớp bị trùng.');
            const [rows]=await db.query('SELECT c.id,c.class_code,c.grade_level FROM classes c JOIN school_years sy ON sy.id=c.school_year_id WHERE UPPER(c.class_code) IN (?) AND c.is_active=1 AND sy.is_current=1 ORDER BY c.grade_level,c.class_code',[codes]);
            if(rows.length!==codes.length||new Set(rows.map(row=>normalize(row.class_code))).size!==codes.length||rows.some(row=>!codes.includes(normalize(row.class_code))))throw bad('Có lớp không còn hoạt động trong năm học hiện tại. Vui lòng tải lại danh sách.',409);
            res.json({success:true,...controller.configureMany(rows,req.teacherId,req.body?.changes,isTeaching)});
        }catch(error){if(!error.status)console.error('Student tab batch save:',error.code||'BATCH_SAVE_ERROR');res.status(error.status||500).json({success:false,message:error.status?error.message:'Chưa lưu được quyền. Vui lòng thử lại; thay đổi chưa được xác nhận.'});}
    });
    app.put('/api/teacher/student-tab-access/:classCode',teacher,adminOnly,async(req,res)=>{
        try {
            const code=normalize(req.params.classCode);
            const [rows]=await db.query('SELECT c.id,c.class_code,c.grade_level FROM classes c JOIN school_years sy ON sy.id=c.school_year_id WHERE c.class_code=? AND c.is_active=1 AND sy.is_current=1 LIMIT 1',[code]);
            if(rows.length!==1)throw bad('Không tìm thấy lớp trong năm học hiện tại.',404);
            res.json({success:true,...controller.configure(rows[0],req.teacherId,req.body?.tabs,isTeaching(code,req.teacherId))});
        } catch(error) {res.status(error.status||500).json({success:false,message:error.status?error.message:'Không lưu được quyền học sinh.'});}
    });
}
module.exports={createController,mountRoutes};
