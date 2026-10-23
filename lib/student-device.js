'use strict';
// Session-only display hints; never use device identification for access control.
module.exports = function identifyStudentDevice(headers = {}, hints = {}) {
    const ua = String(headers?.['user-agent'] || '').slice(0, 1024);
    const points = Number.isInteger(hints?.maxTouchPoints) && hints.maxTouchPoints <= 20 ? hints.maxTouchPoints : 0;
    if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && points > 1)) return 'iPad';
    if (/iPhone|iPod/i.test(ua)) return 'iPhone';
    if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Điện thoại Android' : 'Máy tính bảng Android';
    if (/Windows Phone|\bMobi(?:le)?\b/i.test(ua)) return 'Điện thoại';
    if (/Tablet|Kindle|Silk\//i.test(ua)) return 'Máy tính bảng';
    return '';
};
