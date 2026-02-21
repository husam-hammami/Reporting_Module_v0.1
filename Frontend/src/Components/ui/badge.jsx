import PropTypes from 'prop-types';

const variantStyles = {
  default: 'bg-gray-100 text-gray-800',
  primary: 'bg-blue-100 text-blue-800',
  secondary: 'bg-purple-100 text-purple-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  destructive: 'bg-red-100 text-red-800',
};

export function Badge({ variant = 'default', className = '', children }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  );
}

Badge.propTypes = {
  variant: PropTypes.oneOf(['default', 'primary', 'secondary', 'success', 'warning', 'destructive']),
  className: PropTypes.string,
  children: PropTypes.node.isRequired,
}; 