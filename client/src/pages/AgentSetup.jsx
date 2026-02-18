import React, { useState, useEffect, useMemo, useRef } from "react";
import { loadRazorpay } from "../utils/razorpayLoader";
import LLM from "../components/LLM.jsx";
import Audio from "../components/Audio.jsx";
import Engine from "../components/Engine.jsx";
import Call from "../components/Call.jsx";
import Tool from "../components/Tool.jsx";
import Analytics from "../components/Analytics.jsx";
import AgentModal from "../components/models/AgentModal.jsx";
import { generateAgentResponseWithHistory } from "../config/openai.js";
import { BiTrash } from "react-icons/bi";
import { MdClose, MdAdd } from "react-icons/md";
import { toast } from "react-toastify";
import api from "../utils/api";
import axios from "axios";
import { calculateCostPerMinute } from "../utils/pricing.js";
import {
  getDomainTemplate,
  getDomainOptions,
} from "../config/domainTemplates.js";

const TABS = [
  "Agent",
  "LLM",
  "Audio",
  "Engine",
  "Call",
  "Tools",
  "Analytics",
];

export default function AgentSetupSingle() {
  const [activeTab, setActiveTab] = useState("Agent");
  const [agentName, setAgentName] = useState("My New Agent");
  const [agentDomain, setAgentDomain] = useState("general");
  const [welcome, setWelcome] = useState("Hello from crml");
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [prompt, setPrompt] = useState(
    "You are a helpful agent. You will help the customer with their queries and doubts. You will never speak more than 2 sentences. Keep your responses concise.",
  );

  // LLM Configuration
  const [llmProvider, setLlmProvider] = useState("Openai");
  const [llmModel, setLlmModel] = useState("gpt-4o-mini");
  const [maxTokens, setMaxTokens] = useState(1007);
  const [temperature, setTemperature] = useState(0.7);

  // Audio Configuration
  const [language, setLanguage] = useState("English (India)");
  const [transcriberProvider, setTranscriberProvider] = useState("Deepgram");
  const [transcriberModel, setTranscriberModel] = useState("nova-2");
  const [keywords, setKeywords] = useState("");
  const [voiceProvider, setVoiceProvider] = useState("Sarvam");
  const [voiceModel, setVoiceModel] = useState("bulbulv2");
  const [voice, setVoice] = useState("manisha");
  const [bufferSize, setBufferSize] = useState(153);
  const [speedRate, setSpeedRate] = useState(1);

  // Knowledge Base
  const [knowledgeBaseFiles, setKnowledgeBaseFiles] = useState([]);

  // State to store all created agents
  const [savedAgents, setSavedAgents] = useState([]);

  // State to track currently selected agent (load from localStorage if exists)
  const [selectedAgentId, setSelectedAgentId] = useState(() => {
    const savedAgentId = localStorage.getItem("lastSelectedAgentId");
    return savedAgentId || null;
  });
  const [isNewAgent, setIsNewAgent] = useState(() => {
    // If there's a saved agent ID, it's not a new agent
    const savedAgentId = localStorage.getItem("lastSelectedAgentId");
    return !savedAgentId;
  });

  // Chat testing state
  const [chatMessages, setChatMessages] = useState([]);
  const [userMessage, setUserMessage] = useState("");
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);
  const [showChat, setShowChat] = useState(false);

  // Knowledge Base state
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);

  // Save button state - prevent multiple clicks
  const [isSaving, setIsSaving] = useState(false);

  // Loading state for pre-built agent generation
  const [isGenerating, setIsGenerating] = useState(false);

  // Phone Number Linking state
  const [linkedPhoneNumber, setLinkedPhoneNumber] = useState(null);
  const [availablePhoneNumbers, setAvailablePhoneNumbers] = useState([]);
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState("");
  const [isLinkingPhone, setIsLinkingPhone] = useState(false);

  // Wallet state
  const [walletBalance, setWalletBalance] = useState(0);
  const [showAddFundsModal, setShowAddFundsModal] = useState(false);

  // Exchange rate state
  const [exchangeRate, setExchangeRate] = useState(85);

  // Engine configuration state
  const [engineConfig, setEngineConfig] = useState({
    generatePrecise: false,
    wordsToWait: 2,
    responseRate: "Rapid",
    endpointing: 200,
    linearDelay: 300
  });

  // Call configuration state
  const [callConfig, setCallConfig] = useState({
    provider: "Custom",
    dtmfEnabled: false,
    noiseCancellation: false,
    noiseCancellationLevel: 50,
    voicemailDetection: false,
    voicemailTime: 2.5,
    hangupOnSilence: true,
    hangupSilenceTime: 15,
    hangupByPrompt: true,
    hangupPrompt: "You are an AI assistant that determines whether a conversation is complete based on the transcript. A conversation is considered complete if any of the following conditions are met:",
    hangupMessage: "Call will now disconnect",
    terminationTime: 400,
  });

  // Analytics configuration state
  const [analyticsConfig, setAnalyticsConfig] = useState({
    summarization: false,
    extraction: false,
    extractionPrompt: "user_name : Yield the name of the user.\n    payment_mode : If user is paying by cash, yield cash. If they are paying by card yield...",
    webhookUrl: "",
  });

  // Snapshot of saved agent fields for dirty-state detection
  const savedSnapshot = useRef(null);

  // Helper to build a snapshot object from current state
  const buildSnapshot = (fields) => JSON.stringify(fields);

  // Compute current snapshot from live state (must be after all state declarations)
  const currentSnapshot = useMemo(() => buildSnapshot({
    agentName, agentDomain, welcome, prompt,
    llmProvider, llmModel, maxTokens, temperature,
    language, transcriberProvider, transcriberModel,
    voiceProvider, voiceModel, voice, bufferSize, speedRate,
    engineConfig, callConfig, analyticsConfig,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [agentName, agentDomain, welcome, prompt, llmProvider, llmModel, maxTokens, temperature,
    language, transcriberProvider, transcriberModel, voiceProvider, voiceModel, voice,
    bufferSize, speedRate, engineConfig, callConfig, analyticsConfig]);

  // isDirty: true when current values differ from last saved snapshot
  const isDirty = isNewAgent || savedSnapshot.current === null || currentSnapshot !== savedSnapshot.current;

  // Fetch exchange rate on mount
  useEffect(() => {
    const fetchExchangeRate = async () => {
      try {
        const res = await api.get("/exchange-rate");
        if (res.data?.success && res.data?.rates?.INR) {
          setExchangeRate(res.data.rates.INR);
        }
      } catch (err) {
        console.warn("Could not fetch exchange rate, using fallback");
      }
    };
    fetchExchangeRate();
  }, []);

  // Calculate cost breakdown dynamically
  const costBreakdown = useMemo(() => {
    return calculateCostPerMinute({
      llmProvider,
      llmModel,
      transcriberProvider,
      transcriberModel,
      voiceProvider,
      voiceModel,
    }, exchangeRate);
  }, [llmProvider, llmModel, transcriberProvider, transcriberModel, voiceProvider, voiceModel, exchangeRate]);

  // Fetch agents from backend
  useEffect(() => {
    fetchAgents();
    fetchWalletBalance();
  }, []);

  const fetchAgents = async () => {
    try {
      const res = await api.get("/api/agents");
      setSavedAgents(res.data);

      // Auto-select the last selected agent from localStorage
      const savedAgentId = localStorage.getItem("lastSelectedAgentId");
      if (savedAgentId && res.data.length > 0) {
        // Find the agent with the saved ID
        const agentToLoad = res.data.find(
          (agent) => agent._id === savedAgentId,
        );
        if (agentToLoad) {
          console.log(
            "✅ Auto-loading previously selected agent:",
            agentToLoad.name,
          );
          handleSelectAgent(agentToLoad);
        } else {
          // Agent no longer exists, clear localStorage
          localStorage.removeItem("lastSelectedAgentId");
          setIsNewAgent(true);
        }
      }
    } catch (err) {
      console.error("Failed to fetch agents:", err);
    }
  };

  // Fetch wallet balance
  const API_URL = import.meta.env.VITE_API_URL || "";

  const fetchWalletBalance = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${API_URL}/api/payments/wallet`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.success) {
        setWalletBalance(response.data.balance);
      }
    } catch (error) {
      console.error("Error fetching wallet:", error);
    }
  };

  // Fetch phone number linked to current agent
  const fetchAgentPhoneNumber = async (agentId) => {
    if (!agentId) {
      setLinkedPhoneNumber(null);
      return;
    }
    try {
      const res = await api.get(`/api/phone-numbers/agent/${agentId}`);
      setLinkedPhoneNumber(res.data.phoneNumber);
    } catch (err) {
      console.error("Failed to fetch agent phone number:", err);
      setLinkedPhoneNumber(null);
    }
  };

  // Fetch user's owned phone numbers (purchased with valid subscription)
  const fetchAvailablePhoneNumbers = async () => {
    try {
      const res = await api.get("/api/phone-numbers/owned");
      setAvailablePhoneNumbers(res.data.phoneNumbers || []);
    } catch (err) {
      console.error("Failed to fetch available phone numbers:", err);
    }
  };

  // Link phone number to agent
  const handleLinkPhoneNumber = async () => {
    if (!selectedPhoneNumber || !selectedAgentId) return;

    setIsLinkingPhone(true);
    try {
      await api.post(`/api/phone-numbers/${selectedPhoneNumber}/link`, {
        agentId: selectedAgentId,
      });
      // Refresh data
      await fetchAgentPhoneNumber(selectedAgentId);
      await fetchAvailablePhoneNumbers();
      setSelectedPhoneNumber("");
    } catch (err) {
      console.error("Failed to link phone number:", err);
      toast.error(err.response?.data?.error || "Failed to link phone number");
    } finally {
      setIsLinkingPhone(false);
    }
  };

  // Unlink phone number from agent
  const handleUnlinkPhoneNumber = async () => {
    if (!linkedPhoneNumber) return;

    setIsLinkingPhone(true);
    try {
      await api.post(`/api/phone-numbers/${linkedPhoneNumber.number}/unlink`);
      // Refresh data
      setLinkedPhoneNumber(null);
      await fetchAvailablePhoneNumbers();
    } catch (err) {
      console.error("Failed to unlink phone number:", err);
      toast.error(err.response?.data?.error || "Failed to unlink phone number");
    } finally {
      setIsLinkingPhone(false);
    }
  };

  // Fetch phone number when agent changes
  useEffect(() => {
    if (selectedAgentId) {
      fetchAgentPhoneNumber(selectedAgentId);
      fetchAvailablePhoneNumbers();
    } else {
      setLinkedPhoneNumber(null);
    }
  }, [selectedAgentId]);

  // Load chat history from localStorage on mount
  useEffect(() => {
    const savedChatHistory = localStorage.getItem("agent_chat_history");
    if (savedChatHistory) {
      try {
        const parsed = JSON.parse(savedChatHistory);
        setChatMessages(parsed);
      } catch (error) {
        console.error("Failed to load chat history:", error);
      }
    }
  }, []);

  // Load uploaded files from localStorage on mount
  useEffect(() => {
    const loadUploadedFiles = async () => {
      const savedFiles = localStorage.getItem("uploaded_knowledge_files");
      if (savedFiles) {
        try {
          const parsed = JSON.parse(savedFiles);
          console.log("📂 Loaded files from localStorage:", parsed);

          // Verify files still exist on server
          const token = localStorage.getItem("token");
          const response = await fetch(
            `${import.meta.env.VITE_API_URL}/api/knowledge-files`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          );
          const data = await response.json();

          if (data.success) {
            // Match localStorage files with server files
            const serverFileNames = data.files.map((f) => f.fileName);
            const validFiles = parsed.filter((file) =>
              serverFileNames.includes(file.fileName),
            );

            if (validFiles.length !== parsed.length) {
              console.log(
                "⚠️ Some files no longer exist on server, cleaning up...",
              );
              localStorage.setItem(
                "uploaded_knowledge_files",
                JSON.stringify(validFiles),
              );
            }

            setUploadedFiles(validFiles);
          } else {
            setUploadedFiles(parsed);
          }
        } catch (error) {
          console.error("Failed to load uploaded files:", error);
          localStorage.removeItem("uploaded_knowledge_files");
        }
      } else {
        // If no localStorage, fetch from server
        fetchUploadedFiles();
      }
    };

    loadUploadedFiles();
  }, []);

  // Fetch uploaded files from server
  // Fetch files specific to the current agent
  const fetchUploadedFiles = async (currentAgentId) => {
    // If no agent selected (or new unsaved agent), clear files
    if (!currentAgentId) {
      setUploadedFiles([]);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${import.meta.env.VITE_API_URL
        }/api/knowledge-files?agentId=${currentAgentId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const data = await response.json();

      if (data.success) {
        console.log(`📂 Loaded files for agent ${currentAgentId}:`, data.files);
        setUploadedFiles(data.files);
        // We probably don't need localStorage for this anymore since it's agent-specific and synced with DB
      }
    } catch (error) {
      console.error("Failed to fetch files:", error);
    }
  };

  // Effect to fetch files when selected agent changes
  useEffect(() => {
    fetchUploadedFiles(selectedAgentId);
  }, [selectedAgentId]);

  // Save uploaded files to localStorage whenever they change
  useEffect(() => {
    if (uploadedFiles.length > 0) {
      localStorage.setItem(
        "uploaded_knowledge_files",
        JSON.stringify(uploadedFiles),
      );
      console.log("💾 Saved files to localStorage:", uploadedFiles.length);
    } else {
      localStorage.removeItem("uploaded_knowledge_files");
    }
  }, [uploadedFiles]);

  // Cleanup: Delete files from server when browser closes/reloads
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Optional: Ask user if they want to keep files
      const savedFiles = localStorage.getItem("uploaded_knowledge_files");
      if (savedFiles) {
        const files = JSON.parse(savedFiles);
        if (files.length > 0) {
          // If you want to always delete files on close, uncomment this:
          // e.preventDefault();
          // e.returnValue = '';
          // await deleteAllFilesFromServer(files);

          // For now, we'll keep files persistent across reloads
          console.log(
            "🔄 Page reload/close detected. Files preserved in localStorage.",
          );
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  // Save chat history to localStorage whenever it changes
  useEffect(() => {
    if (chatMessages.length > 0) {
      localStorage.setItem("agent_chat_history", JSON.stringify(chatMessages));
    }
  }, [chatMessages]);

  function handleCreateAgent(payload) {
    if (!payload) {
      setShowAgentModal(false);
      return;
    }

    console.log("Generating agent with payload:", payload);
    setIsGenerating(true);
    setShowAgentModal(false);

    // Call backend to generate agent config
    api
      .post("/api/agents/generate", payload)
      .then((res) => {
        const { name, welcome, prompt } = res.data;

        setIsNewAgent(true);
        setSelectedAgentId(null);
        setAgentName(name || payload.name || "New AI Agent");
        setWelcome(welcome || "");
        setPrompt(prompt || "");
        setChatMessages([]);
        savedSnapshot.current = null; // new agent — always dirty
        // Clear localStorage when creating new agent
        localStorage.removeItem("lastSelectedAgentId");
        toast.success("Agent configuration generated! Review and save when ready.");
      })
      .catch((err) => {
        console.error("Failed to generate agent:", err);
        toast.error("Failed to generate agent configuration. Please try again.");
      })
      .finally(() => {
        setIsGenerating(false);
      });
  }

  // Function to save/create agent
  async function handleSaveAgent() {
    // Prevent multiple simultaneous saves
    if (isSaving) return;

    setIsSaving(true);

    const agentData = {
      name: agentName,
      domain: agentDomain,
      status: "draft",
      welcome: welcome,
      prompt: prompt,
      // LLM Configuration
      llmProvider: llmProvider,
      llmModel: llmModel,
      maxTokens: maxTokens,
      temperature: temperature,
      // Audio Configuration
      language: language,
      transcriberProvider: transcriberProvider,
      transcriberModel: transcriberModel,
      voiceProvider: voiceProvider,
      voiceModel: voiceModel,
      voice: voice,
      bufferSize: bufferSize,
      speedRate: speedRate,
      // Engine Configuration
      engineConfig: engineConfig,
      // Call Configuration
      callConfig: callConfig,
      // Analytics Configuration
      analyticsConfig: analyticsConfig,
    };

    try {
      if (isNewAgent) {
        // Create new agent via API
        const res = await api.post("/api/agents", agentData);
        setSavedAgents([res.data, ...savedAgents]);
        setSelectedAgentId(res.data._id);
        setIsNewAgent(false);
        // Save to localStorage so it persists across page reloads
        localStorage.setItem("lastSelectedAgentId", res.data._id);
        // Update snapshot so button grays out immediately after save
        savedSnapshot.current = currentSnapshot;
        toast.success(`Agent "${res.data.name}" created successfully!`);
      } else if (selectedAgentId) {
        // Update existing agent via API
        const res = await api.put(`/api/agents/${selectedAgentId}`, agentData);
        setSavedAgents(
          savedAgents.map((agent) =>
            agent._id === selectedAgentId ? res.data : agent,
          ),
        );
        // Ensure localStorage is updated
        localStorage.setItem("lastSelectedAgentId", res.data._id);
        // Update snapshot so button grays out immediately after save
        savedSnapshot.current = currentSnapshot;
        toast.success(`Agent "${res.data.name}" updated successfully!`);
      }
    } catch (err) {
      console.error("Error saving agent:", err);
      toast.error(err.response?.data?.error || "Failed to save agent. Please try again.");
    } finally {
      // Re-enable button after 2 seconds to prevent rapid clicking
      setTimeout(() => {
        setIsSaving(false);
      }, 3000);
    }
  }

  // Function to select an agent from the list
  function handleSelectAgent(agent) {
    setSelectedAgentId(agent._id);
    setAgentName(agent.name);
    setAgentDomain(agent.domain || "general");
    setWelcome(agent.welcome);
    setPrompt(agent.prompt);
    // Load LLM Configuration
    setLlmProvider(agent.llmProvider || "Openai");
    setLlmModel(agent.llmModel || "gpt-4o-mini");
    setMaxTokens(agent.maxTokens || 1007);
    setTemperature(agent.temperature || 0.7);
    // Load Knowledge Base
    setKnowledgeBaseFiles(agent.knowledgeBaseFiles || []);
    // Load Audio Configuration
    setLanguage(agent.language || "English (India)");
    setTranscriberProvider(agent.transcriberProvider || "Deepgram");
    setTranscriberModel(agent.transcriberModel || "nova-2");
    setVoiceProvider(agent.voiceProvider || "Sarvam");
    setVoiceModel(agent.voiceModel || "bulbulv2");
    setVoice(agent.voice || "manisha");
    setBufferSize(agent.bufferSize || 153);
    setSpeedRate(agent.speedRate || 1);
    // Load Engine Configuration
    if (agent.engineConfig) {
      setEngineConfig(agent.engineConfig);
    }
    // Load Call Configuration
    if (agent.callConfig) {
      setCallConfig(agent.callConfig);
    }
    // Load Analytics Configuration
    if (agent.analyticsConfig) {
      setAnalyticsConfig(agent.analyticsConfig);
    }
    setIsNewAgent(false);
    // Save to localStorage so it persists across page reloads
    localStorage.setItem("lastSelectedAgentId", agent._id);
    // Snapshot current state so dirty detection works correctly
    savedSnapshot.current = buildSnapshot({
      agentName: agent.name,
      agentDomain: agent.domain || "general",
      welcome: agent.welcome,
      prompt: agent.prompt,
      llmProvider: agent.llmProvider || "Openai",
      llmModel: agent.llmModel || "gpt-4o-mini",
      maxTokens: agent.maxTokens || 1007,
      temperature: agent.temperature || 0.7,
      language: agent.language || "English (India)",
      transcriberProvider: agent.transcriberProvider || "Deepgram",
      transcriberModel: agent.transcriberModel || "nova-2",
      voiceProvider: agent.voiceProvider || "Sarvam",
      voiceModel: agent.voiceModel || "bulbulv2",
      voice: agent.voice || "manisha",
      bufferSize: agent.bufferSize || 153,
      speedRate: agent.speedRate || 1,
      engineConfig: agent.engineConfig || engineConfig,
      callConfig: agent.callConfig || callConfig,
      analyticsConfig: agent.analyticsConfig || analyticsConfig,
    });
  }

  // Function to create a new blank agent
  function handleNewAgent() {
    setShowAgentModal(true);
  }

  // Function to apply domain template
  function handleDomainChange(newDomain) {
    setAgentDomain(newDomain);
    const template = getDomainTemplate(newDomain);
    setAgentName(template.name);
    setWelcome(template.welcome);
    setPrompt(template.prompt);
  }

  // Function to delete an agent
  async function handleDeleteAgent(agentId, agentName, event) {
    event.stopPropagation(); // Prevent selecting the agent when clicking delete

    if (window.confirm(`Are you sure you want to delete "${agentName}"?`)) {
      try {
        await api.delete(`/api/agents/${agentId}`);
        setSavedAgents(savedAgents.filter((agent) => agent._id !== agentId));

        // If deleted agent was selected, reset to new agent and clear localStorage
        if (selectedAgentId === agentId) {
          localStorage.removeItem("lastSelectedAgentId");
          savedSnapshot.current = null;
          handleNewAgent();
        }

        toast.success(`Agent "${agentName}" deleted successfully!`);
      } catch (err) {
        console.error("Error deleting agent:", err);
        toast.error("Failed to delete agent. Please try again.");
      }
    }
  }

  // Function to send message to agent and get response
  async function handleSendMessage() {
    if (!userMessage.trim()) return;

    // Add user message to chat
    const newUserMessage = { role: "user", content: userMessage };
    setChatMessages((prev) => [...prev, newUserMessage]);
    setUserMessage("");
    setIsLoadingResponse(true);

    try {
      // Build conversation history for context
      const conversationHistory = chatMessages.map((msg) => ({
        role: msg.role === "error" ? "assistant" : msg.role,
        content: msg.content,
      }));

      // Use the agent's custom prompt with full conversation context
      const result = await generateAgentResponseWithHistory(
        conversationHistory,
        userMessage,
        prompt,
        {
          temperature: 0.7,
          max_tokens: 500,
        },
      );

      if (result.success) {
        const aiMessage = { role: "assistant", content: result.data };
        setChatMessages((prev) => [...prev, aiMessage]);
      } else {
        const errorMessage = {
          role: "error",
          content: `Error: ${result.error}`,
        };
        setChatMessages((prev) => [...prev, errorMessage]);
      }
    } catch {
      const errorMessage = {
        role: "error",
        content: "Failed to get response from agent",
      };
      setChatMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoadingResponse(false);
    }
  }

  // Function to start fresh chat
  function handleStartChat() {
    setChatMessages([]);
    localStorage.removeItem("agent_chat_history"); // Clear localStorage
    // Add welcome message as first message if it exists
    if (welcome && welcome.trim()) {
      setChatMessages([{ role: "assistant", content: welcome }]);
    }
    setShowChat(true);
  }

  // Knowledge Base file upload handlers
  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);

    if (files.length === 0) return;

    // Validate files
    const validFiles = files.filter((file) => {
      const extension = file.name.split(".").pop().toLowerCase();
      const isValid = ["pdf", "doc", "docx"].includes(extension);
      const isUnderLimit = file.size <= 10 * 1024 * 1024; // 10MB

      if (!isValid) {
        setUploadError(
          `${file.name}: Invalid file type. Only PDF, DOC, DOCX allowed.`,
        );
        return false;
      }
      if (!isUnderLimit) {
        setUploadError(`${file.name}: File too large. Maximum 10MB.`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const formData = new FormData();
      validFiles.forEach((file) => {
        formData.append("files", file);
      });

      // Ensure we attach it to the currently selected agent
      if (selectedAgentId) {
        formData.append("agentId", selectedAgentId);
      } else {
        setUploadError("Please save the agent before uploading files.");
        setIsUploading(false);
        return;
      }

      const token = localStorage.getItem("token");
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/upload-knowledge`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
      );

      const data = await response.json();

      if (data.success) {
        // Backend returns single file (data.file), refresh from server to get updated list
        await fetchUploadedFiles(selectedAgentId);

        setUploadSuccess(`Successfully uploaded ${data.file.originalName}`);

        // Clear success message after 3 seconds
        setTimeout(() => setUploadSuccess(null), 3000);
      } else {
        setUploadError(data.error || "Upload failed");
      }
    } catch (error) {
      console.error("Upload error:", error);
      setUploadError(
        "Failed to upload files. Make sure the server is running.",
      );
    } finally {
      setIsUploading(false);
      // Reset file input
      event.target.value = "";
    }
  };

  const handleRemoveFile = async (index, fileName) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/knowledge-files/${fileName}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = await response.json();

      if (data.success) {
        const updatedFiles = uploadedFiles.filter((_, i) => i !== index);
        setUploadedFiles(updatedFiles);

        // Update localStorage
        if (updatedFiles.length > 0) {
          localStorage.setItem(
            "uploaded_knowledge_files",
            JSON.stringify(updatedFiles),
          );
        } else {
          localStorage.removeItem("uploaded_knowledge_files");
        }
        console.log("🗑️ File removed and localStorage updated");

        setUploadSuccess("File removed successfully");
        setTimeout(() => setUploadSuccess(null), 2000);
      } else {
        setUploadError("Failed to remove file");
      }
    } catch (error) {
      console.error("Delete error:", error);
      setUploadError("Failed to remove file");
    }
  };

  // Function to clear all uploaded files
  const handleClearAllFiles = async () => {
    if (uploadedFiles.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete all ${uploadedFiles.length} file(s)? This action cannot be undone.`,
    );

    if (!confirmed) return;

    setIsUploading(true);
    let successCount = 0;
    let failCount = 0;

    for (const file of uploadedFiles) {
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/knowledge-files/${file.fileName
          }`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const data = await response.json();
        if (data.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        console.error("Failed to delete:", file.fileName, error);
        failCount++;
      }
    }

    // Clear state and localStorage
    setUploadedFiles([]);
    localStorage.removeItem("uploaded_knowledge_files");

    setIsUploading(false);
    setUploadSuccess(
      `Deleted ${successCount} file(s)${failCount > 0 ? `, ${failCount} failed` : ""
      }`,
    );
    setTimeout(() => setUploadSuccess(null), 3000);
  };

  // Function to create scratch agent
  function handleCreateScratch() {
    setIsNewAgent(true);
    setSelectedAgentId(null);
    setAgentName("New Agent");
    setWelcome("");
    setPrompt("");
    setChatMessages([]);
    setShowAgentModal(false);
    // Clear localStorage when creating new agent
    localStorage.removeItem("lastSelectedAgentId");
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-2 sm:p-4 md:p-6">
      {/* Full-screen loading overlay for pre-built agent generation */}
      {isGenerating && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-4 max-w-sm w-full mx-4">
            <div className="w-14 h-14 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-800">Generating your agent...</p>
              <p className="text-sm text-gray-500 mt-1">Crafting a custom prompt and configuration. This may take a few seconds.</p>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Agent setup</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Fine tune your agents
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <div className="flex items-center bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
            <span className="text-xs text-gray-500 mr-2">Balance:</span>
            <span className="font-semibold text-gray-900">${walletBalance.toFixed(2)}</span>
          </div>
          <button
            onClick={() => setShowAddFundsModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white shadow-sm text-xs sm:text-sm whitespace-nowrap transition-colors"
          >
            <MdAdd className="text-lg" />
            Add funds
          </button>
          <button className="flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg border border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs sm:text-sm whitespace-nowrap transition-colors">
            Help
          </button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-4 lg:gap-6">
        {/* Left column - Hidden on mobile by default, can toggle */}
        <aside className="w-full xl:w-64 bg-white rounded-lg shadow-sm p-4 flex flex-col gap-4 max-h-[400px] xl:max-h-screen overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Your Agents</h2>
            <button className="text-xs text-slate-500">⋯</button>
          </div>

          <div className="flex gap-2">
            <button className="flex-1 text-sm px-3 py-2 rounded-md bg-slate-100 border">
              Import
            </button>
            <button
              className="flex-1 text-sm px-3 py-2 rounded-md bg-blue-600 text-white"
              onClick={handleNewAgent}
            >
              + New Agent
            </button>
          </div>

          <div className="mt-2">
            {/* Current agent being edited */}
            {isNewAgent && (
              <div className="bg-blue-50 border-2 border-blue-500 rounded-md p-3 flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-blue-700">
                  New Agent (Unsaved)
                </div>
                <div className="text-xs text-blue-600">editing</div>
              </div>
            )}

            {/* List of saved agents */}
            <div className="space-y-2">
              {savedAgents.map((agent) => (
                <div
                  key={agent._id}
                  onClick={() => handleSelectAgent(agent)}
                  className={`p-3 rounded-md border cursor-pointer transition-all ${selectedAgentId === agent._id
                    ? "bg-blue-50 border-blue-500"
                    : "bg-white border-slate-200 hover:border-blue-300"
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium">{agent.name}</div>
                        {agent.domain && agent.domain !== "general" && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-100 to-purple-100 text-blue-700 font-medium">
                            {agent.domain === "automotive" && "🚗"}
                            {agent.domain === "finance" && "💰"}
                            {agent.domain === "real-estate" && "🏢"}
                            {agent.domain}
                          </span>
                        )}
                      </div>
                      <div
                        className={`text-xs mt-1 ${agent.status === "active"
                          ? "text-green-600"
                          : "text-slate-400"
                          }`}
                      >
                        {agent.status}
                      </div>
                    </div>
                    <button
                      onClick={(e) =>
                        handleDeleteAgent(agent._id, agent.name, e)
                      }
                      className="ml-2 p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                      title="Delete agent"
                    >
                      <BiTrash className="text-base" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Center */}
        <main className="flex-1 bg-white rounded-lg shadow-sm p-3 sm:p-4 md:p-6 min-w-0 xl:min-w-[600px]">
          {/* Agent Header Section */}
          <div className="mb-4">
            {/* Title and Buttons Row */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 lg:gap-4 mb-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 flex-wrap">
                <input
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  className="text-sm sm:text-base font-semibold border-b border-transparent focus:border-blue-500 focus:outline-none w-full sm:w-auto min-w-0 max-w-full sm:max-w-xs"
                  placeholder="Enter agent name"
                />
                {isNewAgent && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded whitespace-nowrap">
                    Unsaved
                  </span>
                )}
              </div>

              <div className="flex flex-col items-stretch gap-2 w-full lg:w-auto shrink-0">
                <div className="flex gap-2">
                  <button className="flex-1 lg:flex-none px-3 py-1.5 rounded-md border bg-white text-xs sm:text-sm whitespace-nowrap hover:bg-slate-50 transition-colors flex items-center justify-center gap-1">
                    <svg
                      className="w-3 h-3 sm:w-4 sm:h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                    Agent ID
                  </button>
                  <button className="flex-1 lg:flex-none px-3 py-1.5 rounded-md border bg-white text-xs sm:text-sm hover:bg-slate-50 transition-colors flex items-center justify-center gap-1">
                    <svg
                      className="w-3 h-3 sm:w-4 sm:h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                      />
                    </svg>
                    Share
                  </button>
                </div>
                {/* Phone Number Linking Section */}
                {isNewAgent ? (
                  <div className="w-full px-4 py-2.5 bg-slate-100 text-slate-500 rounded-md text-xs text-center">
                    📞 Save agent first to link a phone number
                  </div>
                ) : linkedPhoneNumber ? (
                  /* If number is linked - show it grayed out with unlink option */
                  <div className="w-full flex items-center gap-2">
                    <div className="flex-1 px-4 py-2 bg-slate-100 text-slate-600 rounded-md text-xs sm:text-sm flex items-center gap-2">
                      <svg
                        className="w-4 h-4 text-green-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                        />
                      </svg>
                      <span className="font-medium">
                        {linkedPhoneNumber.displayNumber}
                      </span>
                      <span className="text-green-600 text-xs">(linked)</span>
                    </div>
                    <button
                      onClick={handleUnlinkPhoneNumber}
                      disabled={isLinkingPhone}
                      className="px-3 py-2 bg-red-50 text-red-600 border border-red-200 rounded-md text-xs hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      {isLinkingPhone ? "..." : "Unlink"}
                    </button>
                  </div>
                ) : (
                  /* If no number linked - show dropdown to select and link */
                  <div className="w-full flex items-center gap-2">
                    <select
                      value={selectedPhoneNumber}
                      onChange={(e) => setSelectedPhoneNumber(e.target.value)}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-md text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={
                        isLinkingPhone || availablePhoneNumbers.length === 0
                      }
                    >
                      <option value="">
                        {availablePhoneNumbers.length === 0
                          ? "No numbers available"
                          : "Select phone number..."}
                      </option>
                      {availablePhoneNumbers.map((phone) => (
                        <option key={phone.number} value={phone.number}>
                          {phone.displayNumber}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleLinkPhoneNumber}
                      disabled={!selectedPhoneNumber || isLinkingPhone}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md text-xs sm:text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                        />
                      </svg>
                      {isLinkingPhone ? "Linking..." : "Link"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Cost Info Badge */}
            <div className="flex items-center gap-2 mb-3">
              <div className="inline-flex items-center gap-1 text-xs text-slate-500">
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>
                  Cost per min:{" "}
                  <span className="font-medium text-slate-700">
                    ${costBreakdown.total.toFixed(3)}
                  </span>
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full max-w-md mb-2">
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden flex">
                <div
                  className="h-2 bg-teal-500 transition-all duration-300"
                  style={{ width: `${Math.max(costBreakdown.percentages.stt, 3)}%` }}
                  title={`STT: $${costBreakdown.stt.toFixed(4)}/min`}
                ></div>
                <div
                  className="h-2 bg-orange-500 transition-all duration-300"
                  style={{ width: `${Math.max(costBreakdown.percentages.llm, 3)}%` }}
                  title={`LLM: $${costBreakdown.llm.toFixed(4)}/min`}
                ></div>
                <div
                  className="h-2 bg-slate-700 transition-all duration-300"
                  style={{ width: `${Math.max(costBreakdown.percentages.tts, 3)}%` }}
                  title={`TTS: $${costBreakdown.tts.toFixed(4)}/min`}
                ></div>
                <div
                  className="h-2 bg-orange-300 transition-all duration-300"
                  style={{ width: `${Math.max(costBreakdown.percentages.telephony, 3)}%` }}
                  title={`Telephony: $${costBreakdown.telephony.toFixed(4)}/min`}
                ></div>
                <div
                  className="h-2 bg-blue-500 transition-all duration-300"
                  style={{ width: `${Math.max(costBreakdown.percentages.platform, 3)}%` }}
                  title={`Platform: $${costBreakdown.platform.toFixed(4)}/min`}
                ></div>
                <div
                  className="h-2 bg-purple-400 transition-all duration-300"
                  style={{ width: `${Math.max(costBreakdown.percentages.other, 3)}%` }}
                  title={`Analytics: $${(costBreakdown.sentiment + costBreakdown.summary).toFixed(4)}/min`}
                ></div>
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-teal-500"></div>
                <span>STT</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                <span>LLM</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-slate-700"></div>
                <span>TTS</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-orange-300"></div>
                <span>Telephony</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span>Platform</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-purple-400"></div>
                <span>Analytics</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-6">
            <nav className="flex justify-between gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100">
              {TABS.map((t) => {
                const active = t === activeTab;

                // Icon mapping for each tab
                const getIcon = () => {
                  switch (t) {
                    case "Agent":
                      return (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      );
                    case "LLM":
                      return (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                      );
                    case "Audio":
                      return (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                          />
                        </svg>
                      );
                    case "Voice":
                      return (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                          />
                        </svg>
                      );
                    case "Engine":
                      return (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                      );
                    case "Call":
                      return (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                          />
                        </svg>
                      );
                    case "Tools":
                      return (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"
                          />
                        </svg>
                      );
                    case "Analytics":
                      return (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                          />
                        </svg>
                      );
                    case "Inbound":
                      return (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                          />
                        </svg>
                      );
                    default:
                      return null;
                  }
                };

                return (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 sm:px-3 sm:py-2 rounded-md transition-colors shrink-0 min-w-[60px] sm:min-w-0 ${active
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-200"
                      }`}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="hidden sm:inline">{getIcon()}</span>
                    <span className="text-[10px] sm:text-xs whitespace-nowrap">
                      {t}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Tab content area */}
          <div className="space-y-6">
            {/* AGENT Tab */}
            {activeTab === "Agent" && (
              <section>
                <div className="space-y-4">
                  {/* Domain Selector */}
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Agent Domain / Industry
                    </label>
                    <select
                      value={agentDomain}
                      onChange={(e) => handleDomainChange(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {getDomainOptions().map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400 mt-1">
                      Select a domain to auto-fill with industry-specific
                      templates. You can customize after selection.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Agent Welcome Message
                    </label>
                    <input
                      value={welcome}
                      onChange={(e) => setWelcome(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      This will be the initial message from the agent. You can
                      use variables here using{" "}
                      <code className="bg-slate-50 px-1 rounded">{`{variable_name}`}</code>
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Agent Prompt
                    </label>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={8}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs font-mono"
                      placeholder="Enter your agent's system prompt here..."
                    />
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold">
                      You can fill in your following prompt variables for
                      testing
                    </h3>
                    <div className="mt-2 text-xs text-slate-500">
                      (variables UI placeholder)
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* LLM Tab: separate component imported */}
            {activeTab === "LLM" && (
              <section>
                <LLM
                  provider={llmProvider}
                  onProviderChange={setLlmProvider}
                  model={llmModel}
                  onModelChange={setLlmModel}
                  maxTokens={maxTokens}
                  onMaxTokensChange={setMaxTokens}
                  temperature={temperature}
                  onTemperatureChange={setTemperature}
                  agentId={selectedAgentId}
                  knowledgeBaseFiles={knowledgeBaseFiles}
                  onKnowledgeBaseChange={setKnowledgeBaseFiles}
                />
              </section>
            )}

            {activeTab === "Audio" && (
              <section>
                <Audio
                  language={language}
                  onLanguageChange={setLanguage}
                  transcriberProvider={transcriberProvider}
                  onTranscriberProviderChange={setTranscriberProvider}
                  transcriberModel={transcriberModel}
                  onTranscriberModelChange={setTranscriberModel}
                  keywords={keywords}
                  onKeywordsChange={setKeywords}
                  voiceProvider={voiceProvider}
                  onVoiceProviderChange={setVoiceProvider}
                  voiceModel={voiceModel}
                  onVoiceModelChange={setVoiceModel}
                  voice={voice}
                  onVoiceChange={setVoice}
                  bufferSize={bufferSize}
                  onBufferSizeChange={setBufferSize}
                  speedRate={speedRate}
                  onSpeedRateChange={setSpeedRate}
                />
              </section>
            )}
            {/* Voice Settings Section (Knowledge Base) */}
            <section
              style={{ display: activeTab === "Voice" ? "block" : "none" }}
            >
              {/* Knowledge Base Section */}
              <div className="mb-6 bg-white rounded-lg border border-slate-200 p-3 sm:p-4 md:p-6">
                <h3 className="text-sm font-semibold mb-4">Knowledge Base</h3>

                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-700 mb-2">
                    Upload Documents (PDF, Word)
                  </label>
                  <p className="text-xs text-slate-500 mb-3">
                    Upload documents to enhance your agent's knowledge. The
                    agent will use this information to answer questions more
                    accurately.
                  </p>

                  {/* File Upload Input */}
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                      <label
                        className={`flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer transition-colors w-full sm:w-auto ${isUploading ? "opacity-50 cursor-not-allowed" : ""
                          }`}
                      >
                        <svg
                          className="w-4 h-4 sm:w-5 sm:h-5 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                          />
                        </svg>
                        <span className="text-xs sm:text-sm font-medium">
                          {isUploading ? "Uploading..." : "Choose Files"}
                        </span>
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.doc,.docx"
                          onChange={handleFileUpload}
                          disabled={isUploading}
                          className="hidden"
                        />
                      </label>
                      <span className="text-xs text-slate-500 text-center sm:text-left">
                        Supported: PDF, DOC, DOCX (Max 10MB each)
                      </span>
                    </div>

                    {/* Upload Status Messages */}
                    {uploadSuccess && (
                      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
                        <svg
                          className="w-5 h-5 text-green-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        <span className="text-sm text-green-700">
                          {uploadSuccess}
                        </span>
                      </div>
                    )}

                    {uploadError && (
                      <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                        <svg
                          className="w-5 h-5 text-red-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                        <span className="text-sm text-red-700">
                          {uploadError}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Uploaded Files List */}
                {uploadedFiles.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-slate-700">
                        📚 Knowledge Base Files ({uploadedFiles.length})
                      </h4>
                      <button
                        onClick={handleClearAllFiles}
                        disabled={isUploading}
                        className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md border border-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Clear All
                      </button>
                    </div>

                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {uploadedFiles.map((file, index) => {
                        const isPDF = file.originalName
                          ?.toLowerCase()
                          .endsWith(".pdf");
                        const isWord = file.originalName
                          ?.toLowerCase()
                          .match(/\.(doc|docx)$/);

                        return (
                          <div
                            key={`${file.fileName}-${index}`}
                            className="flex items-start justify-between p-3 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors"
                          >
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              {/* File Icon */}
                              <div
                                className={`shrink-0 mt-0.5 ${file.status === "processed"
                                  ? "text-green-600"
                                  : file.status === "failed"
                                    ? "text-red-600"
                                    : "text-blue-600"
                                  }`}
                              >
                                {isPDF ? (
                                  <svg
                                    className="w-6 h-6"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18.5,9L13,3.5V9H18.5M6,20V4H11V10H18V20H6M7.93,17.5H9.61L9.85,16.74H11.58L11.82,17.5H13.5L11.58,12.5H9.85L7.93,17.5M10.15,15.43L10.71,13.34L11.27,15.43H10.15Z" />
                                  </svg>
                                ) : isWord ? (
                                  <svg
                                    className="w-6 h-6"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18.5,9L13,3.5V9H18.5M7,12.5L8.5,17.5H9.5L10.5,14L11.5,17.5H12.5L14,12.5H13L12,15.5L11,12.5H10L9,15.5L8,12.5H7Z" />
                                  </svg>
                                ) : (
                                  <svg
                                    className="w-6 h-6"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                                    />
                                  </svg>
                                )}
                              </div>

                              {/* File Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-slate-700 truncate">
                                    {file.originalName}
                                  </p>
                                  {file.status === "processed" && (
                                    <span className="shrink-0 px-2 py-0.5 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                                      ✓ Ready
                                    </span>
                                  )}
                                  {file.status === "failed" && (
                                    <span className="shrink-0 px-2 py-0.5 text-xs font-medium text-red-700 bg-red-100 rounded-full">
                                      ✗ Failed
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                                  <span className="flex items-center gap-1">
                                    <svg
                                      className="w-3 h-3"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                      />
                                    </svg>
                                    {(file.size / 1024).toFixed(1)} KB
                                  </span>

                                  {file.status === "processed" &&
                                    file.textLength && (
                                      <>
                                        <span className="text-slate-400">
                                          •
                                        </span>
                                        <span className="flex items-center gap-1">
                                          <svg
                                            className="w-3 h-3"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                            />
                                          </svg>
                                          {file.textLength.toLocaleString()}{" "}
                                          chars
                                        </span>
                                      </>
                                    )}

                                  {file.uploadedAt && (
                                    <>
                                      <span className="text-slate-400">•</span>
                                      <span className="flex items-center gap-1">
                                        <svg
                                          className="w-3 h-3"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                          />
                                        </svg>
                                        {new Date(
                                          file.uploadedAt,
                                        ).toLocaleDateString()}
                                      </span>
                                    </>
                                  )}
                                </div>

                                {file.status === "failed" && file.error && (
                                  <p className="text-xs text-red-500 mt-1">
                                    Error: {file.error}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Delete Button */}
                            <button
                              onClick={() =>
                                handleRemoveFile(index, file.fileName)
                              }
                              disabled={isUploading}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors shrink-0 ml-2 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Remove file"
                            >
                              <BiTrash className="w-5 h-5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Summary Stats */}
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-blue-700 font-medium">
                          📊 Total: {uploadedFiles.length} file
                          {uploadedFiles.length !== 1 ? "s" : ""}
                        </span>
                        <span className="text-blue-600">
                          {(
                            uploadedFiles.reduce(
                              (acc, f) => acc + (f.size || 0),
                              0,
                            ) / 1024
                          ).toFixed(1)}{" "}
                          KB total
                        </span>
                        <span className="text-blue-600">
                          {
                            uploadedFiles.filter(
                              (f) => f.status === "processed",
                            ).length
                          }{" "}
                          ready
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {activeTab === "Engine" && (
              <section>
                <Engine
                  engineConfig={engineConfig}
                  onChange={(config) => setEngineConfig(config)}
                />
              </section>
            )}
            {activeTab === "Call" && (
              <section>
                <Call
                  callConfig={callConfig}
                  onChange={(config) => setCallConfig(config)}
                />
              </section>
            )}
            {activeTab === "Tools" && (
              <section>
                <Tool />
              </section>
            )}
            {activeTab === "Analytics" && (
              <section>
                <Analytics
                  analyticsConfig={analyticsConfig}
                  onChange={(config) => setAnalyticsConfig(config)}
                />
              </section>
            )}
            {/* Other tabs (placeholders) */}
            {activeTab !== "Agent" &&
              activeTab !== "LLM" &&
              activeTab !== "Audio" &&
              activeTab !== "Voice" &&
              activeTab !== "Engine" &&
              activeTab !== "Call" &&
              activeTab !== "Tools" &&
              activeTab !== "Analytics" && (
                <section>
                  <div className="p-4 sm:p-6 bg-slate-50 rounded-md border border-dashed border-slate-100 text-xs sm:text-sm text-slate-600">
                    <div className="font-medium mb-2">{activeTab} settings</div>
                    <div className="text-xs sm:text-sm text-slate-500">
                      Use the SelectField pattern to add dropdowns and settings
                      for this tab.
                    </div>
                  </div>
                </section>
              )}
          </div>
        </main>

        {/* Right column - Testing panel */}
        <aside className="w-full xl:w-80 bg-white rounded-lg shadow-sm p-4 flex flex-col gap-4 max-h-[600px] xl:max-h-screen overflow-y-auto">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Agent Testing</div>
            <button className="text-slate-400">↗</button>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleSaveAgent}
              disabled={isSaving || (!isNewAgent && !isDirty)}
              className={`w-full px-3 py-2 text-white rounded-md transition-colors text-sm ${isSaving
                ? "bg-blue-400 cursor-not-allowed"
                : !isNewAgent && !isDirty
                  ? "bg-gray-300 cursor-not-allowed text-gray-500"
                  : "bg-blue-600 hover:bg-blue-700"
                }`}
            >
              {isSaving
                ? "Saving..."
                : isNewAgent
                  ? "Create Agent"
                  : "Update Agent"}
            </button>
            <div className="text-xs text-slate-400">
              {isNewAgent
                ? "Save to create a new agent"
                : isDirty
                  ? "You have unsaved changes"
                  : "All changes saved"}
            </div>

            {/* Chat Interface */}
            <div className="p-3 border rounded-md bg-slate-50">
              {!showChat ? (
                <>
                  <button
                    onClick={handleStartChat}
                    className="w-full px-3 py-2 border rounded-md bg-white hover:bg-gray-50 transition-colors text-sm"
                  >
                    💬 Chat with agent
                  </button>
                  <p className="text-xs text-slate-400 mt-2">
                    Chat is the fastest way to test and refine the agent.
                  </p>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Live Chat</span>
                    <button
                      onClick={() => setShowChat(false)}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      ✕ Close
                    </button>
                  </div>

                  {/* Chat Messages */}
                  <div className="bg-white border rounded-md p-3 max-h-48 sm:max-h-64 overflow-y-auto space-y-2">
                    {chatMessages.length === 0 ? (
                      <div className="text-xs text-slate-400 text-center py-4">
                        Start a conversation...
                      </div>
                    ) : (
                      chatMessages.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`p-2 rounded-md text-xs sm:text-sm overflow-wrap-break-word ${msg.role === "user"
                            ? "bg-blue-100 text-blue-900 ml-4"
                            : msg.role === "error"
                              ? "bg-red-100 text-red-900"
                              : "bg-gray-100 text-gray-900 mr-4"
                            }`}
                        >
                          <div className="text-xs font-semibold mb-1 opacity-75">
                            {msg.role === "user"
                              ? "You"
                              : msg.role === "error"
                                ? "Error"
                                : agentName}
                          </div>
                          {msg.content}
                        </div>
                      ))
                    )}
                    {isLoadingResponse && (
                      <div className="bg-gray-100 text-gray-900 p-2 rounded-md text-sm mr-4">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                          <div
                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: "0.1s" }}
                          ></div>
                          <div
                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: "0.2s" }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Chat Input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={userMessage}
                      onChange={(e) => setUserMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !isLoadingResponse) {
                          handleSendMessage();
                        }
                      }}
                      placeholder="Type a message..."
                      className="flex-1 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={isLoadingResponse}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={isLoadingResponse || !userMessage.trim()}
                      className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 transition-colors shrink-0"
                    >
                      ➤
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 border rounded-md bg-slate-50 text-sm">
              <button className="w-full px-3 py-2 border rounded-md text-sm">
                Test via web call
              </button>
              <p className="text-xs text-slate-400 mt-2">
                Test your agent with voice calls
              </p>
            </div>
          </div>

          <div className="mt-auto text-xs text-slate-400">
            <a className="underline">Purchase phone numbers</a>
          </div>
        </aside>
      </div>
      <AgentModal
        open={showAgentModal}
        onClose={() => setShowAgentModal(false)}
        onGenerate={handleCreateAgent}
        onCreateScratch={handleCreateScratch}
      />

      {/* Add Funds Modal */}
      {showAddFundsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="flex justify-between items-start p-6 border-b">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Add Funds</h2>
                <p className="text-gray-500 text-sm mt-1">Add money to your wallet</p>
              </div>
              <button onClick={() => setShowAddFundsModal(false)} className="text-gray-400 hover:text-gray-600">
                <MdClose className="text-2xl" />
              </button>
            </div>

            <AddFundsContent
              onSuccess={(newBalance) => {
                setWalletBalance(newBalance);
                setShowAddFundsModal(false);
              }}
              onClose={() => setShowAddFundsModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Add Funds Content Component
function AddFundsContent({ onSuccess, onClose }) {
  const [amount, setAmount] = useState(10);
  const [loading, setLoading] = useState(false);
  const presetAmounts = [5, 10, 25, 50, 100];
  const API_URL = import.meta.env.VITE_API_URL || "";

  const handlePayment = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");

      const orderRes = await api.post(
        "/api/payments/create-order",
        { amount }
      );

      if (!orderRes.data.success) {
        throw new Error(orderRes.data.error);
      }

      const { order, key } = orderRes.data;

      const options = {
        key,
        amount: order.amount,
        currency: order.currency,
        name: "CRM Landing Software",
        description: `Add $${amount} to wallet`,
        order_id: order.id,
        handler: async function (response) {
          try {
            const verifyRes = await api.post(
              "/api/payments/verify-payment",
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              }
            );

            if (verifyRes.data.success) {
              toast.success(`$${amount} added to wallet!`);
              onSuccess(verifyRes.data.walletBalance);
            }
          } catch (err) {
            toast.error("Payment verification failed");
          }
        },
        prefill: {
          email: localStorage.getItem("userEmail") || ""
        },
        theme: {
          color: "#2563eb"
        }
      };

      await loadRazorpay();
      const razorpay = new window.Razorpay(options);
      razorpay.open();

    } catch (error) {
      console.error("Payment error:", error);
      toast.error(error.response?.data?.error || "Failed to initiate payment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap gap-2">
        {presetAmounts.map((preset) => (
          <button
            key={preset}
            onClick={() => setAmount(preset)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${amount === preset
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
          >
            ${preset}
          </button>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Or enter custom amount
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <button
        onClick={handlePayment}
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white py-3 rounded-lg font-semibold text-lg transition-colors"
      >
        {loading ? "Processing..." : `Pay $${amount}`}
      </button>

      <p className="text-xs text-gray-500 text-center">
        Secure payment powered by Razorpay
      </p>
    </div>
  );
}
