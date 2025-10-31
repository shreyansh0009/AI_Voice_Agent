import { useState } from "react";
import PropTypes from "prop-types";

function PostCallSurveyCard({ data, columns }) {
  const [activeTab, setActiveTab] = useState("phoneNumbers");

  return (
    <div className="bg-white rounded-lg lg:rounded-xl shadow-sm lg:shadow-lg border border-gray-200 p-4 lg:p-6 hover:shadow-xl transition-shadow duration-300">
      <div className="mb-4">
        <h3 className="text-base lg:text-lg font-semibold text-gray-800 mb-4">Post Call Survey</h3>
        
        <div className="flex flex-wrap gap-2 lg:gap-4 mb-4">
          <button
            onClick={() => setActiveTab("phoneNumbers")}
            className={`flex items-center gap-2 px-3 lg:px-4 py-2 cursor-pointer rounded-full text-xs lg:text-sm font-medium transition-all ${
              activeTab === "phoneNumbers"
                ? "bg-green-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            aria-label="View phone numbers"
            aria-pressed={activeTab === "phoneNumbers"}
          >
            <span className={`w-2 h-2 rounded-full ${activeTab === "phoneNumbers" ? "bg-white" : "bg-green-500"}`}></span>
            Phone Numbers
          </button>
          <button
            onClick={() => setActiveTab("teamMembers")}
            className={`px-3 lg:px-4 py-2 rounded-full text-xs lg:text-sm cursor-pointer font-medium transition-all ${
              activeTab === "teamMembers"
                ? "bg-green-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            aria-label="View team members"
            aria-pressed={activeTab === "teamMembers"}
          >
            Team Members
          </button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 lg:mx-0">
        <table className="w-full min-w-[400px]">
          <thead>
            <tr className="border-b border-gray-200">
              {columns.map((column) => (
                <th
                  key={column.key || column.header}
                  className="text-left py-2 px-4 text-xs lg:text-sm font-semibold text-gray-700"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr
                key={row.id || rowIndex}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
              >
                {columns.map((column) => (
                  <td key={column.key || column.header} className="py-3 px-4 text-xs lg:text-sm text-gray-700">
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

PostCallSurveyCard.propTypes = {
  data: PropTypes.arrayOf(PropTypes.object).isRequired,
  columns: PropTypes.arrayOf(
    PropTypes.shape({
      header: PropTypes.string.isRequired,
      key: PropTypes.string,
      render: PropTypes.func,
    })
  ).isRequired,
};

export default PostCallSurveyCard;
