/**
 * Parse 'YYYY-MM-DDTHH:mm' (datetime-local style) into a Date in **local** time.
 * Matches DateRangePicker / useTimePeriod so custom ranges are not engine-dependent.
 */
export function parseDatetimeLocal(str) {
  if (!str || typeof str !== 'string') return null;
  const [dp, tp = '00:00'] = str.split('T');
  const parts = dp.split('-').map(Number);
  if (parts.length !== 3) return null;
  const [y, mo, d] = parts;
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const [th, tmin] = String(tp).split(':').map((x) => Number(x));
  const h = Number.isFinite(th) ? th : 0;
  const min = Number.isFinite(tmin) ? tmin : 0;
  const out = new Date(y, mo - 1, d, h, min);
  if (out.getFullYear() !== y || out.getMonth() !== mo - 1 || out.getDate() !== d) return null;
  return out;
}

export function sameLocalCalendarDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function isLocalStartOfDay(d) {
  return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
}
