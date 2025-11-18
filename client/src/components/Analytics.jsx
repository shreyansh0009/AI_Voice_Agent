import React, { useState } from "react";

// Analytics component - Tailwind CSS recreation of the provided Post Call Tasks UI
// File: AnalyticsComponent.jsx
// Usage: import Analytics from './AnalyticsComponent.jsx' and render <Analytics />

export default function Analytics() {
  const [summarization, setSummarization] = useState(true);
  const [extraction, setExtraction] = useState(false);
  const [extractionPrompt, setExtractionPrompt] = useState(
    `user_name : Yield the name of the user.
payment_mode : If user is paying by cash, yield cash. If they are paying by card yield card. Else yield NA`
  );

  const [customAnalytics, setCustomAnalytics] = useState([]);
  const [newAnalyticsName, setNewAnalyticsName] = useState("");

  const [analyticsQuickEnabled, setAnalyticsQuickEnabled] = useState(false);
  const [analyticsType, setAnalyticsType] = useState("Realtime");

  const [webhookUrl, setWebhookUrl] = useState("");

  function addCustomAnalytics() {
    if (!newAnalyticsName.trim()) return;
    setCustomAnalytics((s) => [...s, { id: Date.now(), name: newAnalyticsName.trim() }]);
    setNewAnalyticsName("");
  }

  function removeCustomAnalytics(id) {
    setCustomAnalytics((s) => s.filter((c) => c.id !== id));
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8 flex items-start justify-center">
      <div className="w-full max-w-4xl">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-2xl font-semibold text-gray-900">Post call tasks</h2>
          <p className="mt-1 text-sm text-gray-500">Choose tasks to get executed after the agent conversation is complete</p>

          <div className="mt-6 flex flex-col sm:grid sm:grid-cols-12 gap-4 sm:items-center">
            <div className="sm:col-span-9">
              <div className="font-medium text-gray-800">Summarization</div>
              <div className="text-sm text-gray-500">Generate a summary of the conversation automatically.</div>
            </div>
            <div className="sm:col-span-3 flex justify-start sm:justify-end">
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only" checked={summarization} onChange={(e) => setSummarization(e.target.checked)} />
                <div className={`w-12 h-6 rounded-full shadow-inner transition ${summarization ? 'bg-blue-400' : 'bg-gray-200'}`}></div>
              </label>
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:grid sm:grid-cols-12 gap-4 sm:items-start">
            <div className="sm:col-span-9">
              <div className="font-medium text-gray-800">Extraction</div>
              <div className="text-sm text-gray-500">Extract structured information from the conversation according to a custom prompt provided</div>
            </div>
            <div className="sm:col-span-3 flex justify-start sm:justify-end">
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only" checked={extraction} onChange={(e) => setExtraction(e.target.checked)} />
                <div className={`w-12 h-6 rounded-full shadow-inner transition ${extraction ? 'bg-blue-400' : 'bg-gray-200'}`}></div>
              </label>
            </div>
          </div>

          <div className="mt-4 flex flex-col sm:grid sm:grid-cols-12 gap-4">
            <div className="sm:col-span-9">
              <textarea
                className="w-full rounded-md border border-gray-100 p-4 text-sm text-gray-600 resize-none"
                rows={4}
                value={extractionPrompt}
                onChange={(e) => setExtractionPrompt(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-8">
            <h3 className="text-lg font-semibold text-gray-900">Custom Analytics <span className="text-sm text-gray-400 block sm:inline">Post call tasks to extract data from the call</span></h3>

            <div className="mt-4 flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
                <input
                  type="text"
                  placeholder="New analytics name"
                  value={newAnalyticsName}
                  onChange={(e) => setNewAnalyticsName(e.target.value)}
                  className="rounded-md border p-2 text-sm w-full sm:flex-1 sm:max-w-xs"
                />
                <button onClick={addCustomAnalytics} className="px-4 py-2 rounded-md border bg-white text-sm whitespace-nowrap">+ Add</button>
              </div>

              <div className="flex items-center gap-3">
                <label className="inline-flex items-center text-sm text-gray-700 gap-2">
                  <input type="checkbox" checked={analyticsQuickEnabled} onChange={(e) => setAnalyticsQuickEnabled(e.target.checked)} />
                  Enable Analytics
                </label>
              </div>
            </div>

            {customAnalytics.length > 0 && (
              <ul className="mt-4 space-y-2">
                {customAnalytics.map((c) => (
                  <li key={c.id} className="flex items-center justify-between rounded-md border p-3">
                    <div className="text-sm text-gray-700">{c.name}</div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => removeCustomAnalytics(c.id)} className="text-sm text-red-500">Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {analyticsQuickEnabled && (
              <div className="mt-4 flex flex-col sm:grid sm:grid-cols-12 gap-4 sm:items-center">
                <div className="sm:col-span-9">
                  <div className="text-sm text-gray-600">Analytics type</div>
                  <select value={analyticsType} onChange={(e) => setAnalyticsType(e.target.value)} className="mt-2 w-full rounded-md border p-3 text-sm">
                    <option>Realtime</option>
                    <option>Batch</option>
                    <option>Custom</option>
                  </select>
                </div>
                <div className="sm:col-span-3 flex justify-start sm:justify-end">
                  <button className="w-full sm:w-auto px-4 py-2 rounded-lg bg-green-50 border text-sm">Add Analytics</button>
                </div>
              </div>
            )}

          </div>

          <div className="mt-8 flex flex-col sm:grid sm:grid-cols-12 gap-4 sm:items-center border-t pt-6">
            <div className="sm:col-span-9">
              <div className="font-medium text-gray-800">Push all execution data to webhook <a className="text-blue-600 underline">See all events</a></div>
              <div className="text-sm text-gray-500">Automatically receive all execution data for this agent using webhook</div>
            </div>
            <div className="sm:col-span-3 flex justify-start sm:justify-end">
              <input type="text" placeholder="Your webhook URL" className="w-full rounded-md border p-3 text-sm" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
            </div>
          </div>

          <div className="mt-6 text-sm text-gray-500">
            <strong className="text-gray-700">Note:</strong> This component is a UI-only React/Tailwind implementation called <em>Analytics</em>. Wire the handlers to your backend or state as needed.
          </div>
        </div>
      </div>
    </div>
  );
}
