import React, { useState, useEffect } from 'react';
import { FaTimes, FaSave, FaGripVertical } from 'react-icons/fa';

const TagGroupForm = ({ group, availableTags, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    group_name: '',
    description: '',
    assigned_tags: [],
    is_active: true
  });

  const [errors, setErrors] = useState({});
  const [existingGroups, setExistingGroups] = useState([]);
  const [draggedIndex, setDraggedIndex] = useState(null);

  useEffect(() => {
    // Load existing groups for validation
    const saved = localStorage.getItem('system_tag_groups');
    if (saved) {
      const data = JSON.parse(saved);
      setExistingGroups(data.tag_groups || []);
    }

    // If editing, populate form
    if (group) {
      setFormData({
        group_name: group.group_name || '',
        description: group.description || '',
        assigned_tags: group.assigned_tags || [],
        is_active: group.is_active !== undefined ? group.is_active : true
      });
    }
  }, [group]);

  const validate = () => {
    const newErrors = {};

    if (!formData.group_name.trim()) {
      newErrors.group_name = 'Group Name is required';
    } else {
      const duplicate = existingGroups.find(
        g => g.group_name.toLowerCase() === formData.group_name.toLowerCase().trim() && g.id !== group?.id
      );
      if (duplicate) {
        newErrors.group_name = 'Group Name already exists';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      onSave(formData);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleAddTag = (tagName) => {
    if (!formData.assigned_tags.includes(tagName)) {
      handleChange('assigned_tags', [...formData.assigned_tags, tagName]);
    }
  };

  const handleRemoveTag = (tagName) => {
    handleChange('assigned_tags', formData.assigned_tags.filter(t => t !== tagName));
  };

  const handleDragStart = (index) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (dropIndex) => {
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newTags = [...formData.assigned_tags];
    const draggedTag = newTags[draggedIndex];
    newTags.splice(draggedIndex, 1);
    newTags.splice(dropIndex, 0, draggedTag);

    handleChange('assigned_tags', newTags);
    setDraggedIndex(null);
  };

  const availableTagsToAdd = availableTags.filter(t => !formData.assigned_tags.includes(t.tag_name));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:!bg-[#131b2d] rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:!bg-[#131b2d] border-b border-gray-200 dark:border-gray-700 p-6 flex justify-between items-center">
          <h3 className="text-2xl font-bold dark:text-gray-100">
            {group ? 'Edit Tag Group' : 'Create New Tag Group'}
          </h3>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <FaTimes size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Group Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Group Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.group_name}
              onChange={(e) => handleChange('group_name', e.target.value)}
              className={`w-full p-2 border rounded-md bg-white dark:!bg-[#0b111e] text-gray-900 dark:text-gray-100 ${
                errors.group_name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              }`}
              placeholder="e.g., Sender Sources, Receiver Destinations"
            />
            {errors.group_name && <p className="text-red-500 text-xs mt-1">{errors.group_name}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#0b111e] text-gray-900 dark:text-gray-100"
              rows="2"
              placeholder="Optional description of this tag group"
            />
          </div>

          {/* Assigned Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Assigned Tags
            </label>

            {/* Add Tag Dropdown */}
            {availableTagsToAdd.length > 0 && (
              <div className="mb-4">
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddTag(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#0b111e] text-gray-900 dark:text-gray-100"
                >
                  <option value="">Add a tag...</option>
                  {availableTagsToAdd.map(tag => (
                    <option key={tag.id} value={tag.tag_name}>
                      {tag.display_name || tag.tag_name} {tag.unit ? `(${tag.unit})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Assigned Tags List */}
            {formData.assigned_tags.length > 0 ? (
              <div className="space-y-2">
                {formData.assigned_tags.map((tagName, index) => {
                  const tag = availableTags.find(t => t.tag_name === tagName);
                  return (
                    <div
                      key={index}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(index)}
                      className="flex items-center gap-3 p-3 bg-gray-50 dark:!bg-[#0b111e] border border-gray-200 dark:border-gray-700 rounded-md cursor-move"
                    >
                      <FaGripVertical className="text-gray-400" />
                      <span className="flex-1 text-sm font-medium dark:text-gray-100">
                        {tag ? (tag.display_name || tag.tag_name) : tagName}
                        {tag?.unit && <span className="text-gray-500 ml-2">({tag.unit})</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tagName)}
                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                      >
                        <FaTimes />
                      </button>
                    </div>
                  );
                })}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Drag tags to reorder them
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                No tags assigned. Use the dropdown above to add tags.
              </p>
            )}
          </div>

          {/* Is Active */}
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => handleChange('is_active', e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Active (Group is enabled)
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-brand hover:bg-brand-hover text-white font-medium rounded-md flex items-center gap-2"
            >
              <FaSave />
              Save Group
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TagGroupForm;

