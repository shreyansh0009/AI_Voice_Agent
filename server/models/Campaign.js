import mongoose from "mongoose";

const contactSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    phone: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "calling", "completed", "failed", "no-answer", "busy"],
      default: "pending",
    },
    callId: { type: String, default: null },
    calledAt: { type: Date, default: null },
    duration: { type: Number, default: 0 },
    error: { type: String, default: null },
  },
  { _id: true }
);

const campaignSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent",
      required: true,
    },
    // Original uploaded file URL on Cloudinary
    fileUrl: {
      type: String,
      default: null,
    },
    fileName: {
      type: String,
      default: null,
    },
    // Parsed contacts from the file
    contacts: [contactSchema],
    totalContacts: {
      type: Number,
      default: 0,
    },
    batchSize: {
      type: Number,
      default: 5,
    },
    // How many simultaneous channels to use
    channelsUsed: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: ["draft", "running", "paused", "completed", "failed"],
      default: "draft",
    },
    progress: {
      completed: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      pending: { type: Number, default: 0 },
      noAnswer: { type: Number, default: 0 },
    },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

campaignSchema.index({ userId: 1, status: 1 });

export default mongoose.model("Campaign", campaignSchema);
