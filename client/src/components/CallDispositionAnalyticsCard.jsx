import React, { useState } from "react";

function CallDispositionAnalyticsCard() {
  const [teamMember, setTeamMember] = useState("you");

  return (
    <div className="bg-white rounded-lg lg:rounded-xl shadow-sm lg:shadow-lg border border-gray-200 p-4 lg:p-6 hover:shadow-xl transition-shadow duration-300">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <h3 className="text-base lg:text-lg font-semibold text-gray-800">
          Call Disposition Analytics
        </h3>

        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3 sm:gap-4 w-full sm:w-auto">
          <div className="w-full sm:w-auto">
            <label className="block text-xs text-gray-500 mb-1 font-medium">
              Team Members
            </label>
            <select
              value={teamMember}
              onChange={(e) => setTeamMember(e.target.value)}
              className="w-full lg:w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            >
              <option value="you">You</option>
              <option value="all">All Members</option>
            </select>
          </div>
          <button className="w-full sm:w-auto bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-2 cursor-pointer rounded-lg text-sm font-medium shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105">
            Download Report
          </button>
        </div>
      </div>

      <div className="flex items-center justify-center h-48 lg:h-64">
        <div className="text-center px-4 transform hover:scale-105 transition-transform duration-300">
          <p className="text-gray-300 text-base lg:text-xl font-light">
            No calls made with any
          </p>
          <p className="text-gray-300 text-base lg:text-xl font-light">
            disposition code in selected time range
          </p>
        </div>
      </div>
    </div>
  );
}

export default CallDispositionAnalyticsCard;
