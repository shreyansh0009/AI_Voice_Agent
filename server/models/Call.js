import mongoose from "mongoose";

/**
 * Call Model
 * 
 * Stores telephony call records from Asterisk/SIP integration.
 * Used by Call History dashboard to display call analytics.
 * 
 * Cost calculation: ₹0.05 per minute (configurable via COST_PER_MINUTE)
 */

const COST_PER_MINUTE = 0.05; // INR per minute

const callSchema = new mongoose.Schema(
    {
        // ============================================
        // CALL IDENTIFIERS
        // ============================================
        callId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        // External execution ID (for display in UI)
        executionId: {
            type: String,
            index: true,
        },

        // ============================================
        // REFERENCES
        // ============================================
        agentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Agent",
            index: true,
        },

        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            index: true,
        },

        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Conversation",
        },

        // ============================================
        // PHONE NUMBERS
        // ============================================
        callerNumber: {
            type: String,
            index: true,
        },

        calledNumber: {
            type: String,
            index: true,
        },

        // Formatted for display
        userNumber: String,

        // ============================================
        // TIMING
        // ============================================
        startedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },

        endedAt: Date,

        // Duration in seconds
        duration: {
            type: Number,
            default: 0,
        },

        // ============================================
        // STATUS
        // ============================================
        status: {
            type: String,
            enum: ["initiated", "ringing", "answered", "completed", "failed", "no-answer", "busy"],
            default: "initiated",
            index: true,
        },

        hangupBy: {
            type: String,
            enum: ["user", "agent", "system", "Asterisk"],
            default: "system",
        },

        // ============================================
        // TRANSCRIPTION
        // ============================================
        transcript: [
            {
                role: {
                    type: String,
                    enum: ["user", "assistant"],
                },
                content: String,
                timestamp: Date,
            },
        ],

        transcriptCount: {
            type: Number,
            default: 0,
        },

        // ============================================
        // COST (₹0.05 per minute)
        // ============================================
        cost: {
            type: Number,
            default: 0,
        },

        costCurrency: {
            type: String,
            default: "INR",
        },

        // ============================================
        // METADATA
        // ============================================
        conversationType: {
            type: String,
            default: "asterisk inbound",
        },

        provider: {
            type: String,
            default: "Asterisk",
        },

        batch: String,

        // Raw call data for debugging
        rawData: mongoose.Schema.Types.Mixed,

        // Customer context collected during call
        customerContext: mongoose.Schema.Types.Mixed,
    },
    { timestamps: true }
);

// ============================================
// INDEXES
// ============================================
callSchema.index({ agentId: 1, startedAt: -1 });
callSchema.index({ status: 1, startedAt: -1 });
callSchema.index({ callerNumber: 1, startedAt: -1 });

// ============================================
// STATIC METHODS
// ============================================

/**
 * Calculate cost based on duration
 * Rate: ₹0.05 per minute
 */
callSchema.statics.calculateCost = function (durationSeconds) {
    const minutes = Math.ceil(durationSeconds / 60);
    return parseFloat((minutes * COST_PER_MINUTE).toFixed(3));
};

/**
 * Find calls with filters
 */
callSchema.statics.findWithFilters = async function (filters = {}) {
    const query = {};

    if (filters.agentId) {
        query.agentId = filters.agentId;
    }

    if (filters.status && filters.status !== "all") {
        query.status = filters.status;
    }

    if (filters.startDate || filters.endDate) {
        query.startedAt = {};
        if (filters.startDate) {
            query.startedAt.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
            const endDate = new Date(filters.endDate);
            endDate.setHours(23, 59, 59, 999);
            query.startedAt.$lte = endDate;
        }
    }

    if (filters.callerNumber) {
        query.callerNumber = { $regex: filters.callerNumber, $options: "i" };
    }

    const limit = parseInt(filters.limit) || 100;
    const skip = parseInt(filters.skip) || 0;

    return this.find(query)
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("agentId", "name")
        .lean();
};

/**
 * Get aggregated statistics
 */
callSchema.statics.getStats = async function (filters = {}) {
    const matchStage = {};

    if (filters.agentId) {
        matchStage.agentId = new mongoose.Types.ObjectId(filters.agentId);
    }

    if (filters.startDate || filters.endDate) {
        matchStage.startedAt = {};
        if (filters.startDate) {
            matchStage.startedAt.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
            const endDate = new Date(filters.endDate);
            endDate.setHours(23, 59, 59, 999);
            matchStage.startedAt.$lte = endDate;
        }
    }

    const stats = await this.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: null,
                totalCalls: { $sum: 1 },
                totalDuration: { $sum: "$duration" },
                totalCost: { $sum: "$cost" },
                avgDuration: { $avg: "$duration" },
                avgCost: { $avg: "$cost" },
                completedCalls: {
                    $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
                },
                failedCalls: {
                    $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] },
                },
                noAnswerCalls: {
                    $sum: { $cond: [{ $eq: ["$status", "no-answer"] }, 1, 0] },
                },
                busyCalls: {
                    $sum: { $cond: [{ $eq: ["$status", "busy"] }, 1, 0] },
                },
            },
        },
    ]);

    return stats[0] || {
        totalCalls: 0,
        totalDuration: 0,
        totalCost: 0,
        avgDuration: 0,
        avgCost: 0,
        completedCalls: 0,
        failedCalls: 0,
        noAnswerCalls: 0,
        busyCalls: 0,
    };
};

// ============================================
// INSTANCE METHODS
// ============================================

/**
 * End the call and calculate cost
 */
callSchema.methods.endCall = function (status = "completed", hangupBy = "user") {
    this.endedAt = new Date();
    this.status = status;
    this.hangupBy = hangupBy;
    this.duration = Math.floor((this.endedAt - this.startedAt) / 1000);
    this.cost = this.constructor.calculateCost(this.duration);
    this.transcriptCount = this.transcript?.length || 0;
};

/**
 * Add transcript entry
 */
callSchema.methods.addTranscript = function (role, content) {
    if (!this.transcript) {
        this.transcript = [];
    }
    this.transcript.push({
        role,
        content,
        timestamp: new Date(),
    });
    this.transcriptCount = this.transcript.length;
};

export default mongoose.model("Call", callSchema);
