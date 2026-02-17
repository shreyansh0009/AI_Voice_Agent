import express from "express";
import {
  createAgent,
  getAgents,
  getAgentById,
  updateAgent,
  deleteAgent,
  generateAgentConfig,
  linkKnowledgeFiles,
  unlinkKnowledgeFile,
} from "../controllers/agentController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(authenticate);

router.post("/generate", generateAgentConfig);
router.post("/", createAgent);
router.get("/", getAgents);
router.get("/:id", getAgentById);
router.put("/:id", updateAgent);
router.delete("/:id", deleteAgent);

// Knowledge base linking
router.put("/:id/knowledge", linkKnowledgeFiles);
router.delete("/:id/knowledge/:fileId", unlinkKnowledgeFile);

export default router;
