import React, { useState, useMemo } from "react";

export default function Engine() {
  const [generatePrecise, setGeneratePrecise] = useState(false);
  const [wordsToWait, setWordsToWait] = useState(2);
  const [responseRate, setResponseRate] = useState("Rapid");
  const [checkUserOnline, setCheckUserOnline] = useState(true);
  const [userOnlineMessage, setUserOnlineMessage] = useState("Hey, are you still there");
  const [invokeAfter, setInvokeAfter] = useState(10);

  // helpers to create dynamic slider background like the screenshot
  const wordsBg = useMemo(() => {
    const pct = Math.round((wordsToWait / 20) * 100);
    return { background: `linear-gradient(90deg, #2563eb ${pct}%, #e6eefc ${pct}%)` };
  }, [wordsToWait]);

  const invokeBg = useMemo(() => {
    const pct = Math.round((invokeAfter / 60) * 100);
    return { background: `linear-gradient(90deg, #2563eb ${pct}%, #e6eefc ${pct}%)` };
  }, [invokeAfter]);

  return (
    <div className="w-full">
      <div className="space-y-6">
        {/* Transcription & interruptions Section */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
          <h2 className="text-sm sm:text-base font-semibold text-gray-900 mb-6">Transcription & interruptions</h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Generate precise transcript */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-900">Generate precise transcript</h3>
                  <p className="text-xs text-gray-500 mt-1">Agent will try to generate more precise transcripts during interruptions</p>
                  <a className="text-xs text-blue-600 mt-2 inline-block hover:underline" href="#">Learn more ↗</a>
                </div>

                <div className="shrink-0">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={generatePrecise}
                      onChange={() => setGeneratePrecise(v => !v)}
                    />
                    <div className={`w-11 h-6 rounded-full transition-colors ${generatePrecise ? 'bg-blue-600' : 'bg-gray-300'}`} />
                    <span className={`absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform ${generatePrecise ? 'translate-x-5' : 'translate-x-0'}`} />
                  </label>
                </div>
              </div>
            </div>

            {/* Number of words to wait */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-gray-800">Number of words to wait for before interrupting</h4>
                <div className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 text-gray-700 font-semibold text-xs">{wordsToWait}</div>
              </div>
              
              <input
                aria-label="words to wait"
                type="range"
                min={0}
                max={20}
                value={wordsToWait}
                onChange={(e) => setWordsToWait(Number(e.target.value))}
                className="slider w-full h-2 rounded-full appearance-none"
                style={wordsBg}
              />

              <p className="text-xs text-gray-500">Agent will not consider interruptions until 3 words are spoken (if recipient says "Stopwords" such as Stop, Wait, Hold On, agent will pause by default)</p>
            </div>
          </div>
        </div>

        {/* Voice Response Rate Configuration */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
          <h2 className="text-sm sm:text-base font-semibold text-gray-900 mb-6">Voice Response Rate Configuration</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Response Rate */}
            <div className="space-y-3">
              <label className="block text-xs font-medium text-gray-800">Response Rate</label>
              <select
                value={responseRate}
                onChange={(e) => setResponseRate(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 bg-white text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option>Custom</option>
                <option>Rapid</option>
                <option>Normal</option>
                <option>Slow</option>
              </select>
            </div>

            {/* Endpointing (in ms) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-800">Endpointing (in ms)</label>
                <span className="text-xs font-semibold text-gray-700">250</span>
              </div>
              <input
                aria-label="endpointing"
                type="range"
                min={0}
                max={1000}
                defaultValue={250}
                className="slider w-full h-2 rounded-full appearance-none"
                style={{ background: 'linear-gradient(90deg, #2563eb 25%, #e6eefc 25%)' }}
              />
              <p className="text-xs text-gray-500">Number of milliseconds your agent will wait before generating response.</p>
            </div>

            {/* Linear delay (in ms) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-800">Linear delay (in ms)</label>
                <span className="text-xs font-semibold text-gray-700">500</span>
              </div>
              <input
                aria-label="linear delay"
                type="range"
                min={0}
                max={1000}
                defaultValue={500}
                className="slider w-full h-2 rounded-full appearance-none"
                style={{ background: 'linear-gradient(90deg, #2563eb 50%, #e6eefc 50%)' }}
              />
              <p className="text-xs text-gray-500">Linear delay accounts for long pauses mid-sentence.</p>
            </div>
          </div>
        </div>

        {/* User Online Detection */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
          <h2 className="text-sm sm:text-base font-semibold text-gray-900 mb-6">User Online Detection</h2>

          <div className="space-y-6">
            {/* Check if user is online */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-gray-200">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-900">Check if user is online</h3>
                <p className="text-xs text-gray-500 mt-1">Agent will check if the user is online if there's no reply from the user</p>
              </div>

              <div className="shrink-0">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checkUserOnline}
                    onChange={() => setCheckUserOnline(v => !v)}
                  />
                  <div className={`w-11 h-6 rounded-full transition-colors ${checkUserOnline ? 'bg-blue-600' : 'bg-gray-300'}`} />
                  <span className={`absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform ${checkUserOnline ? 'translate-x-5' : 'translate-x-0'}`} />
                </label>
              </div>
            </div>

            {/* User is online message and invoke after */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-800">User is online message</label>
                <input
                  type="text"
                  value={userOnlineMessage}
                  onChange={(e) => setUserOnlineMessage(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-800">Invoke message after (seconds)</label>
                  <span className="text-xs font-semibold text-gray-700">{invokeAfter}</span>
                </div>
                <input
                  aria-label="invoke after"
                  type="range"
                  min={0}
                  max={60}
                  value={invokeAfter}
                  onChange={(e) => setInvokeAfter(Number(e.target.value))}
                  className="slider w-full h-2 rounded-full appearance-none"
                  style={invokeBg}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* component-scoped styles to better match the screenshot's sliders and toggles */}
      <style>{`
        .slider::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 999px;
        }
        .slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          border: 2px solid #2563eb;
          margin-top: -5px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.08);
          cursor: pointer;
        }
        .slider:focus { outline: none; }
        .slider::-moz-range-track { height: 6px; border-radius: 999px; }
        .slider::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: white; border: 2px solid #2563eb; cursor: pointer; }
      `}</style>
    </div>
  );
}
