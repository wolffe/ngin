import { mergeConfig } from './Config.js';
import { createClock } from './Clock.js';
import { createEvents } from './Events.js';
import { createRenderer } from './Renderer.js';
import { createSceneGraph } from './SceneGraph.js';

/**
 * @typedef {Object} Engine
 * @property {ReturnType<typeof mergeConfig>} config
 * @property {import('three/webgpu').WebGPURenderer} renderer
 * @property {import('three').Scene} scene
 * @property {import('three').PerspectiveCamera} camera
 * @property {ReturnType<typeof createEvents>} events
 * @property {ReturnType<typeof createClock>} clock
 * @property {Map<string, unknown>} services
 * @property {(name: string, service: unknown) => void} register
 * @property {(name: string) => unknown} get
 * @property {((dt: number) => void)[]} updateHooks
 * @property {((fn: (dt: number) => void) => () => void)} onUpdate
 * @property {((fn: (dt: number) => void) => () => void)} onLateUpdate
 * @property {(width: number, height: number) => void} resize
 * @property {(value: number) => void} setPixelRatio
 * @property {(fn: (() => void) | null) => void} setDraw
 * @property {() => Promise<void>} start
 * @property {() => void} stop
 * @property {() => void} dispose
 */

/** @param {HTMLCanvasElement} canvas @param {object} [configOverrides] @returns {Promise<Engine>} */
export const createEngine = async (canvas, configOverrides = {}) => {
    const config = mergeConfig(configOverrides);
    const events = createEvents();
    const clock = createClock();
    /** @type {Map<string, unknown>} */
    const services = new Map();
    /** @type {((dt: number) => void)[]} */
    const updateHooks = [];
    /** @type {((dt: number) => void)[]} */
    const lateUpdateHooks = [];

    const { renderer, resize, setPixelRatio } = await createRenderer(canvas, config.renderer);
    const { scene, camera, add, remove } = createSceneGraph(renderer);

    let running = false;
    /** @type {(() => void) | null} */
    let draw = null;

    const engine = {
        config,
        renderer,
        scene,
        camera,
        events,
        clock,
        services,
        updateHooks,
        lateUpdateHooks,
        add,
        remove,

        register(name, service) {
            services.set(name, service);
        },

        get(name) {
            return services.get(name);
        },

        onUpdate(fn) {
            updateHooks.push(fn);
            return () => {
                const i = updateHooks.indexOf(fn);
                if (i >= 0) updateHooks.splice(i, 1);
            };
        },

        /** Runs after all onUpdate hooks (input edge-press flush lives here). */
        onLateUpdate(fn) {
            lateUpdateHooks.push(fn);
            return () => {
                const i = lateUpdateHooks.indexOf(fn);
                if (i >= 0) lateUpdateHooks.splice(i, 1);
            };
        },

        resize(width, height) {
            resize(width, height);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        },

        setPixelRatio(value) {
            setPixelRatio(value);
        },

        setDraw(fn) {
            draw = fn;
        },

        async start() {
            if (running) return;
            running = true;
            const loop = () => {
                if (!running) return;
                const { delta } = clock.tick();
                for (const fn of updateHooks) fn(delta);
                for (const fn of lateUpdateHooks) fn(delta);
                if (draw) draw();
                else renderer.render(scene, camera);
            };
            await renderer.setAnimationLoop(loop);
        },

        stop() {
            running = false;
            renderer.setAnimationLoop(null);
        },

        dispose() {
            engine.stop();
            renderer.dispose();
        },
    };

    return engine;
};
