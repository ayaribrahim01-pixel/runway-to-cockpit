import React from 'react';

/** Original top-view airliner silhouette (nose pointing right), drawn in a 200×200 box. */
export const PLANE_PATH =
  'M192 100 C192 96 186 93 178 93 L122 93 L84 28 L71 28 L97 93 L46 93 L28 70 L20 70 L31 95 L14 98 L14 102 L31 105 L20 130 L28 130 L46 107 L97 107 L71 172 L84 172 L122 107 L178 107 C186 107 192 104 192 100 Z';

export const Plane: React.FC<{size?: number; color?: string; rotate?: number; style?: React.CSSProperties; glow?: string}> = ({
  size = 120,
  color = '#fff',
  rotate = 0,
  style,
  glow,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 200 200"
    style={{transform: `rotate(${rotate}deg)`, overflow: 'visible', filter: glow ? `drop-shadow(0 0 18px ${glow})` : undefined, ...style}}
  >
    <path d={PLANE_PATH} fill={color} />
    <rect x={104} y={56} width={16} height={7} rx={3.5} fill={color} />
    <rect x={104} y={137} width={16} height={7} rx={3.5} fill={color} />
  </svg>
);
