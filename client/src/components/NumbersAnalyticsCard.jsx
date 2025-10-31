import PropTypes from "prop-types";

function NumbersAnalyticsCard({ title, searchPlaceholder, data, columns }) {
  return (
    <div className="bg-white rounded-lg lg:rounded-xl shadow-sm lg:shadow-lg border border-gray-200 p-4 lg:p-6 hover:shadow-xl transition-shadow duration-300">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 lg:mb-6 gap-3">
        <h3 className="text-base lg:text-lg font-semibold text-gray-800">{title}</h3>
        <input
          type="text"
          placeholder={searchPlaceholder}
          className="w-full sm:w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
          aria-label={`Search ${title.toLowerCase()}`}
        />
      </div>

      <div className="overflow-x-auto -mx-4 lg:mx-0">
        <table className="w-full min-w-[500px]">
          <thead>
            <tr className="border-b border-gray-200">
              {columns.map((column) => (
                <th
                  key={column.key || column.header}
                  className="text-left py-3 px-4 text-xs lg:text-sm font-semibold text-gray-700"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-gray-400 text-sm">
                  No data available
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => (
                <tr
                  key={row.id || rowIndex}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  {columns.map((column) => (
                    <td key={column.key || column.header} className="py-3 lg:py-4 px-4 text-xs lg:text-sm text-gray-700">
                      {column.render ? column.render(row) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

NumbersAnalyticsCard.propTypes = {
  title: PropTypes.string.isRequired,
  searchPlaceholder: PropTypes.string.isRequired,
  data: PropTypes.arrayOf(PropTypes.object).isRequired,
  columns: PropTypes.arrayOf(
    PropTypes.shape({
      header: PropTypes.string.isRequired,
      key: PropTypes.string,
      render: PropTypes.func,
    })
  ).isRequired,
};

export default NumbersAnalyticsCard;
