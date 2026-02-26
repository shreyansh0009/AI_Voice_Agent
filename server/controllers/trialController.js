import Agent from "../models/Agent.js";
import Lead from "../models/Lead.js";
import {
  normalizeIndustry,
  resolveAgentIdForIndustry,
} from "../services/industryAgentResolver.js";
import {
  releaseNumberForLead,
  reserveTrialNumber,
} from "../services/trialNumberService.js";

function normalizePhone(rawPhone = "") {
  const digits = rawPhone.toString().replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  return digits;
}

function validateLeadInput(body) {
  const name = (body.name || "").toString().trim();
  const phone = normalizePhone(body.phone || "");
  const industry = normalizeIndustry(body.industry || "");

  if (name.length < 2) {
    return { ok: false, message: "Name is required" };
  }

  if (!/^[6-9]\d{9}$/.test(phone)) {
    return { ok: false, message: "Phone must be a valid 10-digit Indian mobile" };
  }

  if (!industry) {
    return { ok: false, message: "Industry is required" };
  }

  return { ok: true, payload: { name, phone, industry } };
}

export async function startTrial(req, res, next) {
  try {
    const validation = validateLeadInput(req.body);
    if (!validation.ok) {
      return res.status(400).json({ success: false, error: validation.message });
    }

    const { name, phone, industry } = validation.payload;
    const source = req.body.source || "website_get_started";
    const selectedAgentId = req.body.agentId || req.body.selectedAgentId || null;

    const resolvedAgentId =
      selectedAgentId || resolveAgentIdForIndustry(industry);
    if (!resolvedAgentId) {
      return res.status(400).json({
        success: false,
        error: `No agent mapping configured for industry '${industry}'`,
      });
    }

    const agent = await Agent.findById(resolvedAgentId).select(
      "name welcome prompt voice voiceProvider",
    );
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: `Mapped agent not found for industry '${industry}'`,
      });
    }

    const lead = await Lead.create({
      name,
      phone,
      industry,
      source,
      status: "new",
      metadata: {
        userAgent: req.headers["user-agent"] || null,
        ip: req.ip || null,
        prebuiltAgentType: req.body.prebuiltAgentType || null,
        voicePreference: req.body.voicePreference || req.body.voiceGender || null,
        callOption: req.body.callOption || null,
      },
    });

    const assignment = await reserveTrialNumber({
      leadId: lead._id,
      agentId: agent._id,
      agentName: agent.name,
    });

    if (!assignment) {
      lead.status = "no_number_available";
      await lead.save();

      return res.status(503).json({
        success: false,
        error: "No trial number is currently available. Please try again shortly.",
        leadId: lead._id,
      });
    }

    lead.status = "number_assigned";
    lead.assignedAgentId = agent._id;
    lead.assignedPhoneNumberId = assignment.phoneNumber._id;
    lead.assignedNumber = assignment.phoneNumber.displayNumber;
    lead.trialStartsAt = assignment.startsAt;
    lead.trialExpiresAt = assignment.expiresAt;
    await lead.save();

    return res.status(201).json({
      success: true,
      leadId: lead._id,
      name: lead.name,
      phone: lead.phone,
      industry: lead.industry,
      assignedAgent: {
        id: agent._id,
        name: agent.name,
        welcome: agent.welcome || "",
        prompt: agent.prompt || "",
      },
      testNumber: assignment.phoneNumber.displayNumber,
      testNumberRaw: assignment.phoneNumber.number,
      expiresAt: assignment.expiresAt,
      trialDurationMinutes: assignment.durationMinutes,
      message: "Lead created and trial number assigned for testing.",
    });
  } catch (error) {
    next(error);
  }
}

export async function listTrialLeads(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const status = req.query.status;

    const query = {};
    if (status) query.status = status;

    const leads = await Lead.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      success: true,
      count: leads.length,
      leads,
    });
  } catch (error) {
    next(error);
  }
}

export async function getTrialLeadById(req, res, next) {
  try {
    const lead = await Lead.findById(req.params.id).lean();
    if (!lead) {
      return res.status(404).json({ success: false, error: "Lead not found" });
    }

    return res.json({ success: true, lead });
  } catch (error) {
    next(error);
  }
}

export async function releaseTrialLead(req, res, next) {
  try {
    const released = await releaseNumberForLead(req.params.id, "released_early");

    if (!released) {
      return res.status(404).json({
        success: false,
        error: "No active trial number found for this lead",
      });
    }

    return res.json({
      success: true,
      message: "Trial number released",
      number: released.displayNumber,
    });
  } catch (error) {
    next(error);
  }
}
