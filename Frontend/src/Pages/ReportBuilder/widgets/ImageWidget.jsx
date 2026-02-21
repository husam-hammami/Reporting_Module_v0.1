/**
 * Image widget — displays an uploaded image.
 * The image is stored as a base64 data-URL in config.src.
 * Config: src, objectFit ('contain'|'cover'|'fill'), alt, borderRadius.
 */
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
    // Limit to 5 MB
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
        className="flex flex-col items-center justify-center h-full w-full cursor-pointer text-[#8898aa] hover:text-[#2563ab] transition-colors no-drag"
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <ImagePlus size={28} strokeWidth={1.5} />
        <span className="text-[10px] mt-1.5 font-medium">Click or drop image</span>
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
        style={{ objectFit: fit }}
        draggable={false}
      />
    </div>
  );
}
