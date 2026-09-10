import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access, readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('legacy demo redirect preserves query, fragment and hosting prefix', async () => {
    const html = await read('game.html');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    for (const prefix of ['/', '/ngin/']) {
        const url = new URL(`${prefix}game.html?quality=low#view`, 'http://localhost:8080');
        let destination;
        runInNewContext(script, { URL, location: { href: url.href, search: url.search, hash: url.hash, replace: value => { destination = value; } } });
        assert.equal(destination, `http://localhost:8080${prefix}games/sandbox/?quality=low#view`);
    }
});

test('independent pages preserve shared asset roots and local boot URLs', async () => {
    const sandbox = await read('games/sandbox/index.html');
    const template = await read('games/template/index.html');
    const importMap = html => JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
    assert.deepEqual(importMap(sandbox), importMap(template));
    for (const html of [sandbox, template]) {
        assert.match(html, /new URL\('\.\/scripts\/main\.js', location\.href\)/);
        for (const prefix of ['/', '/ngin/']) {
            const page = new URL(`${prefix}games/copied-game/`, 'http://localhost:8080');
            const base = new URL(html.match(/<base href="([^"]+)"/)[1], page);
            assert.equal(new URL('./assets/models/test.glb', base).pathname, `${prefix}assets/models/test.glb`);
            assert.equal(new URL('./scripts/main.js', page).pathname, `${prefix}games/copied-game/scripts/main.js`);
        }
    }
});

test('relocated modules import existing engine modules and never a different game', async () => {
    for (const path of ['games/sandbox/scripts/sandbox.js', 'games/template/scripts/game.js']) {
        const source = await read(path);
        for (const [, specifier] of source.matchAll(/from '([^']+)'/g)) {
            if (!specifier.startsWith('.')) continue;
            assert.ok(specifier.startsWith('../../../src/'), `${path}: unexpected import ${specifier}`);
            await access(new URL(specifier, new URL(`../${path}`, import.meta.url)));
        }
    }
});

test('active creator instructions no longer direct edits to shared startup', async () => {
    for (const path of ['README.md', 'AGENTS.md', 'index.html', 'docs/index.html', 'docs/new-game.md', 'docs/ai-prompt.md', 'docs/README.md', 'docs/walking-module.md']) {
        assert.doesNotMatch(await read(path), /src\/(main\.js|sandbox\.js|games\/)/, path);
    }
});