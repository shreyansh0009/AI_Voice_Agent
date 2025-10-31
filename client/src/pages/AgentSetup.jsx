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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold">Agent setup</h1>
          <p className="text-sm text-slate-500">Fine tune your agents</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-sm text-slate-500">
            Available balance: <span className="font-medium">$5.00</span>
          </div>
          <button className="px-3 py-1 rounded-md bg-white border shadow-sm text-sm">
            Add more funds
          </button>
          <button className="px-3 py-1 rounded-md bg-white border text-sm">Help</button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left column */}
        <aside className="w-64 bg-white rounded-lg shadow-sm p-4 flex flex-col gap-4">
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
        <main className="flex-1 bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-start justify-between mb-4 gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-4">
                <input
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  className="text-2xl font-semibold border-b border-transparent focus:border-blue-500 focus:outline-none"
                  placeholder="Enter agent name"
                />
                {isNewAgent && (
                  <span className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded">Unsaved</span>
                )}
                <div className="text-sm text-slate-500">
                  Cost per min: <span className="font-medium">~ $0.094</span>
                </div>
              </div>

              <div className="mt-3 w-80 h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-3 w-3/4 bg-linear-to-r from-orange-400 via-blue-500 to-sky-600" />
              </div>

              <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                <span>Transcriber</span>
                <span>•</span>
                <span>LLM</span>
                <span>•</span>
                <span>Voice</span>
                <span>•</span>
                <span>Telephony</span>
                <span>•</span>
                <span>Platform</span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-2">
                <button className="px-3 py-1 rounded-md border text-sm">Agent ID</button>
                <button className="px-3 py-1 rounded-md border text-sm">Share</button>
              </div>
              <div className="mt-2">
                <button className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm">Get call from agent</button>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-6 border-b">
            <nav className="flex gap-4 overflow-x-auto pb-2">
              {TABS.map((t) => {
                const active = t === activeTab;
                return (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={`relative pb-2 text-sm ${active ? "text-sky-600 font-semibold" : "text-slate-600"}`}
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
                    <label className="block text-sm font-semibold mb-1">Agent Welcome Message</label>
                    <input
                      value={welcome}
                      onChange={(e) => setWelcome(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      This will be the initial message from the agent. You can use variables here using{" "}
                      <code className="bg-slate-50 px-1 rounded">{`{variable_name}`}</code>
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-1">Agent Prompt</label>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={8}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono"
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
                    <h3 className="text-sm font-semibold">You can fill in your following prompt variables for testing</h3>
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
            {activeTab !== "Agent" && activeTab !== "LLM" && (
              <section>
                <div className="p-6 bg-slate-50 rounded-md border border-dashed border-slate-100 text-sm text-slate-600">
                  <div className="font-medium mb-2">{activeTab} settings</div>
                  <div className="text-sm text-slate-500">Use the SelectField pattern to add dropdowns and settings for this tab.</div>
                </div>
              </section>
            )}
          </div>
        </main>

        {/* Right column */}
        <aside className="w-80 bg-white rounded-lg shadow-sm p-4 flex flex-col gap-4 max-h-screen overflow-y-auto">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Agent Testing</div>
            <button className="text-slate-400">↗</button>
          </div>

          <div className="space-y-3">
            <button 
              onClick={handleSaveAgent}
              className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
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
                    className="w-full px-3 py-2 border rounded-md bg-white hover:bg-gray-50 transition-colors"
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
                  <div className="bg-white border rounded-md p-3 max-h-64 overflow-y-auto space-y-2">
                    {chatMessages.length === 0 ? (
                      <div className="text-xs text-slate-400 text-center py-4">
                        Start a conversation...
                      </div>
                    ) : (
                      chatMessages.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`p-2 rounded-md text-sm ${
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
                      className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
                    >
                      ➤
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 border rounded-md bg-slate-50 text-sm">
              <button className="w-full px-3 py-2 border rounded-md">Test via web call</button>
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
