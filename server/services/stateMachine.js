/**
 * Conversation State Machine Service
 *
 * Implements EXPLICIT state tracking (Bolna.ai style):
 * - Backend OWNS the state machine
 * - State is advanced EXPLICITLY, not inferred
 * - ALL RULES enforced in backend code, NOT in LLM prompt
 * - LLM never gets a chance to violate rules
 *
 * EXPLICIT STATE STRUCTURE (Non-Negotiable):
 * {
 *   currentStepId: "collect_pincode",
 *   stepIndex: 4,
 *   useCase: "automotive_sales",
 *   language: "hi",
 *   locked: true,
 *   ...
 * }
 */

import promptBuilder from "./promptBuilder.js";

// In-memory state storage (per conversation)
// In production, use Redis or database for persistence
const conversationStates = new Map();

// ============================================================================
// RULE ENFORCEMENT CONFIGURATION
// ============================================================================

const RULES = {
  MAX_RETRIES: 2, // Escalate to human after 2 retries
  MAX_CONFIRMATION_ATTEMPTS: 1, // Confirm details only once
  ALLOW_LANGUAGE_SWITCH: true, // Can be locked per conversation
  ALLOW_STEP_SKIP: false, // Never allow skipping steps
  AUTO_ESCALATE_ON_FRUSTRATION: true, // Detect frustration and escalate
};

// Frustration keywords that trigger escalation
const FRUSTRATION_KEYWORDS = [
  "talk to human",
  "real person",
  "agent",
  "supervisor",
  "manager",
  "this is useless",
  "not helping",
  "frustrated",
  "angry",
  "stop asking",
  "already told you",
  "i said",
  "i already",
  "इंसान से बात",
  "असली व्यक्ति",
  "मदद नहीं",
];

// ============================================================================
// STATE INITIALIZATION
// ============================================================================

/**
 * Initialize conversation state for a new session
 * Creates EXPLICIT state - no inference allowed
 *
 * @param {string} sessionId - Unique session identifier
 * @param {string} agentScript - Agent's script/prompt to parse into steps
 * @param {object} agentConfig - Agent configuration (name, tone, etc.)
 * @returns {object} Initial state
 */
export function initializeState(sessionId, agentScript = "", agentConfig = {}) {
  // Parse agent script into steps
  const steps = promptBuilder.parseAgentScriptToSteps(agentScript);

  // EXPLICIT STATE - Every field is explicitly set, not inferred
  const state = {
    // === SESSION IDENTITY ===
    sessionId,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),

    // === EXPLICIT STEP STATE (Non-Negotiable) ===
    currentStepId: steps[0]?.id || "greeting",
    stepIndex: 0,
    useCase: agentConfig.useCase || "general",
    language: agentConfig.language || "en",
    languageLocked: false, // If true, language cannot be changed

    // === FLOW DEFINITION ===
    steps: steps.map((s) => s.id),
    stepDetails: steps,
    totalSteps: steps.length,

    // === COMPLETION TRACKING (Explicit, not inferred) ===
    completedSteps: [],
    forbiddenSteps: [], // Steps that cannot be revisited

    // === COLLECTED DATA ===
    customerData: {},
    dataConfirmed: {}, // { name: true, phone: true } - what's been confirmed

    // === RETRY & ERROR HANDLING ===
    currentStepRetryCount: 0,
    totalRetryCount: 0,
    maxRetries: RULES.MAX_RETRIES,

    // === CONFIRMATION TRACKING ===
    confirmationCount: 0,
    maxConfirmations: RULES.MAX_CONFIRMATION_ATTEMPTS,

    // === FLAGS (Backend-enforced) ===
    isEscalated: false, // Transferred to human
    isCompleted: false, // Flow finished
    isLocked: false, // Conversation locked (no more changes)
    frustrationDetected: false,

    // === AGENT CONFIG ===
    agentConfig: {
      name: agentConfig.name || "Ava",
      tone: agentConfig.tone || "polite, warm, human-like",
      languages: agentConfig.languages || ["English", "Hindi"],
      style: agentConfig.style || "short, clear, one question at a time",
      companyName: agentConfig.companyName || "",
    },
  };

  conversationStates.set(sessionId, state);

  console.log(`🆕 State initialized for session ${sessionId}:`);
  console.log(`   Steps: ${state.steps.join(" → ")}`);
  console.log(`   Current: ${state.currentStepId} (index ${state.stepIndex})`);
  console.log(`   UseCase: ${state.useCase}`);

  return state;
}

/**
 * Get current conversation state
 */
export function getState(sessionId) {
  return conversationStates.get(sessionId) || null;
}

/**
 * Get or create state for a session
 */
export function getOrCreateState(
  sessionId,
  agentScript = "",
  agentConfig = {}
) {
  const existing = getState(sessionId);
  if (existing) {
    return existing;
  }
  return initializeState(sessionId, agentScript, agentConfig);
}

/**
 * Save state (explicit save, not auto-save)
 */
function saveState(sessionId, state) {
  state.lastUpdated = new Date().toISOString();
  conversationStates.set(sessionId, state);
  return state;
}

// ============================================================================
// RULE ENFORCEMENT FUNCTIONS
// These prevent rule violations BEFORE LLM is called
// ============================================================================

/**
 * Forbid a step from being revisited
 * Used after data is collected (e.g., don't ask name again)
 *
 * @param {string} sessionId - Session identifier
 * @param {string} stepId - Step to forbid
 */
export function forbidStep(sessionId, stepId) {
  const state = getState(sessionId);
  if (!state) return;

  if (!state.forbiddenSteps.includes(stepId)) {
    state.forbiddenSteps.push(stepId);
    console.log(`🚫 Step forbidden: ${stepId}`);
  }

  saveState(sessionId, state);
}

/**
 * Check if a step is forbidden
 */
export function isStepForbidden(sessionId, stepId) {
  const state = getState(sessionId);
  if (!state) return false;
  return state.forbiddenSteps.includes(stepId);
}

/**
 * Lock the conversation language (no more switches allowed)
 */
export function lockLanguage(sessionId) {
  const state = getState(sessionId);
  if (!state) return;

  state.languageLocked = true;
  console.log(`🔒 Language locked to: ${state.language}`);
  saveState(sessionId, state);
}

/**
 * Force a specific language (override any switch requests)
 */
export function forceLanguage(sessionId, langCode) {
  const state = getState(sessionId);
  if (!state) return state;

  state.language = langCode;
  console.log(`🌐 Language forced to: ${langCode}`);
  return saveState(sessionId, state);
}

/**
 * Check if language switch is allowed
 */
export function canSwitchLanguage(sessionId) {
  const state = getState(sessionId);
  if (!state) return true;
  return !state.languageLocked && RULES.ALLOW_LANGUAGE_SWITCH;
}

/**
 * Escalate to human agent
 * Called when max retries exceeded or frustration detected
 */
export function escalateToHuman(sessionId, reason = "max_retries") {
  const state = getState(sessionId);
  if (!state) return null;

  state.isEscalated = true;
  state.escalationReason = reason;
  state.escalatedAt = new Date().toISOString();

  console.log(`🚨 ESCALATED to human: ${reason}`);
  return saveState(sessionId, state);
}

/**
 * Check if escalation is needed based on retry count
 */
export function shouldEscalate(sessionId) {
  const state = getState(sessionId);
  if (!state) return false;

  // Already escalated
  if (state.isEscalated) return false;

  // Max retries exceeded
  if (state.currentStepRetryCount >= state.maxRetries) {
    return { should: true, reason: "max_retries_exceeded" };
  }

  // Frustration detected
  if (state.frustrationDetected) {
    return { should: true, reason: "frustration_detected" };
  }

  return { should: false };
}

/**
 * Detect frustration in user message
 */
export function detectFrustration(sessionId, userMessage) {
  if (!RULES.AUTO_ESCALATE_ON_FRUSTRATION) return false;

  const state = getState(sessionId);
  if (!state) return false;

  const messageLower = userMessage.toLowerCase();
  const frustrated = FRUSTRATION_KEYWORDS.some((keyword) =>
    messageLower.includes(keyword.toLowerCase())
  );

  if (frustrated) {
    state.frustrationDetected = true;
    saveState(sessionId, state);
    console.log(`😤 Frustration detected in message`);
  }

  return frustrated;
}

/**
 * Check if confirmation is allowed (only once per conversation)
 */
export function canConfirm(sessionId) {
  const state = getState(sessionId);
  if (!state) return true;
  return state.confirmationCount < state.maxConfirmations;
}

/**
 * Mark confirmation as done (forbid future confirmations)
 */
export function markConfirmationDone(sessionId) {
  const state = getState(sessionId);
  if (!state) return;

  state.confirmationCount++;
  if (state.confirmationCount >= state.maxConfirmations) {
    forbidStep(sessionId, "confirm_details");
  }

  saveState(sessionId, state);
}

// ============================================================================
// EXPLICIT STATE ADVANCEMENT
// State is ONLY advanced through these functions, NEVER inferred
// ============================================================================

/**
 * EXPLICITLY advance to the next step
 * This is the ONLY way to move forward
 *
 * ❌ NEVER infer step from data
 * ✅ ALWAYS use this function
 */
export function advanceStep(sessionId) {
  const state = getState(sessionId);
  if (!state) {
    throw new Error(`No state found for session ${sessionId}`);
  }

  // Don't advance if escalated or completed
  if (state.isEscalated || state.isCompleted) {
    console.log(
      `⚠️ Cannot advance - conversation ${
        state.isEscalated ? "escalated" : "completed"
      }`
    );
    return state;
  }

  // Mark current step as completed and forbidden (can't revisit)
  if (!state.completedSteps.includes(state.currentStepId)) {
    state.completedSteps.push(state.currentStepId);
  }
  forbidStep(sessionId, state.currentStepId);

  // Reset retry count for new step
  state.currentStepRetryCount = 0;

  // EXPLICITLY set next step
  state.stepIndex++;

  // Check if flow is complete
  if (state.stepIndex >= state.totalSteps) {
    state.isCompleted = true;
    state.currentStepId = "flow_complete";
    console.log(`✅ Flow COMPLETE for session ${sessionId}`);
  } else {
    // EXPLICITLY set current step (NOT inferred!)
    const nextStep = state.stepDetails[state.stepIndex];
    state.currentStepId = nextStep?.id || state.steps[state.stepIndex];

    console.log(
      `➡️ ADVANCED to step ${state.stepIndex}: ${state.currentStepId}`
    );
  }

  return saveState(sessionId, state);
}

/**
 * EXPLICITLY go to a specific step by ID
 * Used for jumps (e.g., error handling, special flows)
 */
export function goToStep(sessionId, stepId) {
  const state = getState(sessionId);
  if (!state) {
    throw new Error(`No state found for session ${sessionId}`);
  }

  // Check if step is forbidden
  if (isStepForbidden(sessionId, stepId)) {
    console.log(`🚫 Cannot go to forbidden step: ${stepId}`);
    return state;
  }

  // Check if step skip is allowed
  const stepIndex = state.steps.indexOf(stepId);
  if (stepIndex === -1) {
    console.warn(`⚠️ Step ${stepId} not found in flow`);
    return state;
  }

  // EXPLICITLY set step state
  state.stepIndex = stepIndex;
  state.currentStepId = stepId;
  state.currentStepRetryCount = 0;

  console.log(`🔀 JUMPED to step: ${stepId} (index ${stepIndex})`);
  return saveState(sessionId, state);
}

/**
 * Increment retry counter for current step
 * Backend enforces max retries
 */
export function incrementRetry(sessionId) {
  const state = getState(sessionId);
  if (!state) {
    throw new Error(`No state found for session ${sessionId}`);
  }

  state.currentStepRetryCount++;
  state.totalRetryCount++;
  saveState(sessionId, state);

  const maxRetriesExceeded = state.currentStepRetryCount >= state.maxRetries;

  console.log(
    `🔄 Retry ${state.currentStepRetryCount}/${state.maxRetries} for ${state.currentStepId}`
  );

  // Auto-escalate if max retries exceeded
  if (maxRetriesExceeded) {
    escalateToHuman(sessionId, "max_retries_exceeded");
  }

  return {
    state,
    maxRetriesExceeded,
    retryCount: state.currentStepRetryCount,
  };
}

// ============================================================================
// DATA MANAGEMENT
// ============================================================================

/**
 * Update customer data and auto-forbid related collection steps
 */
export function updateCustomerData(sessionId, newData) {
  const state = getState(sessionId);
  if (!state) {
    throw new Error(`No state found for session ${sessionId}`);
  }

  // Merge new data with existing
  const previousData = { ...state.customerData };
  state.customerData = {
    ...state.customerData,
    ...newData,
  };

  // Auto-forbid steps for data that's been collected
  // ❌ This is NOT inference - this is rule enforcement
  if (newData.name && !previousData.name) {
    forbidStep(sessionId, "collect_name");
    state.dataConfirmed.name = false; // Not yet confirmed
    console.log(`✅ Name collected: ${newData.name} → collect_name FORBIDDEN`);
  }

  if (newData.phone && !previousData.phone) {
    forbidStep(sessionId, "collect_phone");
    state.dataConfirmed.phone = false;
    console.log(
      `✅ Phone collected: ${newData.phone} → collect_phone FORBIDDEN`
    );
  }

  if (newData.pincode && !previousData.pincode) {
    forbidStep(sessionId, "collect_pincode");
    state.dataConfirmed.pincode = false;
    console.log(
      `✅ Pincode collected: ${newData.pincode} → collect_pincode FORBIDDEN`
    );
  }

  if (newData.email && !previousData.email) {
    forbidStep(sessionId, "collect_email");
    state.dataConfirmed.email = false;
    console.log(
      `✅ Email collected: ${newData.email} → collect_email FORBIDDEN`
    );
  }

  if (newData.address && !previousData.address) {
    forbidStep(sessionId, "collect_address");
    state.dataConfirmed.address = false;
    console.log(
      `✅ Address collected: ${newData.address} → collect_address FORBIDDEN`
    );
  }

  if (newData.model && !previousData.model) {
    forbidStep(sessionId, "collect_model");
    state.dataConfirmed.model = false;
    console.log(
      `✅ Model collected: ${newData.model} → collect_model FORBIDDEN`
    );
  }

  return saveState(sessionId, state);
}

/**
 * Set conversation language (with lock check)
 */
export function setLanguage(sessionId, langCode) {
  const state = getState(sessionId);
  if (!state) {
    throw new Error(`No state found for session ${sessionId}`);
  }

  // Enforce language lock
  if (state.languageLocked) {
    console.log(`🔒 Language locked - ignoring switch to ${langCode}`);
    return state;
  }

  state.language = langCode;
  console.log(`🌐 Language set to: ${langCode}`);
  return saveState(sessionId, state);
}

// ============================================================================
// STATE QUERIES
// ============================================================================

/**
 * Get the current step instruction
 * This is what gets sent to the LLM
 */
export function getCurrentStepConfig(sessionId, userMessage = "") {
  const state = getState(sessionId);
  if (!state) {
    return {
      stepId: "greeting",
      instruction: "Greet the customer and ask how you can help.",
      language: "en",
      customerData: {},
      userMessage,
    };
  }

  // Get current step details
  const currentStep = state.stepDetails[state.stepIndex];

  return {
    stepId: state.currentStepId,
    instruction:
      currentStep?.instruction ||
      currentStep?.originalText ||
      "Continue the conversation.",
    language: state.language,
    customerData: state.customerData,
    userMessage,
  };
}

/**
 * Get what data the current step should collect
 */
export function getCurrentStepRequirements(sessionId) {
  const state = getState(sessionId);
  if (!state) return [];

  const currentStep = state.stepDetails[state.stepIndex];
  return currentStep?.collectsData || [];
}

/**
 * Check if flow is complete
 */
export function isFlowComplete(sessionId) {
  const state = getState(sessionId);
  if (!state) return false;
  return state.isCompleted || state.currentStepId === "flow_complete";
}

/**
 * Check if conversation is escalated
 */
export function isEscalated(sessionId) {
  const state = getState(sessionId);
  if (!state) return false;
  return state.isEscalated;
}

/**
 * Destroy session state (cleanup)
 */
export function destroyState(sessionId) {
  conversationStates.delete(sessionId);
  console.log(`🗑️ State destroyed for session ${sessionId}`);
}

/**
 * Get EXPLICIT state summary (for debugging/API response)
 */
export function getStateSummary(sessionId) {
  const state = getState(sessionId);
  if (!state) return null;

  return {
    // EXPLICIT STEP STATE (Non-Negotiable)
    currentStepId: state.currentStepId,
    stepIndex: state.stepIndex,
    useCase: state.useCase,
    language: state.language,
    languageLocked: state.languageLocked,

    // Progress
    completedSteps: state.completedSteps,
    forbiddenSteps: state.forbiddenSteps,
    remainingSteps: state.steps.slice(state.stepIndex + 1),
    progress: `${state.stepIndex + 1}/${state.totalSteps}`,

    // Data
    customerData: state.customerData,
    dataConfirmed: state.dataConfirmed,

    // Status
    isComplete: state.isCompleted,
    isEscalated: state.isEscalated,
    escalationReason: state.escalationReason,

    // Retries
    currentStepRetryCount: state.currentStepRetryCount,
    totalRetryCount: state.totalRetryCount,
  };
}

// ============================================================================
// PRE-LLM ENFORCEMENT
// Call this BEFORE sending anything to LLM
// ============================================================================

/**
 * Run all rule checks before calling LLM
 * Returns instructions for how to proceed
 *
 * @param {string} sessionId - Session ID
 * @param {string} userMessage - What user said
 * @param {string} requestedLanguage - Requested language switch (if any)
 * @returns {object} Enforcement result
 */
export function enforceRulesBeforeLLM(
  sessionId,
  userMessage,
  requestedLanguage = null
) {
  const state = getState(sessionId);
  if (!state) {
    return { proceed: true, action: null };
  }

  // 1. Check if already escalated
  if (state.isEscalated) {
    return {
      proceed: false,
      action: "already_escalated",
      response: "You're being transferred to a human agent. Please hold.",
    };
  }

  // 2. Check if flow is complete
  if (state.isCompleted) {
    return {
      proceed: false,
      action: "flow_complete",
      response:
        "Thank you for your time. Is there anything else I can help you with?",
    };
  }

  // 3. Check for frustration
  if (detectFrustration(sessionId, userMessage)) {
    escalateToHuman(sessionId, "frustration_detected");
    return {
      proceed: false,
      action: "escalate_frustration",
      response:
        "I understand your frustration. Let me connect you with a human agent who can better assist you.",
    };
  }

  // 4. Enforce language lock
  let effectiveLanguage = state.language;
  if (requestedLanguage && !canSwitchLanguage(sessionId)) {
    console.log(`🔒 Language switch to ${requestedLanguage} BLOCKED (locked)`);
    effectiveLanguage = state.language; // Force current language
  } else if (requestedLanguage) {
    setLanguage(sessionId, requestedLanguage);
    effectiveLanguage = requestedLanguage;
  }

  // 5. Check if current step is forbidden (shouldn't happen if logic is correct)
  if (isStepForbidden(sessionId, state.currentStepId)) {
    console.log(
      `⚠️ Current step ${state.currentStepId} is forbidden - advancing`
    );
    advanceStep(sessionId);
  }

  // 6. Check if should escalate due to retries
  const escalationCheck = shouldEscalate(sessionId);
  if (escalationCheck.should) {
    escalateToHuman(sessionId, escalationCheck.reason);
    return {
      proceed: false,
      action: "escalate_retries",
      response:
        "I'm having trouble understanding. Let me connect you with a human agent.",
    };
  }

  return {
    proceed: true,
    action: null,
    effectiveLanguage,
    state: getStateSummary(sessionId),
  };
}

export default {
  // Initialization
  initializeState,
  getState,
  getOrCreateState,

  // Rule Enforcement
  forbidStep,
  isStepForbidden,
  lockLanguage,
  forceLanguage,
  canSwitchLanguage,
  escalateToHuman,
  shouldEscalate,
  detectFrustration,
  canConfirm,
  markConfirmationDone,
  enforceRulesBeforeLLM,

  // Explicit State Advancement
  advanceStep,
  goToStep,
  incrementRetry,

  // Data Management
  updateCustomerData,
  setLanguage,

  // Queries
  getCurrentStepConfig,
  getCurrentStepRequirements,
  isFlowComplete,
  isEscalated,
  destroyState,
  getStateSummary,

  // Config
  RULES,
};
