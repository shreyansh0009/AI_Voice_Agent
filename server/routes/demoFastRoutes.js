import express from 'express';
import { startFastSession, demoFastChat, demoFastChatStream } from '../controllers/demoFastController.js';

const router = express.Router();

router.post('/start-session', startFastSession);
router.post('/chat', demoFastChat);
router.post('/chat/stream', demoFastChatStream);

export default router;

