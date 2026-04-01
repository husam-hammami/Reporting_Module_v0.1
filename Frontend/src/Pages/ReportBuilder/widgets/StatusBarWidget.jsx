/**
 * StatusBarWidget — Compact horizontal multi-tag status indicators.
 * Replaces multiple individual StatusWidgets with one configurable bar.
 *
 * Config:
 *   tags[]   — { tagName, label, onLabel, offLabel, onColor, offColor }
 *   layout   — 'horizontal' (default)
 *   showTitle — show header title
 */

import { TITLE_FONT_SIZES } from './widgetDefaults';

export default function StatusBarWidget({ config, tagValues }) {
  const tags = config.tags || [];
  const showTitle = config.showTitle !== false && config.title;
  const titleFontSize = TITLE_FONT_SIZES[config.titleFontSize] || TITLE_FONT_SIZES.sm;

  if (tags.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '4px 8px' }}>
        <span style={{ fontSize: 11, color: 'var(--rb-text-muted)' }}>Add status tags in properties</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '3px 8px', justifyContent: 'center', gap: 2 }}>
      {showTitle && (
        <p className="rb-widget-title" style={{ fontSize: titleFontSize, margin: 0 }}>{config.title}</p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {tags.map((tag, i) => {
          const raw = tagValues?.[tag.tagName];
          const num = raw != null ? Number(raw) : null;
          const isOn = num === 1;
          const dotColor = isOn ? (tag.onColor || '#10b981') : (tag.offColor || '#6b7280');
          const statusText = isOn ? (tag.onLabel || 'ON') : (tag.offLabel || 'OFF');

          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: dotColor,
                boxShadow: isOn ? `0 0 5px ${dotColor}` : 'none',
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--rb-text-muted)', letterSpacing: '0.02em' }}>
                {tag.label || tag.tagName}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: dotColor }}>
                {statusText}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
