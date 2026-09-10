import * as THREE from 'three/webgpu';
import { createRenderer } from '../src/engine/Renderer.js';
import { createAO } from '../src/graphics/AO.js';

export const checkAO = async () => {
    const width = 320;
    const height = 240;
    const canvas = document.createElement('canvas');
    const { renderer } = await createRenderer(canvas, { shadows: false });
    renderer.setSize(width, height, false);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x6688aa);
    scene.add(new THREE.AmbientLight(0xffffff, 2));
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 40);
    camera.position.set(4, 4, 6);
    camera.lookAt(0, 0.5, 0);
    camera.layers.enable(1);
    const material = new THREE.MeshStandardNodeMaterial({ color: 0xaaaaaa, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.BoxGeometry(12, 0.2, 12), material);
    ground.position.y = -0.1;
    const cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
    cube.position.y = 1;
    const billboard = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7),
        new THREE.MeshBasicNodeMaterial({ color: 0xee7733, transparent: true, depthWrite: false }));
    billboard.position.set(-1.6, 1.5, 1.5);
    billboard.quaternion.copy(camera.quaternion);
    billboard.layers.set(1);
    scene.add(ground, cube, billboard);
    let draw;
    const ao = createAO({ renderer, scene, camera, setDraw: callback => { draw = callback; } });
    const target = new THREE.RenderTarget(width, height, { type: THREE.UnsignedByteType });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    renderer.setOutputRenderTarget(target);
    const frame = () => new Promise(resolve => {
        renderer.setAnimationLoop(() => {
            draw();
            renderer.setAnimationLoop(null);
            resolve();
        });
    });
    const capture = async on => {
        ao.setEnabled(on);
        await frame();
        await frame();
        return renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
    };
    try {
        await ao.warm();
        const off = await capture(false);
        const on = await capture(true);
        const restored = await capture(false);
        let darkened = 0;
        let brightened = 0;
        let strongest = 0;
        let restoreError = 0;
        for (let offset = 0; offset < off.length; offset += 4) {
            const change = (on[offset] + on[offset + 1] + on[offset + 2] - off[offset] - off[offset + 1] - off[offset + 2]) / 3;
            if (change < -3) darkened++;
            if (change > 3) brightened++;
            strongest = Math.max(strongest, -change);
            for (let channel = 0; channel < 3; channel++) restoreError = Math.max(restoreError, Math.abs(restored[offset + channel] - off[offset + channel]));
        }
        const projected = billboard.position.clone().project(camera);
        const pixelX = Math.round((projected.x + 1) * width / 2);
        const pixelY = Math.round((1 - projected.y) * height / 2);
        const billboardOffset = (pixelY * width + pixelX) * 4;
        const billboardChange = Math.max(...[0, 1, 2].map(channel => Math.abs(on[billboardOffset + channel] - off[billboardOffset + channel])));
        const result = { darkened, brightened, strongest, restoreError, billboardChange };
        if (darkened < 100 || strongest < 15 || brightened > 10 || restoreError > 1 || billboardChange > 1) {
            throw new Error('AO pixel regression: ' + JSON.stringify(result));
        }
        return result;
    } finally {
        renderer.setOutputRenderTarget(null);
        target.dispose();
        ground.geometry.dispose();
        cube.geometry.dispose();
        billboard.geometry.dispose();
        material.dispose();
        billboard.material.dispose();
        await renderer.dispose();
    }
};