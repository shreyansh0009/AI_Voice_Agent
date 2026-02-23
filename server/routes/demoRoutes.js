import express from 'express';
import { startSession, demoChat } from '../controllers/demoController.js';

const router = express.Router();

/**
 * POST /api/demo/start-session
 * Public — no auth required. IP rate-limited (3 sessions/hour).
 * Returns sessionId, scoped Deepgram key, welcome message + audio.
 */
router.post('/start-session', startSession);

/**
 * POST /api/demo/chat
 * Public — no auth required. Session-validated, 5-min TTL.
 * Returns AI response text + ElevenLabs TTS audio (base64 MP3).
 */
router.post('/chat', demoChat);

export default router;
