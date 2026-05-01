/**
 * Production hero — horizontal flow: NOW → AI EOD forecast.
 * Delta vs plan is rendered as a pill badge in the header row.
 */

export default function ProductionHero({ data, t }) {
  const showVsPlan = typeof data.plan_tons === 'number' && data.plan_tons > 0;
  const deltaPositive = data.delta_vs_plan_tons >= 0;
  const deltaSign = deltaPositive ? '+' : '';

  return (
    <section
      className="atlas-hero atlas-hero--production"
      aria-label={t('atlas.production.aria')}
    >
      <header className="atlas-hero__head">
        <div className="atlas-hero__eyebrow-row">
          <span className="atlas-hero__eyebrow">{t('atlas.production.eyebrow')}</span>
          {showVsPlan && (
            <span
              className={`atlas-hero__badge atlas-hero__badge--${deltaPositive ? 'good' : 'warn'}`}
              title={t('atlas.production.vsPlan').replace('{plan}', data.plan_tons)}
            >
              <span className="atlas-num">{`${deltaSign}${data.delta_vs_plan_tons}`}</span>
              <span className="atlas-hero__badge-unit">{t('atlas.unit.tons')}</span>
              <span className="atlas-hero__badge-sub">{t('atlas.production.vsPlanShort')}</span>
            </span>
          )}
        </div>
        <h2 className="atlas-hero__label">{t('atlas.production.label')}</h2>
      </header>

      <div className="atlas-hero__flow">
        <div className="atlas-hero__flow-block atlas-hero__flow-block--now">
          <span className="atlas-hero__flow-lbl">{t('atlas.production.now')}</span>
          <span className="atlas-hero__flow-num atlas-num">
            {Number(data.today_tons).toFixed(1)}
          </span>
          <span className="atlas-hero__flow-unit">{t('atlas.unit.tons')}</span>
        </div>

        <div className="atlas-hero__flow-arrow" aria-hidden="true">
          <span className="atlas-hero__flow-arrow-pulse" />
        </div>

        <div className="atlas-hero__flow-block atlas-hero__flow-block--pred">
          <span className="atlas-hero__flow-lbl">{t('atlas.production.eod')}</span>
          <span className="atlas-hero__flow-num atlas-num">
            {Math.round(data.predicted_eod_tons)}
          </span>
          <span className="atlas-hero__flow-unit">{t('atlas.unit.tons')}</span>
        </div>
      </div>
    </section>
  );
}
