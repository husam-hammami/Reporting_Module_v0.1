/**
 * StatusBarWidget — Compact horizontal multi-tag status indicators.
 * Replaces multiple individual StatusWidgets with one configurable bar.
 */

import { TITLE_FONT_SIZES } from './widgetDefaults';

export default function StatusBarWidget({ config, tagValues }) {
  const tags = config.tags || [];
  const showTitle = config.showTitle !== false && config.title;
  const titleFontSize = TITLE_FONT_SIZES[config.titleFontSize] || TITLE_FONT_SIZES.sm;

  if (tags.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span style={{ fontSize: 10, color: 'var(--rb-text-muted)' }}>Add status tags in properties</span>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: showTitle ? 'flex-start' : 'center',
      height: '100%',
      padding: '0 12px',
      gap: showTitle ? 12 : 0,
    }}>
      {showTitle && (
        <p className="rb-widget-title" style={{ fontSize: titleFontSize, margin: 0, flexShrink: 0 }}>{config.title}</p>
      )}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        flex: 1,
      }}>
        {tags.map((tag, i) => {
          const raw = tagValues?.[tag.tagName];
          const num = raw != null ? Number(raw) : null;
          const isOn = num === 1;
          const dotColor = isOn ? (tag.onColor || '#10b981') : (tag.offColor || '#6b7280');
          const statusText = isOn ? (tag.onLabel || 'ON') : (tag.offLabel || 'OFF');

          return (
            <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: dotColor,
                boxShadow: isOn ? `0 0 4px ${dotColor}` : 'none',
              }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--rb-text-muted)' }}>
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
