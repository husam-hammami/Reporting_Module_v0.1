import PropTypes from 'prop-types';

export function Card({ className = '', children }) {
  return (
    <div className={`rounded-lg border bg-card text-card-foreground shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ className = '', children }) {
  return (
    <div className={`flex flex-col space-y-1.5 p-6 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ className = '', children }) {
  return (
    <h3 className={`text-lg font-semibold leading-none tracking-tight ${className}`}>
      {children}
    </h3>
  );
}

export function CardContent({ className = '', children }) {
  return (
    <div className={`p-6 pt-0 ${className}`}>
      {children}
    </div>
  );
}

Card.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node.isRequired,
};

CardHeader.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node.isRequired,
};

CardTitle.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node.isRequired,
};

CardContent.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node.isRequired,
}; 