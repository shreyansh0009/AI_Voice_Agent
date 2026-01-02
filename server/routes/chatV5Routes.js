import express from "express";
import {
  streamChatV5,
  chatV5,
  getConversation,
  resetConversation,
} from "../controllers/chatV5Controller.js";

const router = express.Router();

/**
 * V5 Chat Routes
 *
 * State-driven architecture with:
 * - Persistent conversation state
 * - Backend-controlled flow
 * - Text normalization
 * - No LLM in flow control
 */

// Streaming chat (recommended for voice)
router.post("/stream", streamChatV5);

// Non-streaming chat
router.post("/", chatV5);

// Get conversation state
router.get("/:conversationId", getConversation);

// Reset conversation
router.delete("/:conversationId", resetConversation);

export default router;
