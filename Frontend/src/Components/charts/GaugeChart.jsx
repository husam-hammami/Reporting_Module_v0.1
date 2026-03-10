import React from 'react';

/**
 * GaugeChart - A lightweight SVG radial gauge for dashboards.
 * Props:
 *   value  – percentage 0-100
 *   label  – text below the gauge (optional)
 *   color  – 'green' | 'blue' | 'orange' (default 'blue')
 *   size   – diameter in px (default 80)
 */
const COLOR_MAP = {
  green: { stroke: '#10b981', bg: '#d1fae5', darkBg: '#064e3b' },
  blue: { stroke: '#0ea5e9', bg: '#e0f2fe', darkBg: '#0c4a6e' },
  orange: { stroke: '#f59e0b', bg: '#fef3c7', darkBg: '#78350f' },
};

export default function GaugeChart({ value = 0, label, color = 'blue', size = 80 }) {
  const clamped = Math.max(0, Math.min(100, value));
  const palette = COLOR_MAP[color] || COLOR_MAP.blue;

  const cx = size / 2;
  const cy = size / 2;
  const r = (size - 10) / 2;
  const circumference = 2 * Math.PI * r;
  const arcLength = (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          className="stroke-gray-200 dark:stroke-gray-700"
          strokeWidth={6}
        />
        {/* Value arc */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={palette.stroke}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          className="transition-all duration-500"
        />
        {/* Percentage text */}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-gray-900 dark:fill-gray-100"
          fontSize={size * 0.2}
          fontWeight="bold"
        >
          {Math.round(clamped)}%
        </text>
      </svg>
      {label && (
        <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center truncate max-w-[100px]">
          {label}
        </span>
      )}
    </div>
  );
}
