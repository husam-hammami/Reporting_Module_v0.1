import { useEffect, useRef } from 'react';

export default function ForecastChart() {
  const ref = useRef(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const W = 480, H = 220;
    const pad = { l: 30, r: 14, t: 14, b: 26 };
    const innerW = W - pad.l - pad.r;
    const innerH = H - pad.t - pad.b;

    const actualPts = [];
    for (let h = 0; h <= 15; h++) {
      const v = (108 / 24) * h * (1 + Math.sin(h * 0.6) * 0.04);
      actualPts.push([h, v]);
    }
    const lastActual = actualPts[actualPts.length - 1];
    const projPts = [lastActual.slice()];
    for (let h = 16; h <= 24; h++) {
      const v = (108 / 24) * h;
      projPts.push([h, v]);
    }
    const upperPts = projPts.map(([h, v]) => [h, Math.min(v + (h - 15) * 0.4, 110)]);
    const lowerPts = projPts.map(([h, v]) => [h, Math.max(v - (h - 15) * 0.4, 0)]);

    const xMax = 24;
    const yMax = 115;
    const sx = (h) => pad.l + (h / xMax) * innerW;
    const sy = (v) => pad.t + innerH - (v / yMax) * innerH;
    const toPath = (pts) => pts.map((p, i) => (i === 0 ? 'M' : 'L') + sx(p[0]) + ' ' + sy(p[1])).join(' ');

    const bandPath = toPath(upperPts) + ' ' + lowerPts.slice().reverse().map((p) => 'L' + sx(p[0]) + ' ' + sy(p[1])).join(' ') + ' Z';

    let grid = '';
    for (let v = 0; v <= 100; v += 25) {
      grid += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${sy(v)}" y2="${sy(v)}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`;
      grid += `<text x="${pad.l - 6}" y="${sy(v) + 3}" text-anchor="end" font-family="JetBrains Mono" font-size="8.5" fill="rgba(244,249,255,0.42)">${v}t</text>`;
    }
    let xticks = '';
    for (let h = 0; h <= 24; h += 6) {
      const label = String(h).padStart(2, '0') + ':00';
      xticks += `<text x="${sx(h)}" y="${H - 8}" text-anchor="middle" font-family="JetBrains Mono" font-size="8.5" fill="rgba(244,249,255,0.42)">${label}</text>`;
    }
    const targetY = sy(108);
    const nowX = sx(15);
    const nowY = sy(lastActual[1]);

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = `
      <defs>
        <linearGradient id="fcAreaInline" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(34,211,238,0.32)"/>
          <stop offset="100%" stop-color="rgba(34,211,238,0)"/>
        </linearGradient>
        <linearGradient id="fcBandInline" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(52,211,153,0.28)"/>
          <stop offset="100%" stop-color="rgba(52,211,153,0.06)"/>
        </linearGradient>
      </defs>
      ${grid}
      ${xticks}
      <line x1="${pad.l}" x2="${W - pad.r}" y1="${targetY}" y2="${targetY}"
        stroke="rgba(52,211,153,0.5)" stroke-width="1" stroke-dasharray="3 3"/>
      <text x="${W - pad.r - 4}" y="${targetY - 4}" text-anchor="end"
        font-family="JetBrains Mono" font-size="8.5" fill="#34d399">TARGET 108t</text>
      <path d="${bandPath}" fill="url(#fcBandInline)"/>
      <path d="${toPath(actualPts)} L${sx(15)} ${sy(0)} L${sx(0)} ${sy(0)} Z" fill="url(#fcAreaInline)"/>
      <path d="${toPath(actualPts)}" fill="none" stroke="#7df9ff" stroke-width="2" stroke-linecap="round"
        style="filter: drop-shadow(0 0 4px rgba(125,249,255,0.7));"/>
      <path d="${toPath(projPts)}" fill="none" stroke="#34d399" stroke-width="1.8"
        stroke-dasharray="5 4" stroke-linecap="round"
        style="filter: drop-shadow(0 0 3px rgba(52,211,153,0.6));"/>
      <line x1="${nowX}" x2="${nowX}" y1="${pad.t}" y2="${H - pad.b}"
        stroke="rgba(125,249,255,0.5)" stroke-width="1" stroke-dasharray="2 2"/>
      <circle cx="${nowX}" cy="${nowY}" r="5" fill="#0c1322" stroke="#7df9ff" stroke-width="2"/>
      <circle cx="${nowX}" cy="${nowY}" r="2.5" fill="#7df9ff"/>
      <text x="${nowX}" y="${pad.t + 10}" text-anchor="middle"
        font-family="JetBrains Mono" font-size="8.5" fill="#7df9ff" font-weight="600">NOW · 68.4t</text>
      <circle cx="${sx(24)}" cy="${sy(108)}" r="4" fill="#34d399"
        style="filter: drop-shadow(0 0 6px #34d399);"/>
    `;
  }, []);

  return <svg ref={ref} className="forecast-chart" viewBox="0 0 480 220" preserveAspectRatio="none" />;
}
