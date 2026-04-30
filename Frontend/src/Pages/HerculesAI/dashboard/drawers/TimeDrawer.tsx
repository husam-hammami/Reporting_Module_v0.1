/**
 * TimeDrawer — Plan 14 §5.4.
 *
 * Wraps the existing Phase 1 BriefingView + TimePeriodTabs + analyze flow
 * inside a side drawer. Triggered by the Footer's "See full time analysis →"
 * link (Footer wiring lands together with this commit).
 *
 * The whole point: Time is its own analytical surface. The legacy Time tab
 * was duplicating the verdict card on top — Plan 14 drops the duplication
 * and tucks the period analysis into a drawer so it doesn't compete with
 * the boardroom hero on the main bento.
 *
 * Drawer body composition:
 *   - TimePeriodTabs (re-used verbatim)
 *   - Analyze button + report-filter pill
 *   - BriefingView with the latest insights result
 *
 * Charts panel and the comparison-table details are deferred to commit 7's
 * BillDrilldownDrawer / report-level expansions.
 */

import { useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import DrawerFrame from './DrawerFrame';
import TimePeriodTabs from '../../../Reports/TimePeriodTabs';
import useTimePeriod from '../../../../Hooks/useTimePeriod';
import { BriefingView } from '../../BriefingView';
import { herculesAIApi } from '../../../../API/herculesAIApi';

const INSIGHTS_TABS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This Week' },
  { id: 'lastWeek', label: 'Last Week' },
  { id: 'month', label: 'This Month' },
  { id: 'shift', label: 'Shift' },
  { id: 'custom', label: 'Custom' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

const analyzeBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 18px',
  borderRadius: 10,
  border: '1px solid var(--hai-glass-border)',
  background: 'var(--hai-money)',
  color: '#3a2400',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

const errorBox: CSSProperties = {
  padding: '12px 16px',
  borderRadius: 10,
  background: 'rgba(220,38,38,0.08)',
  border: '1px solid rgba(220,38,38,0.2)',
  color: 'var(--hai-status-crit-600)',
  fontSize: 12,
};

const emptyBox: CSSProperties = {
  padding: 32,
  textAlign: 'center',
  color: 'var(--hai-text-tertiary)',
  fontSize: 13,
  lineHeight: 1.5,
};

export default function TimeDrawer({ open, onClose }: Props) {
  const { state: timePeriod, actions: tpActions, dateRange } =
    useTimePeriod({ initialTab: 'yesterday' });
  const [analyzing, setAnalyzing] = useState(false);
  const [insightsResult, setInsightsResult] = useState<any>(null);
  const [insightsError, setInsightsError] = useState<string>('');

  const runInsights = useCallback(async () => {
    if (!dateRange) return;
    setAnalyzing(true);
    setInsightsResult(null);
    setInsightsError('');
    try {
      const res = await herculesAIApi.insights({
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString(),
      });
      const data = (res as any).data || res;
      if (data?.error) setInsightsError(data.error);
      else setInsightsResult(data);
    } catch (e: any) {
      setInsightsError(e?.response?.data?.error || e?.message || 'Could not analyze period');
    } finally {
      setAnalyzing(false);
    }
  }, [dateRange]);

  return (
    <DrawerFrame
      open={open}
      onClose={onClose}
      eyebrow="Time analysis"
      title="Period insights"
      width={720}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <TimePeriodTabs
          tabs={INSIGHTS_TABS}
          activeTab={timePeriod.tab}
          onTabChange={tpActions.setTab}
          customFrom={timePeriod.customFrom}
          customTo={timePeriod.customTo}
          onCustomFrom={tpActions.setCustomFrom}
          onCustomTo={tpActions.setCustomTo}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={runInsights}
            disabled={analyzing || !dateRange}
            style={{ ...analyzeBtn, opacity: (analyzing || !dateRange) ? 0.6 : 1 }}
          >
            {analyzing
              ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              : <Sparkles size={14} />}
            <span>{analyzing ? 'Analyzing…' : 'Analyze period'}</span>
          </button>
        </div>

        {insightsError && <div style={errorBox}>{insightsError}</div>}

        {insightsResult ? (
          <BriefingView data={insightsResult} compact />
        ) : (
          !analyzing && !insightsError && (
            <div style={emptyBox}>
              Pick a period and click Analyze. Hercules will summarize what
              the reports say about that window.
            </div>
          )
        )}
      </div>
    </DrawerFrame>
  );
}
