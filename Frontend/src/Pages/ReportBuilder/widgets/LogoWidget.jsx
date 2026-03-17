import { useBranding } from '../../../Context/BrandingContext';
import { ImageIcon } from 'lucide-react';

/**
 * LogoWidget — Displays the uploaded client logo in the dashboard report builder.
 * Automatically loads the logo from BrandingContext (no manual upload needed).
 * Configured via Engineering > Branding settings.
 */
export default function LogoWidget({ config }) {
  const { clientLogo, loading } = useBranding();
  const fit = config?.objectFit || 'contain';
  const radius = config?.borderRadius || '0';

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center" style={{ color: 'var(--rb-text-muted)' }}>
        <span className="text-[9px] font-medium">Loading logo...</span>
      </div>
    );
  }

  if (!clientLogo) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full w-full"
        style={{
          border: '2px dashed var(--rb-border)',
          borderRadius: 'var(--rb-radius-lg, 8px)',
          color: 'var(--rb-text-muted)',
          background: 'var(--rb-accent-subtle)',
        }}
      >
        <ImageIcon size={28} strokeWidth={1.5} style={{ opacity: 0.5 }} />
        <span
          style={{
            marginTop: '6px',
            fontSize: '9px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.10em',
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          No client logo
        </span>
        <span style={{ fontSize: '8px', opacity: 0.6, marginTop: '2px' }}>
          Upload in Engineering &gt; Branding
        </span>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden" style={{ borderRadius: `${radius}px` }}>
      <img
        src={clientLogo}
        alt="Client Logo"
        className="h-full w-full"
        style={{ objectFit: fit, display: 'block' }}
        draggable={false}
      />
    </div>
  );
}
