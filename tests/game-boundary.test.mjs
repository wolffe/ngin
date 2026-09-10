import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, link, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSnapshot, takeSnapshot } from '../tools/game-boundary.mjs';

const fixture = async context => {
    const root = await mkdtemp(join(tmpdir(), 'ngin-boundary-test-'));
    context.after(() => rm(root, { recursive: true, force: true }));
    const put = async (path, text = 'initial uncommitted content') => {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), text);
    };
    for (const path of ['src/engine.js', 'games/sandbox/index.html', 'games/template/index.html', 'games/other/main.js', 'index.html', 'AGENTS.md', 'tools/guard.mjs']) await put(path);
    const snapshot = async (slug = 'my-game') => {
        const filename = await takeSnapshot(root, slug);
        context.after(() => rm(dirname(filename), { recursive: true, force: true }));
        return filename;
    };
    return { root, put, snapshot };
};

test('game-only edits pass without Git or a clean worktree', async context => {
    const { root, put, snapshot } = await fixture(context);
    await put('games/my-game/existing.js');
    const baseline = await snapshot();
    await put('games/my-game/index.html', 'new game');
    await put('games/my-game/existing.js', 'edited');
    await put('games/my-game/assets/model.txt');
    await rm(join(root, 'games/my-game/existing.js'));
    assert.deepEqual((await checkSnapshot(root, baseline)).violations, []);
    await put('.git/config', 'ignored Git metadata');
    assert.deepEqual((await checkSnapshot(root, baseline)).violations, []);
});

test('detects protected changes, additions, deletions and cross-boundary moves', async context => {
    const { root, put, snapshot } = await fixture(context);
    const baseline = await snapshot();
    await put('src/engine.js', 'changed despite being untracked');
    await put('games/sandbox/index.html', 'changed demo');
    await put('games/template/index.html', 'changed template');
    await put('index.html', 'changed site');
    await put('tools/guard.mjs', 'disabled guard');
    await put('games/my-game-extra/new.js');
    await mkdir(join(root, 'games/my-game'), { recursive: true });
    await rename(join(root, 'games/other/main.js'), join(root, 'games/my-game/stolen.js'));
    await rm(join(root, 'AGENTS.md'));
    const { violations } = await checkSnapshot(root, baseline);
    for (const path of ['src/engine.js', 'games/sandbox/index.html', 'games/template/index.html', 'index.html', 'tools/guard.mjs']) assert.ok(violations.includes(`Changed: ${path}`));
    assert.ok(violations.includes('Added: games/my-game-extra/new.js'));
    assert.ok(violations.includes('Deleted: games/other/main.js'));
    assert.ok(violations.includes('Deleted: AGENTS.md'));
    assert.ok(!(await readFile(join(root, 'src/engine.js'), 'utf8')).includes('initial'));
});

test('rejects protected slugs, malformed baselines and different roots', async context => {
    const { root, snapshot } = await fixture(context);
    for (const slug of ['sandbox', 'Sandbox', 'template', '../src', '/tmp', 'my/game', 'my\\game', 'con', '', 'MY-GAME']) {
        await assert.rejects(takeSnapshot(root, slug));
    }
    const baseline = await snapshot();
    await assert.rejects(checkSnapshot(join(root, 'src'), baseline), /different repository/);
    await assert.rejects(checkSnapshot(root, join(root, 'missing.json')));
    const original = await readFile(baseline, 'utf8');
    for (const value of ['{}', '{', JSON.stringify({ ...JSON.parse(original), entries: [] }), JSON.stringify({ ...JSON.parse(original), entries: [{ path: '../outside', kind: 'directory' }] })]) {
        await writeFile(baseline, value);
        await assert.rejects(checkSnapshot(root, baseline));
    }
});

test('rejects junction escapes before snapshot and after snapshot', async context => {
    const { root, snapshot } = await fixture(context);
    const baseline = await snapshot();
    const link = join(root, 'games/my-game');
    await symlink(join(root, 'src'), link, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(checkSnapshot(root, baseline), /Linked paths/);
    await assert.rejects(snapshot(), /Linked paths/);
    await rm(link);
    await mkdir(link);
    await symlink(join(root, 'src'), join(link, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(checkSnapshot(root, baseline), /Linked paths/);
});

test('CLI validates arguments and returns failure status without modifying files', () => {
    const tool = fileURLToPath(new URL('../tools/game-boundary.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [tool, 'snapshot', 'sandbox'], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /protected/);
    assert.throws(() => execFileSync(process.execPath, [tool], { stdio: 'pipe' }));
});

test('hard links cannot alias protected files into writable scope', async context => {
    const { root, snapshot } = await fixture(context);
    const baseline = await snapshot();
    await mkdir(join(root, 'games/my-game'));
    await link(join(root, 'src/engine.js'), join(root, 'games/my-game/alias.js'));
    await assert.rejects(checkSnapshot(root, baseline), /Linked paths/);
});

test('CLI snapshots an uncommitted fixture and detects violations with exit 1', async context => {
    const { root, put } = await fixture(context);
    const tool = join(root, 'tools/game-boundary.mjs');
    await copyFile(new URL('../tools/game-boundary.mjs', import.meta.url), tool);
    const baseline = execFileSync(process.execPath, [tool, 'snapshot', 'my-game'], { encoding: 'utf8' }).trim();
    context.after(() => rm(dirname(baseline), { recursive: true, force: true }));
    await put('games/my-game/index.html');
    assert.match(execFileSync(process.execPath, [tool, 'check', baseline], { encoding: 'utf8' }), /Boundary passed/);
    await put('games/sandbox/index.html', 'unauthorized change');
    const result = spawnSync(process.execPath, [tool, 'check', baseline], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Changed: games\/sandbox\/index.html/);
    assert.equal(await readFile(join(root, 'games/sandbox/index.html'), 'utf8'), 'unauthorized change');
});