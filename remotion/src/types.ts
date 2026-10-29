// Shape of the timeline JSON produced by engine/build.py (all times in frames).

export type Brand = {
  bg: string;
  bg2: string;
  ink: string;
  muted: string;
  accent: string;
  sky: string;
  good: string;
  warn: string;
  mode?: 'light' | 'dark';
  card?: string; // card / panel surface
  onAccent?: string; // text/icons placed on the accent colour
  ocean?: string; // globe water
  land?: string; // globe land dots
};

export type Word = {t: string; s: number; e: number; k?: boolean};

export type Scene = {
  id: string;
  type: string;
  start: number; // absolute frame
  dur: number; // frames
  cues: number[]; // frames relative to scene start
  words: Word[]; // relative to scene start
  chapter?: number;
  data: any;
};

export type Chapter = {n: number; title: string; start: number; end: number};

export type Caption = {s: number; e: number; words: Word[]}; // absolute frames

export type Timeline = {
  kind: 'long' | 'reel';
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  series: {name: string; short: string; episode: number; title: string; subtitle?: string; exam?: string};
  channel: {name: string; handle: string};
  brand: Brand;
  chapters: Chapter[];
  scenes: Scene[];
  captions: Caption[];
  showCaptions: boolean;
  publishLine?: string;
};

export type ThumbProps = {
  brand: Brand;
  line1: string;
  line2: string;
  badge: string;
  kicker: string;
  visual: 'globe' | 'plane';
  markers?: {lat: number; lon: number; label?: string}[];
  arcs?: {from: [number, number]; to: [number, number]}[];
  rotate?: [number, number];
};
