# TTS and Language Options for Voice Chat

## 🗣️ Text-to-Speech (TTS) Options

### Option 1: ElevenLabs (Recommended for English)
**Pros:**
- Best quality AI voices
- Very natural sounding
- Multiple voice options
- Good emotion and intonation

**Pricing:**
- Free tier: 10,000 characters/month (~30-40 minutes of speech)
- Creator: $5/month - 30,000 characters
- Pro: $22/month - 100,000 characters

**Setup:**
```bash
npm install elevenlabs-node
```

**Implementation Example:**
```javascript
import { ElevenLabsClient } from "elevenlabs";

const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
const client = new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });

const speakText = async (text) => {
  const audio = await client.generate({
    voice: "Rachel", // or "Adam", "Bella", etc.
    text: text,
    model_id: "eleven_multilingual_v2" // Supports 29 languages!
  });
  
  // Play audio
  const audioBlob = new Blob([audio], { type: 'audio/mpeg' });
  const audioUrl = URL.createObjectURL(audioBlob);
  const audioElement = new Audio(audioUrl);
  await audioElement.play();
};
```

### Option 2: Sarvam AI (Best for Indian Languages)
**Pros:**
- **Excellent for Hindi, Tamil, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati**
- Built specifically for Indian languages
- Natural Indian accents
- Supports code-mixing (Hinglish)
- Made in India 🇮🇳

**Pricing:**
- Contact Sarvam for pricing (typically competitive for Indian market)

**Setup:**
```bash
npm install @sarvam/sdk
```

**Implementation Example:**
```javascript
import { SarvamClient } from "@sarvam/sdk";

const SARVAM_API_KEY = import.meta.env.VITE_SARVAM_API_KEY;
const client = new SarvamClient({ apiKey: SARVAM_API_KEY });

const speakText = async (text, language = 'hi-IN') => {
  const audio = await client.tts.generate({
    text: text,
    language: language, // 'hi-IN', 'ta-IN', 'te-IN', etc.
    speaker: 'female', // or 'male'
    model: 'bulbul' // Sarvam's TTS model
  });
  
  // Play audio
  const audioBlob = new Blob([audio], { type: 'audio/mpeg' });
  const audioUrl = URL.createObjectURL(audioBlob);
  const audioElement = new Audio(audioUrl);
  await audioElement.play();
};
```

---

## 🎤 Deepgram Speech-to-Text Language Support

### ✅ Supported Languages (60+)

**Indian Languages:**
- 🇮🇳 **Hindi (hi)** ✅
- 🇮🇳 **Tamil (ta)** ✅
- 🇮🇳 **Telugu (te)** ✅
- 🇮🇳 **Kannada (kn)** ✅
- 🇮🇳 **Malayalam (ml)** ✅
- 🇮🇳 **Bengali (bn)** ✅
- 🇮🇳 **Marathi (mr)** ✅
- 🇮🇳 **Gujarati (gu)** ✅
- 🇮🇳 **Punjabi (pa)** ✅
- 🇮🇳 **Odia (or)** ✅

**Other Major Languages:**
- 🇬🇧 English (en)
- 🇪🇸 Spanish (es)
- 🇫🇷 French (fr)
- 🇩🇪 German (de)
- 🇨🇳 Chinese (zh)
- 🇯🇵 Japanese (ja)
- 🇰🇷 Korean (ko)
- 🇷🇺 Russian (ru)
- 🇵🇹 Portuguese (pt)
- 🇮🇹 Italian (it)
- And 40+ more!

### How to Use Different Languages in VoiceChat

**Current Code (English):**
```javascript
const connection = deepgramRef.current.listen.live({
  model: 'nova-2',
  smart_format: true,
  punctuate: true,
  language: 'en', // English
  encoding: 'opus',
});
```

**For Hindi:**
```javascript
const connection = deepgramRef.current.listen.live({
  model: 'nova-2',
  smart_format: true,
  punctuate: true,
  language: 'hi', // Hindi
  encoding: 'opus',
});
```

**For Tamil:**
```javascript
const connection = deepgramRef.current.listen.live({
  model: 'nova-2',
  language: 'ta', // Tamil
  encoding: 'opus',
});
```

### Add Language Selection to VoiceChat

Add a language selector in the component:

```javascript
const [selectedLanguage, setSelectedLanguage] = useState('en');

// In the connection
const connection = deepgramRef.current.listen.live({
  model: 'nova-2',
  smart_format: true,
  punctuate: true,
  language: selectedLanguage, // Dynamic language
  encoding: 'opus',
});

// UI for language selection
<select 
  value={selectedLanguage} 
  onChange={(e) => setSelectedLanguage(e.target.value)}
  className="px-4 py-2 bg-gray-700 rounded"
>
  <option value="en">English</option>
  <option value="hi">Hindi (हिंदी)</option>
  <option value="ta">Tamil (தமிழ்)</option>
  <option value="te">Telugu (తెలుగు)</option>
  <option value="kn">Kannada (ಕನ್ನಡ)</option>
  <option value="ml">Malayalam (മലയാളം)</option>
  <option value="bn">Bengali (বাংলা)</option>
  <option value="mr">Marathi (मराठी)</option>
  <option value="gu">Gujarati (ગુજરાતી)</option>
  <option value="pa">Punjabi (ਪੰਜਾਬੀ)</option>
</select>
```

---

## 💰 Cost Comparison

### Deepgram (STT)
- Your $5 credit = ~1,160 minutes of transcription
- Pay-as-you-go: $0.0043/minute

### ElevenLabs (TTS)
- Free: 10,000 chars/month (~30-40 minutes)
- $5/month: 30,000 chars (~90-120 minutes)

### Sarvam (TTS)
- Contact for pricing (competitive for Indian market)
- Likely similar to ElevenLabs pricing

---

## 🚀 Recommended Setup

### For English-only:
1. **STT**: Deepgram (already working!)
2. **TTS**: ElevenLabs ($5/month for good volume)

### For Indian Languages:
1. **STT**: Deepgram with Hindi/Tamil/etc. (already supported!)
2. **TTS**: Sarvam AI (best Indian accent and language support)

### For Multilingual:
1. **STT**: Deepgram (supports 60+ languages)
2. **TTS**: 
   - ElevenLabs `eleven_multilingual_v2` (29 languages)
   - OR Sarvam for Indian languages specifically

---

## 📝 Next Steps

1. **Choose TTS Provider**: ElevenLabs or Sarvam?
2. **Get API Key**: Sign up and get your API key
3. **Install SDK**: `npm install elevenlabs-node` or `npm install @sarvam/sdk`
4. **Implement TTS**: Replace the TODO in VoiceChat.jsx
5. **Add Language Selection**: (Optional) Add dropdown for language selection

Let me know which TTS provider you want to use! 🎤
