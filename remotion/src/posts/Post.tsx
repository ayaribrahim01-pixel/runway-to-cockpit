import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Icon} from '../components/Icon';
import {alpha, BrandProvider, F, FontGate, Rich, useBrand} from '../theme';
import type {Brand} from '../types';

// Instagram image posts, 1080×1350 (4:5): an exam tip, a quiz carousel (question / answer) and a cheat sheet.

export type PostProps = {
  brand?: Brand;
  variant: 'tip' | 'quiz' | 'sheet';
  slide?: 'q' | 'a';
  series?: string;
  episode?: number;
  handle?: string;
  data: any;
};

const W = 1080;
const H = 1350;

const Frame: React.FC<{series?: string; episode?: number; handle?: string; footer: string; children: React.ReactNode; tint?: string}> = ({
  series,
  episode,
  handle,
  footer,
  children,
  tint,
}) => {
  const b = useBrand();
  const c = tint ?? b.accent;
  return (
    <AbsoluteFill style={{background: '#F8F5EF', overflow: 'hidden'}}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 60% 45% at 85% 8%, ${alpha(c, 0.16)} 0%, rgba(0,0,0,0) 70%), radial-gradient(ellipse 55% 45% at 10% 92%, ${alpha('#1F6FB2', 0.1)} 0%, rgba(0,0,0,0) 70%)`,
        }}
      />
      <AbsoluteFill style={{backgroundImage: 'radial-gradient(rgba(16,33,58,0.08) 2px, transparent 2.4px)', backgroundSize: '36px 36px'}} />
      {/* header */}
      <div style={{position: 'absolute', left: 64, right: 64, top: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
          <div style={{width: 64, height: 64, borderRadius: 20, background: b.accent, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <Icon name="plane" size={40} color="#FFFFFF" stroke={2.2} />
          </div>
          <div style={{fontFamily: F.head, fontWeight: 800 as any, fontSize: 30, letterSpacing: '0.12em', color: '#10213A', textTransform: 'uppercase'}}>
            Runway To Cockpit
          </div>
        </div>
        {series ? (
          <div
            style={{
              padding: '10px 20px',
              borderRadius: 999,
              border: `2.5px solid ${alpha(c, 0.75)}`,
              color: c,
              fontFamily: F.head,
              fontWeight: 750 as any,
              fontSize: 24,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {series}
            {episode ? ` · EP ${String(episode).padStart(2, '0')}` : ''}
          </div>
        ) : null}
      </div>
      {children}
      {/* footer */}
      <div style={{position: 'absolute', left: 64, right: 64, bottom: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <div style={{fontFamily: F.head, fontWeight: 650 as any, fontSize: 27, color: alpha('#10213A', 0.6)}}>{handle ?? '@runwaytocockpit'}</div>
        <div style={{display: 'flex', alignItems: 'center', gap: 10, fontFamily: F.head, fontWeight: 800 as any, fontSize: 27, color: c}}>
          {footer}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Kicker: React.FC<{icon: string; text: string; color: string}> = ({icon, text, color}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 22px 12px 14px',
      borderRadius: 999,
      background: color,
      color: '#FFFFFF',
      fontFamily: F.head,
      fontWeight: 800 as any,
      fontSize: 26,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
    }}
  >
    <Icon name={icon} size={30} color="#FFFFFF" stroke={2.4} />
    {text}
  </div>
);

const TIP_VARIANTS: Record<string, {label: string; color: string; icon: string}> = {
  exam: {label: 'DGCA exam tip', color: '#EE6A1A', icon: 'target'},
  trap: {label: 'Exam trap', color: '#D9363E', icon: 'alert'},
  key: {label: 'Key point', color: '#1F6FB2', icon: 'bulb'},
  dyk: {label: 'Did you know?', color: '#0E9F8E', icon: 'sparkles'},
  easa: {label: 'EASA · UK CAA', color: '#6B5BD6', icon: 'world'},
  remember: {label: 'Remember it', color: '#F5A524', icon: 'brain'},
};

const Tip: React.FC<PostProps> = ({data, series, episode, handle}) => {
  const V = TIP_VARIANTS[data.kind ?? 'exam'] ?? TIP_VARIANTS.exam;
  const lines: string[] = data.lines || [];
  return (
    <Frame series={series} episode={episode} handle={handle} footer="Save for revision ✓" tint={V.color}>
      <div style={{position: 'absolute', left: 64, right: 64, top: 190, bottom: 140, display: 'flex', flexDirection: 'column'}}>
        <Kicker icon={V.icon} text={data.kicker ?? V.label} color={V.color} />
        <div
          style={{
            marginTop: 40,
            fontFamily: F.head,
            fontWeight: 850 as any,
            fontSize: data.size ?? 104,
            lineHeight: 1.0,
            letterSpacing: '-0.04em',
            color: '#10213A',
            textWrap: 'balance' as any,
          }}
        >
          <Rich text={data.title} color={V.color} />
        </div>
        {data.sub ? (
          <div style={{marginTop: 26, fontFamily: F.body, fontWeight: 500, fontSize: 38, lineHeight: 1.32, color: alpha('#10213A', 0.7)}}>
            <Rich text={data.sub} color={V.color} />
          </div>
        ) : null}
        <div style={{flex: 1}} />
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 34,
            padding: '34px 38px',
            boxShadow: '0 24px 60px rgba(16,33,58,0.12)',
            borderLeft: `10px solid ${V.color}`,
          }}
        >
          {lines.map((ln, i) => (
            <div key={i} style={{display: 'flex', gap: 18, alignItems: 'flex-start', marginBottom: i < lines.length - 1 ? 20 : 0}}>
              <div style={{width: 16, height: 16, borderRadius: 8, background: V.color, marginTop: 17, flex: '0 0 auto'}} />
              <div style={{fontFamily: F.head, fontWeight: 650 as any, fontSize: 38, lineHeight: 1.3, color: '#10213A'}}>
                <Rich text={ln} color={V.color} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
};

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

const Quiz: React.FC<PostProps> = ({data, slide = 'q', series, episode, handle}) => {
  const b = useBrand();
  const opts: string[] = data.options || [];
  const ans: number = data.answer ?? 0;
  const reveal = slide === 'a';
  return (
    <Frame series={series} episode={episode} handle={handle} footer={reveal ? 'Follow for daily DGCA prep' : 'Swipe for the answer →'}>
      <div style={{position: 'absolute', left: 64, right: 64, top: 190, bottom: 140, display: 'flex', flexDirection: 'column'}}>
        <Kicker icon={reveal ? 'check' : 'question'} text={reveal ? 'Answer' : 'Quick check'} color={reveal ? '#15803D' : b.accent} />
        <div style={{marginTop: 36, fontFamily: F.head, fontWeight: 800 as any, fontSize: data.size ?? 64, lineHeight: 1.12, letterSpacing: '-0.025em', color: '#10213A', textWrap: 'balance' as any}}>
          <Rich text={data.q} />
        </div>
        <div style={{flex: 1}} />
        <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
          {opts.map((o, i) => {
            const right = reveal && i === ans;
            const dim = reveal && i !== ans;
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 24,
                  padding: '22px 26px',
                  borderRadius: 26,
                  background: right ? alpha('#15803D', 0.1) : '#FFFFFF',
                  border: `3px solid ${right ? '#15803D' : 'rgba(16,33,58,0.08)'}`,
                  boxShadow: right ? '0 16px 40px rgba(21,128,61,0.18)' : '0 12px 30px rgba(16,33,58,0.08)',
                  opacity: dim ? 0.45 : 1,
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 18,
                    flex: '0 0 auto',
                    background: right ? '#15803D' : alpha(b.accent, 0.12),
                    color: right ? '#FFFFFF' : b.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: F.head,
                    fontWeight: 850 as any,
                    fontSize: 32,
                  }}
                >
                  {right ? <Icon name="check" size={38} color="#FFFFFF" stroke={3} /> : LETTERS[i]}
                </div>
                <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 40, color: '#10213A'}}>
                  <Rich text={o} />
                </div>
              </div>
            );
          })}
        </div>
        {reveal && data.explain ? (
          <div style={{marginTop: 28, fontFamily: F.body, fontWeight: 550 as any, fontSize: 32, lineHeight: 1.35, color: alpha('#10213A', 0.72)}}>
            <Rich text={data.explain} />
          </div>
        ) : null}
      </div>
    </Frame>
  );
};

const Sheet: React.FC<PostProps> = ({data, series, episode, handle}) => {
  const b = useBrand();
  const items: {icon?: string; t: string; sub?: string}[] = data.items || [];
  const big = items.length <= 5;
  return (
    <Frame series={series} episode={episode} handle={handle} footer="Save this cheat sheet ✓">
      <div style={{position: 'absolute', left: 64, right: 64, top: 190, bottom: 140, display: 'flex', flexDirection: 'column'}}>
        <Kicker icon="checklist" text={data.kicker ?? 'Cheat sheet'} color={b.accent} />
        <div style={{marginTop: 30, fontFamily: F.head, fontWeight: 850 as any, fontSize: data.size ?? 76, lineHeight: 1.04, letterSpacing: '-0.035em', color: '#10213A', textWrap: 'balance' as any}}>
          <Rich text={data.title} />
        </div>
        <div style={{flex: 1, minHeight: 20}} />
        <div style={{background: '#FFFFFF', borderRadius: 34, padding: '26px 30px', boxShadow: '0 24px 60px rgba(16,33,58,0.12)'}}>
          {items.map((it, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 22,
                padding: big ? '16px 6px' : '11px 6px',
                borderBottom: i < items.length - 1 ? '2px solid rgba(16,33,58,0.06)' : 'none',
              }}
            >
              <div
                style={{
                  width: big ? 68 : 58,
                  height: big ? 68 : 58,
                  borderRadius: 18,
                  flex: '0 0 auto',
                  background: i % 2 ? alpha('#1F6FB2', 0.12) : alpha(b.accent, 0.13),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={it.icon ?? 'check'} size={big ? 38 : 32} color={i % 2 ? '#1F6FB2' : b.accent} stroke={2.2} />
              </div>
              <div>
                <div style={{fontFamily: F.head, fontWeight: 750 as any, fontSize: big ? 36 : 31, lineHeight: 1.18, color: '#10213A'}}>
                  <Rich text={it.t} />
                </div>
                {it.sub ? <div style={{fontFamily: F.body, fontSize: big ? 26 : 23, color: alpha('#10213A', 0.6), marginTop: 2}}>{it.sub}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
};

export const Post: React.FC<PostProps> = (p) => (
  <BrandProvider brand={p.brand}>
    <FontGate>
      <AbsoluteFill style={{width: W, height: H}}>{p.variant === 'quiz' ? <Quiz {...p} /> : p.variant === 'sheet' ? <Sheet {...p} /> : <Tip {...p} />}</AbsoluteFill>
    </FontGate>
  </BrandProvider>
);
