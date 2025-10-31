import PropTypes from 'prop-types';

function MetricCard({ icon, value, label, trend, trendDirection, bgColor = 'bg-white' }) {
  const getTrendIcon = () => {
    if (trendDirection === 'up') {
      return (
        <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      );
    } else if (trendDirection === 'down') {
      return (
        <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      );
    }
    return null;
  };

  const getTrendColor = () => {
    if (trendDirection === 'up') return 'text-green-500';
    if (trendDirection === 'down') return 'text-red-500';
    return 'text-gray-500';
  };

  return (
    <div className={`${bgColor} rounded-lg lg:rounded-xl shadow-sm lg:shadow-lg p-4 lg:p-6 border border-gray-200 hover:shadow-xl transition-all duration-300 transform hover:scale-105`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center mb-2">
            {icon && <div className="text-2xl lg:text-3xl mr-2 lg:mr-3">{icon}</div>}
            {trend && (
              <div className={`flex items-center ${getTrendColor()}`}>
                {getTrendIcon()}
              </div>
            )}
          </div>
          <div className="text-2xl lg:text-3xl font-light text-gray-800 mb-1">{value}</div>
          <div className="text-xs lg:text-sm text-gray-500">{label}</div>
        </div>
      </div>
    </div>
  );
}

MetricCard.propTypes = {
  icon: PropTypes.node,
  value: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  trend: PropTypes.string,
  trendDirection: PropTypes.oneOf(['up', 'down']),
  bgColor: PropTypes.string,
};

export default MetricCard;
