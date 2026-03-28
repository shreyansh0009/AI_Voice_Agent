import Campaign from "../models/Campaign.js";
import PhoneNumber from "../models/PhoneNumber.js";
import Agent from "../models/Agent.js";
import Call from "../models/Call.js";
import User from "../models/User.js";
import asteriskAMI from "../services/asteriskAMI.service.js";
import audioSocketServer from "../services/asteriskBridge.service.js";
import twilioService from "../services/twilio.service.js";
import { v2 as cloudinary } from "cloudinary";
import * as XLSX from "xlsx";
import fs from "fs";

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Parse CSV/XLSX file and extract contacts (name + phone)
 */
function parseContactsFile(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (!rows.length) {
    throw new Error("File is empty or has no data rows.");
  }

  // Find the name and phone columns (case-insensitive substring match for flexibility)
  const headers = Object.keys(rows[0]);

  const isNameCol  = (h) => /name|customer|client|contact[\s_-]?name/i.test(h)
  const isPhoneCol = (h) => /phone|mobile|cell|tele|contact[\s_-]?(no|num|number)|number/i.test(h)

  const nameCol  = headers.find(isNameCol)
  const phoneCol = headers.find(isPhoneCol)

  if (!phoneCol) {
    throw new Error(
      `Could not find a phone/mobile column. Found columns: ${headers.join(", ")}. ` +
        `Expected one of: phone, mobile, mobile_number, phone_number, contact, number`
    );
  }

  const contacts = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawPhone = String(row[phoneCol] || "").trim();
    const name = nameCol ? String(row[nameCol] || "").trim() : "";

    // Clean phone number: remove spaces, dashes, +, ()
    let phone = rawPhone.replace(/[\s\-\+\(\)]/g, "");

    // Remove leading 91 country code if present (keeping 10-digit number)
    if (phone.length === 12 && phone.startsWith("91")) {
      phone = phone.slice(2);
    }

    // Validate: must be 10 digits starting with 6-9 (Indian mobile)
    if (!/^[6-9]\d{9}$/.test(phone)) {
      errors.push(`Row ${i + 2}: Invalid phone "${rawPhone}"`);
      continue;
    }

    contacts.push({ name, phone });
  }

  return { contacts, errors, totalRows: rows.length, headers };
}

// ── Controllers ─────────────────────────────────────────────────────────

/**
 * GET /api/campaigns/available-channels
 *
 * Returns DID numbers owned by the user that ARE linked to agents.
 * For campaigns, we MUST use agent-linked DIDs so the AudioSocket bridge
 * correctly routes the call to the AI agent.
 * Each linked DID = 1 available channel for campaign calls.
 */
export const getAvailableChannels = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all user's numbers
    const allNumbers = await PhoneNumber.find({
      ownerId: userId,
      status: { $in: ["owned", "linked"] },
    })
      .populate("linkedAgentId", "name")
      .sort({ displayNumber: 1 })
      .lean();

    // Linked DIDs = channels available for campaigns (agent will respond)
    const linkedDIDs = allNumbers.filter(
      (p) => p.status === "linked" && p.linkedAgentId
    );

    // Unlinked (owned but no agent) — can't use for campaigns since no AI agent mapped
    const unlinkedDIDs = allNumbers.filter((p) => p.status === "owned");

    res.json({
      success: true,
      availableChannels: linkedDIDs.length,
      totalOwned: allNumbers.length,
      linkedToAgents: linkedDIDs.length,
      unlinked: unlinkedDIDs.length,
      channels: linkedDIDs.map((d) => ({
        _id: d._id,
        number: d.number,
        displayNumber: d.displayNumber,
        agentId: d.linkedAgentId?._id || d.linkedAgentId,
        agentName: d.linkedAgentId?.name || "Unknown",
      })),
    });
  } catch (error) {
    console.error("Error fetching available channels:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch available channels",
    });
  }
};

/**
 * POST /api/campaigns/upload
 *
 * Upload CSV/XLSX file, parse contacts, store file on Cloudinary,
 * and create a draft Campaign.
 *
 * Body (multipart): file, name, agentId
 */
export const uploadCampaign = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, agentId } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    if (!name || !agentId) {
      // Clean up temp file
      fs.unlinkSync(file.path);
      return res.status(400).json({
        success: false,
        error: "Campaign name and agentId are required",
      });
    }

    // Verify agent belongs to user
    const agent = await Agent.findOne({ _id: agentId, userId });
    if (!agent) {
      fs.unlinkSync(file.path);
      return res.status(404).json({ success: false, error: "Agent not found" });
    }

    // Parse the file
    let parseResult;
    try {
      parseResult = parseContactsFile(file.path);
    } catch (parseErr) {
      fs.unlinkSync(file.path);
      return res.status(400).json({
        success: false,
        error: parseErr.message,
      });
    }

    if (parseResult.contacts.length === 0) {
      fs.unlinkSync(file.path);
      return res.status(400).json({
        success: false,
        error: "No valid contacts found in the file.",
        errors: parseResult.errors,
      });
    }

    // Upload file to Cloudinary
    let fileUrl = null;
    try {
      const cloudResult = await cloudinary.uploader.upload(file.path, {
        resource_type: "raw",
        folder: "campaign-files",
        public_id: `campaign_${Date.now()}`,
      });
      fileUrl = cloudResult.secure_url;
    } catch (cloudErr) {
      console.error("Cloudinary upload failed:", cloudErr.message);
      // Continue without Cloudinary URL — not critical
    }

    // Clean up temp file
    try {
      fs.unlinkSync(file.path);
    } catch (e) {
      // ignore
    }

    // Create campaign
    const campaign = await Campaign.create({
      userId,
      name: name.trim(),
      agentId,
      fileUrl,
      fileName: file.originalname,
      contacts: parseResult.contacts.map((c) => ({
        name: c.name,
        phone: c.phone,
        status: "pending",
      })),
      totalContacts: parseResult.contacts.length,
      status: "draft",
      progress: {
        completed: 0,
        failed: 0,
        pending: parseResult.contacts.length,
        noAnswer: 0,
      },
    });

    res.json({
      success: true,
      campaign: {
        _id: campaign._id,
        name: campaign.name,
        agentId: campaign.agentId,
        agentName: agent.name,
        totalContacts: campaign.totalContacts,
        fileName: campaign.fileName,
        fileUrl: campaign.fileUrl,
        status: campaign.status,
        createdAt: campaign.createdAt,
      },
      preview: parseResult.contacts.slice(0, 10),
      parseErrors: parseResult.errors,
      totalRows: parseResult.totalRows,
      validContacts: parseResult.contacts.length,
    });
  } catch (error) {
    console.error("Error uploading campaign:", error);
    // Clean up temp file on error
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
    }
    res.status(500).json({
      success: false,
      error: "Failed to upload campaign",
    });
  }
};

/**
 * POST /api/campaigns/:id/start
 *
 * Start a campaign — initiate batch outbound calls.
 * Uses the DID linked to the campaign's selected agent so the AI agent responds.
 * For now: 1 agent = 1 linked DID = 1 channel.
 */
export const startCampaign = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Find campaign
    const campaign = await Campaign.findOne({ _id: id, userId });
    if (!campaign) {
      return res.status(404).json({ success: false, error: "Campaign not found" });
    }

    if (campaign.status === "running") {
      return res.status(400).json({ success: false, error: "Campaign is already running" });
    }

    if (campaign.status === "completed") {
      return res.status(400).json({ success: false, error: "Campaign is already completed" });
    }

    // Find the DID linked to the campaign's agent
    const agentDID = await PhoneNumber.findOne({
      ownerId: userId,
      linkedAgentId: campaign.agentId,
      status: "linked",
    }).lean();

    if (!agentDID) {
      return res.status(400).json({
        success: false,
        error: "The selected agent has no phone number linked. Please link a DID to this agent first.",
      });
    }

    // Get pending contacts
    const pendingContacts = campaign.contacts.filter((c) => c.status === "pending");

    if (pendingContacts.length === 0) {
      campaign.status = "completed";
      campaign.completedAt = new Date();
      await campaign.save();
      return res.json({
        success: true,
        message: "No pending contacts to call.",
        campaign,
      });
    }

    // For now: 1 agent = 1 DID = 1 channel
    const actualChannels = 1;

    // Update campaign status
    campaign.status = "running";
    campaign.channelsUsed = actualChannels;
    campaign.startedAt = new Date();
    await campaign.save();

    const agent = await Agent.findById(campaign.agentId);

    console.log(
      `📞 Campaign ${campaign.name}: Starting with agent "${agent?.name}", ` +
        `DID ${agentDID.displayNumber}, ${pendingContacts.length} pending contacts`
    );

    // Fire campaign processing in background (non-blocking)
    processCampaign(campaign._id, [agentDID], agent, userId).catch(
      (err) => console.error("Campaign processing error:", err)
    );

    res.json({
      success: true,
      message: `Campaign started using agent "${agent?.name}" (DID: ${agentDID.displayNumber})`,
      channelsUsed: actualChannels,
      pendingContacts: pendingContacts.length,
      campaignId: campaign._id,
    });
  } catch (error) {
    console.error("Error starting campaign:", error);
    res.status(500).json({
      success: false,
      error: "Failed to start campaign",
    });
  }
};

/**
 * Process the entire campaign using N channels concurrently.
 *
 * Each channel (DID) picks the next pending contact, calls it,
 * waits for the call to be originated, then picks the next one.
 * When all contacts are processed, campaign is marked completed.
 *
 * @param {string} campaignId
 * @param {Array} dids - The DID objects to use as channels
 * @param {Object} agent - Agent document
 * @param {string} userId
 */
async function processCampaign(campaignId, dids, agent, userId) {
  /**
   * Get next pending contact from DB atomically (findOneAndUpdate)
   * so multiple channels don't pick the same contact.
   */
  async function getNextPending() {
    const campaign = await Campaign.findOneAndUpdate(
      {
        _id: campaignId,
        "contacts.status": "pending",
      },
      {
        $set: { "contacts.$.status": "calling" },
      },
      { new: true }
    );

    if (!campaign) return null;

    // Find the contact we just set to "calling"
    return campaign.contacts.find((c) => c.status === "calling" && !c.calledAt);
  }

  const isTwilio = agent.callConfig?.provider === "Twilio";
  const baseUrl = process.env.TWILIO_WEBHOOK_BASE_URL || process.env.BASE_URL || "https://localhost";

  /**
   * Worker for a single channel/DID.
   * Picks contacts one by one until none are left.
   */
  async function channelWorker(did) {
    let didDigits = did.number;
    if (didDigits.startsWith("91") && didDigits.length > 10) {
      didDigits = didDigits.slice(2);
    }

    while (true) {
      // Pick next pending contact
      const contact = await getNextPending();
      if (!contact) break; // No more pending contacts

      try {
        // Update calledAt timestamp
        await Campaign.updateOne(
          { _id: campaignId, "contacts._id": contact._id },
          { $set: { "contacts.$.calledAt": new Date() } }
        );

        let callId;

        if (isTwilio) {
          // ── Twilio outbound ────────────────────────────────────────
          const { twilioAccountSid, twilioAuthToken, twilioPhoneNumber } = agent.callConfig;
          const webhookUrl = `${baseUrl}/api/twilio/voice?agentId=${agent._id}&conversationType=twilio+campaign+outbound`;
          const statusCallbackUrl = `${baseUrl}/api/twilio/status`;
          const toNumber = contact.phone.startsWith("+") ? contact.phone : `+91${contact.phone}`;

          const call = await twilioService.createCall(
            twilioAccountSid,
            twilioAuthToken,
            twilioPhoneNumber,
            toNumber,
            webhookUrl,
            statusCallbackUrl
          );
          callId = call.sid;
        } else {
          // ── Asterisk outbound ──────────────────────────────────────
          const { uuid } = await asteriskAMI.originate(didDigits, contact.phone);
          audioSocketServer.registerPendingCall(uuid, did.number);

          // Create preliminary call record for Asterisk
          await Call.create({
            callId: uuid,
            executionId: uuid.substring(0, 8),
            agentId: agent._id,
            userId: userId,
            calledNumber: did.number,
            callerNumber: contact.phone,
            userNumber: contact.phone,
            status: "initiated",
            startedAt: new Date(),
            hangupBy: "system",
            conversationType: "campaign outbound",
            provider: "Asterisk",
            batch: `campaign-${campaignId}`,
          });
          callId = uuid;
        }

        // Mark contact as completed (call originated successfully)
        await Campaign.updateOne(
          { _id: campaignId, "contacts._id": contact._id },
          {
            $set: {
              "contacts.$.callId": callId,
              "contacts.$.status": "completed",
            },
            $inc: {
              "progress.completed": 1,
              "progress.pending": -1,
            },
          }
        );

        console.log(
          `📞 Campaign call [${isTwilio ? "Twilio" : did.displayNumber}]: ${callId} → ${contact.phone} (${contact.name || "unnamed"})`
        );

        // Small delay before next call to avoid overwhelming provider
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        console.error(`Campaign call failed for ${contact.phone} on ${isTwilio ? "Twilio" : did.displayNumber}:`, err.message);

        // Mark contact as failed
        await Campaign.updateOne(
          { _id: campaignId, "contacts._id": contact._id },
          {
            $set: {
              "contacts.$.status": "failed",
              "contacts.$.error": err.message,
            },
            $inc: {
              "progress.failed": 1,
              "progress.pending": -1,
            },
          }
        );

        // Small delay before retrying next contact on this channel
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  // Launch all channel workers concurrently
  const workers = dids.map((did) => channelWorker(did));
  await Promise.all(workers);

  // Mark campaign as completed
  await Campaign.updateOne(
    { _id: campaignId },
    {
      $set: {
        status: "completed",
        completedAt: new Date(),
      },
    }
  );
  console.log(`✅ Campaign ${campaignId} completed!`);
}

/**
 * GET /api/campaigns
 *
 * List all campaigns for the authenticated user
 */
export const listCampaigns = async (req, res) => {
  try {
    const userId = req.user.id;

    const campaigns = await Campaign.find({ userId })
      .populate("agentId", "name")
      .select("-contacts") // Don't send all contacts in list view
      .sort({ createdAt: -1 })
      .lean();

    const formatted = campaigns.map((c) => ({
      _id: c._id,
      name: c.name,
      agentId: c.agentId?._id || c.agentId,
      agentName: c.agentId?.name || "Unknown Agent",
      totalContacts: c.totalContacts,
      fileName: c.fileName,
      status: c.status,
      progress: c.progress,
      channelsUsed: c.channelsUsed,
      startedAt: c.startedAt,
      completedAt: c.completedAt,
      createdAt: c.createdAt,
    }));

    res.json({ success: true, campaigns: formatted });
  } catch (error) {
    console.error("Error listing campaigns:", error);
    res.status(500).json({ success: false, error: "Failed to list campaigns" });
  }
};

/**
 * GET /api/campaigns/:id
 *
 * Get single campaign with full contact details
 */
export const getCampaign = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const campaign = await Campaign.findOne({ _id: id, userId })
      .populate("agentId", "name")
      .lean();

    if (!campaign) {
      return res.status(404).json({ success: false, error: "Campaign not found" });
    }

    res.json({
      success: true,
      campaign: {
        ...campaign,
        agentName: campaign.agentId?.name || "Unknown Agent",
      },
    });
  } catch (error) {
    console.error("Error fetching campaign:", error);
    res.status(500).json({ success: false, error: "Failed to fetch campaign" });
  }
};

/**
 * DELETE /api/campaigns/:id
 *
 * Delete a campaign (only if not running)
 */
export const deleteCampaign = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const campaign = await Campaign.findOne({ _id: id, userId });
    if (!campaign) {
      return res.status(404).json({ success: false, error: "Campaign not found" });
    }

    if (campaign.status === "running") {
      return res.status(400).json({
        success: false,
        error: "Cannot delete a running campaign. Stop it first.",
      });
    }

    await Campaign.deleteOne({ _id: id });

    res.json({ success: true, message: "Campaign deleted" });
  } catch (error) {
    console.error("Error deleting campaign:", error);
    res.status(500).json({ success: false, error: "Failed to delete campaign" });
  }
};
