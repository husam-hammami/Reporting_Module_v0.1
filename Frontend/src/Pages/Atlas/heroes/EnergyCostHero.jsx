/**
 * Energy cost per ton hero — horizontal flow: NOW → AI next-shift forecast.
 * Savings is rendered as a pill badge in the header row.
 */

export default function EnergyCostHero({ data, t }) {
  const willImprove = data.predicted_next_shift_omr_per_t < data.current_omr_per_t;
  const hasSavings = typeof data.savings_omr_8h === 'number';

  return (
    <section
      className="atlas-hero atlas-hero--cost"
      aria-label={t('atlas.cost.aria')}
    >
      <header className="atlas-hero__head">
        <div className="atlas-hero__eyebrow-row">
          <span className="atlas-hero__eyebrow">{t('atlas.cost.eyebrow')}</span>
          {hasSavings && (
            <span className={`atlas-hero__badge atlas-hero__badge--${willImprove ? 'good' : 'warn'}`}>
              <span className="atlas-num">{`-${data.savings_omr_8h}`}</span>
              <span className="atlas-hero__badge-unit">{t('atlas.unit.omr')}</span>
              <span className="atlas-hero__badge-sub">{t('atlas.cost.savingsShort')}</span>
            </span>
          )}
        </div>
        <h2 className="atlas-hero__label">{t('atlas.cost.label')}</h2>
      </header>

      <div
        className={`atlas-hero__flow atlas-hero__flow--${willImprove ? 'down' : 'up'}`}
      >
        <div className="atlas-hero__flow-block atlas-hero__flow-block--now">
          <span className="atlas-hero__flow-lbl">{t('atlas.cost.now')}</span>
          <span className="atlas-hero__flow-num atlas-num">
            {Number(data.current_omr_per_t).toFixed(2)}
          </span>
          <span className="atlas-hero__flow-unit">{t('atlas.unit.omrPerTon')}</span>
        </div>

        <div className="atlas-hero__flow-arrow" aria-hidden="true">
          <span className="atlas-hero__flow-arrow-pulse" />
        </div>

        <div className="atlas-hero__flow-block atlas-hero__flow-block--pred">
          <span className="atlas-hero__flow-lbl">{t('atlas.cost.nextShift')}</span>
          <span className="atlas-hero__flow-num atlas-num">
            {Number(data.predicted_next_shift_omr_per_t).toFixed(2)}
          </span>
          <span className="atlas-hero__flow-unit">{t('atlas.unit.omrPerTon')}</span>
        </div>
      </div>
    </section>
  );
}
