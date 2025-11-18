import React, { useState } from "react";

/**
 * LLM tab content (separate file)
 * - Exports default LLM component
 * - Manages its own dropdown states and preview
 * - Used inside AgentSetupSingle when LLM tab is active
 */

const SelectField = ({ label, value, onChange, options = [], className = "" }) => (
  <div className={`mb-4 ${className}`}>
    <label className="block text-xs font-medium mb-2">{label}</label>
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

const SliderField = ({ label, value, onChange, min = 0, max = 2, step = 0.1, info = "" }) => (
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
      className="w-full h-2 bg-linear-to-r from-blue-500 to-blue-600 rounded-lg appearance-none cursor-pointer slider"
      style={{
        background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((value - min) / (max - min)) * 100}%, #e2e8f0 ${((value - min) / (max - min)) * 100}%, #e2e8f0 100%)`
      }}
    />
    {info && (
      <p className="text-xs text-slate-500 mt-2">{info}</p>
    )}
  </div>
);

export default function LLM() {
  const [provider, setProvider] = useState("Openai");
  const [model, setModel] = useState("gpt-3.5-turbo");
  const [maxTokens, setMaxTokens] = useState("1007");
  const [temperature, setTemperature] = useState("0.7");

  const providerOptions = [
    { value: "Openai", label: "Openai" },
    { value: "Anthropic", label: "Anthropic" },
    { value: "Google", label: "Google" },
  ];
  
  const modelOptions = [
    { value: "gpt-3.5-turbo", label: "gpt-3.5-turbo" },
    { value: "gpt-4", label: "gpt-4" },
    { value: "gpt-4-turbo", label: "gpt-4-turbo" },
  ];

  return (
    <div className="max-w-4xl">
      <h2 className="text-lg font-semibold mb-6">Choose LLM model</h2>
      
      <div className="grid grid-cols-2 gap-6 mb-6">
        <SelectField 
          label="Provider" 
          value={provider} 
          onChange={setProvider} 
          options={providerOptions} 
        />
        <SelectField 
          label="Model" 
          value={model} 
          onChange={setModel} 
          options={modelOptions} 
        />
      </div>

      <div className="grid grid-cols-2 gap-8 mb-6">
        <SliderField
          label="Tokens generated on each LLM output"
          value={maxTokens}
          onChange={setMaxTokens}
          min={100}
          max={4000}
          step={1}
          info="Increasing tokens enables longer responses to be queued for speech generation but increases latency"
        />
        
        <SliderField
          label="Temperature"
          value={temperature}
          onChange={setTemperature}
          min={0}
          max={2}
          step={0.1}
          info="Increasing temperature enables heightened creativity, but increases chance of deviation from prompt"
        />
      </div>
    </div>
  );
}
