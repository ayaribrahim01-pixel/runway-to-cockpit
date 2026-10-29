import {getLength, getPointAtLength} from '@remotion/paths';
import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {CLAMP, EASE, EASE_IN_OUT, lerp} from '../anim';
import {alpha, F, useBrand} from '../theme';
import type {Scene} from '../types';

// v2 motion toolkit: camera drift, scene transitions, hand-drawn annotations.

// ─── camera drift ─────────────────────────────────────────────────────────────────────────
// [scale from, scale to, x px, y px]
const MOVES: [number, number, number, number][] = [
  [1, 1.05, 0, 0],
  [1.05, 1, 0, 0],
  [1.03, 1.06, -28, 0],
  [1.03, 1.06, 28, 0],
  [1.02, 1.055, 0, -18],
  [1.06, 1.02, 16, 10],
];

/** Slow push / pull / pan over the whole beat, so nothing on screen is ever static. */
export const Drift: React.FC<{variant?: number; dur: number; children: React.ReactNode}> = ({variant = 0, dur, children}) => {
  const f = useCurrentFrame();
  const m = MOVES[((variant % MOVES.length) + MOVES.length) % MOVES.length];
  const p = interpolate(f, [0, Math.max(1, dur)], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  const s = lerp(m[0], m[1], p);
  return (
    <AbsoluteFill style={{transform: `translate(${m[2] * p}px, ${m[3] * p}px) scale(${s})`, transformOrigin: '50% 46%'}}>{children}</AbsoluteFill>
  );
};

// ─── transitions ──────────────────────────────────────────────────────────────────────────
export type TransType = 'slideL' | 'slideR' | 'zoom' | 'up' | 'iris' | 'wipe' | 'flash' | 'cut' | 'fade';

const D = 10;

/**
 * Entry transition at the start of a beat and the matching exit at its end.
 * The beat's Sequence lasts dur + overlap frames; the exit plays in the last `overlap` frames, under the next beat's entry.
 */
export const Trans: React.FC<{tin?: string; tout?: string; dur: number; overlap: number; children: React.ReactNode}> = ({tin = 'fade', tout, dur, overlap, children}) => {
  const f = useCurrentFrame();
  const {width: W} = useVideoConfig();
  const pin = interpolate(f, [0, D], [0, 1], {...CLAMP, easing: EASE});
  const q = overlap > 0 ? interpolate(f, [dur, dur + overlap], [0, 1], {...CLAMP, easing: EASE_IN_OUT}) : 0;

  let tx = 0;
  let ty = 0;
  let sc = 1;
  let blur = 0;
  let op = 1;
  let clip: string | undefined;
  let flash = 0;

  switch (tin) {
    case 'slideL':
      tx += (1 - pin) * 0.55 * W;
      blur += (1 - pin) * 10;
      break;
    case 'slideR':
      tx -= (1 - pin) * 0.55 * W;
      blur += (1 - pin) * 10;
      break;
    case 'zoom':
      sc *= lerp(1.22, 1, pin);
      blur += (1 - pin) * 12;
      op *= interpolate(f, [0, 6], [0, 1], CLAMP);
      break;
    case 'up':
      ty += (1 - pin) * 220;
      op *= interpolate(f, [0, 6], [0, 1], CLAMP);
      break;
    case 'iris': {
      const r = interpolate(f, [0, 14], [0, 150], {...CLAMP, easing: EASE_IN_OUT});
      clip = `circle(${r}% at 50% 50%)`;
      break;
    }
    case 'wipe': {
      const l = interpolate(f, [0, 12], [100, 0], {...CLAMP, easing: EASE_IN_OUT});
      clip = `inset(0 0 0 ${l}%)`;
      break;
    }
    case 'flash':
      flash = interpolate(f, [0, 3, 12], [0.95, 0.8, 0], CLAMP);
      break;
    case 'cut':
      break;
    case 'fade':
    default:
      op *= interpolate(f, [0, 8], [0, 1], CLAMP);
  }

  if (q > 0) {
    switch (tout) {
      case 'slideL':
        tx -= q * 0.35 * W;
        blur += q * 8;
        break;
      case 'slideR':
        tx += q * 0.35 * W;
        blur += q * 8;
        break;
      case 'zoom':
        sc *= 1 + 0.12 * q;
        blur += q * 8;
        op *= 1 - q;
        break;
      case 'up':
        ty -= q * 120;
        break;
      case 'fade':
        op *= 1 - q;
        break;
      default:
        break;
    }
  }

  const style: React.CSSProperties = {
    transform: tx || ty || sc !== 1 ? `translate(${tx}px, ${ty}px) scale(${sc})` : undefined,
    filter: blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : undefined,
    opacity: op,
    clipPath: clip,
  };
  return (
    <AbsoluteFill style={style}>
      {children}
      {flash > 0 ? <AbsoluteFill style={{background: '#FFFFFF', opacity: flash}} /> : null}
    </AbsoluteFill>
  );
};

// ─── hand-drawn annotation primitives ─────────────────────────────────────────────────────

/** deterministic wobble so marker lines look hand-drawn */
const wob = (i: number, seed: number) => Math.sin(i * 12.9898 + seed * 78.233) * 0.5 + Math.sin(i * 4.1 + seed) * 0.5;

/** slightly irregular closed loop around a box (marker circle) */
export function wobblePath(cx: number, cy: number, rx: number, ry: number, seed = 1, turns = 1.08) {
  const n = 48;
  let d = '';
  for (let i = 0; i <= n * turns; i++) {
    const a = -Math.PI * 0.62 + (i / n) * Math.PI * 2;
    const k = 1 + wob(i, seed) * 0.035 + (i / n) * 0.03;
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k;
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
  }
  return d.trim();
}

/** perfect circle path (for clean callout rings) */
export function circlePath(cx: number, cy: number, r: number) {
  return `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0`;
}

/** Draws an SVG path on over `dur` frames from `at`, optionally with a pen tip. */
export const DrawPath: React.FC<{
  d: string;
  at: number;
  dur?: number;
  color: string;
  width?: number;
  pen?: boolean;
  opacity?: number;
  dash?: string;
  fill?: string;
  linecap?: 'round' | 'butt' | 'square';
}> = ({d, at, dur = 18, color, width = 6, pen = false, opacity = 1, dash, fill = 'none', linecap = 'round'}) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [at, at + Math.max(1, dur)], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  const len = useMemo(() => {
    try {
      return getLength(d);
    } catch {
      return 1000;
    }
  }, [d]);
  if (p <= 0) return null;
  const tip = pen && p < 1 ? getPointAtLength(d, len * p) : null;
  return (
    <g opacity={opacity}>
      <path
        d={d}
        fill={fill}
        stroke={color}
        strokeWidth={width}
        strokeLinecap={linecap}
        strokeLinejoin="round"
        strokeDasharray={dash ?? `${len} ${len}`}
        strokeDashoffset={dash ? undefined : len * (1 - p)}
      />
      {tip ? <circle cx={tip.x} cy={tip.y} r={width * 0.9} fill={color} /> : null}
    </g>
  );
};

/** A felt-tip marker stroke: slightly translucent, thick, rounded. */
export const MarkerPen: React.FC<{d: string; at: number; dur?: number; color?: string; width?: number}> = ({d, at, dur = 16, color, width = 9}) => {
  const b = useBrand();
  return <DrawPath d={d} at={at} dur={dur} color={color ?? b.accent} width={width} opacity={0.92} pen />;
};

/** Curved arrow from (x1,y1) to (x2,y2) with a two-stroke head. */
export const Arrow: React.FC<{x1: number; y1: number; x2: number; y2: number; at: number; dur?: number; color?: string; width?: number; bend?: number; head?: number}> = ({
  x1,
  y1,
  x2,
  y2,
  at,
  dur = 16,
  color,
  width = 6,
  bend = 0.18,
  head = 26,
}) => {
  const b = useBrand();
  const c = color ?? b.accent;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const cx = mx - dy * bend;
  const cy = my + dx * bend;
  const d = `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
  // head direction = tangent at the end
  const tx = x2 - cx;
  const ty = y2 - cy;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl;
  const uy = ty / tl;
  const a = 0.5;
  const h1 = `M${x2},${y2} L${x2 - head * (ux * Math.cos(a) - uy * Math.sin(a))},${y2 - head * (uy * Math.cos(a) + ux * Math.sin(a))}`;
  const h2 = `M${x2},${y2} L${x2 - head * (ux * Math.cos(-a) - uy * Math.sin(-a))},${y2 - head * (uy * Math.cos(-a) + ux * Math.sin(-a))}`;
  return (
    <g>
      <DrawPath d={d} at={at} dur={dur} color={c} width={width} />
      <DrawPath d={h1} at={at + dur - 2} dur={6} color={c} width={width} />
      <DrawPath d={h2} at={at + dur - 1} dur={6} color={c} width={width} />
    </g>
  );
};

/** Marker highlight that sweeps in behind text. */
export const Highlight: React.FC<{at: number; color?: string; children: React.ReactNode; dur?: number}> = ({at, color, children, dur = 12}) => {
  const f = useCurrentFrame();
  const b = useBrand();
  const p = interpolate(f, [at, at + dur], [0, 1], {...CLAMP, easing: EASE});
  return (
    <span style={{position: 'relative', display: 'inline-block'}}>
      <span
        style={{
          position: 'absolute',
          left: '-0.08em',
          right: '-0.08em',
          top: '52%',
          height: '42%',
          background: alpha(color ?? b.accent, 0.26),
          borderRadius: '0.12em',
          transform: `scaleX(${p}) skewX(-8deg)`,
          transformOrigin: 'left center',
        }}
      />
      <span style={{position: 'relative'}}>{children}</span>
    </span>
  );
};

/** Little burst of sparks (a "ding" moment). */
export const Sparkles: React.FC<{x: number; y: number; at: number; color?: string; size?: number; n?: number}> = ({x, y, at, color, size = 70, n = 10}) => {
  const f = useCurrentFrame();
  const b = useBrand();
  const t = f - at;
  if (t < 0 || t > 26) return null;
  const p = t / 26;
  const c = color ?? b.accent;
  return (
    <g>
      {Array.from({length: n}).map((_, i) => {
        const a = (i / n) * Math.PI * 2 + 0.3;
        const r0 = size * (0.25 + 0.75 * p);
        const r1 = r0 + size * 0.28 * (1 - p);
        return (
          <line
            key={i}
            x1={x + Math.cos(a) * r0}
            y1={y + Math.sin(a) * r0}
            x2={x + Math.cos(a) * r1}
            y2={y + Math.sin(a) * r1}
            stroke={c}
            strokeWidth={5 * (1 - p) + 1}
            strokeLinecap="round"
            opacity={1 - p}
          />
        );
      })}
    </g>
  );
};

/** Full-frame SVG layer for annotations. */
export const Ann: React.FC<{children: React.ReactNode}> = ({children}) => {
  const {width: W, height: H} = useVideoConfig();
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none'}}>
      {children}
    </svg>
  );
};

export type AnnSpec = {
  kind: 'circle' | 'arrow' | 'underline' | 'box' | 'label';
  cue?: number;
  at?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  r?: number;
  x2?: number;
  y2?: number;
  text?: string;
  color?: string;
};

/** Script-driven annotations: [{kind:'circle', x, y, w, h, cue: 1}, {kind:'arrow', x, y, x2, y2, cue: 2}, ...] */
export const Annotations: React.FC<{scene: Scene; specs?: AnnSpec[]}> = ({scene, specs}) => {
  const b = useBrand();
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (!specs?.length) return null;
  const when = (s: AnnSpec) => (typeof s.cue === 'number' && scene.cues?.[s.cue] !== undefined ? scene.cues[s.cue] : s.at ?? 10);
  return (
    <Ann>
      {specs.map((s, i) => {
        const at = when(s);
        const c = s.color ?? b.accent;
        const x = s.x ?? 0;
        const y = s.y ?? 0;
        switch (s.kind) {
          case 'circle':
            return <MarkerPen key={i} d={wobblePath(x + (s.w ?? 200) / 2, y + (s.h ?? 80) / 2, (s.w ?? 200) / 2 + 22, (s.h ?? 80) / 2 + 18, i + 1)} at={at} color={c} />;
          case 'arrow':
            return <Arrow key={i} x1={x} y1={y} x2={s.x2 ?? x + 120} y2={s.y2 ?? y} at={at} color={c} />;
          case 'underline': {
            const w = s.w ?? 300;
            const d = `M${x},${y} C${x + w * 0.3},${y + 6} ${x + w * 0.7},${y - 5} ${x + w},${y + 3}`;
            return <MarkerPen key={i} d={d} at={at} color={c} width={8} />;
          }
          case 'box':
            return <DrawPath key={i} d={`M${x},${y} h${s.w ?? 200} v${s.h ?? 100} h${-(s.w ?? 200)} Z`} at={at} color={c} width={5} dash="14 10" />;
          case 'label': {
            const p = spring({frame: f - at, fps, config: {damping: 14, stiffness: 180, mass: 0.6}});
            if (f < at) return null;
            return (
              <foreignObject key={i} x={x - 300} y={y - 40} width={600} height={80}>
                <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: 80}}>
                  <div
                    style={{
                      transform: `scale(${p})`,
                      padding: '10px 22px',
                      borderRadius: 14,
                      background: c,
                      color: '#FFFFFF',
                      fontFamily: F.head,
                      fontWeight: 750 as any,
                      fontSize: 30,
                      boxShadow: '0 10px 24px rgba(16,33,58,0.18)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.text}
                  </div>
                </div>
              </foreignObject>
            );
          }
          default:
            return null;
        }
      })}
    </Ann>
  );
};
