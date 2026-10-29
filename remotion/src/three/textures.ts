import * as THREE from 'three';
import {L, R, bodyRadius} from './airliner';

// Procedural textures drawn on canvas, so every 3D shot is 100% original artwork.

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

export type Livery = {accent: string; navy: string; title?: string; font?: string};

/**
 * Fuselage livery. Texture x = angle around the body (0 = right side, 0.25 = top, 0.5 = left, 0.75 = belly),
 * texture y = distance behind the nose (flipY off, row 0 = nose). Isotropic: ~244 px per unit both ways.
 */
export function liveryTexture(lv: Livery): THREE.Texture {
  const key = `livery-${lv.accent}-${lv.navy}-${lv.title ?? ''}`;
  if (cache.has(key)) return cache.get(key)!;
  const W = 1536;
  const H = 4544;
  const px = H / L;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  const vy = (s: number) => s * px;
  const aOf = (units: number, s: number) => (units / Math.max(0.2, bodyRadius(s))) * (180 / Math.PI);
  const xr = (aLo: number, aHi: number, side: 1 | -1) => {
    const u = side > 0 ? aLo / 360 : 0.5 - aHi / 360;
    const x = (((u % 1) + 1) % 1) * W;
    return {x, w: ((aHi - aLo) / 360) * W};
  };
  // draw a rectangle in (angle, station) space, wrapping across the texture seam
  const box = (aLo: number, aHi: number, s0: number, s1: number, side: 1 | -1, draw: (x: number, y: number, w: number, h: number) => void) => {
    const {x, w} = xr(aLo, aHi, side);
    const y = vy(s0);
    const h = vy(s1) - y;
    draw(x, y, w, h);
    if (x + w > W) draw(x - W, y, w, h);
  };

  // base paint: white, with a soft light-grey belly
  g.fillStyle = '#F7F8FA';
  g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x++) {
    let a = (x / W) * 360; // 0 right side, 90 top, 180 left, 270 belly
    if (a >= 180) a -= 360; // (-180, 180]
    const below = a <= 0 ? (a >= -90 ? -a : 180 + a) : a >= 90 ? a - 180 : -a; // degrees below the side line
    if (below > 0) {
      const k = Math.min(1, Math.max(0, (below - 26) / 18));
      if (k > 0) {
        g.fillStyle = `rgba(206,213,224,${0.95 * k})`;
        g.fillRect(x, 0, 1, H);
      }
    }
  }

  // subtle panel joints
  g.fillStyle = 'rgba(96,112,134,0.16)';
  for (const s of [2.42, 4.95, 6.55, 9.95, 12.35, 14.95, 16.4]) g.fillRect(0, vy(s), W, 2);
  g.fillStyle = 'rgba(96,112,134,0.09)';
  for (const side of [1, -1] as const) for (const a of [44, 74, -40]) box(a, a + 0.18, 2.4, 16.8, side, (x, y, w, h) => g.fillRect(x, y, Math.max(2, w), h));

  // cheatline: orange band + navy pinstripe, rising into the tail cone
  const s0 = 2.25;
  const s1 = 16.6;
  for (const side of [1, -1] as const) {
    for (let s = s0; s < s1; s += 0.04) {
      const rise = s > 12 ? (s - 12) * 2.4 : 0;
      const taper = Math.min(1, (s - s0) / 0.7);
      const aC = -9 + rise;
      const hw = aOf(0.09 * taper, s);
      g.fillStyle = lv.accent;
      box(aC - hw, aC + hw, s, s + 0.045, side, (x, y, w, h) => g.fillRect(x, y, w, h));
      const pw = aOf(0.02 * taper, s);
      const pc = aC - hw - aOf(0.045, s);
      g.fillStyle = lv.navy;
      box(pc - pw, pc + pw, s, s + 0.045, side, (x, y, w, h) => g.fillRect(x, y, w, h));
    }
  }

  // passenger windows
  const winA = 11;
  for (const side of [1, -1] as const) {
    for (let s = 3.45; s < 14.2; s += 0.265) {
      if (Math.abs(s - 8.05) < 0.2) continue;
      const a = winA + (s > 12 ? (s - 12) * 1.2 : 0);
      const hh = aOf(0.085, s);
      const ww = 0.118;
      box(a - hh, a + hh, s - ww / 2, s + ww / 2, side, (x, y, w, h) => {
        g.fillStyle = '#1B2A3F';
        roundRect(g, x, y, w, h, h * 0.45);
        g.fill();
        g.fillStyle = 'rgba(150,182,222,0.32)';
        roundRect(g, x + w * (side > 0 ? 0.52 : 0.08), y + 3, w * 0.4, h - 6, h * 0.3);
        g.fill();
      });
    }
  }
  const door = (s: number, side: 1 | -1, wU: number, hU: number, aC: number) => {
    const ha = aOf(hU / 2, s);
    box(aC - ha, aC + ha, s - wU / 2, s + wU / 2, side, (x, y, w, h) => {
      g.strokeStyle = 'rgba(40,56,80,0.45)';
      g.lineWidth = 4;
      roundRect(g, x, y, w, h, 18);
      g.stroke();
    });
    const wa = aOf(0.085, s);
    box(winA - wa, winA + wa, s - 0.05, s + 0.05, side, (x, y, w, h) => {
      g.fillStyle = '#1B2A3F';
      roundRect(g, x, y, w, h, 10);
      g.fill();
    });
  };
  for (const side of [1, -1] as const) {
    door(2.95, side, 0.42, 0.95, 3);
    door(14.55, side, 0.42, 0.95, 4);
    door(8.05, side, 0.26, 0.5, 9);
  }

  // cockpit windows
  const poly = (side: 1 | -1, pts: [number, number][], fill: string) => {
    g.beginPath();
    pts.forEach(([s, a], i) => {
      const u = side > 0 ? a / 360 : 0.5 - a / 360;
      const x = (((u % 1) + 1) % 1) * W;
      const y = vy(s);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  const glass = '#15233A';
  for (const side of [1, -1] as const) {
    poly(side, [[1.0, 38], [1.36, 24], [1.44, 50], [1.08, 76]], glass);
    poly(side, [[1.47, 22.5], [1.88, 19.5], [1.9, 40], [1.5, 47]], glass);
    poly(side, [[1.93, 19.3], [2.2, 18.5], [2.14, 33], [1.95, 37.5]], glass);
  }
  poly(1, [[1.04, 80], [1.1, 80], [1.1, 100], [1.04, 100]], '#F7F8FA');

  // title on both sides, above the windows
  if (lv.title) {
    const title = lv.title.toUpperCase();
    const fontPx = (0.36 * px) / 0.7;
    g.font = `700 ${fontPx}px ${lv.font ?? '"Inter Variable", Inter, sans-serif'}`;
    const tw = g.measureText(title).width;
    const sC = 7.2;
    const aC = 29;
    for (const side of [1, -1] as const) {
      const u = side > 0 ? aC / 360 : 0.5 - aC / 360;
      const x = u * W;
      const y = vy(sC);
      g.save();
      if (side > 0) g.setTransform(0, -1, -1, 0, x, y);
      else g.setTransform(0, 1, 1, 0, x, y);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = lv.navy;
      g.fillText(title, 0, 0);
      g.fillStyle = lv.accent;
      g.fillRect(-tw / 2, fontPx * 0.5, tw * 0.22, fontPx * 0.09);
      g.restore();
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

/** Wing skin: u = chord position (0 TE upper → 0.5 LE → 1 TE lower), v = span (0 root → 1 tip). */
export function wingTexture(): THREE.Texture {
  const key = 'wing';
  if (cache.has(key)) return cache.get(key)!;
  const W = 1024;
  const H = 2048;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  const r = rng(17);
  g.fillStyle = '#C6CDD7';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 140; i++) {
    const v = r();
    g.fillStyle = `rgba(${v > 0.5 ? '255,255,255' : '80,92,110'},${0.015 + r() * 0.02})`;
    g.fillRect(r() * W, r() * H, 40 + r() * 160, 30 + r() * 220);
  }
  const ux = (xc: number, upper: boolean) => (upper ? 0.5 * (1 - xc) : 0.5 + 0.5 * xc) * W;
  const vyy = (v: number) => (1 - v) * H;
  const line = (x0: number, y0: number, x1: number, y1: number, a = 0.35, w = 2) => {
    g.strokeStyle = `rgba(70,82,100,${a})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  };
  for (const upper of [true, false]) {
    for (const [xc, a] of [
      [0.13, 0.4],
      [0.16, 0.14],
      [0.62, 0.14],
      [0.74, 0.4],
    ] as [number, number][])
      line(ux(xc, upper), vyy(0), ux(xc, upper), vyy(1), a, 2.5);
    for (const v of [0.08, 0.23, 0.38, 0.52, 0.66, 0.8, 0.93]) line(ux(0, upper), vyy(v), ux(0.13, upper), vyy(v), 0.35);
    for (const v of [0.3, 0.6, 0.73, 0.95]) line(ux(0.74, upper), vyy(v), ux(1, upper), vyy(v), 0.4);
    if (upper) {
      for (let i = 0; i <= 5; i++) line(ux(0.62, true), vyy(0.12 + i * 0.1), ux(0.74, true), vyy(0.12 + i * 0.1), 0.3);
      g.strokeStyle = 'rgba(60,70,85,0.22)';
      g.lineWidth = 3;
      g.strokeRect(ux(0.55, true), vyy(0.14), ux(0.25, true) - ux(0.55, true), vyy(0.02) - vyy(0.14));
    }
  }
  const le = g.createLinearGradient(ux(0.06, true), 0, ux(0.06, false), 0);
  le.addColorStop(0, 'rgba(255,255,255,0)');
  le.addColorStop(0.5, 'rgba(240,244,248,0.55)');
  le.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = le;
  g.fillRect(ux(0.06, true), 0, ux(0.06, false) - ux(0.06, true), H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

/** Tail fin artwork (planar UVs: u front → back, v bottom → top). */
export function tailTexture(lv: Livery): THREE.Texture {
  const key = `tail-${lv.accent}-${lv.navy}`;
  if (cache.has(key)) return cache.get(key)!;
  const S = 1024;
  const c = canvas(S, S);
  const g = c.getContext('2d')!;
  g.fillStyle = lv.navy;
  g.fillRect(0, 0, S, S);
  g.fillStyle = lv.accent;
  g.beginPath();
  g.moveTo(0, S * 0.9);
  g.bezierCurveTo(S * 0.35, S * 0.82, S * 0.7, S * 0.5, S * 1.0, S * 0.12);
  g.lineTo(S * 1.0, S * 0.36);
  g.bezierCurveTo(S * 0.72, S * 0.66, S * 0.42, S * 0.95, S * 0.05, S * 1.0);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = S * 0.012;
  g.beginPath();
  g.moveTo(0, S * 0.86);
  g.bezierCurveTo(S * 0.35, S * 0.78, S * 0.68, S * 0.46, S * 1.0, S * 0.07);
  g.stroke();
  // emblem: three white chevrons (a stylised climbing wing)
  g.fillStyle = '#FFFFFF';
  const cx = S * 0.72;
  const cy = S * 0.3;
  for (let i = 0; i < 3; i++) {
    const w = S * (0.2 - i * 0.04);
    const y = cy + i * S * 0.065;
    g.beginPath();
    g.moveTo(cx - w * 0.5, y + S * 0.03);
    g.lineTo(cx + w * 0.5, y - S * 0.03);
    g.lineTo(cx + w * 0.5 - S * 0.03, y + S * 0.005);
    g.lineTo(cx - w * 0.5 - S * 0.02, y + S * 0.06);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

/** Spinner with the classic white spiral (makes the engine rotation readable). */
export function spinnerTexture(): THREE.Texture {
  const key = 'spinner';
  if (cache.has(key)) return cache.get(key)!;
  const c = canvas(256, 256);
  const g = c.getContext('2d')!;
  g.fillStyle = '#3B4452';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#F4F6F8';
  g.lineWidth = 22;
  g.beginPath();
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    const x = (t * 256 * 0.9) % 256;
    const y = t * 256;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  cache.set(key, t);
  return t;
}

/** Radial glow for lights and the sun. */
export function glowTexture(): THREE.Texture {
  const key = 'glow';
  if (cache.has(key)) return cache.get(key)!;
  const c = canvas(256, 256);
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.12, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.22)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

// hash-based 2D value noise + fbm (deterministic, no tables)
function hash2(ix: number, iy: number, seed: number) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, seed: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
export function fbm(x: number, y: number, seed: number, oct = 5) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  let tot = 0;
  for (let o = 0; o < oct; o++) {
    v += amp * vnoise(x * f, y * f, seed + o * 17);
    tot += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return v / tot;
}

/** Billboard cumulus: noise-shaped towers with self-shadowing toward the sun (upper left). */
export function cumulusTexture(seed = 1): THREE.Texture {
  const key = `cumulus-${seed}`;
  if (cache.has(key)) return cache.get(key)!;
  const W = 512;
  const H = 320;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const r = rng(seed * 7919 + 13);
  const base = 0.8;
  const towers = Array.from({length: 2 + Math.floor(r() * 3)}, () => ({c: 0.25 + r() * 0.5, w: 0.12 + r() * 0.16, h: 0.3 + r() * 0.42}));
  const dens = (u: number, v: number) => {
    if (v > base + 0.02) return 0;
    let env = 0;
    for (const t of towers) {
      const du = (u - t.c) / t.w;
      const dv = (base - v) / t.h;
      env = Math.max(env, 1 - du * du - dv * dv * 0.9);
    }
    const skirt = Math.pow(Math.max(0, 1 - Math.abs(u - 0.5) / 0.42), 1.6) * Math.max(0, 1 - (base - v) / 0.1);
    env = Math.max(env, skirt * 0.32);
    const n = fbm(u * 7.5, v * 7.5, seed * 13 + 3);
    return env * 1.25 + (n - 0.5) * 1.1;
  };
  const Lu = -0.55;
  const Lv = -0.83;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      const d = dens(u, v);
      const edgeFade = Math.min(1, Math.max(0, (base + 0.02 - v) / 0.035));
      const a = Math.min(1, Math.max(0, (d - 0.32) / 0.14)) * edgeFade;
      const i = (y * W + x) * 4;
      if (a <= 0) {
        img.data[i + 3] = 0;
        continue;
      }
      let acc = 0;
      for (let k = 1; k <= 6; k++) acc += Math.max(0, dens(u + Lu * k * 0.018, v + Lv * k * 0.018) - 0.32);
      const T = Math.exp(-acc * 1.6);
      const ao = Math.min(1, Math.max(0, (base - v) / 0.25));
      const lit = 0.35 + 0.65 * T;
      const k2 = lit * (0.82 + 0.18 * ao);
      img.data[i] = Math.round(150 + (255 - 150) * k2);
      img.data[i + 1] = Math.round(164 + (255 - 164) * k2);
      img.data[i + 2] = Math.round(188 + (255 - 188) * k2);
      img.data[i + 3] = Math.round(255 * a);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/** Tree canopy billboard (deciduous, sunlit from the upper left). */
export function treeTexture(seed = 1): THREE.Texture {
  const key = `tree-${seed}`;
  if (cache.has(key)) return cache.get(key)!;
  const W = 256;
  const H = 256;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  const r = rng(seed * 31 + 5);
  g.fillStyle = '#4A3A2A';
  g.fillRect(W / 2 - 6, H * 0.62, 12, H * 0.38);
  const blobs: [number, number, number][] = [];
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 62;
    blobs.push([W / 2 + Math.cos(a) * d, H * 0.42 + Math.sin(a) * d * 0.8, 26 + r() * 22]);
  }
  g.fillStyle = '#34502A';
  for (const [x, y, rad] of blobs) {
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  g.save();
  g.globalCompositeOperation = 'source-atop';
  for (const [x, y, rad] of blobs) {
    const grd = g.createRadialGradient(x - rad * 0.4, y - rad * 0.4, 2, x, y, rad);
    grd.addColorStop(0, 'rgba(146,176,98,0.95)');
    grd.addColorStop(0.6, 'rgba(92,128,64,0.6)');
    grd.addColorStop(1, 'rgba(52,80,42,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/** Building facade: glass bands with mullions over concrete. */
export function facadeTexture(): THREE.Texture {
  const key = 'facade';
  if (cache.has(key)) return cache.get(key)!;
  const c = canvas(512, 256);
  const g = c.getContext('2d')!;
  g.fillStyle = '#E4E7EB';
  g.fillRect(0, 0, 512, 256);
  const grd = g.createLinearGradient(0, 40, 0, 200);
  grd.addColorStop(0, '#9DB7D2');
  grd.addColorStop(1, '#5E7894');
  g.fillStyle = grd;
  g.fillRect(0, 44, 512, 150);
  g.fillStyle = 'rgba(40,50,64,0.55)';
  for (let x = 0; x < 512; x += 32) g.fillRect(x, 44, 3, 150);
  g.fillRect(0, 118, 512, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set(key, t);
  return t;
}

/** Tileable fractal noise (R and G channels hold two different fields). */
export function noiseTexture(size = 512): THREE.DataTexture {
  const key = `noise-${size}`;
  if (cache.has(key)) return cache.get(key) as THREE.DataTexture;
  const data = new Uint8Array(size * size * 4);
  const field = (seed: number, oct: number, base: number) => {
    const out = new Float32Array(size * size);
    let amp = 1;
    let total = 0;
    for (let o = 0; o < oct; o++) {
      const P = base << o;
      const r = rng(seed * 131 + o * 977);
      const grid = new Float32Array(P * P);
      for (let i = 0; i < P * P; i++) grid[i] = r();
      const cell = size / P;
      for (let y = 0; y < size; y++) {
        const gy = y / cell;
        const y0 = Math.floor(gy);
        const ty = gy - y0;
        const sy = ty * ty * (3 - 2 * ty);
        const ya = y0 % P;
        const yb = (y0 + 1) % P;
        for (let x = 0; x < size; x++) {
          const gx = x / cell;
          const x0 = Math.floor(gx);
          const tx = gx - x0;
          const sx = tx * tx * (3 - 2 * tx);
          const xa = x0 % P;
          const xb = (x0 + 1) % P;
          const a = grid[ya * P + xa];
          const b = grid[ya * P + xb];
          const c2 = grid[yb * P + xa];
          const d = grid[yb * P + xb];
          out[y * size + x] += amp * (a + (b - a) * sx + (c2 - a) * sy + (a - b - c2 + d) * sx * sy);
        }
      }
      total += amp;
      amp *= 0.52;
    }
    for (let i = 0; i < out.length; i++) out[i] /= total;
    return out;
  };
  const f1 = field(1, 6, 4);
  const f2 = field(2, 6, 8);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = Math.round(f1[i] * 255);
    data[i * 4 + 1] = Math.round(f2[i] * 255);
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

/** Repeating runway section: asphalt, edge lines and centreline dashes (one tile = 25 units long). */
export function runwayTexture(): THREE.Texture {
  const key = 'rwy';
  if (cache.has(key)) return cache.get(key)!;
  const W = 512;
  const H = 568;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  const r = rng(7);
  g.fillStyle = '#5A6069';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 14000; i++) {
    const v = 72 + Math.floor(r() * 40);
    g.fillStyle = `rgba(${v},${v + 3},${v + 8},0.45)`;
    g.fillRect(r() * W, r() * H, 2, 2);
  }
  g.fillStyle = 'rgba(30,32,36,0.18)';
  g.fillRect(W * 0.36, 0, W * 0.05, H);
  g.fillRect(W * 0.59, 0, W * 0.05, H);
  g.fillStyle = '#EEF0F2';
  g.fillRect(8, 0, 9, H);
  g.fillRect(W - 17, 0, 9, H);
  g.fillRect(W / 2 - 5, 0, 10, H * 0.6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  cache.set(key, t);
  return t;
}

/** Runway threshold: piano keys + designator (one tile, 22.5 × 45 units). */
export function thresholdTexture(designator = '09'): THREE.Texture {
  const key = `thr-${designator}`;
  if (cache.has(key)) return cache.get(key)!;
  const W = 512;
  const H = 1024;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  const r = rng(9);
  g.fillStyle = '#5A6069';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 26000; i++) {
    const v = 72 + Math.floor(r() * 40);
    g.fillStyle = `rgba(${v},${v + 3},${v + 8},0.45)`;
    g.fillRect(r() * W, r() * H, 2, 2);
  }
  g.fillStyle = '#EEF0F2';
  g.fillRect(8, 0, 9, H);
  g.fillRect(W - 17, 0, 9, H);
  const keys = 12;
  const kw = (W - 60) / (keys * 2 - 1);
  for (let i = 0; i < keys; i++) {
    if (i === 5 || i === 6) continue;
    g.fillRect(30 + i * 2 * kw, H - 30 - 300, kw, 300);
  }
  g.save();
  g.translate(W / 2, H - 420);
  g.font = 'bold 170px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText(designator, 0, 0);
  g.restore();
  g.fillRect(W / 2 - 5, 0, 10, H * 0.42);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  cache.set(key, t);
  return t;
}

/** Grass and fields seen from low altitude (tileable). */
export function grassTexture(): THREE.Texture {
  const key = 'grass';
  if (cache.has(key)) return cache.get(key)!;
  const S = 1024;
  const c = canvas(S, S);
  const g = c.getContext('2d')!;
  const r = rng(3);
  g.fillStyle = '#8FAE6E';
  g.fillRect(0, 0, S, S);
  const tones = ['#86A766', '#9BB979', '#7F9F60', '#A4C084', '#93B070', '#8AA86A'];
  for (let i = 0; i < 260; i++) {
    g.fillStyle = tones[Math.floor(r() * tones.length)];
    g.globalAlpha = 0.35;
    const x = r() * S;
    const y = r() * S;
    const w = 40 + r() * 200;
    const h = 30 + r() * 160;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) g.fillRect(x + dx, y + dy, w, h);
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 60000; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(60,90,40,0.14)' : 'rgba(210,228,190,0.12)';
    g.fillRect(r() * S, r() * S, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  cache.set(key, t);
  return t;
}

export {R};
