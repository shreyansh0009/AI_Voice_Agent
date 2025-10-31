# Voice Agent Implementation with Deepgram - Complete Roadmap

## Overview
Implementing real-time voice conversation using:
- **Deepgram**: Speech-to-Text (STT)
- **OpenAI GPT**: AI responses (already implemented)
- **Deepgram Aura / ElevenLabs**: Text-to-Speech (TTS)
- **WebRTC / WebSockets**: Real-time audio streaming

Budget: $5 Deepgram credit = ~1,160 minutes of transcription

---

## Phase 1: Setup & Prerequisites (2-3 hours)

### 1.1 API Keys Required
- [x] Deepgram API Key (you have this)
- [x] OpenAI API Key (you have this)
- [ ] TTS Provider Key (choose one):
  - **Option A**: Deepgram Aura (same account, simplest)
  - **Option B**: ElevenLabs ($5/month free tier, best quality)
  - **Option C**: Google Cloud TTS (pay-per-use)

### 1.2 Backend Setup
```bash
cd /home/shreyansh0009/CRM_Landing/dashboard/AI_voice_crm
mkdir -p server/{routes,services,utils}
cd server
npm init -y
```

### 1.3 Install Dependencies
```bash
# Core dependencies
npm install express cors dotenv ws

# Deepgram SDK
npm install @deepgram/sdk

# OpenAI (already in frontend, but needed in backend too)
npm install openai

# TTS - Choose ONE:
npm install @deepgram/sdk  # for Deepgram Aura TTS
# OR
npm install elevenlabs-node  # for ElevenLabs
# OR
npm install @google-cloud/text-to-speech  # for Google TTS

# Audio processing
npm install node-fetch
npm install form-data
```

---

## Phase 2: Backend Development (Day 1-2)

### 2.1 File Structure
```
server/
├── index.js                    # Main Express server
├── .env                        # Environment variables
├── package.json
├── routes/
│   └── voice.js               # Voice call endpoints
├── services/
│   ├── deepgramService.js     # Deepgram STT service
│   ├── openaiService.js       # OpenAI conversation service
│   └── ttsService.js          # Text-to-Speech service
└── utils/
    └── audioProcessor.js      # Audio buffer management
```

### 2.2 Environment Configuration
```env
# server/.env
DEEPGRAM_API_KEY=your_deepgram_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_key_here  # if using ElevenLabs
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

### 2.3 Main Server (server/index.js)
```javascript
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
require('dotenv').config();

const voiceRoutes = require('./routes/voice');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(express.json());

// Routes
app.use('/api/voice', voiceRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Voice AI Backend' });
});

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`🚀 Voice AI Server running on port ${PORT}`);
});

// WebSocket server for real-time audio streaming
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  
  ws.on('message', async (message) => {
    // Handle incoming audio chunks
    // This will be implemented in Phase 3
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

module.exports = { app, server, wss };
```

### 2.4 Deepgram Service (server/services/deepgramService.js)
```javascript
const { createClient } = require('@deepgram/sdk');

class DeepgramService {
  constructor() {
    this.deepgram = createClient(process.env.DEEPGRAM_API_KEY);
  }

  /**
   * Transcribe audio using Deepgram Streaming
   */
  async createLiveTranscription(onTranscript, onError) {
    try {
      const connection = this.deepgram.listen.live({
        model: 'nova-2',
        language: 'en',
        smart_format: true,
        interim_results: false,
        punctuate: true,
        endpointing: 300, // ms of silence to detect end of speech
      });

      connection.on('open', () => {
        console.log('Deepgram connection opened');
      });

      connection.on('Results', (data) => {
        const transcript = data.channel.alternatives[0].transcript;
        if (transcript && transcript.length > 0) {
          onTranscript(transcript);
        }
      });

      connection.on('error', (error) => {
        console.error('Deepgram error:', error);
        onError(error);
      });

      connection.on('close', () => {
        console.log('Deepgram connection closed');
      });

      return connection;
    } catch (error) {
      console.error('Error creating Deepgram connection:', error);
      throw error;
    }
  }

  /**
   * Transcribe pre-recorded audio
   */
  async transcribeAudio(audioBuffer) {
    try {
      const { result, error } = await this.deepgram.listen.prerecorded.transcribeFile(
        audioBuffer,
        {
          model: 'nova-2',
          smart_format: true,
          punctuate: true,
        }
      );

      if (error) throw error;

      const transcript = result.results.channels[0].alternatives[0].transcript;
      return transcript;
    } catch (error) {
      console.error('Error transcribing audio:', error);
      throw error;
    }
  }
}

module.exports = new DeepgramService();
```

### 2.5 OpenAI Service (server/services/openaiService.js)
```javascript
const OpenAI = require('openai');

class OpenAIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.conversationHistory = new Map(); // sessionId -> messages[]
  }

  /**
   * Get AI response for voice conversation
   */
  async getResponse(sessionId, userMessage, systemPrompt) {
    try {
      // Get or create conversation history
      if (!this.conversationHistory.has(sessionId)) {
        this.conversationHistory.set(sessionId, []);
      }

      const history = this.conversationHistory.get(sessionId);

      // Add user message
      history.push({
        role: 'user',
        content: userMessage,
      });

      // Build messages array
      const messages = [
        {
          role: 'system',
          content: systemPrompt || 'You are a helpful AI assistant. Keep responses concise and conversational.',
        },
        ...history,
      ];

      // Call OpenAI
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: messages,
        temperature: 0.7,
        max_tokens: 150, // Keep responses short for voice
      });

      const aiResponse = completion.choices[0].message.content;

      // Add AI response to history
      history.push({
        role: 'assistant',
        content: aiResponse,
      });

      // Keep only last 10 messages to save tokens
      if (history.length > 10) {
        history.splice(0, history.length - 10);
      }

      return aiResponse;
    } catch (error) {
      console.error('OpenAI error:', error);
      throw error;
    }
  }

  /**
   * Clear conversation history for a session
   */
  clearSession(sessionId) {
    this.conversationHistory.delete(sessionId);
  }
}

module.exports = new OpenAIService();
```

### 2.6 TTS Service - Deepgram Aura (server/services/ttsService.js)
```javascript
const { createClient } = require('@deepgram/sdk');
const fs = require('fs');
const path = require('path');

class TTSService {
  constructor() {
    this.deepgram = createClient(process.env.DEEPGRAM_API_KEY);
  }

  /**
   * Convert text to speech using Deepgram Aura
   */
  async textToSpeech(text) {
    try {
      const response = await this.deepgram.speak.request(
        { text },
        {
          model: 'aura-asteria-en', // or 'aura-luna-en', 'aura-stella-en'
          encoding: 'linear16',
          container: 'wav',
        }
      );

      const stream = await response.getStream();
      const buffer = await this.getAudioBuffer(stream);

      return buffer;
    } catch (error) {
      console.error('TTS error:', error);
      throw error;
    }
  }

  /**
   * Helper to convert stream to buffer
   */
  async getAudioBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}

module.exports = new TTSService();
```

### 2.7 Voice Routes (server/routes/voice.js)
```javascript
const express = require('express');
const router = express.Router();
const deepgramService = require('../services/deepgramService');
const openaiService = require('../services/openaiService');
const ttsService = require('../services/ttsService');

/**
 * POST /api/voice/process
 * Process voice input: STT -> OpenAI -> TTS
 */
router.post('/process', async (req, res) => {
  try {
    const { audioData, sessionId, systemPrompt } = req.body;

    // 1. Convert audio to text (STT)
    const audioBuffer = Buffer.from(audioData, 'base64');
    const transcript = await deepgramService.transcribeAudio(audioBuffer);

    if (!transcript || transcript.trim().length === 0) {
      return res.json({
        success: false,
        error: 'No speech detected',
      });
    }

    // 2. Get AI response
    const aiResponse = await openaiService.getResponse(
      sessionId,
      transcript,
      systemPrompt
    );

    // 3. Convert response to speech (TTS)
    const audioResponse = await ttsService.textToSpeech(aiResponse);

    // 4. Return everything
    res.json({
      success: true,
      transcript: transcript,
      aiResponse: aiResponse,
      audio: audioResponse.toString('base64'),
    });
  } catch (error) {
    console.error('Voice processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/voice/clear-session
 * Clear conversation history for a session
 */
router.post('/clear-session', (req, res) => {
  const { sessionId } = req.body;
  openaiService.clearSession(sessionId);
  res.json({ success: true });
});

module.exports = router;
```

---

## Phase 3: Frontend Implementation (Day 3-4)

### 3.1 Install Frontend Dependencies
```bash
cd /home/shreyansh0009/CRM_Landing/dashboard/AI_voice_crm/client
npm install @deepgram/sdk
npm install recordrtc
```

### 3.2 Create Voice Chat Component

Create new component: `client/src/components/VoiceChat.jsx`

```javascript
import React, { useState, useRef, useEffect } from 'react';
import { BiMicrophone, BiStop, BiVolumeFull } from 'react-icons/bi';
import RecordRTC from 'recordrtc';

const VoiceChat = ({ systemPrompt }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [sessionId] = useState(() => `session_${Date.now()}`);
  
  const recorderRef = useRef(null);
  const audioRef = useRef(null);

  /**
   * Start recording user's voice
   */
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      recorderRef.current = new RecordRTC(stream, {
        type: 'audio',
        mimeType: 'audio/wav',
        recorderType: RecordRTC.StereoAudioRecorder,
        numberOfAudioChannels: 1,
      });

      recorderRef.current.startRecording();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Microphone access denied');
    }
  };

  /**
   * Stop recording and process
   */
  const stopRecording = () => {
    if (!recorderRef.current) return;

    recorderRef.current.stopRecording(async () => {
      setIsRecording(false);
      setIsProcessing(true);

      const blob = recorderRef.current.getBlob();
      await processAudio(blob);

      // Clean up
      recorderRef.current.destroy();
      recorderRef.current = null;
    });
  };

  /**
   * Send audio to backend for processing
   */
  const processAudio = async (audioBlob) => {
    try {
      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      
      reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1];

        // Call backend API
        const response = await fetch('http://localhost:3001/api/voice/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioData: base64Audio,
            sessionId: sessionId,
            systemPrompt: systemPrompt,
          }),
        });

        const result = await response.json();

        if (result.success) {
          setTranscript(result.transcript);
          setAiResponse(result.aiResponse);

          // Play audio response
          if (result.audio) {
            playAudio(result.audio);
          }
        } else {
          alert('Error: ' + result.error);
        }

        setIsProcessing(false);
      };
    } catch (error) {
      console.error('Error processing audio:', error);
      setIsProcessing(false);
    }
  };

  /**
   * Play AI's audio response
   */
  const playAudio = (base64Audio) => {
    const audioBlob = base64ToBlob(base64Audio, 'audio/wav');
    const audioUrl = URL.createObjectURL(audioBlob);
    
    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.play();
    }
  };

  /**
   * Convert base64 to blob
   */
  const base64ToBlob = (base64, mimeType) => {
    const byteCharacters = atob(base64);
    const byteArrays = [];

    for (let i = 0; i < byteCharacters.length; i++) {
      byteArrays.push(byteCharacters.charCodeAt(i));
    }

    return new Blob([new Uint8Array(byteArrays)], { type: mimeType });
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Voice Chat</h2>

      {/* Recording Button */}
      <div className="flex flex-col items-center gap-4 mb-8">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
          className={`w-32 h-32 rounded-full flex items-center justify-center text-white text-4xl transition-all ${
            isRecording
              ? 'bg-red-500 hover:bg-red-600 animate-pulse'
              : 'bg-blue-500 hover:bg-blue-600'
          } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isRecording ? <BiStop /> : <BiMicrophone />}
        </button>

        <p className="text-sm text-gray-600">
          {isRecording
            ? 'Recording... Click to stop'
            : isProcessing
            ? 'Processing...'
            : 'Click to start speaking'}
        </p>
      </div>

      {/* Transcript Display */}
      {transcript && (
        <div className="mb-4 p-4 bg-gray-100 rounded-lg">
          <div className="flex items-start gap-2">
            <BiMicrophone className="text-blue-500 mt-1" />
            <div>
              <p className="text-xs text-gray-500 mb-1">You said:</p>
              <p className="text-gray-800">{transcript}</p>
            </div>
          </div>
        </div>
      )}

      {/* AI Response Display */}
      {aiResponse && (
        <div className="mb-4 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-start gap-2">
            <BiVolumeFull className="text-green-500 mt-1" />
            <div>
              <p className="text-xs text-gray-500 mb-1">AI Response:</p>
              <p className="text-gray-800">{aiResponse}</p>
            </div>
          </div>
        </div>
      )}

      {/* Hidden audio player */}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
};

export default VoiceChat;
```

### 3.3 Add Voice Chat to AgentSetup

Update `client/src/pages/AgentSetup.jsx`:

```javascript
// Add import
import VoiceChat from '../components/VoiceChat';

// Add "Voice" to tabs
const TABS = [
  "Agent",
  "LLM",
  "Audio",
  "Voice",  // NEW
  "Engine",
  "Call",
  "Tools",
  "Analytics",
  "Inbound",
];

// In the render section, add case for Voice tab
{activeTab === "Voice" && <VoiceChat systemPrompt={prompt} />}
```

---

## Phase 4: Testing & Optimization (Day 5)

### 4.1 Local Testing Checklist
- [ ] Start backend: `cd server && node index.js`
- [ ] Start frontend: `cd client && npm run dev`
- [ ] Open browser, allow microphone access
- [ ] Click microphone button and speak
- [ ] Verify transcript appears
- [ ] Verify AI response plays as audio
- [ ] Test conversation flow (multiple turns)

### 4.2 Optimization Tips

**Reduce Latency:**
1. Use Deepgram's `nova-2` model (fastest)
2. Set `max_tokens: 150` in OpenAI (shorter responses)
3. Use streaming for real-time experience
4. Enable `endpointing: 300` in Deepgram (auto-detect speech end)

**Save Costs:**
1. Use `gpt-3.5-turbo` instead of `gpt-4` (10x cheaper)
2. Limit conversation history to 10 messages
3. Use Deepgram Aura instead of ElevenLabs for TTS

**Improve Quality:**
1. Add noise cancellation
2. Use better microphone input
3. Add conversation context
4. Handle interruptions gracefully

---

## Phase 5: Phone Integration (Optional - Week 2)

### 5.1 Add Twilio for Phone Calls

If you want ACTUAL phone calls (not just browser microphone):

```bash
npm install twilio
```

Update backend to handle incoming calls via Twilio webhooks.

**Cost**: $1/month for phone number + $0.0085/min

---

## Cost Breakdown

### With $5 Deepgram Credit:
- **Speech-to-Text**: $0.0043/min = ~1,160 minutes
- **Text-to-Speech (Deepgram Aura)**: $0.015/1000 chars
- **OpenAI (GPT-4)**: ~$0.03 per conversation
- **Total**: Your $5 can cover 100-200 test conversations

### Monthly Production Costs (1000 calls @ 5 min each):
- Deepgram STT: ~$21.50
- Deepgram TTS: ~$5-10
- OpenAI GPT-4: ~$30-50
- **Total**: ~$60-80/month

---

## Next Steps - Priority Order

1. ✅ **Day 1**: Set up backend server structure
2. ✅ **Day 2**: Implement Deepgram STT + OpenAI integration
3. ✅ **Day 3**: Implement TTS (Deepgram Aura)
4. ✅ **Day 4**: Build frontend VoiceChat component
5. ✅ **Day 5**: Test and optimize

---

## Support Resources

- **Deepgram Docs**: https://developers.deepgram.com/
- **Deepgram Node.js SDK**: https://github.com/deepgram/deepgram-node-sdk
- **OpenAI API**: https://platform.openai.com/docs
- **RecordRTC**: https://github.com/muaz-khan/RecordRTC

---

**Ready to start?** Let me know which phase you'd like me to implement first!
