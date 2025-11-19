import express from 'express';
import callController from '../controllers/call.controller.js';

const router = express.Router();

/**
 * Call Routes
 */

// Initiate outbound call
router.post('/initiate', callController.initiateCall.bind(callController));

// Test Exotel authentication (no call initiation)
router.post('/test-auth', callController.testAuth.bind(callController));

// Get available Exotel phone numbers
router.get('/phone-numbers', callController.getPhoneNumbers.bind(callController));

// Webhook for incoming calls
router.post('/webhook/incoming', callController.handleIncomingCall.bind(callController));

// Webhook for call flow (conversation)
router.post('/webhook/flow/:callId', callController.handleCallFlow.bind(callController));

// Webhook for call status updates
router.post('/webhook/status/:callId', callController.handleCallStatus.bind(callController));

// Get call details
router.get('/:callId', callController.getCall.bind(callController));

// Get call history
router.get('/history', callController.getCallHistory.bind(callController));

// Hangup call
router.post('/:callId/hangup', callController.hangupCall.bind(callController));

export default router;
