'use strict';
(async () => {
    let parentCode = '';
    if (new URLSearchParams(location.search).get('embedded') === '1' && window.parent !== window) {
        try {
            if (window.parent.location.origin === location.origin) {
                document.body.classList.add('portal-embedded');
                const style = document.createElement('style');
                style.textContent = '.portal-embedded header .wordmark,.portal-embedded #otStudentBadge{display:none}.portal-embedded header{min-height:48px;padding:10px 16px}.portal-embedded .ot-login-page{min-height:0;padding:20px 0}';
                document.head.append(style);
                parentCode = formatStudentCode(window.parent.document.getElementById('studentCode')?.value || '');
                window.addEventListener('ot-portal-visibility', event => {
                    globalThis.OTStudy?.setVisible(event.detail);
                    if (!event.detail) globalThis.OTSpeech?.cancel();
                });
            }
        } catch { /* Standalone revision remains available without a parent. */ }
    }
    try { student = JSON.parse(sessionStorage.getItem('ot-student-info')); } catch {}
    // A supplied classroom code must never restore another student's saved review session.
    if (/^FBN\d{5}$/.test(parentCode) && (!token || student?.student_code !== parentCode)) {
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
