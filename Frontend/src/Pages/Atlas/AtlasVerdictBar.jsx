/**
 * AI verdict bar — single-sentence read of plant state + "Why?" CTA.
 *
 * Renders inline highlights from a token-tagged string:
 *   "tons {gold:108 t} above plan {good:6 t} watch {hi:RS-3}"
 * Tags: gold (OMR/tons accent), good (status-ok), hi (forecast/future), b (bold neutral).
 */

import { Sparkles } from 'lucide-react';

const TAG_RE = /\{(gold|good|hi|b):([^}]+)\}/g;

function renderHighlights(text) {
  const out = [];
  let last = 0;
  let match;
  let i = 0;
  while ((match = TAG_RE.exec(text)) !== null) {
    if (match.index > last) {
      out.push(text.slice(last, match.index));
    }
    const [, kind, body] = match;
    out.push(
      <span key={`m-${i++}`} className={kind}>
        {body}
      </span>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function AtlasVerdictBar({ verdict, t, onWhy }) {
  const text = verdict?.text ?? '';

  return (
    <div className="atlas-ai-bar" role="status" aria-live="polite">
      <div className="atlas-ai-bar__icon" aria-hidden="true">
        <Sparkles size={18} strokeWidth={2.4} />
      </div>
      <div className="atlas-ai-bar__text">
        <div className="atlas-ai-bar__eyebrow">{t('atlas.verdict.eyebrow')}</div>
        <div className="atlas-ai-bar__msg">{renderHighlights(text)}</div>
      </div>
      {onWhy && (
        <button
          type="button"
          className="atlas-ai-bar__cta"
          onClick={onWhy}
          aria-label={t('atlas.verdict.whyAria')}
        >
          {t('atlas.verdict.why')}
        </button>
      )}
    </div>
  );
}
