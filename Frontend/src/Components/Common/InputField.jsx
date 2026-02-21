import { TextField } from '@mui/material';
import { useEffect, useState } from 'react';

function InputField({
  field,
  labelName,
  formik,
  type = 'text',
  className,
  disabled,
  defaultValue,
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

  // Ensure Formik has initial values when component mounts
  useEffect(() => {
    if (defaultValue && !formik.values[field]) {
      formik.setFieldValue(field, defaultValue);
    }
  }, []);
  return (
    <div className={`flex flex-col ${className}`}>
      {labelName && (
        <label htmlFor={field} className="dark:text-zinc-50 mb-1">
          {labelName}
        </label>
      )}
      <TextField
        id={field}
        name={field}
        disabled={disabled}
        variant={disabled ? `outlined` : `outlined`}
        size="small"
        type={type}
        value={formik?.values[field] }
        onChange={formik?.handleChange}
        onBlur={formik?.handleBlur}
        error={formik?.touched[field] && Boolean(formik?.errors[field])}
        helperText={formik?.touched[field] && formik.errors[field]}
        slotProps={{
          htmlInput: {
            className: `${
              disabled
                ? '!bg-zinc-300 dark:!bg-zinc-700 !opacity-90 cursor-not-allowed'
                : ''
            }`,
          },
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            backgroundColor: isDark && !disabled ? '#131b2d !important' : disabled ? '' : 'white !important',
            '& fieldset': {
              borderColor: isDark ? 'rgba(255, 255, 255, 0.3) !important' : 'rgba(0, 0, 0, 0.23)',
            },
            '&:hover fieldset': {
              borderColor: isDark ? 'rgba(255, 255, 255, 0.6) !important' : 'rgba(0, 0, 0, 0.87)',
            },
            '&.Mui-focused fieldset': {
              borderColor: isDark ? '#4B92FF !important' : 'primary.main',
            },
            '&:hover': {
              backgroundColor: isDark && !disabled ? '#131b2d !important' : disabled ? '' : 'white !important',
            },
            '&.Mui-focused': {
              backgroundColor: isDark && !disabled ? '#131b2d !important' : disabled ? '' : 'white !important',
            },
          },
          '& .MuiInputLabel-root': {
            color: isDark ? '#e5e7eb' : 'rgba(0, 0, 0, 0.6)',
            '&.Mui-focused': {
              color: isDark ? '#4B92FF' : 'primary.main',
            },
          },
          '& .MuiInputBase-input': {
            color: isDark ? '#ffffff' : 'rgba(0, 0, 0, 0.87)',
            backgroundColor: 'transparent',
          },
          '& .MuiFormHelperText-root': {
            color: isDark ? '#d1d5db' : 'rgba(0, 0, 0, 0.6)',
          },
        }}
        defaultValue={defaultValue}
      />
    </div>
  );
}

export default InputField;
