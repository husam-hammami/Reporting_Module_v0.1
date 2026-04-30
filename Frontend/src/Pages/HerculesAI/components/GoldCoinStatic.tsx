/**
 * GoldCoinStatic — SVG fallback for the Three.js coin.
 *
 * States (Plan 6 §4.3):
 *   - 'cold'    : matte grey, static (calibrating, no savings)
 *   - 'active'  : gold, slow rotation
 *   - 'celebrate' : gold, gilding pulse on first-savings transition (one-shot)
 *
 * The Three.js version is wired in via React.lazy/Suspense from BoardroomCard;
 * this static SVG is the always-shipping fallback. It already handles the
 * 'cold' state visually; once Three.js loads it takes over for active+celebrate.
 */

import type { CSSProperties } from 'react';

interface GoldCoinStaticProps {
  state?: 'cold' | 'active' | 'celebrate';
  size?: number;
  className?: string;
}

export default function GoldCoinStatic({ state = 'cold', size = 80, className }: GoldCoinStaticProps) {
  const isCold = state === 'cold';

  const styleEl: CSSProperties = {
    width: size,
    height: size,
    filter: isCold
      ? 'drop-shadow(0 4px 12px rgba(120,120,120,0.18))'
      : 'drop-shadow(0 8px 20px rgba(240,181,79,0.22))',
    animation: isCold ? 'none' : 'hai-coin-rot 18s linear infinite',
  };

  // Cold = neutral grey gradient. Active = gold gradient.
  const sheenStops = isCold
    ? [
        { offset: '0%',  color: '#d8dde2', opacity: 0.6 },
        { offset: '50%', color: '#8e95a0', opacity: 1 },
        { offset: '100%', color: '#3d4350', opacity: 1 },
      ]
    : [
        { offset: '0%',  color: '#fff8e0', opacity: 0.6 },
        { offset: '50%', color: 'var(--hai-money)', opacity: 1 },
        { offset: '100%', color: '#7a5a10', opacity: 1 },
      ];

  const stroke = isCold ? 'rgba(140,150,160,0.4)' : 'rgba(240,181,79,0.5)';

  return (
    <>
      <svg
        width={size}
        height={size}
        viewBox="0 0 80 80"
        style={styleEl}
        className={className}
        aria-hidden="true"
        role="presentation"
      >
        <defs>
          <linearGradient id={`hai-coin-sheen-${state}`} x1="0%" y1="0%" x2="0%" y2="100%">
            {sheenStops.map((s, i) => (
              <stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
            ))}
          </linearGradient>
          <radialGradient id={`hai-coin-glow-${state}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={isCold ? '#9aa3ac' : 'var(--hai-money)'} stopOpacity={isCold ? 0.10 : 0.30} />
            <stop offset="100%" stopColor={isCold ? '#9aa3ac' : 'var(--hai-money)'} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="40" cy="40" r="34" fill={`url(#hai-coin-glow-${state})`} />
        <ellipse cx="40" cy="50" rx="30" ry="6" fill={`url(#hai-coin-sheen-${state})`} stroke={stroke} />
        <ellipse cx="40" cy="40" rx="30" ry="6" fill={`url(#hai-coin-sheen-${state})`} stroke={stroke} />
        <ellipse cx="40" cy="30" rx="30" ry="6" fill={`url(#hai-coin-sheen-${state})`} stroke={stroke} />
        <text
          x="40"
          y="33"
          textAnchor="middle"
          fontFamily="Inter Tight, system-ui, sans-serif"
          fontWeight="700"
          fontSize="9"
          letterSpacing="0.08em"
          fill={isCold ? '#3a3f48' : '#3a2400'}
          opacity={isCold ? 0.7 : 1}
        >
          OMR
        </text>
      </svg>
      <style>{`
        @keyframes hai-coin-rot {
          0%   { transform: rotateY(0deg);   }
          100% { transform: rotateY(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes hai-coin-rot {
            0%, 100% { transform: rotateY(0deg); }
          }
        }
      `}</style>
    </>
  );
}
