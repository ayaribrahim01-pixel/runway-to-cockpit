import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {evolvePath} from '@remotion/paths';
import {CLAMP, cue, EASE, lerp, pop, prog, rise} from '../anim';
import {Icon} from '../components/Icon';
import {Plane} from '../components/Plane';
import {alpha, edge, F, isLight, onAccent, Rich, shadow, surface, useBrand} from '../theme';
import type {Scene} from '../types';
import {GlobeLayer, PADX, SceneTitle} from './common';

/* ------------------------------------------------------------------ GLOBE scene with side notes */
export const GlobeScene: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const b = useBrand();
  const d = scene.data || {};
  const notes: any[] = d.notes || [];
  const centered = d.side === 'center';
  return (
    <AbsoluteFill>
      <GlobeLayer scene={scene} spec={d.globe} defaultX={centered ? 960 : 1360} defaultY={centered ? 590 : 580} defaultR={centered ? 360 : 400} />
      <SceneTitle kicker={d.kicker} title={d.title} f={f} maxWidth={centered ? 1300 : 820} />
      {!centered ? (
        <div style={{position: 'absolute', left: PADX, top: d.title ? 380 : 280, width: 760, display: 'flex', flexDirection: 'column', gap: 26}}>
          {notes.map((nt, i) => {
            const a = typeof nt.cue === 'number' ? cue(scene, nt.cue) : cue(scene, i, notes.length);
            const p = prog(f, a, 18);
            return (
              <div key={i} style={{opacity: p, transform: `translateX(${(1 - p) * 40}px)`, display: 'flex', gap: 22, alignItems: 'flex-start'}}>
                <div style={{marginTop: 4}}>
                  <Icon name={nt.icon ?? 'pin'} size={42} color={b.accent} />
                </div>
                <div>
                  <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 40, color: b.ink, lineHeight: 1.15}}>
                    <Rich text={nt.text} />
                  </div>
                  {nt.sub ? (
                    <div style={{fontFamily: F.body, fontWeight: 500, fontSize: 28, color: alpha(b.ink, 0.65), marginTop: 6, lineHeight: 1.3}}>
                      <Rich text={nt.sub} />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ DIAGRAM: whiteboard-style drawings */
const Hand: React.FC<{x: number; y: number; size?: number; color: string; p: number; anchor?: 'start' | 'middle' | 'end'; children: React.ReactNode}> = ({
  x,
  y,
  size = 38,
  color,
  p,
  anchor = 'start',
  children,
}) => (
  <text x={x} y={y} fill={color} fontFamily={F.hand} fontWeight={700} fontSize={size} textAnchor={anchor} opacity={p} style={{transform: `translateY(${(1 - p) * 10}px)`}}>
    {children}
  </text>
);

export const Diagram: React.FC<{scene: Scene}> = ({scene}) => {
  const variant = scene.data?.variant;
  if (variant === 'sovereignty') return <Sovereignty scene={scene} />;
  return <AbsoluteFill />;
};

const Sovereignty: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {width: W} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const c = (i: number) => cue(scene, i, 5);
  const ground = 790;
  const coast = 720;
  const limit = 1080;
  const landP = prog(f, c(0), 30, EASE);
  const seaP = prog(f, c(1), 30, EASE);
  const nmP = prog(f, c(2), 24, EASE);
  const airP = prog(f, c(3), 30, EASE);
  const highP = prog(f, c(4), 26, EASE);
  const land = `M ${PADX} ${ground} L ${PADX} 712 Q 230 668 320 694 T 480 682 T 640 702 Q 690 716 ${coast} ${ground - 18} L ${coast} ${ground}`;
  const waves = [0, 1, 2].map((k) => {
    let s = `M ${coast + 10} ${ground + 18 + k * 34}`;
    for (let x = coast + 10; x < W - PADX; x += 60) s += ` q 15 -12 30 0 t 30 0`;
    return s;
  });
  const sky = `M ${PADX} ${ground} L ${PADX} 300 Q ${(PADX + limit) / 2} 230 ${limit} 300 L ${limit} ${ground}`;
  const planeX = lerp(W - PADX - 40, limit + 120, prog(f, c(4) + 10, 70, EASE));
  return (
    <AbsoluteFill>
      <SceneTitle kicker={d.kicker} title={d.title} f={f} size={58} />
      <svg width={W} height={1080} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
        <path d={sky + ' Z'} fill={alpha(b.accent, 0.13 * airP)} stroke="none" />
        <path d={sky} fill="none" stroke={b.accent} strokeWidth={4} strokeDasharray="14 10" style={evolvePath(airP, sky)} />
        <path d={land + ' Z'} fill={alpha(b.good, 0.1 * landP)} stroke="none" />
        <path d={land} fill="none" stroke={b.good} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" style={evolvePath(landP, land)} />
        <g opacity={landP}>
          <rect x={300} y={738} width={250} height={22} rx={4} fill={alpha(b.ink, 0.25)} />
          <line x1={312} y1={749} x2={538} y2={749} stroke={b.ink} strokeWidth={3} strokeDasharray="14 12" />
        </g>
        {waves.map((w, i) => (
          <path key={i} d={w} fill="none" stroke={b.sky} strokeWidth={4} strokeLinecap="round" style={evolvePath(seaP, w)} opacity={0.85 - i * 0.2} />
        ))}
        <line x1={PADX} y1={ground} x2={lerp(PADX, W - PADX, Math.max(landP, seaP))} y2={ground} stroke={alpha(b.ink, 0.5)} strokeWidth={3} />
        <line x1={coast} y1={ground + 120} x2={coast} y2={lerp(ground + 120, 300, seaP)} stroke={alpha(b.ink, 0.6)} strokeWidth={3} strokeDasharray="10 10" />
        <line x1={limit} y1={ground + 120} x2={limit} y2={lerp(ground + 120, 300, nmP)} stroke={b.sky} strokeWidth={4} strokeDasharray="10 10" />
        <g opacity={nmP}>
          <line x1={coast + 8} y1={ground + 100} x2={limit - 8} y2={ground + 100} stroke={b.sky} strokeWidth={3} />
          <path d={`M ${coast + 22} ${ground + 88} L ${coast + 6} ${ground + 100} L ${coast + 22} ${ground + 112}`} fill="none" stroke={b.sky} strokeWidth={3} />
          <path d={`M ${limit - 22} ${ground + 88} L ${limit - 6} ${ground + 100} L ${limit - 22} ${ground + 112}`} fill="none" stroke={b.sky} strokeWidth={3} />
        </g>
        <Hand x={(coast + limit) / 2} y={ground + 160} anchor="middle" color={b.sky} p={nmP} size={40}>
          {d.seaLabel ?? '12 NM territorial sea'}
        </Hand>
        <Hand x={coast - 16} y={ground + 112} anchor="end" color={alpha(b.ink, 0.75)} p={seaP} size={32}>
          {d.coastLabel ?? 'coastline'}
        </Hand>
        <Hand x={(PADX + coast) / 2} y={ground + 70} anchor="middle" color={b.good} p={landP} size={40}>
          {d.landLabel ?? 'land territory'}
        </Hand>
        <g opacity={airP}>
          <text x={PADX + 40} y={370} fill={b.accent} fontFamily={F.head} fontWeight={700} fontSize={44} letterSpacing="0.06em">
            {d.airLabel ?? 'SOVEREIGN AIRSPACE'}
          </text>
        </g>
        <Hand x={PADX + 40} y={428} color={b.ink} p={airP} size={36}>
          {d.airSub ?? 'complete & exclusive · Article 1'}
        </Hand>
        <g opacity={highP}>
          <text x={W - PADX} y={370} textAnchor="end" fill={b.sky} fontFamily={F.head} fontWeight={700} fontSize={44} letterSpacing="0.06em">
            {d.highLabel ?? 'HIGH SEAS'}
          </text>
        </g>
        <Hand x={W - PADX} y={428} anchor="end" color={b.ink} p={highP} size={34}>
          {d.highSub ?? 'ICAO rules of the air apply'}
        </Hand>
      </svg>
      <div style={{position: 'absolute', left: planeX - 45, top: 500, opacity: highP}}>
        <Plane size={90} color={b.ink} rotate={180} glow={alpha(b.sky, 0.5)} />
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ QUIZ */
export const Quiz: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const opts: string[] = d.options || [];
  const optAt = cue(scene, 0, 3);
  const cdAt = cue(scene, 1, 3);
  const rawAns = scene.cues?.[2] ?? cdAt + 5 * fps;
  const ansAt = rawAns > cdAt + 10 ? rawAns : cdAt + 4 * fps;
  const revealed = f >= ansAt;
  const cdP = interpolate(f, [cdAt, ansAt], [0, 1], CLAMP);
  const secs = Math.max(0, Math.ceil((ansAt - f) / fps));
  const R = 64;
  const circ = 2 * Math.PI * R;
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', left: PADX, top: 96, display: 'flex', alignItems: 'center', gap: 18, ...rise(f, 0, 16)}}>
        <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 26, letterSpacing: '0.22em', color: b.accent, textTransform: 'uppercase'}}>{d.kicker ?? 'Quick check'}</div>
        {d.of ? (
          <div style={{fontFamily: F.mono, fontSize: 24, color: alpha(b.ink, 0.6)}}>
            {d.n}/{d.of}
          </div>
        ) : null}
      </div>
      <div style={{position: 'absolute', left: PADX, top: 160, width: 1380, ...rise(f, 4, 24, 20), fontFamily: F.head, fontWeight: 700, fontSize: d.size ?? 56, lineHeight: 1.18, color: b.ink}}>
        <Rich text={d.q} />
      </div>
      {f >= cdAt && !revealed ? (
        <svg width={180} height={180} style={{position: 'absolute', right: PADX, top: 120}}>
          <circle cx={90} cy={90} r={R} fill="none" stroke={alpha(b.ink, 0.15)} strokeWidth={10} />
          <circle
            cx={90}
            cy={90}
            r={R}
            fill="none"
            stroke={b.accent}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * cdP}
            transform="rotate(-90 90 90)"
          />
          <text x={90} y={108} textAnchor="middle" fill={b.ink} fontFamily={F.head} fontWeight={700} fontSize={52}>
            {secs}
          </text>
        </svg>
      ) : null}
      <div style={{position: 'absolute', left: PADX, right: PADX, top: 430, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28}}>
        {opts.map((o, i) => {
          const p = pop(f, fps, optAt + i * 4);
          const right = i === d.answer;
          const col = revealed ? (right ? b.good : alpha(b.ink, 0.25)) : edge(b, isLight(b) ? 0.1 : 0.14);
          return (
            <div
              key={i}
              style={{
                opacity: p * (revealed && !right ? 0.45 : 1),
                transform: `translateY(${(1 - p) * 40}px) scale(${revealed && right ? 1 + 0.03 * pop(f, fps, ansAt) : 1})`,
                display: 'flex',
                alignItems: 'center',
                gap: 26,
                padding: '26px 30px',
                borderRadius: 24,
                border: `2px solid ${col}`,
                background: revealed && right ? alpha(b.good, isLight(b) ? 0.1 : 0.14) : surface(b),
                boxShadow: revealed && right ? (isLight(b) ? `0 0 0 5px ${alpha(b.good, 0.12)}, ${shadow(b)}` : `0 0 50px ${alpha(b.good, 0.3)}`) : isLight(b) ? shadow(b, 0.7) : 'none',
              }}
            >
              <div
                style={{
                  width: 66,
                  height: 66,
                  flex: '0 0 66px',
                  borderRadius: 99,
                  background: revealed && right ? b.good : alpha(b.ink, 0.08),
                  color: revealed && right ? onAccent(b) : b.ink,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: F.head,
                  fontWeight: 700,
                  fontSize: 32,
                }}
              >
                {revealed && right ? <Icon name="check" size={40} color={onAccent(b)} stroke={3} /> : 'ABCD'[i]}
              </div>
              <div style={{fontFamily: F.body, fontWeight: 600, fontSize: 34, color: b.ink, lineHeight: 1.25}}>
                <Rich text={o} />
              </div>
            </div>
          );
        })}
      </div>
      {revealed && d.explain ? (
        <div style={{position: 'absolute', left: PADX, right: PADX, bottom: 150, ...rise(f, ansAt + 6, 20), fontFamily: F.body, fontWeight: 500, fontSize: 34, color: alpha(b.ink, 0.85), lineHeight: 1.35}}>
          <span style={{color: b.good, fontWeight: 700}}>Why: </span>
          <Rich text={d.explain} color={b.good} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
