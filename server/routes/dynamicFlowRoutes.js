import express from "express";
import { streamDynamicChat } from "../controllers/dynamicFlowController.js";

const router = express.Router();

/**
 * Dynamic Flow Routes
 *
 * Flow is generated from agent's prompt (no static JSON)
 * Backend controls 100% - LLM is only for voice
 */

// Stream chat with dynamic flow
router.post("/stream", streamDynamicChat);

export default router;
