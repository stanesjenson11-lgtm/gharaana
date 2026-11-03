import * as THREE from "three";

/*
 * Low morning mist: thick at street level, gone by ~80 m, so towers rise out of it.
 * Patched into the exterior materials only; density is driven from the timeline (hero only).
 */
export const MIST = {
  uMistTop: { value: 80 },
  uMistDensity: { value: 0 },
  uMistColor: { value: new THREE.Color(0xe9eff6) },
};

export function addMist(mat: THREE.Material) {
  if (mat.userData.mist) return;
  mat.userData.mist = true;
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.onBeforeCompile = (s, r) => {
    prev?.call(mat, s, r);
    Object.assign(s.uniforms, MIST);
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vMistW;\nvarying float vMistD;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        {
          vec4 mw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            mw = instanceMatrix * mw;
          #endif
          vMistW = (modelMatrix * mw).xyz;
          vMistD = -mvPosition.z;
        }`,
      );
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uMistTop;\nuniform float uMistDensity;\nuniform vec3 uMistColor;\nvarying vec3 vMistW;\nvarying float vMistD;")
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        float mh = 1.0 - smoothstep(-10.0, uMistTop, vMistW.y);
        float md = 1.0 - exp(-vMistD * 0.008);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uMistColor, clamp(pow(mh, 1.5) * md * uMistDensity, 0.0, 0.97));`,
      );
  };
  mat.customProgramCacheKey = () => `mist|${prevKey ? prevKey() : ""}`;
  mat.needsUpdate = true;
}

export function addMistTo(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    (Array.isArray(m) ? m : m ? [m] : []).forEach(addMist);
  });
}
