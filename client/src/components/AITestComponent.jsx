import { useState, useEffect } from 'react';
import { generateAgentResponseWithHistory, summarizeCallTranscript, analyzeSentiment } from '../config/openai';
import { BiSend, BiBot } from 'react-icons/bi';
import { IoPersonOutline } from 'react-icons/io5';
import { MdOutlineAnalytics } from 'react-icons/md';

const AITestComponent = () => {
  const [selectedTest, setSelectedTest] = useState('chat');
  const [userInput, setUserInput] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('You are a professional customer service agent for a CRM company. Be helpful, friendly, and concise.');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);

  // Load chat history from localStorage on mount
  useEffect(() => {
    const savedTestChatHistory = localStorage.getItem('test_chat_history');
    if (savedTestChatHistory) {
      try {
        const parsed = JSON.parse(savedTestChatHistory);
        setChatHistory(parsed);
      } catch (error) {
        console.error('Failed to load test chat history:', error);
      }
    }
  }, []);

  // Save chat history to localStorage whenever it changes
  useEffect(() => {
    if (chatHistory.length > 0) {
      localStorage.setItem('test_chat_history', JSON.stringify(chatHistory));
    }
  }, [chatHistory]);

  const handleChatTest = async () => {
    if (!userInput.trim()) return;

    setLoading(true);
    const userMessage = { role: 'user', content: userInput };
    setChatHistory(prev => [...prev, userMessage]);

    console.log('Sending message to OpenAI:', userInput);
    console.log('System prompt:', systemPrompt);
    console.log('API Key exists:', !!import.meta.env.VITE_OPENAI_API_KEY);

    // Build conversation history
    const conversationHistory = chatHistory.map(msg => ({
      role: msg.role === 'error' ? 'assistant' : msg.role,
      content: msg.content
    }));

    // Call OpenAI with conversation history
    const result = await generateAgentResponseWithHistory(
      conversationHistory,
      userInput,
      systemPrompt,
      {
        temperature: 0.7,
        max_tokens: 500
      }
    );
    
    console.log('OpenAI Response:', result);
    
    setLoading(false);
    setResponse(result);

    if (result.success) {
      const aiMessage = { role: 'assistant', content: result.data };
      setChatHistory(prev => [...prev, aiMessage]);
    } else {
      // Show error in chat
      const errorMessage = { role: 'error', content: result.error || 'Failed to get response' };
      setChatHistory(prev => [...prev, errorMessage]);
    }

    setUserInput('');
  };

  const handleSummarizeTest = async () => {
    if (!userInput.trim()) return;

    setLoading(true);
    const result = await summarizeCallTranscript(userInput);
    setLoading(false);
    setResponse(result);
  };

  const handleSentimentTest = async () => {
    if (!userInput.trim()) return;

    setLoading(true);
    const result = await analyzeSentiment(userInput);
    setLoading(false);
    setResponse(result);
  };

  const runTest = () => {
    switch (selectedTest) {
      case 'chat':
        handleChatTest();
        break;
      case 'summarize':
        handleSummarizeTest();
        break;
      case 'sentiment':
        handleSentimentTest();
        break;
      default:
        break;
    }
  };

  const sampleData = {
    chat: 'I need help with resetting my password.',
    summarize: 'Agent: Hello, thank you for calling. How can I help you today?\nCustomer: Hi, I\'m having issues with my account login.\nAgent: I understand. Let me help you with that. Can you provide your email?\nCustomer: Sure, it\'s john@example.com\nAgent: Thank you. I\'ve sent a password reset link to your email.\nCustomer: Great, I received it and was able to reset my password. Thank you!\nAgent: You\'re welcome! Is there anything else I can help you with?\nCustomer: No, that\'s all. Thanks again!\nAgent: Have a great day!',
    sentiment: 'The service was absolutely terrible. I waited for an hour and nobody helped me. Very disappointed!'
  };

  const loadSampleData = () => {
    setUserInput(sampleData[selectedTest]);
  };

  const clearChat = () => {
    setChatHistory([]);
    localStorage.removeItem('test_chat_history'); // Clear localStorage
    setResponse(null);
    setUserInput('');
  };

  return (
    <div className="bg-linear-to-br from-purple-50 via-blue-50 to-cyan-50 rounded-lg lg:rounded-xl shadow-sm lg:shadow-lg p-4 lg:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-linear-to-r from-purple-500 to-blue-500 p-2 rounded-lg">
            <BiBot className="text-white text-xl lg:text-2xl" />
          </div>
          <div>
            <h2 className="text-lg lg:text-xl font-bold text-gray-800">AI Testing Hub</h2>
            <p className="text-xs lg:text-sm text-gray-600">Test OpenAI GPT-3.5 Turbo Integration</p>
          </div>
        </div>
        
        <button
          onClick={clearChat}
          className="w-full sm:w-auto px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm transition-colors"
        >
          Clear Chat
        </button>
      </div>

      {/* Test Type Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <button
          onClick={() => setSelectedTest('chat')}
          className={`p-4 rounded-lg border-2 transition-all ${
            selectedTest === 'chat'
              ? 'border-purple-500 bg-purple-50'
              : 'border-gray-200 hover:border-purple-300'
          }`}
        >
          <BiBot className="text-2xl mb-2 mx-auto text-purple-500" />
          <div className="text-sm font-semibold">Chat Agent</div>
          <div className="text-xs text-gray-600">Test conversational AI</div>
        </button>

        <button
          onClick={() => setSelectedTest('summarize')}
          className={`p-4 rounded-lg border-2 transition-all ${
            selectedTest === 'summarize'
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-blue-300'
          }`}
        >
          <MdOutlineAnalytics className="text-2xl mb-2 mx-auto text-blue-500" />
          <div className="text-sm font-semibold">Summarization</div>
          <div className="text-xs text-gray-600">Summarize call transcripts</div>
        </button>

        <button
          onClick={() => setSelectedTest('sentiment')}
          className={`p-4 rounded-lg border-2 transition-all ${
            selectedTest === 'sentiment'
              ? 'border-cyan-500 bg-cyan-50'
              : 'border-gray-200 hover:border-cyan-300'
          }`}
        >
          <IoPersonOutline className="text-2xl mb-2 mx-auto text-cyan-500" />
          <div className="text-sm font-semibold">Sentiment Analysis</div>
          <div className="text-xs text-gray-600">Analyze customer sentiment</div>
        </button>
      </div>

      {/* System Prompt (only for chat) */}
      {selectedTest === 'chat' && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            System Prompt (Agent Personality)
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
            rows="2"
            placeholder="Define how the AI should behave..."
          />
        </div>
      )}

      {/* Chat History (only for chat) */}
      {selectedTest === 'chat' && chatHistory.length > 0 && (
        <div className="mb-4 bg-white rounded-lg p-4 max-h-64 overflow-y-auto space-y-3">
          {chatHistory.map((msg, idx) => (
            <div
              key={idx}
              className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-purple-500 text-white'
                    : msg.role === 'error'
                    ? 'bg-red-100 text-red-800 border border-red-300'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                <div className="text-xs opacity-75 mb-1">
                  {msg.role === 'user' ? 'You' : msg.role === 'error' ? '⚠️ Error' : 'AI Agent'}
                </div>
                <div className="text-sm">{msg.content}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 p-3 rounded-lg">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input Area */}
      <div className="space-y-3 mb-4">
        <div className="flex gap-2">
          <textarea
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                runTest();
              }
            }}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
            rows={selectedTest === 'chat' ? '2' : '6'}
            placeholder={
              selectedTest === 'chat'
                ? 'Type your message...'
                : selectedTest === 'summarize'
                ? 'Paste call transcript...'
                : 'Enter text to analyze sentiment...'
            }
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={runTest}
            disabled={loading || !userInput.trim()}
            className="flex-1 bg-linear-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:from-gray-300 disabled:to-gray-400 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-all"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Processing...
              </>
            ) : (
              <>
                <BiSend className="text-lg" />
                {selectedTest === 'chat' ? 'Send Message' : `Run ${selectedTest}`}
              </>
            )}
          </button>

          <button
            onClick={loadSampleData}
            className="w-full sm:w-auto px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm transition-colors"
          >
            Load Sample
          </button>
        </div>
      </div>

      {/* Response Display (for summarize and sentiment) */}
      {selectedTest !== 'chat' && response && (
        <div className="mt-4 bg-white rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <BiBot className="text-purple-500 text-xl" />
            <h3 className="font-semibold text-gray-800">AI Response</h3>
          </div>
          
          {response.success ? (
            <div>
              <div className="bg-gray-50 p-4 rounded-lg mb-3">
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{response.data}</p>
              </div>
              
              {response.usage && (
                <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                  <span>Prompt Tokens: {response.usage.prompt_tokens}</span>
                  <span>Completion Tokens: {response.usage.completion_tokens}</span>
                  <span>Total Tokens: {response.usage.total_tokens}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
              <p className="text-sm text-red-700">Error: {response.error}</p>
              <p className="text-xs text-red-600 mt-2">
                Make sure your API key is correctly set in .env file
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AITestComponent;
