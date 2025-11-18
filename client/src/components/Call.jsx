import React, { useState } from "react";

/**
 * Call component - React + Tailwind
 * - Single-file component named `Call`
 * - Recreates telephony / call hangup UI from the screenshot
 * - Controlled inputs (selects, toggles, sliders, textarea)
 */

export default function Call() {
  const [provider, setProvider] = useState("plivo");

  // Voicemail detection
  const [voicemailDetect, setVoicemailDetect] = useState(false);
  const [voicemailTime, setVoicemailTime] = useState(2.5); // seconds

  // Hangup modes
  const [hangupOnSilence, setHangupOnSilence] = useState(true);
  const [hangupSilenceTime, setHangupSilenceTime] = useState(10); // seconds

  const [hangupByPrompt, setHangupByPrompt] = useState(false);
  const [hangupPrompt, setHangupPrompt] = useState(
    "You are an AI assistant determining if a conversation is complete. A conversation is complete if..."
  );

  // Call hangup message
  const [hangupMessage, setHangupMessage] = useState("Call will now disconnect");

  // Call termination
  const [terminationOption, setTerminationOption] = useState("300");
  const [terminationTime, setTerminationTime] = useState(300);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="bg-white border rounded-lg shadow-sm p-6 space-y-6">
        {/* Telephony Provider */}
        <div>
          <label className="block text-lg font-semibold mb-2">Telephony Provider</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full max-w-xs rounded-md border border-slate-200 px-3 py-2 text-sm bg-white"
          >
            <option value="twilio">Twilio</option>
            <option value="plivo">Plivo</option>
            <option value="bandwidth">Bandwidth</option>
          </select>
        </div>

        <div className="border-t" />

        {/* Voicemail detection */}
        <div className="space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">Voicemail detection</h3>
              <p className="mt-1 text-sm text-slate-500 max-w-xl">
                Time allotted to analyze if the call has been answered by a machine. The default value is 2500 ms.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
              {/* toggle */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600">Enable</span>
                <button
                  onClick={() => setVoicemailDetect((s) => !s)}
                  className={`w-11 h-6 rounded-full p-1 transition-colors ${voicemailDetect ? "bg-blue-600" : "bg-slate-200"}`}
                  aria-pressed={voicemailDetect}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white shadow transform transition-transform ${voicemailDetect ? "translate-x-5" : "translate-x-0"}`}
                  />
                </button>
              </div>

              {/* time slider */}
              <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
                <div className="text-sm font-medium whitespace-nowrap">Time (seconds)</div>
                <div className="flex-1 sm:w-48 flex items-center gap-3">
                  <input
                    type="range"
                    min="0.5"
                    max="10"
                    step="0.1"
                    value={voicemailTime}
                    onChange={(e) => setVoicemailTime(parseFloat(e.target.value))}
                    disabled={!voicemailDetect}
                    className={`w-full ${voicemailDetect ? "accent-blue-600" : "accent-slate-300"}`}
                    aria-label="Voicemail detection time"
                  />
                </div>
                <div className="w-12 text-right text-sm text-slate-600">{voicemailTime.toFixed(1)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t" />

        {/* Call hangup modes */}
        <div className="space-y-5">
          <h3 className="text-lg font-semibold">Call hangup modes</h3>

          {/* Hangup on user silence */}
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 lg:gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="font-medium">Hangup calls on user silence</div>
              </div>
              <div className="text-sm text-slate-500 mt-1">Call will hangup if the user is not speaking</div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
              {/* toggle */}
              <button
                onClick={() => setHangupOnSilence((s) => !s)}
                className={`w-11 h-6 rounded-full p-1 transition-colors ${hangupOnSilence ? "bg-blue-600" : "bg-slate-200"}`}
                aria-pressed={hangupOnSilence}
              >
                <span className={`block w-4 h-4 rounded-full bg-white shadow transform transition-transform ${hangupOnSilence ? "translate-x-5" : "translate-x-0"}`} />
              </button>

              {/* slider */}
              <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <div className="text-sm font-medium whitespace-nowrap">Time (seconds)</div>
                <div className="flex-1 sm:w-60">
                  <input
                    type="range"
                    min="1"
                    max="60"
                    step="1"
                    value={hangupSilenceTime}
                    onChange={(e) => setHangupSilenceTime(parseInt(e.target.value, 10))}
                    disabled={!hangupOnSilence}
                    className={`w-full ${hangupOnSilence ? "accent-blue-600" : "accent-slate-300"}`}
                    aria-label="Silence hangup time"
                  />
                </div>
                <div className="w-10 text-sm text-slate-600 text-right">{hangupSilenceTime}</div>
              </div>
            </div>
          </div>

          {/* Hangup using prompt */}
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 lg:gap-6">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium">Hangup calls using a prompt</div>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="text-sm text-sky-600 underline"
                >
                  See examples
                </a>
              </div>
              <div className="text-sm text-slate-500 mt-1">Call will hangup as per the provided prompt</div>
            </div>

            <div className="w-full lg:w-2/5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <button
                  onClick={() => setHangupByPrompt((s) => !s)}
                  className={`w-11 h-6 rounded-full p-1 transition-colors ${hangupByPrompt ? "bg-blue-600" : "bg-slate-200"}`}
                  aria-pressed={hangupByPrompt}
                >
                  <span className={`block w-4 h-4 rounded-full bg-white shadow transform transition-transform ${hangupByPrompt ? "translate-x-5" : "translate-x-0"}`} />
                </button>
                <div className="text-sm font-medium">Time (seconds)</div>
                <div className="flex items-center gap-2">
                  <div className="w-20 sm:w-28">
                    <input
                      type="range"
                      min="1"
                      max="60"
                      step="1"
                      value={hangupByPrompt ? 5 : 0}
                      onChange={() => {}}
                      disabled
                      className="w-full accent-slate-300"
                      aria-hidden
                    />
                  </div>
                  <div className="w-10 text-sm text-slate-600 text-right">{hangupByPrompt ? 5 : 0}</div>
                </div>
              </div>

              <textarea
                rows={5}
                value={hangupPrompt}
                onChange={(e) => setHangupPrompt(e.target.value)}
                disabled={!hangupByPrompt}
                className={`w-full rounded-md border border-slate-200 px-3 py-2 text-sm resize-none ${hangupByPrompt ? "bg-white" : "bg-slate-50 text-slate-400 cursor-not-allowed"}`}
              />
            </div>
          </div>
        </div>

        <div className="border-t" />

        {/* Call hangup message */}
        <div>
          <h3 className="text-lg font-semibold mb-2">Call hangup message</h3>
          <input
            type="text"
            value={hangupMessage}
            onChange={(e) => setHangupMessage(e.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm max-w-xl"
          />
          <p className="mt-2 text-sm text-slate-500">Provide the final agent message just before hanging up.</p>
        </div>

        <div className="border-t" />

        {/* Call Termination */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 lg:gap-6">
          <div className="flex-1">
            <h3 className="text-lg font-semibold">Call Termination</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-xl">
              Choose when a call should be automatically terminated.
            </p>

            <select
              value={terminationOption}
              onChange={(e) => {
                setTerminationOption(e.target.value);
                setTerminationTime(parseInt(e.target.value, 10));
              }}
              className="mt-3 w-full max-w-md rounded-md border border-slate-200 px-3 py-2 text-sm bg-white"
            >
              <option value="60">The call ends after 60 seconds of call time</option>
              <option value="120">The call ends after 120 seconds of call time</option>
              <option value="180">The call ends after 180 seconds of call time</option>
              <option value="300">The call ends after 300 seconds of call time</option>
              <option value="600">The call ends after 600 seconds of call time</option>
            </select>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 w-full lg:w-auto">
            <div className="text-sm font-medium whitespace-nowrap">Time (seconds)</div>
            <div className="flex-1 sm:w-72">
              <input
                type="range"
                min="30"
                max="600"
                step="10"
                value={terminationTime}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setTerminationTime(v);
                  setTerminationOption(String(v));
                }}
                className="w-full accent-blue-600"
              />
            </div>
            <div className="w-14 text-right text-sm text-slate-600">{terminationTime}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
