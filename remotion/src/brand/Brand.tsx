import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Icon} from '../components/Icon';
import {Shot3D} from '../three/Shot3D';
import {alpha, BrandProvider, F, FontGate, useBrand} from '../theme';
import type {Brand} from '../types';

// Runway To Cockpit brand kit: an original logo mark (a runway in perspective that lifts off into a climbing jet),
// profile picture, YouTube banner, video watermark and Instagram highlight covers.

const NAVY = '#14305A';
const ORANGE = '#EE6A1A';

/** The logo mark: orange disc, white runway in perspective with centreline, a jet climbing off the far end. */
export const LogoMark: React.FC<{size: number; ring?: boolean; flat?: boolean}> = ({size, ring = true, flat}) => (
  <svg width={size} height={size} viewBox="0 0 200 200">
    <defs>
      <linearGradient id="lm-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#F58A3A" />
        <stop offset="1" stopColor="#E35A10" />
      </linearGradient>
      <clipPath id="lm-clip">
        <circle cx="100" cy="100" r="92" />
      </clipPath>
    </defs>
    {ring ? <circle cx="100" cy="100" r="99" fill={NAVY} /> : null}
    <circle cx="100" cy="100" r={ring ? 92 : 100} fill={flat ? ORANGE : 'url(#lm-bg)'} />
    <g clipPath="url(#lm-clip)">
      {/* runway in perspective */}
      <path d="M58,210 L88,112 L112,112 L142,210 Z" fill="#FFFFFF" />
      <path d="M58,210 L88,112 L112,112 L142,210 Z" fill="none" stroke={NAVY} strokeWidth="0" />
      {/* threshold piano keys */}
      {[-3, -2, -1, 1, 2, 3].map((k) => (
        <path key={k} d={`M${100 + k * 9 - 2.6},196 L${100 + k * 5.2 - 1.4},172 L${100 + k * 5.2 + 1.4},172 L${100 + k * 9 + 2.6},196 Z`} fill={NAVY} opacity="0.9" />
      ))}
      {/* centreline dashes */}
      {[
        [158, 146],
        [138, 129],
        [124, 118],
      ].map(([y0, y1], i) => (
        <path key={i} d={`M${100 - 1.6 + i * 0.3},${y0} L${100 - 1 + i * 0.3},${y1} L${100 + 1 - i * 0.3},${y1} L${100 + 1.6 - i * 0.3},${y0} Z`} fill={NAVY} />
      ))}
      {/* horizon glow */}
      <rect x="0" y="108" width="200" height="4" fill="#FFFFFF" opacity="0.35" />
    </g>
    {/* climbing jet (top view, banked up and right) */}
    <g transform="translate(118 64) rotate(-35) scale(1.25)">
      <path d="M0,-22 C2.2,-22 3,-19 3,-15 L3,10 C3,14 2,18 0,19 C-2,18 -3,14 -3,10 L-3,-15 C-3,-19 -2.2,-22 0,-22 Z" fill="#FFFFFF" />
      <path d="M3,-4 L24,8 L24,12 L3,5 Z M-3,-4 L-24,8 L-24,12 L-3,5 Z" fill="#FFFFFF" />
      <path d="M2.4,12 L10,17 L10,19 L2.4,17 Z M-2.4,12 L-10,17 L-10,19 L-2.4,17 Z" fill="#FFFFFF" />
      <path d="M9,1 L9,6 M-9,1 L-9,6" stroke={NAVY} strokeWidth="2.6" strokeLinecap="round" />
    </g>
    {/* contrail from the runway end to the jet */}
    <path d="M100,108 C104,96 108,86 113,76" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeDasharray="0.1 7" opacity="0.9" />
  </svg>
);

const Wordmark: React.FC<{size: number; color?: string; accent?: string; stacked?: boolean}> = ({size, color = NAVY, accent = ORANGE, stacked}) => (
  <div style={{fontFamily: F.head, fontWeight: 850 as any, fontSize: size, lineHeight: 0.98, letterSpacing: '-0.035em', color}}>
    {stacked ? (
      <>
        <div>Runway</div>
        <div>
          <span style={{color: accent}}>To</span> Cockpit
        </div>
      </>
    ) : (
      <>
        Runway <span style={{color: accent}}>To</span> Cockpit
      </>
    )}
  </div>
);

type BP = {brand?: Brand};

export const BrandAvatar: React.FC<BP> = ({brand}) => (
  <BrandProvider brand={brand}>
    <FontGate>
      <AbsoluteFill style={{background: '#FFFFFF', alignItems: 'center', justifyContent: 'center'}}>
        <LogoMark size={800} />
      </AbsoluteFill>
    </FontGate>
  </BrandProvider>
);

/** YouTube watermark: transparent background, logo only (150×150 shown bottom-right on every video). */
export const BrandWatermark: React.FC<BP> = ({brand}) => (
  <BrandProvider brand={brand}>
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <LogoMark size={150} />
    </AbsoluteFill>
  </BrandProvider>
);

/** YouTube banner 2560×1440. Everything important sits inside the 1546×423 safe area in the middle. */
export const BrandBanner: React.FC<BP> = ({brand}) => {
  const f = useCurrentFrame();
  return (
    <BrandProvider brand={brand}>
      <FontGate>
        <BannerInner f={f} />
      </FontGate>
    </BrandProvider>
  );
};

const BannerInner: React.FC<{f: number}> = ({f}) => {
  const b = useBrand();
  const safeX = (2560 - 1546) / 2;
  const safeY = (1440 - 423) / 2;
  return (
    <AbsoluteFill style={{background: '#DCE7F3'}}>
      <Shot3D kind="cruise" view="front" frame={f || 40} dur={300} shift={0.95} width={2560} height={1440} />
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(90deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.92) 44%, rgba(255,255,255,0.6) 62%, rgba(255,255,255,0) 76%)',
        }}
      />
      <div style={{position: 'absolute', left: safeX, top: safeY, width: 1546, height: 423, display: 'flex', alignItems: 'center', gap: 46}}>
        <LogoMark size={300} />
        <div>
          <Wordmark size={118} />
          <div style={{marginTop: 22, fontFamily: F.head, fontWeight: 700, fontSize: 44, letterSpacing: '0.02em', color: alpha(NAVY, 0.82)}}>
            DGCA ground school · one lesson every day
          </div>
          <div style={{marginTop: 18, display: 'flex', gap: 16}}>
            {['Air Regulations', 'Exam tips', '10:15 AM IST'].map((t, i) => (
              <div
                key={t}
                style={{
                  padding: '10px 24px',
                  borderRadius: 999,
                  background: i === 2 ? b.accent : '#FFFFFF',
                  color: i === 2 ? '#FFFFFF' : NAVY,
                  border: i === 2 ? 'none' : `2.5px solid ${alpha(NAVY, 0.14)}`,
                  fontFamily: F.head,
                  fontWeight: 750 as any,
                  fontSize: 32,
                }}
              >
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Instagram story-highlight cover (1080×1920; Instagram shows the middle circle). */
export const BrandHighlight: React.FC<BP & {icon?: string; label?: string; tone?: 'orange' | 'navy' | 'sky'}> = ({brand, icon = 'plane', label, tone = 'orange'}) => {
  const bg = tone === 'navy' ? NAVY : tone === 'sky' ? '#1F6FB2' : ORANGE;
  return (
    <BrandProvider brand={brand}>
      <FontGate>
        <AbsoluteFill style={{background: bg, alignItems: 'center', justifyContent: 'center'}}>
          <div
            style={{
              width: 640,
              height: 640,
              borderRadius: 320,
              background: 'rgba(255,255,255,0.14)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 18,
            }}
          >
            <Icon name={icon} size={300} color="#FFFFFF" stroke={1.8} />
            {label ? <div style={{fontFamily: F.head, fontWeight: 800 as any, fontSize: 64, color: '#FFFFFF', letterSpacing: '-0.01em'}}>{label}</div> : null}
          </div>
        </AbsoluteFill>
      </FontGate>
    </BrandProvider>
  );
};
