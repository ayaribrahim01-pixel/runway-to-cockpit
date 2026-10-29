import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {pop, prog, rise, slideIn} from '../anim';
import {Shot3D} from '../three/Shot3D';
import {alpha, F, Rich, useBrand} from '../theme';
import type {Scene} from '../types';
import {PADX} from './common';

/** Full-screen original 3D shot, optionally with a caption block. */
export const ShotScene: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const b = useBrand();
  const d = scene.data || {};
  const kind = d.shot === 'takeoff' ? 'takeoff' : 'cruise';
  const align: 'left' | 'right' | 'center' | 'none' = d.align ?? (d.title || d.kicker ? 'left' : 'none');
  const shift = d.shift ?? (align === 'left' ? 0.28 : align === 'right' ? -0.28 : 0);
  const hasText = align !== 'none' && (d.title || d.kicker || d.sub);
  return (
    <AbsoluteFill>
      <Shot3D kind={kind} view={d.view} frame={f} dur={scene.dur + 10} shift={shift} tau0={d.tau0} />
      {hasText ? (
        <>
          <AbsoluteFill
            style={{
              background:
                align === 'left'
                  ? 'linear-gradient(90deg, rgba(255,255,255,0.86) 0%, rgba(255,255,255,0.55) 34%, rgba(255,255,255,0) 62%)'
                  : align === 'right'
                    ? 'linear-gradient(270deg, rgba(255,255,255,0.86) 0%, rgba(255,255,255,0.55) 34%, rgba(255,255,255,0) 62%)'
                    : 'linear-gradient(0deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 45%)',
              opacity: prog(f, 0, 14),
            }}
          />
          <AbsoluteFill
            style={{
              justifyContent: align === 'center' ? 'flex-end' : 'center',
              alignItems: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
              padding: `0 ${PADX}px ${align === 'center' ? 170 : 0}px`,
              textAlign: align === 'center' ? 'center' : align,
            }}
          >
            <div style={{maxWidth: align === 'center' ? 1400 : 820}}>
              {d.kicker ? (
                <div style={{...slideIn(f, 6, 40), fontFamily: F.head, fontWeight: 650 as any, fontSize: 26, letterSpacing: '0.22em', textTransform: 'uppercase', color: b.accent, marginBottom: 18}}>
                  {d.kicker}
                </div>
              ) : null}
              {d.title ? (
                <div
                  style={{
                    ...slideIn(f, 10, 60, 22),
                    fontFamily: F.head,
                    fontWeight: 800 as any,
                    fontSize: d.size ?? 84,
                    lineHeight: 1.04,
                    letterSpacing: '-0.03em',
                    color: b.ink,
                    textWrap: 'balance' as any,
                  }}
                >
                  <Rich text={d.title} />
                </div>
              ) : null}
              {d.sub ? (
                <div style={{...rise(f, 18, 20), fontFamily: F.body, fontSize: 34, lineHeight: 1.35, color: alpha(b.ink, 0.72), marginTop: 22}}>
                  <Rich text={d.sub} />
                </div>
              ) : null}
            </div>
          </AbsoluteFill>
        </>
      ) : null}
    </AbsoluteFill>
  );
};

/** Chapter card over a 3D shot (used when a chapter scene has data.bg3d). */
export const ChapterShot: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const b = useBrand();
  const d = scene.data || {};
  const bg = d.bg3d || {};
  const n = String(d.n ?? 1).padStart(2, '0');
  const numP = pop(f, 26, 4);
  return (
    <AbsoluteFill>
      <Shot3D kind={bg.shot === 'takeoff' ? 'takeoff' : 'cruise'} view={bg.view ?? 'front'} frame={f} dur={scene.dur + 10} shift={bg.shift ?? 0.3} tau0={bg.tau0} />
      <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.62) 36%, rgba(255,255,255,0) 64%)', opacity: prog(f, 0, 12)}} />
      <AbsoluteFill style={{justifyContent: 'center', paddingLeft: PADX}}>
        <div style={{maxWidth: 860}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 22, marginBottom: 20, ...slideIn(f, 4, 40)}}>
            <div
              style={{
                fontFamily: F.head,
                fontWeight: 800 as any,
                fontSize: 30,
                color: '#FFFFFF',
                background: b.accent,
                borderRadius: 14,
                padding: '8px 18px',
                transform: `scale(${0.7 + 0.3 * numP})`,
                transformOrigin: 'left center',
              }}
            >
              {n}
            </div>
            <div style={{fontFamily: F.head, fontWeight: 650 as any, fontSize: 26, letterSpacing: '0.22em', textTransform: 'uppercase', color: b.accent}}>{d.kicker ?? 'Chapter'}</div>
          </div>
          <div
            style={{
              ...slideIn(f, 10, 60, 22),
              fontFamily: F.head,
              fontWeight: 800 as any,
              fontSize: d.size ?? 96,
              lineHeight: 1.02,
              letterSpacing: '-0.035em',
              color: b.ink,
              textWrap: 'balance' as any,
            }}
          >
            <Rich text={d.title} />
          </div>
          {d.sub ? (
            <div style={{...rise(f, 18, 20), fontFamily: F.body, fontSize: 36, lineHeight: 1.35, color: alpha(b.ink, 0.7), marginTop: 22}}>
              <Rich text={d.sub} />
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
