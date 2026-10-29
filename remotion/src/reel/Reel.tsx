import React from 'react';
import {AbsoluteFill, interpolate, Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import {activeIndex, bouncy, CLAMP, cue, pop, prog, rise} from '../anim';
import {Background} from '../components/Background';
import {Icon} from '../components/Icon';
import {Plane} from '../components/Plane';
import {GlobeLayer} from '../scenes/common';
import {alpha, BrandProvider, edge, F, FontGate, isLight, Rich, shadow, surface, useBrand} from '../theme';
import type {Caption, Scene, Timeline} from '../types';

// Vertical 1080×1920 reel. Visual zone: y 300–1220. Captions: y ~1300–1620.
const VZ_TOP = 300;
const VZ_H = 900;

const RHook: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const b = useBrand();
  const d = scene.data || {};
  const lines: string[] = d.lines || [];
  return (
    <AbsoluteFill style={{top: VZ_TOP, height: VZ_H, justifyContent: 'center', padding: '0 80px'}}>
      {lines.map((ln, i) => {
        const a = cue(scene, i, lines.length, 2);
        const p = prog(f, a, 16);
        return (
          <div
            key={i}
            style={{
              opacity: p,
              transform: `translateY(${(1 - p) * 40}px) scale(${0.96 + 0.04 * p})`,
              fontFamily: F.head,
              fontWeight: 700,
              fontSize: d.size ?? 92,
              lineHeight: 1.06,
              letterSpacing: '-0.02em',
              color: b.ink,
              textAlign: 'center',
              marginBottom: 26,
            }}
          >
            <Rich text={ln} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const RGlobe: React.FC<{scene: Scene}> = ({scene}) => (
  <AbsoluteFill>
    <GlobeLayer scene={scene} spec={{x: 540, y: VZ_TOP + VZ_H / 2, r: 400, labelSize: 40, ...(scene.data?.globe || {})}} />
  </AbsoluteFill>
);

const RStat: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const p = pop(f, fps, cue(scene, 0, 1, 2));
  const num = /^\d+$/.test(String(d.value));
  const v = num ? Math.round(interpolate(f, [cue(scene, 0, 1, 2), cue(scene, 0, 1, 2) + 24], [0, Number(d.value)], CLAMP)) : d.value;
  return (
    <AbsoluteFill style={{top: VZ_TOP, height: VZ_H, justifyContent: 'center', alignItems: 'center', textAlign: 'center'}}>
      {d.kicker ? (
        <div style={{...rise(f, 0, 14), fontFamily: F.head, fontWeight: 600, fontSize: 36, letterSpacing: '0.2em', color: b.accent, textTransform: 'uppercase', marginBottom: 20}}>
          {d.kicker}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: F.head,
          fontWeight: 700,
          fontSize: d.size ?? 300,
          lineHeight: 1,
          letterSpacing: '-0.04em',
          color: b.accent,
          opacity: p,
          transform: `scale(${0.8 + 0.2 * p})`,
          textShadow: isLight(b) ? 'none' : `0 0 80px ${alpha(b.accent, 0.4)}`,
        }}
      >
        {d.prefix ?? ''}
        {v}
        {d.suffix ?? ''}
      </div>
      <div style={{...rise(f, cue(scene, 0, 1, 2) + 8, 18), fontFamily: F.head, fontWeight: 700, fontSize: 64, color: b.ink, marginTop: 24, padding: '0 70px', lineHeight: 1.1}}>
        <Rich text={d.label} />
      </div>
      {d.sub ? (
        <div style={{...rise(f, cue(scene, 0, 1, 2) + 14, 18), fontFamily: F.body, fontWeight: 500, fontSize: 40, color: alpha(b.ink, 0.7), marginTop: 18, padding: '0 90px'}}>
          <Rich text={d.sub} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const RPoints: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const items: any[] = d.items || [];
  const act = activeIndex(scene, f, items.length);
  return (
    <AbsoluteFill style={{top: VZ_TOP, height: VZ_H, justifyContent: 'center', padding: '0 70px', gap: 26}}>
      {d.title ? (
        <div style={{...rise(f, 0, 14), fontFamily: F.head, fontWeight: 700, fontSize: 60, color: b.ink, textAlign: 'center', marginBottom: 20, lineHeight: 1.1}}>
          <Rich text={d.title} />
        </div>
      ) : null}
      {items.map((it, i) => {
        const p = pop(f, fps, cue(scene, i, items.length, 2));
        const on = i === act;
        return (
          <div
            key={i}
            style={{
              opacity: p * (act > i ? 0.55 : 1),
              transform: `translateX(${(1 - p) * 80}px)`,
              display: 'flex',
              alignItems: 'center',
              gap: 30,
              padding: '30px 34px',
              borderRadius: 30,
              border: `2px solid ${on ? b.accent : edge(b, isLight(b) ? 0.08 : 0.12)}`,
              background: on ? (isLight(b) ? `linear-gradient(160deg, ${alpha(b.accent, 0.1)}, #FFFFFF 70%)` : alpha(b.accent, 0.13)) : surface(b),
              boxShadow: isLight(b) ? shadow(b) : 'none',
            }}
          >
            <Icon name={it.icon} size={70} color={on ? b.accent : b.sky} />
            <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 50, color: b.ink, lineHeight: 1.12}}>
              <Rich text={it.text} />
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const RQuote: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const b = useBrand();
  const d = scene.data || {};
  return (
    <AbsoluteFill style={{top: VZ_TOP, height: VZ_H, justifyContent: 'center', padding: '0 80px'}}>
      <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 220, color: alpha(b.accent, 0.3), lineHeight: 0.6}}>“</div>
      <div style={{...rise(f, 2, 20), fontFamily: F.head, fontWeight: 600, fontSize: d.size ?? 64, lineHeight: 1.25, color: b.ink}}>
        <Rich text={d.text} />
      </div>
      {d.source ? <div style={{...rise(f, 10, 18), fontFamily: F.body, fontSize: 36, color: alpha(b.ink, 0.6), marginTop: 30}}>— {d.source}</div> : null}
    </AbsoluteFill>
  );
};

const RTip: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const trap = d.variant === 'trap';
  const col = trap ? b.warn : b.accent;
  const p = bouncy(f, fps, 2);
  return (
    <AbsoluteFill style={{top: VZ_TOP, height: VZ_H, justifyContent: 'center', alignItems: 'center', padding: '0 60px'}}>
      <div
        style={{
          padding: '56px 54px',
          borderRadius: 40,
          border: `3px solid ${col}`,
          background: isLight(b) ? `linear-gradient(160deg, ${alpha(col, 0.1)}, #FFFFFF 60%)` : `linear-gradient(160deg, ${alpha(col, 0.18)}, ${alpha(b.bg2, 0.92)} 60%)`,
          boxShadow: isLight(b) ? `0 0 0 6px ${alpha(col, 0.08)}, ${shadow(b, 1.4)}` : 'none',
          transform: `scale(${0.85 + 0.15 * p})`,
          opacity: Math.min(1, p * 1.4),
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 20, marginBottom: 26}}>
          <Icon name={trap ? 'alert' : 'bulb'} size={64} color={col} />
          <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 38, letterSpacing: '0.18em', color: col, textTransform: 'uppercase'}}>{d.label ?? (trap ? 'Exam trap' : 'Exam tip')}</div>
        </div>
        <div style={{fontFamily: F.head, fontWeight: 700, fontSize: d.size ?? 62, color: b.ink, lineHeight: 1.18}}>
          <Rich text={d.text} color={col} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const REnd: React.FC<{scene: Scene; tl: Timeline}> = ({scene, tl}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const p = pop(f, fps, 2);
  return (
    <AbsoluteFill style={{top: VZ_TOP - 40, height: VZ_H, justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '0 70px'}}>
      <div style={{transform: `translateY(${(1 - p) * -40}px)`, opacity: p}}>
        <Plane size={150} color={b.accent} rotate={-30} glow={alpha(b.accent, 0.6)} />
      </div>
      <div style={{...rise(f, 6, 18), fontFamily: F.head, fontWeight: 600, fontSize: 38, letterSpacing: '0.2em', color: b.accent, textTransform: 'uppercase', marginTop: 30}}>
        {d.kicker ?? 'Full lesson on YouTube'}
      </div>
      <div style={{...rise(f, 10, 20), fontFamily: F.head, fontWeight: 700, fontSize: 76, color: b.ink, marginTop: 20, lineHeight: 1.08}}>
        <Rich text={d.title ?? tl.series.title} />
      </div>
      <div style={{...rise(f, 16, 20), fontFamily: F.body, fontWeight: 600, fontSize: 40, color: alpha(b.ink, 0.75), marginTop: 26}}>{d.sub ?? 'Follow for a new DGCA lesson every day'}</div>
    </AbsoluteFill>
  );
};

/** Big kinetic captions: 2–4 words at a time, current word in the accent colour. */
const KineticCaptions: React.FC<{captions: Caption[]}> = ({captions}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = useBrand();
  const c = captions.find((x) => f >= x.s && f < x.e);
  if (!c) return null;
  const enter = pop(f, fps, c.s, 16, 220);
  return (
    <AbsoluteFill style={{top: 1290, height: 360, justifyContent: 'center', alignItems: 'center', padding: '0 60px'}}>
      <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: 22, rowGap: 6, transform: `scale(${0.92 + 0.08 * enter})`, opacity: Math.min(1, enter * 1.5)}}>
        {c.words.map((w, i) => {
          const on = f >= w.s && f < Math.max(w.e, w.s + 4);
          const said = f >= w.s;
          return (
            <span
              key={i}
              style={{
                fontFamily: F.head,
                fontWeight: 800 as any,
                fontSize: 82,
                lineHeight: 1.08,
                textTransform: 'uppercase',
                letterSpacing: '-0.01em',
                color: on || w.k ? b.accent : said ? b.ink : alpha(b.ink, 0.92),
                transform: `scale(${on ? 1.06 : 1})`,
                display: 'inline-block',
                textShadow: isLight(b) ? '0 3px 0 rgba(255,255,255,0.9)' : '0 6px 0 rgba(0,0,0,0.55), 0 0 30px rgba(0,0,0,0.6)',
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

const RMAP: Record<string, React.FC<{scene: Scene}>> = {
  rhook: RHook,
  rglobe: RGlobe,
  rstat: RStat,
  rpoints: RPoints,
  rquote: RQuote,
  rtip: RTip,
};

export const ReelComp: React.FC<Timeline> = (tl) => (
  <BrandProvider brand={tl.brand}>
    <FontGate>
      <ReelInner tl={tl} />
    </FontGate>
  </BrandProvider>
);

const ReelInner: React.FC<{tl: Timeline}> = ({tl}) => {
  const f = useCurrentFrame();
  const b = useBrand();
  const total = tl.durationInFrames;
  return (
    <AbsoluteFill>
      <Background />
      {tl.scenes.map((s, i) => {
        const C = RMAP[s.type];
        const extra = i < tl.scenes.length - 1 ? 6 : 0;
        return (
          <Sequence key={s.id + i} from={s.start} durationInFrames={s.dur + extra}>
            <SceneFade dur={s.dur + extra} last={i === tl.scenes.length - 1}>
              {s.type === 'rend' ? <REnd scene={s} tl={tl} /> : C ? <C scene={s} /> : null}
            </SceneFade>
          </Sequence>
        );
      })}
      <KineticCaptions captions={tl.captions} />
      <div style={{position: 'absolute', top: 0, left: 0, height: 10, width: `${(f / total) * 100}%`, background: b.accent}} />
      <div style={{position: 'absolute', top: 120, left: 0, right: 0, display: 'flex', justifyContent: 'center'}}>
        <div
          style={{
            display: 'flex',
            gap: 16,
            alignItems: 'center',
            padding: '14px 28px',
            borderRadius: 999,
            background: isLight(b) ? 'rgba(255,255,255,0.92)' : alpha(b.bg2, 0.75),
            border: `1.5px solid ${edge(b, isLight(b) ? 0.08 : 0.14)}`,
            boxShadow: isLight(b) ? shadow(b, 0.6) : 'none',
            fontFamily: F.head,
            fontWeight: 600,
            fontSize: 30,
            letterSpacing: '0.14em',
            color: alpha(b.ink, 0.85),
            textTransform: 'uppercase',
          }}
        >
          <Icon name="plane" size={34} color={b.accent} />
          {tl.series.short}
          <span style={{color: b.accent}}>EP {String(tl.series.episode).padStart(2, '0')}</span>
        </div>
      </div>
      {tl.channel?.handle ? (
        <div style={{position: 'absolute', bottom: 120, left: 0, right: 0, textAlign: 'center', fontFamily: F.head, fontWeight: 600, fontSize: 34, color: alpha(b.ink, 0.55)}}>
          {tl.channel.handle}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const SceneFade: React.FC<{dur: number; last?: boolean; children: React.ReactNode}> = ({dur, last, children}) => {
  const f = useCurrentFrame();
  const out = last ? 1 : interpolate(f, [dur - 10, dur], [1, 0], CLAMP);
  return <AbsoluteFill style={{opacity: out}}>{children}</AbsoluteFill>;
};
