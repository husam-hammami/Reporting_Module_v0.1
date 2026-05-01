/**
 * Energy cost per ton hero — current OMR/t + AI next-shift forecast + savings.
 */

export default function EnergyCostHero({ data, t }) {
  const arrow = data.predicted_next_shift_omr_per_t < data.current_omr_per_t ? '↓' : '↑';

  return (
    <section
      className="atlas-hero atlas-hero--cost"
      aria-label={t('atlas.cost.aria')}
      style={{ padding: '22px 24px 20px' }}
    >
      <div className="atlas-hero__eyebrow">{t('atlas.cost.eyebrow')}</div>
      <div className="atlas-hero__label">{t('atlas.cost.label')}</div>

      <div className="atlas-hero__now" style={{ marginTop: '20px' }}>
        <div className="atlas-hero__now-lbl">{t('atlas.cost.rightNow')}</div>
        <div className="atlas-hero__value atlas-hero__value--now" style={{ marginTop: '8px' }}>
          <span className="atlas-hero__num atlas-num">
            {Number(data.current_omr_per_t).toFixed(2)}
          </span>
          <span className="atlas-hero__unit">{t('atlas.unit.omrPerTon')}</span>
        </div>
      </div>

      <div className="atlas-hero__divider" style={{ margin: '20px 0 18px' }} />

      <div className="atlas-hero__pred-lbl">{t('atlas.cost.nextShiftForecast')}</div>
      <div className="atlas-hero__value atlas-hero__value--pred" style={{ marginTop: '8px' }}>
        <span className="atlas-hero__num atlas-num">
          {Number(data.predicted_next_shift_omr_per_t).toFixed(2)}
        </span>
        <span className="atlas-hero__unit">{t('atlas.unit.omrPerTon')}</span>
        <span className="atlas-hero__arrow" aria-hidden="true">{arrow}</span>
      </div>

      {typeof data.savings_omr_8h === 'number' && (
        <div className="atlas-hero__pill">
          <span className="atlas-hero__pill-lbl">{t('atlas.cost.savings')}</span>
          <span className="atlas-hero__pill-val atlas-num">
            {`${data.savings_omr_8h} ${t('atlas.unit.omrPer8h')}`}
          </span>
        </div>
      )}
    </section>
  );
}
