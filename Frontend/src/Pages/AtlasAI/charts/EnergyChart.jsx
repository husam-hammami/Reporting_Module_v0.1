import { useEffect, useRef } from 'react';

export default function EnergyChart() {
  const ref = useRef(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const W = 480, H = 130;
    const pad = { l: 30, r: 14, t: 8, b: 22 };
    const innerW = W - pad.l - pad.r;
    const innerH = H - pad.t - pad.b;

    const pts = [];
    for (let h = 0; h <= 24; h++) {
      let v = 1.55 - 0.005 * h + Math.sin(h * 0.7) * 0.04;
      if (h > 15) v -= (h - 15) * 0.012;
      pts.push([h, v]);
    }
    const xMax = 24;
    const yMin = 1.25, yMax = 1.65;
    const sx = (h) => pad.l + (h / xMax) * innerW;
    const sy = (v) => pad.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
    const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + sx(p[0]) + ' ' + sy(p[1])).join(' ');
    const area = path + ` L${sx(24)} ${pad.t + innerH} L${sx(0)} ${pad.t + innerH} Z`;

    let grid = '';
    for (const v of [1.3, 1.4, 1.5, 1.6]) {
      grid += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${sy(v)}" y2="${sy(v)}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`;
      grid += `<text x="${pad.l - 5}" y="${sy(v) + 3}" text-anchor="end" font-family="JetBrains Mono" font-size="8" fill="rgba(244,249,255,0.42)">${v.toFixed(2)}</text>`;
    }
    let xticks = '';
    for (let h = 0; h <= 24; h += 6) {
      xticks += `<text x="${sx(h)}" y="${H - 6}" text-anchor="middle" font-family="JetBrains Mono" font-size="8" fill="rgba(244,249,255,0.42)">${String(h).padStart(2, '0')}h</text>`;
    }
    const cur = pts[15];

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = `
      <defs>
        <linearGradient id="enAreaInline" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(245,158,11,0.32)"/>
          <stop offset="100%" stop-color="rgba(245,158,11,0)"/>
        </linearGradient>
      </defs>
      ${grid}${xticks}
      <path d="${area}" fill="url(#enAreaInline)"/>
      <path d="${path}" fill="none" stroke="#fbbf24" stroke-width="1.8" stroke-linecap="round"
        style="filter: drop-shadow(0 0 4px rgba(251,191,36,0.6));"/>
      <line x1="${sx(15)}" x2="${sx(15)}" y1="${pad.t}" y2="${H - pad.b}"
        stroke="rgba(251,191,36,0.4)" stroke-width="1" stroke-dasharray="2 2"/>
      <circle cx="${sx(15)}" cy="${sy(cur[1])}" r="4" fill="#0c1322" stroke="#fbbf24" stroke-width="2"/>
      <circle cx="${sx(15)}" cy="${sy(cur[1])}" r="2" fill="#fbbf24"/>
    `;
  }, []);

  return <svg ref={ref} className="energy-chart" viewBox="0 0 480 130" preserveAspectRatio="none" />;
}
