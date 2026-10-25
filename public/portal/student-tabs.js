'use strict';
// Keep the existing classroom document and its WebRTC session alive on tab changes.
(() => {
    const tabs = [document.getElementById('classTab'), document.getElementById('reviewTab'), document.getElementById('examTab')];
    const panels = [document.getElementById('classPanel'), document.getElementById('reviewPanel'), document.getElementById('examPanel')];
    const navigation = document.getElementById('studentTabs');
    let frame = null, ready = false;
    function visibility(visible) {
        if (frame?.contentWindow) frame.contentWindow.dispatchEvent(new CustomEvent('ot-portal-visibility', {detail: visible}));
    }
    let previous=0;
    function select(index) {
        if (!ready && index === 1) index = 0;
        const join=document.getElementById('joinPage');
        join.hidden=index!==0||ready;
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
            frame.allow = 'display-capture; microphone';
            frame.addEventListener('load', () => visibility(!panels[1].hidden));
            document.getElementById('reviewMount').append(frame);
        }
        document.getElementById('reviewClassNotice').hidden = !(index === 1 && typeof joinedClass !== 'undefined' && joinedClass);
        visibility(index === 1);
    }
    window.addEventListener('student-portal-access', event => {
        ready = event.detail === true;
        navigation.hidden = false;
        if (!ready) select(0);
    });
    navigation.hidden = false;
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

