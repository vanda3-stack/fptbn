'use strict';
(async () => {
    let parentCode = '', visible = true;
    if (new URLSearchParams(location.search).get('embedded') === '1' && window.parent !== window) {
        try {
            if (window.parent.location.origin === location.origin) {
                document.body.classList.add('portal-embedded');
                const style = document.createElement('style');
                style.textContent = '.portal-embedded header .wordmark{display:none}.portal-embedded header{min-height:48px;padding:10px 16px}';
                document.head.append(style);
                parentCode = String(window.parent.document.getElementById('studentCode')?.value || '').trim().toUpperCase();
                window.addEventListener('ot-portal-visibility', event => {
                    if (visible === event.detail) return;
                    visible = event.detail;
                    // Revoke home viewing before showing the classroom again.
                    if (!event.detail) window.OTFamily?.disconnect();
                    else if (token && student) enterStudy();
                });
            }
        } catch {}
    }
    try { student = JSON.parse(sessionStorage.getItem('ot-student-info')); } catch {}
    if (/^FBN\d{5}$/.test(parentCode) && (!token || student?.student_code !== parentCode)) {
        token = '';
        student = null;
        sessionStorage.removeItem('ot-student-token');
        sessionStorage.removeItem('ot-student-info');
        login();
        document.getElementById('code').value = OTCodes.middle(parentCode);
        document.getElementById('loginForm').requestSubmit(document.querySelector('#loginForm button'));
    } else if (token && student) {
        await enterStudy();
    } else {
        login();
    }
})();
