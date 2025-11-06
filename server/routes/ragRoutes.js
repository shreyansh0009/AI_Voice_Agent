import express from 'express';
import { queryKnowledgeBase, ragChat } from '../controllers/ragController.js';

const router = express.Router();

// Query knowledge base
router.post('/query', queryKnowledgeBase);

// RAG chat
router.post('/chat', ragChat);

export default router;
