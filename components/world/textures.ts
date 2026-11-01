import * as THREE from "three";
import { rng } from "@/lib/geo";

// Procedural textures drawn on canvas: no downloads, deterministic, small.

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function tex(c: HTMLCanvasElement, srgb = true, repeat?: [number, number]) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Soft grayscale value noise, used for concrete and ground variation. */
export function noiseTexture(size = 256, seed = 1, cells = 16) {
  const [c, g] = canvas(size, size);
  const r = rng(seed);
  const img = g.createImageData(size, size);
  const grid = Array.from({ length: (cells + 1) * (cells + 1) }, () => r());
  const at = (x: number, y: number) => grid[(y % cells) * (cells + 1) + (x % cells)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, fy = (y / size) * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const v = at(x0, y0) * (1 - sx) * (1 - sy) + at(x0 + 1, y0) * sx * (1 - sy) + at(x0, y0 + 1) * (1 - sx) * sy + at(x0 + 1, y0 + 1) * sx * sy;
      const n = 200 + (v - 0.5) * 70 + (r() - 0.5) * 14;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, false, [1, 1]);
}

/** Oak planks with grain. */
export function woodTexture() {
  const [c, g] = canvas(1024, 1024);
  const r = rng(7);
  const rows = 8;
  const h = 1024 / rows;
  for (let row = 0; row < rows; row++) {
    let x = -r() * 400;
    while (x < 1024) {
      const len = 300 + r() * 380;
      const tone = 168 + r() * 26;
      g.fillStyle = `rgb(${tone + 22},${tone - 4},${tone - 40})`;
      g.fillRect(x, row * h, len, h);
      for (let k = 0; k < 26; k++) {
        const yy = row * h + r() * h;
        g.strokeStyle = `rgba(${90 + r() * 40},${60 + r() * 30},${30},${0.06 + r() * 0.1})`;
        g.lineWidth = 0.6 + r() * 1.6;
        g.beginPath();
        g.moveTo(x, yy);
        g.bezierCurveTo(x + len * 0.3, yy + (r() - 0.5) * 8, x + len * 0.7, yy + (r() - 0.5) * 8, x + len, yy + (r() - 0.5) * 6);
        g.stroke();
      }
      g.fillStyle = "rgba(70,45,25,0.35)";
      g.fillRect(x, row * h, 2, h);
      x += len;
    }
    g.fillStyle = "rgba(70,45,25,0.3)";
    g.fillRect(0, row * h, 1024, 2);
  }
  return tex(c, true, [1, 1]);
}

/** White marble with soft grey veins. */
export function marbleTexture() {
  const [c, g] = canvas(512, 512);
  const r = rng(13);
  g.fillStyle = "#f1f0ee";
  g.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 18; k++) {
    g.strokeStyle = `rgba(120,120,128,${0.08 + r() * 0.18})`;
    g.lineWidth = 0.5 + r() * 2.2;
    g.beginPath();
    let x = r() * 512, y = r() * 512;
    g.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (r() - 0.3) * 160; y += (r() - 0.5) * 120;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return tex(c);
}

/** Woven rug: warm grey with a fine weave and a border. */
export function rugTexture() {
  const [c, g] = canvas(512, 512);
  const r = rng(17);
  g.fillStyle = "#cfc9c0";
  g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 3) {
    g.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},0.035)`;
    g.fillRect(0, y, 512, 1.5);
  }
  g.strokeStyle = "rgba(60,60,70,0.25)";
  g.lineWidth = 10;
  g.strokeRect(26, 26, 460, 460);
  return tex(c);
}

/** Bathroom tiles. */
export function tileTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = "#dfe1e3";
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "rgba(150,155,160,0.6)";
  g.lineWidth = 3;
  for (let i = 0; i <= 512; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
  }
  return tex(c, true, [4, 4]);
}

/** A framed print of the Gharaana contour towers. */
export function printTexture() {
  const [c, g] = canvas(512, 340);
  g.fillStyle = "#f4f4f2";
  g.fillRect(0, 0, 512, 340);
  g.lineWidth = 7;
  g.lineCap = "round";
  for (let i = 0; i < 12; i++) {
    const y = 270 - i * 17;
    g.strokeStyle = i < 2 ? "#ffda1a" : "#1560bd";
    g.beginPath();
    g.moveTo(110, y);
    g.bezierCurveTo(190, y - 24 - (i % 3) * 6, 290, y + 18, 400, y - 10);
    g.stroke();
  }
  return tex(c);
}

/** One leaf with alpha, for the plants. */
export function leafTexture() {
  const [c, g] = canvas(128, 256);
  g.translate(64, 250);
  const grad = g.createLinearGradient(0, 0, 0, -240);
  grad.addColorStop(0, "#3f5e2e");
  grad.addColorStop(1, "#6f9150");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(58, -60, 52, -200, 0, -244);
  g.bezierCurveTo(-52, -200, -58, -60, 0, 0);
  g.fill();
  g.strokeStyle = "rgba(220,235,200,0.5)";
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -236); g.stroke();
  return tex(c);
}

/** A cumulus cloud with a lit top, a cool shaded base and a flat bottom (alpha). */
export function cloudTexture(seed = 3) {
  const W = 512, H = 300;
  const [c, g] = canvas(W, H);
  const r = rng(seed);
  const base = 238;
  // silhouette: a dome of overlapping puffs, bigger in the middle
  g.save();
  g.beginPath(); g.rect(0, 0, W, base); g.clip();
  for (let k = 0; k < 46; k++) {
    const t = r();
    const x = 70 + t * (W - 140);
    const mid = 1 - Math.abs(t - 0.5) * 1.7;
    const rad = 26 + mid * 62 + r() * 26;
    const y = base - rad * (0.45 + r() * 0.5) - mid * 48;
    const grad = g.createRadialGradient(x, y, rad * 0.55, x, y, rad);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  // shading: sunlit crown, cool belly
  g.globalCompositeOperation = "source-atop";
  const sh = g.createLinearGradient(0, 40, 0, base);
  sh.addColorStop(0, "#ffffff");
  sh.addColorStop(0.45, "#f3f5f9");
  sh.addColorStop(0.8, "#c9d3e1");
  sh.addColorStop(1, "#a9b7ca");
  g.fillStyle = sh;
  g.fillRect(0, 0, W, H);
  const blob = (x: number, y: number, rad: number, col: string) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, col);
    grad.addColorStop(1, col.replace(/[\d.]+\)$/, "0)"));
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  };
  for (let k = 0; k < 14; k++) blob(90 + r() * (W - 180), base - 20 - r() * 70, 30 + r() * 50, "rgba(150,166,188,0.35)");
  for (let k = 0; k < 10; k++) blob(100 + r() * (W - 200), 70 + r() * 70, 26 + r() * 40, "rgba(255,255,255,0.55)");
  g.globalCompositeOperation = "source-over";
  return tex(c);
}

/** Facade glass: mullions and transoms over a cool tint (multiplied with the glass colour). */
export function mullionTexture() {
  const [c, g] = canvas(64, 128);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = "#3a4048";
  g.fillRect(0, 0, 3, 128);
  g.fillRect(0, 118, 64, 10);
  return tex(c, true, [1, 1]);
}
