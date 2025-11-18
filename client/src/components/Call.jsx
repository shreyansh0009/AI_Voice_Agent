import React, { useState } from "react";

export default function Call() {
  const [provider, setProvider] = useState("Plivo");
  const [dtmfEnabled, setDtmfEnabled] = useState(false);
  const [voicemailTime, setVoicemailTime] = useState(2.5);
  const [hangupOnSilence, setHangupOnSilence] = useState(true);
  const [hangupSilenceTime, setHangupSilenceTime] = useState(15);
  const [hangupByPrompt, setHangupByPrompt] = useState(true);
  const [hangupPrompt, setHangupPrompt] = useState(
    "You are an AI assistant that determines whether a conversation is complete based on the transcript. A conversation is considered complete if any of the following conditions are met:"
  );
  const [hangupMessage, setHangupMessage] = useState("Call will now disconnect");
  const [terminationTime, setTerminationTime] = useState(400);

  return (
    <div className="w-full space-y-6">
      {/* Telephony Provider */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Telephony Provider</label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full max-w-xs rounded-md border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="Plivo">Plivo</option>
          <option value="Twilio">Twilio</option>
          <option value="Bandwidth">Bandwidth</option>
        </select>
      </div>

      <div className="border-t border-gray-200"></div>

      {/* Enable DTMF */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Enable DTMF</h3>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700 mb-1">Allow caller to interact using keypad inputs</p>
            <p className="text-xs text-gray-500">
              When enabled, the agent can detect keypad tones pressed by the caller during the call.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={dtmfEnabled}
              onChange={(e) => setDtmfEnabled(e.target.checked)}
            />
            <div className={`w-11 h-6 rounded-full transition-colors ${dtmfEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}>
              <span className={`block w-5 h-5 bg-white rounded-full shadow transform transition-transform ${dtmfEnabled ? 'translate-x-6' : 'translate-x-0.5'} translate-y-0.5`} />
            </div>
          </label>
        </div>
      </div>

      <div className="border-t border-gray-200"></div>

      {/* Voicemail detection */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Voicemail detection</h3>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700 mb-1">Automatically disconnect call on voicemail detection</p>
            <p className="text-xs text-gray-500">
              Time allotted to analyze if the call has been answered by a machine. The default value is 2500 ms.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 shrink-0">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={dtmfEnabled}
                onChange={(e) => setDtmfEnabled(e.target.checked)}
              />
              <div className={`w-11 h-6 rounded-full transition-colors ${dtmfEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}>
                <span className={`block w-5 h-5 bg-white rounded-full shadow transform transition-transform ${dtmfEnabled ? 'translate-x-6' : 'translate-x-0.5'} translate-y-0.5`} />
              </div>
            </label>
            <div className="flex items-center gap-3 min-w-[250px]">
              <span className="text-xs text-gray-700 whitespace-nowrap">Time (seconds)</span>
              <input
                type="range"
                min="0.5"
                max="10"
                step="0.1"
                value={voicemailTime}
                onChange={(e) => setVoicemailTime(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((voicemailTime - 0.5) / 9.5) * 100}%, #e5e7eb ${((voicemailTime - 0.5) / 9.5) * 100}%, #e5e7eb 100%)`
                }}
              />
              <span className="text-sm font-semibold text-gray-900 w-8 text-right">{voicemailTime.toFixed(1)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200"></div>

      {/* Call hangup modes */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Call hangup modes</h3>
        
        {/* Hangup on user silence */}
        <div className="mb-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700 mb-1">Hangup calls on user silence</p>
              <p className="text-xs text-gray-500">Call will hangup if the user is not speaking</p>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 shrink-0">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={hangupOnSilence}
                  onChange={(e) => setHangupOnSilence(e.target.checked)}
                />
                <div className={`w-11 h-6 rounded-full transition-colors ${hangupOnSilence ? 'bg-blue-600' : 'bg-gray-200'}`}>
                  <span className={`block w-5 h-5 bg-white rounded-full shadow transform transition-transform ${hangupOnSilence ? 'translate-x-6' : 'translate-x-0.5'} translate-y-0.5`} />
                </div>
              </label>
              <div className="flex items-center gap-3 min-w-[250px]">
                <span className="text-xs text-gray-700 whitespace-nowrap">Time (seconds)</span>
                <input
                  type="range"
                  min="1"
                  max="60"
                  step="1"
                  value={hangupSilenceTime}
                  onChange={(e) => setHangupSilenceTime(parseInt(e.target.value))}
                  disabled={!hangupOnSilence}
                  className="flex-1 h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600"
                  style={{
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(hangupSilenceTime / 60) * 100}%, #e5e7eb ${(hangupSilenceTime / 60) * 100}%, #e5e7eb 100%)`
                  }}
                />
                <span className="text-sm font-semibold text-gray-900 w-8 text-right">{hangupSilenceTime}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Hangup using a prompt */}
        <div>
          <div className="flex flex-col lg:flex-row lg:items-start gap-4 mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium text-gray-700">Hangup calls using a prompt</p>
                <a href="#" className="text-xs text-blue-600 hover:underline">See examples ↗</a>
              </div>
              <p className="text-xs text-gray-500">Call will hangup as per the provided prompt</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={hangupByPrompt}
                onChange={(e) => setHangupByPrompt(e.target.checked)}
              />
              <div className={`w-11 h-6 rounded-full transition-colors ${hangupByPrompt ? 'bg-blue-600' : 'bg-gray-200'}`}>
                <span className={`block w-5 h-5 bg-white rounded-full shadow transform transition-transform ${hangupByPrompt ? 'translate-x-6' : 'translate-x-0.5'} translate-y-0.5`} />
              </div>
            </label>
          </div>
          <textarea
            rows={4}
            value={hangupPrompt}
            onChange={(e) => setHangupPrompt(e.target.value)}
            disabled={!hangupByPrompt}
            placeholder="You are an AI assistant that determines whether a conversation is complete based on the transcript. A conversation is considered complete if any of the following conditions are met:"
            className={`w-full rounded-md border border-gray-200 px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 ${!hangupByPrompt ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-900'}`}
          />
        </div>
      </div>

      <div className="border-t border-gray-200"></div>

      {/* Call hangup message */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Call hangup message</h3>
        <input
          type="text"
          value={hangupMessage}
          onChange={(e) => setHangupMessage(e.target.value)}
          placeholder="Call will now disconnect"
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-2 text-xs text-gray-500">Provide the final agent message just before hanging up.</p>
      </div>

      <div className="border-t border-gray-200"></div>

      {/* Call Termination */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Call Termination</h3>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex-1">
            <select
              value={terminationTime}
              onChange={(e) => setTerminationTime(parseInt(e.target.value))}
              className="w-full max-w-md rounded-md border border-gray-200 px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={60}>The call ends after 60 seconds of call time</option>
              <option value={120}>The call ends after 120 seconds of call time</option>
              <option value={180}>The call ends after 180 seconds of call time</option>
              <option value={300}>The call ends after 300 seconds of call time</option>
              <option value={400}>The call ends after 400 seconds of call time</option>
              <option value={600}>The call ends after 600 seconds of call time</option>
            </select>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0 min-w-[250px]">
            <span className="text-xs text-gray-700 whitespace-nowrap mt-2">Time (seconds)</span>
            <div className="flex items-center gap-3 flex-1 w-full sm:w-auto mt-2">
              <input
                type="range"
                min="30"
                max="600"
                step="10"
                value={terminationTime}
                onChange={(e) => setTerminationTime(parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((terminationTime - 30) / 570) * 100}%, #e5e7eb ${((terminationTime - 30) / 570) * 100}%, #e5e7eb 100%)`
                }}
              />
              <span className="text-sm font-semibold text-gray-900 w-8 text-right">{terminationTime}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
