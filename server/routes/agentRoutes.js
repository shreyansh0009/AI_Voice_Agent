import express from 'express';
import { getAgentStats, getAllAgents } from '../controllers/agentController.js';

const router = express.Router();

// Get all agents
router.get('/', getAllAgents);

// Get agent statistics
router.get('/:agentId/stats', getAgentStats);

export default router;
