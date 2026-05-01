/**
 * Production hero card — today's tons + AI EOD forecast + delta vs plan.
 */

export default function ProductionHero({ data, t }) {
  const showVsPlan = typeof data.plan_tons === 'number' && data.plan_tons > 0;
  const deltaSign = data.delta_vs_plan_tons >= 0 ? '+' : '';

  return (
    <section
      className="atlas-hero atlas-hero--production"
      aria-label={t('atlas.production.aria')}
    >
      <div className="atlas-hero__eyebrow">{t('atlas.production.eyebrow')}</div>
      <div className="atlas-hero__label">{t('atlas.production.label')}</div>

      <div className="atlas-hero__now">
        <div className="atlas-hero__now-lbl">{t('atlas.production.soFar')}</div>
        <div className="atlas-hero__value atlas-hero__value--now">
          <span className="atlas-hero__num atlas-num">
            {Number(data.today_tons).toFixed(1)}
          </span>
          <span className="atlas-hero__unit">{t('atlas.unit.tons')}</span>
        </div>
      </div>

      <div className="atlas-hero__divider" />

      <div className="atlas-hero__pred-lbl">{t('atlas.production.eodForecast')}</div>
      <div className="atlas-hero__value atlas-hero__value--pred">
        <span className="atlas-hero__num atlas-num">
          {Math.round(data.predicted_eod_tons)}
        </span>
        <span className="atlas-hero__unit">{t('atlas.unit.tons')}</span>
        <span className="atlas-hero__arrow" aria-hidden="true">↑</span>
      </div>

      {showVsPlan && (
        <div className="atlas-hero__pill">
          <span className="atlas-hero__pill-lbl">
            {t('atlas.production.vsPlan').replace('{plan}', data.plan_tons)}
          </span>
          <span className="atlas-hero__pill-val atlas-num">
            {`${deltaSign}${data.delta_vs_plan_tons} ${t('atlas.unit.tons')}`}
          </span>
        </div>
      )}
    </section>
  );
}
