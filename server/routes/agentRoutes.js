import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { getAgentStats, getAllAgents } from '../controllers/agentController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all agents
router.get('/', getAllAgents);

// Get agent statistics
router.get('/:agentId/stats', getAgentStats);

export default router;
