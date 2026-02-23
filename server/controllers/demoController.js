import aiAgentService from '../services/aiAgent.service.js';
import ttsService from '../services/tts.service.js';
import sessionStore from '../services/demoSessionStore.js';
import { DEMO_AGENT_PROMPT, DEMO_WELCOME_MESSAGE, DEEPGRAM_MODELS, SARVAM_VOICES } from '../prompts/demoAgent.js';

const LANGUAGE_LABELS = {
    en: 'English',
    hi: 'Hindi',
    ta: 'Tamil',
    te: 'Telugu',
    bn: 'Bengali',
    mr: 'Marathi',
    gu: 'Gujarati',
    kn: 'Kannada',
    ml: 'Malayalam',
    pa: 'Punjabi',
};

// Keep this aligned with real Deepgram support for our chosen models/configs.
const SUPPORTED_DEEPGRAM_STT_LANGS = new Set(['en', 'hi', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml']);

function buildUnsupportedLanguageMessage(currentLang, requestedLang, reasons) {
    const currentName = LANGUAGE_LABELS[currentLang] || 'English';
    const requestedName = LANGUAGE_LABELS[requestedLang] || requestedLang.toUpperCase();
    const reasonText = reasons.length > 0 ? ` for ${reasons.join(' and ')}` : '';

    return `Sorry, I can currently talk only in ${currentName}. I can't switch to ${requestedName}${reasonText} right now. Can we continue in ${currentName}?`;
}

/**
 * POST /api/demo/start-session
 */
export const startSession = async (req, res) => {
    try {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';

        const result = sessionStore.createSession(ip);
        if (result.error) {
            return res.status(429).json({ success: false, ...result });
        }

        const deepgramToken = process.env.DEEPGRAM_API_KEY || null;

        // Generate welcome TTS via Sarvam
        let welcomeAudioBase64 = null;
        try {
            welcomeAudioBase64 = await ttsService.speak(DEMO_WELCOME_MESSAGE, 'en', 'manisha');
        } catch (err) {
            console.warn('⚠️ Could not generate welcome TTS:', err.message);
        }

        // Pre-seed conversation
        const session = sessionStore.getSession(result.sessionId);
        if (session) {
            sessionStore.addMessage(session, 'assistant', DEMO_WELCOME_MESSAGE);
            session.language = 'en'; // Track current language
        }

        res.json({
            success: true,
            sessionId: result.sessionId,
            deepgramToken,
            expiresIn: result.expiresIn,
            welcomeMessage: DEMO_WELCOME_MESSAGE,
            welcomeAudioBase64,
            audioFormat: 'wav',
            language: 'en',
            deepgramConfig: DEEPGRAM_MODELS['en'],
        });
    } catch (error) {
        console.error('❌ Demo start-session error:', error);
        res.status(500).json({ success: false, error: 'Failed to start demo session' });
    }
};

/**
 * POST /api/demo/chat
 */
export const demoChat = async (req, res) => {
    try {
        const { sessionId, message } = req.body;

        if (!sessionId) {
            return res.status(400).json({ success: false, error: 'sessionId is required' });
        }
        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ success: false, error: 'message is required' });
        }

        const session = sessionStore.getSession(sessionId);
        if (!session) {
            return res.status(410).json({
                success: false,
                error: 'session_expired',
                message: 'Demo session has expired. Start a new session.',
            });
        }

        if (!sessionStore.canSendMessage(session)) {
            return res.status(429).json({
                success: false,
                error: 'limit_reached',
                message: 'Message limit reached for this session.',
            });
        }

        sessionStore.addMessage(session, 'user', message);

        // Use session's current language for the prompt context
        const currentLang = session.language || 'en';

        const stream = await aiAgentService.processMessageStream(
            message,
            'default',
            session.customerContext,
            session.conversationHistory,
            {
                language: currentLang,
                systemPrompt: DEMO_AGENT_PROMPT,
                useRAG: false,
                agentId: 'default',
                conversationId: sessionId,
                maxTokens: 80,
            },
        );

        let fullResponse = '';
        let updatedContext = null;
        let streamError = null;

        for await (const chunk of stream) {
            if (chunk.type === 'content' || chunk.type === 'flow_text') {
                fullResponse += chunk.content;
            } else if (chunk.type === 'context') {
                updatedContext = chunk.customerContext;
            } else if (chunk.type === 'error') {
                streamError = chunk.message || 'LLM stream failed';
                break;
            }
        }

        if (streamError) {
            throw new Error(streamError);
        }

        fullResponse = fullResponse.trim();
        if (!fullResponse) {
            fullResponse = "I didn't catch that. Could you say that again?";
        }

        // Parse [LANG:xx] tag if present (language switch)
        let newLanguage = null;
        const langMatch = fullResponse.match(/^\[LANG:([a-z]{2})\]\s*/i);
        let languageSwitchBlocked = false;
        if (langMatch) {
            const requestedLanguage = langMatch[1].toLowerCase();
            const deepgramSupported = SUPPORTED_DEEPGRAM_STT_LANGS.has(requestedLanguage) && !!DEEPGRAM_MODELS[requestedLanguage];
            const ttsSupported = !!SARVAM_VOICES[requestedLanguage];

            if (deepgramSupported && ttsSupported) {
                newLanguage = requestedLanguage;
                fullResponse = fullResponse.replace(langMatch[0], '').trim(); // Strip tag from response
                session.language = newLanguage; // Persist for future turns
                console.log(`🌐 Language switched to: ${newLanguage}`);
            } else {
                languageSwitchBlocked = true;
                const reasons = [];
                if (!deepgramSupported) reasons.push('speech recognition');
                if (!ttsSupported) reasons.push('speech output');
                fullResponse = buildUnsupportedLanguageMessage(currentLang, requestedLanguage, reasons);
                console.log(`🌐 Language switch blocked: ${requestedLanguage} (STT: ${deepgramSupported}, TTS: ${ttsSupported})`);
            }
        }

        const responseLang = newLanguage || currentLang;

        // Update session
        sessionStore.addMessage(session, 'assistant', fullResponse);
        if (updatedContext) {
            session.customerContext = updatedContext;
        }

        // Generate TTS with correct language
        let audioBase64 = null;
        const voice = SARVAM_VOICES[responseLang] || 'manisha';
        try {
            audioBase64 = await ttsService.speak(fullResponse, responseLang, voice);
        } catch (err) {
            console.warn('⚠️ Demo TTS failed:', err.message);
        }

        const remainingSeconds = sessionStore.getRemainingSeconds(session);

        res.json({
            success: true,
            response: fullResponse,
            audioBase64,
            audioFormat: 'wav',
            remainingSeconds,
            language: responseLang,
            languageChanged: !!newLanguage && !languageSwitchBlocked,
            deepgramConfig: DEEPGRAM_MODELS[responseLang] || DEEPGRAM_MODELS['en'],
        });
    } catch (error) {
        console.error('❌ Demo chat error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process demo message',
            details: error.message,
        });
    }
};
