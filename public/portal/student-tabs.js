'use strict';
// Keep the existing classroom document and its WebRTC session alive on tab changes.
(() => {
    const tabs = [document.getElementById('classTab'), document.getElementById('reviewTab')];
    const panels = [document.getElementById('classPanel'), document.getElementById('reviewPanel')];
    const navigation = document.getElementById('studentTabs');
    let frame = null, ready = false;
    function visibility(visible) {
        if (frame?.contentWindow) frame.contentWindow.dispatchEvent(new CustomEvent('ot-portal-visibility', {detail: visible}));
    }
    function select(index) {
        if (!ready && index !== 0) return;
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
            frame.allow = 'display-capture; microphone';
            frame.addEventListener('load', () => visibility(!panels[1].hidden));
            document.getElementById('reviewMount').append(frame);
        }
        document.getElementById('reviewClassNotice').hidden = !(index === 1 && typeof joinedClass !== 'undefined' && joinedClass);
        visibility(index === 1);
    }
    window.addEventListener('student-portal-access', event => {
        ready = event.detail === true;
        navigation.hidden = !ready;
        if (!ready) select(0);
    });
    navigation.hidden = true;
    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => select(index));
        tab.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
            select(next);
            tabs[next].focus();
        });
    });
})();
