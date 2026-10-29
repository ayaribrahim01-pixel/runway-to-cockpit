import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import {Background} from './components/Background';
import {Overlay} from './components/Overlay';
import {Chapter, Hook, Outro, Points, Recap, Stat, Tip, Title} from './scenes/basic';
import {ChapterShot, ShotScene} from './scenes/shot';
import {Compare, Grid, Ladder, Org, Quote, Timeline as TimelineScene} from './scenes/structure';
import {Diagram, GlobeScene, Quiz} from './scenes/visual';
import {BrandProvider, FontGate} from './theme';
import {Airspace3D} from './three/Airspace3D';
import type {Scene, Timeline} from './types';
import {AirportMap} from './v2/AirportMap';
import {Freedom} from './v2/Freedoms';
import {Drift, Trans} from './v2/fx';
import {Count, Doc, ExamTip, Kinetic, Split, Title3D, Whiteboard} from './v2/scenes';
import {WordCaptions} from './v2/WordCaptions';

// v2 lesson: varied beats, a transition into every beat, camera drift, word-by-word captions.

const MAP: Record<string, React.FC<{scene: Scene}>> = {
  hook: Hook,
  title: Title,
  chapter: Chapter,
  points: Points,
  stat: Stat,
  tip: Tip,
  recap: Recap,
  timeline: TimelineScene,
  ladder: Ladder,
  org: Org,
  compare: Compare,
  quote: Quote,
  grid: Grid,
  globe: GlobeScene,
  diagram: Diagram,
  quiz: Quiz,
  shot: ShotScene,
  kinetic: Kinetic,
  doc: Doc,
  split: Split,
  examtip: ExamTip,
  count: Count,
  whiteboard: Whiteboard,
  airspace3d: Airspace3D,
  airportmap: AirportMap,
  freedom: Freedom,
};

/** beats that bring their own full-frame background */
const OWN_BG = new Set(['kinetic', 'doc', 'split', 'examtip', 'count', 'whiteboard', 'airspace3d', 'airportmap', 'title3d', 'shot', 'freedom']);
/** beats whose camera already moves (no extra drift) */
const SELF_MOVING = new Set(['shot', 'title3d', 'airspace3d', 'airportmap']);

export const LESSON_OVERLAP = 10;
const V1_FIT: Record<string, number> = {points: 0.9, stat: 0.92, recap: 0.9, timeline: 0.9, ladder: 0.88, org: 0.9, compare: 0.9, grid: 0.9, globe: 0.94, diagram: 0.9, quiz: 0.9, quote: 0.94, tip: 0.94};

export const Lesson: React.FC<Timeline> = (tl) => (
  <BrandProvider brand={tl.brand}>
    <FontGate>
      <AbsoluteFill style={{background: tl.brand?.bg ?? '#F8F5EF'}}>
        {tl.scenes.map((s, i) => {
          const last = i === tl.scenes.length - 1;
          const next = last ? undefined : tl.scenes[i + 1];
          const overlap = last ? 0 : LESSON_OVERLAP;
          const chapter3d = s.type === 'chapter' && !!s.data?.bg3d;
          const C = chapter3d ? ChapterShot : MAP[s.type];
          const accent = (s as any).accent as string | undefined;
          const brand = accent ? {...tl.brand, accent} : tl.brand;
          const ownBg = OWN_BG.has(s.type) || chapter3d;
          const moving = SELF_MOVING.has(s.type) || chapter3d;
          let body: React.ReactNode =
            s.type === 'outro' ? (
              <Outro scene={s} channel={tl.channel} publishLine={tl.publishLine} />
            ) : s.type === 'title3d' ? (
              <Title3D scene={s} series={tl.series} />
            ) : C ? (
              <C scene={s} />
            ) : null;
          // v1 layouts were drawn for full height: shrink them a touch so the word captions never cover content
          if (!ownBg && V1_FIT[s.type]) body = <AbsoluteFill style={{transform: `scale(${V1_FIT[s.type]})`, transformOrigin: '50% 2%'}}>{body}</AbsoluteFill>;
          if (!moving) body = <Drift variant={(s as any).drift ?? i} dur={s.dur + overlap}>{body}</Drift>;
          return (
            <Sequence key={s.id + '-' + i} from={s.start} durationInFrames={Math.max(1, s.dur + overlap)} name={`${s.type}:${s.id}`}>
              <BrandProvider brand={brand}>
                <Trans tin={i === 0 ? 'cut' : (s as any).tin} tout={(next as any)?.tin} dur={s.dur} overlap={overlap}>
                  {ownBg ? null : <Background />}
                  {body}
                </Trans>
              </BrandProvider>
            </Sequence>
          );
        })}
        <Overlay tl={tl} />
        {tl.showCaptions !== false ? <WordCaptions captions={tl.captions} /> : null}
      </AbsoluteFill>
    </FontGate>
  </BrandProvider>
);
