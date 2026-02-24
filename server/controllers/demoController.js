import aiAgentService from '../services/aiAgent.service.js';
import ttsService from '../services/tts.service.js';
import sessionStore from '../services/demoSessionStore.js';
import { DEMO_AGENT_PROMPT, DEMO_WELCOME_MESSAGE, DEEPGRAM_MODELS, SARVAM_VOICES } from '../prompts/demoAgent.js';

const DEMO_DEFAULT_VOICE = SARVAM_VOICES.en || 'shruti';

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
            welcomeAudioBase64 = await ttsService.speak(DEMO_WELCOME_MESSAGE, 'en', DEMO_DEFAULT_VOICE);
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
            audioFormat: ttsService.getOutputCodec(),
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
                maxTokens: 60,
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

        if (streamError || !fullResponse.trim()) {
            console.warn(`⚠️ Demo stream issue (${streamError || 'empty response'}). Falling back to non-stream mode.`);
            try {
                const fallback = await aiAgentService.processMessage(
                    message,
                    'default',
                    session.customerContext,
                    session.conversationHistory,
                    {
                        language: currentLang,
                        systemPrompt: DEMO_AGENT_PROMPT,
                        useRAG: false,
                        maxTokens: 60,
                    },
                );

                fullResponse = (fallback?.response || '').trim();
                if (fallback?.customerContext) {
                    updatedContext = fallback.customerContext;
                }
                if (fallback?.languageSwitch && !/^\[LANG:/i.test(fullResponse)) {
                    fullResponse = `[LANG:${fallback.languageSwitch}] ${fullResponse}`;
                }
            } catch (fallbackError) {
                throw new Error(`LLM fallback failed: ${fallbackError.message}`);
            }
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
        const voice = SARVAM_VOICES[responseLang] || DEMO_DEFAULT_VOICE;
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
            audioFormat: ttsService.getOutputCodec(),
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

/**
 * POST /api/demo/chat/stream
 * SSE stream: progressively emits audio chunks for lower perceived latency.
 */
export const demoChatStream = async (req, res) => {
    const writeEvent = (payload) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
        const { sessionId, message } = req.body;

        if (!sessionId) {
            res.status(400).json({ success: false, error: 'sessionId is required' });
            return;
        }
        if (!message || typeof message !== 'string' || !message.trim()) {
            res.status(400).json({ success: false, error: 'message is required' });
            return;
        }

        const session = sessionStore.getSession(sessionId);
        if (!session) {
            res.status(410).json({
                success: false,
                error: 'session_expired',
                message: 'Demo session has expired. Start a new session.',
            });
            return;
        }

        if (!sessionStore.canSendMessage(session)) {
            res.status(429).json({
                success: false,
                error: 'limit_reached',
                message: 'Message limit reached for this session.',
            });
            return;
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();

        sessionStore.addMessage(session, 'user', message);
        const currentLang = session.language || 'en';
        let responseLang = currentLang;
        let newLanguage = null;
        let languageSwitchBlocked = false;
        let updatedContext = null;

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
                maxTokens: 60,
            },
        );

        let streamError = null;
        let chunkIndex = 0;
        let emittedParts = [];
        let rawPrefixBuffer = '';
        let outputBuffer = '';
        let prefixResolved = false;
        let ignoreModelText = false;

        const sentenceSplit = (buffer, force = false) => {
            const out = [];
            let rest = buffer;
            while (true) {
                const m = rest.match(/^[\s\S]*?[.!?।॥](?:\s+|$)/);
                if (!m) break;
                out.push(m[0].trim());
                rest = rest.slice(m[0].length);
            }
            if (force && rest.trim()) {
                out.push(rest.trim());
                rest = '';
            }
            return { out, rest };
        };

        const speakAndEmit = async (text) => {
            const clean = (text || '').trim();
            if (!clean) return;
            const voice = SARVAM_VOICES[responseLang] || DEMO_DEFAULT_VOICE;
            let audioBase64 = null;
            try {
                audioBase64 = await ttsService.speak(clean, responseLang, voice);
            } catch (err) {
                console.warn('⚠️ Streamed demo TTS failed for chunk:', err.message);
            }
            chunkIndex += 1;
            emittedParts.push(clean);
            writeEvent({
                type: 'audio_chunk',
                index: chunkIndex,
                text: clean,
                audioBase64,
                audioFormat: ttsService.getOutputCodec(),
                language: responseLang,
            });
        };

        const resolveLanguagePrefixIfReady = (force = false) => {
            if (prefixResolved) return;
            const match = rawPrefixBuffer.match(/^\[LANG:([a-z]{2})\]\s*/i);

            if (match) {
                const requestedLanguage = match[1].toLowerCase();
                const deepgramSupported =
                    SUPPORTED_DEEPGRAM_STT_LANGS.has(requestedLanguage) &&
                    !!DEEPGRAM_MODELS[requestedLanguage];
                const ttsSupported = !!SARVAM_VOICES[requestedLanguage];

                if (deepgramSupported && ttsSupported) {
                    newLanguage = requestedLanguage;
                    responseLang = requestedLanguage;
                    session.language = requestedLanguage;
                    rawPrefixBuffer = rawPrefixBuffer.slice(match[0].length);
                    prefixResolved = true;
                    return;
                }

                languageSwitchBlocked = true;
                const reasons = [];
                if (!deepgramSupported) reasons.push('speech recognition');
                if (!ttsSupported) reasons.push('speech output');
                rawPrefixBuffer = buildUnsupportedLanguageMessage(
                    currentLang,
                    requestedLanguage,
                    reasons,
                );
                prefixResolved = true;
                ignoreModelText = true;
                return;
            }

            if (
                force ||
                !rawPrefixBuffer.startsWith('[LANG:') ||
                rawPrefixBuffer.length >= 18
            ) {
                prefixResolved = true;
            }
        };

        for await (const chunk of stream) {
            if (chunk.type === 'context') {
                updatedContext = chunk.customerContext;
                continue;
            }
            if (chunk.type === 'error') {
                streamError = chunk.message || 'LLM stream failed';
                break;
            }
            if (chunk.type !== 'content' && chunk.type !== 'flow_text') {
                continue;
            }

            if (ignoreModelText) continue;

            const piece = chunk.content || '';
            rawPrefixBuffer += piece;
            resolveLanguagePrefixIfReady(false);
            if (!prefixResolved) continue;

            outputBuffer += rawPrefixBuffer;
            rawPrefixBuffer = '';

            const shouldForceFlush = outputBuffer.length >= 140;
            const { out, rest } = sentenceSplit(outputBuffer, shouldForceFlush);
            outputBuffer = rest;
            for (const sentence of out) {
                // eslint-disable-next-line no-await-in-loop
                await speakAndEmit(sentence);
            }
        }

        if (streamError) {
            throw new Error(streamError);
        }

        resolveLanguagePrefixIfReady(true);
        if (!ignoreModelText && rawPrefixBuffer.trim()) {
            outputBuffer += rawPrefixBuffer;
            rawPrefixBuffer = '';
        }

        const { out: finalOut } = sentenceSplit(outputBuffer, true);
        for (const sentence of finalOut) {
            // eslint-disable-next-line no-await-in-loop
            await speakAndEmit(sentence);
        }

        let fullResponse = emittedParts.join(' ').trim();
        if (!fullResponse) {
            fullResponse = "I didn't catch that. Could you say that again?";
            await speakAndEmit(fullResponse);
        }

        sessionStore.addMessage(session, 'assistant', fullResponse);
        if (updatedContext) {
            session.customerContext = updatedContext;
        }

        const remainingSeconds = sessionStore.getRemainingSeconds(session);
        writeEvent({
            type: 'done',
            success: true,
            response: fullResponse,
            remainingSeconds,
            language: responseLang,
            languageChanged: !!newLanguage && !languageSwitchBlocked,
            deepgramConfig: DEEPGRAM_MODELS[responseLang] || DEEPGRAM_MODELS.en,
            audioFormat: ttsService.getOutputCodec(),
        });
        res.end();
    } catch (error) {
        console.error('❌ Demo chat stream error:', error);
        try {
            writeEvent({
                type: 'error',
                success: false,
                message: error.message || 'Failed to stream demo message',
            });
            res.end();
        } catch {
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to process demo stream message',
                    details: error.message,
                });
            }
        }
    }
};
