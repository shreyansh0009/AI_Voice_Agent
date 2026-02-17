import React, { useState, useEffect, useRef } from "react";
import api from "../utils/api";
import { FiChevronDown, FiX, FiSearch, FiExternalLink } from "react-icons/fi";

/**
 * LLM tab content (separate file)
 * - Exports default LLM component
 * - Receives values and onChange handlers as props from parent
 * - Used inside AgentSetup when LLM tab is active
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

export default function LLM({
  provider,
  onProviderChange,
  model,
  onModelChange,
  maxTokens,
  onMaxTokensChange,
  temperature,
  onTemperatureChange,
  agentId,
  knowledgeBaseFiles = [],
  onKnowledgeBaseChange,
}) {
  const [allFiles, setAllFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Local checked state (not yet saved to server)
  const [checkedIds, setCheckedIds] = useState([]);
  const dropdownRef = useRef(null);

  const providerOptions = [
    { value: "Openai", label: "OpenAI" },
    { value: "Agentforce", label: "Agentforce" },
  ];

  const providerConfigs = {
    Openai: {
      models: [
        { value: "gpt-4o-mini", label: "gpt-4o-mini" },
        { value: "gpt-4.1-mini", label: "gpt-4.1-mini" },
        { value: "gpt-3.5-turbo", label: "gpt-3.5-turbo" },
      ],
      showModelSelector: true
    },
    Agentforce: {
      models: [],
      showModelSelector: false
    }
  };

  const currentConfig = providerConfigs[provider] || { models: [], showModelSelector: false };

  const handleProviderChange = (newProvider) => {
    onProviderChange(newProvider);
    const config = providerConfigs[newProvider];
    if (config && config.showModelSelector && config.models.length > 0) {
      onModelChange(config.models[0].value);
    } else {
      onModelChange("");
    }
  };

  // Fetch all processed files
  useEffect(() => {
    async function fetchFiles() {
      setLoadingFiles(true);
      try {
        const res = await api.get("/api/knowledge/knowledge-files");
        const processed = (res.data.files || []).filter(f => f.status === "processed");
        setAllFiles(processed);
      } catch (err) {
        console.error("Error fetching knowledge files:", err);
      } finally {
        setLoadingFiles(false);
      }
    }
    fetchFiles();
  }, []);

  // Sync checkedIds with knowledgeBaseFiles when agent changes
  useEffect(() => {
    const ids = knowledgeBaseFiles.map(f => typeof f === "object" ? f._id : f);
    setCheckedIds(ids);
  }, [knowledgeBaseFiles]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
        setSearchQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Already-linked IDs from server
  const linkedIds = knowledgeBaseFiles.map(f => typeof f === "object" ? f._id : f);

  // Toggle a file in local checked state
  const toggleFile = (fileId) => {
    setCheckedIds(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  // Files shown in dropdown, filtered by search
  const filteredFiles = allFiles.filter(f => {
    if (searchQuery) {
      return f.originalName.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  // Get full file info for checked files (for display below dropdown)
  const checkedFilesInfo = checkedIds
    .map(id => allFiles.find(f => f._id === id))
    .filter(Boolean);

  // Has unsaved changes?
  const hasChanges = JSON.stringify([...checkedIds].sort()) !== JSON.stringify([...linkedIds].sort());

  // Newly selected (not yet linked)
  const newlySelected = checkedIds.filter(id => !linkedIds.includes(id));
  const newlySelectedInfo = newlySelected.map(id => allFiles.find(f => f._id === id)).filter(Boolean);

  // Save / Link the checked files to agent
  const handleLink = async () => {
    if (!agentId || !hasChanges) return;
    setSaving(true);
    try {
      const res = await api.put(`/api/agents/${agentId}/knowledge`, { fileIds: checkedIds });
      if (onKnowledgeBaseChange) {
        onKnowledgeBaseChange(res.data.knowledgeBaseFiles);
      }
    } catch (err) {
      console.error("Error linking files:", err);
    } finally {
      setSaving(false);
    }
  };

  // Unlink a single file
  const handleUnlink = async (fileId) => {
    if (!agentId) return;
    setSaving(true);
    try {
      const res = await api.delete(`/api/agents/${agentId}/knowledge/${fileId}`);
      if (onKnowledgeBaseChange) {
        onKnowledgeBaseChange(res.data.knowledgeBaseFiles);
      }
      // Also remove from local checked state
      setCheckedIds(prev => prev.filter(id => id !== fileId));
    } catch (err) {
      console.error("Error unlinking file:", err);
    } finally {
      setSaving(false);
    }
  };

  // Already linked files info
  const linkedFilesInfo = linkedIds.map(id => allFiles.find(f => f._id === id)).filter(Boolean);

  return (
    <div className="max-w-4xl">
      <h2 className="text-lg font-semibold mb-6">Choose LLM model</h2>

      <div className={`grid ${currentConfig.showModelSelector ? 'grid-cols-2' : 'grid-cols-1'} gap-6 mb-6`}>
        <SelectField
          label="Provider"
          value={provider}
          onChange={handleProviderChange}
          options={providerOptions}
        />
        {currentConfig.showModelSelector && (
          <SelectField
            label="Model"
            value={model}
            onChange={onModelChange}
            options={currentConfig.models}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-8 mb-6">
        <SliderField
          label="Tokens generated on each LLM output"
          value={maxTokens}
          onChange={onMaxTokensChange}
          min={100}
          max={4000}
          step={1}
          info="Increasing tokens enables longer responses to be queued for speech generation but increases latency"
        />

        <SliderField
          label="Temperature"
          value={temperature}
          onChange={onTemperatureChange}
          min={0}
          max={2}
          step={0.1}
          info="Increasing temperature enables heightened creativity, but increases chance of deviation from prompt"
        />
      </div>

      {/* Knowledge Base Multi-Select */}
      <div className="mb-6">
        <label className="block text-xs font-medium mb-2">Add knowledge base (Multi-select)</label>

        {!agentId ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
            <p className="text-sm text-amber-700">Save this agent first to link knowledge base files.</p>
          </div>
        ) : (
          <div className="relative" ref={dropdownRef}>
            {/* Dropdown Menu — opens UPWARD above the trigger */}
            {dropdownOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
                {/* File list with checkboxes */}
                <div className="max-h-64 overflow-y-auto py-1">
                  {loadingFiles ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                      <span className="text-sm text-slate-500">Loading...</span>
                    </div>
                  ) : filteredFiles.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-slate-400">
                      {searchQuery ? "No matching files" : "No knowledge base files found"}
                    </div>
                  ) : (
                    filteredFiles.map((file) => {
                      const isChecked = checkedIds.includes(file._id);
                      return (
                        <label
                          key={file._id}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleFile(file._id)}
                            className="w-5 h-5 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                          />
                          <span className="text-sm text-slate-700 leading-snug">
                            {file.originalName}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>

                {/* Add new knowledgebase link */}
                <div className="border-t border-slate-100 px-4 py-3">
                  <a
                    href="/knowledge"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-blue-600 transition-colors"
                  >
                    Add new knowledgebase
                    <FiExternalLink size={13} />
                  </a>
                </div>
              </div>
            )}

            {/* Dropdown Trigger */}
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-full max-w-md flex items-center justify-between px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            >
              <span className="text-slate-500">
                {loadingFiles ? "Loading..." : "Select knowledge bases"}
              </span>
              <FiChevronDown
                className={`text-slate-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                size={16}
              />
            </button>
          </div>
        )}

        {/* Currently Linked Files */}
        {linkedFilesInfo.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-slate-500 mb-2">Linked knowledge bases:</p>
            <div className="flex flex-wrap gap-2">
              {linkedFilesInfo.map((file) => (
                <div
                  key={file._id}
                  className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-1 rounded-full text-xs font-medium"
                >
                  <span className="truncate max-w-[200px]">{file.originalName}</span>
                  <button
                    onClick={() => handleUnlink(file._id)}
                    disabled={saving}
                    className="hover:bg-blue-100 rounded-full p-0.5 transition-colors disabled:opacity-50"
                    title="Unlink"
                  >
                    {saving ? (
                      <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <FiX size={12} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Newly Selected (not yet linked) + Link Button */}
        {newlySelectedInfo.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-slate-500 mb-2">Selected to link:</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {newlySelectedInfo.map((file) => (
                <div
                  key={file._id}
                  className="flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 px-2.5 py-1 rounded-full text-xs font-medium"
                >
                  <span className="truncate max-w-[200px]">{file.originalName}</span>
                  <button
                    onClick={() => toggleFile(file._id)}
                    className="hover:bg-green-100 rounded-full p-0.5 transition-colors"
                    title="Remove"
                  >
                    <FiX size={12} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={handleLink}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Linking...
                </span>
              ) : (
                `Link ${newlySelectedInfo.length} knowledge base${newlySelectedInfo.length > 1 ? 's' : ''}`
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
