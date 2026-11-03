import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/*
 * Real-world CC0 materials and furniture from Poly Haven (polyhaven.com), loaded straight from their CDN.
 * Everything here is progressive: the scene renders with procedural stand-ins and upgrades as files arrive.
 * ponytail: hotlinked from dl.polyhaven.org; self-host these files (and compress to KTX2) before launch.
 */

const CDN = "https://dl.polyhaven.org/file/ph-assets";
const loader = new THREE.TextureLoader();
// Poly Haven's glTF files point at "textures/x.jpg"; the CDN serves those under /Models/jpg/1k/<id>/.
const manager = new THREE.LoadingManager();
manager.setURLModifier((u) => u.replace(/\/Models\/gltf\/1k\/([^/]+)\/textures\//, "/Models/jpg/1k/$1/"));
const gltf = new GLTFLoader(manager);

type Pbr = { map?: boolean; normal?: boolean; rough?: boolean; exterior?: boolean };

// 1x1 stand-ins (white / flat normal / neutral roughness). A material gets them up front, so its shader is compiled
// once with the right maps; when the real file arrives it only swaps the texture, with no recompile hitch.
const pixel = (r: number, g: number, b: number, srgb: boolean) => {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
};
const BLANK = { map: pixel(255, 255, 255, true), normal: pixel(128, 128, 255, false), rough: pixel(255, 255, 255, false) };

// Set once from the quality tier: phones skip the relief maps on streets and facades (invisible at that size).
let exteriorDetail = true;
export const setExteriorDetail = (on: boolean) => { exteriorDetail = on; };

/** Gives a material its map slots now (as stand-ins), so a later applyPbr swaps textures without recompiling. */
export function preparePbr(mat: THREE.MeshStandardMaterial, use: Pbr, normalScale = 1) {
  if (use.map && !mat.map) mat.map = BLANK.map;
  if (use.normal && !mat.normalMap) { mat.normalMap = BLANK.normal; mat.normalScale.set(normalScale, normalScale); }
  if (use.rough && !mat.roughnessMap) mat.roughnessMap = BLANK.rough;
}

/** Upgrades a material in place with a Poly Haven texture set (1k jpg). */
export function applyPbr(mat: THREE.MeshStandardMaterial, id: string, repeat: number | [number, number], use: Pbr = { map: true, normal: true, rough: true }, normalScale = 1) {
  if (use.exterior && !exteriorDetail) use = { map: use.map };
  const rep: [number, number] = typeof repeat === "number" ? [repeat, repeat] : repeat;
  preparePbr(mat, use, normalScale);
  const load = (suffix: string, srgb: boolean, apply: (t: THREE.Texture) => void) => {
    loader.load(`${CDN}/Textures/jpg/1k/${id}/${id}_${suffix}_1k.jpg`, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep[0], rep[1]);
      t.anisotropy = 8;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      apply(t); // same map slots as the stand-in, so no shader recompile
    });
  };
  if (use.map) load("diff", true, (t) => { mat.map = t; });
  if (use.normal) load("nor_gl", false, (t) => { mat.normalMap = t; mat.normalScale.set(normalScale, normalScale); });
  if (use.rough) load("rough", false, (t) => { mat.roughnessMap = t; });
}

/** Loads a Poly Haven model (glTF, 1k textures) with shadows on. */
export function loadModel(id: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    gltf.load(`${CDN}/Models/gltf/1k/${id}/${id}_1k.gltf`, (g) => {
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
      });
      resolve(g.scene);
    }, undefined, reject);
  });
}

/**
 * Makes a material sample its maps in world space (metres / scale) instead of mesh UVs,
 * so tiled surfaces (paving, grass, asphalt, concrete) keep a true scale on any size of mesh.
 */
export function worldUv(mat: THREE.Material, scale: number) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.onBeforeCompile = (s, r) => {
    prev?.call(mat, s, r);
    s.vertexShader = s.vertexShader.replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>
      {
        vec4 wuvp = vec4(position, 1.0);
        vec3 wuvn = normal;
        #ifdef USE_INSTANCING
          wuvp = instanceMatrix * wuvp;
          wuvn = mat3(instanceMatrix) * wuvn;
        #endif
        wuvp = modelMatrix * wuvp;
        wuvn = normalize(mat3(modelMatrix) * wuvn);
        vec2 wuv = abs(wuvn.y) > 0.5 ? wuvp.xz : (abs(wuvn.x) > abs(wuvn.z) ? wuvp.zy : wuvp.xy);
        wuv *= ${(1 / scale).toFixed(5)};
        #ifdef USE_MAP
          vMapUv = wuv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = wuv;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = wuv;
        #endif
      }`,
    );
  };
  mat.customProgramCacheKey = () => `worldUv${scale}|${prevKey ? prevKey() : ""}`;
}
