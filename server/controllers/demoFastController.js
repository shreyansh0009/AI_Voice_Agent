import demoFastAgentService from '../services/demoFastAgent.service.js';
import ttsService from '../services/tts.service.js';
import sessionStore from '../services/demoSessionStore.js';
import { DEMO_AGENT_PROMPT, DEMO_WELCOME_MESSAGE, DEEPGRAM_MODELS, SARVAM_VOICES } from '../prompts/demoAgent.js';

const DEMO_DEFAULT_VOICE = SARVAM_VOICES.en || 'simran';
const DEMO_MAX_TOKENS = 90;
const DEMO_TEMPERATURE = 0.35;

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

const SUPPORTED_DEEPGRAM_STT_LANGS = new Set(['en', 'hi', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml']);

function buildUnsupportedLanguageMessage(currentLang, requestedLang, reasons) {
    const currentName = LANGUAGE_LABELS[currentLang] || 'English';
    const requestedName = LANGUAGE_LABELS[requestedLang] || requestedLang.toUpperCase();
    const reasonText = reasons.length > 0 ? ` for ${reasons.join(' and ')}` : '';

    return `Sorry, I can currently talk only in ${currentName}. I can't switch to ${requestedName}${reasonText} right now. Can we continue in ${currentName}?`;
}

function ensureCompleteSentence(text) {
    const t = (text || '').trim();
    if (!t) return '';
    if (/[.!?।॥]["')\]]?\s*$/.test(t)) return t;

    const marks = ['.', '!', '?', '।', '॥'];
    let last = -1;
    for (const m of marks) {
        const i = t.lastIndexOf(m);
        if (i > last) last = i;
    }

    if (last > 0 && last >= Math.floor(t.length * 0.65)) {
        return t.slice(0, last + 1).trim();
    }

    return `${t}.`;
}

function getHistoryWithoutCurrentUserTurn(session) {
    if (!Array.isArray(session?.conversationHistory)) return [];
    if (session.conversationHistory.length === 0) return [];
    return session.conversationHistory.slice(0, -1);
}

function parseLanguageSwitch(rawResponse, currentLang) {
    let fullResponse = rawResponse || '';
    let responseLang = currentLang;
    let languageChanged = false;

    const langMatch = fullResponse.match(/^\[LANG:([a-z]{2})\]\s*/i);
    if (!langMatch) {
        return { fullResponse, responseLang, languageChanged };
    }

    const requestedLanguage = langMatch[1].toLowerCase();
    const deepgramSupported = SUPPORTED_DEEPGRAM_STT_LANGS.has(requestedLanguage) && !!DEEPGRAM_MODELS[requestedLanguage];
    const ttsSupported = !!SARVAM_VOICES[requestedLanguage];

    if (deepgramSupported && ttsSupported) {
        responseLang = requestedLanguage;
        languageChanged = true;
        fullResponse = fullResponse.replace(langMatch[0], '').trim();
        return { fullResponse, responseLang, languageChanged };
    }

    const reasons = [];
    if (!deepgramSupported) reasons.push('speech recognition');
    if (!ttsSupported) reasons.push('speech output');
    fullResponse = buildUnsupportedLanguageMessage(currentLang, requestedLanguage, reasons);
    return { fullResponse, responseLang, languageChanged: false };
}

function splitSentences(buffer, force = false) {
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
}

/**
 * POST /api/demo-fast/start-session
 */
export const startFastSession = async (req, res) => {
    try {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const result = sessionStore.createSession(ip);
        if (result.error) {
            return res.status(429).json({ success: false, ...result });
        }

        const deepgramToken = process.env.DEEPGRAM_API_KEY || null;
        let welcomeAudioBase64 = null;
        try {
            welcomeAudioBase64 = await ttsService.speak(DEMO_WELCOME_MESSAGE, 'en', DEMO_DEFAULT_VOICE);
        } catch (err) {
            console.warn('⚠️ Could not generate fast welcome TTS:', err.message);
        }

        const session = sessionStore.getSession(result.sessionId);
        if (session) {
            sessionStore.addMessage(session, 'assistant', DEMO_WELCOME_MESSAGE);
            session.language = 'en';
        }

        return res.json({
            success: true,
            sessionId: result.sessionId,
            deepgramToken,
            expiresIn: result.expiresIn,
            welcomeMessage: DEMO_WELCOME_MESSAGE,
            welcomeAudioBase64,
            audioFormat: ttsService.getOutputCodec(),
            language: 'en',
            deepgramConfig: DEEPGRAM_MODELS.en,
        });
    } catch (error) {
        console.error('❌ Fast demo start-session error:', error);
        return res.status(500).json({ success: false, error: 'Failed to start fast demo session' });
    }
};

/**
 * POST /api/demo-fast/chat
 */
export const demoFastChat = async (req, res) => {
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
        const currentLang = session.language || 'en';
        const conversationHistory = getHistoryWithoutCurrentUserTurn(session);

        const llmResult = await demoFastAgentService.processMessage(message, {
            systemPrompt: DEMO_AGENT_PROMPT,
            conversationHistory,
            maxTokens: DEMO_MAX_TOKENS,
            temperature: DEMO_TEMPERATURE,
        });

        let fullResponse = ensureCompleteSentence((llmResult?.response || '').trim());
        if (!fullResponse) {
            fullResponse = "I didn't catch that. Could you say that again?";
        }

        const languageParsed = parseLanguageSwitch(fullResponse, currentLang);
        fullResponse = ensureCompleteSentence(languageParsed.fullResponse);
        const responseLang = languageParsed.responseLang || currentLang;
        const languageChanged = !!languageParsed.languageChanged;
        if (languageChanged) {
            session.language = responseLang;
        }

        sessionStore.addMessage(session, 'assistant', fullResponse);

        let audioBase64 = null;
        const voice = SARVAM_VOICES[responseLang] || DEMO_DEFAULT_VOICE;
        try {
            audioBase64 = await ttsService.speak(fullResponse, responseLang, voice);
        } catch (err) {
            console.warn('⚠️ Fast demo TTS failed:', err.message);
        }

        const remainingSeconds = sessionStore.getRemainingSeconds(session);
        return res.json({
            success: true,
            response: fullResponse,
            audioBase64,
            audioFormat: ttsService.getOutputCodec(),
            remainingSeconds,
            language: responseLang,
            languageChanged,
            deepgramConfig: DEEPGRAM_MODELS[responseLang] || DEEPGRAM_MODELS.en,
        });
    } catch (error) {
        console.error('❌ Fast demo chat error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to process fast demo message',
            details: error.message,
        });
    }
};

/**
 * POST /api/demo-fast/chat/stream
 */
export const demoFastChatStream = async (req, res) => {
    const writeEvent = (payload) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

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

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();

        sessionStore.addMessage(session, 'user', message);
        const currentLang = session.language || 'en';
        const conversationHistory = getHistoryWithoutCurrentUserTurn(session);

        let responseLang = currentLang;
        let languageChanged = false;
        let chunkIndex = 0;
        const emittedParts = [];

        const speakAndEmit = async (text) => {
            const clean = ensureCompleteSentence((text || '').trim());
            if (!clean) return;
            const voice = SARVAM_VOICES[responseLang] || DEMO_DEFAULT_VOICE;
            let audioBase64 = null;
            try {
                audioBase64 = await ttsService.speak(clean, responseLang, voice);
            } catch (err) {
                console.warn('⚠️ Fast streamed TTS failed for chunk:', err.message);
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

        let rawPrefixBuffer = '';
        let outputBuffer = '';
        let prefixResolved = false;
        let ignoreModelText = false;

        const resolveLanguagePrefixIfReady = (force = false) => {
            if (prefixResolved) return;
            const match = rawPrefixBuffer.match(/^\[LANG:([a-z]{2})\]\s*/i);
            if (match) {
                const parsed = parseLanguageSwitch(rawPrefixBuffer, currentLang);
                const hadPrefix = rawPrefixBuffer.replace(match[0], '').trim();
                if (parsed.languageChanged) {
                    responseLang = parsed.responseLang;
                    languageChanged = true;
                    session.language = parsed.responseLang;
                    rawPrefixBuffer = rawPrefixBuffer.slice(match[0].length);
                    prefixResolved = true;
                    return;
                }
                prefixResolved = true;
                ignoreModelText = true;
                rawPrefixBuffer = parsed.fullResponse;
                outputBuffer = `${outputBuffer} ${rawPrefixBuffer}`.trim();
                rawPrefixBuffer = '';
                if (hadPrefix) {
                    // Keep blocked-language response only.
                }
                return;
            }

            if (force || !rawPrefixBuffer.startsWith('[LANG:') || rawPrefixBuffer.length >= 18) {
                prefixResolved = true;
            }
        };

        const stream = demoFastAgentService.processMessageStream(message, {
            systemPrompt: DEMO_AGENT_PROMPT,
            conversationHistory,
            maxTokens: DEMO_MAX_TOKENS,
            temperature: DEMO_TEMPERATURE,
        });

        for await (const chunk of stream) {
            if (chunk.type === 'error') {
                throw new Error(chunk.message || 'Fast LLM stream failed');
            }
            if (chunk.type !== 'content') {
                continue;
            }
            if (ignoreModelText) continue;

            rawPrefixBuffer += chunk.content || '';
            resolveLanguagePrefixIfReady(false);
            if (!prefixResolved) continue;

            outputBuffer += rawPrefixBuffer;
            rawPrefixBuffer = '';

            const { out, rest } = splitSentences(outputBuffer, false);
            outputBuffer = rest;
            for (const sentence of out) {
                // eslint-disable-next-line no-await-in-loop
                await speakAndEmit(sentence);
            }
        }

        resolveLanguagePrefixIfReady(true);
        if (!ignoreModelText && rawPrefixBuffer.trim()) {
            outputBuffer += rawPrefixBuffer;
            rawPrefixBuffer = '';
        }
        const { out: finalOut } = splitSentences(outputBuffer, true);
        for (const sentence of finalOut) {
            // eslint-disable-next-line no-await-in-loop
            await speakAndEmit(sentence);
        }

        let fullResponse = ensureCompleteSentence(emittedParts.join(' ').trim());
        if (!fullResponse) {
            fullResponse = "I didn't catch that. Could you say that again?";
            await speakAndEmit(fullResponse);
        }

        sessionStore.addMessage(session, 'assistant', fullResponse);
        const remainingSeconds = sessionStore.getRemainingSeconds(session);

        writeEvent({
            type: 'done',
            success: true,
            response: fullResponse,
            remainingSeconds,
            language: responseLang,
            languageChanged,
            deepgramConfig: DEEPGRAM_MODELS[responseLang] || DEEPGRAM_MODELS.en,
            audioFormat: ttsService.getOutputCodec(),
        });
        res.end();
    } catch (error) {
        console.error('❌ Fast demo chat stream error:', error);
        try {
            writeEvent({
                type: 'error',
                success: false,
                message: error.message || 'Failed to stream fast demo message',
            });
            res.end();
        } catch {
            if (!res.headersSent) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to process fast demo stream message',
                    details: error.message,
                });
            }
        }
    }
};

