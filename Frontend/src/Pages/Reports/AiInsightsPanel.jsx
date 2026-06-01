/**
 * AiInsightsPanel — AI summary, key highlights, and status overview.
 * Used in A4 side panel (always visible) and full-mode drawer (collapsible).
 */
import { useState, useEffect, useMemo } from 'react';
import { Sparkles, RefreshCw, ChevronRight, ChevronLeft } from 'lucide-react';
import { herculesAIApi } from '../../API/herculesAIApi';

function StatusCount({ tagValues }) {
  const counts = useMemo(() => {
    let on = 0, off = 0, total = 0;
    Object.values(tagValues || {}).forEach((v) => {
      const n = Number(v);
      if (n === 0 || n === 1) {
        total++;
        if (n === 1) on++; else off++;
      }
    });
    return { on, off, total };
  }, [tagValues]);

  if (counts.total === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 11, fontWeight: 600 }}>
      <span style={{ color: '#10b981' }}>{counts.on} ON</span>
      <span style={{ color: '#6b7280' }}>{counts.off} OFF</span>
    </div>
  );
}

function Highlights({ tagValues }) {
  const highlights = useMemo(() => {
    const entries = Object.entries(tagValues || {})
      .map(([k, v]) => ({ name: k, value: Number(v) }))
      .filter((e) => !isNaN(e.value) && e.value !== 0 && e.value !== 1);
    if (entries.length === 0) return [];
    entries.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    return entries.slice(0, 4);
  }, [tagValues]);

  if (highlights.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b' }}>Top Values</span>
      {highlights.map((h, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ color: '#94a3b8', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
            {h.name.replace(/_/g, ' ').replace(/mil b /i, '')}
          </span>
          <span style={{ color: '#e2e8f0', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {h.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AiInsightsPanel({ tagValues, style, className = '' }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await herculesAIApi.previewSummary();
      setSummary(res.data?.summary || 'No summary available');
    } catch (err) {
      setError(err.response?.data?.error || 'AI not configured');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSummary(); }, []);

  return (
    <div className={className} style={{
      display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 10px',
      fontSize: 12, color: '#cbd5e1', height: '100%', overflow: 'auto',
      ...style,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={14} style={{ color: '#22d3ee' }} />
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>
            AI Insights
          </span>
        </div>
        <button
          onClick={fetchSummary}
          disabled={loading}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 2 }}
          title="Refresh AI summary"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary */}
      <div style={{
        background: 'rgba(34,211,238,0.06)',
        borderLeft: '2px solid #22d3ee',
        borderRadius: 4,
        padding: '8px 10px',
        fontSize: 11,
        lineHeight: 1.5,
        color: '#cbd5e1',
      }}>
        {loading ? (
          <span style={{ color: '#64748b' }}>Generating summary...</span>
        ) : error ? (
          <span style={{ color: '#64748b', fontSize: 10 }}>{error}</span>
        ) : (
          <span>{summary}</span>
        )}
      </div>

      {/* Status Count */}
      <div>
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 4, display: 'block' }}>
          Equipment
        </span>
        <StatusCount tagValues={tagValues} />
      </div>

      {/* Highlights */}
      <Highlights tagValues={tagValues} />
    </div>
  );
}

/* Collapsible drawer wrapper for full-mode dashboards */
export function AiDrawer({ tagValues }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Tab button — always visible on left edge */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed', left: open ? 250 : 0, top: '50%', transform: 'translateY(-50%)',
          zIndex: 40, background: 'linear-gradient(135deg, #0f1b2d, #1a3a5c)',
          border: '1px solid rgba(34,211,238,0.2)', borderLeft: 'none',
          borderRadius: '0 8px 8px 0', padding: '12px 6px',
          cursor: 'pointer', color: '#22d3ee',
          transition: 'left 0.3s ease',
          boxShadow: '2px 0 8px rgba(0,0,0,0.2)',
        }}
        title={open ? 'Close AI panel' : 'Open AI insights'}
      >
        {open ? <ChevronLeft size={14} /> : <Sparkles size={14} />}
      </button>

      {/* Drawer panel */}
      <div style={{
        position: 'fixed', left: 0, top: 0, bottom: 0,
        width: 250, zIndex: 39,
        background: 'linear-gradient(180deg, #0a1020 0%, #0f172a 100%)',
        borderRight: '1px solid rgba(34,211,238,0.1)',
        boxShadow: open ? '4px 0 20px rgba(0,0,0,0.3)' : 'none',
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.3s ease, box-shadow 0.3s ease',
        overflow: 'hidden',
      }}>
        <AiInsightsPanel tagValues={tagValues} style={{ paddingTop: 16 }} />
      </div>
    </>
  );
}
