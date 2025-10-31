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
    <div className="min-h-screen bg-gray-50 p-8 flex items-start justify-center">
      <div className="w-full max-w-5xl bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Transcription & interruptions</h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left big card */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Generate precise transcript</h3>
                <p className="text-sm text-gray-500 mt-1">Agent will try to generate more precise transcripts during interruptions</p>
                <a className="text-sm text-blue-600 mt-3 inline-block hover:underline" href="#">Learn more</a>
              </div>

              {/* Toggle aligned to top-right like the image */}
              <div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={generatePrecise}
                    onChange={() => setGeneratePrecise(v => !v)}
                  />
                  <div className={`w-14 h-8 rounded-full transition-colors ${generatePrecise ? 'bg-blue-600' : 'bg-gray-200'}`} />
                  <span className={`absolute left-1 top-1 w-6 h-6 bg-white rounded-full shadow transform transition-transform ${generatePrecise ? 'translate-x-6' : 'translate-x-0'}`} />
                </label>
              </div>
            </div>

            <hr className="my-5 border-gray-100" />

            <div>
              <h4 className="text-sm font-medium text-gray-800">Number of words to wait for before interrupting</h4>
              <div className="mt-3 flex items-center gap-4">
                <input
                  aria-label="words to wait"
                  type="range"
                  min={0}
                  max={20}
                  value={wordsToWait}
                  onChange={(e) => setWordsToWait(Number(e.target.value))}
                  className="slider h-2 rounded-full appearance-none"
                  style={wordsBg}
                />

                {/* number bubble to the right like screenshot */}
                <div className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-50 border border-blue-100 text-blue-700 font-semibold">{wordsToWait}</div>
              </div>

              <p className="text-sm text-gray-500 mt-3">Agent will not consider interruptions until these many words are spoken. If recipient says stopwords such as "Stop", "Wait", "Hold On", agent will pause by default.</p>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h4 className="text-base font-semibold text-gray-900">Voice Response Rate Configuration</h4>
              <label className="block text-sm text-gray-600 mt-4">Response Rate</label>

              <div className="mt-3">
                <select
                  value={responseRate}
                  onChange={(e) => setResponseRate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 bg-white text-gray-800 shadow-sm"
                >
                  <option>Rapid</option>
                  <option>Normal</option>
                  <option>Slow</option>
                </select>

                <div className="mt-4 rounded-md bg-gray-50 p-3 text-gray-700 text-sm">Agent will try to answer with minimum latency, often interrupting humans if they are speaking with pauses</div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h4 className="text-base font-semibold text-gray-900 mb-4">User Online Detection</h4>

              <div className="flex items-start justify-between">
                <div>
                  <h5 className="font-medium text-gray-900">Check if user is online</h5>
                  <p className="text-sm text-gray-500">Agent will check if the user is online if there's no reply from the user</p>
                </div>

                <div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checkUserOnline}
                      onChange={() => setCheckUserOnline(v => !v)}
                    />
                    <div className={`w-14 h-8 rounded-full transition-colors ${checkUserOnline ? 'bg-blue-600' : 'bg-gray-200'}`} />
                    <span className={`absolute left-1 top-1 w-6 h-6 bg-white rounded-full shadow transform transition-transform ${checkUserOnline ? 'translate-x-6' : 'translate-x-0'}`} />
                  </label>
                </div>
              </div>

              <div className="mt-5 bg-gray-50 rounded-lg border border-gray-100 p-4">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">User is online message</label>
                    <input
                      type="text"
                      value={userOnlineMessage}
                      onChange={(e) => setUserOnlineMessage(e.target.value)}
                      className="mt-2 block w-full rounded-md border border-gray-200 px-3 py-2 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Invoke message after (seconds)</label>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        aria-label="invoke after"
                        type="range"
                        min={0}
                        max={60}
                        value={invokeAfter}
                        onChange={(e) => setInvokeAfter(Number(e.target.value))}
                        className="slider h-2 rounded-full appearance-none"
                        style={invokeBg}
                      />
                      <div className="w-12 text-right font-semibold text-gray-700">{invokeAfter}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-end gap-3">
          <button className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-gray-700">Cancel</button>
          <button className="px-4 py-2 rounded-lg bg-blue-600 text-white">Save settings</button>
        </div>

        {/* component-scoped styles to better match the screenshot's sliders and toggles */}
        <style>{`
          .slider::-webkit-slider-runnable-track {
            height: 6px;
            border-radius: 999px;
          }
          .slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: white;
            border: 3px solid #2563eb;
            margin-top: -6px; /* center thumb */
            box-shadow: 0 1px 2px rgba(0,0,0,0.08);
          }
          .slider:focus { outline: none; }
          /* Firefox */
          .slider::-moz-range-track { height: 6px; border-radius: 999px; }
          .slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: white; border: 3px solid #2563eb; }
        `}</style>
      </div>
    </div>
  );
}
