# 🎙️ AI Voice CRM - Multilingual Voice Assistant

A powerful multilingual voice-enabled CRM system with AI-powered conversations supporting 60+ languages including Hindi, Tamil, Telugu, and more Indian languages.

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://your-vercel-url.vercel.app)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## ✨ Features

### 🗣️ **Voice Capabilities**
- **Speech-to-Text**: Powered by Deepgram (60+ languages)
- **Text-to-Speech**: Powered by Sarvam AI (30 unique voices, Indian languages)
- **Real-time Conversations**: Natural voice interactions with AI
- **30 Voice Options**: 16 female and 14 male voices with Indian accents

### 🌐 **Multilingual Support**
- 🇮🇳 Hindi (हिंदी)
- 🇮🇳 Tamil (தமிழ்)
- 🇮🇳 Telugu (తెలుగు)
- 🇮🇳 Kannada (ಕನ್ನಡ)
- 🇮🇳 Malayalam (മലയാളം)
- 🇮🇳 Bengali (বাংলা)
- 🇮🇳 Marathi (मराठी)
- 🇮🇳 Gujarati (ગુજરાતી)
- 🇮🇳 Punjabi (ਪੰਜਾਬੀ)
- 🇬🇧 English and 50+ more languages

### 🤖 **AI-Powered**
- Custom agent prompts for different use cases
- Conversation history tracking
- Context-aware responses
- Powered by OpenAI GPT-4

### 💼 **CRM Features**
- Agent configuration and setup
- Custom AI prompt engineering
- Audio settings management
- Voice customization
- Conversation persistence

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- API Keys:
  - OpenAI API Key
  - Deepgram API Key
  - Sarvam AI API Key

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/CRM-Landing-Software-Pvt-Ltd/AI_voice_crm.git
cd AI_voice_crm
```

2. **Install dependencies**
```bash
cd client
npm install
```

3. **Set up environment variables**

Create a `.env.local` file in the `client` directory:

```bash
# OpenAI API Configuration
VITE_OPENAI_API_KEY=your_openai_api_key_here

# Deepgram API Configuration (Speech-to-Text)
VITE_DEEPGRAM_API_KEY=your_deepgram_api_key_here

# Sarvam AI API Configuration (Text-to-Speech)
VITE_SARVAM_API_KEY=your_sarvam_api_key_here
```

4. **Run the development server**
```bash
npm run dev
```

5. **Open your browser**
```
http://localhost:5173
```

## 🔑 Getting API Keys

### OpenAI
1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create an account or sign in
3. Generate a new API key
4. Copy and paste into `.env.local`

### Deepgram
1. Go to [Deepgram Console](https://console.deepgram.com/)
2. Sign up for a free account ($5 credit = ~1,160 minutes)
3. Create a new API key
4. Copy and paste into `.env.local`

### Sarvam AI
1. Go to [Sarvam AI](https://www.sarvam.ai/)
2. Request API access or contact: hello@sarvam.ai
3. Get your API key from the dashboard
4. Copy and paste into `.env.local`

## 📦 Deployment on Vercel

### One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/CRM-Landing-Software-Pvt-Ltd/AI_voice_crm)

### Manual Deployment

1. **Install Vercel CLI**
```bash
npm install -g vercel
```

2. **Login to Vercel**
```bash
vercel login
```

3. **Deploy**
```bash
cd client
vercel
```

4. **Set Environment Variables in Vercel**
   - Go to your project settings on Vercel
   - Navigate to "Environment Variables"
   - Add all three API keys:
     - `VITE_OPENAI_API_KEY`
     - `VITE_DEEPGRAM_API_KEY`
     - `VITE_SARVAM_API_KEY`

5. **Redeploy**
```bash
vercel --prod
```

## 🎯 Usage

### Voice Chat
1. Navigate to the "Voice" tab
2. Select your preferred language (English, Hindi, Tamil, etc.)
3. Choose a voice (30 options available)
4. Click the microphone button
5. Speak your query
6. Click stop when done
7. The AI will transcribe, respond, and speak back!

### Agent Setup
1. Go to "Setup" tab
2. Configure your agent name
3. Set custom AI prompt for your use case
4. Save configuration

### Audio Settings
1. Navigate to "Audio" tab
2. Configure transcription settings
3. Adjust voice parameters
4. Test different voices

## 🏗️ Tech Stack

### Frontend
- **React 19** - UI framework
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **React Icons** - Icons

### AI & Voice
- **OpenAI GPT-4** - Conversational AI
- **Deepgram SDK** - Speech-to-Text (60+ languages)
- **Sarvam AI** - Text-to-Speech (Indian languages)
- **MediaRecorder API** - Audio recording

### State Management
- React Hooks (useState, useRef, useEffect)
- localStorage for persistence

## 📁 Project Structure

```
AI_voice_crm/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── VoiceChat.jsx      # Main voice chat component
│   │   │   ├── Audio.jsx          # Audio settings
│   │   │   └── ...
│   │   ├── pages/
│   │   │   ├── AgentSetup.jsx     # Agent configuration
│   │   │   └── dashboard.jsx      # Main dashboard
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env.local                 # Environment variables (not in repo)
│   ├── package.json
│   └── vite.config.js
├── README.md
└── ...
```

## 🎤 Available Voices

### Female Voices (16)
Anushka, Manisha, Vidya, Isha, Ritu, Sakshi, Priya, Neha, Pooja, Simran, Kavya, Anjali, Sneha, Sunita, Tara, Kriti

### Male Voices (14)
Abhilash, Arya, Karun, Hitesh, Aditya, Chirag, Harsh, Rahul, Rohan, Kiran, Vikram, Rajesh, Anirudh, Ishaan

## 💰 Pricing (Estimated)

- **OpenAI**: Pay-as-you-go based on tokens used
- **Deepgram**: $5 credit ≈ 1,160 minutes, then $0.0043/minute
- **Sarvam AI**: Contact for pricing (competitive for Indian market)

## 🛠️ Development

### Run locally
```bash
cd client
npm run dev
```

### Build for production
```bash
npm run build
```

### Preview production build
```bash
npm run preview
```

## 🐛 Troubleshooting

### Voice not working?
- Check if all API keys are set correctly
- Restart dev server after adding keys
- Check browser console for errors
- Ensure microphone permissions are granted

### TTS not playing?
- Check Sarvam API key is valid
- Verify selected language is supported
- Check browser allows audio autoplay
- Try clicking anywhere on the page first

### Deepgram transcription empty?
- Ensure correct language is selected
- Speak clearly into microphone
- Check microphone permissions
- Verify Deepgram API key has credits

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Support

For issues and questions:
- Open an issue on GitHub
- Contact: saurabh.kumar@crmlanding.in

## 🙏 Acknowledgments

- [OpenAI](https://openai.com/) - Conversational AI
- [Deepgram](https://deepgram.com/) - Speech-to-Text
- [Sarvam AI](https://sarvam.ai/) - Indian language TTS
- [React](https://react.dev/) - Frontend framework
- [Vite](https://vitejs.dev/) - Build tool

---

Made with ❤️ by Saurabh Kumar & Mahendra Gurjar

🌟 **Star this repo if you find it useful!**
