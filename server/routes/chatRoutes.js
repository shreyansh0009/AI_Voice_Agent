import express from "express";
import { processChat, agentChat } from "../controllers/chatController.js";
// Use original streamChatController for /stream (matches VoiceChat's request format)
// V5 controller (with conversationId) is available at /api/chat/v5/stream
import { streamChat } from "../controllers/streamChatController.js";
import { quickChat } from "../controllers/streamChatController.js";
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
 * POST /api/chat/agent-chat
 * Chat with a specific agent — uses the SAME LLM pipeline as phone calls
 */
router.post("/agent-chat", authenticate, agentChat);

/**
 * POST /api/chat/stream
 * Streaming chat response for fluent TTS output
 * Uses aiAgentService for AI response generation
 */
router.post("/stream", authenticate, streamChat);

/**
 * POST /api/chat/quick
 * Quick response with caching for common queries
 * Optimized for minimal latency
 */
router.post("/quick", authenticate, quickChat);

export default router;
