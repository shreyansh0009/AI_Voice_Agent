import React, { useState } from "react";

export default function Analytics() {
  const [summarization, setSummarization] = useState(false);
  const [extraction, setExtraction] = useState(false);
  const [extractionPrompt, setExtractionPrompt] = useState(
    `user_name : Yield the name of the user.\n    payment_mode : If user is paying by cash, yield cash. If they are paying by card yield...`
  );
  const [webhookUrl, setWebhookUrl] = useState("");

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-1">Post call tasks</h2>
        <p className="text-xs text-gray-600">
          Choose tasks to get executed after the agent conversation is complete
        </p>
      </div>

      {/* Summarization Section */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Summarization</h3>
          <p className="text-xs text-gray-600">
            Generate a summary of the conversation automatically.
          </p>
        </div>
        <button
          onClick={() => setSummarization(!summarization)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            summarization ? "bg-blue-600" : "bg-gray-200"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              summarization ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {/* Extraction Section */}
      <div>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Extraction</h3>
            <p className="text-xs text-gray-600">
              Extract structured information from the conversation according to a custom prompt provided
            </p>
          </div>
          <button
            onClick={() => setExtraction(!extraction)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              extraction ? "bg-blue-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                extraction ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        <textarea
          value={extractionPrompt}
          onChange={(e) => setExtractionPrompt(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          rows={4}
          placeholder="Enter extraction prompt..."
        />
      </div>

      {/* Custom Analytics Section */}
      <div>
        <div className="mb-3">
          <h3 className="text-base font-semibold text-gray-900">Custom Analytics</h3>
          <p className="text-xs text-gray-600">Post call tasks to extract data from the call</p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
          <span className="text-lg leading-none">+</span>
          Extract custom analytics
        </button>
      </div>

      {/* Push all execution data to webhook Section */}
      <div>
        <div className="flex items-baseline gap-2 mb-1">
          <h3 className="text-sm font-semibold text-gray-900">Push all execution data to webhook</h3>
          <a
            href="#"
            className="text-xs text-blue-600 hover:text-blue-700 underline"
          >
            See all events
          </a>
        </div>
        <p className="text-xs text-gray-600 mb-3">
          Automatically receive all execution data for this agent using webhook
        </p>
        <input
          type="text"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="Your webhook URL"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    </div>
  );
}
