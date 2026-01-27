import express from "express";

import knowledgeRoutes from "./knowledgeRoutes.js";
import ragRoutes from "./ragRoutes.js";
import agentRoutes from "./agentRoutes.js";

import authRoutes from "./authRoutes.js";
import mongoose from "mongoose";
import { connectDB } from "../config/database.js";
import { authenticate } from "../middleware/authMiddleware.js";
import agentforceRoutes from "./agentforceRoutes.js";
import speechRoutes from "./speechRoutes.js";
import chatRoutes from "./chatRoutes.js";
import asteriskRoutes from "./asteriskRoutes.js";
import phoneNumberRoutes from "./phoneNumberRoutes.js";

const router = express.Router();

// Home route (login info)
router.get("/", (req, res) => {
  res.json({ message: "Welcome! Please log in at /api/auth/login." });
});

// Health check
router.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// Database health check
router.get("/health/db", async (req, res) => {
  try {
    await connectDB();
    const dbStatus = mongoose.connection.readyState;
    const statusMap = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };
    res.json({
      success: dbStatus === 1,
      status: statusMap[dbStatus],
      message: dbStatus === 1 ? "Database connected" : "Database not connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: "error",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Mount route modules
router.use("/knowledge", knowledgeRoutes);
router.use("/rag", ragRoutes);
router.use("/agent", agentRoutes);

router.use("/agentforce", agentforceRoutes);
router.use("/speech", speechRoutes);
router.use("/chat", chatRoutes);
router.use("/asterisk", asteriskRoutes);

// Protect all routes below (except /auth and health checks)
router.use("/rag", authenticate, ragRoutes);
router.use("/agents", authenticate, agentRoutes);
router.use("/phone-numbers", authenticate, phoneNumberRoutes);

router.use("/", authenticate, knowledgeRoutes);
router.use("/auth", authRoutes);

export default router;
