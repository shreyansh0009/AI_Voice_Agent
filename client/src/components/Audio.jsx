import React, { useState } from "react";
import { BiPlay } from 'react-icons/bi';

const SelectField = ({ label, value, onChange, options = [] }) => (
  <div className="mb-4">
    <label className="block text-sm font-medium mb-2">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {options.map((opt) => (
        <option key={opt.value ?? opt} value={opt.value ?? opt}>
          {opt.label ?? opt}
        </option>
      ))}
    </select>
  </div>
);

const SliderField = ({ label, value, onChange, min = 0, max = 1, step = 0.01, info = "" }) => (
  <div className="mb-6">
    <div className="flex items-center justify-between mb-2">
      <label className="block text-sm font-medium">{label}</label>
      <span className="text-sm font-medium text-slate-700">{value}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-2 rounded-lg appearance-none cursor-pointer"
      style={{
        background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((value - min) / (max - min)) * 100}%, #e2e8f0 ${((value - min) / (max - min)) * 100}%, #e2e8f0 100%)`
      }}
    />
    {info && (
      <p className="text-xs text-slate-500 mt-2">{info}</p>
    )}
  </div>
);

export default function Audio() {
  const [language, setLanguage] = useState("English (India)");
  const [transcriberProvider, setTranscriberProvider] = useState("Deepgram");
  const [transcriberModel, setTranscriberModel] = useState("nova-2");
  const [keywords, setKeywords] = useState("Bruce:100");
  const [voiceProvider, setVoiceProvider] = useState("Sarvam");
  const [voiceModel, setVoiceModel] = useState("bulbulv2");
  const [voice, setVoice] = useState("Abhilash");
  const [bufferSize, setBufferSize] = useState("153");
  const [speedRate, setSpeedRate] = useState("0.8");

  const languageOptions = [
    { value: "English (India)", label: "English (India)" },
    { value: "English (US)", label: "English (US)" },
    { value: "English (UK)", label: "English (UK)" },
    { value: "Hindi", label: "Hindi" },
    { value: "Spanish", label: "Spanish" },
  ];

  const transcriberProviderOptions = [
    { value: "Deepgram", label: "Deepgram" },
    { value: "AssemblyAI", label: "AssemblyAI" },
    { value: "Google", label: "Google" },
  ];

  const transcriberModelOptions = [
    { value: "nova-2", label: "nova-2" },
    { value: "nova", label: "nova" },
    { value: "base", label: "base" },
  ];

  const voiceProviderOptions = [
    { value: "Sarvam", label: "Sarvam" },
    { value: "ElevenLabs", label: "ElevenLabs" },
    { value: "Google", label: "Google" },
    { value: "Azure", label: "Azure" },
  ];

  const voiceModelOptions = [
    { value: "bulbulv2", label: "bulbulv2" },
    { value: "bulbulv1", label: "bulbulv1" },
    { value: "standard", label: "standard" },
  ];

  const voiceOptions = [
    { value: "Abhilash", label: "Abhilash" },
    { value: "Aarav", label: "Aarav" },
    { value: "Aditi", label: "Aditi" },
    { value: "Ananya", label: "Ananya" },
  ];

  const handlePlayVoice = () => {
    console.log("Playing voice sample:", voice);
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Select language and transcriber</h2>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <SelectField label="Language" value={language} onChange={setLanguage} options={languageOptions} />
          <SelectField label="Provider" value={transcriberProvider} onChange={setTranscriberProvider} options={transcriberProviderOptions} />
          <SelectField label="Model" value={transcriberModel} onChange={setTranscriberModel} options={transcriberModelOptions} />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Keywords</label>
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter keywords..."
          />
          <p className="text-xs text-slate-500 mt-2">
            Enter certain keywords/proper nouns you'd want to boost while understanding user speech
          </p>
        </div>
      </div>
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Select voice</h2>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <SelectField label="Provider" value={voiceProvider} onChange={setVoiceProvider} options={voiceProviderOptions} />
          <SelectField label="Model" value={voiceModel} onChange={setVoiceModel} options={voiceModelOptions} />
          <div>
            <label className="block text-sm font-medium mb-2">Voice</label>
            <div className="flex gap-2">
              <select
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {voiceOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button onClick={handlePlayVoice} className="px-3 py-2 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors" title="Play voice sample">
                <BiPlay className="text-xl" />
              </button>
            </div>
            <button className="text-xs text-blue-600 hover:text-blue-700 mt-2 flex items-center gap-1">More voices →</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-8">
          <SliderField label="Buffer Size" value={bufferSize} onChange={setBufferSize} min={50} max={500} step={1} info="Increasing buffer size enables agent to speak long responses fluently, but increases latency" />
          <SliderField label="Speed rate" value={speedRate} onChange={setSpeedRate} min={0.5} max={2.0} step={0.1} info="The speed control feature lets you adjust how fast or slow your agent speaks." />
        </div>
      </div>
    </div>
  );
}
