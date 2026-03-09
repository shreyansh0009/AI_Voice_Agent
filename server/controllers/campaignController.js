import Campaign from "../models/Campaign.js";
import PhoneNumber from "../models/PhoneNumber.js";
import Agent from "../models/Agent.js";
import Call from "../models/Call.js";
import User from "../models/User.js";
import asteriskAMI from "../services/asteriskAMI.service.js";
import audioSocketServer from "../services/asteriskBridge.service.js";
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
 * Returns DID numbers owned by the user that are NOT linked to any agent
 * (i.e., available for campaign outbound calling).
 */
export const getAvailableChannels = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    // Find DIDs owned by user, status "owned" (not linked), valid subscription
    const availableDIDs = await PhoneNumber.find({
      ownerId: userId,
      status: "owned",
      expiresAt: { $gt: now },
    })
      .select("number displayNumber expiresAt")
      .sort({ displayNumber: 1 })
      .lean();

    // Also get total owned (linked + unlinked) for context
    const totalOwned = await PhoneNumber.countDocuments({
      ownerId: userId,
      status: { $in: ["owned", "linked"] },
      expiresAt: { $gt: now },
    });

    const linkedCount = totalOwned - availableDIDs.length;

    res.json({
      success: true,
      availableChannels: availableDIDs.length,
      totalOwned,
      linkedToAgents: linkedCount,
      channels: availableDIDs,
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
 * Body: { channelCount } — how many simultaneous channels to use
 */
export const startCampaign = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { channelCount = 1 } = req.body;

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

    // Get available channels
    const now = new Date();
    const availableDIDs = await PhoneNumber.find({
      ownerId: userId,
      status: "owned",
      expiresAt: { $gt: now },
    })
      .select("number displayNumber")
      .lean();

    if (availableDIDs.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No available channels. All your DID numbers are linked to agents.",
      });
    }

    const actualChannels = Math.min(channelCount, availableDIDs.length);

    // Check wallet balance
    const user = await User.findById(userId);
    if (!user || (user.walletBalance || 0) <= 0) {
      return res.status(402).json({
        success: false,
        error: "Insufficient wallet balance. Please add funds.",
        code: "INSUFFICIENT_BALANCE",
      });
    }

    // Update campaign status
    campaign.status = "running";
    campaign.channelsUsed = actualChannels;
    campaign.startedAt = new Date();
    await campaign.save();

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

    // Start calling in background — first batch
    const firstBatch = pendingContacts.slice(0, actualChannels);
    const agent = await Agent.findById(campaign.agentId);

    console.log(
      `📞 Campaign ${campaign.name}: Starting with ${actualChannels} channels, ` +
        `${pendingContacts.length} pending contacts`
    );

    // Fire first batch of calls (non-blocking)
    processCampaignBatch(campaign._id, firstBatch, availableDIDs, agent, userId).catch(
      (err) => console.error("Campaign batch error:", err)
    );

    res.json({
      success: true,
      message: `Campaign started with ${actualChannels} simultaneous channels`,
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
 * Process a batch of campaign calls.
 * Calls contacts using available DIDs round-robin.
 * After each call completes, picks next pending contact.
 */
async function processCampaignBatch(campaignId, contacts, availableDIDs, agent, userId) {
  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    const did = availableDIDs[i % availableDIDs.length];

    try {
      // Extract DID digits
      let didDigits = did.number;
      if (didDigits.startsWith("91") && didDigits.length > 10) {
        didDigits = didDigits.slice(2);
      }

      // Mark contact as calling
      await Campaign.updateOne(
        { _id: campaignId, "contacts._id": contact._id },
        {
          $set: {
            "contacts.$.status": "calling",
            "contacts.$.calledAt": new Date(),
          },
        }
      );

      // Originate call
      const { uuid } = await asteriskAMI.originate(didDigits, contact.phone);

      // Register pending call
      audioSocketServer.registerPendingCall(uuid, did.number);

      // Create call record
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

      // Update contact with callId
      await Campaign.updateOne(
        { _id: campaignId, "contacts._id": contact._id },
        {
          $set: {
            "contacts.$.callId": uuid,
            "contacts.$.status": "completed",
          },
          $inc: {
            "progress.completed": 1,
            "progress.pending": -1,
          },
        }
      );

      console.log(
        `📞 Campaign call initiated: ${uuid} → ${contact.phone} (${contact.name || "unnamed"})`
      );

      // Small delay between calls to avoid overwhelming Asterisk
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`Campaign call failed for ${contact.phone}:`, err.message);

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
    }
  }

  // Check if all contacts have been processed
  const campaign = await Campaign.findById(campaignId);
  const stillPending = campaign.contacts.filter((c) => c.status === "pending");

  if (stillPending.length > 0) {
    // Process next batch
    const nextBatch = stillPending.slice(0, availableDIDs.length);
    await processCampaignBatch(campaignId, nextBatch, availableDIDs, campaign.agentId, userId);
  } else {
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
