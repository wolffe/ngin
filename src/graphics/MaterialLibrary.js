import * as THREE from 'three/webgpu';
import { createBlockTextures } from './BlockTextures.js';

const solids = () => ({
    orange: { color: 0xe67a22, roughness: 0.55, metalness: 0.08 },
    teal: { color: 0x2a8f9e, roughness: 0.7, metalness: 0.05 },
    pushable: { color: 0x6bbf4e, roughness: 0.65, metalness: 0.05 },
    glass: { color: 0xaaccff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.4 },
    glassDark: { color: 0x334438, roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.55 },
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

const PACK_FINISH = {
    grass: [0.9, 0],
    dirt: [0.95, 0],
    rock: [0.88, 0],
    rustyMetal: [0.55, 0.42],
    grassBlock: [0.92, 0],
    wood: [0.75, 0],
    brick: [0.9, 0],
    stone: [0.88, 0],
    concrete: [0.92, 0],
    asphalt: [0.96, 0],
    metal: [0.38, 0.72],
    plaster: [0.9, 0],
    corrugated: [0.42, 0.55],
    paintedMetal: [0.5, 0.35],
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
        const mat = new THREE.MeshStandardNodeMaterial({
            color: def.color,
            roughness: def.roughness,
            metalness: def.metalness,
            transparent: def.transparent ?? false,
            opacity: def.opacity ?? 1,
            fog: true,
        });
        singles.set(name, mat);
    }

    const blocks = createBlockTextures({ size: 64, repeat: 1 });
    for (const [name, maps] of Object.entries(blocks)) {
        const [roughness, metalness] = PACK_FINISH[name] ?? [0.9, 0];
        packs.set(name, maps.map((map) => mapped(map, roughness, metalness)));
    }

    return {
        get: (name, variant) => {
            const pack = packs.get(name);
            if (pack) {
                const i = variant == null ? (Math.random() * pack.length) | 0 : ((variant % pack.length) + pack.length) % pack.length;
                return pack[i];
            }
            return singles.get(name) ?? packs.get('concrete')[0];
        },
        pack: (name) => packs.get(name) ?? null,
        list: () => [...new Set([...singles.keys(), ...packs.keys()])],
    };
};
