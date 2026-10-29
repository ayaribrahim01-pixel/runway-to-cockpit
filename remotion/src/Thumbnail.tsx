import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Background} from './components/Background';
import {Globe, greatCircle, project} from './components/Globe';
import {Icon} from './components/Icon';
import {Plane} from './components/Plane';
import {alpha, BrandProvider, F, FontGate, isLight, onAccent, useBrand} from './theme';
import type {ThumbProps} from './types';

export const Thumbnail: React.FC<ThumbProps> = (p) => (
  <BrandProvider brand={p.brand}>
    <FontGate>
      <ThumbInner {...p} />
    </FontGate>
  </BrandProvider>
);

const ThumbInner: React.FC<ThumbProps> = ({line1, line2, badge, kicker, markers = [], arcs = [], rotate = [40, 22]}) => {
  const b = useBrand();
  const cx = 1000;
  const cy = 390;
  const R = 330;
  // plane sits near the end of the first route, pointing along it
  let plane = {x: 900, y: 150, rot: -28};
  if (arcs.length) {
    const pts = greatCircle(arcs[0].from, arcs[0].to, 80);
    const a = pts[Math.round(pts.length * 0.62)];
    const c = pts[Math.round(pts.length * 0.62) + 3];
    const p1 = project(a[0], a[1], rotate[0], rotate[1], R, cx, cy, a[2]);
    const p2 = project(c[0], c[1], rotate[0], rotate[1], R, cx, cy, c[2]);
    plane = {x: p1.x, y: p1.y, rot: (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI};
  }
  return (
    <AbsoluteFill>
      <Background intensity={1.4} />
      <Globe
        cx={cx}
        cy={cy}
        R={R}
        lon0={rotate[0]}
        lat0={rotate[1]}
        frame={10}
        markers={markers.map((m) => ({...m, label: undefined, appear: 1, big: true}))}
        arcs={arcs.map((a) => ({...a, progress: 1}))}
        labelSize={26}
      />
      <div style={{position: 'absolute', left: plane.x - 70, top: plane.y - 70, transform: `rotate(${plane.rot}deg)`}}>
        <Plane size={140} color={b.ink} glow={alpha(b.accent, 0.9)} />
      </div>
      <AbsoluteFill style={{background: `linear-gradient(90deg, ${alpha(b.bg, 0.95)} 0%, ${alpha(b.bg, 0.75)} 45%, ${alpha(b.bg, 0)} 70%)`}} />
      <div style={{position: 'absolute', left: 64, top: 70, display: 'flex', alignItems: 'center', gap: 14}}>
        <div style={{padding: '10px 22px', borderRadius: 999, background: b.accent, color: onAccent(b), fontFamily: F.head, fontWeight: 700, fontSize: 30, letterSpacing: '0.08em'}}>
          {badge}
        </div>
      </div>
      <div style={{position: 'absolute', left: 64, top: 170, width: 780}}>
        {[line1, line2].map((ln, i) => (
          <div
            key={i}
            style={{
              fontFamily: F.head,
              fontWeight: 800 as any,
              fontSize: 118,
              lineHeight: 0.96,
              letterSpacing: '-0.035em',
              color: i === 0 ? b.ink : b.accent,
              textShadow: isLight(b) ? '0 4px 0 rgba(16,33,58,0.08)' : '0 8px 0 rgba(0,0,0,0.45)',
              textTransform: 'uppercase',
              marginTop: i ? 8 : 0,
            }}
          >
            {ln}
          </div>
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 64,
          bottom: 60,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          fontFamily: F.head,
          fontWeight: 600,
          fontSize: 32,
          letterSpacing: '0.16em',
          color: alpha(b.ink, 0.85),
          textTransform: 'uppercase',
        }}
      >
        <Icon name="plane" size={40} color={b.accent} />
        {kicker}
      </div>
    </AbsoluteFill>
  );
};
