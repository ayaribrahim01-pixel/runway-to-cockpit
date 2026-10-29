import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {noise2D} from '@remotion/noise';
import {alpha, isLight, useBrand} from '../theme';

/** Base layer under every scene: soft gradient, faint chart grid, slow drifting light, contrails, vignette, grain. */
export const Background: React.FC<{intensity?: number}> = ({intensity = 1}) => {
  const f = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const b = useBrand();
  const light = isLight(b);
  const t = f / 30;
  const g1x = 50 + noise2D('g1x', t * 0.03, 0) * 22;
  const g1y = 30 + noise2D('g1y', t * 0.03, 0) * 14;
  const g2x = 80 + noise2D('g2x', t * 0.025, 1) * 18;
  const g2y = 75 + noise2D('g2y', t * 0.025, 1) * 14;
  const drift = (f * 0.35) % 120;
  const step = Math.round(W / 16);
  const lines: React.ReactNode[] = [];
  for (let x = -step; x < W + step; x += step) {
    lines.push(<line key={'v' + x} x1={x + (drift % step)} y1={0} x2={x + (drift % step)} y2={H} />);
  }
  for (let y = -step; y < H + step; y += step) {
    lines.push(<line key={'h' + y} x1={0} y1={y + ((drift * 0.5) % step)} x2={W} y2={y + ((drift * 0.5) % step)} />);
  }
  const trails = [0, 1, 2].map((i) => {
    const period = 900 + i * 260;
    const p = ((f + i * 380) % period) / period;
    const x = -600 + p * (W + 1200);
    const y = H * (0.2 + i * 0.28) - p * 260;
    return <line key={i} x1={x - 520} y1={y + 120} x2={x} y2={y} stroke="url(#trail)" strokeWidth={2} opacity={0.5 * intensity} />;
  });
  return (
    <AbsoluteFill style={{backgroundColor: b.bg, overflow: 'hidden'}}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 70% 60% at ${g1x}% ${g1y}%, ${alpha(light ? '#FFFFFF' : b.bg2, light ? 0.95 : 1)} 0%, ${alpha(
            b.bg,
            0,
          )} 70%), radial-gradient(ellipse 45% 40% at ${g2x}% ${g2y}%, ${alpha(b.sky, (light ? 0.06 : 0.07) * intensity)} 0%, ${alpha(
            b.bg,
            0,
          )} 70%), radial-gradient(ellipse 40% 35% at ${100 - g2x}% ${g1y + 40}%, ${alpha(b.accent, (light ? 0.07 : 0.045) * intensity)} 0%, ${alpha(
            b.bg,
            0,
          )} 70%)`,
        }}
      />
      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
        <defs>
          <linearGradient id="trail" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={b.ink} stopOpacity={0} />
            <stop offset="100%" stopColor={b.ink} stopOpacity={light ? 0.12 : 0.22} />
          </linearGradient>
        </defs>
        <g stroke={alpha(light ? b.sky : b.ink, (light ? 0.06 : 0.035) * intensity)} strokeWidth={1}>
          {lines}
        </g>
        {trails}
      </svg>
      <AbsoluteFill
        style={{
          background: light
            ? `radial-gradient(ellipse 90% 85% at 50% 45%, rgba(16,33,58,0) 60%, rgba(16,33,58,0.07) 100%)`
            : `radial-gradient(ellipse 85% 80% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)`,
        }}
      />
      <AbsoluteFill style={{opacity: light ? 0.035 : 0.06, mixBlendMode: light ? 'multiply' : 'overlay'}}>
        <Img
          src={staticFile('grain.png')}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `translate(${(f * 37) % 40}px, ${(f * 53) % 40}px) scale(1.1)`,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
