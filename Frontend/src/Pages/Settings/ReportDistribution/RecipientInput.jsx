import React, { useState } from 'react';
import { FaTimes } from 'react-icons/fa';

export default function RecipientInput({ value = [], onChange }) {
  const [input, setInput] = useState('');

  const addEmail = (email) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return;
    if (value.includes(trimmed)) return;
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
    <div className="flex flex-wrap items-center gap-1.5 min-h-[38px] px-2.5 py-1.5 rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#0d1825] focus-within:ring-2 focus-within:ring-brand focus-within:border-transparent">
      {value.map((email, idx) => (
        <span
          key={idx}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#edf2f7] dark:bg-[#1e2d40] text-[11px] text-[#3a4a5c] dark:text-[#c1ccd9]"
        >
          {email}
          <button
            type="button"
            onClick={() => removeEmail(idx)}
            className="text-[#8898aa] hover:text-red-500 transition-colors"
          >
            <FaTimes size={8} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={value.length === 0 ? 'Type email and press Enter' : ''}
        className="flex-1 min-w-[140px] bg-transparent text-[13px] text-[#2a3545] dark:text-[#e1e8f0] outline-none placeholder:text-[#8898aa]"
      />
    </div>
  );
}
