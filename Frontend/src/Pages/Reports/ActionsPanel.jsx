/**
 * ActionsPanel — Quick actions sidebar for A4 report view.
 * Schedule, share, export, print, refresh controls.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Link2, FileDown, Printer, RefreshCw, Maximize, Image, FileSpreadsheet } from 'lucide-react';

function ActionButton({ icon: Icon, label, onClick, active }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', padding: '7px 10px', border: 'none', borderRadius: 6,
        background: active ? 'rgba(34,211,238,0.12)' : 'transparent',
        color: active ? '#22d3ee' : '#c1cdd9',
        cursor: 'pointer', fontSize: 11, fontWeight: 600,
        transition: 'background 0.15s, color 0.15s',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#f0f4f8'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = active ? 'rgba(34,211,238,0.12)' : 'transparent'; e.currentTarget.style.color = active ? '#22d3ee' : '#c1cdd9'; }}
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );
}

export default function ActionsPanel({ reportId, onExportPDF, onExportPNG, onPrint, onToggleFullscreen, style, className = '' }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExcel = () => {
    window.open(`/api/report-builder/templates/${reportId}/export?format=xlsx`, '_blank');
  };

  return (
    <div className={className} style={{
      display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 8px',
      height: '100%', overflow: 'auto',
      ...style,
    }}>
      {/* Header */}
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8899ab', marginBottom: 4, paddingLeft: 10 }}>
        Actions
      </span>

      <ActionButton icon={Calendar} label="Schedule Delivery" onClick={() => navigate('/distribution')} />
      <ActionButton icon={Link2} label={copied ? 'Copied!' : 'Share Link'} onClick={handleShare} active={copied} />

      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '6px 10px' }} />

      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', paddingLeft: 10 }}>
        Export
      </span>

      <ActionButton icon={FileDown} label="Download PDF" onClick={onExportPDF} />
      <ActionButton icon={Image} label="Download PNG" onClick={onExportPNG} />
      <ActionButton icon={FileSpreadsheet} label="Download Excel" onClick={handleExcel} />
      <ActionButton icon={Printer} label="Print" onClick={() => (onPrint ? onPrint() : window.print())} />

      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '6px 10px' }} />

      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', paddingLeft: 10 }}>
        View
      </span>

      <ActionButton icon={Maximize} label="Fullscreen" onClick={onToggleFullscreen} />
    </div>
  );
}
