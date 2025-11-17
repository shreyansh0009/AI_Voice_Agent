import OpenAI from 'openai';

// Initialize OpenAI client
// IMPORTANT: In production, store API key in environment variables
// For now, you'll need to replace 'your-api-key-here' with your actual key
// Better approach: Use .env file with VITE_OPENAI_API_KEY

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY || 'your-api-key-here',
  dangerouslyAllowBrowser: true // Only for development/demo purposes
});

// Simple in-memory cache for responses (reduces API calls for repeated questions)
const responseCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Generate cache key from messages
const getCacheKey = (messages) => {
  return JSON.stringify(messages.slice(-3)); // Cache based on last 3 messages
};

// Chat completion function with caching and optimization
export const createChatCompletion = async (messages, options = {}) => {
  try {
    // Check cache for recent identical requests
    const cacheKey = getCacheKey(messages);
    const cached = responseCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log('Using cached response');
      return {
        success: true,
        data: cached.data,
        cached: true,
        usage: cached.usage
      };
    }
    
    console.log('Creating chat completion with:', { messages, options });
    
    // Build the request with proper parameter names
    const requestParams = {
      model: options.model || 'gpt-3.5-turbo',
      messages: messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 500,
      // Add these for better performance
      top_p: options.top_p || 0.9,
      frequency_penalty: 0.3, // Reduce repetition
      presence_penalty: 0.3   // Encourage diverse responses
    };
    
    const response = await openai.chat.completions.create(requestParams);
    
    console.log('OpenAI response received:', response);
    
    const result = {
      success: true,
      data: response.choices[0].message.content,
      usage: response.usage
    };
    
    // Cache the response
    responseCache.set(cacheKey, {
      data: result.data,
      usage: result.usage,
      timestamp: Date.now()
    });
    
    // Clean old cache entries
    if (responseCache.size > 50) {
      const oldestKey = responseCache.keys().next().value;
      responseCache.delete(oldestKey);
    }
    
    return result;
  } catch (error) {
    console.error('OpenAI API Error:', error);
    console.error('Error details:', {
      message: error.message,
      status: error.status,
      type: error.type,
      code: error.code
    });
    
    let errorMessage = error.message;
    
    // Provide more helpful error messages
    if (error.status === 401) {
      errorMessage = 'Invalid API key. Please check your VITE_OPENAI_API_KEY in .env.local';
    } else if (error.status === 429) {
      errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
    } else if (error.status === 500) {
      errorMessage = 'OpenAI server error. Please try again later.';
    } else if (error.code === 'ENOTFOUND' || error.message.includes('fetch')) {
      errorMessage = 'Network error. Please check your internet connection.';
    }
    
    return {
      success: false,
      error: errorMessage
    };
  }
};

// Generate agent response
export const generateAgentResponse = async (userMessage, systemPrompt, agentConfig = {}) => {
  const messages = [
    {
      role: 'system',
      content: systemPrompt || 'You are a helpful AI assistant for customer service.'
    },
    {
      role: 'user',
      content: userMessage
    }
  ];

  return await createChatCompletion(messages, {
    model: agentConfig.model || 'gpt-3.5-turbo',
    temperature: agentConfig.temperature || 0.7,
    max_tokens: agentConfig.max_tokens || 300
  });
};

// Generate agent response with conversation history (optimized)
export const generateAgentResponseWithHistory = async (conversationHistory, userMessage, systemPrompt, agentConfig = {}) => {
  // Optimize: Keep only last 10 messages to reduce tokens and latency
  const recentHistory = conversationHistory.slice(-10);
  
  const messages = [
    {
      role: 'system',
      content: systemPrompt || 'You are a helpful AI assistant for customer service.'
    },
    ...recentHistory,
    {
      role: 'user',
      content: userMessage
    }
  ];

  return await createChatCompletion(messages, {
    model: agentConfig.model || 'gpt-3.5-turbo',
    temperature: agentConfig.temperature || 0.7,
    max_tokens: agentConfig.max_tokens || 500
  });
};

// Summarize call transcript
export const summarizeCallTranscript = async (transcript) => {
  const messages = [
    {
      role: 'system',
      content: 'You are an AI that summarizes call transcripts. Provide a concise summary highlighting key points, customer concerns, and outcomes.'
    },
    {
      role: 'user',
      content: `Please summarize this call transcript:\n\n${transcript}`
    }
  ];

  return await createChatCompletion(messages, {
    model: 'gpt-3.5-turbo',
    temperature: 0.3,
    max_tokens: 200
  });
};

// Analyze sentiment
export const analyzeSentiment = async (text) => {
  const messages = [
    {
      role: 'system',
      content: 'You are a sentiment analysis AI. Analyze the sentiment and respond with only: Positive, Negative, or Neutral, followed by a confidence score (0-100).'
    },
    {
      role: 'user',
      content: `Analyze the sentiment of this text:\n\n${text}`
    }
  ];

  return await createChatCompletion(messages, {
    model: 'gpt-3.5-turbo',
    temperature: 0.1,
    max_tokens: 50
  });
};

// Extract key information from call
export const extractCallInfo = async (transcript) => {
  const messages = [
    {
      role: 'system',
      content: 'Extract key information from call transcripts in JSON format: {customer_name, issue, resolution, action_items, next_steps}'
    },
    {
      role: 'user',
      content: `Extract key information from this call:\n\n${transcript}`
    }
  ];

  return await createChatCompletion(messages, {
    model: 'gpt-3.5-turbo',
    temperature: 0.2,
    max_tokens: 300
  });
};

export default openai;
