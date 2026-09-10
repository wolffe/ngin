export const runPerformanceProbe = async ({ engine, gui }) => {
    const { renderer, camera } = engine;
    const adapter = await navigator.gpu?.requestAdapter();
    const adapterInfo = adapter?.info;
    const renderTimes = [];
    let drawCalls = 0;
    let triangles = 0;
    const originalRender = renderer.render;
    let renderDepth = 0;
    renderer.render = function (...args) {
        const started = performance.now();
        renderDepth++;
        try {
            return originalRender.apply(this, args);
        } finally {
            if (--renderDepth === 0) {
                renderTimes.push(performance.now() - started);
                drawCalls = Math.max(drawCalls, renderer.info.render.drawCalls);
                triangles = Math.max(triangles, renderer.info.render.triangles);
            }
        }
    };
    const builds = [];
    const previousCallback = renderer.debug.onNodeBuilderCreated;
    renderer.debug.onNodeBuilderCreated = (builder) => {
        builds.push({ material: builder.material?.name || builder.material?.type, geometry: builder.object?.geometry?.type });
        previousCallback?.(builder);
    };
    const controllers = gui.controllersRecursive();
    const set = (property, value) => controllers.find(controller => controller.property === property).setValue(value);
    const samples = [];
    const originalRotation = camera.rotation.clone();
    const sweep = (name, action) => new Promise((resolve) => {
        const gaps = [];
        const buildStart = builds.length;
        const renderStart = renderTimes.length;
        drawCalls = 0;
        triangles = 0;
        let previous = performance.now();
        let frame = 0;
        const remove = engine.onLateUpdate(() => {
            const now = performance.now();
            gaps.push(now - previous);
            previous = now;
            camera.rotation.set(-0.12, originalRotation.y + frame * Math.PI * 2 / 120, 0, 'YXZ');
            if (++frame <= 120) return;
            remove();
            const ordered = [...gaps].sort((left, right) => left - right);
            const renderCosts = renderTimes.slice(renderStart).sort((left, right) => left - right);
            samples.push({ name, maxGapMs: Math.round(Math.max(...gaps)), worstFrame: gaps.indexOf(Math.max(...gaps)), p95Ms: Math.round(ordered[Math.floor(ordered.length * 0.95)]), renderP95Ms: Math.round(renderCosts[Math.floor(renderCosts.length * 0.95)] || 0), drawCalls, triangles, builds: builds.slice(buildStart) });
            resolve();
        });
        action?.();
    });
    try {
        await sweep('direct first turn');
        await sweep('AO first turn', () => set('ao', true));
        await sweep('AO second turn');
        await sweep('direct toggle', () => set('ao', false));
        await sweep('weather and third person', () => {
            set('rain', true);
            set('snow', true);
            set('viewMode', 'thirdPerson');
        });
        await sweep('AO weather', () => set('ao', true));
        const lightCounts = {};
        engine.scene.traverse(object => {
            if (object.isLight) lightCounts[object.type] = (lightCounts[object.type] || 0) + 1;
        });
        return { backend: renderer.backend.constructor.name, adapter: adapterInfo && { vendor: adapterInfo.vendor, architecture: adapterInfo.architecture, device: adapterInfo.device, description: adapterInfo.description, fallback: adapterInfo.isFallbackAdapter }, lightCounts, samples };
    } finally {
        renderer.render = originalRender;
        renderer.debug.onNodeBuilderCreated = previousCallback;
        camera.rotation.copy(originalRotation);
        set('ao', false);
        set('rain', false);
        set('snow', false);
        set('viewMode', 'firstPerson');
    }
};