const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const origin = 'https://fptbnmonitor.online';
const pages = fs.readdirSync('public/tin5').filter(name => name.endsWith('.html'));

function lesson(page, code, storage = new Map(), blocked = false) {
    const source = fs.readFileSync('public/tin5/' + page, 'utf8');
    const start = source.indexOf('// A new student starts');
    const end = source.indexOf('function focus(e)', start);
    const href = origin + '/tin5/' + page + (code ? '?student_code=' + encodeURIComponent(code) : '');
    const context = vm.createContext({URL, URLSearchParams, location: new URL(href),
        CATALOG: [{code:'1'}, {code:'2'}], h: () => ({}),
        localStorage: {getItem: key => {if (blocked) throw Error('blocked'); return storage.get(key) || null;},
            setItem: (key, value) => {if (blocked) throw Error('blocked'); storage.set(key, value);}}});
    vm.runInContext(source.slice(start, end), context);
    return expression => vm.runInContext(expression, context);
}

test('all Tin 5 pages isolate new students from legacy and other student progress', () => {
    assert.equal(pages.length, 19);
    for (const page of pages) {
        const storage = new Map([['fptbn-t5-missions-v1:1', JSON.stringify({count:20, xp:500})]]);
        const a = lesson(page, 'FBN12345', storage);
        assert.equal(a('get(1).count'), 0, page + ': ignore unassigned progress');
        a('get(1).count=7;get(1).xp=170;get(1).tries[0]=2;save(1)');
        const b = lesson(page, 'FBN54321', storage);
        assert.equal(b('get(1).count'), 0, page + ': new student starts at zero');
        assert.equal(b('get(1).xp'), 0);
        assert.equal(b('Object.keys(get(1).tries).length'), 0);
        b('get(1).count=2;save(1)');
        const reload = lesson(page, 'fbn12345', storage);
        assert.equal(reload('get(1).count'), 7, page + ': same student resumes');
        assert.equal(reload('get(2).count'), 0, page + ': separate lessons');
        reload('mem.set(1,empty());save(1)');
        assert.equal(lesson(page, 'FBN54321', storage)('get(1).count'), 2, page + ': reset affects only owner');
        assert.equal(JSON.parse(storage.get('fptbn-t5-missions-v1:1')).count, 20);
        assert.equal(lesson(page, '', storage)('get(1).count'), 20, page + ': preserve standalone use');
    }
});

test('course, lesson and hash links retain identity; external links do not receive it', () => {
    for (const page of pages) {
        const run = lesson(page, 'FBN12345');
        for (const path of ['index.html#chuong-trinh', 'bai8a.html', '#bai-2']) {
            const result = new URL(run(`link('test',${JSON.stringify(path)}).href`));
            assert.equal(result.searchParams.get('student_code'), 'FBN12345');
            assert.equal(result.hash, new URL(path, origin + '/tin5/' + page).hash);
        }
        assert.equal(run("link('test','https://example.com/tin5/bai1.html').href"), 'https://example.com/tin5/bai1.html');
    }
});

test('blocked storage still starts empty and flags the existing storage notice', () => {
    const run = lesson('bai6.html', 'FBN12345', new Map(), true);
    assert.equal(run('get(1).count'), 0);
    run('save(1)');
    assert.equal(run('storageProblem'), true);
});

function resources(code = 'FBN12345') {
    const handlers = {}, links = [];
    const node = () => ({hidden:false, children:[], handlers:{}, classList:{toggle(){}},
        setAttribute(){}, addEventListener(type, fn){this.handlers[type]=fn;},
        append(...nodes){this.children.push(...nodes);}, before(){}, replaceChildren(){this.children=[];},
        querySelector(){return null;}});
    const anchor = node();
    const context = vm.createContext({URL, location: new URL(origin + '/'), studentCode:code,
        window:{addEventListener(){}}, socket:{on(type,fn){handlers[type]=fn;}},
        document:{head:node(), getElementById(){return null;}, querySelector(){return anchor;},
            createElement(tag){const el=node();if(tag==='a')links.push(el);return el;}}});
    vm.runInContext(fs.readFileSync('public/js/class-resources.js', 'utf8'), context);
    return {context, links, render(url){handlers['class-resources']([{type:'link', text:'Tin 5', url}]);return links.at(-1);}};
}

test('Truy cập uses current classroom login including middle-click and replaces stale URL identity', () => {
    const h = resources();
    const a = h.render('/tin5/bai6.html?view=study&student_code=FBN99999#bai-6');
    let url = new URL(a.href);
    assert.equal(url.searchParams.get('student_code'), 'FBN12345');
    assert.equal(url.searchParams.get('view'), 'study');
    assert.equal(url.hash, '#bai-6');
    assert.equal(a.rel, 'noopener noreferrer');
    h.context.studentCode='FBN54321';
    a.handlers.click();
    assert.equal(new URL(a.href).searchParams.get('student_code'), 'FBN54321');
    h.context.studentCode='FBN11111';
    a.handlers.auxclick();
    assert.equal(new URL(a.href).searchParams.get('student_code'), 'FBN11111');
});

test('resource links for external sites and other grades remain unchanged', () => {
    const h = resources();
    for (const url of ['https://example.com/tin5/bai6.html', '/tin6/bai6.html', '/tin50/bai6.html']) {
        assert.equal(h.render(url).href, url);
    }
    assert.equal(new URL(resources('').render('/tin5/bai6.html?student_code=FBN99999').href).searchParams.has('student_code'), false);
});
