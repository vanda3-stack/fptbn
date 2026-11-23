'use strict';
const fs = require('node:fs');
const path = require('node:path');

const schedule = Object.freeze({timeZone:'Asia/Ho_Chi_Minh', weekdays:[1,2,3,4,5], startTime:'08:00', endTime:'17:00'});
const clock = new Intl.DateTimeFormat('en-GB', {timeZone:schedule.timeZone, weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});

function isSchoolTime(date = new Date()) {
    const parts = Object.fromEntries(clock.formatToParts(date).map(part => [part.type, part.value]));
    const minutes = Number(parts.hour) * 60 + Number(parts.minute);
    return ['Mon','Tue','Wed','Thu','Fri'].includes(parts.weekday) && minutes >= 8*60 && minutes < 17*60;
}

function createPolicy({file, isTeacherOnline, now = () => new Date()}) {
    let enabled = true;
    try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (typeof saved.enabled !== 'boolean') throw Error('Invalid classroom access setting');
        enabled = saved.enabled;
    } catch (error) {
        // A missing or damaged setting must not turn off school-hour supervision.
        if (error.code !== 'ENOENT') console.error('Classroom access setting: using enabled default.');
    }
    const settings = () => ({enabled, ...schedule, weekdays:[...schedule.weekdays]});
    return {
        settings,
        save(input) {
            if (typeof input?.enabled !== 'boolean') throw Object.assign(Error('Chọn bật hoặc tắt quy định vào lớp.'), {status:400});
            fs.mkdirSync(path.dirname(file), {recursive:true, mode:0o700});
            fs.writeFileSync(file + '.tmp', JSON.stringify({enabled:input.enabled}), {mode:0o600});
            fs.renameSync(file + '.tmp', file);
            enabled = input.enabled;
            return settings();
        },
        check(classCode) {
            const code = String(classCode || '').trim().toUpperCase();
            const schoolHours = isSchoolTime(now());
            const allowed = !enabled || !schoolHours || Boolean(code && isTeacherOnline(code));
            return {allowed, schoolHours, ...(!allowed ? {
                code:'CLASS_NOT_OPEN',
                message:'Chưa thể vào lớp. Em vui lòng chờ giáo viên mở lớp.'
            } : {})};
        }
    };
}

function mountAdminRoutes(app, {db, adminTokens, policy}) {
    async function requireAdmin(req, res, next) {
        res.set('Cache-Control', 'no-store');
        const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
        const session = adminTokens.get(token);
        if (!session || Date.now() - session.createdAt >= 8*3600000) {
            return res.status(401).json({success:false, message:'Phiên cài đặt đã hết hạn. Vui lòng đăng xuất và đăng nhập lại admin.'});
        }
        try {
            const [rows] = await db.query('SELECT id FROM admins WHERE id=? AND is_active=1 LIMIT 1', [session.adminId]);
            if (!rows.length) return res.status(403).json({success:false, message:'Tài khoản admin không còn hoạt động.'});
            next();
        } catch (error) {
            console.error('Classroom access admin authentication:', error.code || 'database error');
            res.status(503).json({success:false, message:'Chưa xác thực được admin. Vui lòng thử lại.'});
        }
    }
    app.get('/api/admin/classroom-access', requireAdmin, (req, res) => res.json({success:true, settings:policy.settings()}));
    app.put('/api/admin/classroom-access', requireAdmin, (req, res) => {
        try { res.json({success:true, settings:policy.save(req.body)}); }
        catch (error) {
            if (!error.status) console.error('Save classroom access setting:', error.code || 'write error');
            res.status(error.status || 500).json({success:false, message:error.status ? error.message : 'Không lưu được cài đặt. Vui lòng thử lại.'});
        }
    });
}

module.exports = {isSchoolTime, createPolicy, mountAdminRoutes};
