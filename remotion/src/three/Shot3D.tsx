import {ThreeCanvas} from '@remotion/three';
import React, {useEffect, useLayoutEffect, useMemo, useState} from 'react';
import {AbsoluteFill, useDelayRender, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {F, useBrand} from '../theme';
import {CabinWindow} from './CabinWindow';
import type {Livery} from './textures';
import {CruiseWorld, TakeoffWorld} from './worlds';

/** Hold the 3D canvas until the livery font is loaded (the fuselage title is drawn into a texture once). */
const FontsReady: React.FC<{children: React.ReactNode}> = ({children}) => {
  const {delayRender, continueRender} = useDelayRender();
  const [handle] = useState(() => delayRender('Loading 3D livery font'));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    document.fonts
      .load('700 120px "Inter Variable"')
      .catch(() => null)
      .then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  // release only after the children (and the canvas' own render hold) have committed
  useLayoutEffect(() => {
    if (ready) continueRender(handle);
  }, [ready, handle, continueRender]);
  return ready ? <>{children}</> : null;
};

export type Shot3DProps = {
  kind: 'cruise' | 'takeoff';
  view?: string;
  frame: number;
  dur: number;
  /** horizontal frame shift (-1..1): positive moves the subject right, leaving room for text on the left */
  shift?: number;
  width?: number;
  height?: number;
  tau0?: number;
};

export const Shot3D: React.FC<Shot3DProps> = ({kind, view, frame, dur, shift = 0, width, height, tau0}) => {
  const cfg = useVideoConfig();
  const b = useBrand();
  const W = width ?? cfg.width;
  const H = height ?? cfg.height;
  const v = view ?? (kind === 'takeoff' ? 'follow' : 'side');
  const livery = useMemo<Livery>(() => ({accent: b.accent, navy: '#14305A', title: 'Runway To Cockpit', font: F.head}), [b.accent]);
  return (
    <AbsoluteFill style={{width: W, height: H}}>
      <FontsReady>
        <ThreeCanvas
          width={W}
          height={H}
          shadows
          gl={{antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1, preserveDrawingBuffer: true}}
          camera={{fov: 30, near: 0.2, far: 60000, position: [0, 2, 30]}}
        >
          {kind === 'takeoff' ? (
            <TakeoffWorld livery={livery} frame={frame} dur={dur} view={v} shift={shift} tau0={tau0} fps={cfg.fps} />
          ) : (
            <CruiseWorld livery={livery} frame={frame} dur={dur} view={v} shift={shift} fps={cfg.fps} />
          )}
        </ThreeCanvas>
      </FontsReady>
      {kind === 'cruise' && v === 'wing' ? <CabinWindow width={W} height={H} /> : null}
    </AbsoluteFill>
  );
};
