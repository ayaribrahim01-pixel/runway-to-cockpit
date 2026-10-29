import React from 'react';
import {geoContains} from 'd3-geo';
import {feature} from 'topojson-client';
import land from 'world-atlas/land-110m.json';
import {alpha, F, isLight, useBrand} from '../theme';

// Dotted globe drawn from land outlines only (no political borders), orthographic projection.

const R2D = 180 / Math.PI;
const D2R = Math.PI / 180;
let DOTS: [number, number][] | null = null;

export function landDots(step = 2.0): [number, number][] {
  if (DOTS) return DOTS;
  const geo = feature(land as any, (land as any).objects.land) as any;
  const pts: [number, number][] = [];
  for (let lat = -56; lat <= 80; lat += step) {
    const lonStep = step / Math.max(0.2, Math.cos(lat * D2R));
    for (let lon = -180; lon < 180; lon += lonStep) {
      if (geoContains(geo, [lon, lat])) pts.push([lon, lat]);
    }
  }
  DOTS = pts;
  return pts;
}

type P = {x: number; y: number; z: number; vis: boolean};

export function project(lon: number, lat: number, lon0: number, lat0: number, R: number, cx: number, cy: number, h = 0): P {
  const l = (lon - lon0) * D2R;
  const p = lat * D2R;
  const p0 = lat0 * D2R;
  const z = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
  const x = Math.cos(p) * Math.sin(l);
  const y = Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l);
  const k = 1 + h;
  const r2 = (x * k) ** 2 + (y * k) ** 2;
  return {x: cx + R * k * x, y: cy - R * k * y, z, vis: z > 0 || r2 > 1};
}

const vec = (lon: number, lat: number) => {
  const l = lon * D2R;
  const p = lat * D2R;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
};

export function greatCircle(a: [number, number], b: [number, number], n = 64): [number, number, number][] {
  const va = vec(a[0], a[1]);
  const vb = vec(b[0], b[1]);
  const dot = Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const om = Math.acos(dot);
  const lift = Math.min(0.32, 0.06 + om * 0.16);
  const out: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let v: number[];
    if (om < 1e-6) v = va;
    else {
      const s1 = Math.sin((1 - t) * om) / Math.sin(om);
      const s2 = Math.sin(t * om) / Math.sin(om);
      v = [va[0] * s1 + vb[0] * s2, va[1] * s1 + vb[1] * s2, va[2] * s1 + vb[2] * s2];
    }
    const lat = Math.asin(Math.max(-1, Math.min(1, v[2]))) * R2D;
    const lon = Math.atan2(v[1], v[0]) * R2D;
    out.push([lon, lat, lift * Math.sin(Math.PI * t)]);
  }
  return out;
}

export type GlobeMarker = {
  lon: number;
  lat: number;
  label?: string;
  appear: number;
  color?: string;
  big?: boolean;
  labelPos?: 'r' | 'l' | 'b' | 'bl' | 'tl';
};
export type GlobeArc = {from: [number, number]; to: [number, number]; progress: number; color?: string; fade?: number};

export const Globe: React.FC<{
  cx: number;
  cy: number;
  R: number;
  lon0: number;
  lat0: number;
  markers?: GlobeMarker[];
  arcs?: GlobeArc[];
  frame: number;
  dotScale?: number;
  opacity?: number;
  labelSize?: number;
}> = ({cx, cy, R, lon0, lat0, markers = [], arcs = [], frame, dotScale = 1, opacity = 1, labelSize = 30}) => {
  const b = useBrand();
  const light = isLight(b);
  const dotCol = light ? b.land ?? '#2B5C9A' : alpha(b.sky, 0.95);
  const dots = landDots();
  const dotR = Math.max(1.6, (R / 210) * 1.9) * dotScale;
  const circles: React.ReactNode[] = [];
  for (let i = 0; i < dots.length; i++) {
    const [lon, lat] = dots[i];
    const p = project(lon, lat, lon0, lat0, R, cx, cy);
    if (p.z <= 0.02) continue;
    circles.push(<circle key={i} cx={p.x} cy={p.y} r={dotR * (0.55 + 0.45 * p.z)} opacity={0.18 + 0.72 * p.z} />);
  }
  return (
    <svg width="100%" height="100%" style={{position: 'absolute', inset: 0, overflow: 'visible', opacity}}>
      <defs>
        <radialGradient id="gl-body" cx="45%" cy="38%" r="65%">
          <stop offset="0%" stopColor={light ? '#FFFFFF' : alpha(b.bg2, 1)} />
          <stop offset="75%" stopColor={light ? b.ocean ?? '#EAF2FB' : alpha(b.bg, 1)} />
          <stop offset="100%" stopColor={light ? alpha(b.sky, 0.16) : alpha(b.bg, 1)} />
        </radialGradient>
        <radialGradient id="gl-halo" cx="50%" cy="50%" r="50%">
          <stop offset="78%" stopColor={alpha(b.sky, 0)} />
          <stop offset="88%" stopColor={alpha(b.sky, light ? 0.12 : 0.16)} />
          <stop offset="100%" stopColor={alpha(b.sky, 0)} />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={R * 1.18} fill="url(#gl-halo)" />
      <circle cx={cx} cy={cy} r={R} fill="url(#gl-body)" stroke={alpha(b.sky, light ? 0.3 : 0.25)} strokeWidth={1.5} />
      <g fill={dotCol}>{circles}</g>
      {arcs.map((a, ai) => {
        if (!a.from || !a.to) return null;
        const pts = greatCircle(a.from, a.to, 80);
        const upto = Math.max(0, Math.min(1, a.progress)) * (pts.length - 1);
        const segs: string[] = [];
        let cur = '';
        let head: P | null = null;
        for (let i = 0; i <= Math.floor(upto); i++) {
          const [lon, lat, h] = pts[i];
          const p = project(lon, lat, lon0, lat0, R, cx, cy, h);
          head = p;
          if (p.vis) cur += (cur ? ' L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
          else if (cur) {
            segs.push(cur);
            cur = '';
          }
        }
        if (cur) segs.push(cur);
        const col = a.color ?? b.accent;
        return (
          <g key={ai} opacity={a.fade ?? 1}>
            {segs.map((d, i) => (
              <path key={i} d={d} fill="none" stroke={col} strokeWidth={Math.max(2.5, R / 120)} strokeLinecap="round" />
            ))}
            {a.progress > 0 && a.progress < 1 && head && head.vis ? <circle cx={head.x} cy={head.y} r={Math.max(5, R / 60)} fill={b.ink} /> : null}
          </g>
        );
      })}
      {markers.map((m, i) => {
        if (m.appear <= 0) return null;
        const p = project(m.lon, m.lat, lon0, lat0, R, cx, cy);
        if (p.z <= 0.05) return null;
        const col = m.color ?? b.accent;
        const pulse = (frame % 45) / 45;
        const s = m.big ? 1.4 : 1;
        const left = m.labelPos === 'l' || m.labelPos === 'bl' || m.labelPos === 'tl';
        const below = m.labelPos === 'b' || m.labelPos === 'bl';
        return (
          <g key={i} opacity={Math.min(1, m.appear) * Math.min(1, p.z * 3)}>
            <circle cx={p.x} cy={p.y} r={(10 + pulse * 26) * s} fill="none" stroke={col} strokeWidth={2} opacity={1 - pulse} />
            <circle cx={p.x} cy={p.y} r={8 * s * m.appear} fill={col} stroke={light ? '#FFFFFF' : b.bg} strokeWidth={3} />
            {m.label ? (
              <g transform={`translate(${p.x + (left ? -18 : 18) * s}, ${p.y + (below ? 18 + labelSize * s : -18 * s)})`}>
                <text
                  x={0}
                  y={0}
                  textAnchor={left ? 'end' : 'start'}
                  fill={b.ink}
                  fontFamily={F.head}
                  fontWeight={600}
                  fontSize={labelSize * s}
                  style={{paintOrder: 'stroke', stroke: light ? '#FFFFFF' : b.bg, strokeWidth: 8, strokeLinejoin: 'round'}}
                >
                  {m.label}
                </text>
              </g>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
};

/** Interpolate the globe's facing point between focus keyframes [{f, lon, lat}] with easing, plus a slow drift. */
export function focusAt(frame: number, keys: {f: number; lon: number; lat: number}[], drift = 0.012) {
  if (!keys.length) return {lon: 40 + frame * drift * 3, lat: 15};
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const span = 38;
  let lon = keys[0].lon;
  let lat = keys[0].lat;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const k = keys[i];
    // begin turning slightly before the cue so the place is in view as it is named
    const t = Math.max(0, Math.min(1, (frame - (k.f - 12)) / span));
    if (t <= 0) break;
    let dl = k.lon - a.lon;
    if (dl > 180) dl -= 360;
    if (dl < -180) dl += 360;
    lon = a.lon + dl * ease(t);
    lat = a.lat + (k.lat - a.lat) * ease(t);
  }
  return {lon: lon - frame * drift, lat};
}
