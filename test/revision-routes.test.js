const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const express = require('express');

test('the /ontap address and embedded OT entry serve the complete restored revision client', async () => {
    const app = express(), source = fs.readFileSync('server.js', 'utf8');
    const start = source.indexOf('app.get(["/ontap"');
    const end = source.indexOf('app.use(\n    express.static(', start);
    assert(start > 0 && end > start);
    vm.runInNewContext(source.slice(start, end), {app, path, __dirname: process.cwd()});
    app.use(express.static(path.join(process.cwd(), 'public')));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
        for (const route of ['/ontap', '/ontap?embedded=1', '/OT.html', '/baitap.html']) {
            const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`);
            assert.equal(response.status, 200);
            const html = await response.text();
            for (const script of ['quiz-play.js', 'essay-student.js', 'speech-input.js', 'study-guard.js', 'review-embed.js']) assert(html.includes(script), route + ' lacks ' + script);
        }
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
