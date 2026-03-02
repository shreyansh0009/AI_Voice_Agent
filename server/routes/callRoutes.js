import express from "express";
import Call from "../models/Call.js";
import Agent from "../models/Agent.js";
import PhoneNumber from "../models/PhoneNumber.js";
import User from "../models/User.js";
import asteriskAMI from "../services/asteriskAMI.service.js";
import audioSocketServer from "../services/asteriskBridge.service.js";
// Authentication is handled at router level in routes/index.js

const router = express.Router();

/**
 * POST /api/call/outbound
 *
 * Originate an outbound call from the agent to the user's phone.
 * Body: { agentId, phoneNumber } (10-digit Indian mobile number)
 */
router.post("/outbound", async (req, res) => {
    try {
        const userId = req.user.id;
        const { agentId, phoneNumber } = req.body;

        // ── Validate input ──────────────────────────────────────────
        if (!agentId || !phoneNumber) {
            return res.status(400).json({
                success: false,
                error: "agentId and phoneNumber are required",
            });
        }

        // Validate Indian mobile number (10 digits, starts with 6-9)
        const cleanedPhone = phoneNumber.toString().replace(/\D/g, "");
        if (!/^[6-9]\d{9}$/.test(cleanedPhone)) {
            return res.status(400).json({
                success: false,
                error: "Invalid phone number. Enter a 10-digit Indian mobile number.",
            });
        }

        // ── Verify agent belongs to user ────────────────────────────
        const agent = await Agent.findOne({ _id: agentId, userId });
        if (!agent) {
            return res.status(404).json({
                success: false,
                error: "Agent not found",
            });
        }

        // ── Find DID linked to this agent ───────────────────────────
        const phoneRecord = await PhoneNumber.findOne({
            linkedAgentId: agentId,
            status: "linked",
        });

        if (!phoneRecord) {
            return res.status(400).json({
                success: false,
                error: "No phone number linked to this agent. Purchase and link a number first.",
                code: "NO_DID",
            });
        }

        // Extract the DID digits (remove country code prefix if stored with it)
        // PhoneNumber.number is stored cleaned (e.g. "917935459094" or "7935459094")
        let didDigits = phoneRecord.number;
        if (didDigits.startsWith("91") && didDigits.length > 10) {
            didDigits = didDigits.slice(2); // Remove 91 prefix → "7935459094"
        }

        // ── Check wallet balance ────────────────────────────────────
        const user = await User.findById(userId);
        if (!user || (user.walletBalance || 0) <= 0) {
            return res.status(402).json({
                success: false,
                error: "Insufficient wallet balance. Please add funds.",
                code: "INSUFFICIENT_BALANCE",
            });
        }

        // ── Originate the call via Asterisk AMI ─────────────────────
        const { uuid } = await asteriskAMI.originate(didDigits, cleanedPhone);

        // Register pending call so AudioSocket routes it to the correct agent
        audioSocketServer.registerPendingCall(uuid, phoneRecord.number);

        // ── Create initial call record ──────────────────────────────
        await Call.create({
            callId: uuid,
            executionId: uuid.substring(0, 8),
            agentId: agent._id,
            userId: userId,
            calledNumber: phoneRecord.number,
            callerNumber: cleanedPhone,
            userNumber: cleanedPhone,
            status: "initiated",
            startedAt: new Date(),
            hangupBy: "system",
            conversationType: "asterisk outbound",
            provider: "Asterisk",
        });

        console.log(`📞 Outbound call initiated: ${uuid} → +91${cleanedPhone} (Agent: ${agent.name})`);

        res.json({
            success: true,
            callId: uuid,
            message: "Call initiated! You will receive a call shortly.",
        });
    } catch (error) {
        console.error("Error initiating outbound call:", error);
        res.status(500).json({
            success: false,
            error: error.message || "Failed to initiate call",
        });
    }
});

/**
 * GET /api/call/history
 * 
 * Get call history with filters
 * Query params: agentId, startDate, endDate, status, limit, skip
 */
router.get("/history", async (req, res) => {
    // Prevent browser/proxy caching so new calls always appear
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    try {
        const { agentId, startDate, endDate, status, callType, provider, limit, skip } = req.query;
        const userId = req.user.id; // Get authenticated user ID

        const filters = {
            userId: userId, // CRITICAL: Filter by user for data isolation
            agentId: agentId || undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            status: status || undefined,
            limit: limit || 100,
            skip: skip || 0,
        };

        // Get calls
        const calls = await Call.findWithFilters(filters);

        // Get stats for the same filters
        const stats = await Call.getStats({
            userId: userId, // CRITICAL: Filter by user for data isolation
            agentId: agentId || undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
        });

        // Format calls for frontend
        const formattedCalls = calls.map((call) => ({
            _id: call._id,
            executionId: call.executionId || call.callId,
            callId: call.callId,
            userNumber: call.userNumber || call.callerNumber,
            callerNumber: call.callerNumber,
            calledNumber: call.calledNumber,
            conversationType: call.conversationType || "asterisk inbound",
            duration: call.duration || 0,
            hangupBy: call.hangupBy || "system",
            batch: call.batch || "-",
            timestamp: call.startedAt,
            createdAt: call.createdAt,
            cost: call.cost || 0,
            status: call.status || "completed",
            transcript: call.transcript || [],
            transcriptCount: call.transcriptCount || call.transcript?.length || 0,
            provider: call.provider || "Asterisk",
            agentId: call.agentId?._id || call.agentId,
            agentName: call.agentId?.name || "Unknown Agent",
            customerContext: call.customerContext,
            rawData: call.rawData,
            recordingUrl: call.recordingUrl || call.rawData?.telephony_data?.recording_url || null,
        }));

        res.json({
            success: true,
            calls: formattedCalls,
            stats: {
                totalExecutions: stats.totalCalls,
                totalCost: stats.totalCost,
                totalDuration: stats.totalDuration,
                avgCost: stats.avgCost,
                avgDuration: stats.avgDuration,
                statusBreakdown: {
                    completed: stats.completedCalls,
                    noAnswer: stats.noAnswerCalls,
                    failed: stats.failedCalls,
                    busy: stats.busyCalls,
                },
            },
            pagination: {
                limit: parseInt(filters.limit),
                skip: parseInt(filters.skip),
                total: formattedCalls.length,
            },
        });
    } catch (error) {
        console.error("Error fetching call history:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch call history",
            details: error.message,
        });
    }
});

/**
 * GET /api/call/stats
 * 
 * Get aggregated call statistics
 */
router.get("/stats", async (req, res) => {
    try {
        const { agentId, startDate, endDate } = req.query;

        const stats = await Call.getStats({
            agentId: agentId || undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
        });

        res.json({
            success: true,
            stats: {
                totalExecutions: stats.totalCalls,
                totalCost: stats.totalCost,
                totalDuration: stats.totalDuration,
                avgCost: stats.avgCost || 0,
                avgDuration: stats.avgDuration || 0,
                statusBreakdown: {
                    completed: stats.completedCalls,
                    noAnswer: stats.noAnswerCalls,
                    failed: stats.failedCalls,
                    busy: stats.busyCalls,
                },
            },
        });
    } catch (error) {
        console.error("Error fetching call stats:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch call statistics",
        });
    }
});

/**
 * GET /api/call/:id
 * 
 * Get single call by ID (with full transcript)
 */
router.get("/:id", async (req, res) => {
    try {
        const call = await Call.findById(req.params.id)
            .populate("agentId", "name")
            .lean();

        if (!call) {
            return res.status(404).json({
                success: false,
                error: "Call not found",
            });
        }

        res.json({
            success: true,
            call: {
                ...call,
                executionId: call.executionId || call.callId,
                userNumber: call.userNumber || call.callerNumber,
                agentName: call.agentId?.name || "Unknown Agent",
            },
        });
    } catch (error) {
        console.error("Error fetching call:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch call",
        });
    }
});

/**
 * GET /api/call/by-callid/:callId
 * 
 * Get call by Asterisk call ID (UUID)
 */
router.get("/by-callid/:callId", async (req, res) => {
    try {
        const call = await Call.findOne({ callId: req.params.callId })
            .populate("agentId", "name")
            .lean();

        if (!call) {
            return res.status(404).json({
                success: false,
                error: "Call not found",
            });
        }

        res.json({
            success: true,
            call,
        });
    } catch (error) {
        console.error("Error fetching call by callId:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch call",
        });
    }
});

export default router;
