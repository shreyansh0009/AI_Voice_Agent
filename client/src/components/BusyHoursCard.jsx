import { useState } from "react";
import PropTypes from "prop-types";

const HOURS = [
  "1am", "2am", "3am", "4am", "5am", "6am", "7am", "8am", "9am", "10am", 
  "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm", "6pm", "7pm", "8pm", 
  "9pm", "10pm", "11pm", "12am"
];

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const CALL_TYPES = [
  { value: "all", label: "All Calls" },
  { value: "inbound", label: "Inbound" },
  { value: "outbound", label: "Outbound" }
];

function BusyHoursCard({ defaultNumber, defaultTeamMember, defaultCallType }) {
  const [justCallNumber, setJustCallNumber] = useState(defaultNumber || "(660) 217-4140");
  const [teamMember, setTeamMember] = useState(defaultTeamMember || "you");
  const [callType, setCallType] = useState(defaultCallType || "all");

  return (
    <div className="bg-white rounded-lg lg:rounded-xl shadow-sm lg:shadow-lg border border-gray-200 p-4 lg:p-6 hover:shadow-xl transition-shadow duration-300">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base lg:text-lg font-semibold text-gray-800">Busy Hours</h3>
          <div className="w-5 h-5 bg-gray-800 text-white text-xs rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-700 transition-colors">
            ?
          </div>
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
          <div className="w-full sm:w-auto">
            <label className="block text-xs text-gray-500 mb-1 font-medium">
              Call Type
            </label>
            <select
              value={callType}
              onChange={(e) => setCallType(e.target.value)}
              className="w-full lg:w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              aria-label="Select call type"
            >
              {CALL_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          <button 
            className="w-full sm:w-auto bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-2 cursor-pointer rounded-lg text-sm font-medium shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105"
            aria-label="Download report"
          >
            Download Report
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        {/* Hours Header */}
        <div className="flex mb-2 w-full lg:w-4/5 mx-auto min-w-[600px]" role="row" aria-label="Time slots">
          <div className="w-12"></div>
          <div className="flex-1 flex">
            {HOURS.map((hour, index) => (
              <div
                key={hour}
                className={`flex-1 text-center text-xs ${
                  index >= 7 && index <= 16 ? "text-gray-900 font-medium" : "text-gray-400"
                }`}
              >
                {hour}
              </div>
            ))}
          </div>
        </div>

        {/* Heatmap Grid */}
        <div className="w-full lg:w-4/5 mx-auto min-w-[600px]">
          {DAYS.map((day, dayIndex) => (
            <div key={day} className="flex mb-1">
              <div className={`w-12 text-xs flex items-center ${
                dayIndex >= 5 ? "text-gray-300" : "text-gray-900"
              }`}>
                {day}
              </div>
              <div className="flex-1 flex gap-2">
                {HOURS.map((hour) => (
                  <div
                    key={`${day}-${hour}`}
                    className="flex-1 h-6 lg:h-8 rounded-sm bg-cyan-50 hover:bg-cyan-100 transition-colors cursor-pointer"
                  >
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
          <span className="text-xs text-gray-400">Less Calls</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => (
              <div
                key={level}
                className="w-6 lg:w-8 h-3 lg:h-4 rounded-sm"
                style={{
                  backgroundColor: `rgba(6, 182, 212, ${level * 0.1 + 0.1})`,
                }}
              ></div>
            ))}
          </div>
          <span className="text-xs text-gray-400">More Calls</span>
        </div>
      </div>
    </div>
  );
}

BusyHoursCard.propTypes = {
  defaultNumber: PropTypes.string,
  defaultTeamMember: PropTypes.string,
  defaultCallType: PropTypes.string,
};

export default BusyHoursCard;
