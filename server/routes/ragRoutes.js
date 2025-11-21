import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { queryKnowledgeBase, ragChat } from '../controllers/ragController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Query knowledge base
router.post('/query', queryKnowledgeBase);

// RAG chat
router.post('/chat', ragChat);

export default router;
