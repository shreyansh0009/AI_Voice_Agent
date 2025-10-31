# OpenAI Integration Guide

## 🚀 Quick Start

Your AI Voice CRM now has **OpenAI GPT-3.5 Turbo** integration! Follow these steps to get started.

---

## 📋 Setup Instructions

### 1. Add Your API Key

Open the file `/client/.env.local` and replace `your-gpt-3.5-turbo-api-key-here` with your actual API key:

```env
VITE_OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx
```

**Get your API key from:** https://platform.openai.com/api-keys

⚠️ **Important:** Never commit `.env.local` to git (it's already in `.gitignore`)

---

### 2. Restart Dev Server

After adding your API key, restart the Vite dev server:

```bash
cd client
npm run dev
```

---

### 3. Test the Integration

1. Open your dashboard at `http://localhost:5173`
2. Scroll down to the **"AI Testing Hub"** section (at the bottom)
3. You'll see 3 test modes:
   - 🤖 **Chat Agent** - Conversational AI for customer service
   - 📊 **Summarization** - Summarize call transcripts
   - 😊 **Sentiment Analysis** - Analyze customer sentiment

---

## 🎯 Features Implemented

### 1. Chat Agent
- Real-time conversational AI
- Customizable system prompts (agent personality)
- Chat history with messages
- Perfect for testing customer service scenarios

**Example use case:**
- System Prompt: "You are a professional customer service agent for a CRM company."
- User: "I need help resetting my password"
- AI responds with helpful, friendly guidance

### 2. Call Transcript Summarization
- Paste entire call transcripts
- Get concise summaries highlighting:
  - Key points
  - Customer concerns
  - Outcomes
  - Action items

### 3. Sentiment Analysis
- Analyze customer sentiment from text
- Get sentiment classification (Positive/Negative/Neutral)
- Confidence score included

---

## 🛠️ Technical Implementation

### Files Created

1. **`/client/src/config/openai.js`**
   - OpenAI client initialization
   - Helper functions for chat, summarization, sentiment analysis
   - Error handling and token usage tracking

2. **`/client/src/components/AITestComponent.jsx`**
   - Interactive testing interface
   - 3 testing modes with sample data
   - Real-time chat interface
   - Token usage display

3. **`/client/.env.local`**
   - Secure API key storage
   - Already excluded from git

4. **`/client/.env.example`**
   - Template for team members

---

## 📚 API Functions Available

### In `/client/src/config/openai.js`:

```javascript
// Generic chat completion
createChatCompletion(messages, options)

// Generate agent response with system prompt
generateAgentResponse(userMessage, systemPrompt, agentConfig)

// Summarize call transcripts
summarizeCallTranscript(transcript)

// Analyze sentiment
analyzeSentiment(text)

// Extract key information from calls
extractCallInfo(transcript)
```

---

## 🔧 How to Use in Your Own Components

### Example: Add AI to any component

```javascript
import { generateAgentResponse } from '../config/openai';

const MyComponent = () => {
  const handleAIResponse = async () => {
    const result = await generateAgentResponse(
      "Customer needs help with billing",
      "You are a helpful billing support agent."
    );
    
    if (result.success) {
      console.log(result.data); // AI response
      console.log(result.usage); // Token usage
    }
  };
  
  return <button onClick={handleAIResponse}>Ask AI</button>;
};
```

---

## 💡 Advanced Configuration

### Customize AI Behavior

Edit the functions in `/client/src/config/openai.js`:

```javascript
const result = await createChatCompletion(messages, {
  model: 'gpt-3.5-turbo',        // Model to use
  temperature: 0.7,               // Creativity (0-2)
  maxTokens: 150,                 // Response length
  topP: 1,                        // Nucleus sampling
  frequencyPenalty: 0,            // Reduce repetition
  presencePenalty: 0              // Encourage new topics
});
```

---

## 🎨 UI Features

- **Mobile Responsive** - Works on all screen sizes
- **Loading States** - Animated loading indicators
- **Error Handling** - Clear error messages
- **Sample Data** - Quick testing with pre-filled examples
- **Chat History** - See conversation flow
- **Token Usage** - Track API usage

---

## 🚀 Future Enhancements

Ideas for extending the integration:

1. **Real-time Call Transcription**
   - Use OpenAI Whisper API for speech-to-text
   - Transcribe live calls

2. **Automated Call Summarization**
   - Automatically summarize calls after they end
   - Save summaries to database

3. **AI-Powered Insights**
   - Analyze trends across multiple calls
   - Generate actionable recommendations

4. **Text-to-Speech**
   - Convert AI responses to voice
   - Create automated voice agents

5. **Custom Training**
   - Fine-tune models on your call data
   - Create company-specific AI agents

---

## 📊 Cost Management

### Token Usage
- GPT-3.5 Turbo is cost-effective
- ~$0.0015 per 1K input tokens
- ~$0.002 per 1K output tokens

### Monitor Usage
- Check token counts in API responses
- Set monthly limits in OpenAI dashboard
- Use shorter prompts when possible

---

## 🔒 Security Best Practices

✅ **Do:**
- Keep API keys in `.env.local`
- Use environment variables
- Set usage limits in OpenAI dashboard
- Monitor API usage regularly

❌ **Don't:**
- Commit API keys to git
- Share keys in code or messages
- Use keys in client-side code (production)
- Hardcode keys anywhere

**Note:** Current setup uses `dangerouslyAllowBrowser: true` for development. For production, move API calls to a backend server.

---

## 🐛 Troubleshooting

### Error: "API key not found"
- Check that `.env.local` exists and has your key
- Restart dev server after adding key
- Ensure key starts with `sk-proj-`

### Error: "Rate limit exceeded"
- You've hit OpenAI's rate limits
- Wait a few seconds and try again
- Check usage at platform.openai.com

### Error: "Invalid API key"
- Verify key is correct
- Check key hasn't been revoked
- Generate new key if needed

---

## 📝 Testing Checklist

- [ ] API key added to `.env.local`
- [ ] Dev server restarted
- [ ] AI Testing Hub visible on dashboard
- [ ] Chat agent responds correctly
- [ ] Summarization works with sample data
- [ ] Sentiment analysis returns results
- [ ] Token usage is displayed
- [ ] Error handling works (try with wrong key)

---

## 🤝 Support

If you need help:
1. Check OpenAI documentation: https://platform.openai.com/docs
2. Review API usage: https://platform.openai.com/usage
3. Check API status: https://status.openai.com

---

## 📦 Dependencies

- `openai` v4.x - Official OpenAI SDK
- React 19.x - UI framework
- Vite - Build tool with env variable support

---

**Happy coding! 🎉**

Your AI Voice CRM is now powered by GPT-3.5 Turbo!
