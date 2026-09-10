/**
 * Opaque-only SSAO applied to ambient lighting. Off by default.
 */

import * as THREE from 'three/webgpu';
import { pass, normalView, screenUV, builtinAOContext, uniform, mix } from 'three/tsl';
import { ssao } from 'three/addons/tsl/display/SSAONode.js';

/**
 * @param {import('../engine/Engine.js').Engine} engine
 */
export const createAO = (engine) => {
    const { renderer, scene, camera } = engine;
    const pipeline = new THREE.RenderPipeline(renderer);

    const prePass = pass(scene, camera, { samples: 0 });
    prePass.updateBeforeType = 'none';
    prePass.transparent = false;
    prePass.setLayers(new THREE.Layers());
    prePass.overrideMaterial = new THREE.MeshBasicNodeMaterial();
    prePass.overrideMaterial.fragmentNode = normalView;

    const aoPass = ssao(prePass.getTextureNode('depth'), prePass.getTextureNode(), camera);
    aoPass.updateBeforeType = 'none';
    aoPass.resolutionScale = 0.5;
    aoPass.samples.value = 8;
    aoPass.radius.value = 0.6;
    aoPass.intensity.value = 3;

    const strength = uniform(0);
    const scenePass = pass(scene, camera);
    scenePass.contextNode = builtinAOContext(mix(1, aoPass.getTextureNode().sample(screenUV).r, strength));
    pipeline.outputNode = scenePass;
    let enabled = false;
    const updateAO = () => {
        const frame = { renderer };
        prePass.updateBefore(frame);
        aoPass.updateBefore(frame);
    };
    engine.setDraw(() => {
        if (enabled) updateAO();
        pipeline.render();
    });

    return {
        async warm(onProgress = () => { }) {
            const previousContext = renderer.contextNode;
            const previousOverride = scene.overrideMaterial;
            const previousMask = camera.layers.mask;
            const previousTransparent = renderer.transparent;
            scenePass.renderTarget.samples = renderer.samples;
            try {
                onProgress('Compiling AO geometry');
                scene.overrideMaterial = prePass.overrideMaterial;
                camera.layers.mask = prePass.getLayers().mask;
                renderer.transparent = false;
                await prePass.compileAsync(renderer);
                scene.overrideMaterial = previousOverride;
                camera.layers.mask = previousMask;
                renderer.transparent = previousTransparent;
                renderer.contextNode = scenePass.contextNode;
                onProgress('Compiling scene materials');
                await scenePass.compileAsync(renderer);
            } finally {
                renderer.contextNode = previousContext;
                scene.overrideMaterial = previousOverride;
                camera.layers.mask = previousMask;
                renderer.transparent = previousTransparent;
            }
            onProgress('Preparing render pipeline');
            updateAO();
            pipeline.render();
        },
        setEnabled(on) {
            enabled = !!on;
            strength.value = on ? 1 : 0;
        },
    };
};
