import React from 'react';

function EmptyStateCard({ icon, message, className = '' }) {
  return (
    <div className={`bg-white rounded-lg p-8 flex items-center justify-center min-h-[400px] ${className}`}>
      <div className="text-center">
        <div className="w-32 h-32 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
          {icon || (
            <svg className="w-16 h-16 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        <p className="text-gray-400 font-medium">{message || 'No Data Available'}</p>
      </div>
    </div>
  );
}

export default EmptyStateCard;
