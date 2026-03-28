/**
 * Twilio Webhook Routes
 *
 * PUBLIC routes called by Twilio (no auth middleware).
 * Mount in app.js BEFORE auth middleware, same as freeswitchRoutes.
 *
 * Endpoints:
 *   POST /api/twilio/voice         — TwiML webhook: inbound or outbound-answered call
 *   POST /api/twilio/status        — Status callback: update call record on completion
 *   GET  /api/twilio/health        — Health check
 */
import express from "express";
import twilioBridgeServer from "../services/twilioBridge.service.js";
import Agent from "../models/Agent.js";
import Call from "../models/Call.js";

const router = express.Router();

/**
 * Derive the public base URL for webhook/WebSocket URLs.
 * Priority: TWILIO_WEBHOOK_BASE_URL env var → req.headers.host (https assumed).
 */
function getBaseUrl(req) {
  if (process.env.TWILIO_WEBHOOK_BASE_URL) {
    return process.env.TWILIO_WEBHOOK_BASE_URL.replace(/\/+$/, "");
  }
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${req.headers.host}`;
}

/**
 * POST /api/twilio/voice
 *
 * Called by Twilio when a call connects (inbound or outbound-answered).
 *
 * Query params (optional):
 *   agentId         — Agent ID to use (required for outbound; optional for inbound)
 *   conversationType — e.g. "twilio outbound" / "twilio inbound"
 *
 * Twilio POST body includes: CallSid, From, To, Direction, CallStatus
 */
router.post("/voice", async (req, res) => {
  try {
    const { CallSid, From, To, Direction } = req.body;
    let { agentId, conversationType } = req.query;

    if (!CallSid) {
      return res
        .status(400)
        .type("text/xml")
        .send(`<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="rejected"/></Response>`);
    }

    // Resolve agent: query param → lookup by Twilio phone number
    if (!agentId) {
      const agent = await Agent.findOne({ "callConfig.twilioPhoneNumber": To }).lean();
      if (!agent) {
        console.error(`[Twilio] No agent found for number: ${To}`);
        return res
          .type("text/xml")
          .send(
            `<?xml version="1.0" encoding="UTF-8"?><Response><Say>This number is not configured. Goodbye.</Say><Hangup/></Response>`
          );
      }
      agentId = agent._id.toString();
    }

    if (!conversationType) {
      conversationType = Direction === "outbound-api" ? "twilio outbound" : "twilio inbound";
    }

    // Register so the WebSocket handler can find the right agent
    twilioBridgeServer.registerPendingCall(CallSid, agentId, {
      callerNumber: From,
      calledNumber: To,
      conversationType,
    });

    const baseUrl = getBaseUrl(req);
    const wsUrl = baseUrl.replace(/^https?:/, "wss:") + `/ws/twilio/${CallSid}`;

    const statusCallbackUrl = `${baseUrl}/api/twilio/status`;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect action="${statusCallbackUrl}">
    <Stream url="${wsUrl}">
      <Parameter name="callerNumber" value="${From}"/>
      <Parameter name="calledNumber" value="${To}"/>
    </Stream>
  </Connect>
</Response>`;

    console.log(`[Twilio] Voice webhook: CallSid=${CallSid} Agent=${agentId} Direction=${Direction} wsUrl=${wsUrl}`);
    res.type("text/xml").send(twiml);
  } catch (error) {
    console.error("[Twilio] Voice webhook error:", error.message);
    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
  }
});

/**
 * POST /api/twilio/status
 *
 * Called by Twilio when call status changes (completed, no-answer, busy, failed).
 * Updates the Call record in MongoDB.
 */
router.post("/status", async (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration } = req.body;
    console.log(`[Twilio] Status callback: ${CallSid} → ${CallStatus} (${CallDuration}s)`);

    const statusMap = {
      completed: "completed",
      "no-answer": "no-answer",
      busy: "busy",
      failed: "failed",
      canceled: "failed",
    };

    await Call.findOneAndUpdate(
      { callId: CallSid },
      {
        status: statusMap[CallStatus] || CallStatus,
        duration: parseInt(CallDuration || "0", 10),
        endedAt: new Date(),
      }
    );

    res.sendStatus(200);
  } catch (error) {
    console.error("[Twilio] Status callback error:", error.message);
    res.sendStatus(500);
  }
});

/**
 * GET /api/twilio/health
 */
router.get("/health", (req, res) => {
  const activeCalls = twilioBridgeServer.getActiveCalls();
  res.json({
    success: true,
    service: "TwilioMediaStream",
    status: "running",
    activeCalls: activeCalls.length,
    timestamp: new Date().toISOString(),
  });
});

export default router;
