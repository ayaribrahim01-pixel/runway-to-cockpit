import {getLength, getPointAtLength, getTangentAtLength} from '@remotion/paths';
import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {CLAMP, EASE_IN_OUT, prog} from '../anim';
import {Icon} from '../components/Icon';
import {alpha, F, Rich, useBrand} from '../theme';
import type {Scene} from '../types';
import {Ann, DrawPath} from './fx';
import {Paper, SAFE_BOTTOM} from './scenes';

// Freedoms of the air, one beat per freedom: three States (home A, B with two cities, C), the home airline's aircraft
// flies the route, chips show where traffic boards / leaves or where it only refuels, and a strip lists freedoms 1–9.

type Pt = [number, number];
const CITY: Record<string, Pt> = {
  A: [380, 560],
  B: [930, 430],
  B2: [1150, 610],
  C: [1560, 520],
};

type Stop = {at: string; kind: 'up' | 'down' | 'both' | 'fuel' | 'over' | 'start'};
type Route = {legs: string[]; stops: Stop[]; title: string; sub: string; so?: boolean; deal?: string};

const ROUTES: Record<number, Route> = {
  1: {legs: ['A', 'C'], stops: [{at: 'A', kind: 'start'}, {at: 'B', kind: 'over'}], title: 'Fly *over* a foreign State', sub: 'No landing at all', deal: 'Transit Agreement'},
  2: {legs: ['A', 'B', 'C'], stops: [{at: 'A', kind: 'start'}, {at: 'B', kind: 'fuel'}], title: 'Land for *non-traffic* reasons', sub: 'Fuel or repairs: no passengers on or off', deal: 'Transit Agreement'},
  3: {legs: ['A', 'B'], stops: [{at: 'A', kind: 'up'}, {at: 'B', kind: 'down'}], title: 'Carry traffic *home → abroad*', sub: 'Put down passengers in State B', deal: 'Transport Agreement'},
  4: {legs: ['B', 'A'], stops: [{at: 'B', kind: 'up'}, {at: 'A', kind: 'down'}], title: 'Carry traffic *abroad → home*', sub: 'Take on passengers in State B for home', deal: 'Transport Agreement'},
  5: {legs: ['A', 'B', 'C'], stops: [{at: 'A', kind: 'up'}, {at: 'B', kind: 'both'}, {at: 'C', kind: 'down'}], title: 'Traffic *between two foreign* States', sub: 'On a service that starts or ends at home', deal: 'Transport Agreement'},
  6: {legs: ['B', 'A', 'C'], stops: [{at: 'B', kind: 'up'}, {at: 'A', kind: 'both'}, {at: 'C', kind: 'down'}], title: 'Foreign to foreign, *via home*', sub: 'The hub model: a "so-called" freedom', so: true},
  7: {legs: ['B', 'C'], stops: [{at: 'B', kind: 'up'}, {at: 'C', kind: 'down'}], title: 'Foreign to foreign, *never touching home*', sub: 'A "so-called" freedom', so: true},
  8: {legs: ['A', 'B', 'B2'], stops: [{at: 'A', kind: 'up'}, {at: 'B', kind: 'both'}, {at: 'B2', kind: 'down'}], title: '*Consecutive* cabotage', sub: 'Domestic traffic in B, on a flight from home', so: true},
  9: {legs: ['B', 'B2'], stops: [{at: 'B', kind: 'up'}, {at: 'B2', kind: 'down'}], title: '*Stand-alone* cabotage', sub: 'Domestic traffic in B, nothing to do with home', so: true},
};

function routePath(legs: string[], n: number) {
  let d = '';
  for (let i = 0; i < legs.length - 1; i++) {
    const a = CITY[legs[i]];
    const b = CITY[legs[i + 1]];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // arc upward; the overflight (1st freedom) arcs high over B
    const lift = n === 1 ? 230 : Math.min(150, len * 0.22);
    const cx = mx;
    const cy = my - lift;
    d += `${i === 0 ? `M${a[0]},${a[1]}` : ''} Q${cx},${cy} ${b[0]},${b[1]} `;
  }
  return d.trim();
}

const PlaneIcon: React.FC<{color: string}> = ({color}) => (
  <g>
    <path d="M22,0 C22,-2.4 19,-3.2 15,-3.2 L-16,-2.8 C-20,-2.4 -22,-1.2 -22.5,0 C-22,1.2 -20,2.4 -16,2.8 L15,3.2 C19,3.2 22,2.4 22,0 Z" fill="#FFFFFF" stroke="#10213A" strokeWidth={1.2} />
    <path d="M5,-2.8 L-8,-22 L-12.5,-22 L-6,-2.8 Z M5,2.8 L-8,22 L-12.5,22 L-6,2.8 Z" fill="#FFFFFF" stroke="#10213A" strokeWidth={1.2} />
    <path d="M-15,-2.4 L-19.5,-9 L-22,-9 L-19,-2.4 Z M-15,2.4 L-19.5,9 L-22,9 L-19,2.4 Z" fill="#FFFFFF" stroke="#10213A" strokeWidth={1.1} />
    <path d="M-6,0 L12,0" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
  </g>
);

const CHIP: Record<string, {icon: string; text: string; color: string}> = {
  up: {icon: 'users', text: 'Passengers on', color: '#15803D'},
  down: {icon: 'users', text: 'Passengers off', color: '#1F6FB2'},
  both: {icon: 'users', text: 'Passengers off & on', color: '#6B5BD6'},
  fuel: {icon: 'bolt', text: 'Fuel only · no traffic', color: '#C98800'},
  over: {icon: 'inflight', text: 'Overflight · no landing', color: '#0E9F8E'},
  start: {icon: 'departure', text: 'Departs home', color: '#EE6A1A'},
};

export const Freedom: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const n: number = Math.max(1, Math.min(9, d.n ?? 1));
  const R = ROUTES[n];
  const names = {A: d.labels?.A ?? 'Home State', B: d.labels?.B ?? 'State B', C: d.labels?.C ?? 'State C', B2: d.labels?.B2 ?? ''};
  const cityNames = {A: d.cities?.A ?? 'Home', B: d.cities?.B ?? 'B city 1', B2: d.cities?.B2 ?? 'B city 2', C: d.cities?.C ?? 'C city'};
  const start = typeof d.cue === 'number' && typeof scene.cues?.[d.cue] === 'number' ? scene.cues[d.cue] : 14;
  const flyFrames = Math.max(60, Math.min(scene.dur - start - 30, (d.fly ?? 4.5) * fps));
  const path = useMemo(() => routePath(R.legs, n), [n]);
  const L = useMemo(() => getLength(path), [path]);
  const u = interpolate(f, [start, start + flyFrames], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  const pos = getPointAtLength(path, Math.max(0.01, L * u)) ?? {x: CITY[R.legs[0]][0], y: CITY[R.legs[0]][1]};
  const tan = getTangentAtLength(path, Math.max(0.01, Math.min(L - 0.01, L * u))) ?? {x: 1, y: 0};
  const hdg = (Math.atan2(tan.y, tan.x) * 180) / Math.PI;
  // distance along the path where each city is reached (for chip timing)
  const legLens = useMemo(() => {
    const out: number[] = [0];
    for (let i = 0; i < R.legs.length - 1; i++) out.push(getLength(routePath([R.legs[i], R.legs[i + 1]], n)) + out[out.length - 1]);
    return out;
  }, [n]);
  const reachAt = (city: string) => {
    if (city === 'B' && n === 1) return start + flyFrames * 0.5;
    const idx = R.legs.indexOf(city);
    if (idx < 0) return start;
    return start + flyFrames * (legLens[idx] / Math.max(1, L)) * 1.0;
  };
  const titleP = prog(f, 2, 14);
  const lift = n === 1 ? Math.sin(u * Math.PI) * 26 : 0;
  // States (organic blobs), drawn as a slightly raised map
  const state = (key: 'A' | 'B' | 'C', dpath: string, fill: string, label: string, lx: number, ly: number) => {
    const active = R.legs.includes(key) || R.stops.some((s) => s.at === key) || (key === 'B' && R.legs.includes('B2'));
    return (
      <g key={key} opacity={active ? 1 : 0.55}>
        <path d={dpath} fill="rgba(16,33,58,0.10)" transform="translate(10 16)" />
        <path d={dpath} fill={fill} stroke="#FFFFFF" strokeWidth={6} />
        <text x={lx} y={ly} textAnchor="middle" fontFamily={F.head} fontWeight={800} fontSize={30} fill="rgba(16,33,58,0.72)" letterSpacing="0.06em">
          {label.toUpperCase()}
        </text>
      </g>
    );
  };
  const strip = Array.from({length: 9}, (_, i) => i + 1);
  return (
    <Paper tone="paper">
      {/* title */}
      <div style={{position: 'absolute', left: 110, top: 64, opacity: titleP, transform: `translateY(${(1 - titleP) * 16}px)`}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
          <div
            style={{
              padding: '6px 18px',
              borderRadius: 14,
              background: R.so ? '#6B5BD6' : b.accent,
              color: '#FFFFFF',
              fontFamily: F.head,
              fontWeight: 850 as any,
              fontSize: 34,
              transform: `scale(${spring({frame: f, fps, config: {damping: 12, stiffness: 200, mass: 0.6}})})`,
              transformOrigin: 'left center',
            }}
          >
            {n}
            {['st', 'nd', 'rd'][n - 1] ?? 'th'} freedom
          </div>
          {R.so ? <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 24, letterSpacing: '0.16em', color: '#6B5BD6', textTransform: 'uppercase'}}>so-called</div> : null}
          {R.deal ? (
            <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 22, letterSpacing: '0.12em', color: alpha('#10213A', 0.55), textTransform: 'uppercase'}}>· {R.deal}</div>
          ) : null}
        </div>
        <div style={{marginTop: 14, fontFamily: F.head, fontWeight: 850 as any, fontSize: 58, letterSpacing: '-0.03em', color: '#10213A'}}>
          <Rich text={d.title ?? R.title} />
        </div>
        <div style={{marginTop: 6, fontFamily: F.body, fontWeight: 550 as any, fontSize: 30, color: alpha('#10213A', 0.62)}}>
          <Rich text={d.sub ?? R.sub} />
        </div>
      </div>
      <Ann>
        {/* sea + States */}
        {state('A', 'M150,520 C160,420 300,400 420,420 C540,440 610,520 600,610 C590,700 470,760 360,740 C240,720 140,640 150,520 Z', '#FCD9C0', names.A, 380, 700)}
        {state('B', 'M760,380 C820,300 980,290 1090,330 C1220,380 1280,500 1250,610 C1220,710 1090,740 980,720 C860,700 760,640 740,540 C730,480 730,430 760,380 Z', '#CFE3F7', names.B, 1010, 700)}
        {state('C', 'M1400,440 C1460,380 1600,370 1700,410 C1790,450 1810,560 1760,630 C1700,700 1570,710 1480,670 C1390,630 1350,520 1400,440 Z', '#CDEBDF', names.C, 1590, 690)}
        {/* route trail */}
        <DrawPath d={path} at={start} dur={flyFrames} color={R.so ? '#6B5BD6' : b.accent} width={6} dash="4 14" />
        <DrawPath d={path} at={start} dur={flyFrames} color={alpha(R.so ? '#6B5BD6' : b.accent, 0.25)} width={14} />
        {/* cities */}
        {(Object.keys(CITY) as (keyof typeof CITY)[]).map((k) => {
          if (k === 'B2' && !R.legs.includes('B2')) return null;
          const [x, y] = CITY[k];
          const on = R.legs.includes(k) || (k === 'B' && n === 1);
          return (
            <g key={k} opacity={on ? 1 : 0.5}>
              <circle cx={x} cy={y} r={14} fill="#FFFFFF" stroke="#10213A" strokeWidth={4} />
              <circle cx={x} cy={y} r={6} fill="#10213A" />
              <text x={x} y={y + 44} textAnchor="middle" fontFamily={F.head} fontWeight={750} fontSize={26} fill="#10213A">
                {cityNames[k]}
              </text>
            </g>
          );
        })}
        {/* aircraft (+ shadow when "high", for the overflight) */}
        {f >= start - 2 ? (
          <>
            <g transform={`translate(${pos.x + 8} ${pos.y + 14 + lift}) rotate(${hdg}) scale(1.6)`} opacity={0.18}>
              <path d="M22,0 L-22,-3 L-22,3 Z M5,-2 L-10,-22 L-10,22 L5,2 Z" fill="#10213A" />
            </g>
            <g transform={`translate(${pos.x} ${pos.y - lift}) rotate(${hdg}) scale(1.6)`}>
              <PlaneIcon color={R.so ? '#6B5BD6' : b.accent} />
            </g>
          </>
        ) : null}
      </Ann>
      {/* stop chips */}
      {R.stops.map((s, i) => {
        const at = s.kind === 'start' || s.kind === 'up' ? (R.legs[0] === s.at ? start - 6 : reachAt(s.at)) : reachAt(s.at);
        const p = spring({frame: f - at, fps, config: {damping: 13, stiffness: 190, mass: 0.6}});
        if (f < at) return null;
        const c = CHIP[s.kind];
        const [x, y] = CITY[s.at];
        const above = s.kind === 'over';
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: above ? y - 330 : y + 70,
              transform: `translateX(-50%) scale(${p})`,
              transformOrigin: above ? 'bottom center' : 'top center',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 18px 10px 12px',
              borderRadius: 16,
              background: '#FFFFFF',
              boxShadow: '0 12px 28px rgba(16,33,58,0.16)',
              border: `3px solid ${c.color}`,
              whiteSpace: 'nowrap',
              fontFamily: F.head,
              fontWeight: 800 as any,
              fontSize: 24,
              color: c.color,
            }}
          >
            <div style={{width: 36, height: 36, borderRadius: 10, background: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              <Icon name={c.icon} size={24} color="#FFFFFF" stroke={2.4} />
            </div>
            {s.kind === 'up' ? '↑ ' : s.kind === 'down' ? '↓ ' : s.kind === 'both' ? '↓↑ ' : ''}
            {c.text}
          </div>
        );
      })}
      {/* freedoms strip */}
      <div style={{position: 'absolute', right: 90, top: 76, display: 'flex', gap: 8, opacity: prog(f, 6, 12)}}>
        {strip.map((k) => {
          const on = k === n;
          const so = k >= 6;
          return (
            <div
              key={k}
              style={{
                width: 50,
                height: 50,
                borderRadius: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: F.head,
                fontWeight: 850 as any,
                fontSize: 24,
                background: on ? (so ? '#6B5BD6' : b.accent) : k < n ? alpha('#10213A', 0.1) : '#FFFFFF',
                color: on ? '#FFFFFF' : alpha('#10213A', k < n ? 0.75 : 0.45),
                border: so && !on ? `2px dashed ${alpha('#6B5BD6', 0.5)}` : '2px solid rgba(16,33,58,0.06)',
                transform: on ? 'translateY(-4px) scale(1.12)' : undefined,
                boxShadow: on ? '0 10px 24px rgba(16,33,58,0.2)' : 'none',
              }}
            >
              {k}
            </div>
          );
        })}
      </div>
      {d.note ? (
        <div
          style={{
            position: 'absolute',
            left: 110,
            top: SAFE_BOTTOM - 120,
            maxWidth: 900,
            opacity: prog(f, typeof d.noteCue === 'number' && scene.cues?.[d.noteCue] !== undefined ? scene.cues[d.noteCue] : start + flyFrames, 12),
            padding: '14px 22px',
            borderRadius: 16,
            background: alpha(R.so ? '#6B5BD6' : b.accent, 0.1),
            borderLeft: `6px solid ${R.so ? '#6B5BD6' : b.accent}`,
            fontFamily: F.head,
            fontWeight: 650 as any,
            fontSize: 28,
            color: '#10213A',
          }}
        >
          <Rich text={d.note} />
        </div>
      ) : null}
    </Paper>
  );
};
