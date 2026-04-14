/**
 * StatusBarWidget — Professional multi-tag status indicators.
 * Each tag shows as a styled pill with colored indicator and status text.
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
      height: '100%',
      padding: '0 8px',
      gap: 8,
      overflow: 'hidden',
    }}>
      {showTitle && (
        <span className="rb-widget-title" style={{ fontSize: titleFontSize, flexShrink: 0 }}>{config.title}</span>
      )}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        gap: 6,
        overflow: 'hidden',
        flexWrap: 'wrap',
      }}>
        {tags.map((tag, i) => {
          const raw = tagValues?.[tag.tagName];
          const num = raw != null ? Number(raw) : null;
          const isOn = num === 1;
          const dotColor = isOn ? (tag.onColor || '#10b981') : (tag.offColor || '#6b7280');
          const statusText = isOn ? (tag.onLabel || 'ON') : (tag.offLabel || 'OFF');
          const bgColor = isOn ? `${dotColor}18` : 'var(--rb-card-bg, rgba(0,0,0,0.03))';
          const borderColor = isOn ? `${dotColor}40` : 'var(--rb-card-border, rgba(0,0,0,0.08))';

          return (
            <div key={i} style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 10px 3px 8px',
              borderRadius: 20,
              background: bgColor,
              border: `1px solid ${borderColor}`,
              flexShrink: 0,
            }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: dotColor,
                boxShadow: isOn ? `0 0 6px ${dotColor}80` : 'none',
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--rb-text, #334155)',
                whiteSpace: 'nowrap',
                letterSpacing: '0.01em',
              }}>
                {tag.label || tag.tagName}
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: 800,
                color: dotColor,
                whiteSpace: 'nowrap',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>
                {statusText}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
