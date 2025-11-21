import express from 'express';
import callController from '../controllers/call.controller.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public webhook endpoints (no auth required)
router.post('/webhook/incoming', callController.handleIncomingCall);
router.post('/webhook/flow/:callId', callController.handleCallFlow);
router.post('/webhook/status/:callId', callController.handleCallStatus);

// Protected endpoints (require authentication)
router.post('/initiate', authenticate, callController.initiateCall);
router.post('/test-auth', authenticate, callController.testAuth);
router.get('/phone-numbers', authenticate, callController.getPhoneNumbers);
router.get('/history', authenticate, callController.getCallHistory);
router.get('/:callId', authenticate, callController.getCall);
router.post('/:callId/hangup', authenticate, callController.hangupCall);

export default router;
