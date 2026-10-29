import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/600.css';
import '@fontsource/source-serif-4/400-italic.css';
import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {CLAMP, cue, EASE, EASE_IN_OUT, lerp, prog} from '../anim';
import {Icon} from '../components/Icon';
import {Shot3D} from '../three/Shot3D';
import {alpha, F, Rich, useBrand} from '../theme';
import type {Scene, Timeline} from '../types';
import {Ann, Arrow, DrawPath, Highlight, MarkerPen, Sparkles, wobblePath} from './fx';

export {EASE_IN_OUT};
export const SERIF = '"Source Serif 4", Georgia, serif';
/** keep important content above this line: word captions live below it */
export const SAFE_BOTTOM = 880;
const PADX = 140;

const sp = (f: number, fps: number, at: number, damping = 14, stiffness = 190, mass = 0.6) =>
  spring({frame: f - at, fps, config: {damping, stiffness, mass}});
const cueOr = (scene: Scene, i: number | undefined, fallback: number) =>
  typeof i === 'number' && typeof scene.cues?.[i] === 'number' ? scene.cues[i] : fallback;

// ─── paper backgrounds ────────────────────────────────────────────────────────────────────
export type Tone = 'paper' | 'accent' | 'sky' | 'mint' | 'violet' | 'navy';

export function toneColors(tone: Tone | undefined, accent: string) {
  switch (tone) {
    case 'accent':
      return {bg: accent, ink: '#FFFFFF', soft: 'rgba(255,255,255,0.78)', dots: 'rgba(255,255,255,0.13)', dark: true};
    case 'sky':
      return {bg: '#1F6FB2', ink: '#FFFFFF', soft: 'rgba(255,255,255,0.78)', dots: 'rgba(255,255,255,0.12)', dark: true};
    case 'mint':
      return {bg: '#0E9F8E', ink: '#FFFFFF', soft: 'rgba(255,255,255,0.8)', dots: 'rgba(255,255,255,0.13)', dark: true};
    case 'violet':
      return {bg: '#6B5BD6', ink: '#FFFFFF', soft: 'rgba(255,255,255,0.8)', dots: 'rgba(255,255,255,0.13)', dark: true};
    case 'navy':
      return {bg: '#14305A', ink: '#FFFFFF', soft: 'rgba(255,255,255,0.75)', dots: 'rgba(255,255,255,0.08)', dark: true};
    case 'paper':
    default:
      return {bg: '#F8F5EF', ink: '#10213A', soft: 'rgba(16,33,58,0.62)', dots: 'rgba(16,33,58,0.075)', dark: false};
  }
}

/** Light paper (or bold colour) background with slowly moving colour blobs and a dot grid. */
export const Paper: React.FC<{tone?: Tone; children?: React.ReactNode}> = ({tone = 'paper', children}) => {
  const f = useCurrentFrame();
  const b = useBrand();
  const c = toneColors(tone, b.accent);
  const t = f / 30;
  const x1 = 22 + Math.sin(t * 0.21) * 9;
  const y1 = 28 + Math.cos(t * 0.17) * 8;
  const x2 = 78 + Math.sin(t * 0.15 + 2) * 8;
  const y2 = 72 + Math.cos(t * 0.19 + 1) * 9;
  const blobA = c.dark ? 'rgba(255,255,255,0.16)' : alpha(b.accent, 0.1);
  const blobB = c.dark ? 'rgba(0,0,0,0.10)' : alpha('#1F6FB2', 0.08);
  return (
    <AbsoluteFill style={{background: c.bg, overflow: 'hidden'}}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 46% 52% at ${x1}% ${y1}%, ${blobA} 0%, rgba(0,0,0,0) 70%), radial-gradient(ellipse 50% 46% at ${x2}% ${y2}%, ${blobB} 0%, rgba(0,0,0,0) 70%)${
            c.dark ? '' : ', radial-gradient(ellipse 60% 55% at 50% 40%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 70%)'
          }`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(${c.dots} 2px, transparent 2.4px)`,
          backgroundSize: '34px 34px',
          backgroundPosition: `${(f * 0.25) % 34}px ${(f * 0.12) % 34}px`,
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

// ─── kinetic typography ───────────────────────────────────────────────────────────────────
type KLine = string | {t: string; cue?: number; size?: number};
type Tok = {w: string; em: boolean};

function tokens(s: string): Tok[] {
  const out: Tok[] = [];
  String(s ?? '')
    .split(/(\*[^*]+\*)/g)
    .forEach((part) => {
      if (!part) return;
      const em = part.startsWith('*') && part.endsWith('*');
      const txt = em ? part.slice(1, -1) : part;
      txt
        .split(/\s+/)
        .filter(Boolean)
        .forEach((w) => out.push({w, em}));
    });
  return out;
}

/** Big words that pop in one by one (pattern interrupt / key statements). */
export const Kinetic: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const tone: Tone = d.tone ?? 'paper';
  const c = toneColors(tone, b.accent);
  const lines: {t: string; cue?: number; size?: number; delay?: number}[] = (d.lines || []).map((l: KLine) => (typeof l === 'string' ? {t: l} : l));
  const mode: 'replace' | 'stack' = d.mode ?? (lines.length > 2 ? 'replace' : 'stack');
  const short = lines.every((l) => l.t.replace(/\*/g, '').length <= 18);
  const baseSize = d.size ?? (short ? 120 : 96);
  const starts = lines.map((l: any, i) => cueOr(scene, l.cue, i === 0 ? 4 : Math.round(4 + (scene.dur * 0.8 * i) / lines.length)) + (l.delay ?? 0));
  const kickP = prog(f, 0, 14);
  return (
    <Paper tone={tone}>
      <AbsoluteFill style={{height: SAFE_BOTTOM, justifyContent: 'center', alignItems: d.align === 'left' ? 'flex-start' : 'center', padding: `0 ${PADX}px`}}>
        {d.kicker ? (
          <div
            style={{
              opacity: kickP,
              transform: `translateY(${(1 - kickP) * 16}px)`,
              fontFamily: F.head,
              fontWeight: 700,
              fontSize: 28,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: c.dark ? c.soft : b.accent,
              marginBottom: 26,
            }}
          >
            {d.kicker}
          </div>
        ) : null}
        <div style={{position: 'relative', display: 'grid', justifyItems: d.align === 'left' ? 'start' : 'center'}}>
          {lines.map((ln, li) => {
            const at = starts[li];
            const next = li + 1 < lines.length ? starts[li + 1] : Infinity;
            const vis = mode === 'stack' ? f >= at - 1 : f >= at - 1 && f < next + 8;
            if (!vis) return null;
            const out = mode === 'replace' && f >= next ? interpolate(f, [next, next + 7], [0, 1], CLAMP) : 0;
            const size = ln.size ?? baseSize;
            const toks = tokens(ln.t);
            return (
              <div
                key={li}
                style={{
                  gridArea: mode === 'replace' ? '1 / 1' : undefined,
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: d.align === 'left' ? 'flex-start' : 'center',
                  columnGap: size * 0.26,
                  rowGap: size * 0.06,
                  maxWidth: 1640,
                  opacity: 1 - out,
                  transform: `translateY(${-out * 40}px)`,
                  marginTop: mode === 'stack' && li > 0 ? size * 0.12 : 0,
                }}
              >
                {toks.map((tk, wi) => {
                  const wa = at + wi * 3;
                  const p = sp(f, fps, wa);
                  const o = interpolate(f, [wa, wa + 4], [0, 1], CLAMP);
                  const word = (
                    <span
                      style={{
                        fontFamily: F.head,
                        fontWeight: 800 as any,
                        fontSize: size,
                        lineHeight: 1.04,
                        letterSpacing: '-0.035em',
                        color: tk.em ? (c.dark ? '#FFFFFF' : b.accent) : c.ink,
                      }}
                    >
                      {tk.w}
                    </span>
                  );
                  return (
                    <span key={wi} style={{display: 'inline-block', opacity: o, transform: `translateY(${(1 - p) * 44}px) scale(${0.86 + 0.14 * p})`}}>
                      {tk.em ? (
                        c.dark ? (
                          <span style={{position: 'relative', display: 'inline-block'}}>
                            {word}
                            <span
                              style={{
                                position: 'absolute',
                                left: 0,
                                right: 0,
                                bottom: -size * 0.04,
                                height: size * 0.08,
                                borderRadius: size * 0.04,
                                background: '#FFFFFF',
                                transform: `scaleX(${prog(f, wa + 6, 12)})`,
                                transformOrigin: 'left center',
                              }}
                            />
                          </span>
                        ) : (
                          <Highlight at={wa + 5}>{word}</Highlight>
                        )
                      ) : (
                        word
                      )}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
        {d.sub ? (
          <div style={{opacity: prog(f, starts[starts.length - 1] + 12, 14), fontFamily: F.body, fontWeight: 500, fontSize: 36, color: c.soft, marginTop: 34, textAlign: 'center', maxWidth: 1400}}>
            <Rich text={d.sub} color={c.dark ? '#FFFFFF' : b.accent} />
          </div>
        ) : null}
      </AbsoluteFill>
    </Paper>
  );
};

// ─── document close-up ────────────────────────────────────────────────────────────────────
const Emblem: React.FC<{color: string; size?: number}> = ({color, size = 120}) => (
  <svg width={size} height={size} viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="54" fill="none" stroke={color} strokeWidth="3" />
    <circle cx="60" cy="60" r="44" fill="none" stroke={color} strokeWidth="1.5" />
    {/* stylised globe */}
    <circle cx="60" cy="60" r="22" fill="none" stroke={color} strokeWidth="2.2" />
    <ellipse cx="60" cy="60" rx="10" ry="22" fill="none" stroke={color} strokeWidth="1.6" />
    <line x1="38" y1="60" x2="82" y2="60" stroke={color} strokeWidth="1.6" />
    {/* wings */}
    {[-1, 1].map((s) => (
      <g key={s} transform={`translate(60 60) scale(${s} 1)`}>
        <path d="M24,-4 C34,-14 44,-18 52,-16 C46,-12 40,-8 36,-2 Z" fill={color} />
        <path d="M24,3 C32,-4 40,-6 47,-5 C42,-1 37,2 33,6 Z" fill={color} opacity="0.8" />
      </g>
    ))}
    {/* laurel dots */}
    {Array.from({length: 18}).map((_, i) => {
      const a = (Math.PI * (0.15 + (i / 17) * 0.7) + Math.PI / 2) * 1;
      const r = 49;
      return <circle key={i} cx={60 + Math.cos(a) * r} cy={60 + Math.sin(a) * r} r="1.8" fill={color} />;
    })}
  </svg>
);

/** A document page in perspective: a heading, text lines, a marker sweep on the key line, an optional stamp. */
export const Doc: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const pageLeft = d.side === 'left';
  const p = interpolate(f, [0, Math.max(1, scene.dur)], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  const enter = sp(f, fps, 0, 18, 120, 0.9);
  const lines: string[] = d.lines || [];
  const hlLine: number = d.hl?.line ?? -1;
  const hlAt = cueOr(scene, d.hl?.cue, 30);
  const zoomAt = d.zoom ? cueOr(scene, d.zoom.cue, hlAt) : Infinity;
  const zp = d.zoom ? sp(f, fps, zoomAt, 22, 90, 1) : 0;
  const zs = lerp(1, d.zoom?.scale ?? 1.35, zp);
  const stampAt = d.stamp ? cueOr(scene, d.stamp.cue, scene.dur - 40) : Infinity;
  const stampP = d.stamp ? sp(f, fps, stampAt, 11, 220, 0.7) : 0;
  const PW = 860;
  const PH = 1180;
  const scale = 0.84;
  const pageX = pageLeft ? PADX - 20 : 1920 - PADX - PW * scale + 20;
  const pageY = 34;
  // y position of the highlighted line inside the page (for the zoom origin)
  let hlY = 330;
  let yy = 300;
  lines.forEach((ln, i) => {
    const h = ln.startsWith('# ') ? 64 : 50;
    if (i === hlLine) hlY = yy + h / 2;
    yy += h;
  });
  const rotY = (pageLeft ? 1 : -1) * lerp(16, 7, p);
  return (
    <Paper tone="paper">
      {/* title block */}
      <div style={{position: 'absolute', top: 0, height: SAFE_BOTTOM, display: 'flex', flexDirection: 'column', justifyContent: 'center', left: pageLeft ? 1920 - PADX - 760 : PADX, width: 760}}>
        {d.kicker ? (
          <div style={{opacity: prog(f, 4, 14), fontFamily: F.head, fontWeight: 700, fontSize: 26, letterSpacing: '0.22em', textTransform: 'uppercase', color: b.accent, marginBottom: 20}}>
            {d.kicker}
          </div>
        ) : null}
        {d.title ? (
          <div
            style={{
              opacity: prog(f, 8, 16),
              transform: `translateY(${(1 - prog(f, 8, 20)) * 30}px)`,
              fontFamily: F.head,
              fontWeight: 800 as any,
              fontSize: d.titleSize ?? 72,
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
          <div style={{opacity: prog(f, 16, 16), fontFamily: F.body, fontSize: 34, lineHeight: 1.35, color: alpha(b.ink, 0.66), marginTop: 22}}>
            <Rich text={d.sub} />
          </div>
        ) : null}
      </div>
      {/* the page */}
      <div
        style={{
          position: 'absolute',
          left: pageX,
          top: pageY,
          width: PW,
          height: PH,
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
        }}
      >
        <div
          style={{
            width: PW,
            height: PH,
            transformOrigin: `50% ${hlY}px`,
            transform: `perspective(2200px) translateY(${(1 - enter) * 120}px) rotateY(${rotY}deg) rotateX(${lerp(9, 5, p)}deg) scale(${zs})`,
            opacity: enter,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, #FFFEFB 0%, #FBF8F1 100%)',
              borderRadius: 10,
              boxShadow: '0 40px 90px rgba(16,33,58,0.22), 0 6px 18px rgba(16,33,58,0.1)',
              padding: '70px 80px',
              overflow: 'hidden',
            }}
          >
            <div style={{display: 'flex', justifyContent: 'center', marginBottom: 14}}>
              <Emblem color="#2B4A73" size={104} />
            </div>
            {d.header ? (
              <div style={{textAlign: 'center', fontFamily: SERIF, fontWeight: 600, fontSize: 30, letterSpacing: '0.08em', color: '#1C2B44', textTransform: 'uppercase', lineHeight: 1.25}}>
                {d.header}
              </div>
            ) : null}
            {d.headerSub ? <div style={{textAlign: 'center', fontFamily: SERIF, fontStyle: 'italic', fontSize: 24, color: '#5A6678', marginTop: 8}}>{d.headerSub}</div> : null}
            <div style={{height: 2, background: '#D9D2C3', margin: '26px 0 24px'}} />
            {lines.map((ln, i) => {
              const head = ln.startsWith('# ');
              const txt = head ? ln.slice(2) : ln;
              const isHl = i === hlLine;
              const hp = isHl ? interpolate(f, [hlAt, hlAt + 14], [0, 1], {...CLAMP, easing: EASE}) : 0;
              return (
                <div key={i} style={{position: 'relative', height: head ? 64 : 50, display: 'flex', alignItems: 'center'}}>
                  {isHl ? (
                    <div
                      style={{
                        position: 'absolute',
                        left: -10,
                        right: -10,
                        top: 6,
                        bottom: 6,
                        background: 'rgba(255,201,60,0.55)',
                        borderRadius: 6,
                        transform: `scaleX(${hp})`,
                        transformOrigin: 'left center',
                      }}
                    />
                  ) : null}
                  <div
                    style={{
                      position: 'relative',
                      fontFamily: SERIF,
                      fontWeight: head ? 600 : 400,
                      fontSize: head ? 34 : 29,
                      color: head ? '#14233C' : '#2C3A50',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'clip',
                      maxWidth: PW - 160,
                    }}
                  >
                    {txt}
                  </div>
                </div>
              );
            })}
            {/* filler text lines */}
            <div style={{marginTop: 18}}>
              {Array.from({length: 14}).map((_, i) => (
                <div key={i} style={{height: 12, borderRadius: 6, background: '#E7E1D4', width: `${[92, 86, 95, 70, 88, 93, 60, 90, 84, 96, 74, 89, 91, 66][i]}%`, marginBottom: 22}} />
              ))}
            </div>
          </div>
          {d.stamp && f >= stampAt ? (
            <div
              style={{
                position: 'absolute',
                right: 70,
                top: Math.min(hlY + 140, 820),
                transform: `rotate(-12deg) scale(${lerp(2.2, 1, stampP)})`,
                opacity: Math.min(1, stampP * 1.4),
                border: '6px solid #D9363E',
                borderRadius: 14,
                padding: '10px 26px',
                fontFamily: F.head,
                fontWeight: 850 as any,
                fontSize: 44,
                letterSpacing: '0.06em',
                color: '#D9363E',
                textTransform: 'uppercase',
                background: 'rgba(255,255,255,0.35)',
                mixBlendMode: 'multiply',
              }}
            >
              {d.stamp.text}
            </div>
          ) : null}
        </div>
      </div>
    </Paper>
  );
};

// ─── split: 3D card + points ──────────────────────────────────────────────────────────────
export const Split: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const v = d.visual || {};
  const cardLeft = d.side !== 'right';
  const CW = 960;
  const CH = 740;
  const cardX = cardLeft ? 110 : 1920 - 110 - CW;
  const cardY = 100;
  const cp = sp(f, fps, 0, 18, 110, 0.9);
  const items: {icon?: string; t: string; sub?: string}[] = d.items || [];
  const textX = cardLeft ? cardX + CW + 80 : PADX;
  const textW = 1920 - CW - 110 - 80 - PADX;
  return (
    <Paper tone="paper">
      <div
        style={{
          position: 'absolute',
          left: cardX,
          top: cardY,
          width: CW,
          height: CH,
          borderRadius: 40,
          overflow: 'hidden',
          boxShadow: '0 40px 80px rgba(16,33,58,0.22), 0 8px 20px rgba(16,33,58,0.1)',
          transform: `translateX(${(1 - cp) * (cardLeft ? -80 : 80)}px) scale(${0.94 + 0.06 * cp})`,
          opacity: cp,
          background: '#DCE7F3',
        }}
      >
        <Shot3D kind={v.shot === 'takeoff' ? 'takeoff' : 'cruise'} view={v.view ?? 'front'} frame={f} dur={scene.dur + 10} width={CW} height={CH} tau0={v.tau0} />
        {d.tag ? (
          <div
            style={{
              position: 'absolute',
              left: 30,
              top: 30,
              padding: '10px 20px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.92)',
              fontFamily: F.head,
              fontWeight: 750 as any,
              fontSize: 26,
              color: b.ink,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 8px 20px rgba(16,33,58,0.15)',
            }}
          >
            <span style={{width: 12, height: 12, borderRadius: 6, background: b.accent}} />
            {d.tag}
          </div>
        ) : null}
      </div>
      <div style={{position: 'absolute', left: textX, top: cardY, width: textW, height: CH, display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
        {d.kicker ? (
          <div style={{opacity: prog(f, 6, 14), fontFamily: F.head, fontWeight: 700, fontSize: 24, letterSpacing: '0.2em', textTransform: 'uppercase', color: b.accent, marginBottom: 16}}>
            {d.kicker}
          </div>
        ) : null}
        {d.title ? (
          <div
            style={{
              opacity: prog(f, 10, 14),
              transform: `translateY(${(1 - prog(f, 10, 18)) * 24}px)`,
              fontFamily: F.head,
              fontWeight: 800 as any,
              fontSize: d.titleSize ?? 58,
              lineHeight: 1.06,
              letterSpacing: '-0.03em',
              color: b.ink,
              marginBottom: 34,
              textWrap: 'balance' as any,
            }}
          >
            <Rich text={d.title} />
          </div>
        ) : null}
        {items.map((it, i) => {
          const at = cue(scene, i, items.length, 18);
          const ip = sp(f, fps, at);
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 22,
                marginBottom: 22,
                opacity: interpolate(f, [at, at + 5], [0, 1], CLAMP),
                transform: `translateX(${(1 - ip) * 40}px)`,
              }}
            >
              <div
                style={{
                  width: 74,
                  height: 74,
                  borderRadius: 20,
                  background: b.accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: '0 0 auto',
                  transform: `scale(${0.6 + 0.4 * ip})`,
                  boxShadow: `0 10px 22px ${alpha(b.accent, 0.3)}`,
                }}
              >
                <Icon name={it.icon ?? 'check'} size={42} color="#FFFFFF" />
              </div>
              <div>
                <div style={{fontFamily: F.head, fontWeight: 750 as any, fontSize: 36, color: b.ink, lineHeight: 1.15}}>
                  <Rich text={it.t} />
                </div>
                {it.sub ? <div style={{fontFamily: F.body, fontSize: 26, color: alpha(b.ink, 0.62), marginTop: 4}}>{it.sub}</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </Paper>
  );
};

// ─── exam cards ───────────────────────────────────────────────────────────────────────────
const VARIANTS: Record<string, {label: string; color: string; icon: string}> = {
  exam: {label: 'DGCA Exam Tip', color: '#EE6A1A', icon: 'target'},
  trap: {label: 'Exam Trap', color: '#D9363E', icon: 'alert'},
  key: {label: 'Key Point', color: '#1F6FB2', icon: 'bulb'},
  dyk: {label: 'Did you know?', color: '#0E9F8E', icon: 'sparkles'},
  easa: {label: 'EASA · UK CAA note', color: '#6B5BD6', icon: 'world'},
  remember: {label: 'Remember it', color: '#F5A524', icon: 'brain'},
};

export const ExamTip: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const V = VARIANTS[d.variant ?? 'exam'] ?? VARIANTS.exam;
  const card = sp(f, fps, 0, 16, 150, 0.8);
  const band = sp(f, fps, 3, 18, 160, 0.7);
  const X = 150;
  const Y = 118;
  const W = 1620;
  const H = 724;
  const BW = 330;
  const wrongAt = cueOr(scene, d.wrongCue, 26);
  const rightAt = cueOr(scene, d.rightCue, wrongAt + 40);
  // strike the wrong answer just before the correction is spoken
  const wrongStrike = d.right ? Math.max(wrongAt + 8, rightAt - 8) : wrongAt + 10;
  const lines: string[] = d.lines || [];
  const lineCues: number[] = d.lineCues || [];
  const contentX = X + BW + 70;
  const contentW = W - BW - 140;
  return (
    <Paper tone="paper">
      <AbsoluteFill style={{background: `radial-gradient(ellipse 70% 60% at 30% 40%, ${alpha(V.color, 0.1)} 0%, rgba(0,0,0,0) 70%)`}} />
      <div
        style={{
          position: 'absolute',
          left: X,
          top: Y,
          width: W,
          height: H,
          borderRadius: 38,
          background: '#FFFFFF',
          boxShadow: '0 40px 90px rgba(16,33,58,0.16), 0 6px 16px rgba(16,33,58,0.06)',
          overflow: 'hidden',
          transform: `translateY(${(1 - card) * 70}px) scale(${0.95 + 0.05 * card})`,
          opacity: interpolate(f, [0, 6], [0, 1], CLAMP),
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: BW,
            background: V.color,
            transform: `scaleY(${band})`,
            transformOrigin: 'top',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 26,
            padding: 30,
          }}
        >
          <div
            style={{
              width: 150,
              height: 150,
              borderRadius: 75,
              background: 'rgba(255,255,255,0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `scale(${sp(f, fps, 8, 10, 200, 0.6)}) rotate(${interpolate(f, [8, 22], [-20, 0], CLAMP)}deg)`,
            }}
          >
            <Icon name={V.icon} size={92} color="#FFFFFF" stroke={2.2} />
          </div>
          <div style={{fontFamily: F.head, fontWeight: 800 as any, fontSize: 34, lineHeight: 1.12, color: '#FFFFFF', textAlign: 'center', letterSpacing: '-0.01em'}}>
            {d.label ?? V.label}
          </div>
        </div>
        <div style={{position: 'absolute', left: contentX - X, top: 0, width: contentW, height: H, display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
          {d.q ? (
            <div style={{opacity: prog(f, 10, 12), transform: `translateY(${(1 - prog(f, 10, 16)) * 18}px)`, fontFamily: F.head, fontWeight: 700, fontSize: 44, lineHeight: 1.2, color: b.ink, marginBottom: 30}}>
              <Rich text={d.q} color={V.color} />
            </div>
          ) : null}
          {d.wrong ? (
            <div style={{position: 'relative', alignSelf: 'flex-start', opacity: prog(f, wrongAt, 10), marginBottom: 22}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 16, fontFamily: F.head, fontWeight: 700, fontSize: 46, color: alpha('#D9363E', 0.85)}}>
                <Icon name="x" size={46} color="#D9363E" stroke={3} />
                <span>{d.wrong}</span>
              </div>
              <svg style={{position: 'absolute', left: 60, top: 0, overflow: 'visible'}} width={10} height={10}>
                <DrawPath d={`M0,32 C${120},26 ${240},36 ${Math.max(200, String(d.wrong).length * 25)},28`} at={wrongStrike} dur={10} color="#D9363E" width={6} />
              </svg>
            </div>
          ) : null}
          {d.right ? (
            <div
              style={{
                alignSelf: 'flex-start',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '14px 26px',
                borderRadius: 18,
                background: alpha('#15803D', 0.1),
                border: `3px solid ${alpha('#15803D', 0.6)}`,
                fontFamily: F.head,
                fontWeight: 800 as any,
                fontSize: 50,
                color: '#15803D',
                transform: `scale(${f >= rightAt ? sp(f, fps, rightAt, 11, 200, 0.6) : 0})`,
                transformOrigin: 'left center',
                marginBottom: 22,
              }}
            >
              <Icon name="check" size={50} color="#15803D" stroke={3} />
              <Rich text={d.right} color="#0F6A31" />
            </div>
          ) : null}
          {d.big ? (
            <div
              style={{
                opacity: prog(f, cueOr(scene, d.bigCue, 12), 12),
                transform: `scale(${0.9 + 0.1 * sp(f, fps, cueOr(scene, d.bigCue, 12))})`,
                transformOrigin: 'left center',
                fontFamily: F.head,
                fontWeight: 850 as any,
                fontSize: d.bigSize ?? 84,
                lineHeight: 1.04,
                letterSpacing: '-0.03em',
                color: b.ink,
                marginBottom: 20,
                textWrap: 'balance' as any,
              }}
            >
              <Rich text={d.big} color={V.color} />
            </div>
          ) : null}
          {lines.map((ln, i) => {
            const at = typeof lineCues[i] === 'number' ? cueOr(scene, lineCues[i], 20 + i * 24) : 20 + i * 24;
            const lp = sp(f, fps, at);
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 18,
                  marginBottom: 16,
                  opacity: interpolate(f, [at, at + 5], [0, 1], CLAMP),
                  transform: `translateX(${(1 - lp) * 30}px)`,
                }}
              >
                <div style={{width: 16, height: 16, borderRadius: 8, background: V.color, marginTop: 18, flex: '0 0 auto'}} />
                <div style={{fontFamily: F.body, fontWeight: 550 as any, fontSize: 40, lineHeight: 1.3, color: b.ink}}>
                  <Rich text={ln} color={V.color} />
                </div>
              </div>
            );
          })}
          {d.sub ? (
            <div style={{opacity: prog(f, cueOr(scene, d.subCue, 40), 14), fontFamily: F.body, fontSize: 30, lineHeight: 1.35, color: alpha(b.ink, 0.6), marginTop: 14}}>
              <Rich text={d.sub} color={V.color} />
            </div>
          ) : null}
        </div>
      </div>
      <Ann>
        <Sparkles x={X + BW / 2} y={Y + H / 2 - 50} at={10} color={V.color} size={110} n={12} />
        {d.right ? <Sparkles x={contentX + 60} y={Y + H / 2} at={rightAt + 4} color="#15803D" size={80} /> : null}
      </Ann>
    </Paper>
  );
};

// ─── kinetic number ───────────────────────────────────────────────────────────────────────
export const Count: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const at = cueOr(scene, d.cue ?? 0, 8);
  const cf = d.countFrames ?? 40;
  const p = interpolate(f, [at, at + cf], [0, 1], {...CLAMP, easing: EASE});
  const from = d.from ?? 0;
  const val = Math.round(lerp(from, d.value ?? 0, p));
  const done = f >= at + cf;
  const bump = done ? 1 + 0.06 * Math.max(0, 1 - (f - at - cf) / 10) : 1;
  const nDots: number = d.dots ?? 0;
  const cols = nDots > 120 ? 16 : nDots > 60 ? 12 : 10;
  const lit = Math.round(lerp(0, nDots, p));
  const dot = nDots > 120 ? 30 : 40;
  const gap = nDots > 120 ? 10 : 14;
  return (
    <Paper tone={d.tone ?? 'paper'}>
      <AbsoluteFill style={{height: SAFE_BOTTOM, flexDirection: 'row', alignItems: 'center', justifyContent: nDots ? 'space-between' : 'center', padding: `0 ${PADX + 20}px`}}>
        <div style={{maxWidth: nDots ? 900 : 1500, textAlign: nDots ? 'left' : 'center'}}>
          {d.kicker ? (
            <div style={{opacity: prog(f, 0, 12), fontFamily: F.head, fontWeight: 700, fontSize: 28, letterSpacing: '0.22em', textTransform: 'uppercase', color: b.accent, marginBottom: 10}}>
              {d.kicker}
            </div>
          ) : null}
          <div
            style={{
              fontFamily: F.head,
              fontWeight: 850 as any,
              fontSize: d.size ?? 260,
              lineHeight: 1,
              letterSpacing: '-0.05em',
              color: b.accent,
              fontVariantNumeric: 'tabular-nums',
              transform: `scale(${bump})`,
              transformOrigin: nDots ? 'left center' : 'center',
              opacity: interpolate(f, [at - 4, at + 2], [0, 1], CLAMP),
            }}
          >
            {d.prefix ?? ''}
            {val.toLocaleString('en-IN')}
            {d.suffix ?? ''}
          </div>
          {d.label ? (
            <div style={{opacity: prog(f, at + 6, 14), fontFamily: F.head, fontWeight: 750 as any, fontSize: 56, lineHeight: 1.1, color: b.ink, marginTop: 12, letterSpacing: '-0.02em'}}>
              <Rich text={d.label} />
            </div>
          ) : null}
          {d.sub ? (
            <div style={{opacity: prog(f, at + cf, 14), fontFamily: F.body, fontSize: 34, lineHeight: 1.35, color: alpha(b.ink, 0.62), marginTop: 18}}>
              <Rich text={d.sub} />
            </div>
          ) : null}
        </div>
        {nDots ? (
          <div style={{opacity: prog(f, 2, 12)}}>
            <div style={{display: 'grid', gridTemplateColumns: `repeat(${cols}, ${dot}px)`, gap}}>
              {Array.from({length: nDots}).map((_, i) => {
                const on = i < lit;
                const justOn = on && i >= lit - cols;
                return (
                  <div
                    key={i}
                    style={{
                      width: dot,
                      height: dot,
                      borderRadius: dot / 2,
                      background: on ? b.accent : alpha(b.ink, 0.08),
                      transform: `scale(${justOn ? 1.15 : 1})`,
                      boxShadow: on ? `0 4px 10px ${alpha(b.accent, 0.25)}` : 'none',
                    }}
                  />
                );
              })}
            </div>
            {d.dotsLabel ? (
              <div style={{marginTop: 22, fontFamily: F.head, fontWeight: 650 as any, fontSize: 28, color: alpha(b.ink, 0.6), textAlign: 'center', width: cols * dot + (cols - 1) * gap}}>
                {d.dotsLabel}
              </div>
            ) : null}
          </div>
        ) : null}
      </AbsoluteFill>
      <Ann>{done ? <Sparkles x={nDots ? PADX + 260 : 960} y={SAFE_BOTTOM / 2 - 60} at={at + cf} size={150} n={14} /> : null}</Ann>
    </Paper>
  );
};

// ─── whiteboard ───────────────────────────────────────────────────────────────────────────
type WNode = {id: string; label: string; sub?: string; x: number; y: number; w?: number; h?: number; cue?: number; color?: string};
type WEdge = {from: string; to: string; cue?: number; label?: string; color?: string; bend?: number};
type WNote = {x: number; y: number; text: string; cue?: number; color?: string; size?: number; rot?: number};

function roundedWobble(x: number, y: number, w: number, h: number, r: number, seed: number) {
  const j = (k: number) => Math.sin(seed * 7.1 + k * 3.3) * 2.2;
  return `M${x + r},${y + j(1)} L${x + w - r},${y + j(2)} Q${x + w + j(3)},${y} ${x + w + j(4)},${y + r} L${x + w + j(5)},${y + h - r} Q${x + w},${y + h + j(6)} ${x + w - r},${y + h + j(7)} L${x + r},${y + h + j(8)} Q${x + j(9)},${y + h} ${x + j(10)},${y + h - r} L${x + j(11)},${y + r} Q${x},${y + j(12)} ${x + r + 6},${y + j(13) - 1}`;
}

/** Original line drawing of an early canard biplane (1903-style) in three-quarter view, drawn stroke by stroke. */
const WrightFlyer: React.FC<{x: number; y: number; s?: number; at: number; color: string}> = ({x, y, s = 1, at, color}) => {
  // wings recede to the upper right; G = vertical gap between the wings
  const G = 74;
  const LE0: [number, number] = [70, 120];
  const LE1: [number, number] = [610, 40];
  const chord: [number, number] = [66, 40];
  const pt = (t: number, dy = 0, back = 0): [number, number] => [LE0[0] + (LE1[0] - LE0[0]) * t + chord[0] * back, LE0[1] + (LE1[1] - LE0[1]) * t + chord[1] * back + dy];
  const P = (q: [number, number]) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`;
  const wing = (dy: number) => `M${P(pt(0, dy))} L${P(pt(1, dy))} L${P(pt(1, dy, 1))} L${P(pt(0, dy, 1))} Z`;
  const paths: string[] = [
    wing(0),
    wing(G),
    ...[0, 0.2, 0.4, 0.6, 0.8, 1].flatMap((t) => [`M${P(pt(t, 0, 0.12))} L${P(pt(t, G, 0.12))}`, `M${P(pt(t, 0, 0.88))} L${P(pt(t, G, 0.88))}`]),
    // canard (front elevator) on outriggers
    'M-120,150 L40,128 L58,140 L-102,163 Z',
    'M-112,186 L48,164 L66,176 L-94,199 Z',
    `M40,134 L${P(pt(0.2, 0, 0.1))}`,
    `M48,170 L${P(pt(0.2, G, 0.1))}`,
    // twin rudders behind
    `M${P(pt(0.42, -18, 2.3))} L${P(pt(0.42, G + 14, 2.3))} L${P(pt(0.42, G + 14, 2.75))} L${P(pt(0.42, -18, 2.75))} Z`,
    `M${P(pt(0.58, -18, 2.3))} L${P(pt(0.58, G + 14, 2.3))} L${P(pt(0.58, G + 14, 2.75))} L${P(pt(0.58, -18, 2.75))} Z`,
    `M${P(pt(0.42, G / 2, 1))} L${P(pt(0.42, G / 2, 2.3))}`,
    `M${P(pt(0.58, G / 2, 1))} L${P(pt(0.58, G / 2, 2.3))}`,
  ];
  const sk = (t: number) => {
    const a = pt(t, G + 26, 0.9);
    const b = pt(t, G + 26, -0.6);
    return `M${P(a)} L${P(b)} C${(b[0] - 70).toFixed(1)},${(b[1] + 6).toFixed(1)} ${(b[0] - 130).toFixed(1)},${(b[1] - 20).toFixed(1)} -100,190`;
  };
  paths.push(sk(0.3), sk(0.5));
  // two pusher propellers behind the wings
  const props = [0.33, 0.67].map((t) => pt(t, G / 2, 1.35));
  // the pilot lying on the lower wing
  const pilot = pt(0.45, G - 8, 0.35);
  const n0 = paths.length * 2;
  const f = useCurrentFrame();
  const fillOp = (i: number) => 0.9 * prog(f, at + i * 2 + 10, 12);
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d={wing(G)} fill="#F4EAD5" opacity={fillOp(1)} />
      <path d={wing(0)} fill="#F8F0DE" opacity={fillOp(0)} />
      <path d="M-120,150 L40,128 L58,140 L-102,163 Z M-112,186 L48,164 L66,176 L-94,199 Z" fill="#F4EAD5" opacity={fillOp(14)} />
      {paths.map((d, i) => (
        <DrawPath key={i} d={d} at={at + i * 2} dur={11} color={color} width={3.6 / s} />
      ))}
      {props.map((q, i) => (
        <DrawPath key={'p' + i} d={`M${q[0] - 6},${q[1] - 42} C${q[0] + 8},${q[1] - 20} ${q[0] - 8},${q[1] + 20} ${q[0] + 6},${q[1] + 42}`} at={at + n0 + i * 4} dur={10} color={color} width={4 / s} />
      ))}
      <DrawPath d={`M${pilot[0] - 18},${pilot[1] + 4} L${pilot[0] + 22},${pilot[1] - 6}`} at={at + n0 + 10} dur={8} color={color} width={5 / s} />
      <DrawPath d={`M${pilot[0] + 23},${pilot[1] - 10} a7,7 0 1,0 14,0 a7,7 0 1,0 -14,0`} at={at + n0 + 12} dur={8} color={color} width={4 / s} />
    </g>
  );
};

export const Whiteboard: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const b = useBrand();
  const d = scene.data || {};
  const nodes: WNode[] = d.nodes || [];
  const edges: WEdge[] = d.edges || [];
  const notes: WNote[] = d.notes || [];
  const byId: Record<string, WNode> = {};
  nodes.forEach((n) => (byId[n.id] = n));
  const atOf = (c: number | undefined, i: number) => cueOr(scene, c, 8 + i * 18);
  const ink = '#1B2B44';
  const edgePt = (a: WNode, bx: number, by: number) => {
    const w = a.w ?? 300;
    const h = a.h ?? 120;
    const cx = a.x + w / 2;
    const cy = a.y + h / 2;
    const dx = bx - cx;
    const dy = by - cy;
    const k = Math.min(Math.abs((w / 2 + 14) / (dx || 1e-6)), Math.abs((h / 2 + 14) / (dy || 1e-6)));
    return [cx + dx * k, cy + dy * k];
  };
  // camera that follows the pen: frames the drawing, then each new node, then pulls back to the whole board
  const follow = d.follow ?? nodes.length >= 3;
  const Z = d.followZoom ?? 1.32;
  const FY = SAFE_BOTTOM / 2 + 40;
  const keysCam: {t: number; cx: number; cy: number; z: number}[] = [];
  if (follow) {
    const ds = d.drawingAt?.s ?? 1;
    const draw = d.drawing === 'wright' ? {x: (d.drawingAt?.x ?? 1180) + 260 * ds, y: (d.drawingAt?.y ?? 300) + 110 * ds} : null;
    const n0 = nodes[0];
    const n0c = n0 ? {x: n0.x + (n0.w ?? 300) / 2, y: n0.y + (n0.h ?? 120) / 2} : {x: 960, y: FY};
    keysCam.push(draw ? {t: 0, cx: (draw.x + n0c.x) / 2, cy: (draw.y + n0c.y) / 2, z: 1.08} : {t: 0, cx: n0c.x, cy: n0c.y - 40, z: Z});
    nodes.forEach((n, i) => {
      if (i === 0) return;
      keysCam.push({t: atOf(n.cue, i) - 6, cx: n.x + (n.w ?? 300) / 2 - 120, cy: n.y + (n.h ?? 120) / 2 - 60, z: Z});
    });
    const lastT = keysCam[keysCam.length - 1].t;
    keysCam.push({t: Math.max(lastT + 70, scene.dur - 70), cx: 960, cy: FY, z: 1.0});
    keysCam.sort((p, q) => p.t - q.t);
  }
  let cam = {cx: 960, cy: FY, z: 1};
  if (follow && keysCam.length) {
    cam = {cx: keysCam[0].cx, cy: keysCam[0].cy, z: keysCam[0].z};
    for (let i = 1; i < keysCam.length; i++) {
      const k = keysCam[i];
      if (f < k.t) break;
      const u = interpolate(f, [k.t, k.t + 22], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
      cam = {cx: lerp(cam.cx, k.cx, u), cy: lerp(cam.cy, k.cy, u), z: lerp(cam.z, k.z, u)};
    }
    // keep the camera over the board
    const halfW = 960 / cam.z;
    const halfH = 540 / cam.z;
    cam.cx = Math.max(halfW - 200, Math.min(1920 - halfW + 200, cam.cx));
    cam.cy = Math.max(halfH - 160, Math.min(1080 - halfH + 120, cam.cy));
  }
  const camStyle: React.CSSProperties = follow ? {transform: `translate(${960 - cam.cx * cam.z}px, ${FY - cam.cy * cam.z}px) scale(${cam.z})`, transformOrigin: '0 0'} : {};
  return (
    <AbsoluteFill style={{background: '#FBFAF6'}}>
      <AbsoluteFill style={camStyle}>
      <div
        style={{
          position: 'absolute',
          left: -400,
          top: -300,
          right: -400,
          bottom: -300,
          backgroundImage:
            'linear-gradient(rgba(31,111,178,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(31,111,178,0.07) 1px, transparent 1px), linear-gradient(rgba(31,111,178,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(31,111,178,0.035) 1px, transparent 1px)',
          backgroundSize: '160px 160px, 160px 160px, 40px 40px, 40px 40px',
          backgroundPosition: '0px 0px',
        }}
      />
      <Ann>
        {d.drawing === 'wright' ? <WrightFlyer x={d.drawingAt?.x ?? 1180} y={d.drawingAt?.y ?? 300} s={d.drawingAt?.s ?? 1} at={4} color={ink} /> : null}
        {nodes.map((n, i) => {
          const at = atOf(n.cue, i);
          const w = n.w ?? 300;
          const h = n.h ?? 120;
          return <DrawPath key={n.id} d={roundedWobble(n.x, n.y, w, h, 22, i + 1)} at={at} dur={16} color={n.color ?? ink} width={4.5} pen />;
        })}
        {edges.map((e, i) => {
          const A = byId[e.from];
          const B = byId[e.to];
          if (!A || !B) return null;
          const at = cueOr(scene, e.cue, atOf(B.cue, nodes.indexOf(B)) + 4);
          const bc = [B.x + (B.w ?? 300) / 2, B.y + (B.h ?? 120) / 2];
          const ac = [A.x + (A.w ?? 300) / 2, A.y + (A.h ?? 120) / 2];
          const [x1, y1] = edgePt(A, bc[0], bc[1]);
          const [x2, y2] = edgePt(B, ac[0], ac[1]);
          return <Arrow key={i} x1={x1} y1={y1} x2={x2} y2={y2} at={at} color={e.color ?? b.accent} width={5} bend={e.bend ?? 0.1} head={22} />;
        })}
        {(d.circles || []).map((c: any, i: number) => (
          <MarkerPen key={i} d={wobblePath(c.x + c.w / 2, c.y + c.h / 2, c.w / 2 + 20, c.h / 2 + 16, i + 3)} at={cueOr(scene, c.cue, 30)} color={c.color ?? b.accent} />
        ))}
      </Ann>
      {nodes.map((n, i) => {
        const at = atOf(n.cue, i) + 8;
        const w = n.w ?? 300;
        const h = n.h ?? 120;
        const p = prog(f, at, 10);
        return (
          <div
            key={n.id}
            style={{
              position: 'absolute',
              left: n.x,
              top: n.y,
              width: w,
              height: h,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              opacity: p,
              transform: `scale(${0.92 + 0.08 * p})`,
              padding: '0 14px',
            }}
          >
            <div style={{fontFamily: F.head, fontWeight: 800 as any, fontSize: n.label.length > 16 ? 30 : 36, lineHeight: 1.1, color: n.color ?? ink}}>
              <Rich text={n.label} />
            </div>
            {n.sub ? <div style={{fontFamily: F.body, fontWeight: 500, fontSize: 22, color: alpha(ink, 0.62), marginTop: 6}}>{n.sub}</div> : null}
          </div>
        );
      })}
      {edges.map((e, i) =>
        e.label ? (
          (() => {
            const A = byId[e.from];
            const B = byId[e.to];
            if (!A || !B) return null;
            const at = cueOr(scene, e.cue, atOf(B.cue, nodes.indexOf(B)) + 4) + 12;
            const mx = (A.x + (A.w ?? 300) / 2 + B.x + (B.w ?? 300) / 2) / 2;
            const my = (A.y + (A.h ?? 120) / 2 + B.y + (B.h ?? 120) / 2) / 2;
            return (
              <div
                key={'l' + i}
                style={{
                  position: 'absolute',
                  left: mx - 200,
                  top: my - 24,
                  width: 400,
                  textAlign: 'center',
                  opacity: prog(f, at, 10),
                  fontFamily: F.head,
                  fontWeight: 700,
                  fontSize: 24,
                  color: e.color ?? b.accent,
                }}
              >
                <span style={{background: '#FBFAF6', padding: '2px 10px', borderRadius: 8}}>{e.label}</span>
              </div>
            );
          })()
        ) : null,
      )}
      {notes.map((n, i) => {
        const at = cueOr(scene, n.cue, 30 + i * 20);
        const p = prog(f, at, 12);
        return (
          <div
            key={'n' + i}
            style={{
              position: 'absolute',
              left: n.x,
              top: n.y,
              opacity: p,
              transform: `rotate(${n.rot ?? -2}deg) translateY(${(1 - p) * 10}px)`,
              fontFamily: F.head,
              fontWeight: 700,
              fontStyle: 'italic',
              fontSize: n.size ?? 34,
              color: n.color ?? b.accent,
              maxWidth: 620,
              lineHeight: 1.2,
            }}
          >
            <Rich text={n.text} color={ink} />
          </div>
        );
      })}
      </AbsoluteFill>
      {d.title ? (
        <div
          style={{
            position: 'absolute',
            left: PADX - 30,
            top: 46,
            padding: '18px 30px 20px',
            borderRadius: 22,
            background: 'rgba(251,250,246,0.92)',
            boxShadow: follow ? '0 10px 30px rgba(16,33,58,0.08)' : 'none',
            opacity: prog(f, 0, 12),
          }}
        >
          {d.kicker ? <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 24, letterSpacing: '0.2em', textTransform: 'uppercase', color: b.accent, marginBottom: 8}}>{d.kicker}</div> : null}
          <div style={{fontFamily: F.head, fontWeight: 800 as any, fontSize: 56, letterSpacing: '-0.025em', color: ink}}>
            <Rich text={d.title} />
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ─── 3D title ─────────────────────────────────────────────────────────────────────────────
export const Title3D: React.FC<{scene: Scene; series?: Timeline['series']}> = ({scene, series}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const tp = sp(f, fps, 8, 18, 120, 0.8);
  const sweep = interpolate(f, [18, 48], [-30, 130], CLAMP);
  const ep = series?.episode ?? d.ep ?? 1;
  return (
    <AbsoluteFill>
      <Shot3D kind={d.shot === 'takeoff' ? 'takeoff' : 'cruise'} view={d.view ?? 'front'} frame={f} dur={scene.dur + 10} shift={d.shift ?? 0.32} tau0={d.tau0} />
      <AbsoluteFill
        style={{
          background: 'linear-gradient(90deg, rgba(255,255,255,0.94) 0%, rgba(255,255,255,0.78) 30%, rgba(255,255,255,0.25) 52%, rgba(255,255,255,0) 64%)',
          opacity: prog(f, 0, 10),
        }}
      />
      <AbsoluteFill style={{height: SAFE_BOTTOM, justifyContent: 'center', paddingLeft: PADX}}>
        <div style={{maxWidth: 880}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 18, marginBottom: 22, opacity: prog(f, 2, 10)}}>
            <div
              style={{
                padding: '8px 18px',
                borderRadius: 12,
                background: b.accent,
                color: '#FFFFFF',
                fontFamily: F.head,
                fontWeight: 800 as any,
                fontSize: 28,
                letterSpacing: '0.04em',
                transform: `scale(${sp(f, fps, 2, 12, 200, 0.6)})`,
                transformOrigin: 'left center',
              }}
            >
              EP {String(ep).padStart(2, '0')}
            </div>
            <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 26, letterSpacing: '0.22em', textTransform: 'uppercase', color: alpha(b.ink, 0.7)}}>
              {d.kicker ?? series?.name ?? 'Air Regulations'}
            </div>
          </div>
          <div style={{overflow: 'hidden', paddingBottom: 8}}>
            <div
              style={{
                transform: `translateY(${(1 - tp) * 110}%)`,
                fontFamily: F.head,
                fontWeight: 850 as any,
                fontSize: d.size ?? 104,
                lineHeight: 1.0,
                letterSpacing: '-0.04em',
                backgroundImage: `linear-gradient(100deg, ${b.ink} 0%, ${b.ink} ${sweep - 12}%, ${b.accent} ${sweep}%, ${b.ink} ${sweep + 12}%, ${b.ink} 100%)`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                textWrap: 'balance' as any,
              }}
            >
              <Rich text={d.title ?? series?.title ?? ''} />
            </div>
          </div>
          {d.sub ? (
            <div style={{opacity: prog(f, 22, 14), transform: `translateY(${(1 - prog(f, 22, 18)) * 16}px)`, fontFamily: F.body, fontWeight: 500, fontSize: 36, lineHeight: 1.35, color: alpha(b.ink, 0.7), marginTop: 22}}>
              <Rich text={d.sub} />
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
