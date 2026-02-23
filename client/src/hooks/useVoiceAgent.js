/**
 * useVoiceAgent — Drop-in React hook for BodhiTalk Voice Agent integration.
 *
 * Usage:
 *   const { listening, transcript, messages, start, stop } = useVoiceAgent({
 *     apiBase: 'https://your-vps-domain.com',
 *   });
 *
 * Dependencies: None (uses native browser APIs only)
 */
import { useState, useRef, useCallback, useEffect } from 'react';

const SILENCE_TIMEOUT_MS = 2000;

export function useVoiceAgent({ apiBase = '' } = {}) {
    const [listening, setListening] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [speaking, setSpeaking] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [messages, setMessages] = useState([]);
    const [error, setError] = useState(null);
    const [language, setLanguage] = useState('en');
    const [remainingSeconds, setRemainingSeconds] = useState(300);
    const [active, setActive] = useState(false);

    // Refs
    const sessionIdRef = useRef(null);
    const dgTokenRef = useRef(null);
    const dgConfigRef = useRef({ endpoint: 'v2', model: 'flux-general-en' });
    const dgSocketRef = useRef(null);
    const audioCtxRef = useRef(null);
    const processorRef = useRef(null);
    const sourceRef = useRef(null);
    const streamRef = useRef(null);
    const audioRef = useRef(null);
    const timerRef = useRef(null);
    const finalTranscriptRef = useRef('');
    const isMutedRef = useRef(false);
    const silenceTimerRef = useRef(null);
    const lastSpeechRef = useRef(0);
    const stateRef = useRef('idle'); // idle | listening | processing | speaking
    const messagesRef = useRef([]);

    useEffect(() => { messagesRef.current = messages; }, [messages]);

    // ── Countdown ──────────────────────────────────────────────────
    useEffect(() => {
        if (!active) return;
        timerRef.current = setInterval(() => {
            setRemainingSeconds((prev) => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    stop();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, [active]);

    // ── API helper ─────────────────────────────────────────────────
    const apiPost = async (path, body = {}) => {
        const res = await fetch(`${apiBase}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return res.json();
    };

    // ── Audio playback ─────────────────────────────────────────────
    const playAudio = (base64, format = 'wav') => {
        return new Promise((resolve) => {
            const mime = format === 'mp3' ? 'audio/mpeg' : 'audio/wav';
            const audio = new Audio(`data:${mime};base64,${base64}`);
            audioRef.current = audio;
            audio.onended = () => { audioRef.current = null; resolve(); };
            audio.onerror = () => { audioRef.current = null; resolve(); };
            audio.play().catch(() => resolve());
        });
    };

    // ── Build Deepgram URL ─────────────────────────────────────────
    const buildDgUrl = (config) => {
        if (config.endpoint === 'v2') {
            return `wss://api.deepgram.com/v2/listen?model=${config.model}&encoding=linear16&sample_rate=16000`;
        }
        return `wss://api.deepgram.com/v1/listen?model=${config.model}&language=${config.language}&encoding=linear16&sample_rate=16000&smart_format=true`;
    };

    // ── End of turn handler ────────────────────────────────────────
    const handleEndOfTurn = useCallback(async () => {
        if (stateRef.current !== 'listening') return;
        const text = finalTranscriptRef.current.trim();
        if (!text) return;

        if (silenceTimerRef.current) { clearInterval(silenceTimerRef.current); silenceTimerRef.current = null; }

        isMutedRef.current = true;
        stateRef.current = 'processing';
        setListening(false);
        setProcessing(true);

        setMessages((prev) => [...prev, { role: 'user', content: text }]);
        setTranscript('');
        finalTranscriptRef.current = '';

        try {
            const data = await apiPost('/api/demo/chat', {
                sessionId: sessionIdRef.current,
                message: text,
            });

            if (!data.success) {
                if (data.error === 'session_expired') { stop(); return; }
                throw new Error(data.message || 'Chat failed');
            }

            setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
            setRemainingSeconds(data.remainingSeconds || 0);

            // Language switch
            if (data.languageChanged && data.language) {
                setLanguage(data.language);
                dgConfigRef.current = data.deepgramConfig || dgConfigRef.current;
            }

            // Play TTS
            setProcessing(false);
            if (data.audioBase64) {
                stateRef.current = 'speaking';
                setSpeaking(true);
                await playAudio(data.audioBase64, data.audioFormat || 'wav');
                setSpeaking(false);
            }

            // Reconnect Deepgram if language changed
            if (data.languageChanged) {
                await reconnectDg(data.deepgramConfig || dgConfigRef.current);
            }

            // Resume listening
            isMutedRef.current = false;
            finalTranscriptRef.current = '';
            setTranscript('');
            stateRef.current = 'listening';
            setListening(true);
            startSilenceDetection();
        } catch (err) {
            setError(err.message);
            isMutedRef.current = false;
            stateRef.current = 'listening';
            setProcessing(false);
            setListening(true);
            startSilenceDetection();
        }
    }, []);

    // ── Silence detection ──────────────────────────────────────────
    const startSilenceDetection = useCallback(() => {
        if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
        if (dgConfigRef.current.endpoint === 'v2') return;
        lastSpeechRef.current = Date.now();
        silenceTimerRef.current = setInterval(() => {
            if (stateRef.current !== 'listening') return;
            if (Date.now() - lastSpeechRef.current >= SILENCE_TIMEOUT_MS && finalTranscriptRef.current.trim()) {
                handleEndOfTurn();
            }
        }, 500);
    }, [handleEndOfTurn]);

    // ── Connect Deepgram ───────────────────────────────────────────
    const connectDg = useCallback((config, token) => {
        return new Promise((resolve, reject) => {
            const url = buildDgUrl(config);
            const isFlux = config.endpoint === 'v2';
            const ws = new WebSocket(url, ['token', token]);
            dgSocketRef.current = ws;

            ws.onopen = () => resolve(ws);
            ws.onerror = () => { };
            ws.onclose = (e) => reject(new Error(`Deepgram closed: ${e.code}`));

            ws.onmessage = (event) => {
                try {
                    const d = JSON.parse(event.data);
                    if (isFlux) {
                        if (d.type === 'EndOfTurn') { handleEndOfTurn(); return; }
                        if (d.transcript) {
                            finalTranscriptRef.current = d.transcript;
                            setTranscript(d.transcript);
                        }
                    } else {
                        const t = d.channel?.alternatives?.[0]?.transcript;
                        if (t?.trim()) {
                            lastSpeechRef.current = Date.now();
                            if (d.is_final) {
                                finalTranscriptRef.current += (finalTranscriptRef.current ? ' ' : '') + t;
                                setTranscript(finalTranscriptRef.current);
                            } else {
                                setTranscript(finalTranscriptRef.current + (finalTranscriptRef.current ? ' ' : '') + t);
                            }
                        }
                    }
                } catch { }
            };

            setTimeout(() => reject(new Error('Deepgram timeout')), 5000);
        });
    }, [handleEndOfTurn]);

    // ── Reconnect Deepgram ─────────────────────────────────────────
    const reconnectDg = useCallback(async (config) => {
        if (dgSocketRef.current) { try { dgSocketRef.current.close(); } catch { } }
        try { await connectDg(config, dgTokenRef.current); } catch (e) { setError(e.message); }
    }, [connectDg]);

    // ── Cleanup ────────────────────────────────────────────────────
    const cleanupAll = useCallback(() => {
        if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
        if (dgSocketRef.current) { try { dgSocketRef.current.close(); } catch { } dgSocketRef.current = null; }
        if (processorRef.current) { try { processorRef.current.disconnect(); } catch { } processorRef.current = null; }
        if (sourceRef.current) { try { sourceRef.current.disconnect(); } catch { } sourceRef.current = null; }
        if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch { } audioCtxRef.current = null; }
        if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
        if (audioRef.current) { try { audioRef.current.pause(); } catch { } audioRef.current = null; }
    }, []);

    useEffect(() => cleanupAll, []);

    // ── START ──────────────────────────────────────────────────────
    const start = useCallback(async () => {
        setError(null);
        setMessages([]);
        setTranscript('');
        finalTranscriptRef.current = '';

        // 1. Start session
        let session;
        try {
            session = await apiPost('/api/demo/start-session');
            if (!session.success) { setError(session.message || 'Failed to start'); return; }
            sessionIdRef.current = session.sessionId;
            dgTokenRef.current = session.deepgramToken;
            dgConfigRef.current = session.deepgramConfig || { endpoint: 'v2', model: 'flux-general-en' };
            setLanguage(session.language || 'en');
            setRemainingSeconds(session.expiresIn || 300);
            if (session.welcomeMessage) {
                setMessages([{ role: 'assistant', content: session.welcomeMessage }]);
            }
        } catch (e) { setError('Failed to connect to server'); return; }

        // 2. Get mic
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 16000 },
            });
            streamRef.current = stream;
        } catch { setError('Microphone access denied'); return; }

        // 3. Connect Deepgram
        try {
            await connectDg(dgConfigRef.current, dgTokenRef.current);
        } catch (e) { setError(e.message); stream.getTracks().forEach((t) => t.stop()); return; }

        // 4. Start audio pipeline
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        sourceRef.current = source;
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        source.connect(processor);
        processor.connect(audioCtx.destination);

        processor.onaudioprocess = (e) => {
            if (isMutedRef.current) return;
            if (dgSocketRef.current?.readyState === WebSocket.OPEN) {
                const f32 = e.inputBuffer.getChannelData(0);
                const i16 = new Int16Array(f32.length);
                for (let i = 0; i < f32.length; i++) {
                    i16[i] = Math.max(-32768, Math.min(32767, Math.floor(f32[i] * 32768)));
                }
                dgSocketRef.current.send(i16.buffer);
            }
        };

        setActive(true);

        // 5. Play welcome audio
        if (session.welcomeAudioBase64) {
            isMutedRef.current = true;
            stateRef.current = 'speaking';
            setSpeaking(true);
            await playAudio(session.welcomeAudioBase64, session.audioFormat || 'wav');
            setSpeaking(false);
            isMutedRef.current = false;
        }

        stateRef.current = 'listening';
        setListening(true);
        startSilenceDetection();
    }, [connectDg, startSilenceDetection]);

    // ── STOP ───────────────────────────────────────────────────────
    const stop = useCallback(() => {
        cleanupAll();
        stateRef.current = 'idle';
        setListening(false);
        setProcessing(false);
        setSpeaking(false);
        setActive(false);
    }, [cleanupAll]);

    return {
        // State
        listening,
        processing,
        speaking,
        active,
        transcript,
        messages,
        error,
        language,
        remainingSeconds,

        // Actions
        start,
        stop,
    };
}

export default useVoiceAgent;
