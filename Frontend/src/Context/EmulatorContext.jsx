/**
 * Client-side PLC tag emulator — fully DB-driven.
 *
 * Fetches all active tags from /api/tags and auto-generates simulation
 * profiles from each tag's unit / data_type / decimal_places.
 * Re-fetches whenever a 'tagsUpdated' window event fires (after tag create/edit/delete).
 *
 * Broadcasts simulated values via React context on a configurable interval.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';

const EmulatorContext = createContext();

export const useEmulator = () => {
  const ctx = useContext(EmulatorContext);
  if (!ctx) throw new Error('useEmulator must be used within EmulatorProvider');
  return ctx;
};

/* ── Unit / data-type simulation defaults ─────────────────────── */
const UNIT_DEFAULTS = {
  '°C':    { base: 40,   amplitude: 5 },
  '°F':    { base: 104,  amplitude: 9 },
  'bar':   { base: 4,    amplitude: 0.5 },
  'psi':   { base: 58,   amplitude: 7 },
  '%':     { base: 50,   amplitude: 10 },
  'RPM':   { base: 1450, amplitude: 20 },
  'mm/s':  { base: 2,    amplitude: 0.3 },
  'kW':    { base: 100,  amplitude: 15 },
  'kWh':   { base: 500,  amplitude: 50 },
  'kWh/t': { base: 3,    amplitude: 0.3 },
  't/h':   { base: 10,   amplitude: 3 },
  'm³/h':  { base: 12,   amplitude: 2 },
  'kg':    { base: 250,  amplitude: 20 },
  't':     { base: 400,  amplitude: 40 },
  'L':     { base: 450,  amplitude: 35 },
  'h':     { base: 1200, amplitude: 0 },
  'min':   { base: 8,    amplitude: 1.5 },
  'A':     { base: 100,  amplitude: 30 },
  'V':     { base: 400,  amplitude: 10 },
};
const DTYPE_DEFAULTS = {
  REAL: { base: 50,    amplitude: 10 },
  INT:  { base: 50,    amplitude: 10 },
  DINT: { base: 10000, amplitude: 1000 },
  BOOL: { base: 1,     amplitude: 0 },
};

/* Simple deterministic hash so each tag gets a stable period/phase */
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const ID_LIKE_MIN = 21;
const ID_LIKE_MAX = 61;
const ID_LIKE_HOLD_MS = 4000;

function isIdLikeTag(tagName) {
  if (!tagName || typeof tagName !== 'string') return false;
  const lower = tagName.toLowerCase();
  return lower.includes('bin_id') || lower.includes('prd_code') || lower.endsWith('_id');
}

/** Build a simulation profile from tag metadata (unit, data_type, decimal_places). */
function buildProfileFromTag(tag) {
  const unit = (tag.unit || '').trim();
  const dtype = (tag.data_type || 'REAL').toUpperCase();
  const d = UNIT_DEFAULTS[unit] || DTYPE_DEFAULTS[dtype] || { base: 50, amplitude: 10 };
  return {
    base: d.base,
    amplitude: d.amplitude,
    period: 180 + (simpleHash(tag.tag_name) % 120), // 180–300 s, deterministic per tag
    unit,
    decimals: tag.decimal_places ?? 2,
    isIdLike: isIdLikeTag(tag.tag_name),
  };
}

/**
 * Dense SCADA-style signal simulation (5 samples/sec = 200ms tick).
 *
 * At 200ms intervals, sinusoidal layers produce smooth continuous curves.
 * The random walk uses TINY steps so each tick barely moves — no staircases.
 * Multiple overlapping sine frequencies create the "busy" look of real signals.
 */
const _walkState = {};
function simulate(profile, t) {
  if (profile.amplitude === 0) return profile.base;
  const amp = profile.amplitude;
  const p = profile.period;
  const TAU = 2 * Math.PI;

  // Random walk — small per-tick drift
  const key = `${profile.base}_${p}`;
  if (_walkState[key] === undefined) _walkState[key] = 0;
  _walkState[key] += (Math.random() - 0.5) * amp * 0.04 - _walkState[key] * 0.01;
  _walkState[key] = Math.max(-amp, Math.min(amp, _walkState[key]));

  // === OSCILLATION LAYERS — tuned for readability over a 5-minute window ===
  // Medium-speed waves dominate so the trend is clear when compressed horizontally.
  // Fast ripples are subtle — just enough "texture" without creating illegible zigzags.
  const a = amp * 0.50 * Math.sin(TAU * t / (11 + (p % 7)));   // ~11-18s — main wave
  const b = amp * 0.35 * Math.sin(TAU * t / (19 + (p % 11)));  // ~19-30s — second wave
  const c = amp * 0.25 * Math.sin(TAU * t / (31 + (p % 9)));   // ~31-40s — slow swell
  const d = amp * 0.10 * Math.sin(TAU * t / (5  + (p % 3)));   // ~5-8s   — light ripple
  const e = amp * 0.06 * Math.sin(TAU * t / (3  + (p % 2)));   // ~3-5s   — micro texture

  // Slow background drift — gives gentle "trend" over 5+ minutes
  const slow = amp * 0.10 * Math.sin(TAU * t / (p * 1.5));

  // Micro noise — very subtle
  const noise = amp * 0.02 * (Math.random() - 0.5);

  const value = profile.base + _walkState[key] + a + b + c + d + e + slow + noise;
  return Number(value.toFixed(profile.decimals));
}

/* ── Provider ─────────────────────────────────────────────────── */

const STORAGE_KEY = 'hercules_emulator_enabled';
const INTERVAL_KEY = 'hercules_emulator_interval';

export const EmulatorProvider = ({ children }) => {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return true; }
  });
  const [interval, setIntervalMs] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(INTERVAL_KEY));
      // Default 200ms for dense SCADA-style charting; ignore old slow values
      return (stored && stored <= 500) ? stored : 200;
    } catch { return 200; }
  });
  const [tagValues, setTagValues] = useState({});
  const [tick, setTick] = useState(0);
  const timerRef = useRef(null);
  const startTime = useRef(Date.now() - 30_000);  // offset so t starts ~30s — avoids sin(0)=0 glitch on chart
  const profilesRef = useRef({}); // { tagName: profile }
  const idTagCacheRef = useRef({}); // { tagName: { value, until } } — random ID 21–61, refresh every N s

  // Persist settings
  useEffect(() => { localStorage.setItem(STORAGE_KEY, String(enabled)); }, [enabled]);
  useEffect(() => { localStorage.setItem(INTERVAL_KEY, String(interval)); }, [interval]);

  // ── Fetch tags from API and build profiles ──
  const loadProfiles = useCallback(async () => {
    try {
      const res = await axios.get('/api/tags', { params: { is_active: 'true' }, timeout: 4000 });
      const tags = res.data?.tags || res.data || [];
      if (!Array.isArray(tags) || tags.length === 0) return;
      const profiles = {};
      for (const tag of tags) {
        if (!tag.tag_name) continue;
        profiles[tag.tag_name] = buildProfileFromTag(tag);
      }
      profilesRef.current = profiles;
    } catch {
      // Silently fail — emulator works with whatever profiles it has
    }
  }, []);

  // Load profiles on mount
  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  // Re-load profiles when tags change (tagsUpdated event from TagManager)
  useEffect(() => {
    const handler = () => loadProfiles();
    window.addEventListener('tagsUpdated', handler);
    return () => window.removeEventListener('tagsUpdated', handler);
  }, [loadProfiles]);

  // Generate values on tick
  const generateValues = useCallback(() => {
    const profiles = profilesRef.current;
    if (!profiles || Object.keys(profiles).length === 0) return;
    const t = (Date.now() - startTime.current) / 1000;
    const now = Date.now();
    const idCache = idTagCacheRef.current;
    const values = {};
    for (const [tagName, profile] of Object.entries(profiles)) {
      if (profile.isIdLike) {
        let entry = idCache[tagName];
        if (!entry || now >= entry.until) {
          const value = ID_LIKE_MIN + Math.floor(Math.random() * (ID_LIKE_MAX - ID_LIKE_MIN + 1));
          idCache[tagName] = { value, until: now + ID_LIKE_HOLD_MS };
          entry = idCache[tagName];
        }
        values[tagName] = entry.value;
      } else {
        values[tagName] = simulate(profile, t);
      }
    }
    // Derived: keep SiloN_Tons in sync with SiloN_Level * capacity
    for (let i = 1; i <= 8; i++) {
      const level = values[`Silo${i}_Level`];
      const cap = values[`Silo${i}_Capacity`] ?? 500;
      if (level != null) values[`Silo${i}_Tons`] = Number(((level / 100) * cap).toFixed(1));
    }
    // Formulas
    if (values.Flour_Extraction != null && values.Bran_Extraction != null) {
      values.MillingLossFormula = Number((100 - values.Flour_Extraction - values.Bran_Extraction).toFixed(2));
    }
    if (values.Flow_Rate_1 != null) {
      values.FlowRate_Avg = values.Flow_Rate_1;
    }
    setTagValues(values);
    setTick((prev) => prev + 1);
  }, []);

  // Timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (enabled) {
      generateValues(); // immediate first tick
      timerRef.current = setInterval(generateValues, interval);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [enabled, interval, generateValues]);

  const toggle = useCallback(() => setEnabled((prev) => !prev), []);

  return (
    <EmulatorContext.Provider value={{ enabled, toggle, setEnabled, interval, setIntervalMs, tagValues, tick }}>
      {children}
    </EmulatorContext.Provider>
  );
};
