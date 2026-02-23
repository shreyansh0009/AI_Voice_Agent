import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../utils/api';

/**
 * TapToTalkDemo — Continuous conversation voice demo.
 *
 * Architecture:
 *   STT: Deepgram (Flux v2 for English with EndOfTurn, Nova-2 v1 for others with silence detection)
 *   TTS: Sarvam (server-side, multi-language)
 *   LLM: OpenAI via processMessageStream (server-side)
 *
 * Flow:
 *   1. Click "Start" → session + Deepgram WS + mic all start
 *   2. User speaks → live transcript → EndOfTurn/silence → auto-send to backend
 *   3. AI responds → TTS plays (mic muted) → resumes listening → loop
 *   4. "End" button stops everything
 */

const STATES = {
    IDLE: 'idle',
    CONNECTING: 'connecting',
    LISTENING: 'listening',
    PROCESSING: 'processing',
    SPEAKING: 'speaking',
    EXPIRED: 'expired',
};

const DEFAULT_DG_CONFIG = { endpoint: 'v2', model: 'flux-general-en' };
const SILENCE_TIMEOUT_MS = 2000; // For non-Flux languages

export default function TapToTalkDemo() {
    const [state, setState] = useState(STATES.IDLE);
    const [sessionId, setSessionId] = useState(null);
    const [deepgramToken, setDeepgramToken] = useState(null);
    const [dgConfig, setDgConfig] = useState(DEFAULT_DG_CONFIG);
    const [currentLang, setCurrentLang] = useState('en');
    const [remainingSeconds, setRemainingSeconds] = useState(300);
    const [transcript, setTranscript] = useState('');
    const [messages, setMessages] = useState([]);
    const [error, setError] = useState(null);

    // Refs
    const dgSocketRef = useRef(null);
    const audioCtxRef = useRef(null);
    const processorRef = useRef(null);
    const sourceRef = useRef(null);
    const streamRef = useRef(null);
    const audioRef = useRef(null);
    const timerRef = useRef(null);
    const finalTranscriptRef = useRef('');
    const isMutedRef = useRef(false); // Mute during TTS playback
    const silenceTimerRef = useRef(null);
    const lastSpeechTimeRef = useRef(0);
    const stateRef = useRef(STATES.IDLE);
    const dgConfigRef = useRef(DEFAULT_DG_CONFIG);
    const deepgramTokenRef = useRef(null);
    const sessionIdRef = useRef(null);
    const messagesRef = useRef([]);
    const msgContainerRef = useRef(null);

    // Keep refs in sync with state
    useEffect(() => { stateRef.current = state; }, [state]);
    useEffect(() => { dgConfigRef.current = dgConfig; }, [dgConfig]);
    useEffect(() => { deepgramTokenRef.current = deepgramToken; }, [deepgramToken]);
    useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
    useEffect(() => { messagesRef.current = messages; }, [messages]);

    // Auto-scroll messages
    useEffect(() => {
        if (msgContainerRef.current) {
            msgContainerRef.current.scrollTop = msgContainerRef.current.scrollHeight;
        }
    }, [messages, transcript]);

    const formatTime = (s) => {
        const m = Math.floor(s / 60);
        return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    };

    // ── Countdown timer ────────────────────────────────────────────
    useEffect(() => {
        if (!sessionId || state === STATES.IDLE || state === STATES.EXPIRED) return;
        timerRef.current = setInterval(() => {
            setRemainingSeconds((prev) => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    setState(STATES.EXPIRED);
                    cleanupAll();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, [sessionId, state]);

    // ── Full cleanup ───────────────────────────────────────────────
    const cleanupAll = useCallback(() => {
        if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
        if (dgSocketRef.current) {
            try { dgSocketRef.current.close(); } catch { }
            dgSocketRef.current = null;
        }
        if (processorRef.current) {
            try { processorRef.current.disconnect(); } catch { }
            processorRef.current = null;
        }
        if (sourceRef.current) {
            try { sourceRef.current.disconnect(); } catch { }
            sourceRef.current = null;
        }
        if (audioCtxRef.current) {
            try { audioCtxRef.current.close(); } catch { }
            audioCtxRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        if (audioRef.current) {
            try { audioRef.current.pause(); } catch { }
            audioRef.current = null;
        }
    }, []);

    useEffect(() => cleanupAll, []);

    // ── Play audio (returns promise) ───────────────────────────────
    const playAudio = useCallback((base64, format = 'wav') => {
        return new Promise((resolve) => {
            const mime = format === 'mp3' ? 'audio/mpeg' : 'audio/wav';
            const audio = new Audio(`data:${mime};base64,${base64}`);
            audioRef.current = audio;
            audio.onended = () => { audioRef.current = null; resolve(); };
            audio.onerror = () => { audioRef.current = null; resolve(); };
            audio.play().catch(() => resolve());
        });
    }, []);

    // ── Build Deepgram URL ─────────────────────────────────────────
    const buildDgUrl = (config) => {
        if (config.endpoint === 'v2') {
            return `wss://api.deepgram.com/v2/listen?model=${config.model}&encoding=linear16&sample_rate=16000`;
        }
        return `wss://api.deepgram.com/v1/listen?model=${config.model}&language=${config.language}&encoding=linear16&sample_rate=16000&smart_format=true`;
    };

    // ── Handle end of turn (called by Flux EndOfTurn or silence detection) ──
    const handleEndOfTurn = useCallback(async () => {
        if (stateRef.current !== STATES.LISTENING) return;

        const text = finalTranscriptRef.current.trim();
        if (!text) return;

        // Clear silence timer
        if (silenceTimerRef.current) {
            clearInterval(silenceTimerRef.current);
            silenceTimerRef.current = null;
        }

        // Mute mic (stop sending audio to Deepgram)
        isMutedRef.current = true;
        setState(STATES.PROCESSING);

        // Add user message
        setMessages((prev) => [...prev, { role: 'user', content: text }]);
        setTranscript('');
        finalTranscriptRef.current = '';

        // Send to backend
        try {
            const res = await api.post('/api/demo/chat', {
                sessionId: sessionIdRef.current,
                message: text,
            });

            if (!res.data?.success) {
                if (res.data?.error === 'session_expired') {
                    setState(STATES.EXPIRED);
                    cleanupAll();
                    return;
                }
                throw new Error(res.data?.message || 'Chat failed');
            }

            setMessages((prev) => [...prev, { role: 'assistant', content: res.data.response }]);
            setRemainingSeconds(res.data.remainingSeconds || 0);

            // Handle language switch
            if (res.data.languageChanged && res.data.language) {
                setCurrentLang(res.data.language);
                setDgConfig(res.data.deepgramConfig || DEFAULT_DG_CONFIG);
                console.log(`🌐 Language switched to: ${res.data.language}`);

                // Reconnect Deepgram with new config after TTS
                const needReconnect = true;

                if (res.data.audioBase64) {
                    setState(STATES.SPEAKING);
                    await playAudio(res.data.audioBase64, res.data.audioFormat || 'wav');
                }

                // Reconnect Deepgram for new language
                if (needReconnect) {
                    await reconnectDeepgram(res.data.deepgramConfig || DEFAULT_DG_CONFIG);
                }
            } else {
                // Play TTS
                if (res.data.audioBase64) {
                    setState(STATES.SPEAKING);
                    await playAudio(res.data.audioBase64, res.data.audioFormat || 'wav');
                }
            }

            // Resume listening
            isMutedRef.current = false;
            finalTranscriptRef.current = '';
            setTranscript('');
            setState(STATES.LISTENING);
            startSilenceDetection();
        } catch (err) {
            if (err?.response?.status === 410) {
                setState(STATES.EXPIRED);
                cleanupAll();
            } else {
                setError(err?.response?.data?.message || err.message || 'Failed to get response');
                isMutedRef.current = false;
                setState(STATES.LISTENING);
                startSilenceDetection();
            }
        }
    }, []);

    // ── Silence detection (for Nova-2 v1 / non-English) ────────────
    const startSilenceDetection = useCallback(() => {
        if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
        if (dgConfigRef.current.endpoint === 'v2') return; // Flux has EndOfTurn, no need

        lastSpeechTimeRef.current = Date.now();
        silenceTimerRef.current = setInterval(() => {
            if (stateRef.current !== STATES.LISTENING) return;
            const elapsed = Date.now() - lastSpeechTimeRef.current;
            if (elapsed >= SILENCE_TIMEOUT_MS && finalTranscriptRef.current.trim()) {
                console.log('🔇 Silence detected, ending turn');
                handleEndOfTurn();
            }
        }, 500);
    }, [handleEndOfTurn]);

    // ── Connect Deepgram WebSocket ─────────────────────────────────
    const connectDeepgram = useCallback((config, token) => {
        return new Promise((resolve, reject) => {
            const dgUrl = buildDgUrl(config);
            const isFlux = config.endpoint === 'v2';
            console.log(`🔌 Connecting Deepgram (${isFlux ? 'Flux v2' : 'Nova-2 v1'})...`);

            const ws = new WebSocket(dgUrl, ['token', token]);
            dgSocketRef.current = ws;

            ws.onopen = () => {
                console.log('✅ Deepgram connected');
                resolve(ws);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    if (isFlux) {
                        // Flux v2: EndOfTurn event = user finished speaking
                        if (data.type === 'EndOfTurn') {
                            console.log('🛑 Flux EndOfTurn detected');
                            handleEndOfTurn();
                            return;
                        }
                        // Transcript update (replace, not append)
                        if (data.transcript) {
                            finalTranscriptRef.current = data.transcript;
                            setTranscript(data.transcript);
                        }
                    } else {
                        // Nova-2 v1: channel.alternatives
                        const text = data.channel?.alternatives?.[0]?.transcript;
                        if (text?.trim()) {
                            lastSpeechTimeRef.current = Date.now(); // Reset silence timer
                            if (data.is_final) {
                                finalTranscriptRef.current += (finalTranscriptRef.current ? ' ' : '') + text;
                                setTranscript(finalTranscriptRef.current);
                            } else {
                                setTranscript(finalTranscriptRef.current + (finalTranscriptRef.current ? ' ' : '') + text);
                            }
                        }
                    }
                } catch { }
            };

            ws.onerror = (e) => console.warn('Deepgram WS error:', e);

            ws.onclose = (e) => {
                console.log(`Deepgram closed: ${e.code}`);
                if (stateRef.current !== STATES.IDLE && stateRef.current !== STATES.EXPIRED) {
                    // Don't reject if we intentionally closed for reconnect
                }
            };

            setTimeout(() => reject(new Error('Deepgram connection timeout')), 5000);
        });
    }, [handleEndOfTurn]);

    // ── Reconnect Deepgram (for language switch) ───────────────────
    const reconnectDeepgram = useCallback(async (newConfig) => {
        // Close existing
        if (dgSocketRef.current) {
            try { dgSocketRef.current.close(); } catch { }
            dgSocketRef.current = null;
        }

        try {
            await connectDeepgram(newConfig, deepgramTokenRef.current);
            console.log('✅ Deepgram reconnected with new language config');
        } catch (err) {
            console.error('Failed to reconnect Deepgram:', err);
            setError('Speech recognition reconnection failed.');
        }
    }, [connectDeepgram]);

    // ── Start continuous conversation ──────────────────────────────
    const handleStart = async () => {
        setError(null);
        setState(STATES.CONNECTING);

        // Step 1: Start session
        let sessionData;
        try {
            const res = await api.post('/api/demo/start-session');
            if (!res.data?.success) {
                setError(res.data?.message || 'Failed to start session');
                setState(STATES.IDLE);
                return;
            }
            sessionData = res.data;
            setSessionId(sessionData.sessionId);
            sessionIdRef.current = sessionData.sessionId;
            setDeepgramToken(sessionData.deepgramToken);
            deepgramTokenRef.current = sessionData.deepgramToken;
            setCurrentLang(sessionData.language || 'en');
            setDgConfig(sessionData.deepgramConfig || DEFAULT_DG_CONFIG);
            dgConfigRef.current = sessionData.deepgramConfig || DEFAULT_DG_CONFIG;
            setRemainingSeconds(sessionData.expiresIn || 300);

            if (sessionData.welcomeMessage) {
                setMessages([{ role: 'assistant', content: sessionData.welcomeMessage }]);
            }
        } catch (err) {
            setError(err?.response?.data?.message || 'Failed to start session');
            setState(STATES.IDLE);
            return;
        }

        // Step 2: Get microphone
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 16000 },
            });
            streamRef.current = stream;
        } catch {
            setError('Microphone access denied. Please allow microphone permission.');
            setState(STATES.IDLE);
            return;
        }

        // Step 3: Connect Deepgram
        try {
            await connectDeepgram(
                sessionData.deepgramConfig || DEFAULT_DG_CONFIG,
                sessionData.deepgramToken,
            );
        } catch (err) {
            setError(err.message);
            stream.getTracks().forEach((t) => t.stop());
            setState(STATES.IDLE);
            return;
        }

        // Step 4: Start AudioContext → PCM → Deepgram
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            audioCtxRef.current = audioCtx;
            const source = audioCtx.createMediaStreamSource(stream);
            sourceRef.current = source;
            const processor = audioCtx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            source.connect(processor);
            processor.connect(audioCtx.destination);

            processor.onaudioprocess = (e) => {
                // Don't send audio during TTS playback (echo prevention)
                if (isMutedRef.current) return;
                if (dgSocketRef.current?.readyState === WebSocket.OPEN) {
                    const float32 = e.inputBuffer.getChannelData(0);
                    const int16 = new Int16Array(float32.length);
                    for (let i = 0; i < float32.length; i++) {
                        int16[i] = Math.max(-32768, Math.min(32767, Math.floor(float32[i] * 32768)));
                    }
                    dgSocketRef.current.send(int16.buffer);
                }
            };
        } catch (err) {
            setError('Audio processing failed.');
            cleanupAll();
            setState(STATES.IDLE);
            return;
        }

        // Step 5: Play welcome audio, then start listening
        if (sessionData.welcomeAudioBase64) {
            isMutedRef.current = true;
            setState(STATES.SPEAKING);
            await playAudio(sessionData.welcomeAudioBase64, sessionData.audioFormat || 'wav');
            isMutedRef.current = false;
        }

        setState(STATES.LISTENING);
        startSilenceDetection();
    };

    // ── End conversation ───────────────────────────────────────────
    const handleEnd = () => {
        cleanupAll();
        setState(STATES.EXPIRED);
    };

    // ── Language badge ─────────────────────────────────────────────
    const LANG_LABELS = {
        en: '🇬🇧 EN', hi: '🇮🇳 HI', ta: '🇮🇳 TA', te: '🇮🇳 TE',
        bn: '🇮🇳 BN', mr: '🇮🇳 MR', gu: '🇮🇳 GU', kn: '🇮🇳 KN',
        ml: '🇮🇳 ML', pa: '🇮🇳 PA',
    };

    // ── Render ─────────────────────────────────────────────────────
    const isActive = state !== STATES.IDLE && state !== STATES.EXPIRED;

    return (
        <div style={{
            fontFamily: "'Inter', -apple-system, sans-serif",
            maxWidth: 440, margin: '0 auto', padding: 20,
        }}>
            {/* Header: Language + Timer */}
            {isActive && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{
                        fontSize: 11, padding: '3px 8px', borderRadius: 6,
                        background: '#f0f9ff', color: '#0284c7', fontWeight: 600,
                    }}>
                        {LANG_LABELS[currentLang] || currentLang.toUpperCase()}
                    </div>

                    {/* Status indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: state === STATES.LISTENING ? '#22c55e' : state === STATES.SPEAKING ? '#8b5cf6' : '#f59e0b',
                            animation: state === STATES.LISTENING ? 'demoPulseGreen 1.5s infinite' : 'none',
                        }} />
                        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>
                            {state === STATES.LISTENING ? 'Listening' : state === STATES.PROCESSING ? 'Thinking...' : state === STATES.SPEAKING ? 'Speaking' : 'Connecting...'}
                        </span>
                    </div>

                    <div style={{
                        fontSize: 14, fontFamily: 'monospace', fontWeight: 600,
                        color: remainingSeconds < 60 ? '#ef4444' : '#64748b',
                    }}>
                        {formatTime(remainingSeconds)}
                    </div>
                </div>
            )}

            {/* Messages */}
            <div ref={msgContainerRef} style={{
                minHeight: 240, maxHeight: 380, overflowY: 'auto', marginBottom: 16,
                padding: 12, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0',
            }}>
                {messages.length === 0 && state === STATES.IDLE && (
                    <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 14, padding: '80px 0' }}>
                        Start a voice conversation with BodhiTalk AI
                    </div>
                )}
                {messages.map((msg, idx) => (
                    <div key={idx} style={{
                        display: 'flex',
                        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        marginBottom: 8,
                    }}>
                        <div style={{
                            maxWidth: '80%', padding: '8px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.5,
                            ...(msg.role === 'user'
                                ? { background: '#3b82f6', color: '#fff', borderBottomRightRadius: 4 }
                                : { background: '#fff', color: '#1e293b', border: '1px solid #e2e8f0', borderBottomLeftRadius: 4 }),
                        }}>
                            {msg.content}
                        </div>
                    </div>
                ))}

                {/* Live transcript */}
                {(state === STATES.LISTENING) && transcript && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                        <div style={{
                            maxWidth: '80%', padding: '8px 12px', borderRadius: 12, fontSize: 13,
                            background: '#dbeafe', color: '#3b82f6', fontStyle: 'italic', borderBottomRightRadius: 4,
                        }}>
                            {transcript}...
                        </div>
                    </div>
                )}

                {/* Processing dots */}
                {state === STATES.PROCESSING && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
                        <div style={{
                            padding: '8px 16px', borderRadius: 12, background: '#fff',
                            border: '1px solid #e2e8f0', display: 'flex', gap: 4,
                        }}>
                            {[0, 1, 2].map((i) => (
                                <div key={i} style={{
                                    width: 6, height: 6, borderRadius: '50%', background: '#94a3b8',
                                    animation: `demoBounce 0.6s ${i * 0.15}s infinite alternate`,
                                }} />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Error */}
            {error && (
                <div style={{
                    padding: '8px 12px', marginBottom: 12, borderRadius: 8,
                    background: '#fef2f2', color: '#dc2626', fontSize: 13, textAlign: 'center',
                }}>
                    {error}
                </div>
            )}

            {/* Controls */}
            <div style={{ textAlign: 'center' }}>
                {state === STATES.IDLE && (
                    <button
                        onClick={handleStart}
                        style={{
                            padding: '14px 36px', fontSize: 16, fontWeight: 600,
                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            color: '#fff', border: 'none', borderRadius: 14, cursor: 'pointer',
                            boxShadow: '0 4px 14px rgba(34,197,94,0.4)',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                        }}
                        onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
                        onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                        📞 Start Conversation
                    </button>
                )}

                {isActive && state !== STATES.CONNECTING && (
                    <button
                        onClick={handleEnd}
                        style={{
                            padding: '10px 24px', fontSize: 14, fontWeight: 600,
                            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                            color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer',
                            boxShadow: '0 4px 14px rgba(239,68,68,0.3)',
                        }}
                    >
                        ✕ End Conversation
                    </button>
                )}

                {state === STATES.CONNECTING && (
                    <div style={{ fontSize: 14, color: '#64748b', fontWeight: 500 }}>Connecting...</div>
                )}

                {state === STATES.EXPIRED && (
                    <div>
                        <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 12 }}>Conversation ended</div>
                        <button
                            onClick={() => {
                                setMessages([]); setSessionId(null); setDeepgramToken(null);
                                setDgConfig(DEFAULT_DG_CONFIG); setCurrentLang('en');
                                setTranscript(''); setError(null); setState(STATES.IDLE);
                                finalTranscriptRef.current = '';
                            }}
                            style={{
                                padding: '12px 28px', fontSize: 14, fontWeight: 600,
                                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer',
                            }}
                        >
                            Start New Conversation
                        </button>
                    </div>
                )}
            </div>

            <style>{`
        @keyframes demoPulseGreen {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes demoBounce {
          from { transform: translateY(0); }
          to { transform: translateY(-4px); }
        }
      `}</style>
        </div>
    );
}
