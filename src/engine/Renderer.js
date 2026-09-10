import * as THREE from 'three/webgpu';
import { ClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ antialias?: boolean, shadows?: boolean, pixelRatio?: number }} opts
 */
export const createRenderer = async (canvas, opts = {}) => {
    const renderer = new THREE.WebGPURenderer({
        canvas,
        antialias: opts.antialias ?? true,
    });
    renderer.shadowMap.enabled = opts.shadows ?? true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    await renderer.init();
    if (renderer.backend.isWebGPUBackend) renderer.lighting = new ClusteredLighting();

    let pixelRatio = opts.pixelRatio ?? 1;
    let lastW = Math.max(1, canvas.clientWidth || 1);
    let lastH = Math.max(1, canvas.clientHeight || 1);

    const apply = () => {
        renderer.setDrawingBufferSize(lastW, lastH, pixelRatio);
    };

    apply();

    const resize = (width, height) => {
        lastW = Math.max(1, width);
        lastH = Math.max(1, height);
        apply();
    };

    const setPixelRatio = (value) => {
        pixelRatio = Number(value) || 1;
        apply();
    };

    return { renderer, resize, setPixelRatio };
};
