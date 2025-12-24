/**
 * Prompt Builder Service - MINIMAL PROMPTS ONLY
 *
 * CRITICAL: LLM SEES ONLY THE CURRENT STEP
 *
 * OUTPUT CONTRACT (STRICT):
 * LLM MUST return: {"spoken_text": "...", "language": "en"}
 * EVERYTHING ELSE IS DISCARDED.
 *
 * ❌ NO future steps
 * ❌ NO past steps
 * ❌ NO summaries
 * ❌ NO collected data display
 * ❌ NO rules
 * ❌ NO examples
 *
 * ✅ ONLY: Current step instruction + JSON output
 *
 * TOTAL: < 100 tokens
 */

// ============================================================================
// PROMPT TYPE A: SYSTEM PROMPT (WITH JSON CONTRACT)
// ============================================================================

/**
 * Get the universal system prompt
 * Enforces STRICT JSON OUTPUT
 *
 * @returns {string} The static system prompt
 */
export function getSystemPrompt() {
  return `You are a voice agent. You MUST respond ONLY with valid JSON in this exact format:
{"spoken_text": "your sentence here", "language": "en"}

Rules:
- spoken_text: The exact sentence to speak. Nothing else.
- language: 2-letter code (en, hi, ta, te, etc.)
- No explanations. No extra text. Only JSON.`;
}

// ============================================================================
// PROMPT TYPE B: PERSONA PROMPT (MINIMAL)
// ============================================================================

/**
 * Build minimal persona prompt
 * ONLY: name, tone, style
 * NO: rules, examples, do's/don'ts
 *
 * @param {object} agentConfig - Agent configuration
 * @returns {string} Minimal persona (< 20 tokens)
 */
export function buildPersonaPrompt(agentConfig = {}) {
  const { name = "Ava", tone = "warm", style = "short" } = agentConfig;

  return `Name: ${name}. Tone: ${tone}. Style: ${style}.`;
}

// ============================================================================
// PROMPT TYPE C: STEP PROMPT (ULTRA-MINIMAL)
// ============================================================================

/**
 * Build the step prompt - ONLY the current instruction
 *
 * ❌ NO future steps
 * ❌ NO past steps
 * ❌ NO collected data
 * ❌ NO context
 *
 * @param {object} stepConfig - Current step only
 * @returns {string} Single instruction (< 20 tokens)
 */
export function buildStepPrompt(stepConfig = {}) {
  const {
    instruction = "Greet the customer.",
    language = "en",
    customerName = null, // Only pass name if needed for personalization
  } = stepConfig;

  // Build minimal instruction
  let prompt = instruction;

  // Add language instruction if not English
  if (language !== "en") {
    const langNames = {
      hi: "Hindi",
      ta: "Tamil",
      te: "Telugu",
      kn: "Kannada",
      ml: "Malayalam",
      bn: "Bengali",
      mr: "Marathi",
      gu: "Gujarati",
      pa: "Punjabi",
    };
    prompt += ` Respond in ${langNames[language] || "English"}.`;
  }

  // Add name for personalization if available (only name, nothing else)
  if (customerName) {
    prompt += ` Address them as ${customerName}.`;
  }

  return prompt;
}

// ============================================================================
// COMBINED PROMPT BUILDER (ULTRA-MINIMAL)
// ============================================================================

/**
 * Build the complete prompt - MINIMAL, NO CONTEXT
 *
 * @param {object} config - Configuration
 * @returns {object} Messages array for OpenAI
 */
export function buildConversationPrompt(config) {
  const { agentConfig = {}, stepConfig = {} } = config;

  // System prompt: identity only
  const systemPrompt = getSystemPrompt();

  // Persona: minimal traits
  const personaPrompt = buildPersonaPrompt(agentConfig);

  // Step: current instruction only
  const stepPrompt = buildStepPrompt(stepConfig);

  // Combine system + persona (still under 50 tokens)
  const combinedSystem = `${systemPrompt} ${personaPrompt}`;

  // Step instruction is the user message
  const userMessage = stepPrompt;

  // Calculate actual token count (rough estimate: ~1 token per 4 chars)
  const totalChars = combinedSystem.length + userMessage.length;
  const estimatedTokens = Math.ceil(totalChars / 4);

  return {
    messages: [
      { role: "system", content: combinedSystem },
      { role: "user", content: userMessage },
    ],
    metadata: {
      systemTokens: Math.ceil(combinedSystem.length / 4),
      stepTokens: Math.ceil(userMessage.length / 4),
      totalTokens: estimatedTokens,
    },
  };
}

// ============================================================================
// STEP INSTRUCTION TEMPLATES
// Pre-defined instructions for common steps
// ============================================================================

export const STEP_INSTRUCTIONS = {
  // Greeting
  greeting: "Greet warmly and ask how you can help.",

  // Data Collection
  collect_name: "Ask for their name.",
  collect_phone: "Ask for their 10-digit mobile number.",
  collect_pincode: "Ask for their 6-digit pincode.",
  collect_email: "Ask for their email address.",
  collect_address: "Ask for their address.",
  collect_model: "Ask which model or product interests them.",

  // Confirmation
  confirm_details: "Confirm the booking details.",

  // Actions
  book_appointment: "Tell them you are booking their appointment.",
  transfer_agent: "Tell them you are connecting to a human agent.",

  // Closing
  closing: "Thank them and say goodbye.",

  // Retries
  retry_phone:
    "That doesn't seem like a valid phone number. Ask again for 10 digits.",
  retry_pincode:
    "That doesn't seem like a valid pincode. Ask again for 6 digits.",
  retry_email: "That doesn't seem like a valid email. Ask again.",
  retry_unclear: "You didn't catch that. Ask them to repeat.",
};

/**
 * Get instruction for a step
 */
export function getStepInstruction(stepId, customInstruction = null) {
  // Use custom instruction if provided
  if (customInstruction && customInstruction.length > 5) {
    return customInstruction;
  }

  // Use template instruction
  return STEP_INSTRUCTIONS[stepId] || "Continue the conversation.";
}

// ============================================================================
// STEP PROMPT V2 (EXACT SPEC - ONE INSTRUCTION ONLY)
// ============================================================================

/**
 * Build step prompt V2 - EXACT SPEC
 *
 * ❌ NO memory
 * ❌ NO flow logic
 * ❌ NO rules
 * ❌ NO examples
 * ❌ NO history
 * ❌ NO warnings
 *
 * LLM is now a TEXT-TO-SPEECH assistant, nothing more.
 *
 * @param {string} stepText - The exact sentence to speak
 * @returns {string} Minimal prompt with JSON output format
 */
export function buildStepPromptV2(stepText) {
  return `You are a voice agent.

RULES:
- Respond ONLY in JSON.
- Do NOT add explanations.
- Do NOT add greetings.

JSON FORMAT:
{
  "type": "SPEAK",
  "text": "<sentence>"
}

Sentence:
"${stepText}"
`;
}

/**
 * Build the MINIMAL prompt for LLM
 * This is the ONLY prompt needed for flow execution
 *
 * @param {string} text - Text to speak
 * @param {boolean} isRetry - Is this a retry attempt?
 * @returns {string} Minimal prompt
 */
export function buildMinimalPrompt(text, isRetry = false) {
  if (isRetry) {
    // Stricter prompt for retries
    return `STRICT: Output ONLY this JSON:
{"type":"SPEAK","text":"${text}"}

NO other text allowed.`;
  }

  return buildStepPromptV2(text);
}

// ============================================================================
// FLOW PARSER (LEGACY - Use JSON flows instead)
// ============================================================================

/**
 * Parse an agent's script into discrete steps
 * Returns array of step objects with IDs and instructions
 */
export function parseAgentScriptToSteps(agentScript) {
  if (!agentScript || typeof agentScript !== "string") {
    return getDefaultFlow();
  }

  const steps = [];
  const lines = agentScript.split("\n");

  // Patterns to detect steps
  const numberedPattern = /^\s*(\d+)[.)]\s+(.+)/;
  const stepPattern = /^\s*(?:step|STEP)\s*(\d+)[:\-]\s*(.+)/i;

  for (const line of lines) {
    const numberedMatch = line.match(numberedPattern);
    const stepMatch = line.match(stepPattern);

    if (numberedMatch) {
      const stepText = numberedMatch[2].trim();
      steps.push(createStepFromText(stepText, steps.length));
    } else if (stepMatch) {
      const stepText = stepMatch[2].trim();
      steps.push(createStepFromText(stepText, steps.length));
    }
  }

  // If no steps found, return default flow
  if (steps.length === 0) {
    return getDefaultFlow();
  }

  return steps;
}

/**
 * Get default conversation flow
 */
function getDefaultFlow() {
  return [
    {
      id: "greeting",
      index: 0,
      instruction: STEP_INSTRUCTIONS.greeting,
      collectsData: [],
    },
    {
      id: "collect_name",
      index: 1,
      instruction: STEP_INSTRUCTIONS.collect_name,
      collectsData: ["name"],
    },
    {
      id: "collect_phone",
      index: 2,
      instruction: STEP_INSTRUCTIONS.collect_phone,
      collectsData: ["phone"],
    },
    {
      id: "closing",
      index: 3,
      instruction: STEP_INSTRUCTIONS.closing,
      collectsData: [],
    },
  ];
}

/**
 * Create a step object from parsed text
 */
function createStepFromText(text, index) {
  const textLower = text.toLowerCase();

  let id = `step_${index}`;
  let instruction = text;
  let collectsData = [];

  // Detect step type and set minimal instruction
  if (textLower.includes("greet") || textLower.includes("welcome")) {
    id = "greeting";
    instruction = STEP_INSTRUCTIONS.greeting;
  } else if (
    textLower.includes("name") &&
    (textLower.includes("ask") || textLower.includes("get"))
  ) {
    id = "collect_name";
    instruction = STEP_INSTRUCTIONS.collect_name;
    collectsData = ["name"];
  } else if (
    textLower.includes("phone") ||
    textLower.includes("mobile") ||
    textLower.includes("number")
  ) {
    id = "collect_phone";
    instruction = STEP_INSTRUCTIONS.collect_phone;
    collectsData = ["phone"];
  } else if (
    textLower.includes("pincode") ||
    textLower.includes("pin code") ||
    textLower.includes("zip")
  ) {
    id = "collect_pincode";
    instruction = STEP_INSTRUCTIONS.collect_pincode;
    collectsData = ["pincode"];
  } else if (textLower.includes("email")) {
    id = "collect_email";
    instruction = STEP_INSTRUCTIONS.collect_email;
    collectsData = ["email"];
  } else if (textLower.includes("address") || textLower.includes("location")) {
    id = "collect_address";
    instruction = STEP_INSTRUCTIONS.collect_address;
    collectsData = ["address"];
  } else if (
    textLower.includes("model") ||
    textLower.includes("product") ||
    textLower.includes("interested")
  ) {
    id = "collect_model";
    instruction = STEP_INSTRUCTIONS.collect_model;
    collectsData = ["model"];
  } else if (textLower.includes("confirm")) {
    id = "confirm_details";
    instruction = STEP_INSTRUCTIONS.confirm_details;
  } else if (
    textLower.includes("book") ||
    textLower.includes("schedule") ||
    textLower.includes("appointment")
  ) {
    id = "book_appointment";
    instruction = STEP_INSTRUCTIONS.book_appointment;
  } else if (
    textLower.includes("transfer") ||
    textLower.includes("connect") ||
    textLower.includes("agent")
  ) {
    id = "transfer_agent";
    instruction = STEP_INSTRUCTIONS.transfer_agent;
  } else if (
    textLower.includes("thank") ||
    textLower.includes("goodbye") ||
    textLower.includes("close")
  ) {
    id = "closing";
    instruction = STEP_INSTRUCTIONS.closing;
  }

  return {
    id,
    index,
    instruction,
    collectsData,
    originalText: text,
  };
}

// ============================================================================
// RETRY PROMPT BUILDER
// ============================================================================

/**
 * Get retry prompt for validation failure
 *
 * @param {string} fieldType - Field that failed validation
 * @param {string} errorMessage - Error from validator
 * @returns {string} Retry instruction
 */
export function getRetryPrompt(fieldType, errorMessage) {
  const retryMap = {
    phone: STEP_INSTRUCTIONS.retry_phone,
    pincode: STEP_INSTRUCTIONS.retry_pincode,
    email: STEP_INSTRUCTIONS.retry_email,
  };

  return retryMap[fieldType] || STEP_INSTRUCTIONS.retry_unclear;
}

export default {
  // Prompts
  getSystemPrompt,
  buildPersonaPrompt,
  buildStepPrompt,
  buildConversationPrompt,

  // Flow
  parseAgentScriptToSteps,
  getStepInstruction,
  getRetryPrompt,

  // Constants
  STEP_INSTRUCTIONS,
};
