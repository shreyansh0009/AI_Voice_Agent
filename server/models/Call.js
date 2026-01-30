import mongoose from "mongoose";

/**
 * Call Model
 * 
 * Stores telephony call records from Asterisk/SIP integration.
 * Used by Call History dashboard to display call analytics.
 * 
 * Cost calculation:
 * - Telephony: ₹0.05 per minute
 * - LLM (GPT-4o-mini): $0.15/1M input tokens, $0.60/1M output tokens
 */

// Cost configuration
const TELEPHONY_COST_PER_MINUTE = 0.05; // INR per minute
const LLM_INPUT_COST_PER_TOKEN = 0.00000015; // $0.15 per 1M tokens
const LLM_OUTPUT_COST_PER_TOKEN = 0.0000006; // $0.60 per 1M tokens
const USD_TO_INR = 83; // Conversion rate

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
        // COST
        // ============================================
        // Telephony cost (₹0.5 per minute)
        telephonyCost: {
            type: Number,
            default: 0,
        },

        // LLM token tracking
        llmTokens: {
            input: { type: Number, default: 0 },
            output: { type: Number, default: 0 },
        },

        // LLM cost in USD
        llmCostUSD: {
            type: Number,
            default: 0,
        },

        // Total cost in INR (telephony + LLM converted)
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
 * Calculate telephony cost based on duration
 * Rate: ₹0.5 per minute (rounded up)
 */
callSchema.statics.calculateTelephonyCost = function (durationSeconds) {
    const minutes = Math.ceil(durationSeconds / 60);
    return parseFloat((minutes * TELEPHONY_COST_PER_MINUTE).toFixed(3));
};

/**
 * Calculate LLM cost based on token usage
 * GPT-4o-mini: $0.15/1M input, $0.60/1M output
 * @returns {number} Cost in USD
 */
callSchema.statics.calculateLLMCost = function (inputTokens, outputTokens) {
    const inputCost = inputTokens * LLM_INPUT_COST_PER_TOKEN;
    const outputCost = outputTokens * LLM_OUTPUT_COST_PER_TOKEN;
    return parseFloat((inputCost + outputCost).toFixed(6));
};

/**
 * Calculate total cost (telephony + LLM)
 * All costs returned in INR
 */
callSchema.statics.calculateTotalCost = function (durationSeconds, inputTokens = 0, outputTokens = 0) {
    const telephonyCost = this.calculateTelephonyCost(durationSeconds);
    const llmCostUSD = this.calculateLLMCost(inputTokens, outputTokens);
    const llmCostINR = llmCostUSD * USD_TO_INR;
    return parseFloat((telephonyCost + llmCostINR).toFixed(3));
};

/**
 * Backwards compatible - returns telephony cost only
 * @deprecated Use calculateTelephonyCost or calculateTotalCost
 */
callSchema.statics.calculateCost = function (durationSeconds) {
    return this.calculateTelephonyCost(durationSeconds);
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
 * End the call and calculate all costs
 * @param {string} status - Call status
 * @param {string} hangupBy - Who ended the call
 * @param {number} inputTokens - LLM input tokens used
 * @param {number} outputTokens - LLM output tokens used
 */
callSchema.methods.endCall = function (status = "completed", hangupBy = "user", inputTokens = 0, outputTokens = 0) {
    this.endedAt = new Date();
    this.status = status;
    this.hangupBy = hangupBy;
    this.duration = Math.floor((this.endedAt - this.startedAt) / 1000);

    // Calculate individual costs
    this.telephonyCost = this.constructor.calculateTelephonyCost(this.duration);
    this.llmTokens = { input: inputTokens, output: outputTokens };
    this.llmCostUSD = this.constructor.calculateLLMCost(inputTokens, outputTokens);

    // Calculate total cost in INR
    this.cost = this.constructor.calculateTotalCost(this.duration, inputTokens, outputTokens);

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
