import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {CLAMP} from '../anim';
import {alpha, F, isLight, shadow, useBrand} from '../theme';
import type {Caption, Timeline} from '../types';

const FULL_BLEED = ['title', 'outro', 'hook', 'shot', 'title3d', 'airspace3d', 'kinetic', 'examtip', 'airportmap', 'freedom'];

/** Series badge, chapter label and segmented progress bar for long-form lessons. */
export const Overlay: React.FC<{tl: Timeline}> = ({tl}) => {
  const f = useCurrentFrame();
  const {width: W} = useVideoConfig();
  const b = useBrand();
  const scene = tl.scenes.find((s) => f >= s.start && f < s.start + s.dur);
  const hideAll = !scene || FULL_BLEED.includes(scene.type) || (scene.type === 'chapter' && !!scene.data?.bg3d);
  const opacity = hideAll ? 0 : scene && scene.type === 'chapter' ? 0.5 : 1;
  const ch = [...tl.chapters].reverse().find((c) => f >= c.start);
  const total = tl.chapters.length ? tl.chapters[tl.chapters.length - 1].end - tl.chapters[0].start : tl.durationInFrames;
  const gap = 6;
  const x0 = 140;
  const barW = W - 2 * x0;
  const v2 = tl.showCaptions && tl.kind === 'long';
  return (
    <AbsoluteFill style={{pointerEvents: 'none', opacity}}>
      <div
        style={{
          position: 'absolute',
          top: 52,
          right: 64,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          fontFamily: F.head,
          fontWeight: 600,
          fontSize: 22,
          letterSpacing: '0.16em',
          color: alpha(b.ink, 0.62),
          textTransform: 'uppercase',
        }}
      >
        <span>{tl.series.short}</span>
        <span style={{padding: '6px 14px', borderRadius: 999, border: `1.5px solid ${alpha(b.accent, 0.7)}`, color: b.accent, letterSpacing: '0.1em'}}>
          EP {String(tl.series.episode).padStart(2, '0')}
        </span>
      </div>
      {tl.chapters.length > 0 ? (
        <>
          {!v2 ? (
            <div
              style={{
                position: 'absolute',
                left: x0,
                bottom: 50,
                fontFamily: F.head,
                fontWeight: 600,
                fontSize: 22,
                letterSpacing: '0.12em',
                color: alpha(b.ink, 0.55),
                textTransform: 'uppercase',
              }}
            >
              {ch ? (
                <>
                  <span style={{color: b.accent}}>{String(ch.n).padStart(2, '0')}</span>&nbsp;&nbsp;{ch.title}
                </>
              ) : null}
            </div>
          ) : null}
          <div style={{position: 'absolute', left: x0, bottom: v2 ? 28 : 34, width: barW, height: 5, display: 'flex', gap}}>
            {tl.chapters.map((c) => {
              const w = ((c.end - c.start) / total) * (barW - gap * (tl.chapters.length - 1));
              const fill = Math.max(0, Math.min(1, (f - c.start) / Math.max(1, c.end - c.start)));
              return (
                <div key={c.n} style={{width: w, height: 5, borderRadius: 3, background: alpha(b.ink, 0.12), overflow: 'hidden'}}>
                  <div style={{width: `${fill * 100}%`, height: '100%', background: b.accent}} />
                </div>
              );
            })}
          </div>
        </>
      ) : null}
      {tl.channel?.handle && !v2 ? (
        <div style={{position: 'absolute', right: 64, bottom: 50, fontFamily: F.head, fontWeight: 600, fontSize: 22, color: alpha(b.ink, 0.45), letterSpacing: '0.06em'}}>
          {tl.channel.handle}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** Burned-in captions for v1 long-form (subtitle style). */
export const LongCaptions: React.FC<{captions: Caption[]}> = ({captions}) => {
  const f = useCurrentFrame();
  const b = useBrand();
  const c = captions.find((x) => f >= x.s && f < x.e);
  if (!c) return null;
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 96, pointerEvents: 'none'}}>
      <div
        style={{
          maxWidth: 1400,
          textAlign: 'center',
          fontFamily: F.body,
          fontWeight: 600,
          fontSize: 40,
          lineHeight: 1.3,
          padding: '10px 22px',
          borderRadius: 14,
          background: isLight(b) ? 'rgba(255,255,255,0.92)' : 'rgba(3,8,18,0.62)',
          boxShadow: isLight(b) ? shadow(b, 0.6) : 'none',
          color: b.ink,
        }}
      >
        {c.words.map((w, i) => (
          <span key={i} style={{color: f >= w.s ? (w.k ? b.accent : b.ink) : alpha(b.ink, 0.55)}}>
            {w.t}{' '}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const fadeIn = (f: number, a: number, d = 8) => interpolate(f, [a, a + d], [0, 1], CLAMP);
