# Voice Chat Setup Guide

## ✅ What's Implemented

A **browser-based voice chat** feature where you can:
- 🎤 Speak into your microphone
- 📝 Auto-transcribe speech to text using Deepgram
- 🤖 Get AI responses using your agent prompt (OpenAI)
- 🔊 Hear responses spoken back to you (Browser TTS - FREE!)
- 💬 Maintain conversation history with context

**No backend server needed!** Everything runs in your browser.

---

## 🚀 Setup Steps

### Step 1: Get Deepgram API Key

1. Go to: https://console.deepgram.com/
2. Sign in (you already have an account with $5 credit)
3. Go to "API Keys" section
4. Copy your API key

### Step 2: Add API Key to Environment

Add to your `.env` file:

```bash
# Open this file
nano /home/shreyansh0009/CRM_Landing/dashboard/AI_voice_crm/client/.env

# Add this line (replace with your actual key)
VITE_DEEPGRAM_API_KEY=your_deepgram_api_key_here
```

Your `.env` file should now have:
```env
VITE_OPENAI_API_KEY=your_openai_key
VITE_DEEPGRAM_API_KEY=your_deepgram_key
```

### Step 3: Restart Dev Server

```bash
# Stop current server (Ctrl+C)
# Then restart
cd /home/shreyansh0009/CRM_Landing/dashboard/AI_voice_crm/client
npm run dev
```

---

## 📖 How to Use

1. **Navigate to Voice Tab**:
   - Go to Agent Setup page
   - Click the **"Voice"** tab (between Audio and Engine)

2. **Set Your Agent Prompt**:
   - Go to "Agent" tab first
   - Set your custom prompt (e.g., "You are a customer service agent...")
   - This will be used for voice conversations

3. **Start Talking**:
   - Click the big blue microphone button
   - **Allow microphone access** when browser asks
   - Start speaking
   - Click again to stop recording

4. **AI Responds**:
   - Your speech is transcribed (shown on screen)
   - AI processes and responds
   - Response is spoken back to you (and shown as text)

5. **Continue Conversation**:
   - Click microphone again for next question
   - Full conversation context is maintained
   - Click "Clear Chat" to start fresh

---

## 🎯 Features

### ✅ Speech-to-Text (Deepgram)
- Uses your $5 credit
- ~1,160 minutes of transcription available
- High accuracy with Nova-2 model
- Cost: ~$0.0043/minute

### ✅ AI Response (OpenAI)
- Uses your existing OpenAI integration
- Maintains conversation history
- Respects your custom agent prompt
- Short responses optimized for voice

### ✅ Text-to-Speech (Browser Built-in)
- **100% FREE** - uses browser's Web Speech API
- No additional costs
- Works offline
- Natural sounding voices

### ✅ Conversation Management
- Full chat history displayed
- Context maintained across turns
- Clear conversation option
- Visual indicators for recording/processing/speaking

---

## 💰 Cost Breakdown

**With your $5 Deepgram credit:**
- Speech-to-Text: ~1,160 minutes
- Text-to-Speech: FREE (browser)
- OpenAI: Your existing costs (~$0.03 per conversation)

**Example**: 100 test conversations @ 2 minutes each = ~$0.86 in Deepgram + OpenAI costs

---

## 🎨 UI Features

### Microphone Button States:
- 🔵 **Blue**: Ready to record
- 🔴 **Red (pulsing)**: Recording your voice
- ⚪ **Gray**: Processing your request
- 🟢 **Green (pulsing)**: AI is speaking

### Visual Feedback:
- Real-time status updates
- Conversation transcript below
- Color-coded messages (You vs AI)
- Error messages if something goes wrong

---

## 🔧 Troubleshooting

### "Microphone access denied"
- Browser blocked microphone access
- Click the 🔒 lock icon in address bar
- Go to Site Settings → Microphone → Allow

### "Deepgram API key not found"
- Make sure you added VITE_DEEPGRAM_API_KEY to .env
- Restart dev server after adding
- Check for typos in key

### "No speech detected"
- Speak louder or closer to microphone
- Check microphone is working (test in other apps)
- Make sure you're not on mute

### Browser TTS not working
- Some browsers have limited voice support
- Works best in Chrome/Edge
- Check system volume is not muted
- Try refreshing the page

---

## 🎤 Best Practices

1. **Short Questions**: Keep queries concise (10-30 seconds)
2. **Clear Speech**: Speak clearly and avoid background noise
3. **Wait for Response**: Let AI finish speaking before asking next question
4. **Good Microphone**: Use a decent mic for best accuracy
5. **Quiet Environment**: Minimize background noise

---

## 🔐 Privacy & Security

- ✅ Audio sent to Deepgram for transcription (encrypted)
- ✅ Text sent to OpenAI for AI response
- ✅ No audio stored permanently
- ✅ Conversation history stored in browser only
- ✅ Clear chat to remove all data

---

## 🚀 Next Steps (Optional Enhancements)

If you want to add more features later:

1. **Better TTS**: Use ElevenLabs/Deepgram Aura for more natural voices
2. **Streaming**: Real-time streaming for lower latency
3. **Wake Word**: Add "Hey Agent" wake word detection
4. **Multi-language**: Support Hindi, Spanish, etc.
5. **Phone Integration**: Add Twilio for actual phone calls

---

## 📊 Demo Flow

```
User clicks mic → Browser records audio
                        ↓
                Deepgram transcribes
                        ↓
                Shows transcript on screen
                        ↓
                OpenAI processes (with your prompt)
                        ↓
                Shows AI response on screen
                        ↓
                Browser speaks response
                        ↓
                User hears AI voice
```

---

## ✨ That's It!

You now have a fully functional voice AI agent!

Test it by:
1. Going to the Voice tab
2. Clicking the microphone
3. Saying: "Hello, who are you?"
4. Listening to the response

Enjoy! 🎉
