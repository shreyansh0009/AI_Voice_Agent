import React, { useState } from "react";
import { BiPlay } from "react-icons/bi";

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

const SliderField = ({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  info = "",
}) => (
  <div className="mb-6">
    <div className="flex items-center justify-between mb-2">
      <label className="block text-xs font-medium">{label}</label>
      <span className="text-xs font-medium text-slate-700">{value}</span>
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
        background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${
          ((value - min) / (max - min)) * 100
        }%, #e2e8f0 ${((value - min) / (max - min)) * 100}%, #e2e8f0 100%)`,
      }}
    />
    {info && <p className="text-xs text-slate-500 mt-2">{info}</p>}
  </div>
);

export default function Audio({
  language,
  onLanguageChange,
  transcriberProvider,
  onTranscriberProviderChange,
  transcriberModel,
  onTranscriberModelChange,
  keywords,
  onKeywordsChange,
  voiceProvider,
  onVoiceProviderChange,
  voiceModel,
  onVoiceModelChange,
  voice,
  onVoiceChange,
  bufferSize,
  onBufferSizeChange,
  speedRate,
  onSpeedRateChange,
}) {
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
    { value: "Tabbly", label: "Tabbly" },
    { value: "ElevenLabs", label: "ElevenLabs" },
    { value: "Google", label: "Google" },
    { value: "Azure", label: "Azure" },
  ];

  // Provider-specific configurations
  const providerConfigs = {
    Sarvam: {
      models: [
        { value: "bulbulv2", label: "bulbulv2" },
        { value: "bulbulv1", label: "bulbulv1" },
      ],
      voices: [
        { value: "anushka", label: "Anushka" },
        { value: "abhilash", label: "Abhilash" },
        { value: "manisha", label: "Manisha" },
        { value: "vidya", label: "Vidya" },
        { value: "arya", label: "Arya" },
        { value: "karun", label: "Karun" },
        { value: "hitesh", label: "Hitesh" },
        { value: "aditya", label: "Aditya" },
        { value: "ritu", label: "Ritu" },
        { value: "chirag", label: "Chirag" },
        { value: "priya", label: "Priya" },
        { value: "neha", label: "Neha" },
        { value: "rahul", label: "Rahul" },
        { value: "pooja", label: "Pooja" },
        { value: "rohan", label: "Rohan" },
        { value: "simran", label: "Simran" },
        { value: "kavya", label: "Kavya" },
        { value: "sunita", label: "Sunita" },
        { value: "tara", label: "Tara" },
        { value: "anirudh", label: "Anirudh" },
        { value: "anjali", label: "Anjali" },
        { value: "ishaan", label: "Ishaan" },
      ],
    },
    Tabbly: {
      models: [{ value: "tabbly-tts", label: "tabbly-tts" }],
      voices: [
        { value: "Riya", label: "Riya" },
        { value: "Ashley", label: "Ashley" },
        { value: "Alex", label: "Alex" },
      ],
    },
    ElevenLabs: {
      models: [
        { value: "eleven_turbo_v2_5", label: "Turbo v2.5 (Fastest)" },
        { value: "eleven_turbo_v2", label: "Turbo v2 (Fast)" },
        {
          value: "eleven_multilingual_v2",
          label: "Multilingual v2 (Best Quality)",
        },
        { value: "eleven_monolingual_v1", label: "Monolingual v1" },
      ],
      voices: [
        {
          value: "1qEiC6qsybMkmnNdVMbK",
          label: "Monika Sogam (Female, Hindi/Indian)",
        },
        { value: "21m00Tcm4TlvDq8ikWAM", label: "Rachel (Female, US)" },
        { value: "pNInz6obpgDQGcFmaJgB", label: "Adam (Male, US)" },
      ],
    },
    Google: {
      models: [
        { value: "standard", label: "Standard" },
        { value: "wavenet", label: "WaveNet" },
        { value: "neural2", label: "Neural2" },
      ],
      voices: [
        { value: "en-US-Standard-A", label: "US Standard A" },
        { value: "en-US-Standard-B", label: "US Standard B" },
        { value: "en-US-Wavenet-A", label: "US Wavenet A" },
        { value: "en-IN-Standard-A", label: "India Standard A" },
      ],
    },
    Azure: {
      models: [
        { value: "neural", label: "Neural" },
        { value: "standard", label: "Standard" },
      ],
      voices: [
        { value: "en-US-AriaNeural", label: "Aria (US)" },
        { value: "en-US-GuyNeural", label: "Guy (US)" },
        { value: "en-IN-NeerjaNeural", label: "Neerja (India)" },
        { value: "hi-IN-SwaraNeural", label: "Swara (Hindi)" },
      ],
    },
  };

  // Get current provider's models and voices
  const currentModels = providerConfigs[voiceProvider]?.models || [];
  const currentVoices = providerConfigs[voiceProvider]?.voices || [];

  // Handle provider change
  const handleProviderChange = (newProvider) => {
    onVoiceProviderChange(newProvider);
    // Set default model and voice for the new provider
    const config = providerConfigs[newProvider];
    if (config) {
      onVoiceModelChange(config.models[0]?.value || "");
      onVoiceChange(config.voices[0]?.value || "");
    }
  };

  const handlePlayVoice = () => {
    console.log("Playing voice sample:", voice);
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">
          Select language and transcriber
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <SelectField
            label="Language"
            value={language}
            onChange={onLanguageChange}
            options={languageOptions}
          />
          <SelectField
            label="Provider"
            value={transcriberProvider}
            onChange={onTranscriberProviderChange}
            options={transcriberProviderOptions}
          />
          <SelectField
            label="Model"
            value={transcriberModel}
            onChange={onTranscriberModelChange}
            options={transcriberModelOptions}
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Keywords</label>
          <input
            type="text"
            value={keywords || ""}
            onChange={(e) => onKeywordsChange(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter keywords..."
          />
          <p className="text-xs text-slate-500 mt-2">
            Enter certain keywords/proper nouns you'd want to boost while
            understanding user speech
          </p>
        </div>
      </div>
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Select voice</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <SelectField
            label="Provider"
            value={voiceProvider}
            onChange={handleProviderChange}
            options={voiceProviderOptions}
          />
          <SelectField
            label="Model"
            value={voiceModel}
            onChange={onVoiceModelChange}
            options={currentModels}
          />
          <div>
            <label className="block text-sm font-medium mb-2">Voice</label>
            <div className="flex gap-2">
              <select
                value={voice}
                onChange={(e) => onVoiceChange(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {currentVoices.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                onClick={handlePlayVoice}
                className="px-3 py-2 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
                title="Play voice sample"
              >
                <BiPlay className="text-xl" />
              </button>
            </div>
            <button className="text-xs text-blue-600 hover:text-blue-700 mt-2 flex items-center gap-1">
              More voices →
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          <SliderField
            label="Buffer Size"
            value={bufferSize}
            onChange={onBufferSizeChange}
            min={50}
            max={500}
            step={1}
            info="Increasing buffer size enables agent to speak long responses fluently, but increases latency"
          />
          <SliderField
            label="Speed rate"
            value={speedRate}
            onChange={onSpeedRateChange}
            min={0.5}
            max={2.0}
            step={0.1}
            info="The speed control feature lets you adjust how fast or slow your agent speaks."
          />
        </div>
      </div>
    </div>
  );
}
