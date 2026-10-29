import React from 'react';
import {Composition, Still} from 'remotion';
import {BrandAvatar, BrandBanner, BrandHighlight, BrandWatermark} from './brand/Brand';
import {Lesson} from './Lesson';
import {LongForm} from './LongForm';
import {Post, PostProps} from './posts/Post';
import {ReelComp} from './reel/Reel';
import {Test3D, Test3DProps} from './three/Test3D';
import {Thumbnail} from './Thumbnail';
import type {ThumbProps, Timeline} from './types';

const LIGHT = {
  mode: 'light' as const,
  bg: '#F8F5EF',
  bg2: '#FFFFFF',
  card: '#FFFFFF',
  ink: '#10213A',
  muted: '#5D6B80',
  accent: '#EE6A1A',
  onAccent: '#FFFFFF',
  sky: '#1F6FB2',
  good: '#15803D',
  warn: '#D9363E',
  ocean: '#EAF2FB',
  land: '#2B5C9A',
};

const emptyTimeline = (kind: 'long' | 'reel'): Timeline => ({
  kind,
  fps: 30,
  width: kind === 'long' ? 1920 : 1080,
  height: kind === 'long' ? 1080 : 1920,
  durationInFrames: 150,
  series: {name: 'Air Regulations', short: 'Air Regs', episode: 1, title: 'Preview'},
  channel: {name: 'Runway To Cockpit', handle: '@runwaytocockpit'},
  brand: LIGHT,
  chapters: [],
  scenes: [],
  captions: [],
  showCaptions: false,
});

const meta = ({props}: {props: Timeline}) => ({
  durationInFrames: Math.max(1, props.durationInFrames),
  fps: props.fps,
  width: props.width,
  height: props.height,
});

const thumbDefaults: ThumbProps = {
  brand: LIGHT,
  line1: 'Who rules',
  line2: 'the sky?',
  badge: 'AIR REGS · EP 01',
  kicker: 'DGCA · EASA · UK CAA',
  visual: 'globe',
  markers: [
    {lat: 9.93, lon: 76.27},
    {lat: 51.47, lon: -0.45},
  ],
  arcs: [{from: [76.27, 9.93], to: [-0.45, 51.47]}],
  rotate: [46, 26],
};

export const Root: React.FC = () => (
  <>
    <Composition id="LongForm" component={LongForm as any} defaultProps={emptyTimeline('long')} calculateMetadata={meta as any} durationInFrames={150} fps={30} width={1920} height={1080} />
    <Composition id="Lesson" component={Lesson as any} defaultProps={emptyTimeline('long')} calculateMetadata={meta as any} durationInFrames={150} fps={30} width={1920} height={1080} />
    <Composition id="Reel" component={ReelComp as any} defaultProps={emptyTimeline('reel')} calculateMetadata={meta as any} durationInFrames={150} fps={30} width={1080} height={1920} />
    <Composition
      id="Test3D"
      component={Test3D as React.FC<Test3DProps>}
      defaultProps={{kind: 'cruise', view: 'side', brand: LIGHT} as Test3DProps}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
    />
    <Still id="Thumbnail" component={Thumbnail as any} defaultProps={thumbDefaults} width={1280} height={720} />
    <Still id="BrandAvatar" component={BrandAvatar as any} defaultProps={{brand: LIGHT}} width={800} height={800} />
    <Still id="BrandWatermark" component={BrandWatermark as any} defaultProps={{brand: LIGHT}} width={150} height={150} />
    <Still id="BrandBanner" component={BrandBanner as any} defaultProps={{brand: LIGHT}} width={2560} height={1440} />
    <Still id="BrandHighlight" component={BrandHighlight as any} defaultProps={{brand: LIGHT, icon: 'plane', label: 'Lessons', tone: 'orange'}} width={1080} height={1920} />
    <Still
      id="Post"
      component={Post as React.FC<PostProps>}
      defaultProps={
        {
          brand: LIGHT,
          variant: 'tip',
          series: 'Air Regs',
          episode: 1,
          data: {kind: 'exam', title: 'Article 1 = *Sovereignty*', sub: 'Chicago Convention, 1944', lines: ['Complete and *exclusive* sovereignty', 'over the airspace above its territory']},
        } as PostProps
      }
      width={1080}
      height={1350}
    />
  </>
);
