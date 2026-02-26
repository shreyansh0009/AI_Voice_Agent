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
import callRoutes from "./callRoutes.js";
import paymentRoutes from "./paymentRoutes.js";
import trialRoutes from "./trialRoutes.js";
import spyRoutes from "./spyRoutes.js";
import demoRoutes from "./demoRoutes.js";
import demoFastRoutes from "./demoFastRoutes.js";
import ExchangeRate from "../models/ExchangeRate.js";

const router = express.Router();

// Home route (login info)
router.get("/", (req, res) => {
  res.json({ message: "Welcome! Please log in at /api/auth/login." });
});

// Exchange rate endpoint (no auth required - public)
router.get("/exchange-rate", async (req, res) => {
  try {
    const doc = await ExchangeRate.findOne({ baseCurrency: "USD" });
    if (!doc) {
      return res.json({
        success: true,
        baseCurrency: "USD",
        rates: { INR: 85 },
        lastUpdated: null,
        isFallback: true,
      });
    }
    res.json({
      success: true,
      baseCurrency: doc.baseCurrency,
      rates: doc.rates,
      lastUpdated: doc.lastUpdated,
      isFallback: false,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
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
router.use("/trial", trialRoutes);
router.use("/call", authenticate, callRoutes);

// Protect all routes below (except /auth and health checks)
router.use("/rag", authenticate, ragRoutes);
router.use("/agents", authenticate, agentRoutes);
router.use("/phone-numbers", authenticate, phoneNumberRoutes);
router.use("/payments", authenticate, paymentRoutes);

// Spy / live-call monitoring routes
router.use("/spy", authenticate, spyRoutes);

// Public demo routes (no auth — rate-limited by IP)
router.use("/demo", demoRoutes);
router.use("/demo-fast", demoFastRoutes);

router.use("/", authenticate, knowledgeRoutes);
router.use("/auth", authRoutes);

export default router;
