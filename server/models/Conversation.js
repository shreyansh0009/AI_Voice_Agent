import mongoose from "mongoose";

/**
 * Conversation Model
 *
 * PURPOSE: Runtime state machine for conversations
 *
 * This is the MOST CRITICAL model for telephony-grade reliability.
 *
 * EFFECTS:
 * - Backend never guesses state
 * - LLM cannot drift
 * - Resume, retry, debug all possible
 * - Telephony-grade reliability
 *
 * This model is what Bolna.ai / PolyAI rely on internally.
 */

const conversationSchema = new mongoose.Schema(
  {
    // ============================================
    // REFERENCES
    // ============================================
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent",
      required: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    // External conversation ID (for telephony/web integration)
    externalId: {
      type: String,
      index: true,
    },

    // ============================================
    // FLOW STATE (Critical for state machine)
    // ============================================
    flowId: {
      type: String,
      required: true,
      index: true,
    },

    flowVersion: {
      type: String,
      default: "v1",
    },

    currentStepId: {
      type: String,
      required: true,
    },

    previousStepId: {
      type: String,
      default: null,
    },

    // ============================================
    // COLLECTED DATA
    // ============================================
    collectedData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // ============================================
    // LANGUAGE & PERSONA
    // ============================================
    language: {
      type: String,
      enum: ["en", "hi", "ta", "te", "kn", "ml", "bn", "gu", "mr", "pa"],
      default: "en",
    },

    // Agent persona snapshot (for consistency during conversation)
    agentConfig: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // ============================================
    // RETRY & ERROR HANDLING
    // ============================================
    retryCount: {
      type: Number,
      default: 0,
    },

    maxRetries: {
      type: Number,
      default: 2,
    },

    lastValidationError: {
      type: String,
      default: null,
    },

    // ============================================
    // STATUS & LIFECYCLE
    // ============================================
    status: {
      type: String,
      enum: ["active", "completed", "handoff", "abandoned", "paused"],
      default: "active",
      index: true,
    },

    // Reason for status change
    statusReason: {
      type: String,
      default: null,
    },

    // ============================================
    // HISTORY & DEBUGGING
    // ============================================
    lastUserInput: {
      type: String,
    },

    lastAgentResponse: {
      type: String,
    },

    // Step history for debugging/analytics
    stepHistory: {
      type: [
        {
          stepId: String,
          enteredAt: Date,
          userInput: String,
          agentResponse: String,
          slotsExtracted: mongoose.Schema.Types.Mixed,
        },
      ],
      default: [],
    },

    // Turn count
    turnCount: {
      type: Number,
      default: 0,
    },

    // ============================================
    // CHANNEL INFO
    // ============================================
    channel: {
      type: String,
      enum: ["web", "phone", "api"],
      default: "web",
    },

    // Phone number (if phone channel)
    phoneNumber: {
      type: String,
    },

    // Call ID (if phone channel)
    callId: {
      type: String,
    },

    // ============================================
    // TIMESTAMPS
    // ============================================
    startedAt: {
      type: Date,
      default: Date.now,
    },

    completedAt: {
      type: Date,
    },

    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// ============================================
// INDEXES
// ============================================
conversationSchema.index({ agentId: 1, status: 1 });
conversationSchema.index({ userId: 1, status: 1 });
conversationSchema.index({ flowId: 1, status: 1 });
conversationSchema.index({ externalId: 1 }, { sparse: true });
conversationSchema.index({ phoneNumber: 1 }, { sparse: true });
conversationSchema.index({ lastActivityAt: 1 });

// ============================================
// METHODS
// ============================================

/**
 * Record a step transition
 */
conversationSchema.methods.recordStep = function (
  stepId,
  userInput,
  agentResponse,
  slotsExtracted
) {
  this.stepHistory.push({
    stepId,
    enteredAt: new Date(),
    userInput,
    agentResponse,
    slotsExtracted,
  });

  if (this.stepHistory.length > 50) {
    // Keep only last 50 steps to prevent unbounded growth
    this.stepHistory = this.stepHistory.slice(-50);
  }

  this.turnCount += 1;
  this.lastActivityAt = new Date();
};

/**
 * Update collected data
 */
conversationSchema.methods.updateData = function (newData) {
  this.collectedData = { ...this.collectedData, ...newData };
  this.lastActivityAt = new Date();
};

/**
 * Advance to next step
 */
conversationSchema.methods.advanceTo = function (nextStepId) {
  this.previousStepId = this.currentStepId;
  this.currentStepId = nextStepId;
  this.retryCount = 0;
  this.lastActivityAt = new Date();
};

/**
 * Increment retry count
 */
conversationSchema.methods.incrementRetry = function (validationError = null) {
  this.retryCount += 1;
  this.lastValidationError = validationError;
  this.lastActivityAt = new Date();
};

/**
 * Complete conversation
 */
conversationSchema.methods.complete = function (reason = "flow_complete") {
  this.status = "completed";
  this.statusReason = reason;
  this.completedAt = new Date();
  this.lastActivityAt = new Date();
};

/**
 * Handoff to human
 */
conversationSchema.methods.handoff = function (reason = "user_requested") {
  this.status = "handoff";
  this.statusReason = reason;
  this.lastActivityAt = new Date();
};

/**
 * Abandon conversation
 */
conversationSchema.methods.abandon = function (reason = "timeout") {
  this.status = "abandoned";
  this.statusReason = reason;
  this.lastActivityAt = new Date();
};

/**
 * Check if can resume
 */
conversationSchema.methods.canResume = function () {
  return ["active", "paused"].includes(this.status);
};

// ============================================
// STATICS
// ============================================

/**
 * Find or create conversation by external ID
 */
conversationSchema.statics.findOrCreateByExternalId = async function (
  externalId,
  defaults
) {
  let conversation = await this.findOne({ externalId });

  if (!conversation) {
    conversation = new this({
      externalId,
      ...defaults,
    });
    await conversation.save();
  }

  return conversation;
};

/**
 * Find active conversations for an agent
 */
conversationSchema.statics.findActiveByAgent = function (agentId) {
  return this.find({ agentId, status: "active" }).sort({ lastActivityAt: -1 });
};

/**
 * Find conversations that may need cleanup (abandoned)
 */
conversationSchema.statics.findStale = function (minutesInactive = 30) {
  const cutoff = new Date(Date.now() - minutesInactive * 60 * 1000);
  return this.find({
    status: "active",
    lastActivityAt: { $lt: cutoff },
  });
};

export default mongoose.model("Conversation", conversationSchema);
