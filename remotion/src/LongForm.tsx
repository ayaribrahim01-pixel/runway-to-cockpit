import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import {Background} from './components/Background';
import {LongCaptions, Overlay} from './components/Overlay';
import {SceneFade} from './reel/Reel';
import {Chapter, Hook, Outro, Points, Recap, Stat, Tip, Title} from './scenes/basic';
import {ChapterShot, ShotScene} from './scenes/shot';
import {Compare, Grid, Ladder, Org, Quote, Timeline as TimelineScene} from './scenes/structure';
import {Diagram, GlobeScene, Quiz} from './scenes/visual';
import {BrandProvider, FontGate} from './theme';
import type {Scene, Timeline} from './types';

// v1 lesson composition (kept for v1 scripts). v2 scripts use Lesson.tsx.

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
};

export const OVERLAP = 8; // frames each scene lingers under the next one (crossfade)

export const LongForm: React.FC<Timeline> = (tl) => (
  <BrandProvider brand={tl.brand}>
    <FontGate>
      <AbsoluteFill>
        <Background />
        {tl.scenes.map((s, i) => {
          const last = i === tl.scenes.length - 1;
          const extra = last ? 0 : OVERLAP;
          const C = s.type === 'chapter' && s.data?.bg3d ? ChapterShot : MAP[s.type];
          return (
            <Sequence key={s.id + '-' + i} from={s.start} durationInFrames={Math.max(1, s.dur + extra)} name={`${s.type}:${s.id}`}>
              <SceneFade dur={s.dur + extra} last={last}>
                {s.type === 'outro' ? <Outro scene={s} channel={tl.channel} publishLine={tl.publishLine} /> : C ? <C scene={s} /> : null}
              </SceneFade>
            </Sequence>
          );
        })}
        <Overlay tl={tl} />
        {tl.showCaptions ? <LongCaptions captions={tl.captions} /> : null}
      </AbsoluteFill>
    </FontGate>
  </BrandProvider>
);
