'use strict';
(() => {
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const refreshing = new Map();
    async function json(url, options = {}, retrySafe = false) {
        for (let attempt = 0; ; attempt++) {
            let response, data, failure;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 8000);
            try {
                response = await fetch(url, {...options, cache: 'no-store', signal: controller.signal});
                try { data = await response.json(); } catch { /* Proxies can return HTML during a restart. */ }
                if (response.ok && data?.success) return data;
                failure = Object.assign(Error(data?.message || (response.status === 401
                    ? 'Phiên học đã hết hạn.' : 'Máy chủ chưa sẵn sàng. Em hãy thử lại sau ít giây.')), {status: response.status});
            } catch (error) {
                failure = Error('Chưa kết nối được máy chủ. Em hãy kiểm tra mạng và thử lại.');
            } finally { clearTimeout(timer); }
            // Never replay a write after an ambiguous network failure.
            if (!retrySafe || attempt >= 3 || (response && ![502, 503, 504].includes(response.status))) throw failure;
            await pause(500 * (attempt + 1) + Math.floor(Math.random() * 250));
        }
    }
    function info() {
        try { return JSON.parse(sessionStorage.getItem('ot-student-info')); } catch { return null; }
    }
    function refresh(code) {
        if (!/^FBN\d{5}$/.test(code || '')) return Promise.reject(Error('Em hãy nhập lại mã học sinh.'));
        if (!refreshing.has(code)) {
            const pending = json('/api/ot/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({student_code: code})}, true).then(data => {
                if (!data.token || data.student?.student_code !== code) throw Error('Không xác nhận được mã học sinh.');
                sessionStorage.setItem('ot-student-token', data.token);
                sessionStorage.setItem('ot-student-info', JSON.stringify(data.student));
                return data;
            }).finally(() => refreshing.delete(code));
            refreshing.set(code, pending);
        }
        return refreshing.get(code);
    }
    async function ot(path, body, method, token, code) {
        method = method || (body ? 'POST' : 'GET');
        code = code || info()?.student_code;
        if (info()?.student_code === code) token = sessionStorage.getItem('ot-student-token') || token;
        const send = () => json('/api/ot' + path, {method,
            headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + token},
            body: body ? JSON.stringify(body) : undefined}, method === 'GET' || path === '/login' || path === '/session-check');
        try { return {data: await send(), token}; }
        catch (error) {
            if (error.status !== 401 || path === '/login' || path === '/logout' || !code) throw error;
            token = (await refresh(code)).token;
            // 401 is returned by authentication before the handler can change data.
            return {data: await send(), token};
        }
    }
    function waitForSocket(socket, timeout = 20000) {
        if (socket.connected) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const done = () => { clearTimeout(timer); socket.off('connect', connected); };
            const connected = () => { done(); resolve(); };
            const timer = setTimeout(() => { done(); reject(Error('Chưa kết nối được máy chủ. Em hãy thử lại sau ít giây.')); }, timeout);
            socket.on('connect', connected);
            socket.connect();
        });
    }
    globalThis.FPTBNConnection = {json, ot, refresh, waitForSocket};
})();
