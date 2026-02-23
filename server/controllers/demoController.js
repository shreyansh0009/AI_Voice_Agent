import aiAgentService from '../services/aiAgent.service.js';
import ttsService from '../services/tts.service.js';
import sessionStore from '../services/demoSessionStore.js';
import { DEMO_AGENT_PROMPT, DEMO_WELCOME_MESSAGE, DEEPGRAM_MODELS, SARVAM_VOICES } from '../prompts/demoAgent.js';

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
            'demo',
            session.customerContext,
            session.conversationHistory,
            {
                language: currentLang,
                systemPrompt: DEMO_AGENT_PROMPT,
                useRAG: false,
                agentId: 'demo',
            },
        );

        let fullResponse = '';
        let updatedContext = null;

        for await (const chunk of stream) {
            if (chunk.type === 'content' || chunk.type === 'flow_text') {
                fullResponse += chunk.content;
            } else if (chunk.type === 'context') {
                updatedContext = chunk.customerContext;
            }
        }

        fullResponse = fullResponse.trim();
        if (!fullResponse) {
            fullResponse = "I didn't catch that. Could you say that again?";
        }

        // Parse [LANG:xx] tag if present (language switch)
        let newLanguage = null;
        const langMatch = fullResponse.match(/^\[LANG:([a-z]{2})\]\s*/i);
        if (langMatch) {
            newLanguage = langMatch[1].toLowerCase();
            fullResponse = fullResponse.replace(langMatch[0], '').trim(); // Strip tag from response
            session.language = newLanguage; // Persist for future turns
            console.log(`🌐 Language switched to: ${newLanguage}`);
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
            languageChanged: !!newLanguage,
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
