import { useEffect, useRef } from 'react';

export default function AnomalyChart() {
  const ref = useRef(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const W = 320, H = 80;
    const pad = { l: 4, r: 4, t: 4, b: 4 };
    const days = 30;
    const eventDays = [3, 7, 11, 13, 16, 19, 21, 23, 25, 26, 27, 28, 29];
    const types = ['amber', 'orange', 'amber', 'amber', 'orange', 'amber', 'orange', 'amber', 'orange', 'amber', 'amber', 'amber', 'orange'];
    const colors = { amber: '#f59e0b', orange: '#f97316' };
    const colW = (W - pad.l - pad.r) / days;
    const baseY = H - pad.b;

    let bars = '';
    for (let d = 0; d < days; d++) {
      const idx = eventDays.indexOf(d);
      const has = idx >= 0;
      const type = has ? types[idx] : null;
      const h = has ? (28 + ((d * 7919) % 36)) : 5;
      const x = pad.l + d * colW + colW * 0.18;
      const w = colW * 0.64;
      const y = baseY - h;
      const fill = has ? colors[type] : 'rgba(255,255,255,0.06)';
      const glow = has ? `style="filter: drop-shadow(0 0 4px ${colors[type]});"` : '';
      bars += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="${fill}" ${glow}/>`;
    }
    bars += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${baseY + 0.5}" y2="${baseY + 0.5}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = bars;
  }, []);

  return <svg ref={ref} className="anom-chart" viewBox="0 0 320 80" preserveAspectRatio="none" />;
}
