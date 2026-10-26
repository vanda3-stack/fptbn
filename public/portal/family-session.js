'use strict';
(() => {
    let session = null, requestedCode = '', requestedStream = null, generation = 0;
    async function start(code, stream) {
        if (requestedCode === code && requestedStream === stream) return;
        requestedCode = code;
        requestedStream = stream;
        const ticket = ++generation;
        try {
            if (!session || session.student.student_code !== code) {
                const response = globalThis.FPTBNConnection
                    ? {ok:true,json:()=>FPTBNConnection.refresh(code)}
                    : await fetch('/api/ot/login', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({student_code: code})
                });
                const data = await response.json();
                if (ticket !== generation) return;
                if (!response.ok || !data.success || !data.token || !data.student) throw Error(data.message || 'Chưa xác thực được kết nối PH.');
                session = {token: data.token, student: data.student};
            }
            if (ticket !== generation) return;
            sessionStorage.setItem('ot-student-token', session.token);
            sessionStorage.setItem('ot-student-info', JSON.stringify(session.student));
            window.OTFamily.connect(session.token, null, {compact: true, getStream: () => requestedStream});
            if (stream) window.OTFamily.attachStream(stream);
        } catch (error) {
            if (ticket !== generation) return;
            requestedCode = '';
            requestedStream = null;
            const status = document.getElementById('studentStatus');
            if (status) status.textContent += ' • Chưa kết nối PH: ' + error.message;
        }
    }
    function stop() {
        generation++;
        requestedCode = '';
        requestedStream = null;
        session = null;
        window.OTFamily?.disconnect();
    }
    window.FPTBNFamilySession = {start, stop, identity: () => session};
})();
