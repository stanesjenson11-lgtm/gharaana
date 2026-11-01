import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { rng } from "@/lib/geo";
import { buildTower, TOWER_TOP } from "./tower";
import { buildFloor } from "./interior";
import { buildCity, PARK, RIVER } from "./city";
import { buildBirds } from "./birds";
import { cloudTexture } from "./textures";
import { MIST, addMistTo } from "./mist";
import { LIGHT, cameraAt, pw } from "./path";
import { pickQuality } from "./quality";
import { setExteriorDetail } from "./assets";

export type WorldPin = { el: HTMLElement; at: THREE.Vector3 };

/** Places worth labelling in the top-down neighbourhood shot (they exist in the model). */
export const PIN_POINTS = {
  tower: new THREE.Vector3(0, TOWER_TOP + 4, 0),
  park: new THREE.Vector3(PARK.x, 6, PARK.z),
  river: new THREE.Vector3(-90, 1, (RIVER.z0 + RIVER.z1) / 2),
};

export function createWorld(canvas: HTMLCanvasElement, opts: { reduced: boolean; pins: WorldPin[]; onReady?: () => void }) {
  const t0 = performance.now();
  const marks: Record<string, number> = {};
  const mark = (k: string, v = performance.now()) => { marks[k] = Math.round(v); };
  const q = pickQuality();
  setExteriorDetail(q.exteriorDetail);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  const dprTop = Math.min(devicePixelRatio, q.dprMax);
  let dpr = dprTop;
  renderer.setPixelRatio(dpr);
  renderer.info.autoReset = false; // count draw calls for the whole frame, not just the last pass
  // Error checks make every new shader's first use wait for its compile (seconds of main-thread stall); dev only.
  renderer.debug.checkShaderErrors = process.env.NODE_ENV !== "production";
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.3, 12000);
  scene.fog = new THREE.Fog(0xcfdbe8, 1400, 9000);

  /* ---- sky + image-based light from the same sky ---- */
  const sky = new Sky();
  sky.scale.setScalar(30000);
  scene.add(sky);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(30000);
  envScene.add(envSky);
  for (const s of [sky, envSky]) {
    const u = s.material.uniforms;
    u.turbidity.value = 3; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.86;
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT: THREE.WebGLRenderTarget | null = null;
  let envKey = "";

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(q.shadow, q.shadow);
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = q.shadowRadius; // soft penumbra
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xdde8f5, 0x5d5a52, 0.3);
  scene.add(hemi);

  /* ---- the model ---- */
  const tA = performance.now();
  const tower = buildTower();
  const tB = performance.now();
  const floor = buildFloor();
  const tC = performance.now();
  const city = buildCity(q);
  const tD = performance.now();
  scene.add(tower.lower, tower.upper, floor.group, city.group);
  // The flat's lamps live outside its (often hidden) group: a change in visible light count would recompile every shader.
  for (const l of floor.lights) scene.attach(l);
  for (const g of [tower.lower, tower.upper, city.group]) addMistTo(g);

  /* ---- clouds: low wisps between the towers, cumulus in the sky, a bank on the horizon ---- */
  const cloudTex = [3, 8, 15, 22].map((s) => cloudTexture(s));
  const layer = (n: number, seed: number, place: (r: () => number) => [number, number, number, number]) => {
    const g = new THREE.Group();
    const mats = cloudTex.map((t) => new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: true }));
    const r = rng(seed);
    for (let k = 0; k < n; k++) {
      const s = new THREE.Sprite(mats[k % mats.length]);
      const [x, y, z, w] = place(r);
      s.position.set(x, y, z);
      s.scale.set(w, w * 0.58, 1);
      g.add(s);
    }
    scene.add(g);
    return { g, mats };
  };
  const ring = (r: () => number, r0: number, r1: number, y0: number, y1: number, w0: number, w1: number): [number, number, number, number] => {
    const a = r() * Math.PI * 2, d = r0 + r() * (r1 - r0);
    return [Math.cos(a) * d, y0 + r() * (y1 - y0), Math.sin(a) * d, w0 + r() * (w1 - w0)];
  };
  // cloud sprites are big and transparent (fill-rate heavy), so their count follows the tier
  const lowClouds = layer(Math.round(70 * q.clouds), 61, (r) => ring(r, 120, 1600, 34, 82, 90, 220));
  const skyClouds = layer(Math.round(46 * q.clouds), 62, (r) => ring(r, 500, 2600, 260, 520, 260, 560));
  const farClouds = layer(Math.round(40 * q.clouds), 63, (r) => ring(r, 3200, 5200, 160, 420, 900, 1700));

  const birds = buildBirds(new THREE.Vector3(-58, 176, 132));
  scene.add(birds.group);

  /* ---- post: MSAA and ambient occlusion ---- */
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: q.msaa });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = q.ao ? new GTAOPass(scene, camera, 1, 1) : null;
  if (gtao) {
    gtao.blendIntensity = 0.9;
    // Keep clouds, sunbeams and other see-through things out of the occlusion buffers.
    const g = gtao as unknown as { _overrideVisibility: () => void; _visibilityCache: THREE.Object3D[] };
    const base = g._overrideVisibility.bind(gtao);
    g._overrideVisibility = () => {
      base();
      scene.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (o.visible && ((o as THREE.Sprite).isSprite || (mat && mat.transparent && !mat.depthWrite))) {
          o.visible = false;
          g._visibilityCache.push(o);
        }
      });
    };
    composer.addPass(gtao);
    // Its shaders compile in parallel first; until then frames render without it (no multi-second first frame).
    gtao.enabled = false;
    const warm = new THREE.Scene(), quad = new THREE.PlaneGeometry(2, 2);
    const gm = gtao as unknown as Record<string, THREE.Material | undefined>;
    for (const k of ["gtaoMaterial", "pdMaterial", "blendMaterial", "depthRenderMaterial", "copyMaterial", "normalMaterial"]) if (gm[k]) warm.add(new THREE.Mesh(quad, gm[k]));
    if (gm.normalMaterial) warm.add(new THREE.InstancedMesh(quad, gm.normalMaterial, 1));
    renderer.compileAsync(warm, camera).then(() => { gtao.enabled = true; }, () => { gtao.enabled = true; }); // full-screen passes: their own targets
  }
  composer.addPass(new OutputPass());
  // a whisper of film grain, so surfaces read as photographed rather than rendered
  const grain = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAmount: { value: 0.028 } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uAmount; varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() { vec4 c = texture2D(tDiffuse, vUv); c.rgb += (h(vUv * 1733.0 + fract(uTime * 7.0) * 91.0) - 0.5) * uAmount; gl_FragColor = c; }`,
  });
  if (q.grain) composer.addPass(grain);

  /* ---- reflections: glass and water mirror the real city (captured from the tower's position) ---- */
  const cubeRT = new THREE.WebGLCubeRenderTarget(q.cube, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(4, 9000, cubeRT);
  cubeCam.position.set(0, 60, 0);
  let reflectRT: THREE.WebGLRenderTarget | null = null, reflectKey = "";
  const reflective = [...tower.glasses, ...city.reflective];
  function captureReflections(key: string) {
    if (key === reflectKey) return;
    reflectKey = key;
    const tr = performance.now();
    const hide = [tower.lower, tower.upper, floor.group, birds.group];
    const was = hide.map((o) => o.visible);
    hide.forEach((o) => (o.visible = false));
    renderer.shadowMap.autoUpdate = false; // six cube faces reuse this frame's shadow map instead of redrawing it six times
    cubeCam.update(renderer, scene);
    renderer.shadowMap.autoUpdate = true;
    hide.forEach((o, i) => (o.visible = was[i]));
    reflectRT?.dispose();
    reflectRT = pmrem.fromCubemap(cubeRT.texture);
    for (const m of reflective) { m.envMap = reflectRT.texture; m.needsUpdate = true; }
    mark(`reflect:${key}@`, tr); mark(`reflect:${key}:ms`, performance.now() - tr);
  }

  let sizeKey = "";
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const key = `${w}x${h}@${dpr}`;
    if (key === sizeKey) return; // mobile address-bar show/hide fires resize without changing our (svh) stage
    sizeKey = key;
    renderer.setPixelRatio(dpr);
    composer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  /* ---- calibration: the Sky shader is HDR, so exposure sits well below 1 ---- */
  const tune = { exp: 0.42, env: 0.65, sun: 3.8, hemi: 0.25, mist: 2.7, cloud: 2.6 };
  // ?debug exposes timing hooks (also in production) so performance can be checked on any device
  const debug = process.env.NODE_ENV !== "production" || new URLSearchParams(location.search).has("debug");

  /* ---- per-frame state ---- */
  const P = new THREE.Vector3(), Q = new THREE.Vector3(), up = new THREE.Vector3(), proj = new THREE.Vector3();
  const sunDir = new THREE.Vector3();
  const fogDay = new THREE.Color(0xd3dde8), fogGold = new THREE.Color(0xe7c6a4), fogC = new THREE.Color();
  const sunWarm = new THREE.Color(0xff9a52), sunDay = new THREE.Color(0xfff4e6), sunC = new THREE.Color();
  const cloudDay = new THREE.Color(1, 1, 1), cloudGold = new THREE.Color(1, 0.78, 0.66), cloudC = new THREE.Color();
  const mistBase = new THREE.Color(0.93, 0.95, 0.98);
  let target = 0, current = 0, aoR = -1, shadowR = -1;
  let frameId = 0, alive = true, last = performance.now();
  if (debug) {
    (window as unknown as Record<string, unknown>).__gh = {
      renderer, scene, sun, hemi, gtao, tune, MIST, q,
      marks,
      get programs() { return (renderer.info.programs ?? []).length; },
      buildMs: { tower: Math.round(tB - tA), floor: Math.round(tC - tB), city: Math.round(tD - tC), total: Math.round(performance.now() - t0) },
      setTick: (t: number) => { target = current = t; },
      // synchronous render timing: immune to background-tab rAF throttling
      bench: (n = 20) => {
        const t0 = performance.now();
        for (let i = 0; i < n; i++) { renderer.info.reset(); update(current, 0, 0); composer.render(); }
        renderer.getContext().finish();
        const i = renderer.info;
        return { tier: q.tier, ms: +((performance.now() - t0) / n).toFixed(2), calls: i.render.calls, tris: i.render.triangles, geo: i.memory.geometries, tex: i.memory.textures, dpr: renderer.getPixelRatio(), w: canvas.width, h: canvas.height };
      },
    };
  }

  function setSun(elevDeg: number, azDeg: number) {
    const phi = THREE.MathUtils.degToRad(90 - elevDeg), theta = THREE.MathUtils.degToRad(azDeg);
    sunDir.setFromSphericalCoords(1, phi, theta);
    sky.material.uniforms.sunPosition.value.copy(sunDir);
    envSky.material.uniforms.sunPosition.value.copy(sunDir);
    const key = `${elevDeg.toFixed(1)}|${azDeg.toFixed(0)}`;
    if (key !== envKey) {
      envKey = key;
      const te = performance.now();
      envRT?.dispose();
      envRT = pmrem.fromScene(envScene, 0, 1, 60000);
      scene.environment = envRT.texture;
      marks.envMs = (marks.envMs ?? 0) + Math.round(performance.now() - te);
      marks.envRebuilds = (marks.envRebuilds ?? 0) + 1;
    }
  }

  function update(tick: number, time: number, dt: number) {
    const fov = cameraAt(tick, P, Q);
    camera.position.copy(P);
    // Looking straight down needs a different "up".
    const down = THREE.MathUtils.clamp((P.y - Q.y) / (P.distanceTo(Q) + 1e-6) - 0.85, 0, 0.15) / 0.15;
    up.set(0, 1 - down, -down).normalize();
    camera.up.copy(up);
    camera.lookAt(Q);
    // portrait screens: widen the view so rooms and buildings keep their width, not just their height
    camera.fov = camera.aspect < 1
      ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov / 2)) * Math.min(1.9, 1 / camera.aspect) ** 0.85))
      : fov;
    const dist = P.distanceTo(Q);
    camera.near = THREE.MathUtils.clamp(dist * 0.01, 0.05, 2);
    camera.updateProjectionMatrix();

    // light and time of day
    const elev = pw(LIGHT.sunElev, tick), gold = pw(LIGHT.golden, tick);
    const [se, sa] = q.envStep; // coarse steps: the sky light is rebuilt only when these change (coarser on weaker devices)
    setSun(Math.round(elev / se) * se, Math.round(pw(LIGHT.sunAzim, tick) / sa) * sa);
    const warm = THREE.MathUtils.clamp(1 - (elev - 4) / 24, 0, 1);
    sunC.copy(sunDay).lerp(sunWarm, warm);
    sun.color.copy(sunC);
    sun.intensity = THREE.MathUtils.clamp(elev / 3, 0, 1) * tune.sun * (1 + gold * 0.35); // low sun stays strong, just warmer
    hemi.intensity = tune.hemi;
    renderer.toneMappingExposure = pw(LIGHT.exposure, tick) * tune.exp;
    fogC.copy(fogDay).lerp(fogGold, gold);
    (scene.fog as THREE.Fog).color.copy(fogC);
    scene.environmentIntensity = tune.env * pw(LIGHT.ambient, tick);

    // shadows follow what we're looking at, tight indoors, wide outdoors
    const R = THREE.MathUtils.clamp(dist * 0.7, 9, 360);
    if (Math.abs(R - shadowR) > R * 0.08) {
      shadowR = R;
      const c = sun.shadow.camera;
      c.left = c.bottom = -R; c.right = c.top = R; c.near = 1; c.far = R * 2 + 1200;
      c.updateProjectionMatrix();
    }
    sun.target.position.copy(Q);
    sun.position.copy(Q).addScaledVector(sunDir, R + 600);

    // morning mist hugging the streets
    MIST.uMistDensity.value = pw(LIGHT.mist, tick);
    MIST.uMistColor.value.copy(mistBase).lerp(sunC, 0.25).multiplyScalar(tune.mist);

    // clouds and birds
    // phones capture the city reflection once; larger screens re-capture for morning, day and sunset
    // until the first capture (a moment after the world appears), glass reflects the sky alone
    if (started && performance.now() > reflectAfter) captureReflections(q.tier === "low" ? "once" : gold > 0.5 ? "gold" : tick > 20 ? "day" : "morning");
    if (q.grain) grain.uniforms.uTime.value = time;

    cloudC.copy(cloudDay).lerp(sunC, 0.25).lerp(cloudGold, gold).multiplyScalar(tune.cloud); // sprites are unlit: match the HDR sky
    const low = pw(LIGHT.lowClouds, tick), high = pw(LIGHT.skyClouds, tick);
    lowClouds.g.visible = low > 0.01;
    skyClouds.g.visible = high > 0.01;
    for (const m of lowClouds.mats) { m.opacity = low * 0.92; m.color.copy(cloudC); }
    for (const m of skyClouds.mats) { m.opacity = high * 0.95; m.color.copy(cloudC); }
    for (const m of farClouds.mats) { m.opacity = 0.9; m.color.copy(cloudC); }
    birds.group.visible = pw(LIGHT.birds, tick) > 0.01;
    birds.update(time);
    city.updateCars(dt);
    city.updateTrees(time);

    // the floors above lift away to reveal the plan, then return
    const lift = pw(LIGHT.lift, tick), upOp = pw(LIGHT.upper, tick);
    tower.upper.position.y = lift * 46;
    tower.upper.visible = upOp > 0.01;
    for (const { m, base } of tower.upperMats) {
      m.opacity = base * upOp;
      m.depthWrite = upOp > 0.98 && base >= 1;
    }
    floor.ceilingBits.visible = upOp > 0.5;
    // the flat is only drawn while the camera is close enough to see into it
    floor.group.visible = tick > 36 && tick < 89;
    floor.update(time, pw(LIGHT.beams, tick) * THREE.MathUtils.clamp(elev / 10, 0, 1));

    // ambient occlusion radius: centimetres of furniture indoors, metres of street outdoors
    if (gtao) {
      const ao = pw(LIGHT.ao, tick);
      if (Math.abs(ao - aoR) > 0.05) { aoR = ao; gtao.updateGtaoMaterial({ radius: ao, distanceExponent: 1.4, thickness: ao * 0.8, scale: 1 }); }
    }

    // labels in the neighbourhood shot
    const pinA = pw(LIGHT.pins, tick);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const p of opts.pins) {
      if (pinA < 0.01) { p.el.style.opacity = "0"; continue; }
      proj.copy(p.at).project(camera);
      p.el.style.opacity = String(pinA);
      p.el.style.transform = `translate(${((proj.x + 1) / 2) * w}px, ${((1 - proj.y) / 2) * h}px)`;
    }
  }

  /* ---- adaptive resolution: hold ~45-60 fps by trading pixels, never detail ---- */
  let frameMs = 16.7, adaptAt = performance.now() + 2500, climbAfter = 0; // skip start-up (shader compiles)
  function adapt(now: number, ms: number) {
    if (ms < 100) frameMs += (ms - frameMs) * 0.05; // ignore tab switches and throttled frames
    if (now < adaptAt) return;
    adaptAt = now + 1200;
    if (frameMs > 24 && dpr > q.dprMin) {
      dpr = +Math.max(q.dprMin, dpr - 0.15).toFixed(2);
      climbAfter = now + 8000; // after a drop, wait before trying sharper again (no flicker between sizes)
      resize();
    } else if (frameMs < 18.5 && dpr < dprTop && now > climbAfter) {
      dpr = +Math.min(dprTop, dpr + 0.1).toFixed(2); // holding 60 fps: win back sharpness step by step
      resize();
    }
  }

  const hud = debug ? document.body.appendChild(Object.assign(document.createElement("div"), { className: "perf-hud" })) : null;
  let hudAt = 0;

  const reducedStops = [0, 13, 31, 59, 76, 91, 109];
  let onScreen = true;
  function frame(now: number) {
    if (!alive) return;
    if (!onScreen) { frameId = 0; return; } // tour scrolled away: stop drawing until it comes back
    const ms = now - last;
    const dt = Math.min(0.1, ms / 1000);
    last = now;
    if (opts.reduced) current = reducedStops.reduce((a, s) => (target >= s - 4 ? s : a), 0);
    else current += (target - current) * (1 - Math.exp(-dt * 5)); // time-based easing: same feel at any frame rate
    const tf = performance.now();
    update(current, now / 1000, opts.reduced ? 0 : dt);
    renderer.info.reset();
    composer.render();
    if (!marks.firstFrameMs) { mark("firstFrame@", tf); mark("firstFrameMs", performance.now() - tf); }
    adapt(now, ms);
    if (hud && now > hudAt) {
      hudAt = now + 500;
      hud.textContent = `${q.tier} | ${Math.round(1000 / frameMs)} fps | ${frameMs.toFixed(1)} ms | dpr ${dpr} | ${canvas.width}x${canvas.height} | ${renderer.info.render.calls} calls`;
    }
    frameId = requestAnimationFrame(frame);
  }
  // Compile every shader before the first frame, in parallel where the browser supports it
  // (KHR_parallel_shader_compile). Without this the first frame blocks the main thread for seconds.
  let started = false, reflectAfter = Infinity;
  const start = () => {
    if (started || !alive) return;
    started = true;
    reflectAfter = performance.now() + 1500;
    last = performance.now();
    frameId = requestAnimationFrame(frame);
    opts.onReady?.();
  };
  // Shader variants depend on the render target (screen = tone-mapped sRGB, composer buffer = linear HDR).
  // Every frame draws into the composer's buffer, so compile against that, or each shader compiles twice.
  const compileFor = (o: THREE.Object3D) => {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(composer.readBuffer);
    const done = renderer.compileAsync(o, camera, scene);
    renderer.setRenderTarget(prev);
    return done;
  };
  // A separate task from the build above, so input stays responsive while the sky light and shaders warm up.
  setTimeout(() => {
    if (!alive) return;
    update(0, 0, 0);
    mark("compile@");
    compileFor(scene).then(() => { mark("compileDone@"); start(); }, start);
  }, 0);
  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    if (onScreen && started && !frameId && alive) { last = performance.now(); frameId = requestAnimationFrame(frame); }
  });
  io.observe(canvas);

  // Furniture and plaza props (15-25 MB) are fetched once the visitor starts the tour, not on arrival.
  let furnished = false;
  function furnish() {
    if (furnished) return;
    furnished = true;
    // downloaded models are compiled before they join the scene, so they appear without a hitch
    mark("furnish@");
    const compile = (o: THREE.Object3D) => compileFor(o).catch(() => undefined);
    if (q.furniture) floor.furnish(compile).catch(() => undefined);
    if (q.plazaProps) city.furnish(compile).catch(() => undefined);
  }
  // larger screens also start after a quiet moment; phones wait for the first scroll to save data
  const furnishTimer = q.tier === "low" ? 0 : window.setTimeout(furnish, 10000);

  return {
    setTick(t: number) { target = t; if (t > 5) furnish(); },
    resize,
    dispose() {
      alive = false;
      clearTimeout(furnishTimer);
      io.disconnect();
      hud?.remove();
      cancelAnimationFrame(frameId);
      envRT?.dispose();
      reflectRT?.dispose();
      cubeRT.dispose();
      pmrem.dispose();
      composer.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
      });
    },
  };
}

export type World = ReturnType<typeof createWorld>;
