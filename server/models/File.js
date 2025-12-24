import mongoose from "mongoose";

const fileSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  originalName: {
    type: String,
    required: true,
  },
  cloudinaryUrl: {
    type: String,
    required: true,
  },
  cloudinaryPublicId: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    required: true,
  },
  mimeType: {
    type: String,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  processedForRAG: {
    type: Boolean,
    default: false,
  },

  // ============================================
  // DOMAIN-BASED SCOPING (NEW)
  // Same RAG file can serve multiple agents
  // ============================================
  domain: {
    type: String,
    enum: ["automotive", "finance", "real-estate", "general"],
    default: "general",
    index: true,
  },

  // Agent-specific KB (optional - keep for agent-specific docs)
  agentId: {
    type: String,
    default: "default",
    index: true,
  },

  tags: {
    type: [String],
    default: [],
  },
});

// Compound index for domain + agent queries
fileSchema.index({ domain: 1, agentId: 1 });
fileSchema.index({ userId: 1, domain: 1 });

const File = mongoose.model("File", fileSchema);

export default File;
