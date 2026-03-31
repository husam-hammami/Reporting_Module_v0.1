import { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { Sparkles, Search, ChevronDown, ChevronRight, Check, X, Eye, EyeOff, Loader2, RefreshCw, AlertCircle, LayoutGrid } from 'lucide-react';
import { DarkModeContext } from '../../Context/DarkModeProvider';
import { herculesAIApi } from '../../API/herculesAIApi';
import { toast } from 'react-toastify';
import { useLanguage } from '../../Hooks/useLanguage';
import { useNavigate } from 'react-router-dom';
import '../ReportBuilder/reportBuilderTheme.css';

/* ── Theme (matches Distribution) ─────────────────────────────────────────── */
function useTheme() {
  const { mode } = useContext(DarkModeContext);
  const dark = mode === 'dark';
  return {
    dark,
    pageBg: dark ? '#0a0f1a' : '#f3f4f6',
    surface: dark ? '#111827' : '#ffffff',
    surfaceAlt: dark ? '#0a0f1a' : '#f9fafb',
    border: dark ? '#1e293b' : '#e5e7eb',
    text: dark ? '#f0f4f8' : '#111827',
    textSecondary: dark ? '#8899ab' : '#6b7280',
    textMuted: dark ? '#556677' : '#9ca3af',
    accent: dark ? '#22d3ee' : '#0369a1',
    accentHover: dark ? '#06b6d4' : '#075985',
    accentBg: dark ? 'rgba(34,211,238,0.10)' : 'rgba(3,105,161,0.08)',
    hoverBg: dark ? 'rgba(10,15,26,0.4)' : 'rgba(0,0,0,0.03)',
    inputBg: dark ? '#111827' : '#ffffff',
    btnText: dark ? '#0a0f1a' : '#ffffff',
    success: dark ? '#34d399' : '#059669',
    successBg: dark ? 'rgba(52,211,153,0.10)' : 'rgba(5,150,105,0.08)',
    warning: dark ? '#fbbf24' : '#d97706',
    warningBg: dark ? 'rgba(251,191,36,0.10)' : 'rgba(217,119,6,0.08)',
    danger: dark ? '#f87171' : '#dc2626',
  };
}

/* ── Type badge colors ────────────────────────────────────────────────────── */
const TYPE_COLORS = {
  counter:     { bg: '#dbeafe', text: '#1e40af', darkBg: '#1e3a5f', darkText: '#93c5fd' },
  rate:        { bg: '#cffafe', text: '#155e75', darkBg: '#164e63', darkText: '#67e8f9' },
  boolean:     { bg: '#fef3c7', text: '#92400e', darkBg: '#78350f', darkText: '#fcd34d' },
  percentage:  { bg: '#d1fae5', text: '#065f46', darkBg: '#064e3b', darkText: '#6ee7b7' },
  analog:      { bg: '#ede9fe', text: '#5b21b6', darkBg: '#4c1d95', darkText: '#c4b5fd' },
  setpoint:    { bg: '#f3f4f6', text: '#374151', darkBg: '#374151', darkText: '#d1d5db' },
  id_selector: { bg: '#e0e7ff', text: '#3730a3', darkBg: '#312e81', darkText: '#a5b4fc' },
  unknown:     { bg: '#f3f4f6', text: '#6b7280', darkBg: '#374151', darkText: '#9ca3af' },
};

const TAG_TYPES = ['counter', 'rate', 'boolean', 'percentage', 'analog', 'setpoint', 'id_selector', 'unknown'];

const DATA_STATUS_ICONS = { active: '●●●', sparse: '●●○', empty: '●○○', deleted: '✕', unknown: '○○○' };

/* ── Main component ───────────────────────────────────────────────────────── */
export default function HerculesAISetup() {
  const t = useTheme();
  const { t: tr, isRTL } = useLanguage();
  const navigate = useNavigate();

  // State
  const [status, setStatus] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);

  // UI state
  const [filter, setFilter] = useState('all');
  const [lineFilter, setLineFilter] = useState('');
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedTag, setExpandedTag] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [editMode, setEditMode] = useState(false);

  // API key
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  // Provider
  const [localUrl, setLocalUrl] = useState('');
  const [connectionResult, setConnectionResult] = useState(null);
  const [testingConnection, setTestingConnection] = useState(false);

  // Preview
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState(null);

  // ── Load data ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [statusRes, profilesRes, configRes] = await Promise.all([
        herculesAIApi.getStatus(),
        herculesAIApi.getProfiles().catch(() => ({ data: { profiles: {} } })),
        herculesAIApi.getConfig(),
      ]);
      setStatus(statusRes.data);
      setProfiles(profilesRes.data.profiles || {});
      setConfig(configRes.data);

      // Auto-expand pending groups
      const groups = profilesRes.data.profiles || {};
      const expanded = {};
      Object.entries(groups).forEach(([line, tags]) => {
        const hasPending = tags.some(tag => !tag.is_reviewed && tag.is_tracked);
        expanded[line] = hasPending;
      });
      setExpandedGroups(expanded);
    } catch (err) {
      console.error('Failed to load Hercules AI data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived state ──────────────────────────────────────────────────────
  const allProfiles = useMemo(() => {
    return Object.values(profiles).flat();
  }, [profiles]);

  const counts = useMemo(() => {
    const all = allProfiles;
    return {
      total: all.length,
      confirmed: all.filter(p => p.is_reviewed && p.is_tracked).length,
      pending: all.filter(p => !p.is_reviewed && p.is_tracked).length,
      excluded: all.filter(p => !p.is_tracked).length,
    };
  }, [allProfiles]);

  const filteredProfiles = useMemo(() => {
    const result = {};
    Object.entries(profiles).forEach(([line, tags]) => {
      if (lineFilter && line !== lineFilter) return;
      const filtered = tags.filter(tag => {
        if (filter === 'pending' && !(tag.is_reviewed === false && tag.is_tracked)) return false;
        if (filter === 'confirmed' && !(tag.is_reviewed && tag.is_tracked)) return false;
        if (filter === 'excluded' && tag.is_tracked) return false;
        if (search) {
          const s = search.toLowerCase();
          if (!tag.tag_name.toLowerCase().includes(s) &&
              !tag.label.toLowerCase().includes(s) &&
              !(tr(`herculesAI.type.${tag.tag_type}`) || '').toLowerCase().includes(s))
            return false;
        }
        return true;
      });
      if (filtered.length > 0) result[line] = filtered;
    });
    return result;
  }, [profiles, filter, lineFilter, search, tr]);

  const lineNames = useMemo(() => Object.keys(profiles), [profiles]);

  const isSetupComplete = config.setup_completed === true;
  const hasScanData = status?.total > 0;
  const isFirstVisit = !hasScanData && !isSetupComplete;

  // ── Actions ────────────────────────────────────────────────────────────
  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await herculesAIApi.scan();
      if (res.data.status === 'empty') {
        toast.info(tr('herculesAI.empty.title'));
      } else {
        toast.success(`${tr('herculesAI.scanButton')}: ${res.data.tags_found} ${tr('herculesAI.status.tags')}`);
      }
      await loadData();
    } catch (err) {
      if (err.response?.status === 409) {
        toast.warning(tr('herculesAI.scanning'));
      } else {
        toast.error(err.response?.data?.error || 'Scan failed');
      }
    } finally {
      setScanning(false);
    }
  };

  const handleUpdateProfile = async (id, updates) => {
    try {
      await herculesAIApi.updateProfile(id, updates);
      await loadData();
    } catch (err) {
      toast.error('Failed to update');
    }
  };

  const handleBulkAction = async (action) => {
    if (selected.size === 0) return;
    const updates = Array.from(selected).map(id => {
      if (action === 'confirm') return { id, is_tracked: true, is_reviewed: true };
      if (action === 'exclude') return { id, is_tracked: false, is_reviewed: true };
      return { id };
    });
    try {
      await herculesAIApi.bulkUpdate(updates);
      setSelected(new Set());
      await loadData();
      toast.success(tr('herculesAI.saved'));
    } catch (err) {
      toast.error('Bulk update failed');
    }
  };

  const handleBulkSetType = async (type) => {
    if (selected.size === 0) return;
    const updates = Array.from(selected).map(id => ({ id, tag_type: type }));
    try {
      await herculesAIApi.bulkUpdate(updates);
      setSelected(new Set());
      await loadData();
      toast.success(tr('herculesAI.saved'));
    } catch (err) {
      toast.error('Bulk update failed');
    }
  };

  const handleSaveConfig = async (updates) => {
    setSaving(true);
    try {
      const res = await herculesAIApi.updateConfig(updates);
      setConfig(res.data);
      toast.success(tr('herculesAI.saved'));
    } catch (err) {
      toast.error('Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    await handleSaveConfig({ llm_api_key: apiKey.trim() });
    setApiKey('');
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      const res = await herculesAIApi.testConnection();
      setConnectionResult(res.data);
    } catch (err) {
      setConnectionResult({ ok: false, message: err.response?.data?.error || 'Connection test failed' });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveLocalUrl = async () => {
    if (!localUrl.trim()) return;
    await handleSaveConfig({ local_server_url: localUrl.trim() });
    setLocalUrl('');
  };

  const handleMarkComplete = async () => {
    await handleSaveConfig({ setup_completed: true });
    await loadData();
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    setPreviewResult(null);
    try {
      const res = await herculesAIApi.previewSummary();
      setPreviewResult({ summary: res.data.summary, report: res.data.report_name, tags: res.data.tags_used });
    } catch (err) {
      setPreviewResult({ error: err.response?.data?.error || 'Preview failed' });
    } finally {
      setPreviewLoading(false);
    }
  };

  // ── Type badge ─────────────────────────────────────────────────────────
  const TypeBadge = ({ type, small }) => {
    const c = TYPE_COLORS[type] || TYPE_COLORS.unknown;
    return (
      <span
        className={`inline-flex items-center rounded-full font-medium ${small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'}`}
        style={{ background: t.dark ? c.darkBg : c.bg, color: t.dark ? c.darkText : c.text }}
      >
        {tr(`herculesAI.type.${type}`) || type}
      </span>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: t.pageBg }}>
        <Loader2 size={28} className="animate-spin" style={{ color: t.accent }} />
      </div>
    );
  }

  // ── State A: First Visit ───────────────────────────────────────────────
  if (isFirstVisit && !scanning) {
    return (
      <div className="h-full overflow-auto p-6" style={{ background: t.pageBg }}>
        <div className="max-w-2xl mx-auto text-center py-20">
          <Sparkles size={48} style={{ color: t.accent }} className="mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2" style={{ color: t.text }}>{tr('herculesAI.title')}</h1>
          <p className="text-sm mb-8 max-w-md mx-auto" style={{ color: t.textSecondary }}>
            {tr('herculesAI.subtitle')}
          </p>
          <button
            onClick={handleScan}
            className="px-6 py-3 rounded-lg font-semibold text-sm transition-all"
            style={{ background: t.accent, color: t.btnText }}
          >
            {tr('herculesAI.scanMyReports')}
          </button>
          <p className="text-xs mt-4" style={{ color: t.textMuted }}>
            {tr('herculesAI.firstVisit.explanation')}
          </p>
        </div>
      </div>
    );
  }

  // ── Empty state (scan found zero tags) ─────────────────────────────────
  if (status?.total === 0 && !scanning) {
    return (
      <div className="h-full overflow-auto p-6" style={{ background: t.pageBg }}>
        <div className="max-w-2xl mx-auto text-center py-20">
          <AlertCircle size={48} style={{ color: t.warning }} className="mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2" style={{ color: t.text }}>{tr('herculesAI.empty.title')}</h2>
          <p className="text-sm mb-6" style={{ color: t.textSecondary }}>
            {tr('herculesAI.empty.description')}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigate('/report-builder')}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: t.accent, color: t.btnText }}
            >
              {tr('herculesAI.empty.goToBuilder')}
            </button>
            <button
              onClick={handleScan}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ border: `1px solid ${t.border}`, color: t.text }}
            >
              {tr('herculesAI.scanButton')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── State C: Setup Complete (summary view) ─────────────────────────────
  if (isSetupComplete && !editMode) {
    return (
      <div className="h-full overflow-auto p-6" style={{ background: t.pageBg }}>
        <div className="max-w-3xl mx-auto">
          {/* Summary card */}
          <div className="rounded-xl p-6 mb-6" style={{ background: t.surface, border: `1px solid ${t.border}` }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Check size={20} style={{ color: t.success }} />
                <h2 className="text-lg font-bold" style={{ color: t.text }}>{tr('herculesAI.complete.title')}</h2>
              </div>
              <button
                onClick={() => setEditMode(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ border: `1px solid ${t.border}`, color: t.textSecondary }}
              >
                {tr('herculesAI.editSetup')}
              </button>
            </div>

            <p className="text-sm mb-3" style={{ color: t.textSecondary }}>
              {tr('herculesAI.complete.tracking', { count: status?.total - (status?.excluded || 0) })}
            </p>

            {status?.lines?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {status.lines.map(l => (
                  <span key={l.name} className="text-xs px-2 py-1 rounded-md"
                    style={{ background: t.accentBg, color: t.accent }}>
                    {l.name} — {l.count} {tr('herculesAI.status.tags')}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={handlePreview}
                disabled={previewLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
                style={{ background: t.accent, color: t.btnText, opacity: previewLoading ? 0.6 : 1 }}
              >
                {previewLoading && <Loader2 size={14} className="animate-spin" />}
                {tr('herculesAI.previewButton')}
              </button>
              <span className="text-xs" style={{ color: t.textMuted }}>
                {tr('herculesAI.complete.enableHint')}
              </span>
            </div>
          </div>

          {/* Preview result */}
          {previewResult && (
            <div className="rounded-xl p-5 mb-6"
              style={{
                background: previewResult.error ? t.warningBg : t.successBg,
                border: `1px solid ${previewResult.error ? t.warning : t.success}`,
              }}>
              {previewResult.error ? (
                <p className="text-sm" style={{ color: t.danger }}>{previewResult.error}</p>
              ) : (
                <>
                  <div className="text-xs font-semibold mb-2" style={{ color: t.success }}>
                    {tr('herculesAI.preview')} — {previewResult.report}
                  </div>
                  <p className="text-sm" style={{ color: t.text }}>{previewResult.summary}</p>
                </>
              )}
            </div>
          )}

          {/* Unseen reports notice */}
          {status?.unseen_reports_count > 0 && (
            <div className="rounded-lg p-3 mb-4 flex items-center justify-between"
              style={{ background: t.warningBg, border: `1px solid ${t.warning}` }}>
              <span className="text-xs" style={{ color: t.warning }}>
                {tr('herculesAI.newReports', { count: status.unseen_reports_count })}
              </span>
              <button onClick={handleScan} className="text-xs font-medium px-3 py-1 rounded"
                style={{ background: t.warning, color: '#fff' }}>
                {tr('herculesAI.scanButton')}
              </button>
            </div>
          )}

          {/* Read-only tag list */}
          <TagList
            profiles={filteredProfiles} theme={t} tr={tr}
            expandedGroups={expandedGroups} setExpandedGroups={setExpandedGroups}
            expandedTag={null} setExpandedTag={() => {}}
            selected={new Set()} setSelected={() => {}}
            onUpdate={() => {}} readOnly TypeBadge={TypeBadge}
            lineNames={lineNames} isRTL={isRTL}
          />
        </div>
      </div>
    );
  }

  // ── State B: Scan Done, Reviewing (+ edit mode after setup complete) ───
  return (
    <div className="h-full overflow-auto p-6" style={{ background: t.pageBg }}>
      <div className="max-w-5xl mx-auto">
        {/* Zone 1 — Top bar */}
        <div className="rounded-xl p-5 mb-4" style={{ background: t.surface, border: `1px solid ${t.border}` }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={20} style={{ color: t.accent }} />
              <h1 className="text-lg font-bold" style={{ color: t.text }}>{tr('herculesAI.title')}</h1>
            </div>
            <div className="flex items-center gap-2">
              {status?.last_scan_at && (
                <span className="text-[11px]" style={{ color: t.textMuted }}>
                  {tr('herculesAI.lastScanned')}: {new Date(status.last_scan_at).toLocaleString()}
                </span>
              )}
              <button
                onClick={handleScan}
                disabled={scanning}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ background: t.accent, color: t.btnText, opacity: scanning ? 0.6 : 1 }}
              >
                {scanning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {scanning ? tr('herculesAI.scanning') : tr('herculesAI.scanButton')}
              </button>
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-3 text-xs" style={{ color: t.textSecondary }}>
            <span>{counts.total} {tr('herculesAI.status.tags')}</span>
            <span>·</span>
            <span style={{ color: t.success }}>{counts.confirmed} {tr('herculesAI.status.confirmed')}</span>
            <span>·</span>
            <span style={{ color: t.warning }}>{counts.pending} {tr('herculesAI.status.pending')}</span>
            <span>·</span>
            <span style={{ color: t.textMuted }}>{counts.excluded} {tr('herculesAI.status.excluded')}</span>
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: t.border }}>
            <div className="flex h-full">
              <div style={{ width: `${counts.total ? (counts.confirmed / counts.total) * 100 : 0}%`, background: t.success }} />
              <div style={{ width: `${counts.total ? (counts.pending / counts.total) * 100 : 0}%`, background: t.warning }} />
            </div>
          </div>

          {/* Unseen reports */}
          {status?.unseen_reports_count > 0 && (
            <div className="mt-3 text-xs flex items-center gap-2" style={{ color: t.warning }}>
              <AlertCircle size={13} />
              {tr('herculesAI.newReports', { count: status.unseen_reports_count })}
            </div>
          )}
        </div>

        {/* Zone 2 — Filter / Action bar */}
        <div className="rounded-xl p-4 mb-4" style={{ background: t.surface, border: `1px solid ${t.border}` }}>
          <div className="flex flex-wrap items-center gap-2">
            {/* Filter pills */}
            {['all', 'pending', 'confirmed', 'excluded'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                style={{
                  background: filter === f ? t.accent : 'transparent',
                  color: filter === f ? t.btnText : t.textSecondary,
                  border: filter === f ? 'none' : `1px solid ${t.border}`,
                }}
              >
                {tr(`herculesAI.filter.${f}`)}
                {f !== 'all' && ` (${counts[f]})`}
              </button>
            ))}

            {/* Line filter */}
            <select
              value={lineFilter}
              onChange={e => setLineFilter(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-xs"
              style={{ background: t.inputBg, color: t.text, border: `1px solid ${t.border}` }}
            >
              <option value="">{tr('herculesAI.allLines')}</option>
              {lineNames.map(l => <option key={l} value={l}>{l}</option>)}
            </select>

            {/* Search */}
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute top-2 left-2.5" style={{ color: t.textMuted }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={tr('herculesAI.search')}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs"
                style={{ background: t.inputBg, color: t.text, border: `1px solid ${t.border}` }}
              />
            </div>
          </div>

          {/* Bulk actions */}
          {selected.size > 0 && (
            <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${t.border}` }}>
              <span className="text-xs" style={{ color: t.textSecondary }}>
                {selected.size} {tr('herculesAI.selected')}
              </span>
              <button onClick={() => handleBulkAction('confirm')}
                className="px-3 py-1 rounded text-xs font-medium" style={{ background: t.success, color: '#fff' }}>
                {tr('herculesAI.bulk.confirm')}
              </button>
              <button onClick={() => handleBulkAction('exclude')}
                className="px-3 py-1 rounded text-xs font-medium" style={{ background: t.danger, color: '#fff' }}>
                {tr('herculesAI.bulk.exclude')}
              </button>
              <BulkTypeMenu tr={tr} theme={t} onSelect={handleBulkSetType} TypeBadge={TypeBadge} />
            </div>
          )}
        </div>

        {/* Zone 3 — Tag list */}
        <TagList
          profiles={filteredProfiles} theme={t} tr={tr}
          expandedGroups={expandedGroups} setExpandedGroups={setExpandedGroups}
          expandedTag={expandedTag} setExpandedTag={setExpandedTag}
          selected={selected} setSelected={setSelected}
          onUpdate={handleUpdateProfile} TypeBadge={TypeBadge}
          lineNames={lineNames} isRTL={isRTL}
        />

        {/* Bottom — AI Provider Config + Complete */}
        <div className="rounded-xl p-5 mt-4" style={{ background: t.surface, border: `1px solid ${t.border}` }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: t.text }}>{tr('herculesAI.provider.title')}</h3>

          {/* Provider radio */}
          <div className="flex gap-2 mb-4">
            {[
              { value: 'cloud', label: tr('herculesAI.provider.cloud'), desc: tr('herculesAI.provider.cloudDesc') },
              { value: 'local', label: tr('herculesAI.provider.local'), desc: tr('herculesAI.provider.localDesc') },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => handleSaveConfig({ ai_provider: opt.value })}
                className="flex-1 p-3 rounded-lg text-left transition-all"
                style={{
                  background: config.ai_provider === opt.value ? t.accentBg : t.surfaceAlt,
                  border: `1.5px solid ${config.ai_provider === opt.value ? t.accent : t.border}`,
                }}
              >
                <div className="text-xs font-semibold" style={{ color: config.ai_provider === opt.value ? t.accent : t.text }}>
                  {opt.label}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: t.textMuted }}>{opt.desc}</div>
              </button>
            ))}
          </div>

          {/* Cloud settings */}
          {config.ai_provider !== 'local' && (
            <div className="space-y-3 mb-4">
              {/* API Key */}
              <div>
                <label className="block text-[10px] font-medium mb-1" style={{ color: t.textMuted }}>
                  {tr('herculesAI.apiKey')}
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder={config.llm_api_key_set ? `${tr('herculesAI.apiKeyHint')}: ${config.llm_api_key_hint || ''}` : tr('herculesAI.apiKeyPlaceholder')}
                      className="w-full px-3 py-2 rounded-lg text-xs pr-8"
                      style={{ background: t.inputBg, color: t.text, border: `1px solid ${t.border}` }}
                    />
                    <button onClick={() => setShowApiKey(!showApiKey)} className="absolute right-2 top-2" style={{ color: t.textMuted }}>
                      {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <button onClick={handleSaveApiKey} disabled={!apiKey.trim() || saving}
                    className="px-3 py-2 rounded-lg text-xs font-medium"
                    style={{ background: t.accent, color: t.btnText, opacity: !apiKey.trim() ? 0.5 : 1 }}>
                    Save
                  </button>
                </div>
              </div>

              {/* Model selector */}
              <div>
                <label className="block text-[10px] font-medium mb-1" style={{ color: t.textMuted }}>
                  {tr('herculesAI.provider.model')}
                </label>
                <div className="flex gap-1.5">
                  {[
                    { id: 'claude-opus-4-6', label: 'Opus', cost: '$109/yr' },
                    { id: 'claude-sonnet-4-6', label: 'Sonnet', cost: '$22/yr' },
                    { id: 'claude-haiku-4-5-20251001', label: 'Haiku', cost: '$7/yr' },
                  ].map(m => (
                    <button key={m.id} onClick={() => handleSaveConfig({ llm_model: m.id })}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: config.llm_model === m.id ? t.accent : t.inputBg,
                        color: config.llm_model === m.id ? t.btnText : t.textSecondary,
                        border: `1px solid ${config.llm_model === m.id ? t.accent : t.border}`,
                      }}>
                      {m.label} <span className="opacity-60 text-[9px]">{m.cost}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Local settings */}
          {config.ai_provider === 'local' && (
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-[10px] font-medium mb-1" style={{ color: t.textMuted }}>
                  {tr('herculesAI.provider.serverUrl')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={localUrl || ''}
                    onChange={e => setLocalUrl(e.target.value)}
                    placeholder={config.local_server_url || 'http://localhost:1234/v1'}
                    className="flex-1 px-3 py-2 rounded-lg text-xs"
                    style={{ background: t.inputBg, color: t.text, border: `1px solid ${t.border}` }}
                  />
                  <button onClick={handleSaveLocalUrl} disabled={!localUrl.trim() || saving}
                    className="px-3 py-2 rounded-lg text-xs font-medium"
                    style={{ background: t.accent, color: t.btnText, opacity: !localUrl.trim() ? 0.5 : 1 }}>
                    Save
                  </button>
                </div>
                {config.local_server_url && (
                  <div className="text-[10px] mt-1" style={{ color: t.textMuted }}>
                    {tr('herculesAI.provider.currentUrl')}: {config.local_server_url}
                  </div>
                )}
              </div>
              <div className="text-[10px] p-2 rounded-lg" style={{ background: t.surfaceAlt, color: t.textMuted }}>
                {tr('herculesAI.provider.localHint')}
              </div>
            </div>
          )}

          {/* Test Connection */}
          <div className="flex items-center gap-3 mb-4">
            <button onClick={handleTestConnection} disabled={testingConnection}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
              style={{ border: `1px solid ${t.border}`, color: t.text, opacity: testingConnection ? 0.6 : 1 }}>
              {testingConnection ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {tr('herculesAI.provider.testConnection')}
            </button>
            {connectionResult && (
              <span className="text-xs" style={{ color: connectionResult.ok ? t.success : t.danger }}>
                {connectionResult.ok ? '✓' : '✕'} {connectionResult.message}
                {connectionResult.model && ` (${connectionResult.model})`}
              </span>
            )}
          </div>

          {/* Mark complete / Edit setup */}
          <div className="flex items-center justify-between pt-3" style={{ borderTop: `1px solid ${t.border}` }}>
            {isSetupComplete ? (
              <button onClick={() => { setEditMode(false); }}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ border: `1px solid ${t.border}`, color: t.textSecondary }}>
                {tr('herculesAI.complete.title')} ✓
              </button>
            ) : (
              <button onClick={handleMarkComplete} disabled={saving || counts.total === 0}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: t.accent, color: t.btnText, opacity: counts.total === 0 ? 0.5 : 1 }}>
                {tr('herculesAI.markComplete')}
              </button>
            )}
            <span className="text-xs" style={{ color: t.textMuted }}>
              {tr('herculesAI.firstVisit.description')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ── Tag List (grouped by line) ───────────────────────────────────────────── */
function TagList({ profiles, theme: t, tr, expandedGroups, setExpandedGroups,
  expandedTag, setExpandedTag, selected, setSelected, onUpdate, readOnly, TypeBadge, lineNames, isRTL }) {

  const toggleGroup = (line) => {
    setExpandedGroups(prev => ({ ...prev, [line]: !prev[line] }));
  };

  return (
    <div className="space-y-2">
      {Object.entries(profiles).map(([line, tags]) => (
        <div key={line} className="rounded-xl overflow-hidden" style={{ background: t.surface, border: `1px solid ${t.border}` }}>
          {/* Group header */}
          <button
            onClick={() => toggleGroup(line)}
            className="w-full flex items-center justify-between p-3 text-left"
            style={{ background: t.surfaceAlt }}
          >
            <div className="flex items-center gap-2">
              {expandedGroups[line] ? <ChevronDown size={14} style={{ color: t.textMuted }} /> : <ChevronRight size={14} style={{ color: t.textMuted }} />}
              <span className="text-sm font-semibold" style={{ color: t.text }}>{line || 'Other'}</span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: t.accentBg, color: t.accent }}>
                {tags.length}
              </span>
            </div>
          </button>

          {/* Tag rows */}
          {expandedGroups[line] && (
            <div className="divide-y" style={{ borderColor: t.border }}>
              {tags.map(tag => (
                <TagRow
                  key={tag.id} tag={tag} theme={t} tr={tr}
                  isExpanded={expandedTag === tag.id}
                  onToggleExpand={() => setExpandedTag(expandedTag === tag.id ? null : tag.id)}
                  isSelected={selected.has(tag.id)}
                  onToggleSelect={() => {
                    const next = new Set(selected);
                    next.has(tag.id) ? next.delete(tag.id) : next.add(tag.id);
                    setSelected(next);
                  }}
                  onUpdate={onUpdate}
                  readOnly={readOnly}
                  TypeBadge={TypeBadge}
                  lineNames={lineNames}
                  isRTL={isRTL}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


/* ── Tag Row ──────────────────────────────────────────────────────────────── */
function TagRow({ tag, theme: t, tr, isExpanded, onToggleExpand, isSelected, onToggleSelect, onUpdate, readOnly, TypeBadge, lineNames, isRTL }) {
  const [edits, setEdits] = useState({});

  const handleSave = () => {
    onUpdate(tag.id, edits);
    setEdits({});
    onToggleExpand();
  };

  const handleConfirm = () => {
    onUpdate(tag.id, { ...edits, is_tracked: true, is_reviewed: true });
    setEdits({});
    onToggleExpand();
  };

  const handleExclude = () => {
    onUpdate(tag.id, { is_tracked: false, is_reviewed: true });
    setEdits({});
    onToggleExpand();
  };

  const dataStatus = DATA_STATUS_ICONS[tag.data_status] || DATA_STATUS_ICONS.unknown;

  return (
    <div>
      {/* Compact row */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-all"
        style={{ background: isExpanded ? t.accentBg : 'transparent' }}
        onClick={readOnly ? undefined : onToggleExpand}
      >
        {!readOnly && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            onClick={e => e.stopPropagation()}
            className="rounded"
          />
        )}
        <span className="text-xs font-mono flex-shrink-0 w-48 truncate" style={{ color: t.textMuted }}>{tag.tag_name}</span>
        <span className="text-xs flex-1 truncate" style={{ color: t.text }}>{tag.label || '—'}</span>
        <TypeBadge type={tag.tag_type} small />
        <span className="text-[10px] w-8 text-center" title={tag.data_status}>{dataStatus}</span>
        {tag.is_reviewed && tag.is_tracked && <Check size={13} style={{ color: t.success }} />}
        {!tag.is_tracked && <X size={13} style={{ color: t.textMuted }} />}
        <span className="text-[10px] w-10 text-right" style={{ color: t.textMuted }}>
          {tag.evidence?.unit || ''}
        </span>
      </div>

      {/* Expanded detail */}
      {isExpanded && !readOnly && (
        <div className="px-4 pb-4 pt-2 space-y-3" style={{ background: t.surfaceAlt }}>
          <div className="text-xs" style={{ color: t.textMuted }}>
            {tr('herculesAI.expand.classified')}: <TypeBadge type={tag.tag_type} small />
            {tag.evidence?.is_counter !== undefined && (
              <span className={`${isRTL ? 'mr-2' : 'ml-2'}`}>
                {tr('herculesAI.expand.reason')}: {tag.evidence.is_counter ? 'counter flag' : ''} {tag.evidence.unit ? `unit=${tag.evidence.unit}` : ''} {tag.evidence.data_type || ''}
              </span>
            )}
          </div>

          {/* Type pills */}
          <div>
            <label className="block text-[10px] font-medium mb-1" style={{ color: t.textMuted }}>
              {tr('herculesAI.field.label')} Type
            </label>
            <div className="flex flex-wrap gap-1">
              {TAG_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => setEdits(prev => ({ ...prev, tag_type: type }))}
                  className="px-2 py-1 rounded-md text-[10px] font-medium transition-all"
                  style={{
                    background: (edits.tag_type || tag.tag_type) === type ? t.accent : t.inputBg,
                    color: (edits.tag_type || tag.tag_type) === type ? t.btnText : t.textSecondary,
                    border: `1px solid ${(edits.tag_type || tag.tag_type) === type ? t.accent : t.border}`,
                  }}
                >
                  {tr(`herculesAI.type.${type}`) || type}
                </button>
              ))}
            </div>
          </div>

          {/* Editable fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium mb-1" style={{ color: t.textMuted }}>{tr('herculesAI.field.label')}</label>
              <input
                type="text"
                defaultValue={tag.label}
                onChange={e => setEdits(prev => ({ ...prev, label: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-lg text-xs"
                style={{ background: t.inputBg, color: t.text, border: `1px solid ${t.border}` }}
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium mb-1" style={{ color: t.textMuted }}>{tr('herculesAI.field.line')}</label>
              <input
                type="text"
                list="line-options"
                defaultValue={tag.line_name}
                onChange={e => setEdits(prev => ({ ...prev, line_name: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-lg text-xs"
                style={{ background: t.inputBg, color: t.text, border: `1px solid ${t.border}` }}
              />
              <datalist id="line-options">
                {lineNames.map(l => <option key={l} value={l} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-[10px] font-medium mb-1" style={{ color: t.textMuted }}>{tr('herculesAI.field.category')}</label>
              <input
                type="text"
                defaultValue={tag.category}
                onChange={e => setEdits(prev => ({ ...prev, category: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-lg text-xs"
                style={{ background: t.inputBg, color: t.text, border: `1px solid ${t.border}` }}
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium mb-1" style={{ color: t.textMuted }}>{tr('herculesAI.field.notes')}</label>
              <input
                type="text"
                defaultValue={tag.user_notes}
                onChange={e => setEdits(prev => ({ ...prev, user_notes: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-lg text-xs"
                style={{ background: t.inputBg, color: t.text, border: `1px solid ${t.border}` }}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button onClick={handleConfirm}
              className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: t.success, color: '#fff' }}>
              {tr('herculesAI.confirm')}
            </button>
            <button onClick={handleExclude}
              className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: t.danger, color: '#fff' }}>
              {tr('herculesAI.exclude')}
            </button>
            <button onClick={() => { setEdits({}); onToggleExpand(); }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ border: `1px solid ${t.border}`, color: t.textSecondary }}>
              {tr('herculesAI.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


/* ── Bulk Type Menu ───────────────────────────────────────────────────────── */
function BulkTypeMenu({ tr, theme: t, onSelect, TypeBadge }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-3 py-1 rounded text-xs font-medium flex items-center gap-1"
        style={{ border: `1px solid ${t.border}`, color: t.textSecondary }}
      >
        {tr('herculesAI.bulk.setType')} <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 rounded-lg shadow-lg py-1 z-50 min-w-[160px]"
          style={{ background: t.surface, border: `1px solid ${t.border}` }}>
          {TAG_TYPES.map(type => (
            <button
              key={type}
              onClick={() => { onSelect(type); setOpen(false); }}
              className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2"
              style={{ color: t.text }}
            >
              <TypeBadge type={type} small />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
