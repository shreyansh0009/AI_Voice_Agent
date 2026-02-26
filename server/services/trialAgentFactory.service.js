import Agent from "../models/Agent.js";

const INDUSTRY_TO_DOMAIN = {
  automobile: "automotive",
  automotive: "automotive",
  auto: "automotive",
  finance: "finance",
  bfsi: "finance",
  "real-estate": "real-estate",
  "real estate": "real-estate",
  real_estate: "real-estate",
  realestate: "real-estate",
};

const DOMAIN_DEFAULTS = {
  automotive: {
    flowId: "automotive_sales",
    welcome:
      "Namaste! I am your automotive assistant. I can help with inquiries, bookings, and quick support. How can I help you today?",
    prompt:
      "You are a professional automotive voice assistant for India. Keep responses concise (2-3 sentences), gather customer details, qualify requirements, and guide to next steps clearly.",
  },
  finance: {
    flowId: "finance_leads",
    welcome:
      "Hello! I am your finance assistant. I can help with loans, insurance, and account-related guidance. How may I assist you?",
    prompt:
      "You are a professional finance voice assistant for India. Keep responses concise (2-3 sentences), collect required details, clarify intent, and guide users toward the right service.",
  },
  "real-estate": {
    flowId: "real_estate_sales",
    welcome:
      "Namaste! I am your property assistant. I can help with property inquiries, site visits, and follow-ups. What are you looking for?",
    prompt:
      "You are a professional real-estate voice assistant for India. Keep responses concise (2-3 sentences), understand budget/location requirements, and move the user to clear next steps.",
  },
  general: {
    flowId: "automotive_sales",
    welcome:
      "Hello! I am your AI assistant. I can help with your queries and guide you to the right next step.",
    prompt:
      "You are a helpful voice assistant. Keep responses concise (2-3 sentences), collect key information, and guide users toward practical next actions.",
  },
};

const PREBUILT_TASKS = {
  "inbound-support": {
    name: "Inbound Support Agent",
    instruction:
      "Primary goal: answer inbound support questions, resolve basic issues, and escalate complex cases.",
  },
  "appt-booking": {
    name: "Appointment Booking Agent",
    instruction:
      "Primary goal: capture intent and book appointments with available time slots.",
  },
  collections: {
    name: "Collections Agent",
    instruction:
      "Primary goal: handle payment reminders, collections follow-ups, and extension requests politely.",
  },
  "lead-qual": {
    name: "Lead Qualification Agent",
    instruction:
      "Primary goal: qualify incoming leads, capture budget and timeline, and route qualified leads.",
  },
  "order-delivery": {
    name: "Order Delivery Agent",
    instruction:
      "Primary goal: provide order status updates, delivery ETAs, and return initiation guidance.",
  },
  "post-call-survey": {
    name: "Post-Call Survey Agent",
    instruction:
      "Primary goal: collect feedback and CSAT/NPS with short follow-up questions.",
  },
  escalation: {
    name: "Escalation Agent",
    instruction:
      "Primary goal: detect high-priority cases and hand off to human teams with context.",
  },
  custom: {
    name: "Custom Agent",
    instruction:
      "Primary goal: handle user-defined workflows and collect details accurately.",
  },
};

function normalizeVoiceSelection(rawPreference = "") {
  const [voiceGender = "female", voiceName = "priya"] = rawPreference.split(":");
  const normalizedGender = voiceGender === "male" ? "male" : "female";

  // Existing agents commonly use these Sarvam voice IDs.
  const maleVoiceMap = {
    arjun: "abhilash",
    james: "abhilash",
    vikram: "abhilash",
    rajan: "abhilash",
    kiran: "abhilash",
  };
  const femaleVoiceMap = {
    priya: "manisha",
    sofia: "manisha",
    ananya: "manisha",
    meera: "manisha",
    kavya: "manisha",
  };

  const map = normalizedGender === "male" ? maleVoiceMap : femaleVoiceMap;
  return {
    gender: normalizedGender,
    voice: map[voiceName] || (normalizedGender === "male" ? "abhilash" : "manisha"),
  };
}

function resolveDomain(normalizedIndustry) {
  return INDUSTRY_TO_DOMAIN[normalizedIndustry] || "general";
}

async function resolveOwnerUserId() {
  if (process.env.TRIAL_AGENT_USER_ID) {
    return process.env.TRIAL_AGENT_USER_ID;
  }

  const defaultAgentId = process.env.DEFAULT_TRIAL_AGENT_ID;
  if (defaultAgentId) {
    const defaultAgent = await Agent.findById(defaultAgentId).select("userId");
    if (defaultAgent?.userId) return defaultAgent.userId;
  }

  const anyAgent = await Agent.findOne({ userId: { $ne: null } })
    .sort({ createdAt: 1 })
    .select("userId");
  if (anyAgent?.userId) return anyAgent.userId;

  return null;
}

function buildAgentName({ industry, taskName, leadName }) {
  const cleanLead = (leadName || "Lead").toString().trim().split(/\s+/)[0];
  const industryLabel = (industry || "general")
    .toString()
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const timestamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
  return `${industryLabel} ${taskName} - ${cleanLead}-${timestamp}`;
}

export async function createTrialAgent({
  normalizedIndustry,
  prebuiltAgentType,
  leadName,
  callGoal,
  bizContext,
  voicePreference,
}) {
  const ownerUserId = await resolveOwnerUserId();
  if (!ownerUserId) {
    throw new Error(
      "No owner user configured for trial agents. Set TRIAL_AGENT_USER_ID.",
    );
  }

  const domain = resolveDomain(normalizedIndustry);
  const domainDefaults = DOMAIN_DEFAULTS[domain] || DOMAIN_DEFAULTS.general;
  const task = PREBUILT_TASKS[prebuiltAgentType] || PREBUILT_TASKS.custom;
  const voiceSelection = normalizeVoiceSelection(voicePreference);
  const agentName = buildAgentName({
    industry: normalizedIndustry,
    taskName: task.name,
    leadName,
  });

  const extraGoal = callGoal ? `\nAdditional objective: ${callGoal}` : "";
  const extraContext = bizContext ? `\nBusiness context: ${bizContext}` : "";

  const prompt = `${domainDefaults.prompt}
${task.instruction}
${extraGoal}
${extraContext}

Always confirm next steps and keep responses practical for voice conversation.`;

  const newAgent = await Agent.create({
    userId: ownerUserId,
    name: agentName,
    domain,
    status: "active",
    flowId: domainDefaults.flowId,
    welcome: domainDefaults.welcome,
    prompt,
    llmProvider: "Openai",
    llmModel: "gpt-4o-mini",
    voiceProvider: "Sarvam",
    voice: voiceSelection.voice,
  });

  return newAgent;
}

