import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {CLAMP, EASE_IN_OUT, lerp, prog} from '../anim';
import {alpha, F, Rich, useBrand} from '../theme';
import type {Scene} from '../types';
import {SAFE_BOTTOM} from './scenes';

// Original illustrated airport (isometric-style, orthographic camera) with numbered callouts that pop in on cue,
// a camera that flies to each feature, a legend that builds up, animated lights, and an aircraft that lands and taxis in.
// Plan units ≈ metres, but runway width is exaggerated so markings stay readable. x = east, y = south.

const D2R = Math.PI / 180;
type P2 = [number, number];

const C = {
  grass: '#D5E7BF',
  strip: '#DDEDCB',
  tileSide1: '#B7CB98',
  tileSide2: '#A4BA86',
  asphalt: '#5B636D',
  shoulder: '#7D858F',
  taxi: '#69717B',
  concrete: '#CDD2D8',
  white: '#F7F8FA',
  yellow: '#F2B705',
  road: '#B9BFC7',
  water: '#BFDDF2',
  tree: '#8DB872',
  treeDark: '#6E9C58',
  navy: '#14305A',
};

// ─── projection ──────────────────────────────────────────────────────────────────────────
type CamState = {fx: number; fy: number; s: number; rot: number};

function mkProj(c: CamState, tilt: number, cx: number, cy: number) {
  const ph = c.rot * D2R;
  const al = tilt * D2R;
  const cp = Math.cos(ph);
  const sn = Math.sin(ph);
  const sa = Math.sin(al);
  const ca = Math.cos(al);
  const P = (x: number, y: number, z = 0): P2 => {
    const dx = x - c.fx;
    const dy = y - c.fy;
    return [cx + c.s * (cp * dx - sn * dy), cy + c.s * ((sn * dx + cp * dy) * sa - z * ca)];
  };
  const depth = (x: number, y: number) => sn * (x - c.fx) + cp * (y - c.fy);
  const M = (z = 0) =>
    `matrix(${c.s * cp} ${c.s * sa * sn} ${-c.s * sn} ${c.s * sa * cp} ${cx - c.s * (cp * c.fx - sn * c.fy)} ${cy - c.s * sa * (sn * c.fx + cp * c.fy) - c.s * z * ca})`;
  /** is a vertical face with outward plan normal (nx, ny) facing the camera? */
  const faces = (nx: number, ny: number) => sn * nx + cp * ny > 0.001;
  return {P, depth, M, faces, s: c.s, sa, ca};
}
type Proj = ReturnType<typeof mkProj>;

const pts = (a: P2[]) => a.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

function shade(hex: string, k: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function hull(p: P2[]): P2[] {
  const a = [...p].sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  const cross = (o: P2, u: P2, v: P2) => (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]);
  const lo: P2[] = [];
  for (const q of a) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: P2[] = [];
  for (let i = a.length - 1; i >= 0; i--) {
    const q = a[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

const SUN: P2 = [0.55, 0.42]; // shadow offset per unit of height (sun in the north-west)

type Obj = {depth: number; el: React.ReactNode};

/** an axis-aligned box (building) with visible side faces, top and ground shadow */
function box(pr: Proj, key: string, x0: number, y0: number, w: number, d: number, z0: number, z1: number, color: string, opts: {top?: string; south?: string; shadow?: boolean} = {}): {shadow: React.ReactNode; obj: Obj} {
  const A: P2 = [x0, y0];
  const B: P2 = [x0 + w, y0];
  const Cc: P2 = [x0 + w, y0 + d];
  const D: P2 = [x0, y0 + d];
  const faces: {a: P2; b: P2; n: P2; k: number; col?: string}[] = [
    {a: D, b: Cc, n: [0, 1], k: -0.06, col: opts.south},
    {a: B, b: A, n: [0, -1], k: -0.18},
    {a: Cc, b: B, n: [1, 0], k: -0.24},
    {a: A, b: D, n: [-1, 0], k: -0.12},
  ];
  const els: React.ReactNode[] = [];
  faces.forEach((fc, i) => {
    if (!pr.faces(fc.n[0], fc.n[1])) return;
    const poly = [pr.P(fc.a[0], fc.a[1], z0), pr.P(fc.b[0], fc.b[1], z0), pr.P(fc.b[0], fc.b[1], z1), pr.P(fc.a[0], fc.a[1], z1)];
    els.push(<polygon key={i} points={pts(poly)} fill={fc.col ?? shade(color, fc.k)} stroke={shade(color, -0.3)} strokeWidth={0.6} strokeLinejoin="round" />);
  });
  const top = [pr.P(A[0], A[1], z1), pr.P(B[0], B[1], z1), pr.P(Cc[0], Cc[1], z1), pr.P(D[0], D[1], z1)];
  els.push(<polygon key="t" points={pts(top)} fill={opts.top ?? shade(color, 0.18)} stroke={shade(color, -0.25)} strokeWidth={0.6} strokeLinejoin="round" />);
  let shadow: React.ReactNode = null;
  if (opts.shadow !== false && z0 < 0.5) {
    const base: P2[] = [A, B, Cc, D];
    const off = base.map((p) => [p[0] + SUN[0] * z1, p[1] + SUN[1] * z1] as P2);
    shadow = <polygon key={key + 's'} points={pts(hull([...base, ...off]))} fill="rgba(30,52,40,0.16)" />;
  }
  return {shadow, obj: {depth: pr.depth(x0 + w / 2, y0 + d / 2), el: <g key={key}>{els}</g>}};
}

/** vertical cylinder (fuel tank) */
function cylinder(pr: Proj, key: string, x: number, y: number, r: number, h: number, color: string): {shadow: React.ReactNode; obj: Obj} {
  const [bx, by] = pr.P(x, y, 0);
  const [tx, ty] = pr.P(x, y, h);
  const rx = r * pr.s;
  const ry = r * pr.s * pr.sa;
  const side = `M${bx - rx},${by} A${rx},${ry} 0 0 0 ${bx + rx},${by} L${tx + rx},${ty} L${tx - rx},${ty} Z`;
  const [sx, sy] = pr.P(x + SUN[0] * h * 0.6, y + SUN[1] * h * 0.6, 0);
  return {
    shadow: <ellipse key={key + 's'} cx={sx} cy={sy} rx={rx * 1.15} ry={ry * 1.15} fill="rgba(30,52,40,0.15)" />,
    obj: {
      depth: pr.depth(x, y),
      el: (
        <g key={key}>
          <path d={side} fill={shade(color, -0.12)} stroke={shade(color, -0.3)} strokeWidth={0.6} />
          <ellipse cx={tx} cy={ty} rx={rx} ry={ry} fill={shade(color, 0.12)} stroke={shade(color, -0.3)} strokeWidth={0.6} />
          <ellipse cx={tx} cy={ty} rx={rx * 0.55} ry={ry * 0.55} fill="none" stroke={shade(color, -0.2)} strokeWidth={0.8} />
        </g>
      ),
    },
  };
}

// ─── aircraft (top view, original drawing; nose = +x) ───────────────────────────────────
const PLANE_BODY = 'M22,0 C22,-2.2 20,-2.8 17,-2.8 L-18,-2.6 C-21,-2.4 -23,-1.2 -23.5,0 C-23,1.2 -21,2.4 -18,2.6 L17,2.8 C20,2.8 22,2.2 22,0 Z';
const PLANE_WINGS = 'M5,-2.6 L-9,-23 L-13,-23 L-7,-2.6 Z M5,2.6 L-9,23 L-13,23 L-7,2.6 Z';
const PLANE_STAB = 'M-15.5,-2.2 L-20.5,-9 L-23,-9 L-20,-2.2 Z M-15.5,2.2 L-20.5,9 L-23,9 L-20,2.2 Z';
const PLANE_ENG = 'M2.5,-10.6 L-3.5,-10.6 L-3.5,-7.6 L2.5,-7.6 Z M2.5,7.6 L-3.5,7.6 L-3.5,10.6 L2.5,10.6 Z';

const PlaneTop: React.FC<{accent: string; scale?: number; shadowOnly?: boolean}> = ({accent, scale = 1, shadowOnly}) => (
  <g transform={`scale(${scale})`}>
    {shadowOnly ? (
      <g fill="rgba(20,32,44,0.30)">
        <path d={PLANE_BODY} />
        <path d={PLANE_WINGS} />
        <path d={PLANE_STAB} />
      </g>
    ) : (
      <>
        <path d={PLANE_WINGS} fill="#E3E8EF" stroke="#2B3D57" strokeWidth={0.55} />
        <path d={PLANE_ENG} fill={C.navy} />
        <path d={PLANE_STAB} fill="#E3E8EF" stroke="#2B3D57" strokeWidth={0.5} />
        <path d={PLANE_BODY} fill="#FFFFFF" stroke="#2B3D57" strokeWidth={0.6} />
        <path d="M-17,0 L-23,0" stroke={C.navy} strokeWidth={1.6} strokeLinecap="round" />
        <path d="M14,-1.4 L17,-1.2 M14,1.4 L17,1.2" stroke="#2B3D57" strokeWidth={0.9} strokeLinecap="round" />
        <path d="M-6,0 L10,0" stroke={accent} strokeWidth={0.9} strokeLinecap="round" opacity={0.9} />
      </>
    )}
  </g>
);

const SmallPlane: React.FC = () => (
  <g>
    <path d="M7,0 L-6,0" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" />
    <path d="M1.5,-7 L-0.5,-7 L-0.5,7 L1.5,7 Z" fill="#FFFFFF" stroke="#B9C2CE" strokeWidth={0.3} />
    <path d="M-5,-2.6 L-6,-2.6 L-6,2.6 L-5,2.6 Z" fill="#FFFFFF" />
  </g>
);

// ─── route helpers for the landing aircraft ─────────────────────────────────────────────
function roundedRoute(p: P2[], r: number): P2[] {
  const out: P2[] = [p[0]];
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1];
    const b = p[i];
    const c = p[i + 1];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const p1: P2 = [b[0] - ((b[0] - a[0]) / l1) * rr, b[1] - ((b[1] - a[1]) / l1) * rr];
    const p2: P2 = [b[0] + ((c[0] - b[0]) / l2) * rr, b[1] + ((c[1] - b[1]) / l2) * rr];
    out.push(p1);
    for (let k = 1; k < 10; k++) {
      const t = k / 10;
      out.push([(1 - t) * (1 - t) * p1[0] + 2 * (1 - t) * t * b[0] + t * t * p2[0], (1 - t) * (1 - t) * p1[1] + 2 * (1 - t) * t * b[1] + t * t * p2[1]]);
    }
    out.push(p2);
  }
  out.push(p[p.length - 1]);
  return out;
}

function routeTools(poly: P2[]) {
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const L = cum[cum.length - 1];
  const at = (d: number) => {
    const dd = Math.max(0, Math.min(L, d));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < dd) i++;
    const t = (dd - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
    const a = poly[i - 1];
    const b = poly[i];
    return {x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, hdg: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI};
  };
  return {L, at};
}

const hermite = (tau: number, p0: number, p1: number, m0: number, m1: number) => {
  const t = Math.max(0, Math.min(1, tau));
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
};

const TD_X = -545; // touchdown point (just before the aiming point)
const RET_X = 40;
const ROUTE = roundedRoute(
  [
    [TD_X, 0],
    [RET_X, 0],
    [300, -150],
    [360, -170],
    [390, -170],
    [400, -195],
    [400, -362],
  ],
  34,
);
const RT = routeTools(ROUTE);
const L_ROLL = RET_X - TD_X;

/** aircraft position t seconds after the landing animation starts */
function landingState(t: number, speed = 1) {
  const s = t * speed;
  const T1 = 3.0;
  const appLen = 755;
  if (s < 0) return null;
  if (s < T1) {
    const u = s / T1;
    const z = 70 * Math.pow(1 - u, 1.25);
    return {x: TD_X - appLen + appLen * u, y: 0, z, hdg: 0};
  }
  const TR = 3.2;
  if (s < T1 + TR) {
    const d = hermite((s - T1) / TR, 0, L_ROLL, 250 * TR, 40 * TR);
    const p = RT.at(d);
    return {x: p.x, y: p.y, z: 0, hdg: p.hdg};
  }
  const L2 = RT.L - L_ROLL;
  const TT = L2 / 45;
  const d = L_ROLL + hermite((s - T1 - TR) / TT, 0, L2, 40 * TT, 0);
  const p = RT.at(d);
  return {x: p.x, y: p.y, z: 0, hdg: p.hdg};
}

// ─── named features ─────────────────────────────────────────────────────────────────────
type Anchor = {x: number; y: number; z?: number; fx?: 'edge' | 'approach' | 'papi' | 'thr' | 'taxi'};
export const ANCHORS: Record<string, Anchor> = {
  runway: {x: 0, y: 0},
  designator: {x: -728, y: 0},
  'runway-designator': {x: -728, y: 0},
  threshold: {x: -777, y: 0},
  'pre-threshold': {x: -842, y: 0},
  'blast-pad': {x: -842, y: 0},
  'aiming-point': {x: -545, y: -12},
  'touchdown-zone': {x: -640, y: 13},
  tdz: {x: -640, y: 13},
  centreline: {x: -160, y: 0},
  centerline: {x: -160, y: 0},
  'edge-marking': {x: -300, y: 28.5},
  'edge-lights': {x: -100, y: -33, fx: 'edge'},
  'runway-lighting': {x: -100, y: -33, fx: 'edge'},
  'threshold-lights': {x: -802, y: -18, fx: 'thr'},
  'approach-lights': {x: -965, y: 0, fx: 'approach'},
  papi: {x: -560, y: -63, fx: 'papi'},
  stopway: {x: 842, y: 0},
  'holding-position': {x: -780, y: -75},
  'rapid-exit': {x: 180, y: -80, fx: 'taxi'},
  'high-speed-taxiway': {x: 180, y: -80, fx: 'taxi'},
  taxiway: {x: -320, y: -170, fx: 'taxi'},
  apron: {x: 40, y: -255},
  stands: {x: 100, y: -360},
  'aircraft-stands': {x: 100, y: -360},
  terminal: {x: 60, y: -480, z: 26},
  tower: {x: 520, y: -330, z: 88},
  'control-tower': {x: 520, y: -330, z: 88},
  'fire-station': {x: 645, y: -245, z: 14},
  'fuel-farm': {x: 730, y: -505, z: 20},
  hangar: {x: -565, y: -490, z: 36},
  maintenance: {x: -565, y: -490, z: 36},
  'de-icing': {x: -710, y: -290},
  windsock: {x: -690, y: 80, z: 27},
  'wind-indicator': {x: -690, y: 80, z: 27},
  helipad: {x: -610, y: -388},
  'ga-apron': {x: -520, y: -390},
  'car-park': {x: 50, y: -600},
  parking: {x: 50, y: -600},
};

const TILE = {x0: -1080, y0: -700, x1: 1080, y1: 300};

// ─── static ground artwork (drawn once in plan coordinates, then mapped by the camera matrix) ──
function GroundArt({accent}: {accent: string}) {
  const els: React.ReactNode[] = [];
  let k = 0;
  const key = () => `g${k++}`;
  // grass tile, runway strip, landside
  els.push(<rect key={key()} x={TILE.x0} y={TILE.y0} width={TILE.x1 - TILE.x0} height={TILE.y1 - TILE.y0} rx={26} fill={C.grass} />);
  els.push(<rect key={key()} x={-1000} y={-110} width={2000} height={220} fill={C.strip} />);
  // mowing stripes on the strip
  for (let x = -1000; x < 1000; x += 80) els.push(<rect key={key()} x={x} y={-110} width={40} height={220} fill="rgba(255,255,255,0.18)" />);
  // a little pond south-east
  els.push(<ellipse key={key()} cx={560} cy={210} rx={90} ry={40} fill={C.water} />);
  // landside roads, rail
  els.push(<path key={key()} d="M-1080,-640 L1080,-640" stroke={C.road} strokeWidth={22} />);
  els.push(<path key={key()} d="M-1080,-640 L1080,-640" stroke="#FFFFFF" strokeWidth={1.2} strokeDasharray="14 12" />);
  els.push(<path key={key()} d="M-1080,-678 L1080,-678 M-1080,-672 L1080,-672" stroke="#9AA2AC" strokeWidth={1.4} />);
  els.push(<path key={key()} d="M-330,-640 L-330,-560 L470,-560 L470,-640" stroke={C.road} strokeWidth={14} fill="none" />);
  // car park
  els.push(<rect key={key()} x={-300} y={-625} width={560} height={52} fill="#C4C9D0" rx={4} />);
  const cars = ['#E05A47', '#3B82C4', '#F2F2F2', '#2E3A4B', '#9AA6B2', '#F5B32C'];
  for (let i = 0; i < 52; i++) {
    const cx = -292 + (i % 26) * 21.5;
    const cy = i < 26 ? -620 : -592;
    if ((i * 7) % 5 === 0) continue;
    els.push(<rect key={key()} x={cx} y={cy} width={9} height={17} rx={2} fill={cars[(i * 5) % cars.length]} />);
  }

  // approach lighting system: gravel strip + light bases
  els.push(<rect key={key()} x={-1050} y={-3} width={170} height={6} fill="#AEB6AA" />);
  els.push(<rect key={key()} x={-953} y={-48} width={6} height={96} fill="#AEB6AA" />);
  for (let i = 0; i < 6; i++) els.push(<rect key={key()} x={-1043 + i * 30} y={-7} width={6} height={14} rx={1.5} fill="#59616B" />);
  for (let y = -45; y <= 45; y += 6) if (Math.abs(y) > 6) els.push(<rect key={key()} x={-952.5} y={y - 1.5} width={5} height={3} rx={1} fill="#59616B" />);
  // pre-threshold area
  els.push(<rect key={key()} x={-880} y={-30} width={80} height={60} fill="#6B727C" />);
  for (let i = 0; i < 3; i++) {
    const x = -878 + i * 26;
    els.push(<path key={key()} d={`M${x},-27 L${x + 22},0 L${x},27`} stroke={C.yellow} strokeWidth={3} fill="none" />);
  }
  // stopway at the far end
  els.push(<rect key={key()} x={800} y={-30} width={80} height={60} fill="#6B727C" />);
  for (let i = 0; i < 3; i++) {
    const x = 878 - i * 26;
    els.push(<path key={key()} d={`M${x},-27 L${x - 22},0 L${x},27`} stroke={C.yellow} strokeWidth={3} fill="none" />);
  }

  // taxiways (drawn under the runway)
  const tw = (d: string, w = 23) => {
    els.push(<path key={key()} d={d} stroke={C.taxi} strokeWidth={w} fill="none" strokeLinejoin="round" strokeLinecap="butt" />);
  };
  tw('M-800,-170 L800,-170');
  tw('M-780,-170 L-780,-20');
  tw('M780,-170 L780,-20');
  tw(`M${RET_X - 20},-6 L300,-150 Q330,-168 368,-170`);
  for (const x of [-200, 100, 400]) tw(`M${x},-180 L${x},-200`);
  tw('M-700,-180 L-700,-252', 20);
  tw('M640,-180 L640,-210', 14);

  // apron + GA apron + de-icing pad
  els.push(<rect key={key()} x={-330} y={-432} width={800} height={240} rx={6} fill={C.concrete} />);
  els.push(<rect key={key()} x={-660} y={-432} width={190} height={90} rx={6} fill={C.concrete} />);
  els.push(<rect key={key()} x={-760} y={-330} width={110} height={80} rx={6} fill={C.taxi} />);
  els.push(<rect key={key()} x={-752} y={-322} width={94} height={64} rx={4} fill="none" stroke="#7FC4F0" strokeWidth={2.4} strokeDasharray="8 6" />);
  // fuel farm berm
  els.push(<rect key={key()} x={668} y={-578} width={126} height={120} rx={6} fill="#D9DCD3" stroke="#C3C7BC" strokeWidth={3} />);

  // runway
  els.push(<rect key={key()} x={-806} y={-36} width={1612} height={72} fill={C.shoulder} />);
  els.push(<rect key={key()} x={-800} y={-30} width={1600} height={60} fill={C.asphalt} />);
  // tyre marks in the touchdown zones
  els.push(<rect key={key()} x={-640} y={-9} width={260} height={18} fill="rgba(25,28,32,0.22)" />);
  els.push(<rect key={key()} x={380} y={-9} width={260} height={18} fill="rgba(25,28,32,0.22)" />);

  // threshold piano keys (both ends)
  for (const end of [-1, 1]) {
    const x0 = end < 0 ? -797 : 757;
    for (let i = 0; i < 12; i++) {
      const side = i < 6 ? -1 : 1;
      const j = i % 6;
      const y = side < 0 ? -27 + j * 4.2 : 3.6 + j * 4.2;
      els.push(<rect key={key()} x={x0} y={y} width={40} height={2.6} fill={C.white} />);
    }
  }
  // designators
  els.push(
    <text key={key()} x={0} y={0} transform="translate(-728 0) rotate(90)" textAnchor="middle" dominantBaseline="central" fontFamily={F.head} fontWeight={800} fontSize={26} fill={C.white}>
      09
    </text>,
  );
  els.push(
    <text key={key()} x={0} y={0} transform="translate(728 0) rotate(-90)" textAnchor="middle" dominantBaseline="central" fontFamily={F.head} fontWeight={800} fontSize={26} fill={C.white}>
      27
    </text>,
  );
  // centreline
  for (let x = -700; x < 700; x += 50) els.push(<rect key={key()} x={x} y={-0.8} width={30} height={1.6} fill={C.white} />);
  // edge markings
  els.push(<rect key={key()} x={-797} y={-28.6} width={1594} height={1.2} fill={C.white} />);
  els.push(<rect key={key()} x={-797} y={27.4} width={1594} height={1.2} fill={C.white} />);
  // aiming points
  for (const end of [-1, 1]) {
    const x0 = end < 0 ? -575 : 525;
    els.push(<rect key={key()} x={x0} y={-16} width={50} height={7} fill={C.white} />);
    els.push(<rect key={key()} x={x0} y={9} width={50} height={7} fill={C.white} />);
  }
  // touchdown-zone markings (3,2,2,1,1 bars each side) — 09 end, mirrored for 27
  const tdz: [number, number][] = [
    [-655, 3],
    [-465, 2],
    [-395, 2],
    [-325, 1],
    [-255, 1],
  ];
  for (const [xx, n] of tdz) {
    for (const mir of [1, -1]) {
      const x = mir > 0 ? xx : -xx - 22;
      for (let j = 0; j < n; j++) {
        els.push(<rect key={key()} x={x} y={-17 + j * 3.4} width={22} height={2.2} fill={C.white} />);
        els.push(<rect key={key()} x={x} y={14.8 - j * 3.4} width={22} height={2.2} fill={C.white} />);
      }
    }
  }

  // taxiway centrelines (yellow) incl. lead-on / lead-off lines
  const yl = (d: string, w = 1.2) => els.push(<path key={key()} d={d} stroke={C.yellow} strokeWidth={w} fill="none" strokeLinecap="round" />);
  yl('M-800,-170 L800,-170');
  yl('M-780,-170 L-780,-40 Q-780,-1 -740,-1');
  yl('M780,-170 L780,-40 Q780,-1 740,-1');
  yl(`M${RET_X - 40},0 Q${RET_X},0 ${RET_X + 20},-11 L300,-150 Q330,-168 368,-170`);
  for (const x of [-200, 100, 400]) yl(`M${x},-170 L${x},-214`);
  yl('M-320,-214 L460,-214');
  yl('M-700,-170 L-700,-250');
  // stand lead-in lines + stop bars + stand numbers
  [-220, -60, 100, 260, 400].forEach((x, i) => {
    yl(`M${x},-214 L${x},-404`, 1);
    els.push(<rect key={key()} x={x - 6} y={-408} width={12} height={1.4} fill={C.yellow} />);
    els.push(
      <text key={key()} x={x + 10} y={-232} fontFamily={F.head} fontWeight={800} fontSize={13} fill={C.yellow}>
        {i + 1}
      </text>,
    );
  });
  // holding position markings (pattern A): solid on the taxiway side, dashed on the runway side
  for (const x of [-780, 780]) {
    els.push(<rect key={key()} x={x - 11.5} y={-82} width={23} height={1.2} fill={C.yellow} />);
    els.push(<rect key={key()} x={x - 11.5} y={-78.5} width={23} height={1.2} fill={C.yellow} />);
    for (let i = 0; i < 4; i++) {
      els.push(<rect key={key()} x={x - 11.5 + i * 6.3} y={-74.5} width={4} height={1.2} fill={C.yellow} />);
      els.push(<rect key={key()} x={x - 11.5 + i * 6.3} y={-71} width={4} height={1.2} fill={C.yellow} />);
    }
  }
  // helipad
  els.push(<circle key={key()} cx={-610} cy={-388} r={22} fill="#B9C0C8" stroke={C.white} strokeWidth={2} />);
  els.push(
    <text key={key()} x={-610} y={-387} textAnchor="middle" dominantBaseline="central" fontFamily={F.head} fontWeight={800} fontSize={22} fill={C.white}>
      H
    </text>,
  );
  // taxiway designators painted on the ground
  els.push(
    <text key={key()} x={-560} y={-156} textAnchor="middle" fontFamily={F.head} fontWeight={800} fontSize={13} fill={C.yellow}>
      A
    </text>,
  );
  els.push(
    <text key={key()} x={210} y={-92} textAnchor="middle" fontFamily={F.head} fontWeight={800} fontSize={13} fill={C.yellow} transform="rotate(-30 210 -92)">
      B
    </text>,
  );
  void accent;
  return <>{els}</>;
}

// ─── trees (deterministic scatter) ─────────────────────────────────────────────────────
const TREES: {x: number; y: number; r: number}[] = (() => {
  let s = 11;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: {x: number; y: number; r: number}[] = [];
  const zones: [number, number, number, number, number][] = [
    [-1060, 140, 1060, 290, 70],
    [-1060, -560, -700, -440, 14],
    [820, -700, 1060, -200, 16],
    [-1060, -430, -800, -200, 10],
  ];
  for (const [x0, y0, x1, y1, n] of zones) {
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * (x1 - x0);
      const y = y0 + r() * (y1 - y0);
      if (Math.hypot(x - 560, y - 210) < 110) continue;
      out.push({x, y, r: 9 + r() * 7});
    }
  }
  return out;
})();

// ─── the scene ─────────────────────────────────────────────────────────────────────────
type Callout = {
  n?: number;
  label?: string;
  sub?: string;
  at?: string;
  x?: number;
  y?: number;
  z?: number;
  cue?: number;
  zoom?: number;
  rot?: number;
  ring?: number;
  overview?: boolean;
};

const MOVE = 26;

export const AirportMap: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {fps, width: W} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const calls: Callout[] = d.callouts || [];
  const cueF = (c: number | undefined, fallback: number) => (typeof c === 'number' && typeof scene.cues?.[c] === 'number' ? scene.cues[c] : fallback);
  const resolved = calls.map((c, i) => {
    const a = c.at ? ANCHORS[c.at] : undefined;
    return {
      ...c,
      x: c.x ?? a?.x ?? 0,
      y: c.y ?? a?.y ?? 0,
      z: c.z ?? a?.z ?? 0,
      fx: a?.fx,
      t: cueF(c.cue, 30 + i * 90),
    };
  });
  const numbered = resolved.filter((c) => typeof c.n === 'number');
  const legendOn = d.legend ?? numbered.length >= 3;
  const tilt = d.tilt ?? 52;
  const rot0 = d.rot ?? -12;
  const cx = legendOn ? 760 : W / 2;
  const cy = 470;
  // overview scale: fit the airside area (the landside edges may crop — it reads as a big diorama)
  const s0 = useMemo(() => {
    const pr = mkProj({fx: 0, fy: -210, s: 1, rot: rot0}, tilt, 0, 0);
    const box2: P2[] = [
      [-1000, -560],
      [1000, -560],
      [1000, 170],
      [-1000, 170],
    ];
    const corners = box2.map((q) => pr.P(q[0], q[1]));
    const xs = corners.map((q) => q[0]);
    const ys = corners.map((q) => q[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    return Math.min((legendOn ? 1330 : 1700) / w, 760 / h);
  }, [rot0, tilt, legendOn]);
  const overview: CamState = {fx: d.focus?.[0] ?? 0, fy: d.focus?.[1] ?? -210, s: s0, rot: rot0};

  // camera keyframes
  type Key = {t: number; cam: CamState};
  const keys: Key[] = [
    {t: 0, cam: {...overview, s: s0 * 0.86, rot: rot0 - 7}},
    {t: 2, cam: overview},
  ];
  for (const c of resolved) {
    if (c.overview) keys.push({t: c.t - 4, cam: overview});
    else if (c.zoom) keys.push({t: c.t - 4, cam: {fx: c.x, fy: c.y, s: s0 * c.zoom, rot: rot0 + (c.rot ?? 0)}});
  }
  keys.sort((a, b2) => a.t - b2.t);
  let cam: CamState = keys[0].cam;
  let lastT = 0;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.t) break;
    // bigger swings of the camera get more time
    const dur = i === 1 ? 44 : MOVE + Math.min(30, Math.abs(k.cam.rot - cam.rot) * 0.3);
    const u = interpolate(f, [k.t, k.t + dur], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
    // state at the start of this move = where the previous move had got to
    cam = {
      fx: lerp(cam.fx, k.cam.fx, u),
      fy: lerp(cam.fy, k.cam.fy, u),
      s: Math.exp(lerp(Math.log(cam.s), Math.log(k.cam.s), u)),
      rot: lerp(cam.rot, k.cam.rot, u),
    };
    lastT = k.t;
  }
  // continuous slow push + sway, so the frame is never static
  const hold = Math.max(0, f - lastT - MOVE);
  cam = {...cam, s: cam.s * (1 + Math.min(0.06, hold * 0.0006)), rot: cam.rot + Math.sin(f / 70) * 0.8};
  const pr = mkProj(cam, tilt, cx, cy);

  // which feature is being explained now?
  let active = -1;
  resolved.forEach((c, i) => {
    if (f >= c.t) active = i;
  });
  const act = active >= 0 ? resolved[active] : undefined;
  const fxOn = (name: string) => {
    let v = 0;
    resolved.forEach((c, i) => {
      if (c.fx === name && f >= c.t) v = i === active ? prog(f, c.t, 12) : Math.max(v, 0.35);
    });
    return v;
  };
  const edgeK = 0.45 + 0.55 * fxOn('edge');
  const appK = 0.5 + 0.5 * fxOn('approach');
  const papiK = 0.55 + 0.45 * fxOn('papi');
  const thrK = 0.5 + 0.5 * fxOn('thr');
  const taxiK = fxOn('taxi');
  const t = f / fps;

  const ground = useMemo(() => <GroundArt accent={b.accent} />, [b.accent]);

  // tile thickness (visible sides)
  const TH = 26;
  const tileSides: React.ReactNode[] = [];
  const tc: P2[] = [
    [TILE.x0, TILE.y0],
    [TILE.x1, TILE.y0],
    [TILE.x1, TILE.y1],
    [TILE.x0, TILE.y1],
  ];
  const tn: P2[] = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  for (let i = 0; i < 4; i++) {
    const a = tc[i];
    const c2 = tc[(i + 1) % 4];
    if (!pr.faces(tn[i][0], tn[i][1])) continue;
    tileSides.push(
      <polygon key={i} points={pts([pr.P(a[0], a[1], 0), pr.P(c2[0], c2[1], 0), pr.P(c2[0], c2[1], -TH), pr.P(a[0], a[1], -TH)])} fill={i % 2 ? C.tileSide2 : C.tileSide1} />,
    );
  }
  const tileShadow = (() => {
    const pp = tc.map((p) => pr.P(p[0] + 30, p[1] + 50, -TH - 10));
    return <polygon points={pts(pp)} fill="rgba(16,33,58,0.10)" style={{filter: 'blur(18px)'}} />;
  })();

  // buildings & 3D objects
  const shadows: React.ReactNode[] = [];
  const objs: Obj[] = [];
  const add = (r: {shadow: React.ReactNode; obj: Obj}) => {
    if (r.shadow) shadows.push(r.shadow);
    objs.push(r.obj);
  };
  add(box(pr, 'terminal', -320, -522, 760, 80, 0, 26, '#E9ECEF', {top: '#F7F8F9', south: '#A9C7E3'}));
  add(box(pr, 'terminal-roof', -150, -515, 420, 66, 26, 31, '#F1F2F4', {top: shade(b.accent, 0.55), shadow: false}));
  [-220, -60, 100, 260, 400].forEach((x, i) => add(box(pr, 'bridge' + i, x - 26, -442, 7, 34, 6, 12, '#C9CFD7', {shadow: false})));
  add(box(pr, 'tower-base', 505, -345, 30, 30, 0, 16, '#E4E2DD'));
  add(box(pr, 'tower-shaft', 513, -337, 14, 14, 16, 72, '#ECEAE5', {shadow: false}));
  add(box(pr, 'tower-cab', 507, -343, 26, 26, 72, 85, '#4F7F98', {top: '#F0F0EE', south: '#6FA2BC', shadow: false}));
  add(box(pr, 'tower-roof', 505, -345, 30, 30, 85, 88, '#F0F0EE', {shadow: false}));
  add(box(pr, 'fire', 600, -276, 92, 58, 0, 14, '#F1ECE6', {top: '#D9534F', south: '#F4F0EA'}));
  add(box(pr, 'firetruck1', 612, -210, 6, 13, 0, 5, '#D9363E', {shadow: false}));
  add(box(pr, 'firetruck2', 628, -210, 6, 13, 0, 5, '#D9363E', {shadow: false}));
  add(box(pr, 'hangar', -660, -545, 190, 104, 0, 36, '#DDE2E8', {top: '#EEF1F4', south: '#BCC5CF'}));
  add(box(pr, 'deice-truck', -722, -300, 14, 7, 0, 6, '#2F7DC1', {shadow: false}));
  add(box(pr, 'deice-boom', -716, -299, 3, 3, 6, 15, '#F2B705', {shadow: false}));
  add(box(pr, 'parking-deck', 300, -628, 130, 60, 0, 18, '#D3D6DB', {top: '#C4C8CE'}));
  add(box(pr, 'station', -560, -694, 160, 26, 0, 12, '#E8E2D8', {top: '#C9B79C'}));
  add(cylinder(pr, 'tank1', 700, -492, 24, 20, '#F4F5F6'));
  add(cylinder(pr, 'tank2', 760, -492, 24, 20, '#F4F5F6'));
  add(cylinder(pr, 'tank3', 730, -546, 24, 20, '#F4F5F6'));
  // trees as little 3D lollipops
  TREES.forEach((tr, i) => {
    const [gx, gy] = pr.P(tr.x, tr.y, 0);
    const [kx, ky] = pr.P(tr.x, tr.y, tr.r * 1.25);
    const rr = tr.r * pr.s;
    const [sx, sy] = pr.P(tr.x + SUN[0] * tr.r, tr.y + SUN[1] * tr.r, 0);
    shadows.push(<ellipse key={'ts' + i} cx={sx} cy={sy} rx={rr} ry={rr * pr.sa} fill="rgba(30,52,40,0.16)" />);
    objs.push({
      depth: pr.depth(tr.x, tr.y),
      el: (
        <g key={'t' + i}>
          <line x1={gx} y1={gy} x2={kx} y2={ky} stroke="#7A6A55" strokeWidth={Math.max(1, rr * 0.18)} />
          <circle cx={kx} cy={ky} r={rr} fill={i % 3 ? C.tree : C.treeDark} />
          <circle cx={kx - rr * 0.3} cy={ky - rr * 0.32} r={rr * 0.45} fill="rgba(255,255,255,0.22)" />
        </g>
      ),
    });
  });
  // windsock (wind from the west)
  {
    const wx = -690;
    const wy = 80;
    const H = 26;
    const flap = Math.sin(t * 5.2) * 0.8 + Math.sin(t * 9.1) * 0.4;
    const L = 19 + flap * 0.8;
    const seg = 5;
    const parts: React.ReactNode[] = [];
    for (let i = 0; i < seg; i++) {
      const u0 = i / seg;
      const u1 = (i + 1) / seg;
      const r0 = 3.6 - 1.9 * u0;
      const r1 = 3.6 - 1.9 * u1;
      const dz0 = -1.2 * u0 * u0 + flap * 0.25 * u0;
      const dz1 = -1.2 * u1 * u1 + flap * 0.25 * u1;
      const poly = [pr.P(wx + L * u0, wy, H + r0 + dz0), pr.P(wx + L * u1, wy, H + r1 + dz1), pr.P(wx + L * u1, wy, H - r1 + dz1), pr.P(wx + L * u0, wy, H - r0 + dz0)];
      parts.push(<polygon key={i} points={pts(poly)} fill={i % 2 ? '#FFFFFF' : '#F26B1D'} stroke="#B4501A" strokeWidth={0.4} />);
    }
    const [b0x, b0y] = pr.P(wx, wy, 0);
    const [b1x, b1y] = pr.P(wx, wy, H + 2.6);
    objs.push({
      depth: pr.depth(wx, wy),
      el: (
        <g key="windsock">
          <line x1={b0x} y1={b0y} x2={b1x} y2={b1y} stroke="#5B636D" strokeWidth={Math.max(1.2, pr.s * 0.9)} />
          {parts}
        </g>
      ),
    });
  }
  // parked aircraft at stands 1-4, one holding short for departure, GA aircraft
  const planeAt = (key: string, x: number, y: number, hdg: number, z = 0, scale = 1) => {
    const lift = pr.s * z * pr.ca;
    return {
      shadowEl: (
        <g key={key + 's'} transform={`${pr.M()} translate(${x + SUN[0] * z} ${y + SUN[1] * z}) rotate(${hdg})`} opacity={z > 0 ? Math.max(0.35, 1 - z / 140) : 1}>
          <g transform="translate(1.5 1.2)">
            <PlaneTop accent={b.accent} shadowOnly scale={scale} />
          </g>
        </g>
      ),
      obj: {
        depth: pr.depth(x, y) + (z > 0 ? 400 : 0),
        el: (
          <g key={key} transform={`translate(0 ${-lift})`}>
            <g transform={`${pr.M()} translate(${x} ${y}) rotate(${hdg})`}>
              <PlaneTop accent={b.accent} scale={scale} />
            </g>
          </g>
        ),
      } as Obj,
    };
  };
  const planes = [
    planeAt('p1', -220, -362, -90),
    planeAt('p2', -60, -362, -90),
    planeAt('p3', 100, -362, -90),
    planeAt('p4', 260, -362, -90),
    planeAt('hold', -780, -112, 90),
  ];
  const landT = d.plane ? (f - cueF(d.plane.cue, 0)) / fps : -1;
  const ls = d.plane ? landingState(landT, d.plane.speed ?? 1) : null;
  if (ls) planes.push(planeAt('arrival', ls.x, ls.y, ls.hdg, ls.z, 1.25));
  planes.forEach((p) => {
    shadows.push(p.shadowEl);
    objs.push(p.obj);
  });
  // GA aircraft
  objs.push({
    depth: pr.depth(-520, -400),
    el: (
      <g key="ga" transform={`${pr.M()}`}>
        <g transform="translate(-528 -400) rotate(-90)">
          <SmallPlane />
        </g>
        <g transform="translate(-500 -405) rotate(-100)">
          <SmallPlane />
        </g>
      </g>
    ),
  });
  objs.sort((a, b2) => a.depth - b2.depth);

  // lights (screen space so they stay round and glow)
  const lightR = Math.max(1.5, pr.s * 1.7);
  const lights: React.ReactNode[] = [];
  const glow = (key: string, x: number, y: number, col: string, k: number, size = 1) => {
    const [sx, sy] = pr.P(x, y, 0.5);
    lights.push(
      <g key={key}>
        <circle cx={sx} cy={sy} r={lightR * 3.2 * size} fill={col} opacity={0.18 * k} />
        <circle cx={sx} cy={sy} r={lightR * size} fill={col} opacity={Math.min(1, 0.55 + 0.45 * k)} />
      </g>,
    );
  };
  for (let x = -780; x <= 780; x += 40) {
    glow(`el${x}`, x, -33, '#FFF1C7', edgeK * (0.85 + 0.15 * Math.sin(t * 6 + x)));
    glow(`er${x}`, x, 33, '#FFF1C7', edgeK * (0.85 + 0.15 * Math.sin(t * 6 + x + 1)));
  }
  for (let y = -27; y <= 27; y += 6) {
    glow(`th${y}`, -803, y, '#3BD16F', thrK);
    glow(`re${y}`, 803, y, '#FF4D4D', thrK * 0.8);
  }
  // approach lights + sequenced flashers ("the rabbit")
  const rabbit = Math.floor((t * 2) % 1 * 6);
  for (let i = 0; i < 6; i++) {
    const x = -1040 + i * 30;
    for (let j = -2; j <= 2; j++) glow(`ap${i}${j}`, x, j * 2.4, '#FFFFFF', appK * 0.8, 0.8);
    if (i === rabbit) glow(`rb${i}`, x, 0, '#FFFFFF', appK * 1.4, 2.4);
  }
  for (let y = -45; y <= 45; y += 6) if (Math.abs(y) > 6) glow(`cb${y}`, -950, y, '#FFFFFF', appK * 0.8, 0.8);
  // PAPI: two red (nearest the runway) + two white = on the glide path
  const papiEls: React.ReactNode[] = [];
  for (let i = 0; i < 4; i++) {
    const y = -48 - i * 9;
    const bx = box(pr, 'papi' + i, -564, y - 3.5, 8, 7, 0, 4, '#3E4652', {shadow: false});
    papiEls.push(bx.obj.el);
    glow(`pp${i}`, -560, y, i < 2 ? '#FF3B30' : '#FFFFFF', papiK, 2.1);
  }
  // taxiway edge lights (blue) when taxiways are being explained
  if (taxiK > 0) {
    for (let x = -760; x <= 760; x += 60) {
      glow(`tb${x}`, x, -183, '#3B82F6', taxiK, 0.9);
      glow(`tc${x}`, x, -157, '#3B82F6', taxiK, 0.9);
    }
  }

  // highlight ring on the ground under the active feature
  const ring =
    act && !act.overview && typeof act.n === 'number' ? (
      <g transform={pr.M()}>
        {[0, 1].map((k) => {
          const ph = ((f - act.t) / 30 + k * 0.5) % 1;
          const R = (act.ring ?? 34) * (0.6 + ph * 0.9);
          return <circle key={k} cx={act.x} cy={act.y} r={R} fill="none" stroke={b.accent} strokeWidth={3.2 / pr.s} opacity={(1 - ph) * prog(f, act.t, 8)} />;
        })}
        <circle cx={act.x} cy={act.y} r={(act.ring ?? 34) * 0.55} fill={alpha(b.accent, 0.12 * prog(f, act.t, 8))} />
      </g>
    ) : null;

  // badges (all numbered callouts so far) + the active label
  const badges = numbered
    .filter((c) => f >= c.t)
    .map((c) => {
      const [px, py] = pr.P(c.x, c.y, c.z);
      const isAct = act === c;
      const p = spring({frame: f - c.t, fps, config: {damping: 13, stiffness: 190, mass: 0.6}});
      const up = py > 260;
      const stem = isAct ? 92 : 46;
      const bx = px;
      const by = up ? py - stem : py + stem;
      const R = isAct ? 30 : 21;
      return {c, px, py, bx, by, isAct, p, R, up};
    });

  // keep numbered badges from piling on top of each other (simple relaxation in screen space)
  for (let it = 0; it < 40; it++) {
    for (let i = 0; i < badges.length; i++) {
      for (let j = i + 1; j < badges.length; j++) {
        const A = badges[i];
        const B = badges[j];
        let dx = B.bx - A.bx;
        let dy = B.by - A.by;
        let dist = Math.hypot(dx, dy);
        const minD = A.R + B.R + 12;
        if (dist >= minD) continue;
        if (dist < 0.01) {
          dx = 1;
          dy = 0;
          dist = 1;
        }
        const push = (minD - dist) / dist;
        const wa = A.isAct ? 0 : B.isAct ? 1 : 0.5;
        const wb = 1 - wa;
        A.bx -= dx * push * wa;
        A.by -= dy * push * wa * 0.6;
        B.bx += dx * push * wb;
        B.by += dy * push * wb * 0.6;
      }
    }
  }
  badges.forEach((q) => {
    q.bx = Math.max(q.R + 8, Math.min(W - q.R - 8, q.bx));
    q.by = Math.max(q.R + 8, Math.min(SAFE_BOTTOM - q.R, q.by));
  });

  const ttl = prog(f, 4, 14);
  return (
    <AbsoluteFill style={{background: '#F3F6F0'}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 70% 70% at 45% 45%, #FFFFFF 0%, rgba(255,255,255,0) 70%)'}} />
      <svg width={W} height={1080} viewBox={`0 0 ${W} 1080`} style={{position: 'absolute', inset: 0}}>
        {tileShadow}
        {tileSides}
        <g transform={pr.M()}>{ground}</g>
        {ring}
        {shadows}
        {lights}
        {papiEls}
        {objs.map((o) => o.el)}
        {/* leader lines + badges */}
        {badges.map(({c, px, py, bx, by, isAct, p, R}) => (
          <g key={'b' + c.n} opacity={Math.min(1, p * 1.4)}>
            <line x1={px} y1={py} x2={lerp(px, bx, p)} y2={lerp(py, by, p)} stroke={isAct ? b.accent : '#10213A'} strokeWidth={isAct ? 3 : 2} opacity={isAct ? 1 : 0.55} />
            <circle cx={px} cy={py} r={isAct ? 6 : 4} fill={isAct ? b.accent : '#10213A'} stroke="#FFFFFF" strokeWidth={2} />
            <g transform={`translate(${lerp(px, bx, p)} ${lerp(py, by, p)}) scale(${p})`}>
              <circle r={R + 4} fill="#FFFFFF" opacity={0.95} />
              <circle r={R} fill={isAct ? b.accent : '#10213A'} />
              <text textAnchor="middle" dominantBaseline="central" y={1} fontFamily={F.head} fontWeight={800} fontSize={isAct ? 30 : 21} fill="#FFFFFF">
                {c.n}
              </text>
            </g>
          </g>
        ))}
      </svg>
      {/* active label pill */}
      {badges
        .filter((x) => x.isAct)
        .map(({c, bx, by, R}) => {
          const p = spring({frame: f - c.t - 4, fps, config: {damping: 15, stiffness: 170, mass: 0.6}});
          const right = bx < (legendOn ? 1080 : 1300);
          return (
            <div
              key={'lab' + c.n}
              style={{
                position: 'absolute',
                left: right ? bx + R + 14 : undefined,
                right: right ? undefined : W - (bx - R - 14),
                top: by - 34,
                transform: `translateX(${(1 - p) * (right ? -24 : 24)}px)`,
                opacity: Math.min(1, p * 1.4),
                maxWidth: 560,
              }}
            >
              <div
                style={{
                  padding: '12px 22px',
                  borderRadius: 16,
                  background: '#FFFFFF',
                  boxShadow: '0 14px 34px rgba(16,33,58,0.18), 0 2px 6px rgba(16,33,58,0.08)',
                  borderLeft: `6px solid ${b.accent}`,
                }}
              >
                <div style={{fontFamily: F.head, fontWeight: 800 as any, fontSize: 34, lineHeight: 1.1, color: '#10213A', whiteSpace: 'nowrap'}}>{c.label}</div>
                {c.sub ? (
                  <div style={{fontFamily: F.body, fontWeight: 550 as any, fontSize: 24, lineHeight: 1.3, color: alpha('#10213A', 0.66), marginTop: 4}}>
                    <Rich text={c.sub} />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      {/* title */}
      {d.title ? (
        <AbsoluteFill style={{background: 'radial-gradient(ellipse 760px 260px at 300px 80px, rgba(247,249,245,0.97) 0%, rgba(247,249,245,0.85) 45%, rgba(247,249,245,0) 100%)', opacity: ttl}} />
      ) : null}
      {d.title ? (
        <div style={{position: 'absolute', left: 90, top: 56, opacity: ttl, transform: `translateY(${(1 - ttl) * 14}px)`}}>
          {d.kicker ? <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 22, letterSpacing: '0.2em', textTransform: 'uppercase', color: b.accent, marginBottom: 6}}>{d.kicker}</div> : null}
          <div style={{fontFamily: F.head, fontWeight: 850 as any, fontSize: 50, letterSpacing: '-0.03em', color: '#10213A', textShadow: '0 2px 0 rgba(255,255,255,0.8)'}}>
            <Rich text={d.title} />
          </div>
        </div>
      ) : null}
      {/* legend */}
      {legendOn ? (
        <div
          style={{
            position: 'absolute',
            right: 70,
            top: 120,
            width: 400,
            padding: '22px 22px 12px',
            borderRadius: 26,
            background: 'rgba(255,255,255,0.93)',
            boxShadow: '0 20px 50px rgba(16,33,58,0.12)',
            opacity: prog(f, 6, 14),
            transform: `translateX(${(1 - prog(f, 6, 18)) * 40}px)`,
          }}
        >
          <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 20, letterSpacing: '0.2em', textTransform: 'uppercase', color: alpha('#10213A', 0.55), marginBottom: 12}}>
            {d.legendTitle ?? 'Legend'}
          </div>
          {numbered.map((c) => {
            const on = f >= c.t;
            const isAct = act === c;
            const p = prog(f, c.t, 10);
            return (
              <div
                key={'lg' + c.n}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '7px 10px',
                  marginBottom: 4,
                  borderRadius: 12,
                  background: isAct ? alpha(b.accent, 0.12) : 'transparent',
                  opacity: on ? 0.35 + 0.65 * p : 0.18,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    flex: '0 0 auto',
                    background: on ? (isAct ? b.accent : '#10213A') : alpha('#10213A', 0.25),
                    color: '#FFFFFF',
                    fontFamily: F.head,
                    fontWeight: 800 as any,
                    fontSize: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {c.n}
                </div>
                <div style={{fontFamily: F.head, fontWeight: isAct ? 800 : 650, fontSize: numbered.length > 9 ? 22 : 25, color: '#10213A', lineHeight: 1.15}}>
                  {on ? c.label : '· · ·'}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
