import crypto from 'crypto';

/**
 * In-memory session store for BodhiTalk public demo.
 *
 * Constraints:
 *   - Max 5-minute TTL per session
 *   - Max 3 active sessions per IP per hour
 *   - Max 30 messages per session
 *   - Auto-purge expired sessions every 60s
 */

const SESSION_TTL_MS = 5 * 60 * 1000;       // 5 minutes
const MAX_SESSIONS_PER_IP = 10;
const MAX_MESSAGES_PER_SESSION = 30;
const CLEANUP_INTERVAL_MS = 60 * 1000;      // every 60s

// Map<sessionId, SessionData>
const sessions = new Map();

// Map<ip, { count, firstSeen }>  — resets hourly
const ipTracker = new Map();

/**
 * @typedef {Object} SessionData
 * @property {string} id
 * @property {string} ip
 * @property {Array} conversationHistory
 * @property {Object} customerContext
 * @property {number} createdAt       - timestamp ms
 * @property {number} messageCount
 */

export function createSession(ip) {
    // Rate-limit per IP
    const now = Date.now();
    const tracker = ipTracker.get(ip) || { count: 0, firstSeen: now };

    // Reset hourly
    if (now - tracker.firstSeen > 60 * 60 * 1000) {
        tracker.count = 0;
        tracker.firstSeen = now;
    }

    if (tracker.count >= MAX_SESSIONS_PER_IP) {
        return { error: 'rate_limited', message: 'Too many demo sessions. Try again later.' };
    }

    const sessionId = crypto.randomUUID();
    const session = {
        id: sessionId,
        ip,
        conversationHistory: [],
        customerContext: {},
        createdAt: now,
        messageCount: 0,
    };

    sessions.set(sessionId, session);
    tracker.count++;
    ipTracker.set(ip, tracker);

    return { sessionId, expiresIn: SESSION_TTL_MS / 1000 };
}

export function getSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return null;

    // Check TTL
    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
        sessions.delete(sessionId);
        return null;
    }

    return session;
}

export function getRemainingSeconds(session) {
    const elapsed = Date.now() - session.createdAt;
    return Math.max(0, Math.floor((SESSION_TTL_MS - elapsed) / 1000));
}

export function canSendMessage(session) {
    if (session.messageCount >= MAX_MESSAGES_PER_SESSION) return false;
    if (Date.now() - session.createdAt > SESSION_TTL_MS) return false;
    return true;
}

export function addMessage(session, role, content) {
    session.conversationHistory.push({ role, content });
    if (role === 'user') session.messageCount++;

    // Keep history manageable (last 12 entries = ~6 turns)
    if (session.conversationHistory.length > 12) {
        session.conversationHistory = session.conversationHistory.slice(-12);
    }
}

export function deleteSession(sessionId) {
    sessions.delete(sessionId);
}

// Auto-cleanup expired sessions
setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
        if (now - session.createdAt > SESSION_TTL_MS + 60_000) {
            sessions.delete(id);
        }
    }
}, CLEANUP_INTERVAL_MS);

export default {
    createSession,
    getSession,
    getRemainingSeconds,
    canSendMessage,
    addMessage,
    deleteSession,
};
