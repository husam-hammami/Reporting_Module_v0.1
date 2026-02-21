import PropTypes from 'prop-types';

export function Select({ value, onValueChange, options, className = '' }) {
  return (
    <select
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className={`px-3 py-2 rounded-md border focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

Select.propTypes = {
  value: PropTypes.string.isRequired,
  onValueChange: PropTypes.func.isRequired,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      value: PropTypes.string.isRequired,
    })
  ).isRequired,
  className: PropTypes.string,
}; 