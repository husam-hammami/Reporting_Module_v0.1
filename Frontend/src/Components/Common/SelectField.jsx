import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  FormHelperText,
} from '@mui/material';
import { useEffect, useState } from 'react';

function SelectField({
  field,
  labelName,
  formik,
  options = [],
  className,
  defaultValue,
  isDisabled,
  multiple = false
}) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (defaultValue != null && defaultValue !== '' && (formik.values[field] == null || formik.values[field] === '')) {
      formik.setFieldValue(field, defaultValue);
    } else if (!defaultValue && (formik.values[field] == null || formik.values[field] === '')) {
      // Never set to undefined: use '' or [] so the Select stays controlled
      formik.setFieldValue(field, multiple ? [] : (options[0]?.value ?? ''));
    }
  }, []);

  const handleChange = (event) => {
    if (multiple) {
      const value = event.target.value;
      formik.setFieldValue(field, typeof value === 'string' ? value.split(',') : value);
    } else {
      formik.handleChange(event);
    }
  };

  return (
    <div className={`flex flex-col ${className}`}>
      <FormControl
        variant="outlined"
        className="w-full"
        error={formik?.touched[field] && Boolean(formik?.errors[field])}
      >
        {labelName && (
          <label className="dark:text-zinc-50 mb-1">{labelName}</label>
        )}
        <Select
          size="small"
          id={field}
          name={field}
          value={formik?.values[field] ?? (multiple ? [] : '')}
          onChange={handleChange}
          onBlur={formik?.handleBlur}
          disabled={isDisabled || false}
          multiple={multiple}
          sx={{
            backgroundColor: isDark && !isDisabled ? '#131b2d' : 'white',
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: isDark ? 'rgba(255, 255, 255, 0.3) !important' : 'rgba(0, 0, 0, 0.23)',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: isDark ? 'rgba(255, 255, 255, 0.6) !important' : 'rgba(0, 0, 0, 0.87)',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: isDark ? '#4B92FF !important' : 'primary.main',
            },
            '& .MuiSelect-select': {
              color: isDark ? '#ffffff !important' : 'rgba(0, 0, 0, 0.87)',
            },
            '& .MuiSvgIcon-root': {
              color: isDark ? 'rgba(255, 255, 255, 0.7) !important' : 'rgba(0, 0, 0, 0.54)',
            },
          }}
          MenuProps={{
            PaperProps: {
              sx: {
                backgroundColor: isDark ? '#131b2d' : 'white',
                '& .MuiMenuItem-root': {
                  color: isDark ? 'rgba(255, 255, 255, 0.87)' : 'rgba(0, 0, 0, 0.87)',
                  '&:hover': {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                  },
                },
              },
            },
          }}
        >
          {!multiple && (
            <MenuItem disabled value='' className="!hidden">
              <em>None</em>
            </MenuItem>
          )}
          {options.map((option, index) => (
            <MenuItem key={index} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
        {formik?.touched[field] && formik?.errors[field] && (
          <FormHelperText sx={{ color: isDark ? '#d1d5db' : 'rgba(0, 0, 0, 0.6)' }}>
            {formik.errors[field]}
          </FormHelperText>
        )}
      </FormControl>
    </div>
  );
}

export default SelectField;
