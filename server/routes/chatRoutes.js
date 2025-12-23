import express from "express";
import { processChat } from "../controllers/chatController.js";
import { streamChat, quickChat } from "../controllers/streamChatController.js";
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

/**
 * POST /api/chat/stream
 * Stream chat response via Server-Sent Events for lower latency
 * Sends sentences as soon as they're complete
 */
router.post("/stream", authenticate, streamChat);

/**
 * POST /api/chat/quick
 * Quick response with caching for common queries
 * Optimized for minimal latency
 */
router.post("/quick", authenticate, quickChat);

export default router;
