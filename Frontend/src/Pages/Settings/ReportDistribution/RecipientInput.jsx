import React, { useState } from 'react';
import { X, Plus, Mail } from 'lucide-react';
import { useLanguage } from '../../../Hooks/useLanguage';

export default function RecipientInput({ value = [], onChange }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const { t } = useLanguage();

  const addEmail = (email) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setError(t('distribution.invalidEmail'));
      return;
    }
    if (value.includes(trimmed)) {
      setError(t('distribution.duplicateEmail'));
      return;
    }
    setError('');
    onChange([...value, trimmed]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault();
      addEmail(input);
      setInput('');
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const handleAdd = () => {
    addEmail(input);
    setInput('');
  };

  const handleBlur = () => {
    if (input.trim()) {
      addEmail(input);
      setInput('');
    }
  };

  const removeEmail = (idx) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  return (
    <div>
      {/* Tag list */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((email, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#edf2f7] dark:bg-[#1e2d40] text-[#3a4a5c] dark:text-[#c1ccd9] group"
            >
              <Mail size={10} className="text-[#8898aa] flex-shrink-0" />
              {email}
              <button
                type="button"
                onClick={() => removeEmail(idx)}
                className="p-0.5 rounded-sm text-[#8898aa] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Mail size={13} className="absolute start-3 top-1/2 -translate-y-1/2 text-[#8898aa]" />
          <input
            type="email"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(''); }}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={t('distribution.recipientPlaceholder')}
            className="w-full ps-9 pe-3 py-2 rounded-lg text-[12px] border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#0d1825] text-[#2a3545] dark:text-[#e1e8f0] focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-[#8898aa]"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!input.trim()}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-[11px] font-semibold bg-brand hover:bg-brand-hover text-[#0c1321] transition-colors disabled:opacity-40 whitespace-nowrap"
        >
          <Plus size={12} />
          {t('distribution.addRecipient')}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <p className="text-[10px] text-red-500 mt-1">{error}</p>
      )}

      {/* Hint */}
      {value.length === 0 && !error && (
        <p className="text-[9px] text-[#8898aa] mt-1">{t('distribution.recipientHint')}</p>
      )}
    </div>
  );
}
