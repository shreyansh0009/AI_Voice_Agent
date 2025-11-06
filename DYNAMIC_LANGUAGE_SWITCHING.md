# 🌐 Dynamic Language Switching Feature

## Overview

The AI Voice CRM now supports **dynamic language switching** during conversation! Users can ask the AI to switch languages naturally, and the system will automatically:
1. Switch the speech recognition language
2. Switch the text-to-speech language
3. Continue all future responses in the new language

## 🎯 How It Works

### User Experience

**Example Conversation:**

```
You (in English): "Hello, I need help with my appliance"
AI (in English): "Hello! I'd be happy to help. What appliance are you having trouble with?"

You (in English): "Please switch to Hindi"
AI (in Hindi): "मैं अब हिंदी में बात कर रहा हूं। आपकी कैसे मदद कर सकता हूं?"

You (in Hindi): "मुझे वॉशिंग मशीन की समस्या है"
AI (in Hindi): "ठीक है, कृपया बताएं कि वॉशिंग मशीन में क्या समस्या है?"

You (in Hindi): "Switch to English"
AI (in English): "I've switched back to English. How can I help you with your washing machine?"
```

### Supported Language Commands

Users can say any of these phrases to switch languages:

**To Hindi:**
- "Switch to Hindi"
- "Speak in Hindi"
- "Talk in Hindi"
- "हिंदी में बात करो"

**To Tamil:**
- "Switch to Tamil"
- "Speak in Tamil"
- "தமிழில் பேசு"

**To Telugu:**
- "Switch to Telugu"
- "Speak in Telugu"

**To English:**
- "Switch to English"
- "Speak in English"

And so on for all supported languages!

## 🔧 Technical Implementation

### Language Detection & Switching

1. **AI-Driven Detection**: The AI (GPT-4) detects language switch requests in the user's message
2. **Special Command**: When detected, AI prepends `LANGUAGE_SWITCH:[code]` to its response
3. **Automatic Update**: System automatically updates both STT and TTS languages
4. **Persistence**: All future responses continue in the new language

### Code Flow

```javascript
User speaks → Deepgram STT → OpenAI AI → Detects "switch to Hindi" 
→ Responds with "LANGUAGE_SWITCH:hi" + Hindi response 
→ System updates selectedLanguage to 'hi' 
→ Sarvam TTS speaks in Hindi 
→ Next recording uses Hindi STT
```

### System Prompt Enhancement

The AI is given special instructions:

```
IMPORTANT LANGUAGE INSTRUCTIONS:
1. You are currently speaking in [Current Language].
2. ALWAYS respond in [Current Language] unless user asks to switch.
3. If user asks to switch language:
   - Respond with "LANGUAGE_SWITCH:[code]" at START of response
   - Continue response in requested language
4. After switching, ALL future responses in that language.
```

## 🌍 Supported Languages

| Language | Code | Voice Support | Example Phrase |
|----------|------|---------------|----------------|
| English | en | ✅ Indian Accent | "Switch to English" |
| Hindi | hi | ✅ Native | "हिंदी में बात करो" |
| Tamil | ta | ✅ Native | "தமிழில் பேசு" |
| Telugu | te | ✅ Native | "తెలుగులో మాట్లాడు" |
| Kannada | kn | ✅ Native | "ಕನ್ನಡದಲ್ಲಿ ಮಾತನಾಡು" |
| Malayalam | ml | ✅ Native | "മലയാളത്തിൽ സംസാരിക്കൂ" |
| Bengali | bn | ✅ Native | "বাংলায় কথা বলুন" |
| Marathi | mr | ✅ Native | "मराठीत बोला" |
| Gujarati | gu | ✅ Native | "ગુજરાતીમાં વાત કરો" |
| Punjabi | pa | ✅ Native | "ਪੰਜਾਬੀ ਵਿੱਚ ਗੱਲ ਕਰੋ" |
| Spanish | es | ✅ | "Habla en español" |
| French | fr | ✅ | "Parle en français" |
| German | de | ✅ | "Sprich Deutsch" |
| Chinese | zh | ✅ | "说中文" |
| Japanese | ja | ✅ | "日本語で話して" |
| Korean | ko | ✅ | "한국어로 말해" |

## 📝 Usage Examples

### Example 1: Customer Service in Multiple Languages

```
Support Agent Setup (English prompt):
"You are a customer service agent for an electronics company."

Customer: "Hello, my TV is not working"
AI: "I'm sorry to hear that. Can you tell me what's wrong with your TV?"

Customer: "Actually, I'm more comfortable in Hindi"
AI: "बिल्कुल! मैं हिंदी में बात कर सकता हूं। आपकी TV में क्या समस्या है?"

Customer (in Hindi): "टीवी चालू नहीं हो रहा है"
AI (in Hindi): "ठीक है, क्या पावर केबल सही से लगी हुई है?"
```

### Example 2: Multilingual Sales

```
Sales Agent Setup:
"You are a friendly sales representative."

Customer: "Tell me about your products"
AI: "We have a wide range of electronics..."

Customer: "என் தாய் தமிழில் பேசலாமா?" (Can I speak in Tamil?)
AI: "நிச்சயமாக! நான் தமிழில் உங்களுக்கு உதவ தயாராக இருக்கிறேன்." (Certainly! I'm ready to help you in Tamil.)

[Conversation continues in Tamil]
```

### Example 3: Code-Switching (Hinglish)

```
Customer: "Hi, main Hindi aur English mix karke baat karna chahta hoon"
AI: "Bilkul! I can understand and respond in Hinglish. Aap freely dono languages mix kar sakte hain."

Customer: "Mere washing machine mein problem hai"
AI: "Koi baat nahi, main aapki help karunga. Please batayein washing machine mein exactly kya problem hai?"
```

## 🎤 Voice Configuration

### Automatic Voice Adaptation

When language switches, the system uses appropriate voices:

- **Hindi**: Default voice from Sarvam AI with Hindi accent
- **Tamil**: Tamil native voice
- **English**: Indian English accent
- And so on...

### Manual Voice Override

Users can still manually select their preferred voice from the dropdown for finer control.

## 🚀 Best Practices

### For Agent Prompts

1. **Multilingual Ready**: Design prompts that work across languages
   ```
   Good: "You are a helpful assistant."
   Better: "You are a helpful assistant. You can speak multiple languages fluently."
   ```

2. **Include Language Context**:
   ```
   "You are a customer service agent. Be polite and professional in any language the customer prefers."
   ```

3. **Avoid Language-Specific Idioms**: Unless you know the target language
   ```
   Avoid: "Break a leg!" (English idiom)
   Better: "Good luck!" (Universal)
   ```

### For Users

1. **Clear Commands**: Say clearly "Switch to [language]" or "Speak in [language]"
2. **Wait for Confirmation**: AI will confirm the switch before continuing
3. **Continue in Same Language**: Once switched, speak in that language for better recognition
4. **Switch Back**: You can switch languages as many times as needed

## 🐛 Troubleshooting

### Language Doesn't Switch

**Problem**: Said "Switch to Hindi" but AI continues in English

**Solutions**:
1. Try more explicit: "Please switch the language to Hindi"
2. Say it as a separate sentence, not mid-conversation
3. Check AI is not in the middle of a long response
4. Manually select language from dropdown as fallback

### Recognition Issues After Switch

**Problem**: After switching to Hindi, speech recognition doesn't work

**Solutions**:
1. Wait 2-3 seconds after language switch
2. Speak clearly in the new language
3. Check that selected language in dropdown updated
4. Refresh page if issue persists

### AI Responds in Wrong Language

**Problem**: Asked for Hindi but AI responds in English

**Solutions**:
1. GPT-4 model is required (not GPT-3.5)
2. Check system prompt is not overriding language instructions
3. Try being more specific: "From now on, only respond in Hindi"

### Voice Sounds Wrong After Switch

**Problem**: Voice doesn't match the language

**Solutions**:
1. Check if Sarvam AI supports that specific language
2. Try selecting a different voice from the dropdown
3. Some languages may have limited voice options

## 📊 Analytics & Monitoring

### Tracking Language Switches

You can monitor language switching patterns:

```javascript
// In your analytics code
conversationHistory.forEach((msg, index) => {
  if (msg.content.includes('LANGUAGE_SWITCH:')) {
    console.log(`Language switched to: ${msg.content.split(':')[1]} at message ${index}`);
  }
});
```

### Usage Patterns

Monitor which languages customers prefer:
- Track initial language selection
- Track number of switches per conversation
- Track most common language pairs (English → Hindi, etc.)

## 🔮 Future Enhancements

Potential improvements:

1. **Auto-Detection**: Automatically detect language without explicit switch command
2. **Mixed Language**: Better support for code-switching (Hinglish, Tanglish, etc.)
3. **Voice Cloning**: Use same voice personality across all languages
4. **Regional Accents**: Support for regional variations (Hindi from Delhi vs Mumbai)
5. **Language Preferences**: Remember user's preferred language for future sessions

## 💡 Tips for Developers

### Customizing Language Behavior

Edit the system prompt in `VoiceChat.jsx`:

```javascript
const enhancedSystemPrompt = `${systemPrompt}

CUSTOM LANGUAGE RULES:
1. [Your custom rules]
2. [Language-specific instructions]
3. [Cultural considerations]
`;
```

### Adding New Languages

1. Add to language dropdown in UI
2. Add to languageMap in `speakTextWithSarvam`
3. Add to languageNames in `getAIResponse`
4. Verify Deepgram and Sarvam support

### Testing

Test language switching with:

```javascript
// Test phrases
const testPhrases = [
  { lang: 'en', text: 'Hello, switch to Hindi' },
  { lang: 'hi', text: 'अंग्रेजी में बात करो' },
  { lang: 'ta', text: 'ஆங்கிலத்தில் பேசு' }
];
```

## 📞 Support

For issues with language switching:
1. Check console logs for `LANGUAGE_SWITCH:` commands
2. Verify AI model is GPT-4
3. Ensure all API keys are valid
4. Test with simple phrases first

---

**Note**: This feature requires GPT-4 for best results. GPT-3.5-turbo may have limited multilingual capabilities.

🌟 **Enjoy seamless multilingual conversations!**
