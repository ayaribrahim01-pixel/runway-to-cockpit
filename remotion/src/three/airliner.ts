import * as THREE from 'three';

// Procedural twin-engine airliner, built from scratch (no external models).
// Units: 1 = 2 m. Body axes: +X nose, +Y up, +Z right wing. Origin near the centre of the fuselage.

export const L = 18.6; // fuselage length (≈37 m)
export const R = 1.0; // fuselage radius (≈4 m diameter)
const NOSE = 2.7;
const TAIL0 = 12.7;
export const XN = L / 2; // X of the nose tip
export const GROUND_Y = -2.27; // ground level when the aircraft stands on its gear

/** fuselage radius at distance s behind the nose */
export function bodyRadius(s: number) {
  if (s <= 0) return 0;
  if (s < NOSE) {
    const t = s / NOSE;
    const p = 2.15;
    return R * Math.pow(1 - Math.pow(1 - t, p), 1 / p);
  }
  if (s <= TAIL0) return R;
  const t = Math.min(1, (s - TAIL0) / (L - TAIL0));
  return R - (R - 0.17) * Math.pow(t, 1.3);
}

/** vertical shift of the cross-section centre (drooped nose, upswept tail) */
export function bodyOffset(s: number) {
  if (s < NOSE) {
    const t = s / NOSE;
    return -0.24 * R * (1 - t) * (1 - t);
  }
  if (s <= TAIL0) return 0;
  return (R - bodyRadius(Math.min(s, L))) * 0.9;
}

const sToX = (s: number) => XN - s;
export const xToS = (x: number) => XN - x;

function fixSeam(g: THREE.BufferGeometry, seg: number, n: number) {
  const nor = g.attributes.normal as THREE.BufferAttribute;
  for (let j = 0; j < n; j++) {
    const a = j;
    const b = seg * n + j;
    const x = nor.getX(a) + nor.getX(b);
    const y = nor.getY(a) + nor.getY(b);
    const z = nor.getZ(a) + nor.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nor.setXYZ(a, x / l, y / l, z / l);
    nor.setXYZ(b, x / l, y / l, z / l);
  }
  nor.needsUpdate = true;
}

/** Lathe a profile [(r, s)] around the body axis, mapping s → -X. uv.y = s/len, uv.x = angle (0 right side, .25 top). */
function latheAlongX(pts: [number, number][], seg: number, map: (s: number) => {x: number; y: number; z?: number}, vLen: number) {
  const g = new THREE.LatheGeometry(
    pts.map(([r, s]) => new THREE.Vector2(Math.max(0, r), s)),
    seg,
  );
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const s = pos.getY(i);
    const lz = pos.getZ(i);
    const m = map(s);
    pos.setXYZ(i, m.x, lx + m.y, lz + (m.z ?? 0));
    uv.setY(i, s / vLen);
  }
  g.computeVertexNormals();
  fixSeam(g, seg, pts.length);
  return g;
}

export function fuselageGeometry(seg = 72) {
  const pts: [number, number][] = [];
  const NN = 40;
  for (let k = 0; k <= NN; k++) {
    const s = NOSE * (1 - Math.cos((Math.PI / 2) * (k / NN)));
    pts.push([bodyRadius(s), s]);
  }
  for (let s = NOSE + 0.25; s < TAIL0; s += 0.25) pts.push([R, s]);
  for (let s = TAIL0; s <= L + 1e-6; s += 0.14) pts.push([bodyRadius(s), s]);
  pts.push([0.15, L + 0.03]);
  pts.push([0.08, L + 0.07]);
  pts.push([0.0, L + 0.08]);
  const g = latheAlongX(pts, seg, (s) => ({x: sToX(s), y: bodyOffset(Math.min(s, L))}), L);
  const nor = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i <= seg; i++) {
    nor.setXYZ(i * pts.length, 1, 0, 0);
    nor.setXYZ(i * pts.length + pts.length - 1, -1, 0, 0);
  }
  return g;
}

/** belly fairing where the wing meets the body */
export function bellyFairingGeometry() {
  const pts: [number, number][] = [];
  const len = 6.4;
  for (let k = 0; k <= 32; k++) {
    const t = k / 32;
    const s = t * len;
    const r = 0.62 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.55);
    pts.push([r, s]);
  }
  const g = latheAlongX(pts, 48, (s) => ({x: sToX(5.6 + s), y: 0}), len);
  g.scale(1, 0.62, 1.55);
  g.translate(0, -0.66, 0);
  g.computeVertexNormals();
  fixSeam(g, 48, pts.length);
  return g;
}

// ─── wings & tail surfaces (lofted airfoils) ─────────────────────────────────────────────

type Sec = {le: [number, number, number]; c: number; tc: number; twist?: number; bend: number; camber?: number; v?: number};

function airfoil(N: number, tc: number, camber: number) {
  const up: [number, number][] = [];
  const lo: [number, number][] = [];
  const p = 0.4;
  for (let k = 0; k <= N; k++) {
    const x = (1 - Math.cos((Math.PI * k) / N)) / 2;
    const yt = 5 * tc * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const m = camber;
    const yc = x < p ? (m / (p * p)) * (2 * p * x - x * x) : (m / (1 - p) ** 2) * (1 - 2 * p + 2 * p * x - x * x);
    up.push([x, yc + yt]);
    lo.push([x, yc - yt]);
  }
  // loop TE upper → LE → TE lower; third value = texture u (0 TE upper, 0.5 LE, 1 TE lower)
  const loop: [number, number, number][] = [];
  for (let k = N; k >= 0; k--) loop.push([up[k][0], up[k][1], 0.5 * (1 - up[k][0])]);
  for (let k = 1; k <= N; k++) loop.push([lo[k][0], lo[k][1], 0.5 + 0.5 * lo[k][0]]);
  return loop;
}

function loft(secs: Sec[], side: 1 | -1, N = 22, capEnd = true) {
  const us = airfoil(N, 0.1, 0).map((p) => p[2]);
  const rows: THREE.Vector3[][] = secs.map((sec) => {
    const th = sec.bend;
    const n = new THREE.Vector3(0, Math.cos(th), -Math.sin(th));
    const ch = new THREE.Vector3(-1, 0, 0);
    const a = sec.twist ?? 0;
    const cd = ch.clone().multiplyScalar(Math.cos(a)).addScaledVector(n, -Math.sin(a));
    const nd = n.clone().multiplyScalar(Math.cos(a)).addScaledVector(ch, Math.sin(a));
    const le = new THREE.Vector3(...sec.le);
    return airfoil(N, sec.tc, sec.camber ?? 0.02).map(([x, y]) => le.clone().addScaledVector(cd, x * sec.c).addScaledVector(nd, y * sec.c));
  });
  const M = rows[0].length;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  rows.forEach((row, r) =>
    row.forEach((p, k) => {
      pos.push(p.x, p.y, p.z * side);
      uvs.push(us[k], secs[r].v ?? r / (rows.length - 1));
    }),
  );
  for (let r = 0; r < rows.length - 1; r++) {
    for (let k = 0; k < M - 1; k++) {
      const a = r * M + k;
      const b = (r + 1) * M + k;
      const c = r * M + k + 1;
      const d = (r + 1) * M + k + 1;
      if (side > 0) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  if (capEnd) {
    const last = rows[rows.length - 1];
    const cen = last.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / last.length);
    const ci = pos.length / 3;
    pos.push(cen.x, cen.y, cen.z * side);
    uvs.push(0.5, 1);
    const base = (rows.length - 1) * M;
    for (let k = 0; k < M - 1; k++) {
      if (side > 0) idx.push(ci, base + k + 1, base + k);
      else idx.push(ci, base + k, base + k + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const D2R = Math.PI / 180;
const DIH = 5 * D2R;
const WROOT_Z = 0.55;
const WROOT_Y = -0.52;
const W_LE_ROOT = 2.95; // X of the leading edge at the root
const SWEEP = Math.tan(27 * D2R);
const KINK_Z = 3.3;
const TIP_Z = 8.4;

/** leading edge X, trailing edge X, chord-line Y and thickness ratio of the main wing at span z */
export function wingAt(z: number) {
  const zz = Math.max(WROOT_Z, Math.min(TIP_Z, z));
  const leX = W_LE_ROOT - (zz - WROOT_Z) * SWEEP;
  let c: number;
  let tc: number;
  if (zz <= KINK_Z) {
    const t = (zz - WROOT_Z) / (KINK_Z - WROOT_Z);
    c = 3.6 + (2.05 - 3.6) * t;
    tc = 0.145 + (0.12 - 0.145) * t;
  } else {
    const t = (zz - KINK_Z) / (TIP_Z - KINK_Z);
    c = 2.05 + (0.78 - 2.05) * t;
    tc = 0.12 + (0.105 - 0.12) * t;
  }
  const y = WROOT_Y + (zz - WROOT_Z) * Math.tan(DIH);
  return {leX, teX: leX - c, c, y, tc};
}

export function wingGeometry(side: 1 | -1) {
  const secs: Sec[] = [];
  const spans = [WROOT_Z, 1.4, 2.4, KINK_Z, 4.6, 5.9, 7.2, TIP_Z];
  for (const z of spans) {
    const w = wingAt(z);
    const t = (z - WROOT_Z) / (TIP_Z - WROOT_Z);
    secs.push({le: [w.leX, w.y, z], c: w.c, tc: w.tc, twist: (2.2 - 5.2 * t) * D2R, bend: DIH, camber: 0.024, v: t});
  }
  // blended winglet: bend up through ~78° while sweeping back and tapering
  const tip = wingAt(TIP_Z);
  const rad = 0.55;
  const steps = 7;
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * (78 * D2R - DIH) + DIH;
    const z = TIP_Z + rad * (Math.sin(a) - Math.sin(DIH));
    const y = tip.y + rad * (Math.cos(DIH) - Math.cos(a));
    const back = 0.25 * (i / steps);
    secs.push({le: [tip.leX - back, y, z], c: tip.c * (1 - 0.18 * (i / steps)), tc: 0.1, twist: -3 * D2R, bend: a, camber: 0.015, v: 1});
  }
  const last = secs[secs.length - 1];
  const h = 1.15;
  const a = 78 * D2R;
  secs.push({
    le: [last.le[0] - 0.85, last.le[1] + h * Math.sin(a), last.le[2] + h * Math.cos(a)],
    c: 0.3,
    tc: 0.09,
    twist: -2 * D2R,
    bend: a,
    camber: 0.01,
    v: 1,
  });
  return loft(secs, side, 22, true);
}

export function wingTip(side: 1 | -1) {
  const tip = wingAt(TIP_Z);
  return new THREE.Vector3(tip.leX - 0.35, tip.y + 0.02, (TIP_Z + 0.05) * side);
}

export function wingletTop(side: 1 | -1) {
  const tip = wingAt(TIP_Z);
  const a = 78 * D2R;
  return new THREE.Vector3(tip.leX - 1.25, tip.y + 0.5 + 1.15 * Math.sin(a), (TIP_Z + 0.55 + 1.15 * Math.cos(a)) * side);
}

export function hStabGeometry(side: 1 | -1) {
  const sRoot = 15.25;
  const x0 = sToX(sRoot);
  const y0 = bodyOffset(sRoot) - 0.05;
  const sw = Math.tan(31 * D2R);
  const dih = 6 * D2R;
  const secs: Sec[] = [];
  const zs = [0.18, 1.0, 2.0, 3.05];
  for (const z of zs) {
    const t = (z - 0.18) / (3.05 - 0.18);
    secs.push({le: [x0 - (z - 0.18) * sw, y0 + (z - 0.18) * Math.tan(dih), z], c: 1.95 + (0.68 - 1.95) * t, tc: 0.11, bend: dih, camber: 0});
  }
  return loft(secs, side, 18, true);
}

export function finGeometry() {
  const sw = Math.tan(39 * D2R);
  const secs: Sec[] = [];
  const top = 1.0;
  const base = top - 0.12;
  // dorsal fillet blends into the fin root
  secs.push({le: [sToX(12.3), base - 0.2, 0], c: 4.75, tc: 0.07, bend: Math.PI / 2, camber: 0});
  secs.push({le: [sToX(12.95), base + 0.25, 0], c: 4.05, tc: 0.09, bend: Math.PI / 2, camber: 0});
  const h0 = base + 0.55;
  const H = 3.05;
  for (const t of [0, 0.35, 0.7, 1]) {
    const y = h0 + t * (H - 0.55);
    secs.push({le: [sToX(13.35) - (y - h0) * sw, y, 0], c: 3.5 + (1.15 - 3.5) * t, tc: 0.1, bend: Math.PI / 2, camber: 0});
  }
  const g = loft(secs, 1, 20, true);
  // planar UVs for the tail artwork (u: front → back, v: bottom → top)
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (bb.max.x - pos.getX(i)) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  }
  return g;
}

export function finTop() {
  return new THREE.Vector3(sToX(13.35) - (3.05 - 0.55) * Math.tan(39 * D2R) - 0.6, 1.0 - 0.12 + 3.05, 0);
}

// ─── engines ─────────────────────────────────────────────────────────────────────────────

export const ENG_Z = 2.95;
const engW = wingAt(ENG_Z);
export const ENG = {x: engW.leX + 1.35, y: -1.06, z: ENG_Z, r: 0.53, len: 2.1};

export function nacelleParts() {
  const map = (s: number) => ({x: ENG.x - s, y: ENG.y});
  const inner: [number, number][] = [
    [0.405, 0.52],
    [0.41, 0.34],
    [0.418, 0.2],
    [0.43, 0.1],
    [0.442, 0.045],
  ];
  const lip: [number, number][] = [
    [0.442, 0.045],
    [0.452, 0.012],
    [0.462, 0.0],
    [0.478, 0.006],
    [0.496, 0.03],
    [0.512, 0.08],
    [0.522, 0.15],
  ];
  const cowl: [number, number][] = [
    [0.522, 0.15],
    [0.53, 0.35],
    [0.534, 0.7],
    [0.53, 1.05],
    [0.516, 1.38],
    [0.492, 1.66],
    [0.462, 1.9],
    [0.44, 2.06],
    [0.432, 2.1],
  ];
  const core: [number, number][] = [
    [0.37, 1.92],
    [0.355, 2.2],
    [0.322, 2.48],
    [0.285, 2.72],
    [0.262, 2.84],
  ];
  const plug: [number, number][] = [
    [0.195, 2.8],
    [0.18, 2.95],
    [0.14, 3.1],
    [0.07, 3.22],
    [0.0, 3.27],
  ];
  const spinner: [number, number][] = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16;
    spinner.push([0.14 * Math.sin((Math.PI / 2) * t) ** 0.8, 0.14 + 0.38 * t]);
  }
  return {
    inner: latheAlongX(inner, 56, map, 2.1),
    lip: latheAlongX(lip, 56, map, 2.1),
    cowl: latheAlongX(cowl, 56, map, 2.1),
    core: latheAlongX(core, 40, map, 3.3),
    plug: latheAlongX(plug, 40, map, 3.3),
    spinner: latheAlongX(spinner, 40, (s) => ({x: -s, y: 0}), 0.55),
  };
}

/** fan blades as one geometry, centred on the engine axis (rotate about X to spin) */
export function fanGeometry(blades = 22) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < blades; i++) {
    const b = new THREE.BoxGeometry(0.03, 0.27, 0.075);
    b.translate(0, 0.27, 0);
    b.rotateY(0.55);
    b.rotateX((i / blades) * Math.PI * 2);
    parts.push(b);
  }
  const hub = new THREE.CylinderGeometry(0.14, 0.14, 0.06, 24);
  hub.rotateZ(Math.PI / 2);
  parts.push(hub);
  return mergeGeometries(parts);
}

export function pylonGeometry() {
  const w = wingAt(ENG_Z);
  const top = ENG.y + ENG.r;
  const wl = w.y - w.c * w.tc * 0.42;
  const sh = new THREE.Shape();
  sh.moveTo(ENG.x - 0.38, top - 0.04);
  sh.lineTo(ENG.x - 0.62, top + 0.1);
  sh.lineTo(w.leX + 0.15, wl + 0.06);
  sh.lineTo(w.teX - 0.15, wl + 0.06);
  sh.lineTo(w.teX - 0.55, wl - 0.1);
  sh.lineTo(w.teX - 0.1, wl - 0.2);
  sh.lineTo(ENG.x - ENG.len + 0.1, top - 0.08);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {depth: 0.15, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, steps: 1});
  g.translate(0, 0, -0.075);
  return g;
}

/** canoe-shaped flap track fairings under the wing */
export function flapFairings(side: 1 | -1) {
  const out: {pos: THREE.Vector3; len: number}[] = [];
  for (const z of [1.95, 4.35, 5.6, 6.85]) {
    const w = wingAt(z);
    out.push({pos: new THREE.Vector3(w.teX + 0.25, w.y - w.c * w.tc * 0.35, z * side), len: Math.max(0.9, w.c * 0.55)});
  }
  return out;
}

// ─── landing gear ───────────────────────────────────────────────────────────────────────

export const MAIN_GEAR = {x: wingAt(1.9).teX + 0.75, z: 1.9, top: -0.62, axle: GROUND_Y + 0.32, tire: 0.32};
export const NOSE_GEAR = {x: sToX(2.35), top: -0.72, axle: GROUND_Y + 0.2, tire: 0.2};

// ─── helpers ─────────────────────────────────────────────────────────────────────────────

export function mergeGeometries(geos: THREE.BufferGeometry[]) {
  let vCount = 0;
  let iCount = 0;
  for (const g of geos) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of geos) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array as ArrayLike<number>, vo * 3);
    nor.set(g.attributes.normal.array as ArrayLike<number>, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array as ArrayLike<number>, vo * 2);
    if (g.index) {
      const a = g.index.array;
      for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo;
      io += a.length;
    } else {
      for (let i = 0; i < g.attributes.position.count; i++) idx[io + i] = vo + i;
      io += g.attributes.position.count;
    }
    vo += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
