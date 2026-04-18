/**
 * BriefingView — composes the 6-band Plant Status briefing per Plan 1 §4.
 *
 *   ① STATUS BAR   plant • period • freshness • generated
 *   ② HERO ROW     StatusHero + ProductionTargetRing + EnergyCostDeltaCard
 *   ③ ATTENTION    0–3 AttentionCards (hides when empty)
 *   ④ ASSET GRID   one AssetPanel per physical asset
 *   ⑤ TIMELINE     last 24 h of shutdowns / orders / alarms
 *   ⑥ FOOTER       tags analysed · model · schema version
 *
 * Compact mode (used by the Reports side rail) renders only the essentials:
 * StatusHero (small) + first 2 attention items + headline-only asset panels.
 */

import './tokens.css';

import { useMemo } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  AssetPanel,
  AttentionCard,
  DensityProvider,
  MetricCard,
  ProductionTargetRing,
  StatusHero,
  TimelineStrip,
  type HaiDensity,
} from './components';
import {
  parseInsightsResponse,
  type AttentionItem,
  type InsightsResponse,
  type MetricPayload,
} from './schemas';

/* ────────────────────────────────────────────────────────────────────────── */

export interface BriefingDrillRef {
  report_id?: number;
  tag_name?: string;
  from: string;
  to: string;
}

export interface BriefingViewProps {
  data: InsightsResponse;
  charts?: { production?: any; equipment?: any; rates?: any } | null;
  onDrill?: (ref: BriefingDrillRef) => void;
  /** When true, renders the side-panel variant (reduced content). */
  compact?: boolean;
  density?: HaiDensity;
  className?: string;
}

/* ── helpers ───────────────────────────────────────────────────────────── */

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function freshnessTone(mins: number): 'ok' | 'warn' | 'crit' {
  if (mins < 15) return 'ok';
  if (mins <= 60) return 'warn';
  return 'crit';
}

function freshnessLabel(mins: number): string {
  if (mins < 1) return 'fresh';
  if (mins < 60) return `${Math.round(mins)} min ago`;
  const hrs = mins / 60;
  if (hrs < 24) return `${hrs.toFixed(1)} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

/**
 * Find the top-tier metric to show in the third hero-row cell.
 * In the absence of a real tariff/cost stream (Plan 2), fall back to the
 * single most interesting metric from the first asset — throughput or SEC,
 * whichever has a delta.
 */
function pickHeadlineMetric(data: InsightsResponse): MetricPayload | null {
  for (const asset of data.assets) {
    const candidate = asset.headline_metrics[0] ?? asset.full_metrics[0];
    if (candidate) return candidate;
  }
  return null;
}

/* ── band components ───────────────────────────────────────────────────── */

function StatusBar({
  plantName,
  period,
  generatedAt,
  dataAgeMinutes,
}: {
  plantName: string;
  period: InsightsResponse['period'];
  generatedAt: string;
  dataAgeMinutes: number;
}) {
  const tone = freshnessTone(dataAgeMinutes);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--hai-space-4)',
        padding: '0 var(--hai-space-2)',
        minHeight: 24,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--hai-space-3)',
          minWidth: 0,
        }}
      >
        <span className="hai-text-label text-hai-tertiary">{plantName}</span>
        {period?.label ? (
          <>
            <span className="hai-text-caption text-hai-disabled" aria-hidden="true">
              ·
            </span>
            <span className="hai-text-label text-hai-tertiary">{period.label}</span>
          </>
        ) : null}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--hai-space-3)',
        }}
      >
        <span className="hai-text-caption text-hai-tertiary hai-num">
          {formatTime(generatedAt)}
        </span>
        <span
          className="hai-text-caption rounded-hai-sm"
          style={{
            backgroundColor: `var(--hai-status-${tone}-100)`,
            color: `var(--hai-status-${tone}-600)`,
            padding: '2px var(--hai-space-2)',
          }}
        >
          {freshnessLabel(dataAgeMinutes)}
        </span>
      </div>
    </div>
  );
}

function HeroRow({
  data,
  onDrill,
}: {
  data: InsightsResponse;
  onDrill?: (ref: BriefingDrillRef) => void;
}) {
  const ring = data.production_ring;
  const topMetric = pickHeadlineMetric(data);
  const cells = 1 + (ring ? 1 : 0) + (topMetric ? 1 : 0);

  const kpiData = useMemo(() => {
    const eff = (data as any).kpi?.efficiency;
    const eqOn = data.equipment_strip?.filter((e: any) => e.status === 'ok' || e.status === 'warn').length ?? 0;
    return {
      production_tons: eff?.production_tons ?? null,
      energy_kwh: eff?.energy_kwh ?? null,
      energy_cost_omr: eff?.energy_cost_omr ?? null,
      equipmentOnCount: eqOn,
      equipmentTotal: data.equipment_strip?.length ?? 0,
      attentionCount: data.attention_items?.length ?? 0,
    };
  }, [data]);

  return (
    <div
      style={{
        display: 'grid',
        gap: 'var(--hai-space-4)',
        gridTemplateColumns:
          cells === 3
            ? 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)'
            : cells === 2
            ? 'minmax(0, 2fr) minmax(0, 1fr)'
            : 'minmax(0, 1fr)',
      }}
    >
      <StatusHero
        level={data.status_hero.level}
        verdict={data.status_hero.verdict}
        period={data.period}
        generatedAt={data.generated_at}
        dataAgeMinutes={data.status_hero.data_age_minutes}
        kpiData={kpiData}
      />

      {ring ? (
        <div
          style={{
            backgroundColor: 'var(--hai-surface-100)',
            border: '1px solid var(--hai-surface-border)',
            borderRadius: 'var(--hai-radius-xl)',
            boxShadow: 'var(--hai-elev-1)',
            padding: 'var(--hai-space-4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ProductionTargetRing
            produced={ring.produced}
            target={ring.target}
            unit={ring.unit}
            timeElapsedFraction={ring.time_elapsed_fraction}
          />
        </div>
      ) : null}

      {topMetric ? (
        <div
          style={{
            backgroundColor: 'var(--hai-surface-100)',
            border: '1px solid var(--hai-surface-border)',
            borderRadius: 'var(--hai-radius-xl)',
            boxShadow: 'var(--hai-elev-1)',
            padding: 'var(--hai-space-4)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <MetricCard
            label={topMetric.label}
            value={topMetric.value}
            unit={topMetric.unit}
            delta={topMetric.delta ?? undefined}
            sparkline={topMetric.sparkline}
            status={topMetric.status}
            precision={topMetric.precision}
            size="md"
            onClick={
              onDrill && topMetric.tag_name
                ? () =>
                    onDrill({
                      tag_name: topMetric.tag_name,
                      from: data.period.from,
                      to: data.period.to,
                    })
                : undefined
            }
            className="w-full"
          />
        </div>
      ) : null}
    </div>
  );
}

function Footer({ data }: { data: InsightsResponse }) {
  const tagsAnalyzed = data.tags_analyzed ?? 0;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 'var(--hai-space-2)',
        minHeight: 32,
        paddingTop: 'var(--hai-space-3)',
      }}
      className="hai-text-caption text-hai-tertiary"
    >
      <span className="hai-num">{tagsAnalyzed} tags analysed</span>
      <span aria-hidden="true">·</span>
      <span>{data.meta.model}</span>
      <span aria-hidden="true">·</span>
      <span>schema v{data.schema_version}</span>
    </div>
  );
}

/* ── main component ────────────────────────────────────────────────────── */

export function BriefingView(props: BriefingViewProps) {
  const { data: raw, charts, onDrill, compact = false, density, className } = props;

  // Runtime-validate defensively. Backend returns the clean shape, but this is
  // cheap and guards the UI from shape drift.
  const data = useMemo(() => parseInsightsResponse(raw), [raw]);

  const attentionAssets = useMemo(() => {
    const set = new Set<string>();
    data.attention_items.forEach((item: AttentionItem) => {
      if (item.asset) set.add(item.asset.trim().toLowerCase());
    });
    return set;
  }, [data.attention_items]);

  /* ── Compact (side rail) variant ─────────────────────────────────────── */
  if (compact) {
    const topAssets = data.assets.slice(0, 2);
    const topAttention = data.attention_items.slice(0, 2);
    return (
      <DensityProvider density={density ?? 'compact'}>
        <div
          className={className}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--hai-space-3)',
            padding: 'var(--hai-space-3)',
          }}
        >
          <StatusHero
            level={data.status_hero.level}
            verdict={data.status_hero.verdict}
            period={data.period}
            generatedAt={data.generated_at}
            dataAgeMinutes={data.status_hero.data_age_minutes}
          />

          {topAttention.length > 0 ? (
            <AttentionCard
              items={topAttention}
              onDrill={
                onDrill
                  ? (item) =>
                      onDrill({
                        report_id: item.drill.report_id,
                        tag_name: item.drill.tag_name,
                        from: item.drill.from,
                        to: item.drill.to,
                      })
                  : undefined
              }
              dismissible={false}
            />
          ) : null}

          {topAssets.map((asset) => (
            <AssetPanel
              key={asset.name}
              data={{ ...asset, full_metrics: asset.headline_metrics }}
              autoExpand={false}
            />
          ))}
        </div>
      </DensityProvider>
    );
  }

  /* ── Full briefing ───────────────────────────────────────────────────── */
  return (
    <DensityProvider density={density ?? 'compact'}>
      <div
        className={className}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--hai-space-5)',
          width: '100%',
        }}
      >
        {/* ① STATUS BAR */}
        <StatusBar
          plantName="Hercules"
          period={data.period}
          generatedAt={data.generated_at}
          dataAgeMinutes={data.status_hero.data_age_minutes}
        />

        {/* ② HERO ROW */}
        <HeroRow data={data} onDrill={onDrill} />

        {/* ③ ATTENTION */}
        {data.attention_items.length > 0 ? (
          <AttentionCard
            items={data.attention_items}
            onDrill={
              onDrill
                ? (item) =>
                    onDrill({
                      report_id: item.drill.report_id,
                      tag_name: item.drill.tag_name,
                      from: item.drill.from,
                      to: item.drill.to,
                    })
                : undefined
            }
          />
        ) : null}

        {/* ③½ CHARTS — visual proof alongside text */}
        {charts && (charts.production || charts.equipment || charts.rates) && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 'var(--hai-space-4)',
          }}>
            {charts.production && (
              <div style={{
                background: 'var(--hai-surface-100)',
                border: '1px solid var(--hai-surface-border)',
                borderRadius: 'var(--hai-radius-lg)',
                padding: 'var(--hai-space-3) var(--hai-space-4)',
              }}>
                <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--hai-text-tertiary)', marginBottom: 'var(--hai-space-2)' }}>
                  Production Output
                </div>
                <Bar data={{
                  labels: charts.production.labels,
                  datasets: [
                    { label: 'Current', data: charts.production.current, backgroundColor: 'var(--hai-data-1, #0369a1)', borderRadius: 3, barThickness: 14 },
                    ...(charts.production.previous?.some((v: number) => v > 0)
                      ? [{ label: 'Previous', data: charts.production.previous, backgroundColor: 'var(--hai-text-disabled, #94a3b8)', borderRadius: 3, barThickness: 14 }]
                      : []),
                  ],
                }} options={{
                  responsive: true, maintainAspectRatio: true, aspectRatio: 2.2,
                  plugins: { legend: { position: 'top' as const, align: 'end' as const, labels: { color: 'var(--hai-text-tertiary)', font: { size: 9 }, boxWidth: 8, padding: 6 } } },
                  scales: {
                    x: { ticks: { color: 'var(--hai-text-tertiary)', font: { size: 8 }, maxRotation: 35 }, grid: { display: false } },
                    y: { ticks: { color: 'var(--hai-text-tertiary)', font: { size: 8 }, callback: (v: any) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v }, grid: { color: 'rgba(128,128,128,0.1)' } },
                  },
                }} />
              </div>
            )}

            {charts.equipment && (() => {
              const onCount = charts.equipment.states.filter(Boolean).length;
              const offCount = charts.equipment.states.length - onCount;
              return (
                <div style={{
                  background: 'var(--hai-surface-100)',
                  border: '1px solid var(--hai-surface-border)',
                  borderRadius: 'var(--hai-radius-lg)',
                  padding: 'var(--hai-space-3) var(--hai-space-4)',
                  display: 'flex', alignItems: 'center', gap: 'var(--hai-space-4)',
                }}>
                  <div style={{ width: 80, height: 80, position: 'relative', flexShrink: 0 }}>
                    <Doughnut data={{
                      labels: ['Running', 'Stopped'],
                      datasets: [{ data: [onCount, offCount], backgroundColor: ['#059669', '#dc2626'], borderWidth: 0, cutout: '70%' }],
                    }} options={{ plugins: { legend: { display: false }, tooltip: { enabled: false } }, responsive: true, maintainAspectRatio: true }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--hai-text-primary)' }}>{onCount}/{charts.equipment.states.length}</span>
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--hai-text-tertiary)', marginBottom: 'var(--hai-space-1)' }}>Equipment</div>
                    {charts.equipment.labels.map((label: string, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.5625rem', padding: '1px 0' }}>
                        <span style={{ color: 'var(--hai-text-secondary)' }}>{label}</span>
                        <span style={{ fontWeight: 700, color: charts.equipment.states[i] ? '#059669' : '#dc2626' }}>
                          {charts.equipment.states[i] ? 'ON' : 'OFF'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {charts.rates && (
              <div style={{
                background: 'var(--hai-surface-100)',
                border: '1px solid var(--hai-surface-border)',
                borderRadius: 'var(--hai-radius-lg)',
                padding: 'var(--hai-space-3) var(--hai-space-4)',
              }}>
                <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--hai-text-tertiary)', marginBottom: 'var(--hai-space-2)' }}>
                  Flow Rates
                </div>
                <Bar data={{
                  labels: charts.rates.labels,
                  datasets: [
                    { label: 'Current', data: charts.rates.current, backgroundColor: 'var(--hai-data-2, #d97706)', borderRadius: 3, barThickness: 14 },
                    ...(charts.rates.previous?.some((v: number) => v > 0)
                      ? [{ label: 'Previous', data: charts.rates.previous, backgroundColor: 'var(--hai-text-disabled, #94a3b8)', borderRadius: 3, barThickness: 14 }]
                      : []),
                  ],
                }} options={{
                  responsive: true, maintainAspectRatio: true, aspectRatio: 2.2,
                  plugins: { legend: { position: 'top' as const, align: 'end' as const, labels: { color: 'var(--hai-text-tertiary)', font: { size: 9 }, boxWidth: 8, padding: 6 } } },
                  scales: {
                    x: { ticks: { color: 'var(--hai-text-tertiary)', font: { size: 8 }, maxRotation: 35 }, grid: { display: false } },
                    y: { ticks: { color: 'var(--hai-text-tertiary)', font: { size: 8 } }, grid: { color: 'rgba(128,128,128,0.1)' } },
                  },
                }} />
              </div>
            )}
          </div>
        )}

        {/* ④ ASSET GRID */}
        {data.assets.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gap: 'var(--hai-space-4)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
            }}
          >
            {data.assets.map((asset) => {
              const isAttention = attentionAssets.has(asset.name.trim().toLowerCase());
              return (
                <AssetPanel
                  key={asset.name}
                  data={asset}
                  autoExpand={isAttention}
                  onSelectReport={
                    onDrill
                      ? (reportId: number) =>
                          onDrill({
                            report_id: reportId,
                            from: data.period.from,
                            to: data.period.to,
                          })
                      : undefined
                  }
                />
              );
            })}
          </div>
        ) : null}

        {/* ⑤ TIMELINE — completely hidden until real event data exists */}

        {/* ⑥ FOOTER */}
        <Footer data={data} />
      </div>
    </DensityProvider>
  );
}

export default BriefingView;
