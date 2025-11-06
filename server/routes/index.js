import express from 'express';
import knowledgeRoutes from './knowledgeRoutes.js';
import ragRoutes from './ragRoutes.js';
import agentRoutes from './agentRoutes.js';

const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ 
    success: true,
    status: 'ok', 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

// Mount routes
router.use('/', knowledgeRoutes);
router.use('/rag', ragRoutes);
router.use('/agents', agentRoutes);

export default router;
