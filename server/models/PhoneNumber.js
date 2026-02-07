import mongoose from "mongoose";

const phoneNumberSchema = new mongoose.Schema(
  {
    // Cleaned phone number (without +, -, spaces)
    number: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Display format (e.g., "+91-7935459094")
    displayNumber: {
      type: String,
      required: true,
    },
    // Owner of the phone number (user who purchased it)
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    // Linked agent (nullable when available)
    linkedAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent",
      default: null,
    },
    // Cached agent name for display
    linkedAgentName: {
      type: String,
      default: null,
    },
    // Link timestamp
    linkedAt: {
      type: Date,
      default: null,
    },
    // Purchase timestamp
    purchasedAt: {
      type: Date,
      default: null,
    },
    // Subscription expiry date
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    // Status for quick filtering
    status: {
      type: String,
      enum: ["available", "owned", "linked", "expired"],
      default: "available",
    },
  },
  { timestamps: true },
);

// Index for finding agent's linked number
phoneNumberSchema.index({ linkedAgentId: 1 });

// Static method to clean phone number format
phoneNumberSchema.statics.cleanNumber = function (phoneNumber) {
  if (!phoneNumber) return null;
  return phoneNumber.toString().replace(/[\+\s\-\(\)]/g, "");
};

// Static method to find by any phone format
phoneNumberSchema.statics.findByNumber = function (phoneNumber) {
  const cleaned = this.cleanNumber(phoneNumber);
  return this.findOne({ number: cleaned });
};

// Static method to get agent ID for a DID (replacement for didMapping.js)
phoneNumberSchema.statics.getAgentIdForDID = async function (phoneNumber) {
  const cleaned = this.cleanNumber(phoneNumber);
  if (!cleaned) return null;

  const record = await this.findOne({ number: cleaned });

  if (record && record.linkedAgentId) {
    console.log(`📞 DID ${phoneNumber} → Agent ${record.linkedAgentId}`);
    return record.linkedAgentId.toString();
  }

  console.warn(
    `⚠️ No agent mapped for DID: ${phoneNumber} (cleaned: ${cleaned})`,
  );
  return null;
};

export default mongoose.model("PhoneNumber", phoneNumberSchema);
