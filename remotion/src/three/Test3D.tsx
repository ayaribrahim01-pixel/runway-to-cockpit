import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {BrandProvider, FontGate} from '../theme';
import type {Brand} from '../types';
import {Shot3D} from './Shot3D';

export type Test3DProps = {kind?: 'cruise' | 'takeoff'; view?: string; shift?: number; tau0?: number; brand?: Brand};

/** Stand-alone composition for checking 3D shots. */
export const Test3D: React.FC<Test3DProps> = ({kind = 'cruise', view, shift, tau0, brand}) => {
  const f = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return (
    <BrandProvider brand={brand}>
      <FontGate>
        <AbsoluteFill style={{background: '#DCE7F3'}}>
          <Shot3D kind={kind} view={view} frame={f} dur={durationInFrames} shift={shift} tau0={tau0} />
        </AbsoluteFill>
      </FontGate>
    </BrandProvider>
  );
};
