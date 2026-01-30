/**
 * Call Routes
 * 
 * API endpoints for call history and analytics
 */

import express from "express";
import Call from "../models/Call.js";
// Authentication is handled at router level in routes/index.js

const router = express.Router();

/**
 * GET /api/call/history
 * 
 * Get call history with filters
 * Query params: agentId, startDate, endDate, status, limit, skip
 */
router.get("/history", async (req, res) => {
    try {
        const { agentId, startDate, endDate, status, callType, provider, limit, skip } = req.query;

        const filters = {
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
