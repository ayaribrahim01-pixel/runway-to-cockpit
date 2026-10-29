import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {cue, prog, rise} from '../anim';
import {Globe, focusAt} from '../components/Globe';
import {alpha, F, isLight, Rich, shadow, useBrand} from '../theme';
import type {Scene} from '../types';

export const PADX = 140;

export const SceneTitle: React.FC<{
  kicker?: string;
  title?: string;
  f: number;
  at?: number;
  size?: number;
  maxWidth?: number;
  top?: number;
  left?: number;
  align?: 'left' | 'center';
}> = ({kicker, title, f, at = 0, size = 66, maxWidth = 1360, top = 104, left = PADX, align = 'left'}) => {
  const b = useBrand();
  if (!kicker && !title) return null;
  const centered = align === 'center';
  return (
    <div
      style={{
        position: 'absolute',
        left: centered ? 0 : left,
        right: centered ? 0 : undefined,
        top,
        maxWidth: centered ? undefined : maxWidth,
        textAlign: align,
        display: 'flex',
        flexDirection: 'column',
        alignItems: centered ? 'center' : 'flex-start',
      }}
    >
      {kicker ? (
        <div
          style={{
            ...rise(f, at, 20),
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            fontFamily: F.head,
            fontWeight: 600,
            fontSize: 24,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: b.accent,
            marginBottom: 16,
          }}
        >
          <span style={{width: 34 * prog(f, at, 20), height: 3, background: b.accent, borderRadius: 2, display: 'inline-block'}} />
          {kicker}
        </div>
      ) : null}
      {title ? (
        <div
          style={{
            ...rise(f, at + 4, 30, 22),
            fontFamily: F.head,
            fontWeight: 700,
            fontSize: size,
            lineHeight: 1.08,
            color: b.ink,
            letterSpacing: '-0.015em',
            maxWidth: centered ? 1500 : maxWidth,
            textWrap: 'balance' as any,
          }}
        >
          <Rich text={title} />
        </div>
      ) : null}
    </div>
  );
};

export const Glass: React.FC<{style?: React.CSSProperties; active?: boolean; children?: React.ReactNode}> = ({style, active, children}) => {
  const b = useBrand();
  const light = isLight(b);
  return (
    <div
      style={{
        background: light
          ? active
            ? `linear-gradient(160deg, ${alpha(b.accent, 0.1)}, ${b.card ?? '#FFFFFF'} 70%)`
            : b.card ?? '#FFFFFF'
          : active
            ? `linear-gradient(160deg, ${alpha(b.accent, 0.16)}, ${alpha(b.bg2, 0.72)})`
            : `linear-gradient(160deg, ${alpha('#FFFFFF', 0.06)}, ${alpha(b.bg2, 0.55)})`,
        border: `1.5px solid ${active ? alpha(b.accent, light ? 0.95 : 0.85) : light ? alpha(b.ink, 0.08) : alpha('#FFFFFF', 0.1)}`,
        borderRadius: 26,
        boxShadow: light
          ? active
            ? `0 0 0 5px ${alpha(b.accent, 0.1)}, ${shadow(b, 1.2)}`
            : shadow(b)
          : active
            ? `0 0 42px ${alpha(b.accent, 0.22)}, 0 20px 50px rgba(0,0,0,0.35)`
            : '0 20px 50px rgba(0,0,0,0.3)',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Resolve a globe spec (markers/arcs/focus keyed to cues) into a rendered globe. */
export const GlobeLayer: React.FC<{scene: Scene; spec: any; defaultX?: number; defaultY?: number; defaultR?: number}> = ({
  scene,
  spec,
  defaultX = 1400,
  defaultY = 560,
  defaultR = 380,
}) => {
  const f = useCurrentFrame();
  const {width} = useVideoConfig();
  const b = useBrand();
  if (!spec) return null;
  const at = (c: any, fallback = 0) => (typeof c === 'number' ? cue(scene, c) : fallback);
  const markers = (spec.markers || []).map((m: any) => ({
    lon: m.lon,
    lat: m.lat,
    label: m.label,
    big: m.big,
    labelPos: m.labelPos,
    color: m.color === 'sky' ? b.sky : m.color === 'good' ? b.good : undefined,
    appear: prog(f, at(m.cue), 14) * (typeof m.hide === 'number' ? 1 - prog(f, at(m.hide), 14) : 1),
  }));
  const byLabel: Record<string, [number, number]> = {};
  (spec.markers || []).forEach((m: any) => (byLabel[m.label] = [m.lon, m.lat]));
  const arcs = (spec.arcs || []).map((a: any) => ({
    from: typeof a.from === 'string' ? byLabel[a.from] : a.from,
    to: typeof a.to === 'string' ? byLabel[a.to] : a.to,
    progress: prog(f, at(a.cue) + (a.delay ?? 0), a.dur ?? 54),
    color: a.color === 'sky' ? b.sky : undefined,
    fade: typeof a.hide === 'number' ? 1 - prog(f, at(a.hide), 14) : 1,
  }));
  const keys = [
    {f: 0, lon: spec.start?.lon ?? 40, lat: spec.start?.lat ?? 18},
    ...(spec.focus || []).map((k: any) => ({f: at(k.cue), lon: k.lon, lat: k.lat})),
  ];
  const {lon, lat} = focusAt(f, keys);
  const appear = prog(f, 0, 24);
  const r0 = spec.r ?? defaultR;
  const zr = spec.zoom ? prog(f, at(spec.zoom.cue), spec.zoom.dur ?? 40) : 0;
  const R = (r0 + ((spec.zoom?.r ?? r0) - r0) * zr) * (0.92 + 0.08 * appear);
  return (
    <Globe
      cx={spec.x ?? defaultX ?? width / 2}
      cy={spec.y ?? defaultY}
      R={R}
      lon0={lon}
      lat0={lat}
      markers={markers}
      arcs={arcs}
      frame={f}
      opacity={appear}
      labelSize={spec.labelSize ?? 30}
    />
  );
};
