import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const base = process.env.NGIN_URL || 'http://localhost:8080';
const executable = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const output = await mkdtemp(join(tmpdir(), 'ngin-browser-'));
const performanceMode = process.env.NGIN_PERF === '1';
const aoMode = process.env.NGIN_AO === '1';
const starterMode = process.env.NGIN_STARTER === '1';
const sandboxEntry = await readFile(new URL('../games/sandbox/scripts/main.js', import.meta.url), 'utf8');
assert.ok(sandboxEntry.includes('const setBoot = (label, pct) => {') && sandboxEntry.includes('.then(() => {'), 'Sandbox instrumentation anchors missing');
const testEntry = performanceMode && !aoMode ? sandboxEntry
    .replace('const setBoot = (label, pct) => {', `const setBoot = (label, pct) => {
    window.__bootStages ??= [];
    if (window.__bootStages.at(-1)?.label !== label) window.__bootStages.push({ label, ms: Math.round(performance.now()) });`)
    .replace('.then(() => {', '.then((sandbox) => { window.__performanceSandbox = sandbox;') : '';
const browser = spawn(executable, [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${join(output, 'profile')}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let socket;
let starterFolder;
let starterEntry = '';
try {
    const endpoint = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Browser startup timed out')), 20000);
        browser.once('error', reject);
        browser.once('exit', (code) => reject(new Error(`Browser exited: ${code}`)));
        browser.stderr.on('data', (chunk) => {
            const match = chunk.toString().match(/DevTools listening on (ws:\/\/\S+)/);
            if (match) { clearTimeout(timeout); resolve(match[1]); }
        });
    });
    socket = new WebSocket(endpoint);
    await once(socket, 'open');
    let sequence = 0;
    const pending = new Map();
    const runtimeErrors = [];
    socket.addEventListener('message', (event) => {
        const response = JSON.parse(event.data);
        if (response.method === 'Fetch.requestPaused') {
            send('Fetch.fulfillRequest', {
                requestId: response.params.requestId, responseCode: 200,
                responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
                body: Buffer.from(response.params.request.url.includes('/games/sandbox/') ? testEntry : starterEntry).toString('base64'),
            }, response.sessionId).catch(error => runtimeErrors.push(error.message));
            return;
        }
        if (response.method === 'Runtime.exceptionThrown') {
            runtimeErrors.push(response.params.exceptionDetails.exception?.description || response.params.exceptionDetails.text);
        }
        if (response.method === 'Runtime.consoleAPICalled' && response.params.type === 'error') {
            runtimeErrors.push(response.params.args.map(argument => argument.value || argument.description).join(' '));
        }
        const request = pending.get(response.id);
        if (!request) return;
        pending.delete(response.id);
        clearTimeout(request.timeout);
        if (response.error) request.reject(new Error(JSON.stringify(response.error)));
        else request.resolve(response.result);
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        const id = ++sequence;
        const timeout = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`CDP timed out: ${method}`));
        }, 120000);
        pending.set(id, { resolve, reject, timeout });
        socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const page = (method, params) => send(method, params, sessionId);
    await page('Page.enable');
    await page('Runtime.enable');
    if (performanceMode || aoMode) {
        await page('Fetch.enable', { patterns: [{ urlPattern: '*/games/sandbox/scripts/main.js' }] });
    }
    const evaluate = async (expression) => {
        const result = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
    };
    const navigate = async (path) => {
        await page('Page.navigate', { url: base + path });
        await evaluate(`new Promise(resolve => {
      if (document.readyState === 'complete') resolve();
      else window.addEventListener('load', resolve, { once: true });
    })`);
        await evaluate(`document.fonts.ready.then(() => Promise.all([...document.images].map(image => {
      image.loading = 'eager';
      return image.decode().catch(() => {});
    })))`);
    };

    const checkStarter = async () => {
        starterFolder = await mkdtemp(fileURLToPath(new URL('../games/isolation-check-', import.meta.url)));
        await cp(new URL('../games/template/', import.meta.url), starterFolder, { recursive: true });
        starterEntry = (await readFile(join(starterFolder, 'scripts/main.js'), 'utf8'))
            .replace('.then(() => {', '.then((game) => { window.__starterGame = game;');
        assert.ok(starterEntry.includes('window.__starterGame'), 'Starter instrumentation anchor missing');
        await page('Fetch.enable', { patterns: [{ urlPattern: `*/games/${basename(starterFolder)}/scripts/main.js` }] });
        for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
            await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
            await navigate(`/games/${basename(starterFolder)}/`);
            await evaluate(`new Promise((resolve, reject) => {
          const deadline = performance.now() + 90000;
          const check = () => {
            const status = document.querySelector('#boot-status').textContent;
            if (status.startsWith('Failed')) reject(new Error(status));
            else if (document.querySelector('#boot.is-done')) resolve();
            else if (performance.now() > deadline) reject(new Error('Starter boot timeout'));
            else requestAnimationFrame(check);
          }; check();
        })`);
            const initial = await evaluate(`window.__starterGame.player.getPosition()`);
            await page('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w' });
            await evaluate(`new Promise(resolve => setTimeout(resolve, 350))`);
            await page('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w' });
            const moved = await evaluate(`window.__starterGame.player.getPosition()`);
            assert.ok(Math.hypot(initial.x - moved.x, initial.z - moved.z) > 0.3, `starter/${name}: movement`);
            await page('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ' });
            await evaluate(`new Promise(resolve => setTimeout(resolve, 150))`);
            await page('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ' });
            assert.ok((await evaluate(`window.__starterGame.player.getPosition().y`)) > moved.y + 0.3, `starter/${name}: jump`);
            await evaluate(`new Promise(resolve => setTimeout(resolve, 1200))`);
            assert.equal(await evaluate(`window.__starterGame.engine.get('physics').character.grounded`), true, `starter/${name}: landing`);
            await page('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyV', key: 'v' });
            await page('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyV', key: 'v' });
            assert.equal(await evaluate(`window.__starterGame.settings.viewMode`), 'firstPerson');
            await evaluate(`window.__starterGame.player.setViewMode('thirdPerson')`);
            await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
            assert.equal(await evaluate(`performance.getEntriesByType('resource').some(entry => entry.name.includes('/games/sandbox/'))`), false);
            assert.deepEqual(await evaluate(`(() => { const rect = document.querySelector('#canvas').getBoundingClientRect(); return [rect.width, rect.height]; })()`), [width, height]);
            const { data } = await page('Page.captureScreenshot', { format: 'png' });
            const colors = await evaluate(`(async () => {
          const image = new Image(); image.src = 'data:image/png;base64,' + ${JSON.stringify(data)};
          await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
          const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, 64, 64);
          const pixels = context.getImageData(0, 0, 64, 64).data;
          const colors = new Set();
          for (let offset = 0; offset < pixels.length; offset += 4) colors.add(pixels.slice(offset, offset + 3).join(','));
          return colors.size;
        })()`);
            assert.ok(colors > 30, `starter/${name}: blank canvas`);
            await writeFile(join(output, `starter-${name}.png`), Buffer.from(data, 'base64'));
            assert.deepEqual([...new Set(runtimeErrors)], [], `starter/${name}: runtime/GPU errors`);
            console.log(`starter/${name}: copied folder, movement, jump/landing, cameras, nonblank canvas passed`);
        }
        await navigate('/');
        await page('Fetch.disable');
    };

    if (aoMode) {
        await navigate('/games/sandbox/');
        console.log('AO pixels:', await evaluate(`import('/tests/ao-check.js').then(module => module.checkAO())`));
        assert.deepEqual([...new Set(runtimeErrors)], [], 'AO pixel regression: runtime/GPU errors');
        await send('Browser.close');
    } else if (starterMode) {
        await checkStarter();
        await send('Browser.close');
    } else if (performanceMode) {
        await page('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
        if (process.env.NGIN_BOOT_CPU === '1') {
            await page('Profiler.enable');
            await page('Profiler.start');
        }
        const started = Date.now();
        await navigate('/games/sandbox/');
        await evaluate(`new Promise((resolve, reject) => {
          const deadline = performance.now() + 90000;
          const check = () => {
            const status = document.querySelector('#boot-status').textContent;
            if (status.startsWith('Failed')) reject(new Error(status));
            else if (window.__performanceSandbox) resolve();
            else if (performance.now() > deadline) reject(new Error('Boot timeout: ' + status));
            else requestAnimationFrame(check);
          }; check();
        })`);
        console.log(`Cold boot: ${Date.now() - started} ms`);
        console.log(JSON.stringify(await evaluate('window.__bootStages'), null, 2));
        if (process.env.NGIN_BOOT_CPU === '1') {
            const { profile } = await page('Profiler.stop');
            await writeFile(join(output, 'boot.cpuprofile'), JSON.stringify(profile));
            console.log('Startup CPU hot spots:', profile.nodes.filter(node => node.hitCount)
                .sort((left, right) => right.hitCount - left.hitCount).slice(0, 20)
                .map(node => ({ function: node.callFrame.functionName, hits: node.hitCount, line: node.callFrame.lineNumber, url: node.callFrame.url })));
            console.log(`Startup profile: ${join(output, 'boot.cpuprofile')}`);
        }
        if (process.env.NGIN_CPU === '1') {
            await page('Profiler.enable');
            await page('Profiler.start');
        }
        const result = await evaluate(`import('/tests/performance-probe.js').then(module => module.runPerformanceProbe(window.__performanceSandbox))`);
        if (process.env.NGIN_CPU === '1') {
            const { profile } = await page('Profiler.stop');
            console.log('CPU hot spots:', profile.nodes.filter(node => node.hitCount)
                .sort((left, right) => right.hitCount - left.hitCount).slice(0, 18)
                .map(node => ({ function: node.callFrame.functionName, hits: node.hitCount, url: node.callFrame.url })));
        }
        console.log(JSON.stringify(result, null, 2));
        assert.deepEqual([...new Set(runtimeErrors)], [], 'Performance run: runtime/GPU errors');
        for (const sample of result.samples) {
            assert.ok(sample.maxGapMs < 250, sample.name + ': frame gap ' + sample.maxGapMs + ' ms');
            assert.deepEqual(sample.builds, [], sample.name + ': unexpected gameplay shader compilation');
        }
        await send('Browser.close');
    } else {
        await checkStarter();
        for (const [name, width, height, theme] of [
            ['desktop', 1440, 900, 'light'], ['mobile', 390, 844, 'light'],
            ['small', 320, 740, 'light'], ['dark', 1440, 900, 'dark'],
        ]) {
            await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
            await page('Emulation.setEmulatedMedia', {
                features: [
                    { name: 'prefers-color-scheme', value: theme },
                    { name: 'prefers-reduced-motion', value: 'reduce' },
                ]
            });
            for (const [label, path] of [['home', '/'], ['docs', '/docs/']]) {
                await navigate(path);
                const result = await evaluate(`(() => {
        const overflow = [...document.querySelectorAll('h1,h2,h3,p,pre,a,summary')]
          .filter(element => element.getClientRects().length && element.scrollWidth > element.clientWidth + 2 && getComputedStyle(element).display !== 'inline')
          .map(element => element.textContent.trim().slice(0, 80));
        return {
          title: document.title,
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          brokenImages: [...document.images].filter(image => !image.complete || !image.naturalWidth).map(image => image.src),
          overflow,
          theme: getComputedStyle(document.body).backgroundColor
        };
      })()`);
                assert.ok(result.scrollWidth <= width + 1, `${label}/${name}: horizontal overflow`);
                assert.deepEqual(result.brokenImages, [], `${label}/${name}: broken images`);
                assert.deepEqual(result.overflow, [], `${label}/${name}: clipped text`);
                const screenshot = await page('Page.captureScreenshot', { format: 'png' });
                await writeFile(join(output, `${label}-${name}.png`), Buffer.from(screenshot.data, 'base64'));
                console.log(`${label}/${name}: ${result.width}px, no overflow, images loaded, ${result.theme}`);
            }
        }

        await navigate('/');
        const linkFailures = await evaluate(`(async () => {
    const failures = [];
    const pages = new Map();
    for (const path of ['/', '/docs/']) {
      const html = await (await fetch(path)).text();
      const document = new DOMParser().parseFromString(html, 'text/html');
      for (const element of document.querySelectorAll('a[href],link[rel="stylesheet"],script[src],img[src]')) {
        const url = new URL(element.getAttribute('href') || element.getAttribute('src'), new URL(path, location.origin));
        if (url.origin !== location.origin) continue;
        const hash = url.hash;
        url.hash = '';
        if (!pages.has(url.href)) pages.set(url.href, fetch(url).then(async response => ({ ok: response.ok, text: await response.text() })));
        const response = await pages.get(url.href);
        if (!response.ok) failures.push(url.href);
        else if (hash && !new DOMParser().parseFromString(response.text, 'text/html').getElementById(decodeURIComponent(hash.slice(1)))) failures.push(url.href + hash);
      }
    }
    return failures;
  })()`);
        assert.deepEqual(linkFailures, [], 'Local links and fragments must resolve');
        await evaluate(`document.querySelector('.recipes summary').click()`);
        assert.equal(await evaluate(`document.querySelector('.recipes details').open`), true);
        await navigate('/docs/#pbr');
        assert.equal(await evaluate(`document.querySelector('.module-list a[href="#pbr"]').getAttribute('aria-current')`), 'location');
        console.log('Local links, fragment navigation, and native disclosures passed.');
        const inventoryResult = await evaluate(`(async () => {
    const { createInventory } = await import('/src/player/Inventory.js');
    const hud = document.createElement('div');
    const inventory = createInventory(hud);
    const name = '<img src=x onerror=alert(1)>';
    inventory.add({ name, drop() {} });
    const safe = hud.querySelector('img') === null && hud.textContent.includes(name);
    const visible = !hud.hidden;
    inventory.take(0);
    return { safe, visible, empty: hud.hidden && hud.textContent === '' };
  })()`);
        assert.deepEqual(inventoryResult, { safe: true, visible: true, empty: true });
        console.log('Inventory DOM: labels are literal text; add/remove visibility passed.');

        for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
            await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
            runtimeErrors.length = 0;
            await navigate('/games/sandbox/');
            await evaluate(`new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Game boot timed out: ' + document.querySelector('#boot-status').textContent)), 90000);
          const check = () => {
            const status = document.querySelector('#boot-status').textContent;
            if (status.startsWith('Failed')) { clearTimeout(timeout); reject(new Error(status)); }
            else if (document.querySelector('#boot.is-done')) { clearTimeout(timeout); resolve(); }
            else requestAnimationFrame(check);
          };
          check();
        })`);
            assert.equal(await evaluate(`import('three/webgpu').then(module => module.REVISION)`), '186');
            const sunResult = await evaluate(`(async () => {
          const THREE = await import('three/webgpu');
          const { createEnvironment } = await import('/src/graphics/Environment.js');
          const scene = new THREE.Scene();
          const camera = new THREE.PerspectiveCamera(75, 1.6, 0.1, 300);
          const updates = [];
          const registrations = [];
          const engine = {
            scene, camera,
            renderer: { library: { addLight: (...args) => registrations.push(args) } },
            onUpdate: callback => updates.push(callback),
          };
          const environment = createEnvironment(engine);
          environment.load('industrial');
          const sun = environment.sun;
          const isSunLight = sun.isSunLight === true && sun.target === undefined;
          const registered = registrations.some(([node, light]) => node.name === 'SunLightNode' && sun instanceof light);
          const count = sun.shadow.getViewportCount();
          const layers = Array.from({ length: count }, (_, cascade) => sun.shadow.getCamera(cascade).layers.mask);
          scene.updateMatrixWorld(true);
          camera.updateMatrixWorld(true);
          sun.shadow.updateMatrices(sun, camera);
          const shadowBefore = sun.shadow.getCamera(0).position.clone();
          const directionBefore = sun.position.clone();
          camera.position.x += 20;
          camera.updateMatrixWorld(true);
          sun.shadow.updateMatrices(sun, camera);
          const followsCamera = shadowBefore.distanceTo(sun.shadow.getCamera(0).position) > 1 && directionBefore.equals(sun.position);
          environment.setTimeOfDay(0.5);
          const dayIntensity = sun.intensity;
          const dayDirection = sun.position.clone();
          environment.setTimeOfDay(0);
          const dayNight = dayIntensity > sun.intensity && !dayDirection.equals(sun.position);
          environment.setCycle(true);
          const timeBefore = environment.getTimeOfDay();
          updates.forEach(callback => callback(1));
          const cycle = environment.getTimeOfDay() > timeBefore;
          let disposed = false;
          sun.addEventListener('dispose', () => { disposed = true; });
          environment.load('night');
          const replaced = !scene.children.includes(sun) && environment.sun.isSunLight;
          environment.sun.dispose();
          return { isSunLight, registered, count, layers, followsCamera, dayNight, cycle, disposed, replaced };
        })()`);
            assert.deepEqual(sunResult, {
                isSunLight: true, registered: true, count: 2, layers: [1, 1],
                followsCamera: true, dayNight: true, cycle: true, disposed: true, replaced: true,
            }, `game/${name}: native SunLight integration`);
            assert.equal(await evaluate(`import('/tests/static-model-check.js').then(module => module.checkStaticModelBatching())`), true, `game/${name}: static model batching`);
            console.log(`game/${name}: AO pixels`, await evaluate(`import('/tests/ao-check.js').then(module => module.checkAO())`));
            const painterlyResult = await evaluate(`(async () => {
          const THREE = await import('three/webgpu');
          const { loadPainterlyMaterial } = await import('/src/graphics/MaterialLibrary.js');
          const requests = [];
          const map = new THREE.Texture();
          const material = await loadPainterlyMaterial({ loadTexture: async url => { requests.push(url); return map; } }, 'Worn Crate.png');
          const resources = performance.getEntriesByType('resource').map(entry => decodeURIComponent(entry.name));
          const filenames = ['Worn Crate.png', 'Mossy Wooden Planks.png', 'CobbleStoneGreyBrown.png', 'PlasterMossy.png'];
          const result = {
            requests,
            colorOnly: material.map === map && !material.normalMap && !material.roughnessMap && !material.metalnessMap && !material.aoMap && !material.displacementMap && !material.positionNode,
            lit: material.isMeshStandardNodeMaterial && material.fog && material.roughness === 0.9 && material.metalness === 0,
            textureSettings: map.colorSpace === THREE.SRGBColorSpace && map.wrapS === THREE.RepeatWrapping && map.wrapT === THREE.RepeatWrapping && map.minFilter === THREE.LinearMipmapLinearFilter && map.anisotropy === 4,
            loaded: filenames.every(filename => resources.some(url => url.endsWith('/assets/textures/painterly/' + filename))),
            noOldMaps: !resources.some(url => /oily-tubework|red-scifi-metal|storage-container2|worn-factory-siding/.test(url)),
            noDisplacementControl: ![...document.querySelectorAll('.lil-gui .name')].some(element => element.textContent === 'displacement'),
          };
          material.dispose();
          map.dispose();
          return result;
        })()`);
            assert.deepEqual(painterlyResult, {
                requests: ['./assets/textures/painterly/Worn%20Crate.png'],
                colorOnly: true, lit: true, textureSettings: true, loaded: true, noOldMaps: true, noDisplacementControl: true,
            }, `game/${name}: painterly color textures without displacement`);
            const frameWait = `new Promise(resolve => {
          let frames = 0;
          const tick = () => ++frames >= 12 ? resolve() : requestAnimationFrame(tick);
          requestAnimationFrame(tick);
        })`;
            const canvasShot = async (label) => {
                await evaluate(frameWait);
                const clip = await evaluate(`(() => {
              const bounds = document.querySelector('#canvas').getBoundingClientRect();
              return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, scale: 1 };
            })()`);
                assert.equal(clip.width, width);
                assert.equal(clip.height, height);
                const { data } = await page('Page.captureScreenshot', { format: 'png', clip });
                const colors = await evaluate(`(async () => {
              const image = new Image(); image.src = 'data:image/png;base64,' + ${JSON.stringify(data)};
              await image.decode();
              const probe = document.createElement('canvas'); probe.width = 64; probe.height = 64;
              const context = probe.getContext('2d'); context.drawImage(image, 0, 0, 64, 64);
              const pixels = context.getImageData(0, 0, 64, 64).data;
              const unique = new Set();
              for (let index = 0; index < pixels.length; index += 4) unique.add(pixels.slice(index, index + 3).join(','));
              return unique.size;
            })()`);
                assert.ok(colors > 100, `game/${name}/${label}: blank canvas (${colors} colors)`);
                await writeFile(join(output, `game-${name}-${label}.png`), Buffer.from(data, 'base64'));
                return data;
            };
            const before = await canvasShot('default');
            await evaluate(`(() => {
          for (const input of document.querySelectorAll('.lil-gui input[type="checkbox"]')) {
            const label = document.getElementById(input.getAttribute('aria-labelledby'))?.textContent;
            if (['ambient occlusion', 'rain', 'snow'].includes(label) && !input.checked) input.click();
          }
          document.querySelector('#canvas').focus();
        })()`);
            await page('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW' });
            await evaluate(frameWait);
            await page('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW' });
            const after = await canvasShot('ao-weather');
            assert.notEqual(before, after, `game/${name}: frame must change after movement and effects`);
            await evaluate(`(() => {
          const input = [...document.querySelectorAll('.lil-gui input')].find(element =>
            document.getElementById(element.getAttribute('aria-labelledby'))?.textContent === 'time of day');
          input.value = '0';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        })()`);
            const night = await canvasShot('night');
            assert.notEqual(after, night, `game/${name}: night frame must differ`);
            assert.deepEqual([...new Set(runtimeErrors)], [], `game/${name}: runtime/GPU errors`);
            console.log(`game/${name}: SunLight cascades/day-night, r186 boot, AO/weather, movement and nonblank ${width}x${height} canvas passed.`);
        }
        console.log(`Browser screenshots: ${output}`);
        await send('Browser.close');
    }
} finally {
    socket?.close();
    browser.kill();
    if (starterFolder) await rm(starterFolder, { recursive: true, force: true });
}