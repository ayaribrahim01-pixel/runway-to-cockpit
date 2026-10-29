import {Easing, interpolate, spring} from 'remotion';
import type {Scene} from './types';

export const EASE = Easing.bezier(0.16, 1, 0.3, 1); // smooth "expo out"
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
export const CLAMP = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** 0→1 over d frames starting at frame a, eased. */
export const prog = (f: number, a: number, d = 16, ease = EASE) =>
  interpolate(f, [a, a + Math.max(1, d)], [0, 1], {...CLAMP, easing: ease});

/** Spring 0→1 starting at frame a (no overshoot by default). */
export const pop = (f: number, fps: number, a: number, damping = 200, stiffness = 140) =>
  spring({frame: f - a, fps, config: {damping, stiffness, mass: 0.75}});

export const bouncy = (f: number, fps: number, a: number) =>
  spring({frame: f - a, fps, config: {damping: 13, stiffness: 160, mass: 0.7}});

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Frame of cue i inside a scene; falls back to an even spread when the script had no marker. */
export const cue = (scene: Scene, i: number, count?: number, lead = 6) => {
  const c = scene.cues?.[i];
  if (typeof c === 'number' && !Number.isNaN(c)) return c;
  const n = count ?? i + 1;
  const usable = Math.max(1, scene.dur * 0.7);
  return Math.round(lead + (usable / Math.max(1, n)) * i);
};

/** Index of the most recent cue that has fired (-1 before the first). */
export const activeIndex = (scene: Scene, f: number, count: number) => {
  let a = -1;
  for (let i = 0; i < count; i++) if (f >= cue(scene, i, count)) a = i;
  return a;
};

/** Standard "rise in": opacity + translateY. */
export const rise = (f: number, a: number, dist = 34, d = 18) => {
  const p = prog(f, a, d);
  return {opacity: p, transform: `translateY(${(1 - p) * dist}px)`};
};

export const slideIn = (f: number, a: number, dx = 60, d = 18) => {
  const p = prog(f, a, d);
  return {opacity: p, transform: `translateX(${(1 - p) * dx}px)`};
};
