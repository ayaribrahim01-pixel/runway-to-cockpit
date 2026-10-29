import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {evolvePath} from '@remotion/paths';
import {activeIndex, CLAMP, cue, EASE, lerp, pop, prog, rise} from '../anim';
import {Icon} from '../components/Icon';
import {Plane} from '../components/Plane';
import {alpha, dim, F, isLight, Rich, shadow, stripMarks, useBrand} from '../theme';
import type {Scene} from '../types';
import {Glass, PADX, SceneTitle} from './common';

/* ------------------------------------------------------------------ TIMELINE */
export const Timeline: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {fps, width: W} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const ev: any[] = d.events || [];
  const n = ev.length;
  const act = activeIndex(scene, f, n);
  const x0 = PADX + 60;
  const x1 = W - PADX - 60;
  const y = 610;
  const xs = ev.map((_, i) => (n === 1 ? (x0 + x1) / 2 : lerp(x0, x1, i / (n - 1))));
  const lineP = prog(f, 4, 30);
  const planeX =
    act < 0
      ? x0 - 80
      : interpolate(f, [cue(scene, act, n) - 2, cue(scene, act, n) + 18], [act > 0 ? xs[act - 1] : x0 - 80, xs[act]], {...CLAMP, easing: EASE});
  return (
    <AbsoluteFill>
      <SceneTitle kicker={d.kicker} title={d.title} f={f} />
      <svg width={W} height={1080} style={{position: 'absolute', inset: 0}}>
        <line x1={x0 - 60} y1={y} x2={lerp(x0 - 60, x1 + 60, lineP)} y2={y} stroke={alpha(b.ink, 0.25)} strokeWidth={3} />
        {act >= 0 ? <line x1={x0 - 60} y1={y} x2={planeX} y2={y} stroke={b.accent} strokeWidth={4} /> : null}
      </svg>
      {act >= 0 ? (
        <div style={{position: 'absolute', left: planeX - 30, top: y - 30}}>
          <Plane size={60} color={b.accent} glow={alpha(b.accent, 0.6)} />
        </div>
      ) : null}
      {ev.map((e, i) => {
        const a = cue(scene, i, n);
        const p = pop(f, fps, a);
        const on = i === act;
        const past = i < act;
        return (
          <div key={i} style={{position: 'absolute', left: xs[i] - 170, width: 340, top: 0, height: 1080, opacity: p * (past ? dim(b, 0.5) : 1)}}>
            <div
              style={{
                position: 'absolute',
                top: y - 150,
                width: '100%',
                textAlign: 'center',
                fontFamily: F.head,
                fontWeight: 700,
                fontSize: on ? 76 : 62,
                color: on ? b.accent : b.ink,
                transform: `translateY(${(1 - p) * -30}px)`,
              }}
            >
              {e.year}
            </div>
            <div
              style={{
                position: 'absolute',
                top: y - 13,
                left: 170 - 13,
                width: 26,
                height: 26,
                borderRadius: 99,
                background: on ? b.accent : isLight(b) ? b.card ?? '#FFFFFF' : b.bg,
                border: `4px solid ${on ? b.accent : b.ink}`,
                transform: `scale(${p})`,
                boxShadow: on ? `0 0 30px ${alpha(b.accent, 0.7)}` : 'none',
              }}
            />
            <div style={{position: 'absolute', top: y + 46, width: '100%', textAlign: 'center', transform: `translateY(${(1 - p) * 30}px)`}}>
              <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 36, color: b.ink, lineHeight: 1.15}}>
                <Rich text={e.title} />
              </div>
              {e.sub ? (
                <div style={{fontFamily: F.body, fontWeight: 500, fontSize: 26, color: alpha(b.ink, 0.62), marginTop: 10, lineHeight: 1.3}}>
                  <Rich text={e.sub} />
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ LADDER (hierarchy of law) */
export const Ladder: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {fps, width: W} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const tiers: any[] = d.tiers || [];
  const n = tiers.length;
  const act = activeIndex(scene, f, n);
  const top = d.title ? 300 : 190;
  const bottom = 1080 - 120;
  const gap = 18;
  const h = Math.min(132, (bottom - top - gap * (n - 1)) / n);
  const wMin = 1260;
  const wMax = 1560;
  const arrowP = prog(f, cue(scene, 0, n), Math.max(20, cue(scene, n - 1, n) - cue(scene, 0, n) + 20), (t) => t);
  return (
    <AbsoluteFill>
      <SceneTitle kicker={d.kicker} title={d.title} f={f} />
      <div style={{position: 'absolute', left: PADX - 40, top, height: (h + gap) * n - gap, width: 50, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
        <div style={{width: 4, flex: 1, background: `linear-gradient(${b.accent}, ${alpha(b.accent, 0.1)})`, transformOrigin: 'top', transform: `scaleY(${arrowP})`, borderRadius: 2}} />
        <div
          style={{
            fontFamily: F.head,
            fontSize: 20,
            letterSpacing: '0.2em',
            color: alpha(b.accent, 0.8),
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            position: 'absolute',
            left: -18,
            top: 40,
            opacity: arrowP,
            textTransform: 'uppercase',
          }}
        >
          {d.axis ?? 'Authority flows down'}
        </div>
      </div>
      {tiers.map((t, i) => {
        const a = cue(scene, i, n);
        const p = pop(f, fps, a);
        const w = n === 1 ? wMax : lerp(wMin, wMax, i / (n - 1));
        const on = i === act;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: W / 2 - w / 2 + 30,
              top: top + i * (h + gap),
              width: w,
              height: h,
              opacity: p * (act > i ? dim(b, 0.55) : 1),
              transform: `translateY(${(1 - p) * -40}px)`,
            }}
          >
            <Glass active={on} style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '0 36px', gap: 28, borderRadius: 20}}>
              <div style={{fontFamily: F.mono, fontWeight: 500, fontSize: 28, color: on ? b.accent : alpha(b.sky, 0.9), width: 50}}>{String(i + 1).padStart(2, '0')}</div>
              <div style={{flex: 1, minWidth: 0}}>
                <div style={{fontFamily: F.head, fontWeight: 700, fontSize: h > 110 ? 40 : 35, color: b.ink, lineHeight: 1.1}}>
                  <Rich text={t.label} />
                </div>
                {t.sub ? (
                  <div style={{fontFamily: F.body, fontWeight: 500, fontSize: h > 110 ? 27 : 25, color: alpha(b.ink, 0.66), marginTop: 6}}>
                    <Rich text={t.sub} />
                  </div>
                ) : null}
              </div>
              {t.who ? (
                <div
                  style={{
                    padding: '10px 20px',
                    borderRadius: 999,
                    border: `1.5px solid ${on ? b.accent : alpha(b.ink, 0.25)}`,
                    fontFamily: F.head,
                    fontWeight: 600,
                    fontSize: 24,
                    letterSpacing: '0.06em',
                    color: on ? b.accent : alpha(b.ink, 0.75),
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.who}
                </div>
              ) : null}
            </Glass>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ ORG chart */
export const Org: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {fps, width: W} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const nodes: any[] = d.nodes || [];
  const n = nodes.length;
  const act = activeIndex(scene, f, n + 1) - 1; // cue 0 = root, cues 1..n = nodes
  const rootP = pop(f, fps, cue(scene, 0, n + 1));
  const rootY = d.title ? 300 : 200;
  const rowY = rootY + 290;
  const nodeW = Math.min(400, (W - 2 * PADX - (n - 1) * 30) / Math.max(1, n));
  const totalW = n * nodeW + (n - 1) * 30;
  const startX = (W - totalW) / 2;
  const busY = rootY + 215;
  return (
    <AbsoluteFill>
      <SceneTitle kicker={d.kicker} title={d.title} f={f} />
      <svg width={W} height={1080} style={{position: 'absolute', inset: 0}}>
        {nodes.map((_, i) => {
          const a = cue(scene, i + 1, n + 1);
          const p = prog(f, a - 4, 16);
          const x = startX + i * (nodeW + 30) + nodeW / 2;
          const path = `M ${W / 2} ${rootY + 140} L ${W / 2} ${busY} L ${x} ${busY} L ${x} ${rowY}`;
          const ev = evolvePath(p, path);
          return <path key={i} d={path} fill="none" stroke={i === act ? b.accent : alpha(b.sky, 0.5)} strokeWidth={3} style={ev} />;
        })}
      </svg>
      <div style={{position: 'absolute', left: W / 2 - 380, top: rootY, width: 760, height: 140, opacity: rootP, transform: `scale(${0.9 + 0.1 * rootP})`}}>
        <Glass active={act < 0} style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24}}>
          <Icon name={d.root?.icon ?? 'ministry'} size={58} color={act < 0 ? b.accent : b.sky} />
          <div>
            <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 40, color: b.ink}}>
              <Rich text={d.root?.label} />
            </div>
            {d.root?.sub ? <div style={{fontFamily: F.body, fontSize: 25, color: alpha(b.ink, 0.62)}}>{d.root.sub}</div> : null}
          </div>
        </Glass>
      </div>
      {nodes.map((nd, i) => {
        const a = cue(scene, i + 1, n + 1);
        const p = pop(f, fps, a);
        const on = i === act;
        return (
          <div
            key={i}
            style={{position: 'absolute', left: startX + i * (nodeW + 30), top: rowY, width: nodeW, opacity: p * (act > i ? dim(b, 0.6) : 1), transform: `translateY(${(1 - p) * 50}px)`}}
          >
            <Glass active={on} style={{padding: '34px 32px', minHeight: 380, display: 'flex', flexDirection: 'column', gap: 16}}>
              <Icon name={nd.icon} size={52} color={on ? b.accent : b.sky} />
              <div style={{fontFamily: F.head, fontWeight: 700, fontSize: nd.label.length > 8 ? 40 : 54, color: b.ink, lineHeight: 1.05}}>
                <Rich text={nd.label} />
              </div>
              {nd.full ? <div style={{fontFamily: F.body, fontWeight: 600, fontSize: 25, color: alpha(b.ink, 0.58), lineHeight: 1.3}}>{nd.full}</div> : null}
              {nd.sub ? (
                <div style={{fontFamily: F.body, fontWeight: 500, fontSize: 30, color: on ? b.ink : alpha(b.ink, 0.75), lineHeight: 1.3, marginTop: 6}}>
                  <Rich text={nd.sub} />
                </div>
              ) : null}
            </Glass>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ COMPARE (two columns) */
export const Compare: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {fps, width: W} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const cols = [d.left, d.right].filter(Boolean);
  const act = activeIndex(scene, f, 2);
  const colW = (W - 2 * PADX - 120) / 2;
  return (
    <AbsoluteFill>
      <SceneTitle kicker={d.kicker} title={d.title} f={f} />
      {cols.map((c: any, ci: number) => {
        const a = cue(scene, ci, 2);
        const p = pop(f, fps, a);
        const on = ci === act;
        const col = ci === 0 ? b.accent : b.sky;
        return (
          <div
            key={ci}
            style={{
              position: 'absolute',
              left: PADX + ci * (colW + 120),
              top: d.title ? 320 : 220,
              width: colW,
              opacity: p * (act > ci ? dim(b, 0.62) : 1),
              transform: `translateY(${(1 - p) * 50}px)`,
            }}
          >
            <Glass active={on} style={{minHeight: 440, padding: '48px 50px', display: 'flex', flexDirection: 'column', gap: 22}}>
              <div style={{display: 'flex', alignItems: 'baseline', gap: 20, flexWrap: 'wrap'}}>
                <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 52, color: col, letterSpacing: '0.02em'}}>{c.head}</div>
                {c.chip ? (
                  <div style={{fontFamily: F.hand, fontWeight: 700, fontSize: 44, color: b.ink, padding: '0 18px', borderRadius: 14, background: alpha(col, 0.18)}}>{c.chip}</div>
                ) : null}
              </div>
              {(c.items || []).map((it: string, i: number) => (
                <div key={i} style={{...rise(f, a + 8 + i * 6, 20), display: 'flex', gap: 18, alignItems: 'flex-start'}}>
                  <div style={{width: 12, height: 12, borderRadius: 99, background: col, marginTop: 19, flex: '0 0 12px'}} />
                  <div style={{fontFamily: F.body, fontWeight: 500, fontSize: 38, color: alpha(b.ink, 0.9), lineHeight: 1.35}}>
                    <Rich text={it} color={col} />
                  </div>
                </div>
              ))}
            </Glass>
          </div>
        );
      })}
      {cols.length === 2 ? (
        <div
          style={{
            position: 'absolute',
            left: W / 2 - 46,
            top: (d.title ? 320 : 220) + 160,
            width: 92,
            height: 92,
            borderRadius: 99,
            background: isLight(b) ? b.card ?? '#FFFFFF' : b.bg,
            border: `2px solid ${alpha(b.ink, 0.3)}`,
            boxShadow: isLight(b) ? shadow(b) : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: F.head,
            fontWeight: 700,
            fontSize: 30,
            color: alpha(b.ink, 0.8),
            opacity: prog(f, cue(scene, 1, 2) - 6, 12),
          }}
        >
          VS
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ QUOTE (legal text, read along) */
export const Quote: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const b = useBrand();
  const d = scene.data || {};
  const text = String(d.text || '');
  const hl: string[] = (d.highlight || []).map((s: string) => s.toLowerCase());
  const tokens = text.split(/\s+/);
  const a0 = cue(scene, 0, 2);
  const a1 = scene.cues?.[1] ?? Math.max(a0 + 30, scene.dur - 20);
  const p = interpolate(f, [a0, a1], [0, tokens.length], CLAMP);
  const lower = tokens.map((t) => t.toLowerCase().replace(/[^\w']/g, ''));
  const mark = new Array(tokens.length).fill(false);
  hl.forEach((phrase) => {
    const ws = phrase.split(/\s+/).map((w) => w.replace(/[^\w']/g, ''));
    for (let i = 0; i + ws.length <= lower.length; i++) {
      if (ws.every((w, k) => lower[i + k] === w)) for (let k = 0; k < ws.length; k++) mark[i + k] = true;
    }
  });
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
      <div style={{width: 1500, position: 'relative'}}>
        <div style={{position: 'absolute', left: -40, top: -150, fontFamily: F.head, fontWeight: 700, fontSize: 300, color: alpha(b.accent, 0.18), lineHeight: 1}}>“</div>
        {d.kicker ? (
          <div style={{...rise(f, 0, 18), fontFamily: F.head, fontWeight: 600, fontSize: 26, letterSpacing: '0.22em', color: b.accent, textTransform: 'uppercase', marginBottom: 30}}>
            {d.kicker}
          </div>
        ) : null}
        <div style={{fontFamily: F.head, fontWeight: 500, fontSize: d.size ?? 60, lineHeight: 1.32, color: b.ink, letterSpacing: '-0.01em'}}>
          {tokens.map((t, i) => {
            const seen = i < p;
            return (
              <span
                key={i}
                style={{
                  color: mark[i] ? (seen ? b.accent : alpha(b.accent, 0.35)) : seen ? b.ink : alpha(b.ink, 0.28),
                  textDecoration: mark[i] && seen ? 'underline' : 'none',
                  textDecorationColor: alpha(b.accent, 0.6),
                  textDecorationThickness: 3,
                  textUnderlineOffset: 10,
                }}
              >
                {t}{' '}
              </span>
            );
          })}
        </div>
        {d.source ? <div style={{...rise(f, 10, 20), fontFamily: F.body, fontWeight: 500, fontSize: 30, color: alpha(b.ink, 0.6), marginTop: 40}}>— {d.source}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ GRID of tiles (e.g. the 19 Annexes) */
export const Grid: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {width: W} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const tiles: any[] = d.tiles || [];
  const cols = d.cols ?? 5;
  const rows = Math.ceil(tiles.length / cols);
  const top = d.title ? 300 : 200;
  const bottom = 1080 - 110;
  const gap = 16;
  const big = tiles.length <= 8;
  const tw = (W - 2 * PADX - gap * (cols - 1)) / cols;
  const th = Math.min(big ? 230 : 150, (bottom - top - gap * (rows - 1)) / rows);
  const gridH = rows * th + (rows - 1) * gap;
  const top0 = big ? top + Math.max(0, (bottom - top - gridH) / 2 - 20) : top;
  const groupCue: number[] = d.groupCue || [];
  const hlCue = d.highlightCue;
  const hlOn = typeof hlCue === 'number' && f >= cue(scene, hlCue);
  const hl: number[] = d.highlight || [];
  const spots: [number, number][] = d.spotlight || [];
  let spot = -1;
  spots.forEach(([c, t]) => {
    if (f >= cue(scene, c)) spot = t;
  });
  return (
    <AbsoluteFill>
      <SceneTitle kicker={d.kicker} title={d.title} f={f} />
      {tiles.map((t, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const a = groupCue.length ? cue(scene, groupCue[i] ?? 0) + (i % cols) * 2 : 6 + i * 3;
        const p = prog(f, a, 14);
        const isHl = (hlOn && hl.includes(i)) || spot === i;
        const dimTile = (hlOn && !hl.includes(i)) || (spot >= 0 && spot !== i);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: PADX + c * (tw + gap),
              top: top0 + r * (th + gap),
              width: tw,
              height: th,
              opacity: p * (dimTile ? dim(b, 0.32) : 1),
              transform: `scale(${(0.85 + 0.15 * p) * (isHl ? 1.04 : 1)})`,
            }}
          >
            <Glass active={isHl} style={{width: '100%', height: '100%', padding: '14px 20px', display: 'flex', gap: 16, alignItems: 'center', borderRadius: 18}}>
              <div
                style={{
                  fontFamily: F.mono,
                  fontWeight: 500,
                  fontSize: big ? 60 : th > 120 ? 44 : 36,
                  color: isHl ? b.accent : b.sky,
                  width: big ? 80 : 62,
                  textAlign: 'center',
                  flex: big ? '0 0 80px' : '0 0 62px',
                }}
              >
                {t.n}
              </div>
              <div
                style={{
                  fontFamily: F.head,
                  fontWeight: 600,
                  fontSize: big ? ((t.label || '').length > 30 ? 32 : 37) : (t.label || '').length > 26 ? 23 : 27,
                  color: b.ink,
                  lineHeight: 1.18,
                }}
              >
                {stripMarks(t.label)}
              </div>
            </Glass>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
