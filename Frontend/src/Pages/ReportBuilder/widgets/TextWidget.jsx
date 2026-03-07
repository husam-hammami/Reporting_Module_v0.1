export default function TextWidget({ config }) {
  const align = config.align || 'left';
  const fontSize = config.fontSize || '14px';
  const fontWeight = config.fontWeight || '600';
  const color = config.color || '';
  const italic = config.fontStyle === 'italic';

  return (
    <div
      className="flex items-center h-full w-full"
      style={{
        justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
        padding: 'var(--rb-pad-sm, 6px)',
      }}
    >
      <span
        style={{
          fontSize,
          fontWeight,
          fontStyle: italic ? 'italic' : 'normal',
          color: color || 'var(--rb-text)',
          lineHeight: 1.3,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          letterSpacing: fontWeight >= 700 || fontWeight === 'bold' ? '-0.01em' : 'normal',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        }}
      >
        {config.content || 'Text'}
      </span>
    </div>
  );
}
