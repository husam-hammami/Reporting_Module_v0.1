import { useState, useMemo } from 'react';
import { FaSearch, FaTimes } from 'react-icons/fa';

/**
 * A reusable tag picker dropdown for selecting PLC tags.
 */
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
          decimals: tag.decimal_places ?? 1,
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
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 text-left text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#131b2d] text-gray-900 dark:text-gray-100 hover:border-brand dark:hover:border-brand transition-colors truncate"
      >
        {multi ? (
          selectedTags.length > 0
            ? `${selectedTags.length} tag${selectedTags.length > 1 ? 's' : ''} selected`
            : placeholder
        ) : (
          value || placeholder
        )}
      </button>

      {/* Multi: selected chips */}
      {multi && selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selectedTags.map((t) => (
            <span
              key={t.tagName}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-[#0e74901a] text-brand dark:text-cyan-400 rounded-md"
            >
              {t.displayName || t.tagName}
              <FaTimes
                className="cursor-pointer hover:text-red-400 transition-colors"
                onClick={() => removeTag(t.tagName)}
              />
            </span>
          ))}
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(''); }} />
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#131b2d] shadow-xl max-h-64 overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b border-gray-100 dark:border-gray-700">
              <div className="relative">
                <FaSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tags..."
                  autoFocus
                  className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#0b111e] text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>

            {/* List */}
            <div className="overflow-y-auto max-h-48" data-wheel-scroll>
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-xs text-center text-gray-400">No tags found</p>
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
                      className={`w-full px-3 py-2 text-left text-xs hover:bg-brand-subtle dark:hover:bg-cyan-900/20 transition-colors flex items-center justify-between ${
                        isSelected ? 'bg-cyan-50/60 dark:bg-cyan-900/10' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 dark:text-gray-200 truncate">
                          {tag.display_name || tag.tag_name}
                        </p>
                        {tag.description && (
                          <p className="text-[10px] text-gray-400 truncate mt-0.5">
                            {tag.description}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <span className="text-brand ml-2 text-[10px] font-bold">✓</span>
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
