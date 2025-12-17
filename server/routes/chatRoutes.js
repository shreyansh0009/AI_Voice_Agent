import express from "express";
import { processChat } from "../controllers/chatController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * POST /api/chat/message
 * Process a chat message through the AI Agent Service
 * 
 * Request body:
 * - message: string (required) - User's message
 * - agentId: string (optional) - Agent configuration ID
 * - customerContext: object (optional) - Current customer information
 * - conversationHistory: array (optional) - Recent conversation messages
 * - options: object (optional) - Additional options (language, useRAG, systemPrompt, etc.)
 */
router.post("/message", authenticate, processChat);

export default router;
