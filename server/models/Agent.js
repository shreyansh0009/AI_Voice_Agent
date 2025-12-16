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
    prompt: {
      type: String,
      default: "",
    },
    // LLM Configuration
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
    // Audio Configuration
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
      default: "abhilash",
    },
    bufferSize: {
      type: Number,
      default: 153,
    },
    speedRate: {
      type: Number,
      default: 0.8,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Agent", agentSchema);
