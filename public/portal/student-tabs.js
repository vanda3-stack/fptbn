'use strict';
// Keep the existing classroom document and its WebRTC session alive on tab changes.
(() => {
    const tabs = [document.getElementById('classTab'), document.getElementById('reviewTab'), document.getElementById('examTab'), document.getElementById('paperTab')];
    const panels = [document.getElementById('classPanel'), document.getElementById('reviewPanel'), document.getElementById('examPanel'), document.getElementById('paperPanel')];
    const navigation = document.getElementById('studentTabs');
    let frame = null, ready = false;
    let requestedTab = new URLSearchParams(location.search).get('tab');
    function visibility(visible) {
        if (frame?.contentWindow) frame.contentWindow.dispatchEvent(new CustomEvent('ot-portal-visibility', {detail: visible}));
    }
    let previous=0;
    function select(index, packId) {
        if (!ready && index !== 0) index = 0;
        const join=document.getElementById('joinPage');
        join.hidden=index!==0||ready;
        if(previous===3&&index!==3)window.dispatchEvent(new Event('paper-tab-hidden'));
        if(previous===2&&index!==2)window.dispatchEvent(new Event('mock-tab-hidden'));
        if(index===2)window.dispatchEvent(new Event('mock-tab-show'));
        if(index===3)window.dispatchEvent(new CustomEvent('paper-tab-show', {detail:{packId}}));
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
            frame.src = '/portal/review?embedded=1';
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
        else if (requestedTab) { const index={review:1,exam:2,paper:3}[requestedTab]||0; requestedTab=null; select(index); }
    });
    navigation.hidden = !ready;
    window.addEventListener('portal-open-paper', event => { if(ready) select(3, event.detail?.packId); });
    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => select(index));
        tab.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (index + (event.key === 'ArrowLeft' ? 3 : 1)) % 4;
            select(next);
            tabs[next].focus();
        });
    });
})();

