import React, { useState } from "react";

function PostCallSurveyAnalyticsCard() {
  const [justCallNumber, setJustCallNumber] = useState("(660) 217-4140");
  const [teamMember, setTeamMember] = useState("you");

  const chartData = [
    { date: "2025-10-23" },
    { date: "2025-10-24" },
    { date: "2025-10-25" },
    { date: "2025-10-26" },
    { date: "2025-10-27" },
    { date: "2025-10-28" },
    { date: "2025-10-29" },
  ];

  const tableColumns = [
    "Team Member",
    "Total Calls",
    "Surveys Offered",
    "Surveys Completed",
    "Conversation Rating",
  ];

  return (
    <div className="bg-white rounded-lg lg:rounded-xl shadow-sm lg:shadow-lg border border-gray-200 p-4 lg:p-6 hover:shadow-xl transition-shadow duration-300">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-base lg:text-lg font-semibold text-gray-800">
            Post Call Survey Analytics
          </h3>
          <span className="bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded">
            NEW
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3 lg:gap-4 w-full lg:w-auto">
          <div className="w-full sm:w-auto">
            <label className="block text-xs text-gray-500 mb-1 font-medium">
              JustCall number
            </label>
            <select
              value={justCallNumber}
              onChange={(e) => setJustCallNumber(e.target.value)}
              className="w-full lg:w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            >
              <option value="(660) 217-4140">(660) 217-4140</option>
            </select>
          </div>
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

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left side - Chart */}
        <div className="w-full lg:w-1/2 border-b lg:border-b-0 lg:border-r border-gray-200 pb-6 lg:pb-0 lg:pr-6">
          <div className="flex flex-wrap gap-3 lg:gap-4 mb-6 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500"></span>
              <span className="text-gray-600">5 Stars</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-400"></span>
              <span className="text-gray-600">4 Stars</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
              <span className="text-gray-600">3 Stars</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-400"></span>
              <span className="text-gray-600">2 Stars</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500"></span>
              <span className="text-gray-600">1 Star</span>
            </div>
          </div>

          <div className="relative h-64 border-b-2 border-gray-300">
            <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-gray-500 pr-2">
              <span>1</span>
              <span>0</span>
              <span>-1</span>
            </div>

            <div className="ml-8 h-full relative">
              <div className="absolute inset-0 flex flex-col justify-between">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="border-t border-gray-200"></div>
                ))}
              </div>

              <div className="absolute inset-0 flex items-center justify-around">
                {chartData.map((point, index) => (
                  <div
                    key={index}
                    className="h-full flex items-center"
                  >
                    <div className="w-1 h-0.5 bg-red-300"></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="ml-8 mt-2 flex justify-around text-[10px] sm:text-xs text-gray-500 overflow-x-auto">
              {chartData.map((point, index) => {
                const date = new Date(point.date);
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return (
                  <span key={index} className="whitespace-nowrap">
                    <span className="hidden sm:inline">{point.date}</span>
                    <span className="sm:hidden">{`${month}/${day}`}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right side - Table */}
        <div className="w-full lg:w-1/2">
          <div className="overflow-x-auto -mx-4 lg:mx-0">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-gray-200">
                  {tableColumns.map((column, index) => (
                    <th
                      key={index}
                      className="text-left py-2 px-3 text-xs lg:text-sm font-semibold text-gray-700"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={5} className="py-12 lg:py-20 text-center text-gray-400 text-sm">
                    No data found
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PostCallSurveyAnalyticsCard;
