/**
 * Text element — renders inline text that only occupies the space of the text itself.
 * No card, no background, no padding above/below.
 */
export default function TextWidget({ config }) {
  const align = config.align || 'left';
  const fontSize = config.fontSize || '14px';
  const fontWeight = config.fontWeight || '600';
  const color = config.color || 'inherit';
  const italic = config.fontStyle === 'italic';

  return (
    <div
      className="flex items-center h-full w-full"
      style={{ justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start' }}
    >
      <span
        style={{
          fontSize,
          fontWeight,
          fontStyle: italic ? 'italic' : 'normal',
          color: color || 'var(--rb-text)',
          lineHeight: 1.2,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {config.content || 'Text'}
      </span>
    </div>
  );
}
