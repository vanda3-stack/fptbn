'use strict';
(async () => {
    let parentCode = '', embedded = false, parentSession = null;
    if (new URLSearchParams(location.search).get('embedded') === '1' && window.parent !== window) {
        try {
            if (window.parent.location.origin === location.origin) {
                embedded = true;
                parentCode = formatStudentCode(window.parent.document.getElementById('studentCode')?.value || '');
                parentSession = window.parent.FPTBNFamilySession?.identity();
                document.body.classList.add('portal-embedded');
                const style = document.createElement('style');
                style.textContent = '.portal-embedded header .wordmark,.portal-embedded #otStudentBadge,.portal-embedded #logout{display:none}.portal-embedded header{min-height:48px;padding:10px 16px}.portal-embedded .ot-login-page{min-height:0;padding:20px 0}';
                document.head.append(style);
                window.addEventListener('ot-portal-visibility', event => {
                    globalThis.OTStudy?.setVisible(event.detail);
                    if (!event.detail) globalThis.OTSpeech?.cancel();
                    // Publishing belongs to the parent document and survives tab changes.
                });
            }
        } catch {}
    }
    const originalPicker = picker;
    picker = async function () {
        if (!embedded && token && student) window.OTFamily?.connect(token);
        return originalPicker();
    };
    try { student = JSON.parse(sessionStorage.getItem('ot-student-info')); } catch {}
    if (parentSession?.student.student_code === parentCode) {
        token = parentSession.token;
        student = parentSession.student;
        await picker();
    } else if (/^FBN\d{5}$/.test(parentCode) && (!token || student?.student_code !== parentCode)) {
        token = '';
        student = null;
        sessionStorage.removeItem('ot-student-token');
        sessionStorage.removeItem('ot-student-info');
        login();
        document.getElementById('code').value = parentCode;
        document.getElementById('loginForm').requestSubmit();
    } else if (token && student) {
        await picker();
    } else {
        login();
    }
})();
