import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {CLAMP} from '../anim';
import {F, useBrand} from '../theme';
import type {Caption} from '../types';

/** Reel-style word-by-word captions: one short line in a white pill, the spoken word lit on an accent chip. */
export const WordCaptions: React.FC<{captions: Caption[]; bottom?: number; size?: number}> = ({captions, bottom = 92, size = 50}) => {
  const f = useCurrentFrame();
  const b = useBrand();
  const c = captions.find((x) => f >= x.s && f < x.e);
  if (!c || !c.words.length) return null;
  const local = f - c.s;
  const pin = interpolate(local, [0, 4], [0, 1], CLAMP);
  let cur = -1;
  c.words.forEach((w, i) => {
    if (f >= w.s) cur = i;
  });
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: bottom, pointerEvents: 'none'}}>
      <div
        style={{
          display: 'flex',
          gap: size * 0.16,
          alignItems: 'center',
          padding: `${size * 0.16}px ${size * 0.34}px`,
          borderRadius: 22,
          background: 'rgba(255,255,255,0.94)',
          boxShadow: '0 12px 30px rgba(16,33,58,0.16), 0 2px 6px rgba(16,33,58,0.08)',
          opacity: pin,
          transform: `translateY(${(1 - pin) * 14}px) scale(${0.96 + 0.04 * pin})`,
          whiteSpace: 'nowrap',
        }}
      >
        {c.words.map((w, i) => {
          const on = i === cur;
          const spoken = i <= cur;
          const pw = on ? interpolate(f - w.s, [0, 3], [0.85, 1], CLAMP) : 1;
          return (
            <span
              key={i}
              style={{
                fontFamily: F.head,
                fontWeight: 750 as any,
                fontSize: size,
                lineHeight: 1.15,
                letterSpacing: '-0.01em',
                color: on ? '#FFFFFF' : spoken ? b.ink : 'rgba(16,33,58,0.42)',
                background: on ? (w.k ? b.sky : b.accent) : 'transparent',
                borderRadius: 12,
                padding: `0 ${size * 0.14}px`,
                transform: `scale(${pw})`,
                display: 'inline-block',
              }}
            >
              {w.t}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
