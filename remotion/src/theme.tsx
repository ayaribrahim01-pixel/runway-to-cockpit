import '@fontsource-variable/inter/opsz.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';
import '@fontsource/jetbrains-mono/500.css';
import React, {createContext, useContext, useEffect, useState} from 'react';
import {continueRender, delayRender} from 'remotion';
import type {Brand} from './types';

export const defaultBrand: Brand = {
  bg: '#07101F',
  bg2: '#0D1B33',
  ink: '#EEF3FA',
  muted: '#8FA3BF',
  accent: '#FFB224',
  sky: '#4CC9F0',
  good: '#34D399',
  warn: '#FB7185',
};

// SF Pro-style system typography: Inter with optical sizing (Display cut at large sizes, Text cut at small sizes).
// (Apple's SF Pro licence only covers Apple-platform UI mock-ups, so it can't be used in published videos.)
export const F = {
  head: '"Inter Variable", Inter, system-ui, sans-serif',
  body: '"Inter Variable", Inter, system-ui, sans-serif',
  hand: '"Inter Variable", Inter, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
};

const BrandCtx = createContext<Brand>(defaultBrand);
export const BrandProvider: React.FC<{brand?: Brand; children: React.ReactNode}> = ({brand, children}) => (
  <BrandCtx.Provider value={{...defaultBrand, ...(brand || {})}}>{children}</BrandCtx.Provider>
);
export const useBrand = () => useContext(BrandCtx);

export const alpha = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
};

/** Block rendering until web fonts are loaded, so the first frames never show fallback type. */
export const FontGate: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [handle] = useState(() => delayRender('Loading fonts'));
  useEffect(() => {
    const faces = [
      '700 80px "Inter Variable"',
      '600 40px "Inter Variable"',
      '500 40px "Inter Variable"',
      '400 40px "Inter Variable"',
      '700 80px "Space Grotesk"',
      '600 40px "Space Grotesk"',
      '500 40px "Space Grotesk"',
      '500 40px Inter',
      '600 40px Inter',
      '700 40px Inter',
      '400 40px Inter',
      '700 40px Kalam',
      '400 40px Kalam',
      '500 40px "JetBrains Mono"',
    ];
    Promise.all(faces.map((f) => document.fonts.load(f)))
      .then(() => document.fonts.ready)
      .then(() => continueRender(handle))
      .catch(() => continueRender(handle));
  }, [handle]);
  return <>{children}</>;
};

/** Text with *emphasis* rendered in the accent colour. */
export const Rich: React.FC<{text: string; color?: string; style?: React.CSSProperties; under?: boolean}> = ({
  text,
  color,
  style,
  under,
}) => {
  const b = useBrand();
  const parts = String(text ?? '').split(/(\*[^*]+\*)/g);
  return (
    <span style={style}>
      {parts.map((p, i) =>
        p.startsWith('*') && p.endsWith('*') ? (
          <span
            key={i}
            style={{
              color: color ?? b.accent,
              textDecoration: under ? 'underline' : undefined,
              textDecorationThickness: under ? 4 : undefined,
              textUnderlineOffset: under ? 10 : undefined,
            }}
          >
            {p.slice(1, -1)}
          </span>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </span>
  );
};

export const stripMarks = (s: string) => String(s ?? '').replace(/\*/g, '');

export const isLight = (b: Brand) => (b.mode ?? 'dark') === 'light';
/** hairline / border colour that works on both themes */
export const edge = (b: Brand, a: number) => alpha(isLight(b) ? b.ink : '#FFFFFF', a);
/** card / panel surface */
export const surface = (b: Brand, a = 1) => (isLight(b) ? alpha(b.card ?? '#FFFFFF', a) : alpha(b.bg2, 0.6 * a));
/** soft drop shadow */
export const shadow = (b: Brand, k = 1) =>
  isLight(b) ? `0 ${12 * k}px ${34 * k}px rgba(16,33,58,${0.1 * k}), 0 2px 6px rgba(16,33,58,0.05)` : `0 20px 50px rgba(0,0,0,${0.3 * k})`;
/** opacity for items already covered (dimmed), a little stronger on light backgrounds */
export const dim = (b: Brand, a: number) => (isLight(b) ? Math.min(1, a + 0.16) : a);
export const onAccent = (b: Brand) => b.onAccent ?? (isLight(b) ? '#FFFFFF' : b.bg);
