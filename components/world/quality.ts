/*
 * One quality tier per device class, chosen once at start-up. Adaptive resolution (World.ts) fine-tunes from there.
 * Override with ?quality=low|mid|high to test a tier on any machine.
 */

export type Tier = "low" | "mid" | "high";

type Settings = {
  dprMax: number; dprMin: number; // render resolution range (adaptive resolution moves between them)
  msaa: number; ao: boolean; shadow: number; shadowRadius: number; grain: boolean;
  cube: number; // size of the city-reflection capture
  clouds: number; leafCards: number; treeReach: number; // scene density
  exteriorDetail: boolean; // normal/roughness maps on streets and facades
  plazaProps: boolean; furniture: boolean; // downloaded models
  envStep: [number, number]; // degrees of sun movement before the sky light is rebuilt (elevation, azimuth)
};

const TIERS: Record<Tier, Settings> = {
  // phones: smaller render, no ambient occlusion, half the clouds, fewer leaves, colour-only textures outside
  low: { dprMax: 1.5, dprMin: 0.7, msaa: 2, ao: false, shadow: 1024, shadowRadius: 1.5, grain: false, cube: 64, clouds: 0.45, leafCards: 22, treeReach: 380, exteriorDetail: false, plazaProps: false, furniture: true, envStep: [3, 10] },
  // tablets and modest laptops
  mid: { dprMax: 1.5, dprMin: 0.8, msaa: 2, ao: false, shadow: 2048, shadowRadius: 2, grain: true, cube: 128, clouds: 0.75, leafCards: 32, treeReach: 520, exteriorDetail: true, plazaProps: false, furniture: true, envStep: [2, 6] },
  // desktops with a mouse
  high: { dprMax: 1.6, dprMin: 0.9, msaa: 4, ao: true, shadow: 4096, shadowRadius: 2.5, grain: true, cube: 256, clouds: 1, leafCards: 46, treeReach: 600, exteriorDetail: true, plazaProps: true, furniture: true, envStep: [1.5, 4] },
};

export type Quality = Settings & { tier: Tier; saveData: boolean };

export function pickQuality(): Quality {
  const forced = new URLSearchParams(location.search).get("quality");
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const saveData = nav.connection?.saveData === true;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const minSide = Math.min(screen.width, screen.height);
  const weak = (nav.deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency ?? 8) <= 4;
  const tier: Tier = forced && forced in TIERS
    ? (forced as Tier)
    : saveData || (coarse && minSide < 600) ? "low" : coarse || weak ? "mid" : "high";
  // Data Saver: keep the procedural furniture rather than downloading ~15 MB of models.
  return { ...TIERS[tier], tier, saveData, furniture: TIERS[tier].furniture && !saveData, plazaProps: TIERS[tier].plazaProps && !saveData };
}
