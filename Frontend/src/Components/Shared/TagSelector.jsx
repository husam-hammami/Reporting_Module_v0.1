import React, { useState, useEffect } from 'react';
import axios from '../../API/axios';

const TagSelector = ({ value, onChange, sourceTypeFilter, placeholder = "Select Tag...", className = "" }) => {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTags = async () => {
      try {
        setLoading(true);
        // Fetch tags from API
        const response = await axios.get('/api/tags', {
          params: {
            is_active: 'true' // Only get active tags
          },
          timeout: 10000 // 10 second timeout
        });
        
        if (response.data.status === 'success') {
          setTags(response.data.tags || []);
          // Also save to localStorage for offline access
          try {
            localStorage.setItem('system_tags', JSON.stringify({
              tags: response.data.tags || [],
              lastUpdated: new Date().toISOString()
            }));
          } catch (e) {
            console.warn('Could not save tags to localStorage:', e);
          }
        } else {
          console.error('Error loading tags:', response.data.message);
          setTags([]);
        }
      } catch (e) {
        // Only log if it's not a timeout (to reduce console spam)
        if (e.code !== 'ECONNABORTED') {
          console.error('Error loading tags:', e);
        }
        // Fallback to localStorage if API fails
        try {
          const saved = localStorage.getItem('system_tags');
          if (saved) {
            const data = JSON.parse(saved);
            setTags(data.tags || []);
          } else {
            setTags([]);
          }
        } catch (localError) {
          console.error('Error loading from localStorage:', localError);
          setTags([]);
        }
      } finally {
        setLoading(false);
      }
    };

    loadTags();
    
    // Listen for tag updates
    const handleTagUpdate = () => loadTags();
    window.addEventListener('tagsUpdated', handleTagUpdate);
    
    return () => {
      window.removeEventListener('tagsUpdated', handleTagUpdate);
    };
  }, []);

  const filteredTags = sourceTypeFilter
    ? tags.filter(t => t.source_type === sourceTypeFilter && t.is_active)
    : tags.filter(t => t.is_active);

  const defaultClassName = `w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand focus:border-brand ${className}`;

  if (loading) {
    return (
      <select className={defaultClassName} disabled>
        <option>Loading tags...</option>
      </select>
    );
  }

  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className={defaultClassName}
    >
      <option value="">{placeholder}</option>
      {filteredTags.length === 0 ? (
        <option disabled>No tags available</option>
      ) : (
        filteredTags.map(tag => (
          <option key={tag.id} value={tag.tag_name}>
            {tag.display_name || tag.tag_name} {tag.unit ? `(${tag.unit})` : ''}
          </option>
        ))
      )}
    </select>
  );
};

export default TagSelector;

