import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import audioSocketServer from '../services/asteriskBridge.service.js';

const router = express.Router();

// Protect all routes
router.use(authenticate);

/**
 * GET /api/spy/active-calls
 * Returns list of currently active calls for the authenticated user
 */
router.get('/active-calls', (req, res) => {
    try {
        const userId = req.user.id;
        const activeCalls = audioSocketServer.getActiveCalls(userId);
        res.json({ success: true, calls: activeCalls });
    } catch (error) {
        console.error('Error fetching active calls:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch active calls' });
    }
});

export default router;
