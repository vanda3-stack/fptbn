const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {parse} = require('parse5');
const Obfuscator = require('javascript-obfuscator');

// Keep global names and object properties: pages share globals across scripts,
// HTML event handlers, Socket.IO messages and WebRTC objects.
const options = {
    target: 'browser', compact: true, seed: 2192026,
    renameGlobals: false, renameProperties: false,
    identifierNamesGenerator: 'hexadecimal',
    stringArray: true, stringArrayThreshold: 0.5,
    stringArrayEncoding: [], stringArrayCallsTransform: false,
    controlFlowFlattening: false, deadCodeInjection: false,
    selfDefending: false, debugProtection: false,
    disableConsoleOutput: false, sourceMap: false,
    // Removing unused-looking assignments can change cross-script behavior.
    simplify: false, transformObjectKeys: false,
};

function protectJS(source, filename) {
    // Give each script its own generated helper names to avoid collisions
    // between classic scripts executed in the same window.
    const prefix = 'p' + crypto.createHash('sha256').update(filename).digest('hex').slice(0, 12);
    return Obfuscator.obfuscate(source, {...options, identifiersPrefix: prefix})
        .getObfuscatedCode().replace(/<\/script/gi, '<\\/script');
}

function protectHTML(source, filename) {
    const doc = parse(source, {sourceCodeLocationInfo: true});
    const edits = [];
    let index = 0;
    function visit(node) {
        if (node.tagName === 'script') {
            const attrs = Object.fromEntries(node.attrs.map(a => [a.name, a.value]));
            const type = (attrs.type || '').trim().toLowerCase();
            const executable = ['', 'module', 'text/javascript', 'application/javascript',
                'text/ecmascript', 'application/ecmascript'].includes(type);
            const loc = node.sourceCodeLocation;
            if (executable && !('src' in attrs) && loc?.startTag && loc?.endTag) {
                const start = loc.startTag.endOffset, end = loc.endTag.startOffset;
                const code = source.slice(start, end);
                if (code.trim()) edits.push({start, end, code: protectJS(code, filename + ':' + index++)});
            }
        }
        for (const child of node.childNodes || []) visit(child);
        if (node.content) visit(node.content);
    }
    visit(doc);
    // Source offsets preserve the HTML, layout, attributes and non-JS scripts.
    for (const edit of edits.reverse()) {
        source = source.slice(0, edit.start) + edit.code + source.slice(edit.end);
    }
    return source;
}

function filesIn(directory, prefix = '') {
    const files = [];
    for (const entry of fs.readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.name.startsWith('.')) continue;
        const relative = path.join(prefix, entry.name);
        if (entry.isDirectory()) files.push(...filesIn(path.join(directory, entry.name), relative));
        else if (entry.isFile() && !/\.(?:map|bak|backup)$/i.test(entry.name)) files.push(relative);
        else if (entry.isSymbolicLink()) throw new Error('Public symlinks are not allowed: ' + relative);
    }
    return files;
}

function makeBuildReadable(directory) {
    // mkdtemp creates 0700 directories. A root CLI build must also be readable
    // by the separate unprivileged Node.js account used by vPanel.
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) makeBuildReadable(target);
        else fs.chmodSync(target, 0o644);
    }
    fs.chmodSync(directory, 0o755);
}

function preparePublic(root = path.join(__dirname, '..')) {
    const source = path.join(root, 'public');
    const output = path.join(root, '.protected-public');
    const manifestPath = path.join(root, '.protected-public-manifest.json');
    const files = filesIn(source);
    const digest = crypto.createHash('sha256').update(fs.readFileSync(__filename))
        .update(require('javascript-obfuscator/package.json').version)
        .update(fs.readFileSync(path.join(__dirname, '..', 'package-lock.json')));
    for (const file of files) digest.update(file).update('\0').update(fs.readFileSync(path.join(source, file)));
    const fingerprint = digest.digest('hex');
    try {
        const previous = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (previous.fingerprint === fingerprint && files.every(file => {
            const target = path.join(output, file);
            return fs.existsSync(target) && crypto.createHash('sha256')
                .update(fs.readFileSync(target)).digest('hex') === previous.hashes[file];
        })) return output;
    } catch { /* Missing or incomplete build: regenerate before serving. */ }

    const temporary = fs.mkdtempSync(path.join(root, '.protected-public-build-'));
    const hashes = {};
    try {
        for (const file of files) {
            let data = fs.readFileSync(path.join(source, file));
            if (/\.js$/i.test(file)) {
                // Third-party pre-minified JS retains its license and distribution.
                data = Buffer.from(/\.min\.js$/i.test(file)
                    ? data.toString().replace(/\/\/[#@]\s*sourceMappingURL=.*$/gm, '')
                    : protectJS(data.toString(), file));
            } else if (/\.html?$/i.test(file)) data = Buffer.from(protectHTML(data.toString(), file));
            const target = path.join(temporary, file);
            fs.mkdirSync(path.dirname(target), {recursive: true});
            fs.writeFileSync(target, data);
            hashes[file] = crypto.createHash('sha256').update(data).digest('hex');
        }
        // Only a complete build can replace the served directory. Startup fails
        // on errors rather than silently exposing the original public source.
        makeBuildReadable(temporary);
        fs.rmSync(output, {recursive: true, force: true});
        fs.renameSync(temporary, output);
        fs.writeFileSync(manifestPath, JSON.stringify({fingerprint, hashes}));
        fs.chmodSync(manifestPath, 0o644);
    } finally {
        fs.rmSync(temporary, {recursive: true, force: true});
    }
    return output;
}

module.exports = {preparePublic, protectJS, protectHTML};
if (require.main === module) {
    preparePublic();
    console.log('Protected browser assets are ready.');
}
