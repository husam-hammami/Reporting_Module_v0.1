import { useState, useMemo } from 'react';
import { FaSearch, FaTimes } from 'react-icons/fa';

export default function TagPicker({ tags, value, onChange, placeholder = 'Select tag...', multi = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return tags;
    const q = search.toLowerCase();
    return tags.filter(
      (t) =>
        t.tag_name?.toLowerCase().includes(q) ||
        t.display_name?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q)
    );
  }, [tags, search]);

  const selectedTags = multi
    ? (Array.isArray(value) ? value : [])
    : [];

  const handleSelect = (tag) => {
    if (multi) {
      const exists = selectedTags.some((t) => t.tagName === tag.tag_name);
      if (exists) {
        onChange(selectedTags.filter((t) => t.tagName !== tag.tag_name));
      } else {
        onChange([...selectedTags, {
          tagName: tag.tag_name,
          displayName: tag.display_name || tag.tag_name,
          unit: tag.unit || '',
          decimals: tag.decimal_places ?? (['INT', 'DINT', 'BOOL'].includes(tag.data_type) ? 0 : 2),
        }]);
      }
    } else {
      onChange(tag.tag_name);
      setOpen(false);
      setSearch('');
    }
  };

  const removeTag = (tagName) => {
    onChange(selectedTags.filter((t) => t.tagName !== tagName));
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 text-left text-[12px] rounded-lg border border-[var(--rb-border)] bg-[var(--rb-input)] text-[var(--rb-text)] hover:border-[var(--rb-accent)] transition-all duration-150 truncate focus:outline-none focus:ring-2 focus:ring-[var(--rb-accent-subtle)] focus:border-[var(--rb-accent)]"
      >
        {multi ? (
          selectedTags.length > 0
            ? `${selectedTags.length} tag${selectedTags.length > 1 ? 's' : ''} selected`
            : <span className="text-[var(--rb-text-muted)]">{placeholder}</span>
        ) : (
          value || <span className="text-[var(--rb-text-muted)]">{placeholder}</span>
        )}
      </button>

      {multi && selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selectedTags.map((t) => (
            <span
              key={t.tagName}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold bg-[var(--rb-accent-subtle)] text-[var(--rb-accent)] rounded-full border border-[color-mix(in_srgb,var(--rb-accent)_20%,transparent)] transition-all duration-150 hover:shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--rb-accent)] opacity-60 flex-shrink-0" />
              {t.displayName || t.tagName}
              <button
                type="button"
                onClick={() => removeTag(t.tagName)}
                className="p-0.5 rounded-full opacity-50 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--rb-accent)_15%,transparent)] transition-all duration-150"
              >
                <FaTimes size={8} />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(''); }} />
          <div className="absolute z-50 mt-1.5 w-full rb-formula-dropdown overflow-hidden">
            <div className="p-2.5 border-b border-[var(--rb-border-subtle)] bg-[var(--rb-surface)]">
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--rb-text-muted)] text-[10px]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tags..."
                  autoFocus
                  className="rb-input-base w-full pl-8 pr-3 py-1.5 text-[12px] rounded-lg"
                />
              </div>
            </div>

            <div className="overflow-y-auto max-h-48 py-1" data-wheel-scroll>
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-[12px] text-center text-[var(--rb-text-muted)]">No tags found</p>
              ) : (
                filtered.map((tag) => {
                  const isSelected = multi
                    ? selectedTags.some((t) => t.tagName === tag.tag_name)
                    : value === tag.tag_name;

                  return (
                    <button
                      key={tag.tag_name || tag.id}
                      type="button"
                      onClick={() => handleSelect(tag)}
                      className={`rb-formula-dropdown-item w-full text-left flex items-center justify-between ${
                        isSelected ? 'bg-[var(--rb-accent-subtle)]' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium text-[var(--rb-text)] truncate">
                          {tag.display_name || tag.tag_name}
                        </p>
                        {tag.description && (
                          <p className="text-[10px] text-[var(--rb-text-muted)] truncate mt-0.5">
                            {tag.description}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <span className="ml-2 text-[var(--rb-accent)] text-[11px] font-bold flex-shrink-0">✓</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
