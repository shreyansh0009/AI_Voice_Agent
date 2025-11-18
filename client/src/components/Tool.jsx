import React, { useState } from "react";

export default function Tool() {
  const [selectedFunction, setSelectedFunction] = useState("");

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div>
        <div className="flex items-baseline gap-2 mb-2">
          <h1 className="text-base font-semibold text-gray-900">
            Function Tools for LLM Models
          </h1>
          <a
            href="#"
            className="text-xs text-blue-600 hover:text-blue-700 underline"
          >
            See examples and learn more
          </a>
        </div>
        <p className="text-xs text-gray-600 leading-relaxed">
          Connect external tools or APIs that your language model can call during conversations.
          This allows the LLM to retrieve real-time data, perform calculations, or trigger actions dynamically.
        </p>
      </div>

      {/* Choose Functions Section */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Choose functions</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={selectedFunction}
            onChange={(e) => setSelectedFunction(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select functions</option>
            <option value="check-slot">Check slot availability (using Cal.com)</option>
            <option value="book-appointments">Book appointments (using Cal.com)</option>
            <option value="transfer-call">Transfer call to a human agent</option>
            <option value="custom">Add your own custom function</option>
          </select>
          <button
            type="button"
            className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Add function
          </button>
        </div>
      </div>
    </div>
  );
}
