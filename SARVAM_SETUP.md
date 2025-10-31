# 🗣️ Sarvam AI TTS Setup Guide

## ✅ What's Already Done

1. ✅ Sarvam TTS integrated into VoiceChat.jsx
2. ✅ axios installed for API calls
3. ✅ Multi-language support (English, Hindi, Tamil, Telugu, etc.)
4. ✅ Voice configured: "Meera" (female voice)
5. ✅ API key placeholder added to .env.local

## 🚀 Get Your Sarvam API Key

### Step 1: Sign Up for Sarvam AI
1. Go to **https://www.sarvam.ai/**
2. Click "Get API Access" or "Sign Up"
3. Fill out the form with your details
4. You may need to:
   - Join their waitlist
   - OR contact them directly at: hello@sarvam.ai
   - OR check their developer portal

### Step 2: Get API Key
1. Once approved, log into your Sarvam dashboard
2. Navigate to API Keys section
3. Create a new API key
4. Copy the key (starts with something like `sarvam_...`)

### Step 3: Add API Key to Your Project
1. Open `/client/.env.local`
2. Replace `your-sarvam-api-key-here` with your actual key:
   ```bash
   VITE_SARVAM_API_KEY=your_actual_api_key_here
   ```
3. **IMPORTANT:** Restart your dev server after adding the key!

## 🎤 How It Works

### Supported Languages
Your VoiceChat now supports Sarvam TTS for:
- 🇮🇳 **Hindi (hi-IN)** ⭐ Best quality!
- 🇮🇳 **Tamil (ta-IN)**
- 🇮🇳 **Telugu (te-IN)**
- 🇮🇳 **Kannada (kn-IN)**
- 🇮🇳 **Malayalam (ml-IN)**
- 🇮🇳 **Bengali (bn-IN)**
- 🇮🇳 **Marathi (mr-IN)**
- 🇮🇳 **Gujarati (gu-IN)**
- 🇮🇳 **Punjabi (pa-IN)**
- 🇬🇧 **English (en-IN)** - Indian accent

### Voice Options
Currently using: **Meera** (female voice)

To change to male voice, edit VoiceChat.jsx line ~350:
```javascript
speaker: 'arvind', // Change from 'meera' to 'arvind'
```

### Voice Settings (Adjustable)
```javascript
{
  pitch: 0,        // -5 to 5 (0 = natural)
  pace: 1.0,       // 0.5 to 2.0 (1.0 = normal speed)
  loudness: 1.5,   // 0.5 to 2.0 (1.5 = louder)
}
```

## 🧪 Testing

1. **Restart your dev server** (important for env vars!)
   ```bash
   cd client
   npm run dev
   ```

2. Open your app and go to Voice tab

3. **Test English:**
   - Select "🇬🇧 English"
   - Click mic, say "Hello, I need help"
   - Click stop
   - Should transcribe, get AI response, and SPEAK it!

4. **Test Hindi:**
   - Select "🇮🇳 Hindi (हिंदी)"
   - Click mic, say "नमस्ते, मुझे मदद चाहिए"
   - Click stop
   - Should transcribe, get AI response, and SPEAK in Hindi!

## 💰 Pricing (Estimated)

Sarvam AI pricing is competitive for Indian market:
- Contact them for exact pricing
- Typically pay-per-character or monthly plans
- Much more affordable than international TTS providers for Indian languages

## 🔧 Troubleshooting

### Error: "Sarvam API key not configured"
- **Fix:** Make sure you added `VITE_SARVAM_API_KEY` to `.env.local`
- **Fix:** Restart your dev server after adding the key

### Error: "Sarvam TTS failed: Unauthorized"
- **Fix:** Check your API key is correct
- **Fix:** Make sure your Sarvam account is active

### Error: "Failed to generate speech"
- **Fix:** Check console for detailed error message
- **Fix:** Verify your Sarvam account has credits/quota remaining
- **Fix:** Check if the selected language is supported

### No audio plays
- **Check:** Browser console for errors
- **Check:** Browser allows audio autoplay (click anywhere on page first)
- **Check:** Your system volume is not muted

### Audio quality issues
- Adjust `loudness`, `pitch`, and `pace` parameters
- Try different voice: 'meera' vs 'arvind'
- Check internet connection (streaming quality)

## 🎯 Full Flow

1. **User speaks** → Deepgram STT (works in 60+ languages)
2. **Transcribed text** → OpenAI with your agent prompt
3. **AI response** → Sarvam TTS (speaks in selected language)
4. **Audio plays** → User hears response!

## 📝 Alternative: ElevenLabs

If Sarvam doesn't work out, you can switch to ElevenLabs:
- Better for English
- Supports 29 languages
- $5/month for 30,000 characters
- See `TTS_AND_LANGUAGE_OPTIONS.md` for implementation

## 🚀 Next Steps

1. Get Sarvam API key from https://www.sarvam.ai/
2. Add key to `.env.local`
3. Restart dev server
4. Test with Hindi and English!
5. Adjust voice settings if needed

Enjoy your multilingual voice assistant! 🎉
