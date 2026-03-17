import { ImagePlus } from 'lucide-react';
import { useRef, useCallback } from 'react';

export default function ImageWidget({ config, onUpdateConfig }) {
  const inputRef = useRef(null);
  const src = config.src || '';
  const fit = config.objectFit || 'contain';
  const alt = config.alt || 'Report image';
  const radius = config.borderRadius || '0';

  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      onUpdateConfig?.({ src: e.target.result });
    };
    reader.readAsDataURL(file);
  }, [onUpdateConfig]);

  const handleClick = useCallback(() => {
    if (!src) inputRef.current?.click();
  }, [src]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  if (!src) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full w-full cursor-pointer no-drag"
        style={{
          border: '2px dashed var(--rb-border)',
          borderRadius: 'var(--rb-radius-lg, 8px)',
          color: 'var(--rb-text-muted)',
          background: 'var(--rb-accent-subtle)',
          transition: 'border-color 150ms ease, color 150ms ease, background 150ms ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--rb-accent)';
          e.currentTarget.style.color = 'var(--rb-accent)';
          e.currentTarget.style.background = 'var(--rb-accent-subtle)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--rb-border)';
          e.currentTarget.style.color = 'var(--rb-text-muted)';
          e.currentTarget.style.background = 'var(--rb-accent-subtle)';
        }}
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <ImagePlus size={32} strokeWidth={1.5} style={{ opacity: 0.7 }} />
        <span
          style={{
            marginTop: '8px',
            fontSize: '9px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.10em',
          }}
        >
          Click or drop image
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden" style={{ borderRadius: `${radius}px` }}>
      <img
        src={src}
        alt={alt}
        className="h-full w-full"
        style={{ objectFit: fit, display: 'block' }}
        draggable={false}
      />
    </div>
  );
}
