import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {evolvePath} from '@remotion/paths';
import {activeIndex, bouncy, CLAMP, cue, EASE, lerp, pop, prog, rise, slideIn} from '../anim';
import {Icon} from '../components/Icon';
import {Plane} from '../components/Plane';
import {alpha, dim, F, isLight, onAccent, Rich, shadow, stripMarks, useBrand} from '../theme';
import type {Scene} from '../types';
import {Glass, GlobeLayer, PADX, SceneTitle} from './common';

/* ------------------------------------------------------------------ HOOK (cold open) */
export const Hook: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const b = useBrand();
  const d = scene.data || {};
  const lines: string[] = d.lines || [];
  const hasGlobe = !!d.globe;
  return (
    <AbsoluteFill>
      {hasGlobe ? <GlobeLayer scene={scene} spec={d.globe} defaultX={1450} defaultY={560} defaultR={390} /> : null}
      <div
        style={{
          position: 'absolute',
          left: PADX,
          top: 0,
          bottom: 0,
          width: hasGlobe ? 830 : 1500,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        {lines.map((ln, i) => {
          const ci = d.lineCues?.[i] ?? i;
          const a = cue(scene, ci, lines.length);
          const p = prog(f, a, 22);
          const later = lines.findIndex((_, j) => j > i && f >= cue(scene, d.lineCues?.[j] ?? j, lines.length));
          const dimmed = later > i ? dim(b, 0.42) : 1;
          return (
            <div
              key={i}
              style={{
                opacity: p * dimmed,
                transform: `translateY(${(1 - p) * 44}px)`,
                filter: `blur(${(1 - p) * 8}px)`,
                fontFamily: F.head,
                fontWeight: 700,
                fontSize: d.size ?? (hasGlobe ? 62 : 82),
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                marginBottom: 30,
                color: b.ink,
              }}
            >
              <Rich text={ln} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ TITLE card */
export const Title: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const words = stripMarks(d.title || '').split(' ');
  const scale = interpolate(f, [0, scene.dur], [1, 1.035], CLAMP);
  const t = prog(f, 4, Math.min(scene.dur - 4, 110), EASE);
  const px = lerp(-200, W + 200, t);
  const py = H * 0.78 - Math.sin(t * Math.PI * 0.9) * 260 - t * 120;
  const trail = `M ${-200} ${H * 0.78} Q ${W * 0.45} ${H * 0.78 - 420}, ${px} ${py}`;
  const lineP = prog(f, 22, 26);
  return (
    <AbsoluteFill style={{transform: `scale(${scale})`}}>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
        <defs>
          <linearGradient id="ttrail" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={b.ink} stopOpacity={0} />
            <stop offset="100%" stopColor={b.ink} stopOpacity={0.35} />
          </linearGradient>
        </defs>
        <path d={trail} stroke="url(#ttrail)" strokeWidth={3} fill="none" strokeDasharray="2 14" strokeLinecap="round" />
      </svg>
      <div style={{position: 'absolute', left: px - 50, top: py - 50, opacity: t > 0 && t < 1 ? 0.9 : 0}}>
        <Plane size={100} color={b.ink} rotate={-18} glow={alpha(b.sky, 0.6)} />
      </div>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', textAlign: 'center'}}>
        <div
          style={{
            ...rise(f, 2, 20),
            fontFamily: F.head,
            fontWeight: 600,
            fontSize: 26,
            letterSpacing: '0.28em',
            color: b.accent,
            textTransform: 'uppercase',
            marginBottom: 28,
            display: 'flex',
            gap: 18,
            alignItems: 'center',
          }}
        >
          <span>{d.kicker}</span>
          {d.ep ? <span style={{padding: '6px 16px', border: `2px solid ${b.accent}`, borderRadius: 999, letterSpacing: '0.12em'}}>{d.ep}</span> : null}
        </div>
        <div style={{maxWidth: 1560, textAlign: 'center', textWrap: 'balance' as any, lineHeight: 1.05}}>
          {words
            .map((w, i) => {
              const p = prog(f, 8 + i * 3, 20);
              const emph = (d.title || '').includes('*' + w) || (d.emph || []).includes(w.replace(/[^\w']/g, ''));
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    marginRight: i < words.length - 1 ? 26 : 0,
                    opacity: p,
                    transform: `translateY(${(1 - p) * 60}px)`,
                    fontFamily: F.head,
                    fontWeight: 700,
                    fontSize: d.size ?? 112,
                    lineHeight: 1.05,
                    letterSpacing: '-0.025em',
                    color: emph ? b.accent : b.ink,
                  }}
                >
                  {w}
                </span>
              );
            })
            .flatMap((el, i) => (i < words.length - 1 ? [el, ' '] : [el]))}
        </div>
        <div style={{width: 520 * lineP, height: 4, borderRadius: 2, background: b.accent, margin: '34px 0 26px'}} />
        {d.subtitle ? (
          <div style={{...rise(f, 28, 24), fontFamily: F.body, fontWeight: 500, fontSize: 40, color: alpha(b.ink, 0.78), maxWidth: 1400}}>
            <Rich text={d.subtitle} />
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ CHAPTER card */
export const Chapter: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const n = String(d.n ?? 1).padStart(2, '0');
  const wipe = prog(f, 0, 16, EASE);
  const numP = pop(f, 30, 4);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: -400,
          top: -200,
          width: 260,
          height: H + 400,
          background: `linear-gradient(90deg, ${alpha(b.accent, 0)}, ${alpha(b.accent, 0.5)}, ${alpha(b.accent, 0)})`,
          transform: `translateX(${wipe * (W + 800)}px) rotate(14deg)`,
          opacity: 1 - wipe * 0.6,
        }}
      />
      <AbsoluteFill style={{flexDirection: 'row', alignItems: 'center', paddingLeft: PADX, gap: 70}}>
        <div
          style={{
            fontFamily: F.head,
            fontWeight: 700,
            fontSize: 340,
            lineHeight: 1,
            color: 'transparent',
            WebkitTextStroke: `4px ${b.accent}`,
            opacity: numP,
            transform: `translateX(${(1 - numP) * -120}px)`,
            letterSpacing: '-0.04em',
          }}
        >
          {n}
        </div>
        <div style={{maxWidth: 1100}}>
          <div style={{...slideIn(f, 8, 50), fontFamily: F.head, fontWeight: 600, fontSize: 26, letterSpacing: '0.24em', color: b.accent, textTransform: 'uppercase', marginBottom: 18}}>
            {d.kicker ?? `Chapter ${n}`}
          </div>
          <div
            style={{
              ...slideIn(f, 12, 70, 22),
              fontFamily: F.head,
              fontWeight: 700,
              fontSize: d.size ?? 92,
              lineHeight: 1.04,
              letterSpacing: '-0.02em',
              color: b.ink,
              textWrap: 'balance' as any,
            }}
          >
            <Rich text={d.title} />
          </div>
          {d.sub ? (
            <div style={{...rise(f, 20, 20), fontFamily: F.body, fontSize: 36, color: alpha(b.ink, 0.7), marginTop: 22}}>
              <Rich text={d.sub} />
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ POINTS (list or cards) */
export const Points: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const items: any[] = d.items || [];
  const act = activeIndex(scene, f, items.length);
  const cards = d.layout === 'cards';
  return (
    <AbsoluteFill>
      <SceneTitle kicker={d.kicker} title={d.title} f={f} />
      {cards ? (
        <div style={{position: 'absolute', left: PADX, right: PADX, top: d.title ? 330 : 240, bottom: 170, display: 'flex', gap: 36, alignItems: 'center'}}>
          {items.map((it, i) => {
            const a = cue(scene, i, items.length);
            const p = pop(f, fps, a);
            return (
              <Glass
                key={i}
                active={i === act}
                style={{
                  flex: 1,
                  minHeight: 420,
                  padding: '46px 40px',
                  opacity: p * (act > i ? dim(b, 0.6) : 1),
                  transform: `translateY(${(1 - p) * 60}px) scale(${0.96 + 0.04 * p})`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 22,
                }}
              >
                <div
                  style={{
                    width: 92,
                    height: 92,
                    borderRadius: 24,
                    background: alpha(i === act ? b.accent : b.sky, 0.14),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name={it.icon} size={54} color={i === act ? b.accent : b.sky} />
                </div>
                {it.tag ? <div style={{fontFamily: F.mono, fontSize: 24, color: b.accent, letterSpacing: '0.06em'}}>{it.tag}</div> : null}
                <div style={{fontFamily: F.head, fontWeight: 700, fontSize: d.size ?? 44, lineHeight: 1.12, color: b.ink}}>
                  <Rich text={it.text} />
                </div>
                {it.sub ? (
                  <div style={{fontFamily: F.body, fontWeight: 500, fontSize: 29, lineHeight: 1.35, color: alpha(b.ink, 0.68)}}>
                    <Rich text={it.sub} />
                  </div>
                ) : null}
              </Glass>
            );
          })}
        </div>
      ) : (
        <div style={{position: 'absolute', left: PADX, right: PADX + 60, top: d.title ? 340 : 240, display: 'flex', flexDirection: 'column', gap: 30}}>
          {items.map((it, i) => {
            const a = cue(scene, i, items.length);
            const p = prog(f, a, 18);
            const on = i === act;
            return (
              <div key={i} style={{display: 'flex', alignItems: 'center', gap: 34, opacity: p * (act > i ? dim(b, 0.5) : 1), transform: `translateX(${(1 - p) * 70}px)`}}>
                <div style={{width: 8, alignSelf: 'stretch', borderRadius: 4, background: on ? b.accent : 'transparent', transform: `scaleY(${on ? prog(f, a, 14) : 0})`}} />
                <div
                  style={{
                    width: 84,
                    height: 84,
                    flex: '0 0 84px',
                    borderRadius: 999,
                    border: `2px solid ${on ? b.accent : alpha(b.sky, 0.55)}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: on ? alpha(b.accent, 0.12) : 'transparent',
                  }}
                >
                  {it.icon ? (
                    <Icon name={it.icon} size={44} color={on ? b.accent : b.sky} />
                  ) : (
                    <span style={{fontFamily: F.head, fontWeight: 700, fontSize: 36, color: on ? b.accent : b.sky}}>{i + 1}</span>
                  )}
                </div>
                <div>
                  <div style={{fontFamily: F.head, fontWeight: 600, fontSize: d.size ?? 48, lineHeight: 1.15, color: b.ink}}>
                    <Rich text={it.text} />
                  </div>
                  {it.sub ? (
                    <div style={{fontFamily: F.body, fontWeight: 500, fontSize: 30, lineHeight: 1.35, color: alpha(b.ink, 0.65), marginTop: 6}}>
                      <Rich text={it.sub} />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ STAT (big numbers) */
export const Stat: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const stats: any[] = d.stats || [];
  const act = activeIndex(scene, f, stats.length);
  const n = stats.length;
  return (
    <AbsoluteFill>
      <SceneTitle kicker={d.kicker} title={d.title} f={f} />
      <div
        style={{
          position: 'absolute',
          left: PADX,
          right: PADX,
          top: d.title ? 300 : 120,
          bottom: 130,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          gap: 50,
        }}
      >
        {stats.map((s, i) => {
          const a = cue(scene, i, n);
          const p = pop(f, fps, a);
          const num = /^\d+$/.test(String(s.value));
          const count = num ? Math.round(interpolate(f, [a, a + 26], [0, Number(s.value)], {...CLAMP, easing: EASE})) : s.value;
          const on = i === act;
          return (
            <div key={i} style={{flex: 1, textAlign: 'center', opacity: p * (act > i ? dim(b, 0.55) : 1), transform: `translateY(${(1 - p) * 50}px)`}}>
              <div
                style={{
                  fontFamily: F.head,
                  fontWeight: 700,
                  fontSize: s.size ?? (n === 1 ? 260 : n === 2 ? 200 : 160),
                  lineHeight: 1,
                  letterSpacing: '-0.04em',
                  color: on ? b.accent : b.ink,
                  textShadow: on && !isLight(b) ? `0 0 60px ${alpha(b.accent, 0.35)}` : 'none',
                }}
              >
                {s.prefix ?? ''}
                {count}
                {s.suffix ?? ''}
              </div>
              <div style={{fontFamily: F.head, fontWeight: 600, fontSize: n === 1 ? 54 : 42, color: b.ink, marginTop: 18}}>
                <Rich text={s.label} />
              </div>
              {s.sub ? (
                <div style={{fontFamily: F.body, fontWeight: 500, fontSize: 30, color: alpha(b.ink, 0.6), marginTop: 10}}>
                  <Rich text={s.sub} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ EXAM TIP / TRAP (v1 card) */
export const Tip: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const trap = d.variant === 'trap';
  const col = trap ? b.warn : b.accent;
  const p = bouncy(f, fps, 2);
  const lines: string[] = d.lines || (d.text ? [d.text] : []);
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
      <div
        style={{
          width: 1440,
          padding: '60px 70px',
          borderRadius: 34,
          background: isLight(b) ? `linear-gradient(150deg, ${alpha(col, 0.1)}, ${b.card ?? '#FFFFFF'} 55%)` : `linear-gradient(150deg, ${alpha(col, 0.16)}, ${alpha(b.bg2, 0.9)} 55%)`,
          border: `2px solid ${alpha(col, 0.8)}`,
          boxShadow: isLight(b) ? `0 0 0 6px ${alpha(col, 0.08)}, ${shadow(b, 1.4)}` : `0 0 80px ${alpha(col, 0.18)}, 0 30px 80px rgba(0,0,0,0.45)`,
          transform: `scale(${0.85 + 0.15 * p}) rotate(${(1 - p) * -2}deg)`,
          opacity: Math.min(1, p * 1.4),
          display: 'flex',
          gap: 50,
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            width: 120,
            height: 120,
            flex: '0 0 120px',
            borderRadius: 999,
            background: alpha(col, 0.16),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `2px solid ${alpha(col, 0.6)}`,
          }}
        >
          <Icon name={trap ? 'alert' : 'bulb'} size={66} color={col} />
        </div>
        <div style={{flex: 1}}>
          <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 28, letterSpacing: '0.24em', color: col, textTransform: 'uppercase', marginBottom: 22}}>
            {d.label ?? (trap ? 'DGCA exam trap' : 'DGCA exam tip')}
          </div>
          {lines.map((ln, i) => {
            const a = i === 0 ? 8 : cue(scene, i - 1 + (d.cueOffset ?? 0), lines.length);
            return (
              <div
                key={i}
                style={{
                  ...rise(f, a, 24),
                  fontFamily: F.head,
                  fontWeight: i === 0 ? 700 : 500,
                  fontSize: i === 0 ? d.size ?? 52 : 38,
                  lineHeight: 1.22,
                  color: i === 0 ? b.ink : alpha(b.ink, 0.82),
                  marginTop: i === 0 ? 0 : 22,
                }}
              >
                <Rich text={ln} color={col} />
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ RECAP checklist */
export const Recap: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const b = useBrand();
  const d = scene.data || {};
  const items: string[] = d.items || [];
  return (
    <AbsoluteFill>
      <SceneTitle kicker={d.kicker ?? 'Recap'} title={d.title ?? 'What you learned today'} f={f} />
      <div style={{position: 'absolute', left: PADX, right: PADX, top: 330, display: 'flex', flexDirection: 'column', gap: 26}}>
        {items.map((it, i) => {
          const a = cue(scene, i, items.length);
          const p = prog(f, a, 16);
          const tick = 'M 8 22 L 18 32 L 38 10';
          const ev = evolvePath(prog(f, a + 6, 14), tick);
          return (
            <div key={i} style={{display: 'flex', alignItems: 'center', gap: 30, opacity: Math.max(0.0, p), transform: `translateX(${(1 - p) * 50}px)`}}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  flex: '0 0 64px',
                  borderRadius: 18,
                  background: alpha(b.good, 0.14),
                  border: `2px solid ${alpha(b.good, 0.7)}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width={46} height={42} viewBox="0 0 46 42">
                  <path d={tick} fill="none" stroke={b.good} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" style={ev} />
                </svg>
              </div>
              <div style={{fontFamily: F.head, fontWeight: 600, fontSize: d.size ?? 42, color: b.ink, lineHeight: 1.2}}>
                <Rich text={it} />
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ OUTRO / next episode */
export const Outro: React.FC<{scene: Scene; channel?: {name: string; handle: string}; publishLine?: string}> = ({scene, channel, publishLine}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const ring = (f % 50) / 50;
  const bell = Math.sin(f / 3) * Math.max(0, 1 - (f % 60) / 18) * 14;
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', textAlign: 'center'}}>
      <div style={{...rise(f, 2, 20), fontFamily: F.head, fontWeight: 600, fontSize: 28, letterSpacing: '0.26em', color: b.accent, textTransform: 'uppercase'}}>Next lesson</div>
      <div
        style={{
          ...rise(f, 6, 30, 22),
          fontFamily: F.head,
          fontWeight: 700,
          fontSize: 96,
          letterSpacing: '-0.02em',
          color: b.ink,
          marginTop: 20,
          maxWidth: 1500,
          lineHeight: 1.05,
          textWrap: 'balance' as any,
        }}
      >
        <Rich text={d.next ?? ''} />
      </div>
      {d.nextSub ? (
        <div style={{...rise(f, 12, 20), fontFamily: F.body, fontSize: 38, color: alpha(b.ink, 0.72), marginTop: 22, maxWidth: 1300}}>
          <Rich text={d.nextSub} />
        </div>
      ) : null}
      <div
        style={{
          marginTop: 70,
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          padding: '22px 44px',
          borderRadius: 999,
          background: b.accent,
          color: onAccent(b),
          fontFamily: F.head,
          fontWeight: 700,
          fontSize: 40,
          transform: `scale(${0.8 + 0.2 * pop(f, fps, 18)})`,
          opacity: pop(f, fps, 18),
          boxShadow: `0 0 0 ${ring * 26}px ${alpha(b.accent, 0.25 * (1 - ring))}`,
        }}
      >
        <Icon name="bell" size={44} color={onAccent(b)} stroke={2.2} style={{transform: `rotate(${bell}deg)`}} />
        {d.cta ?? 'Subscribe & turn on notifications'}
      </div>
      <div style={{...rise(f, 26, 20), fontFamily: F.body, fontWeight: 500, fontSize: 30, color: alpha(b.ink, 0.6), marginTop: 34}}>
        {publishLine ?? 'A new DGCA lesson every day'}
        {channel?.name ? `  ·  ${channel.name}` : ''}
      </div>
    </AbsoluteFill>
  );
};
