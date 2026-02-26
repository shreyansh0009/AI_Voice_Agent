import mongoose from "mongoose";

const leadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      index: true,
    },
    industry: {
      type: String,
      required: true,
      index: true,
    },
    source: {
      type: String,
      default: "website_get_started",
      index: true,
    },
    status: {
      type: String,
      enum: [
        "new",
        "number_assigned",
        "no_number_available",
        "trial_expired",
        "released_early",
      ],
      default: "new",
      index: true,
    },
    assignedNumber: {
      type: String,
      default: null,
    },
    assignedPhoneNumberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PhoneNumber",
      default: null,
    },
    assignedAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent",
      default: null,
    },
    trialStartsAt: {
      type: Date,
      default: null,
    },
    trialExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    releasedAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

leadSchema.index({ createdAt: -1 });

export default mongoose.model("Lead", leadSchema);
