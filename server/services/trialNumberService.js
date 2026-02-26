import Lead from "../models/Lead.js";
import PhoneNumber from "../models/PhoneNumber.js";

function getDurationMinutes() {
  const value = parseInt(process.env.TRIAL_DURATION_MINUTES || "5", 10);
  return Number.isNaN(value) || value <= 0 ? 5 : value;
}

function getReleaseStatus(phoneNumberDoc) {
  const hasValidSubscription =
    phoneNumberDoc.expiresAt && new Date(phoneNumberDoc.expiresAt) > new Date();
  const hasOwner = !!phoneNumberDoc.ownerId;
  return hasOwner || hasValidSubscription ? "owned" : "available";
}

async function releaseSingleTrialNumber(phoneNumber, now = new Date()) {
  const leadId = phoneNumber.trialLeadId?.toString();
  const releaseStatus = getReleaseStatus(phoneNumber);

  phoneNumber.linkedAgentId = null;
  phoneNumber.linkedAgentName = null;
  phoneNumber.linkedAt = null;
  phoneNumber.status = releaseStatus;
  phoneNumber.trialLeadId = null;
  phoneNumber.trialExpiresAt = null;
  phoneNumber.reservedForTrial = false;

  await phoneNumber.save();

  if (leadId) {
    await Lead.findByIdAndUpdate(leadId, {
      $set: {
        status: "trial_expired",
        releasedAt: now,
      },
    });
  }
}

export async function reserveTrialNumber({ leadId, agentId, agentName }) {
  const now = new Date();
  const durationMinutes = getDurationMinutes();
  const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

  await releaseExpiredTrials();

  const query = {
    status: "available",
    linkedAgentId: null,
    ownerId: null,
    $or: [
      { trialExpiresAt: null },
      { trialExpiresAt: { $exists: false } },
      { trialExpiresAt: { $lte: now } },
    ],
  };

  if ((process.env.TRIAL_POOL_ONLY || "false").toLowerCase() === "true") {
    query.isTrialPool = true;
  }

  const updated = await PhoneNumber.findOneAndUpdate(
    query,
    {
      $set: {
        status: "linked",
        linkedAgentId: agentId,
        linkedAgentName: agentName || null,
        linkedAt: now,
        trialLeadId: leadId,
        trialExpiresAt: expiresAt,
        reservedForTrial: true,
      },
    },
    {
      sort: { updatedAt: 1 },
      new: true,
    },
  );

  if (!updated) {
    return null;
  }

  return {
    phoneNumber: updated,
    startsAt: now,
    expiresAt,
    durationMinutes,
  };
}

export async function releaseNumberForLead(leadId, reason = "released_early") {
  const phoneNumber = await PhoneNumber.findOne({
    trialLeadId: leadId,
    reservedForTrial: true,
  });

  if (!phoneNumber) {
    return null;
  }

  const releaseStatus = getReleaseStatus(phoneNumber);

  phoneNumber.linkedAgentId = null;
  phoneNumber.linkedAgentName = null;
  phoneNumber.linkedAt = null;
  phoneNumber.status = releaseStatus;
  phoneNumber.trialLeadId = null;
  phoneNumber.trialExpiresAt = null;
  phoneNumber.reservedForTrial = false;

  await phoneNumber.save();

  await Lead.findByIdAndUpdate(leadId, {
    $set: {
      status: reason,
      releasedAt: new Date(),
    },
  });

  return phoneNumber;
}

export async function releaseExpiredTrials() {
  const now = new Date();
  const expiredNumbers = await PhoneNumber.find({
    reservedForTrial: true,
    trialExpiresAt: { $lte: now },
  });

  if (expiredNumbers.length === 0) {
    return { releasedCount: 0, releasedLeadIds: [] };
  }

  const releasedLeadIds = [];

  for (const phoneNumber of expiredNumbers) {
    const leadId = phoneNumber.trialLeadId?.toString();
    await releaseSingleTrialNumber(phoneNumber, now);
    if (leadId) releasedLeadIds.push(leadId);
  }

  return { releasedCount: expiredNumbers.length, releasedLeadIds };
}
