import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdtemp, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));

const validateSlug = slug => {
    if (typeof slug !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(slug) ||
        /^(sandbox|template|con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(slug)) {
        throw new Error('Choose a lowercase game slug; sandbox and template are protected.');
    }
    return `games/${slug}`;
};

const inside = (root, filename) => {
    const path = relative(root, filename);
    return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
};

const hashFile = async filename => {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(filename)) hash.update(chunk);
    return hash.digest('hex');
};

const scan = async (root, scope) => {
    const entries = [];
    const visit = async (path = '') => {
        const filename = join(root, path);
        const stat = await lstat(filename);
        if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) {
            throw new Error(`Linked paths are not supported by the boundary check: ${path}`);
        }
        const writable = path === scope || path.startsWith(`${scope}/`);
        if (stat.isDirectory()) {
            if (!writable) entries.push({ path: path || '.', kind: 'directory' });
            for (const name of (await readdir(filename)).sort()) {
                if (!path && name === '.git') continue;
                await visit(path ? `${path}/${name}` : name);
            }
        } else if (stat.isFile()) {
            if (!writable) entries.push({ path, kind: 'file', hash: await hashFile(filename) });
        } else {
            throw new Error(`Unsupported file type: ${path}`);
        }
    };
    await visit();
    return entries;
};

export const takeSnapshot = async (root, slug) => {
    const scope = validateSlug(slug);
    root = await realpath(root);
    const entries = await scan(root, scope);
    const directory = await mkdtemp(join(tmpdir(), 'ngin-boundary-'));
    const filename = join(directory, 'baseline.json');
    if (inside(root, filename)) throw new Error('The baseline must be outside the repository.');
    await writeFile(filename, JSON.stringify({ version: 1, root, slug, entries }, null, 2), { flag: 'wx' });
    return filename;
};

export const checkSnapshot = async (root, filename) => {
    root = await realpath(root);
    filename = await realpath(filename);
    if (inside(root, filename)) throw new Error('The baseline must be outside the repository.');
    const baseline = JSON.parse(await readFile(filename, 'utf8'));
    if (!baseline || baseline.version !== 1 || baseline.root !== root || !Array.isArray(baseline.entries)) {
        throw new Error('Invalid baseline or different repository root.');
    }
    const scope = validateSlug(baseline.slug);
    const previous = new Map();
    for (const entry of baseline.entries) {
        if (!entry || typeof entry.path !== 'string' ||
            (entry.path !== '.' && entry.path.split('/').some(part => !part || part === '.' || part === '..' || part.includes('\\') || part.includes(':'))) ||
            entry.path === scope || entry.path.startsWith(`${scope}/`) || previous.has(entry.path) ||
            !['file', 'directory'].includes(entry.kind) || (entry.kind === 'file' && !/^[a-f0-9]{64}$/.test(entry.hash))) {
            throw new Error('Malformed baseline entry.');
        }
        previous.set(entry.path, entry);
    }
    if (previous.get('.')?.kind !== 'directory') throw new Error('Missing baseline root.');
    const current = new Map((await scan(root, scope)).map(entry => [entry.path, entry]));
    const violations = [];
    for (const [path, entry] of previous) {
        const next = current.get(path);
        if (!next) violations.push(`Deleted: ${path}`);
        else if (entry.kind !== next.kind || entry.hash !== next.hash) violations.push(`Changed: ${path}`);
    }
    for (const path of current.keys()) {
        if (!previous.has(path)) violations.push(`Added: ${path}`);
    }
    return { scope, violations: violations.sort() };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const [command, argument, ...extra] = process.argv.slice(2);
        if (!argument || extra.length || !['snapshot', 'check'].includes(command)) {
            throw new Error('Usage: node tools/game-boundary.mjs snapshot <game-slug> | check <baseline-path>');
        }
        if (command === 'snapshot') {
            console.log(await takeSnapshot(repository, argument));
        } else {
            const { scope, violations } = await checkSnapshot(repository, argument);
            if (violations.length) {
                console.error(`Changes outside ${scope}/:\n${violations.join('\n')}`);
                process.exitCode = 1;
            } else console.log(`Boundary passed: no changes outside ${scope}/`);
        }
    } catch (error) {
        console.error(error.message);
        process.exitCode = 2;
    }
}