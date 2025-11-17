import React, { useState, useEffect } from "react";
import LLM from "../components/LLM.jsx";
import Audio from "../components/Audio.jsx";
import VoiceChat from "../components/VoiceChat.jsx";
import Engine from "../components/Engine.jsx";
import Call from "../components/Call.jsx";
import Tool from "../components/Tool.jsx";
import Analytics from '../components/Analytics.jsx'
import AgentModal from "../components/models/AgentModal.jsx";
import { generateAgentResponseWithHistory } from '../config/openai.js';
import { BiTrash } from 'react-icons/bi';

const TABS = [
  "Agent",
  "LLM",
  "Audio",
  "Voice",
  "Engine",
  "Call",
  "Tools",
  "Analytics",
  "Inbound",
];

export default function AgentSetupSingle() {
  const [activeTab, setActiveTab] = useState("Agent");
  const [agentName, setAgentName] = useState("My New Agent");
  const [welcome, setWelcome] = useState("Hello from crml");
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [prompt, setPrompt] = useState(
    "You are a helpful agent. You will help the customer with their queries and doubts. You will never speak more than 2 sentences. Keep your responses concise."
  );
  
  // State to store all created agents
  const [savedAgents, setSavedAgents] = useState([
    { id: 1, name: "Sales Assistant", status: "active", welcome: "Hi! I'm here to help with sales.", prompt: "You are a sales assistant." },
    { id: 2, name: "Support Agent", status: "active", welcome: "Hello! How can I support you?", prompt: "You are a support agent." }
  ]);
  
  // State to track currently selected agent
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [isNewAgent, setIsNewAgent] = useState(true);
  
  // Chat testing state
  const [chatMessages, setChatMessages] = useState([]);
  const [userMessage, setUserMessage] = useState('');
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);
  const [showChat, setShowChat] = useState(false);

  // Knowledge Base state
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);

  // Load chat history from localStorage on mount
  useEffect(() => {
    const savedChatHistory = localStorage.getItem('agent_chat_history');
    if (savedChatHistory) {
      try {
        const parsed = JSON.parse(savedChatHistory);
        setChatMessages(parsed);
      } catch (error) {
        console.error('Failed to load chat history:', error);
      }
    }
  }, []);

  // Load uploaded files from localStorage on mount
  useEffect(() => {
    const loadUploadedFiles = async () => {
      const savedFiles = localStorage.getItem('uploaded_knowledge_files');
      if (savedFiles) {
        try {
          const parsed = JSON.parse(savedFiles);
          console.log('📂 Loaded files from localStorage:', parsed);
          
          // Verify files still exist on server
          const response = await fetch('http://localhost:5000/api/knowledge-files');
          const data = await response.json();
          
          if (data.success) {
            // Match localStorage files with server files
            const serverFileNames = data.files.map(f => f.fileName);
            const validFiles = parsed.filter(file => serverFileNames.includes(file.fileName));
            
            if (validFiles.length !== parsed.length) {
              console.log('⚠️ Some files no longer exist on server, cleaning up...');
              localStorage.setItem('uploaded_knowledge_files', JSON.stringify(validFiles));
            }
            
            setUploadedFiles(validFiles);
          } else {
            setUploadedFiles(parsed);
          }
        } catch (error) {
          console.error('Failed to load uploaded files:', error);
          localStorage.removeItem('uploaded_knowledge_files');
        }
      } else {
        // If no localStorage, fetch from server
        fetchUploadedFiles();
      }
    };
    
    loadUploadedFiles();
  }, []);

  // Fetch uploaded files from server
  const fetchUploadedFiles = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/knowledge-files');
      const data = await response.json();
      
      if (data.success) {
        console.log('📂 Loaded files from server:', data.files);
        setUploadedFiles(data.files);
        localStorage.setItem('uploaded_knowledge_files', JSON.stringify(data.files));
      }
    } catch (error) {
      console.error('Failed to fetch files:', error);
    }
  };

  // Save uploaded files to localStorage whenever they change
  useEffect(() => {
    if (uploadedFiles.length > 0) {
      localStorage.setItem('uploaded_knowledge_files', JSON.stringify(uploadedFiles));
      console.log('💾 Saved files to localStorage:', uploadedFiles.length);
    } else {
      localStorage.removeItem('uploaded_knowledge_files');
    }
  }, [uploadedFiles]);

  // Cleanup: Delete files from server when browser closes/reloads
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Optional: Ask user if they want to keep files
      const savedFiles = localStorage.getItem('uploaded_knowledge_files');
      if (savedFiles) {
        const files = JSON.parse(savedFiles);
        if (files.length > 0) {
          // If you want to always delete files on close, uncomment this:
          // e.preventDefault();
          // e.returnValue = '';
          // await deleteAllFilesFromServer(files);
          
          // For now, we'll keep files persistent across reloads
          console.log('🔄 Page reload/close detected. Files preserved in localStorage.');
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Save chat history to localStorage whenever it changes
  useEffect(() => {
    if (chatMessages.length > 0) {
      localStorage.setItem('agent_chat_history', JSON.stringify(chatMessages));
    }
  }, [chatMessages]);

  function handleCreateAgent(payload) {
    // payload contains all modal fields
    console.log("Generated agent payload:", payload);
    // For now close modal and set agent name if provided
    if (payload?.name) setAgentName(payload.name);
    setShowAgentModal(false);

    // TODO: send payload to backend / create agent in app
  }
  
  // Function to save/create agent
  function handleSaveAgent() {
    const newAgent = {
      id: Date.now(), // Simple unique ID
      name: agentName,
      status: "draft",
      welcome: welcome,
      prompt: prompt,
      createdAt: new Date().toISOString()
    };
    
    if (isNewAgent) {
      // Add new agent to the list
      setSavedAgents([newAgent, ...savedAgents]);
      setSelectedAgentId(newAgent.id);
      setIsNewAgent(false);
      alert(`Agent "${agentName}" created successfully!`);
    } else if (selectedAgentId) {
      // Update existing agent
      setSavedAgents(savedAgents.map(agent => 
        agent.id === selectedAgentId 
          ? { ...agent, name: agentName, welcome: welcome, prompt: prompt }
          : agent
      ));
      alert(`Agent "${agentName}" updated successfully!`);
    }
  }
  
  // Function to select an agent from the list
  function handleSelectAgent(agent) {
    setSelectedAgentId(agent.id);
    setAgentName(agent.name);
    setWelcome(agent.welcome);
    setPrompt(agent.prompt);
    setIsNewAgent(false);
  }
  
  // Function to create a new blank agent
  function handleNewAgent() {
    setIsNewAgent(true);
    setSelectedAgentId(null);
    setAgentName("My New Agent");
    setWelcome("Hello from crml");
    setPrompt("You are a helpful agent. You will help the customer with their queries and doubts. You will never speak more than 2 sentences. Keep your responses concise.");
    setChatMessages([]);
  }
  
  // Function to delete an agent
  function handleDeleteAgent(agentId, agentName, event) {
    event.stopPropagation(); // Prevent selecting the agent when clicking delete
    
    if (window.confirm(`Are you sure you want to delete "${agentName}"?`)) {
      setSavedAgents(savedAgents.filter(agent => agent.id !== agentId));
      
      // If deleted agent was selected, reset to new agent
      if (selectedAgentId === agentId) {
        handleNewAgent();
      }
      
      alert(`Agent "${agentName}" deleted successfully!`);
    }
  }
  
  // Function to send message to agent and get response
  async function handleSendMessage() {
    if (!userMessage.trim()) return;
    
    // Add user message to chat
    const newUserMessage = { role: 'user', content: userMessage };
    setChatMessages(prev => [...prev, newUserMessage]);
    setUserMessage('');
    setIsLoadingResponse(true);
    
    try {
      // Build conversation history for context
      const conversationHistory = chatMessages.map(msg => ({
        role: msg.role === 'error' ? 'assistant' : msg.role,
        content: msg.content
      }));
      
      // Use the agent's custom prompt with full conversation context
      const result = await generateAgentResponseWithHistory(
        conversationHistory,
        userMessage, 
        prompt,
        {
          temperature: 0.7,
          max_tokens: 500
        }
      );
      
      if (result.success) {
        const aiMessage = { role: 'assistant', content: result.data };
        setChatMessages(prev => [...prev, aiMessage]);
      } else {
        const errorMessage = { role: 'error', content: `Error: ${result.error}` };
        setChatMessages(prev => [...prev, errorMessage]);
      }
    } catch {
      const errorMessage = { role: 'error', content: 'Failed to get response from agent' };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoadingResponse(false);
    }
  }
  
  // Function to start fresh chat
  function handleStartChat() {
    setChatMessages([]);
    localStorage.removeItem('agent_chat_history'); // Clear localStorage
    // Add welcome message as first message if it exists
    if (welcome && welcome.trim()) {
      setChatMessages([{ role: 'assistant', content: welcome }]);
    }
    setShowChat(true);
  }

  // Knowledge Base file upload handlers
  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    
    if (files.length === 0) return;
    
    // Validate files
    const validFiles = files.filter(file => {
      const extension = file.name.split('.').pop().toLowerCase();
      const isValid = ['pdf', 'doc', 'docx'].includes(extension);
      const isUnderLimit = file.size <= 10 * 1024 * 1024; // 10MB
      
      if (!isValid) {
        setUploadError(`${file.name}: Invalid file type. Only PDF, DOC, DOCX allowed.`);
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
      validFiles.forEach(file => {
        formData.append('files', file);
      });

      const response = await fetch('http://localhost:5000/api/upload-knowledge', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        const newFiles = [...uploadedFiles, ...data.files];
        setUploadedFiles(newFiles);
        
        // Save to localStorage
        localStorage.setItem('uploaded_knowledge_files', JSON.stringify(newFiles));
        console.log('💾 Saved to localStorage after upload:', newFiles.length, 'files');
        
        setUploadSuccess(`Successfully uploaded ${data.files.length} file(s)`);
        
        // Clear success message after 3 seconds
        setTimeout(() => setUploadSuccess(null), 3000);
      } else {
        setUploadError(data.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadError('Failed to upload files. Make sure the server is running.');
    } finally {
      setIsUploading(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const handleRemoveFile = async (index, fileName) => {
    try {
      const response = await fetch(`http://localhost:5000/api/knowledge-files/${fileName}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        const updatedFiles = uploadedFiles.filter((_, i) => i !== index);
        setUploadedFiles(updatedFiles);
        
        // Update localStorage
        if (updatedFiles.length > 0) {
          localStorage.setItem('uploaded_knowledge_files', JSON.stringify(updatedFiles));
        } else {
          localStorage.removeItem('uploaded_knowledge_files');
        }
        console.log('🗑️ File removed and localStorage updated');
        
        setUploadSuccess('File removed successfully');
        setTimeout(() => setUploadSuccess(null), 2000);
      } else {
        setUploadError('Failed to remove file');
      }
    } catch (error) {
      console.error('Delete error:', error);
      setUploadError('Failed to remove file');
    }
  };

  // Function to clear all uploaded files
  const handleClearAllFiles = async () => {
    if (uploadedFiles.length === 0) return;
    
    const confirmed = window.confirm(
      `Are you sure you want to delete all ${uploadedFiles.length} file(s)? This action cannot be undone.`
    );
    
    if (!confirmed) return;
    
    setIsUploading(true);
    let successCount = 0;
    let failCount = 0;
    
    for (const file of uploadedFiles) {
      try {
        const response = await fetch(`http://localhost:5000/api/knowledge-files/${file.fileName}`, {
          method: 'DELETE',
        });
        
        const data = await response.json();
        if (data.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        console.error('Failed to delete:', file.fileName, error);
        failCount++;
      }
    }
    
    // Clear state and localStorage
    setUploadedFiles([]);
    localStorage.removeItem('uploaded_knowledge_files');
    
    setIsUploading(false);
    setUploadSuccess(`Deleted ${successCount} file(s)${failCount > 0 ? `, ${failCount} failed` : ''}`);
    setTimeout(() => setUploadSuccess(null), 3000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-2 sm:p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Agent setup</h1>
          <p className="text-xs sm:text-sm text-slate-500">Fine tune your agents</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <div className="text-xs sm:text-sm text-slate-500 whitespace-nowrap">
            Available balance: <span className="font-medium">$5.00</span>
          </div>
          <button className="px-2 sm:px-3 py-1 rounded-md bg-white border shadow-sm text-xs sm:text-sm whitespace-nowrap">
            Add more funds
          </button>
          <button className="px-2 sm:px-3 py-1 rounded-md bg-white border text-xs sm:text-sm">Help</button>
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
            <button className="flex-1 text-sm px-3 py-2 rounded-md bg-slate-100 border">Import</button>
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
                <div className="text-sm font-medium text-blue-700">New Agent (Unsaved)</div>
                <div className="text-xs text-blue-600">editing</div>
              </div>
            )}

            {/* List of saved agents */}
            <div className="space-y-2">
              {savedAgents.map((agent) => (
                <div
                  key={agent.id}
                  onClick={() => handleSelectAgent(agent)}
                  className={`p-3 rounded-md border cursor-pointer transition-all ${
                    selectedAgentId === agent.id
                      ? 'bg-blue-50 border-blue-500'
                      : 'bg-white border-slate-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{agent.name}</div>
                      <div className={`text-xs mt-1 ${agent.status === 'active' ? 'text-green-600' : 'text-slate-400'}`}>
                        {agent.status}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteAgent(agent.id, agent.name, e)}
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
          <div className="flex flex-col lg:flex-row items-start justify-between mb-4 gap-3 lg:gap-4">
            <div className="flex-1 w-full min-w-0">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 flex-wrap">
                <input
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  className="text-lg sm:text-xl md:text-2xl font-semibold border-b border-transparent focus:border-blue-500 focus:outline-none w-full sm:w-auto min-w-0 max-w-full sm:max-w-xs"
                  placeholder="Enter agent name"
                />
                {isNewAgent && (
                  <span className="text-xs sm:text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded whitespace-nowrap">Unsaved</span>
                )}
                <div className="text-xs sm:text-sm text-slate-500 whitespace-nowrap">
                  Cost per min: <span className="font-medium">~ $0.094</span>
                </div>
              </div>

              <div className="mt-3 w-full max-w-2xl h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-3 w-3/4 bg-linear-to-r from-orange-400 via-blue-500 to-sky-600" />
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2 text-xs text-slate-400">
                <span>Transcriber</span>
                <span className="hidden sm:inline">•</span>
                <span>LLM</span>
                <span className="hidden sm:inline">•</span>
                <span>Voice</span>
                <span className="hidden sm:inline">•</span>
                <span>Telephony</span>
                <span className="hidden sm:inline">•</span>
                <span>Platform</span>
              </div>
            </div>

            <div className="flex flex-col items-start lg:items-end gap-2 w-full lg:w-auto shrink-0">
              <div className="flex gap-2 w-full lg:w-auto">
                <button className="flex-1 lg:flex-none px-3 py-1 rounded-md border text-xs sm:text-sm whitespace-nowrap">Agent ID</button>
                <button className="flex-1 lg:flex-none px-3 py-1 rounded-md border text-xs sm:text-sm">Share</button>
              </div>
              <div className="w-full lg:w-auto">
                <button className="w-full px-4 py-2 bg-sky-600 text-white rounded-md text-xs sm:text-sm whitespace-nowrap hover:bg-sky-700 transition-colors">Get call from agent</button>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-6 border-b overflow-x-auto">
            <nav className="flex gap-2 sm:gap-4 pb-2 min-w-max">
              {TABS.map((t) => {
                const active = t === activeTab;
                return (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={`relative pb-2 text-xs sm:text-sm whitespace-nowrap ${active ? "text-sky-600 font-semibold" : "text-slate-600"}`}
                    aria-current={active ? "page" : undefined}
                  >
                    {t}
                    {active && <span className="absolute left-0 -bottom-2 w-full h-0.5 bg-sky-600 rounded" />}
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
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold mb-1">Agent Welcome Message</label>
                    <input
                      value={welcome}
                      onChange={(e) => setWelcome(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs sm:text-sm"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      This will be the initial message from the agent. You can use variables here using{" "}
                      <code className="bg-slate-50 px-1 rounded">{`{variable_name}`}</code>
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold mb-1">Agent Prompt</label>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={8}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs sm:text-sm font-mono"
                      placeholder="Enter your agent's system prompt here..."
                    />
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-xs text-blue-800 font-medium mb-1">💡 Pro Tip:</p>
                      <p className="text-xs text-blue-700">
                        The agent will follow this prompt exactly. You can include:
                      </p>
                      <ul className="text-xs text-blue-700 mt-1 ml-3 space-y-0.5">
                        <li>• Conversation flows & sections</li>
                        <li>• Product knowledge & troubleshooting</li>
                        <li>• Language preferences (English/Hindi)</li>
                        <li>• Personality & tone guidelines</li>
                        <li>• Guardrails & boundaries</li>
                      </ul>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold">You can fill in your following prompt variables for testing</h3>
                    <div className="mt-2 text-xs text-slate-500">(variables UI placeholder)</div>
                  </div>
                </div>
              </section>
            )}

            {/* LLM Tab: separate component imported */}
            {activeTab === "LLM" && (
              <section>
                <LLM />
              </section>
            )}

            {activeTab === "Audio" && (
              <section>
                <Audio />
              </section>
            )}
            {activeTab === "Voice" && (
              <section>
                {/* Knowledge Base Section */}
                <div className="mb-6 bg-white rounded-lg border border-slate-200 p-3 sm:p-4 md:p-6">
                  <h3 className="text-base sm:text-lg font-semibold mb-4">Knowledge Base</h3>
                  
                  <div className="mb-4">
                    <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-2">
                      Upload Documents (PDF, Word)
                    </label>
                    <p className="text-xs text-slate-500 mb-3">
                      Upload documents to enhance your agent's knowledge. The agent will use this information to answer questions more accurately.
                    </p>
                    
                    {/* File Upload Input */}
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                        <label className={`flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer transition-colors w-full sm:w-auto ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          <svg className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <span className="text-xs sm:text-sm font-medium">
                            {isUploading ? 'Uploading...' : 'Choose Files'}
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
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-sm text-green-700">{uploadSuccess}</span>
                        </div>
                      )}

                      {uploadError && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          <span className="text-sm text-red-700">{uploadError}</span>
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
                          const isPDF = file.originalName?.toLowerCase().endsWith('.pdf');
                          const isWord = file.originalName?.toLowerCase().match(/\.(doc|docx)$/);
                          
                          return (
                            <div
                              key={`${file.fileName}-${index}`}
                              className="flex items-start justify-between p-3 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors"
                            >
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                {/* File Icon */}
                                <div className={`shrink-0 mt-0.5 ${file.status === 'processed' ? 'text-green-600' : file.status === 'failed' ? 'text-red-600' : 'text-blue-600'}`}>
                                  {isPDF ? (
                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18.5,9L13,3.5V9H18.5M6,20V4H11V10H18V20H6M7.93,17.5H9.61L9.85,16.74H11.58L11.82,17.5H13.5L11.58,12.5H9.85L7.93,17.5M10.15,15.43L10.71,13.34L11.27,15.43H10.15Z" />
                                    </svg>
                                  ) : isWord ? (
                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18.5,9L13,3.5V9H18.5M7,12.5L8.5,17.5H9.5L10.5,14L11.5,17.5H12.5L14,12.5H13L12,15.5L11,12.5H10L9,15.5L8,12.5H7Z" />
                                    </svg>
                                  ) : (
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                  )}
                                </div>
                                
                                {/* File Info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-slate-700 truncate">
                                      {file.originalName}
                                    </p>
                                    {file.status === 'processed' && (
                                      <span className="shrink-0 px-2 py-0.5 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                                        ✓ Ready
                                      </span>
                                    )}
                                    {file.status === 'failed' && (
                                      <span className="shrink-0 px-2 py-0.5 text-xs font-medium text-red-700 bg-red-100 rounded-full">
                                        ✗ Failed
                                      </span>
                                    )}
                                  </div>
                                  
                                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                                    <span className="flex items-center gap-1">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                      {(file.size / 1024).toFixed(1)} KB
                                    </span>
                                    
                                    {file.status === 'processed' && file.textLength && (
                                      <>
                                        <span className="text-slate-400">•</span>
                                        <span className="flex items-center gap-1">
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                          </svg>
                                          {file.textLength.toLocaleString()} chars
                                        </span>
                                      </>
                                    )}
                                    
                                    {file.uploadedAt && (
                                      <>
                                        <span className="text-slate-400">•</span>
                                        <span className="flex items-center gap-1">
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                          {new Date(file.uploadedAt).toLocaleDateString()}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                  
                                  {file.status === 'failed' && file.error && (
                                    <p className="text-xs text-red-500 mt-1">
                                      Error: {file.error}
                                    </p>
                                  )}
                                </div>
                              </div>
                              
                              {/* Delete Button */}
                              <button
                                onClick={() => handleRemoveFile(index, file.fileName)}
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
                            📊 Total: {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''}
                          </span>
                          <span className="text-blue-600">
                            {(uploadedFiles.reduce((acc, f) => acc + (f.size || 0), 0) / 1024).toFixed(1)} KB total
                          </span>
                          <span className="text-blue-600">
                            {uploadedFiles.filter(f => f.status === 'processed').length} ready
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Info Box */}
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-xs text-blue-800 font-medium mb-1">💡 How it works:</p>
                    <ul className="text-xs text-blue-700 space-y-0.5 ml-3">
                      <li>• Upload product manuals, FAQs, or company documents</li>
                      <li>• The agent will extract and learn from the content</li>
                      <li>• Use this knowledge to answer customer questions accurately</li>
                      <li>• Maximum file size: 10MB per file</li>
                    </ul>
                  </div>
                </div>

                {/* Voice Chat Component */}
                <VoiceChat systemPrompt={prompt} agentName={agentName} />
              </section>
            )}
            {activeTab === "Engine" && (
              <section>
                <Engine />
              </section>
            )}
            {activeTab === "Call" && (
              <section>
                <Call />
              </section>
            )}
             {activeTab === "Tools" && (
              <section>
                <Tool />
              </section>
            )}
             {activeTab === "Analytics" && (
              <section>
                <Analytics />
              </section>
            )}
            {/* Other tabs (placeholders) */}
            {activeTab !== "Agent" && activeTab !== "LLM" && activeTab !== "Audio" && activeTab !== "Voice" && activeTab !== "Engine" && activeTab !== "Call" && activeTab !== "Tools" && activeTab !== "Analytics" && (
              <section>
                <div className="p-4 sm:p-6 bg-slate-50 rounded-md border border-dashed border-slate-100 text-xs sm:text-sm text-slate-600">
                  <div className="font-medium mb-2">{activeTab} settings</div>
                  <div className="text-xs sm:text-sm text-slate-500">Use the SelectField pattern to add dropdowns and settings for this tab.</div>
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
              className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-sm"
            >
              {isNewAgent ? 'Create Agent' : 'Update Agent'}
            </button>
            <div className="text-xs text-slate-400">
              {isNewAgent ? 'Save to create a new agent' : 'Last updated a few seconds ago'}
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
                          className={`p-2 rounded-md text-xs sm:text-sm overflow-wrap-break-word ${
                            msg.role === 'user'
                              ? 'bg-blue-100 text-blue-900 ml-4'
                              : msg.role === 'error'
                              ? 'bg-red-100 text-red-900'
                              : 'bg-gray-100 text-gray-900 mr-4'
                          }`}
                        >
                          <div className="text-xs font-semibold mb-1 opacity-75">
                            {msg.role === 'user' ? 'You' : msg.role === 'error' ? 'Error' : agentName}
                          </div>
                          {msg.content}
                        </div>
                      ))
                    )}
                    {isLoadingResponse && (
                      <div className="bg-gray-100 text-gray-900 p-2 rounded-md text-sm mr-4">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
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
                        if (e.key === 'Enter' && !isLoadingResponse) {
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
              <button className="w-full px-3 py-2 border rounded-md text-sm">Test via web call</button>
              <p className="text-xs text-slate-400 mt-2">Test your agent with voice calls</p>
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
      />
    </div>
  );
}
