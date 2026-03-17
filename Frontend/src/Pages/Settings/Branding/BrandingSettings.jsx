import { useState, useRef, useCallback } from 'react';
import { Upload, Trash2, Check, ImageIcon, AlertCircle } from 'lucide-react';
import { useBranding } from '../../../Context/BrandingContext';
import HerculesLogo from '../../../Assets/Hercules_New.png';
import AsmLogo from '../../../Assets/Asm_Logo.png';

/**
 * Resize an image to max dimensions while maintaining aspect ratio.
 * Returns a base64 DataURL (PNG).
 */
function resizeImage(file, maxWidth = 400, maxHeight = 200) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function BrandingSettings() {
  const { clientLogo, uploadLogo, removeLogo } = useBranding();
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const inputRef = useRef(null);

  const clearMessages = () => { setError(null); setSuccess(null); };

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPG, SVG, etc.)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB');
      return;
    }
    clearMessages();
    setUploading(true);
    try {
      const resized = await resizeImage(file, 400, 200);
      await uploadLogo(resized);
      setSuccess('Client logo saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to upload logo');
    } finally {
      setUploading(false);
    }
  }, [uploadLogo]);

  const handleRemove = async () => {
    clearMessages();
    setRemoving(true);
    try {
      await removeLogo();
      setSuccess('Client logo removed');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to remove logo');
    } finally {
      setRemoving(false);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="space-y-4">
      {/* Client Logo Upload */}
      <div className="bg-white dark:bg-[#131b2d] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40]">
        <div className="px-4 py-2.5 border-b border-[#e3e9f0] dark:border-[#1e2d40]">
          <div className="flex items-center gap-2">
            <ImageIcon className="text-[#0284c7] dark:text-[#38bdf8]" size={13} />
            <h3 className="text-[12px] font-semibold text-[#2a3545] dark:text-[#e1e8f0]">Client Logo</h3>
            <span className="text-[9px] text-[#8898aa]">
              — Displayed in navigation bar and automatically in table reports
            </span>
          </div>
        </div>

        <div className="px-4 py-4">
          {/* Messages */}
          {error && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
              <AlertCircle size={12} className="text-red-500 shrink-0" />
              <span className="text-[11px] text-red-600 dark:text-red-400">{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
              <Check size={12} className="text-emerald-500 shrink-0" />
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400">{success}</span>
            </div>
          )}

          {clientLogo ? (
            /* Logo preview */
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-[200px] h-[100px] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] bg-[#f5f8fb] dark:bg-[#0d1825] p-3">
                <img
                  src={clientLogo}
                  alt="Client logo"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium rounded-md bg-[#0284c7] hover:bg-[#0369a1] text-white transition-colors disabled:opacity-50"
                >
                  <Upload size={10} />
                  {uploading ? 'Uploading...' : 'Replace'}
                </button>
                <button
                  onClick={handleRemove}
                  disabled={removing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium rounded-md bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={10} />
                  {removing ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </div>
          ) : (
            /* Upload area */
            <div
              className="flex flex-col items-center justify-center py-8 px-6 rounded-lg border-2 border-dashed border-[#d1d5db] dark:border-[#2a3a4e] hover:border-[#0284c7] dark:hover:border-[#38bdf8] cursor-pointer transition-colors bg-[#f9fafb] dark:bg-[#0a1220]"
              onClick={() => inputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
              <Upload size={24} className="text-[#94a3b8] mb-2" strokeWidth={1.5} />
              <span className="text-[11px] font-semibold text-[#475569] dark:text-[#94a3b8]">
                {uploading ? 'Uploading...' : 'Click or drag to upload client logo'}
              </span>
              <span className="text-[9px] text-[#94a3b8] mt-1">
                PNG, JPG, or SVG — max 5 MB — auto-resized to fit
              </span>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
          />
        </div>
      </div>

      {/* Preview: How logos appear in reports */}
      <div className="bg-white dark:bg-[#131b2d] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40]">
        <div className="px-4 py-2.5 border-b border-[#e3e9f0] dark:border-[#1e2d40]">
          <h3 className="text-[11px] font-semibold text-[#2a3545] dark:text-[#e1e8f0]">
            Table Report Header Preview
          </h3>
          <p className="text-[9px] text-[#8898aa] mt-0.5">
            This header appears automatically at the top of every table report page
          </p>
        </div>
        <div className="px-4 py-4">
          <div className="bg-white border border-[#e5e7eb] rounded shadow-sm p-3">
            <div className="flex items-center justify-between">
              <img
                src={HerculesLogo}
                alt="Hercules"
                className="h-10 w-auto object-contain"
                style={{ filter: 'brightness(0.2)' }}
              />
              <div className="flex items-center gap-3">
                {clientLogo && (
                  <img
                    src={clientLogo}
                    alt="Client"
                    className="h-10 w-auto object-contain"
                  />
                )}
                <img
                  src={AsmLogo}
                  alt="ASM"
                  className="h-10 w-auto object-contain"
                />
              </div>
            </div>
            <div className="mt-2 h-[1px] bg-gradient-to-r from-[#0f3460] via-[#1a5276] to-[#0f3460]" />
          </div>
          {!clientLogo && (
            <p className="text-[9px] text-[#94a3b8] mt-2 text-center italic">
              Upload a client logo above to see it in the preview
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
