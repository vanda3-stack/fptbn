'use strict';
// Keep the existing classroom document and its WebRTC session alive on tab changes.
(() => {
    const tabs = [document.getElementById('classTab'), document.getElementById('reviewTab'), document.getElementById('examTab')];
    const panels = [document.getElementById('classPanel'), document.getElementById('reviewPanel'), document.getElementById('examPanel')];
    let frame = null;
    function visibility(visible) {
        if (frame?.contentWindow) frame.contentWindow.dispatchEvent(new CustomEvent('ot-portal-visibility', {detail: visible}));
    }
    let previous=0;
    function select(index) {
        if(previous===2&&index!==2)window.dispatchEvent(new Event('mock-tab-hidden'));
        if(index===2)window.dispatchEvent(new Event('mock-tab-show'));
        previous=index;
        tabs.forEach((tab, i) => {
            tab.setAttribute('aria-selected', String(i === index));
            tab.tabIndex = i === index ? 0 : -1;
            panels[i].hidden = i !== index;
        });
        if (index === 1 && !frame) {
            frame = document.createElement('iframe');
            frame.id = 'reviewFrame';
            frame.title = 'Ôn tập tại nhà';
            frame.src = '/ontap?embedded=1';
            frame.allow = 'microphone';
            frame.addEventListener('load', () => visibility(!panels[1].hidden));
            document.getElementById('reviewMount').append(frame);
        }
        document.getElementById('reviewClassNotice').hidden = !(index === 1 && typeof joinedClass !== 'undefined' && joinedClass);
        visibility(index === 1);
    }
    // Apply each grade's server-side default only after student access is established.
    // Do not navigate or stop the active WebRTC screen-share session.
    window.addEventListener('fptbn-student-joined', async event => {
        const grade = Number(event.detail?.grade);
        if (!Number.isInteger(grade) || grade < 6 || grade > 9) return;
        try {
            const response = await fetch('/api/student/default-tab?grade=' + grade, {cache:'no-store'});
            if (!response.ok) return;
            const data = await response.json();
            if (!data.success) return;
            const map = {class:0, review:1, exam:2};
            if (Object.prototype.hasOwnProperty.call(map,data.tab)) {
                select(map[data.tab]);
            } else if (data.tab === 'print') {
                // The print-resources tab is provided by the resource module, when available.
                const printButton = [...document.querySelectorAll('[role="tab"],.student-tabs button')]
                    .find(el => /đề cương để in/i.test(el.textContent || ''));
                if (printButton) printButton.click();
            }
        } catch (error) {
            console.warn('Không tải được trang mặc định của khối:', error);
        }
    });
    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => select(index));
        tab.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowLeft' ? 2 : 1)) % 3;
            select(next);
            tabs[next].focus();
        });
    });
})();

