import * as THREE from 'three/webgpu';
import { createBlockTextures } from './BlockTextures.js';
import { brickTexture, stoneTexture, woodTexture } from './ProceduralTextures.js';

const solids = () => ({
    concrete: { color: 0x888888, roughness: 0.85, metalness: 0.0, texture: stoneTexture },
    asphalt: { color: 0x333333, roughness: 0.95, metalness: 0.0 },
    metal: { color: 0xaaaaaa, roughness: 0.35, metalness: 0.9 },
    wood: { color: 0x8b6914, roughness: 0.75, metalness: 0.0, texture: woodTexture },
    orange: { color: 0xe67a22, roughness: 0.55, metalness: 0.08 },
    brick: { color: 0x8c5648, roughness: 0.9, metalness: 0.0, texture: brickTexture },
    teal: { color: 0x2a8f9e, roughness: 0.7, metalness: 0.05 },
    pushable: { color: 0x6bbf4e, roughness: 0.65, metalness: 0.05 },
    glass: { color: 0xaaccff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.4 },
    glassDark: { color: 0x223344, roughness: 0.05, metalness: 0.15, transparent: true, opacity: 0.55 },
    water: { color: 0x2266aa, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.7 },
    red: { color: 0xcc2222, roughness: 0.45, metalness: 0.15 },
    blue: { color: 0x2244aa, roughness: 0.45, metalness: 0.15 },
    yellow: { color: 0xddaa22, roughness: 0.5, metalness: 0.1 },
    white: { color: 0xeeeeee, roughness: 0.5, metalness: 0.05 },
    darkGrey: { color: 0x222222, roughness: 0.8, metalness: 0.0 },
    chrome: { color: 0xcccccc, roughness: 0.1, metalness: 0.95 },
    rubber: { color: 0x1a1a1a, roughness: 0.95, metalness: 0.0 },
    taillight: { color: 0xff2200, roughness: 0.2, metalness: 0.3 },
    headlight: { color: 0xffffcc, roughness: 0.1, metalness: 0.4 },
});

const mapped = (map, roughness, metalness = 0) => {
    const mat = new THREE.MeshStandardNodeMaterial({
        color: 0xffffff,
        roughness,
        metalness,
        fog: true,
    });
    mat.map = map;
    return mat;
};

/** Lit, fog-aware material for a texture used as albedo. */
export const createMappedMaterial = (map, roughness = 0.9, extras = {}) => {
    const mat = new THREE.MeshStandardNodeMaterial({
        roughness,
        metalness: extras.metalness ?? 0,
        transparent: extras.transparent ?? false,
        alphaTest: extras.alphaTest ?? 0,
        fog: true,
        side: extras.side ?? THREE.FrontSide,
    });
    mat.map = map;
    return mat;
};

/**
 * @returns {{
 *   get: (name: string, variant?: number) => THREE.MeshStandardNodeMaterial,
 *   pack: (name: string) => THREE.MeshStandardNodeMaterial[] | null,
 *   list: () => string[],
 * }}
 */
export const createMaterialLibrary = () => {
    /** @type {Map<string, THREE.MeshStandardNodeMaterial>} */
    const singles = new Map();
    /** @type {Map<string, THREE.MeshStandardNodeMaterial[]>} */
    const packs = new Map();

    for (const [name, def] of Object.entries(solids())) {
        const map = def.texture ? def.texture({ size: 64, repeat: 1 }) : null;
        const mat = new THREE.MeshStandardNodeMaterial({
            color: map ? 0xffffff : def.color,
            roughness: def.roughness,
            metalness: def.metalness,
            transparent: def.transparent ?? false,
            opacity: def.opacity ?? 1,
            fog: true,
        });
        if (map) mat.map = map;
        singles.set(name, mat);
    }

    const blocks = createBlockTextures({ size: 64, repeat: 1 });
    packs.set('grass', blocks.grass.map((map) => mapped(map, 0.9)));
    packs.set('dirt', blocks.dirt.map((map) => mapped(map, 0.95)));
    packs.set('rock', blocks.rock.map((map) => mapped(map, 0.88)));
    packs.set('rustyMetal', blocks.rustyMetal.map((map) => mapped(map, 0.55, 0.42)));
    packs.set('grassBlock', blocks.grassBlock.map((map) => mapped(map, 0.92)));

    singles.set('asphalt', mapped(blocks.rock[0], 0.95));

    return {
        get: (name, variant = 0) => {
            const pack = packs.get(name);
            if (pack) return pack[variant % pack.length];
            return singles.get(name) ?? singles.get('concrete');
        },
        pack: (name) => packs.get(name) ?? null,
        list: () => [...new Set([...singles.keys(), ...packs.keys()])],
    };
};
