import mongoose from "mongoose";

const agentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    domain: {
      type: String,
      enum: ["automotive", "finance", "real-estate", "general"],
      default: "general",
    },
    status: {
      type: String,
      enum: ["active", "draft", "inactive"],
      default: "draft",
    },
    welcome: {
      type: String,
      default: "",
    },

    // ============================================
    // FLOW CONFIGURATION (NEW - Required for V5)
    // ============================================
    flowId: {
      type: String,
      required: false, // Make required: true after migration
      index: true,
      default: "automotive_sales", // Default flow
    },
    flowVersion: {
      type: String,
      default: "v1",
    },

    // PERSONA PROMPT (replaces complex prompt for flow logic)
    // This is ONLY for agent personality, NOT flow logic
    personaPrompt: {
      type: String,
      default: "",
    },

    // Supported languages for this agent
    supportedLanguages: {
      type: [String],
      default: ["en", "hi"],
    },

    // ============================================
    // DYNAMIC SLOT EXTRACTION (NEW)
    // ============================================
    // Required information fields detected from script
    // Enables dynamic extraction for ANY industry
    requiredSlots: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    // Agent persona configuration (for {{placeholder}} replacement)
    agentConfig: {
      name: { type: String, default: "Ava" },
      brand: { type: String, default: "" },
      tone: { type: String, default: "friendly" },
      style: { type: String, default: "concise" },
    },

    // ============================================
    // DEPRECATED - Keep for backwards compatibility
    // STOP using for flow logic, use flowId instead
    // ============================================
    prompt: {
      type: String,
      default: "",
      // @deprecated - Use personaPrompt for persona, flowId for flow logic
    },

    // ============================================
    // LLM Configuration
    // ============================================
    llmProvider: {
      type: String,
      enum: ["Openai", "Agentforce"],
      default: "Openai",
    },
    llmModel: {
      type: String,
      default: "gpt-4o-mini",
    },
    maxTokens: {
      type: Number,
      default: 1007,
    },
    temperature: {
      type: Number,
      default: 0.7,
    },

    // ============================================
    // Audio Configuration
    // ============================================
    language: {
      type: String,
      default: "English (India)",
    },
    transcriberProvider: {
      type: String,
      default: "Deepgram",
    },
    transcriberModel: {
      type: String,
      default: "nova-2",
    },
    voiceProvider: {
      type: String,
      default: "Sarvam",
    },
    voiceModel: {
      type: String,
      default: "bulbulv2",
    },
    voice: {
      type: String,
      default: "manisha",
    },
    bufferSize: {
      type: Number,
      default: 153,
    },
    speedRate: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true }
);

// Index for faster flow-based queries
agentSchema.index({ userId: 1, flowId: 1 });

export default mongoose.model("Agent", agentSchema);
