const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {parse} = require('parse5');
const express = require('express');
const {protectJS, protectHTML, preparePublic} = require('../lib/protected-public');

test('separate obfuscated scripts preserve shared lexical globals, handlers and Vietnamese text', () => {
    const context = vm.createContext({});
    vm.runInContext(protectJS('let student = "Học sinh"; function login(){return student}', 'a.js'), context);
    vm.runInContext(protectJS('student += " 9A3"; globalThis.result = login();', 'b.js'), context);
    assert.equal(context.result, 'Học sinh 9A3');
    assert.equal(vm.runInContext('login()', context), 'Học sinh 9A3');
});

test('HTML retains layout, external scripts and JSON; inline scripts still execute', () => {
    const html = '<main onclick="login()">Bài học</main><script src="/ot/core.js?v=1"></script>' +
        '<script type="application/ld+json">{"name":"Tin học"}</script>' +
        '<script>let name="Xin chào"; function login(){return name}</script>' +
        '<script>globalThis.result=login()</script>';
    const output = protectHTML(html, 'test.html');
    assert(output.includes('<main onclick="login()">Bài học</main>'));
    assert(output.includes('<script src="/ot/core.js?v=1"></script>'));
    assert(output.includes('<script type="application/ld+json">{"name":"Tin học"}</script>'));
    assert(!output.includes('let name="Xin chào"'));
    const context = vm.createContext({});
    const walk = node => {
        if (node.tagName === 'script' && node.attrs.length === 0) {
            vm.runInContext(node.childNodes.map(n => n.value || '').join(''), context);
        }
        for (const child of node.childNodes || []) walk(child);
    };
    walk(parse(output));
    assert.equal(context.result, 'Xin chào');
});

test('protected build serves transformed assets, reuses cache, detects tampering, and rejects invalid updates', async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fptbn-protect-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    fs.mkdirSync(path.join(root, 'public'));
    fs.writeFileSync(path.join(root, 'public', 'index.html'), '<script>globalThis.title="Tin học"</script>');
    for (const page of ['OT.html', 'GV.html', 'clb.html']) {
        fs.copyFileSync(path.join(root, 'public', 'index.html'), path.join(root, 'public', page));
    }
    fs.writeFileSync(path.join(root, 'public', 'app.js'), 'globalThis.message="Tiếng Việt";');
    fs.writeFileSync(path.join(root, 'public', 'app.js.map'), '{"sourcesContent":["SECRET_SOURCE"]}');
    fs.writeFileSync(path.join(root, 'public', 'style.css'), 'body{color:blue}');
    const output = preparePublic(root);
    const asset = path.join(output, 'app.js');
    const stamp = fs.statSync(asset).mtimeMs;
    assert.equal(preparePublic(root), output);
    assert.equal(fs.statSync(asset).mtimeMs, stamp);
    assert.equal(fs.existsSync(path.join(output, 'app.js.map')), false);
    assert.equal(fs.readFileSync(path.join(output, 'style.css'), 'utf8'), 'body{color:blue}');
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(asset, 'utf8'), context);
    assert.equal(context.message, 'Tiếng Việt');
    fs.writeFileSync(asset, 'tampered');
    preparePublic(root);
    assert.notEqual(fs.readFileSync(asset, 'utf8'), 'tampered');
    const app = express();
    const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const routeStart = serverSource.indexOf('// Public revision addresses.');
    const routeEnd = serverSource.indexOf('app.use(', routeStart);
    vm.runInNewContext(serverSource.slice(routeStart, routeEnd), {app, path, publicDirectory: output});
    app.use(express.static(output));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = 'http://127.0.0.1:' + server.address().port;
    const response = await fetch(base + '/app.js');
    assert.equal(response.status, 200);
    assert.notEqual(await response.text(), fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8'));
    for (const route of ['/ontap', '/giaovien', '/clb']) {
        const page = await fetch(base + route);
        assert.equal(page.status, 200, route);
        assert(!(await page.text()).includes('globalThis.title="Tin học"'));
    }
    assert.equal((await fetch(base + '/app.js.map')).status, 404);
    assert.equal((await fetch(base + '/server.js')).status, 404);
    fs.writeFileSync(path.join(root, 'public', 'app.js'), 'invalid javascript = ;');
    assert.throws(() => preparePublic(root));
    // A failed new build leaves the last complete protected artifact intact.
    vm.runInContext(fs.readFileSync(asset, 'utf8'), context);
    assert.equal(context.message, 'Tiếng Việt');
});
