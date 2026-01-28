/**
 * Asterisk/Telephony Routes
 *
 * Health check and configuration endpoints for Asterisk integration
 */

import express from "express";
import audioSocketServer from "../services/asteriskBridge.service.js";

const router = express.Router();

/**
 * GET /api/asterisk/health
 *
 * Health check for AudioSocket service
 */
router.get("/health", (req, res) => {
  const activeCallCount = audioSocketServer.getActiveCallCount();

  res.json({
    success: true,
    service: "AudioSocket",
    status: "running",
    port: process.env.AUDIOSOCKET_PORT || 9092,
    activeCalls: activeCallCount,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/asterisk/config
 *
 * Returns sample Asterisk dialplan configuration
 * Use this to configure your VPS Asterisk
 */
router.get("/config", (req, res) => {
  const backendHost = req.query.host || req.hostname || "YOUR_BACKEND_IP";
  const port = process.env.AUDIOSOCKET_PORT || 9092;

  const dialplan = `
; ==============================================
; Asterisk Dialplan for AI Voice Agent
; Add this to /etc/asterisk/extensions.conf
; ==============================================

[ai-agent]
; Route incoming calls to AI Voice Agent via AudioSocket
exten => _X.,1,Answer()
 same => n,Wait(0.5)
 same => n,Set(AUDIOSOCKET_TIMEOUT=120)
 same => n,AudioSocket(${backendHost}:${port},\${UNIQUEID})
 same => n,Hangup()

; Alternative: Use specific DID numbers
exten => _79354590XX,1,Goto(ai-agent,s,1)

[from-sip-trunk]
; Route calls from your SIP trunk to AI agent
include => ai-agent

; ==============================================
; SIP Trunk Configuration (sip.conf or pjsip.conf)
; Your SIP IP: 163.223.186.112
; ==============================================
  `.trim();

  res.type("text/plain").send(dialplan);
});

/**
 * GET /api/asterisk/stats
 *
 * Get current call statistics
 */
router.get("/stats", (req, res) => {
  res.json({
    success: true,
    activeCalls: audioSocketServer.getActiveCallCount(),
    uptimeSeconds: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/asterisk/register-call
 *
 * Called by Asterisk BEFORE AudioSocket connects
 * Registers UUID → DID mapping so the call can be routed correctly
 */
router.get("/register-call", (req, res) => {
  const { uuid, did } = req.query;

  if (!uuid || !did) {
    return res.status(400).json({
      success: false,
      error: "Missing uuid or did parameter",
    });
  }

  // Register the mapping in audioSocketServer
  audioSocketServer.registerPendingCall(uuid, did);

  console.log(`📋 Registered pending call: ${uuid} → DID ${did}`);

  res.json({
    success: true,
    uuid,
    did,
  });
});

export default router;
