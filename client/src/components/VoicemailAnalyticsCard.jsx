import React from "react";

function VoicemailAnalyticsCard() {
  return (
    <div className="bg-white rounded-lg lg:rounded-xl shadow-sm lg:shadow-lg border border-gray-200 p-4 lg:p-6 hover:shadow-xl transition-shadow duration-300">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
        <h3 className="text-base lg:text-lg font-semibold text-gray-800">Voicemail Analytics</h3>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-xs lg:text-sm">
          <span className="bg-gray-300 p-1 rounded-xl">Avg. Response Time: <span className="font-semibold">NA</span></span>
          <span className="bg-gray-300 p-1 rounded-xl">Avg. Response Rate: <span className="font-semibold">NA</span></span>
        </div>
      </div>

      <div className="flex items-center justify-center h-48 lg:h-64">
        <div className="text-center transform hover:scale-105 transition-transform duration-300">
          <div className="w-24 h-24 lg:w-32 lg:h-32 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-16 h-16 lg:w-20 lg:h-20 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
            </svg>
          </div>
          <p className="text-gray-400 font-medium text-sm lg:text-base">Not enough data</p>
          <p className="text-gray-400 text-xs lg:text-sm mt-1">No Call Activities</p>
        </div>
      </div>
    </div>
  );
}

export default VoicemailAnalyticsCard;
