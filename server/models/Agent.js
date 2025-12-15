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
  },
  { timestamps: true }
);

export default mongoose.model("Agent", agentSchema);
