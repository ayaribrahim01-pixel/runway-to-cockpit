import React from 'react';

/** Passenger-window frame drawn over the "wing" view (the cabin wall with a rounded window cut-out). */
export const CabinWindow: React.FC<{width: number; height: number}> = ({width: W, height: H}) => {
  const ww = Math.min(W * 0.84, H * 1.5);
  const wh = H * 0.9;
  const rx = 0.42 * Math.min(ww, wh);
  const x = (W - ww) / 2;
  const y = (H - wh) / 2;
  const hole = `M${x + rx},${y} H${x + ww - rx} A${rx},${rx} 0 0 1 ${x + ww},${y + rx} V${y + wh - rx} A${rx},${rx} 0 0 1 ${x + ww - rx},${y + wh} H${x + rx} A${rx},${rx} 0 0 1 ${x},${y + wh - rx} V${y + rx} A${rx},${rx} 0 0 1 ${x + rx},${y} Z`;
  const outer = `M0,0 H${W} V${H} H0 Z`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{position: 'absolute', inset: 0}}>
      <defs>
        <linearGradient id="cw-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EEEBE6" />
          <stop offset="1" stopColor="#D5D0C8" />
        </linearGradient>
        <linearGradient id="cw-glare" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.22" />
          <stop offset="0.35" stopColor="#FFFFFF" stopOpacity="0.04" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <filter id="cw-blur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation={H * 0.018} />
        </filter>
        <clipPath id="cw-hole">
          <path d={hole} />
        </clipPath>
      </defs>
      {/* glare on the inner pane */}
      <path d={hole} fill="url(#cw-glare)" />
      {/* soft shadow of the window reveal, inside the opening */}
      <g clipPath="url(#cw-hole)">
        <path d={`${outer} ${hole}`} fillRule="evenodd" fill="rgba(40,36,30,0.55)" filter="url(#cw-blur)" />
      </g>
      {/* cabin wall */}
      <path d={`${outer} ${hole}`} fillRule="evenodd" fill="url(#cw-wall)" />
      {/* frame bevel */}
      <path d={hole} fill="none" stroke="#C8C2B8" strokeWidth={H * 0.022} />
      <path d={hole} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={H * 0.004} transform={`translate(0 ${-H * 0.006})`} />
    </svg>
  );
};
