'use strict';
(() => {
    const exit = document.getElementById('studentExit');
    window.addEventListener('student-portal-access', event => {exit.hidden = event.detail !== true;});
    exit.onclick = () => {
        if (!confirm('Em có chắc muốn thoát hệ thống? Phần bài làm chưa lưu sẽ bị mất và việc chia sẻ màn hình sẽ dừng.')) return;
        exit.disabled = true;
        // Disable the existing unload guard after this explicit confirmation.
        joinedClass = false;
        const token = sessionStorage.getItem('ot-student-token');
        if (token) fetch('/api/ot/logout', {method: 'POST', headers: {Authorization: 'Bearer ' + token}, keepalive: true}).catch(() => {});
        const review = document.getElementById('reviewFrame')?.contentWindow;
        review?.OTSpeech?.cancel(); review?.OTStudy?.stop();
        window.FPTBNFamilySession?.stop();
        closeStudentPeer(); closeTeacherPeer();
        if (screenStream) {for (const track of screenStream.getTracks()) {track.onended = null; track.stop();} screenStream = null;}
        socket.disconnect();
        sessionStorage.removeItem('ot-student-token'); sessionStorage.removeItem('ot-student-info');
        location.replace('/');
    };
})();
