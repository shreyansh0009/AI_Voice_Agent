import { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, Timer, Activity } from 'lucide-react';
import api from '../utils/api';

const API_URL = '/api';

/**
 * Self-contained Live Calls panel.
 * All state (polling, timers, WebSocket audio) lives here so that
 * per-second timer updates do NOT re-render the parent CallHistory.
 */
export default function LiveCallsPanel() {
    const [liveCalls, setLiveCalls] = useState([]);
    const [listeningCallId, setListeningCallId] = useState(null);
    const [liveTimers, setLiveTimers] = useState({});

    const spyWsRef = useRef(null);
    const audioCtxRef = useRef(null);
    const nextPlayTimeRef = useRef(0);
    const liveCallsRef = useRef([]);
    const prevCallIdsRef = useRef('');

    // ── Poll active calls every 3 seconds ──────────────────────────────
    useEffect(() => {
        const fetchLiveCalls = async () => {
            try {
                const res = await api.get(`${API_URL}/spy/active-calls`);
                if (res.data?.success) {
                    const newCalls = res.data.calls;
                    const newIdKey = newCalls.map(c => c.callId).sort().join(',');
                    if (newIdKey === prevCallIdsRef.current) return;
                    prevCallIdsRef.current = newIdKey;

                    setLiveCalls(prev => {
                        const newIds = new Set(newCalls.map(c => c.callId));
                        const completed = prev
                            .filter(c => !newIds.has(c.callId) && !c.completed)
                            .map(c => ({ ...c, completed: true, completedAt: Date.now() }));
                        const stillShowing = prev.filter(c => c.completed && Date.now() - c.completedAt < 5000);
                        const result = [
                            ...newCalls.map(nc => ({ ...nc, completed: false })),
                            ...completed,
                            ...stillShowing.filter(s => !completed.find(c => c.callId === s.callId)),
                        ];
                        liveCallsRef.current = result;
                        return result;
                    });
                }
            } catch {
                // Silently fail — live calls is optional
            }
        };
        fetchLiveCalls();
        const interval = setInterval(fetchLiveCalls, 3000);
        return () => clearInterval(interval);
    }, []);

    // ── Live timer — uses ref, no state dependency ─────────────────────
    useEffect(() => {
        const timerInterval = setInterval(() => {
            const calls = liveCallsRef.current;
            if (calls.length === 0) return;
            const now = Date.now();
            setLiveTimers(prev => {
                const timers = {};
                let changed = false;
                calls.forEach(call => {
                    if (!call.completed) {
                        const elapsed = Math.floor((now - call.startTime) / 1000);
                        timers[call.callId] = elapsed;
                        if (prev[call.callId] !== elapsed) changed = true;
                    }
                });
                return changed ? timers : prev;
            });
        }, 1000);
        return () => clearInterval(timerInterval);
    }, []);

    const formatElapsed = (seconds) => {
        if (!seconds && seconds !== 0) return '00:00';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    // ── WebSocket spy: start listening ─────────────────────────────────
    const startListening = useCallback((callId) => {
        if (spyWsRef.current) { spyWsRef.current.close(); spyWsRef.current = null; }
        if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }

        const token = localStorage.getItem('token');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws/spy?token=${token}&callId=${callId}`;

        const ws = new WebSocket(wsUrl);
        spyWsRef.current = ws;
        setListeningCallId(callId);

        // Use browser's native sample rate (usually 44100 or 48000).
        // Requesting 8000 is silently ignored by most browsers, causing distortion.
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = ctx;
        nextPlayTimeRef.current = ctx.currentTime;

        const INCOMING_RATE = 8000; // Server sends slin16 at 8kHz
        const nativeRate = ctx.sampleRate; // Browser's actual rate (e.g. 48000)

        ws.binaryType = 'arraybuffer';

        ws.onmessage = (event) => {
            if (typeof event.data === 'string') return;
            if (ctx.state === 'closed') return;

            const data = new Uint8Array(event.data);
            if (data.length < 2) return;

            // Strip 1-byte source marker, convert slin16 → float32
            const pcmData = data.slice(1);
            const int16 = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 2);

            // Resample from 8kHz to the AudioContext's native rate
            const ratio = nativeRate / INCOMING_RATE;
            const resampledLen = Math.round(int16.length * ratio);
            const float32 = new Float32Array(resampledLen);
            for (let i = 0; i < resampledLen; i++) {
                const srcIdx = i / ratio;
                const lo = Math.floor(srcIdx);
                const hi = Math.min(lo + 1, int16.length - 1);
                const frac = srcIdx - lo;
                // Linear interpolation + normalise to [-1, 1]
                float32[i] = ((int16[lo] * (1 - frac)) + (int16[hi] * frac)) / 32768;
            }

            const audioBuffer = ctx.createBuffer(1, resampledLen, nativeRate);
            audioBuffer.getChannelData(0).set(float32);
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);

            const now = ctx.currentTime;
            // If playback head has drifted >200ms ahead, skip to now (fixes latency buildup)
            if (nextPlayTimeRef.current < now || nextPlayTimeRef.current - now > 0.2) {
                nextPlayTimeRef.current = now;
            }
            source.start(nextPlayTimeRef.current);
            nextPlayTimeRef.current += audioBuffer.duration;
        };

        ws.onclose = () => {
            // Close AudioContext immediately to stop any queued/scheduled audio
            if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
                audioCtxRef.current.close().catch(() => { });
                audioCtxRef.current = null;
            }
            setListeningCallId(null);
        };
        ws.onerror = () => {
            if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
                audioCtxRef.current.close().catch(() => { });
                audioCtxRef.current = null;
            }
            setListeningCallId(null);
        };
    }, []);

    const stopListening = useCallback(() => {
        if (spyWsRef.current) { spyWsRef.current.close(); spyWsRef.current = null; }
        if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
        setListeningCallId(null);
    }, []);

    useEffect(() => {
        return () => {
            if (spyWsRef.current) spyWsRef.current.close();
            if (audioCtxRef.current) audioCtxRef.current.close();
        };
    }, []);

    // ── Nothing to show ────────────────────────────────────────────────
    if (liveCalls.length === 0) return null;

    // ── Render ─────────────────────────────────────────────────────────
    return (
        <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                <h3 className="text-lg font-bold bg-gradient-to-r from-red-600 to-rose-600 bg-clip-text text-transparent">
                    Live Calls ({liveCalls.filter(c => !c.completed).length})
                </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {liveCalls.map((call) => (
                    <div
                        key={call.callId}
                        className={`relative overflow-hidden rounded-xl border-2 p-4 transition-all duration-500 ${call.completed
                            ? 'border-gray-200 bg-gray-50 opacity-60'
                            : listeningCallId === call.callId
                                ? 'border-green-400 bg-green-50/50 shadow-lg shadow-green-100'
                                : 'border-indigo-200 bg-white hover:border-indigo-400 hover:shadow-lg'
                            }`}
                    >
                        {!call.completed && (
                            <div className="absolute top-3 right-3 flex items-center gap-1.5">
                                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                <span className="text-xs font-semibold text-red-500">LIVE</span>
                            </div>
                        )}
                        {call.completed && (
                            <div className="absolute top-3 right-3">
                                <span className="text-xs font-semibold text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">COMPLETED</span>
                            </div>
                        )}

                        <div className="text-sm font-bold text-gray-800 mb-2">{call.agentName}</div>

                        <div className="space-y-1 mb-3">
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <Phone className="w-3 h-3" />
                                <span>Caller: <span className="font-medium text-gray-700">{call.callerNumber}</span></span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <Phone className="w-3 h-3 rotate-180" />
                                <span>DID: <span className="font-medium text-gray-700">{call.calledNumber}</span></span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <Timer className="w-4 h-4 text-indigo-500" />
                                <span className={`text-lg font-mono font-bold ${call.completed ? 'text-gray-400' : 'text-indigo-600'
                                    }`}>
                                    {call.completed ? 'Ended' : formatElapsed(liveTimers[call.callId])}
                                </span>
                            </div>

                            {!call.completed && (
                                listeningCallId === call.callId ? (
                                    <button
                                        onClick={stopListening}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
                                    >
                                        <Activity className="w-3.5 h-3.5" />
                                        Stop
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => startListening(call.callId)}
                                        disabled={listeningCallId !== null}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Activity className="w-3.5 h-3.5" />
                                        Listen
                                    </button>
                                )
                            )}
                        </div>

                        {listeningCallId === call.callId && !call.completed && (
                            <div className="mt-2 flex items-center gap-2">
                                <div className="flex gap-0.5">
                                    {[1, 2, 3, 4, 5].map(i => (
                                        <div
                                            key={i}
                                            className="w-1 bg-green-500 rounded-full"
                                            style={{
                                                height: `${8 + Math.random() * 12}px`,
                                                animation: `pulse ${0.5 + i * 0.1}s ease-in-out infinite alternate`,
                                            }}
                                        />
                                    ))}
                                </div>
                                <span className="text-xs font-medium text-green-600">Listening...</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
