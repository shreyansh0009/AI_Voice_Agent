import express from "express";
import { chatWithAgentforce } from "../controllers/agentforceController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Protected route for chatting with Agentforce
router.post("/chat", authenticate, chatWithAgentforce);

export default router;
