import { useState } from 'react';
import { FaSync, FaDownload, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';
import { useLanguage } from '../../Hooks/useLanguage';
import axios from '../../API/axios';

export default function SoftwareUpdates() {
  const { t } = useLanguage();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleCheck = async () => {
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      const res = await axios.get('/api/settings/updates/check');
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="bg-white dark:bg-[#131b2d] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40]">
        <div className="px-4 py-2.5 border-b border-[#e3e9f0] dark:border-[#1e2d40]">
          <div className="flex items-center gap-2">
            <FaSync size={13} className="text-[var(--brand)]" />
            <h3 className="text-[12px] font-semibold text-[var(--text-primary)]">{t('updates.title')}</h3>
          </div>
        </div>

        <div className="px-4 py-4 space-y-4">
          <p className="text-[11px] text-[var(--text-muted)]">
            {t('updates.description')}
          </p>

          <button
            onClick={handleCheck}
            disabled={checking}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md bg-[var(--brand)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <FaSync size={10} className={checking ? 'animate-spin' : ''} />
            {checking ? t('updates.checking') : t('updates.checkNow')}
          </button>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-[11px]">
              <FaExclamationTriangle size={11} />
              {error}
            </div>
          )}

          {result && !result.update_available && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-[11px]">
              <FaCheckCircle size={11} />
              {t('updates.upToDate')} — v{result.current_version}
            </div>
          )}

          {result?.update_available && (
            <div className="rounded-lg border border-[var(--brand)] bg-[var(--brand-subtle)] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FaDownload size={12} className="text-[var(--brand)]" />
                <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                  {t('updates.newVersion')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-[var(--text-muted)]">{t('updates.currentVersion')}: </span>
                  <span className="font-medium text-[var(--text-primary)]">v{result.current_version}</span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">{t('updates.latestVersion')}: </span>
                  <span className="font-medium text-[var(--brand)]">v{result.latest.version}</span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">{t('updates.branch')}: </span>
                  <span className="font-medium text-[var(--text-primary)]">{result.branch}</span>
                </div>
                {result.latest.published_at && (
                  <div>
                    <span className="text-[var(--text-muted)]">{t('updates.released')}: </span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {new Date(result.latest.published_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              {result.latest.download_url && (
                <a
                  href={result.latest.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md bg-[var(--brand)] text-white hover:opacity-90 transition-opacity"
                >
                  <FaDownload size={10} />
                  {t('updates.download')}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
