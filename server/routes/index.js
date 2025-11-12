import express from 'express';
import knowledgeRoutes from './knowledgeRoutes.js';
import ragRoutes from './ragRoutes.js';
import agentRoutes from './agentRoutes.js';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';

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

// Database health check
router.get('/health/db', async (req, res) => {
  try {
    await connectDB();
    const dbStatus = mongoose.connection.readyState;
    const statusMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    res.json({
      success: dbStatus === 1,
      status: statusMap[dbStatus],
      message: dbStatus === 1 ? 'Database connected' : 'Database not connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Mount routes
router.use('/', knowledgeRoutes);
router.use('/rag', ragRoutes);
router.use('/agents', agentRoutes);

export default router;
