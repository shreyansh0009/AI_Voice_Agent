/**
 * State Engine Service
 *
 * PURPOSE: The REAL BRAIN of the system
 *
 * RESPONSIBILITIES:
 * - Track conversation state
 * - Execute step transitions
 * - Enforce step order
 * - Handle retries
 * - Manage branching
 * - Determine completion
 *
 * ARCHITECTURE:
 * User Speech → [Intent + Slot Layer] → [State Engine] → [LLM (voice only)]
 *
 * DOES NOT:
 * - Load flows (uses flowRegistry)
 * - Call LLM (LLM has ZERO control here)
 * - Parse LLM output
 * - Build prompts
 *
 * KEY PRINCIPLE:
 * LLM has ZERO control here.
 * All decisions are deterministic.
 * State transitions are explicit.
 * Intent NEVER advances steps by itself.
 */

import flowRegistry from "./flowRegistry.js";
import inputValidator from "./inputValidator.js";
import intentClassifier from "./intentClassifier.js";
import slotExtractor from "./slotExtractor.js";

// ============================================================================
// STATE STORAGE
// ============================================================================

// Conversation states (in production, use Redis/DB)
const conversationStates = new Map();

// ============================================================================
// STATE STRUCTURE
// ============================================================================

/**
 * Conversation State Structure:
 * {
 *   conversationId: string,      // Unique session ID
 *   agentId: string,             // Agent identifier
 *   useCase: string,             // Flow use case
 *   currentStepId: string,       // Current step in flow
 *   language: string,            // Current language (en, hi, etc.)
 *   collectedData: {             // Data collected from user
 *     name: null,
 *     mobile: null,
 *     pincode: null,
 *     ...
 *   },
 *   retryCount: number,          // Retry attempts for current step
 *   status: string,              // "active" | "complete" | "escalated"
 *   createdAt: string,
 *   lastUpdated: string,
 * }
 */

// ============================================================================
// STATE INITIALIZATION
// ============================================================================

/**
 * Initialize a new conversation state
 *
 * @param {string} conversationId - Unique session identifier
 * @param {string} useCase - Use case to load
 * @param {object} options - { language, agentId }
 * @returns {object} Initial state
 */
export function initializeState(conversationId, useCase, options = {}) {
  const { language = "en", agentId = null } = options;

  // Get flow from registry
  const flow = flowRegistry.getFlow(useCase);
  if (!flow) {
    throw new Error(`Flow not found: ${useCase}`);
  }

  const state = {
    // Identity
    conversationId,
    agentId,
    useCase,

    // Current position
    currentStepId: flow.startStep,
    previousStepId: null,

    // Language
    language: language || flow.defaultLanguage || "en",

    // Collected data
    collectedData: {},

    // Retry tracking
    retryCount: 0,
    maxRetries: 2,

    // Status: "active" | "complete" | "escalated"
    status: "active",

    // Agent config (from flow)
    agentConfig: flow.agentConfig || {
      name: "Agent",
      tone: "professional",
      style: "short",
    },

    // Timestamps
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };

  conversationStates.set(conversationId, state);
  console.log(
    `🆕 State initialized: ${conversationId} → ${useCase} → ${state.currentStepId}`
  );

  return state;
}

/**
 * Get conversation state
 */
export function getState(conversationId) {
  return conversationStates.get(conversationId) || null;
}

/**
 * Get or create state
 */
export function getOrCreateState(conversationId, useCase, options = {}) {
  const existing = getState(conversationId);
  if (existing) {
    return existing;
  }
  return initializeState(conversationId, useCase, options);
}

/**
 * Save state (internal)
 */
function saveState(conversationId, state) {
  state.lastUpdated = new Date().toISOString();
  conversationStates.set(conversationId, state);
  return state;
}

/**
 * Destroy state
 */
export function destroyState(conversationId) {
  conversationStates.delete(conversationId);
  console.log(`🗑️ State destroyed: ${conversationId}`);
}

// ============================================================================
// STEP ACCESS
// ============================================================================

/**
 * Get current step from flow
 *
 * @param {object} state - Conversation state
 * @returns {object|null} Current step definition
 */
export function getCurrentStep(state) {
  if (!state) return null;
  return flowRegistry.getStep(state.useCase, state.currentStepId);
}

/**
 * Get current step text in current language
 *
 * @param {object} state - Conversation state
 * @param {boolean} isRetry - Use retry text if available
 * @returns {string|null} Text to speak
 */
export function getCurrentStepText(state, isRetry = false) {
  if (!state) return null;

  let text = flowRegistry.getStepText(
    state.useCase,
    state.currentStepId,
    state.language,
    isRetry
  );

  // Replace placeholders with collected data
  if (text) {
    text = replacePlaceholders(text, state.collectedData);
  }

  return text;
}

// ============================================================================
// STATE TRANSITIONS
// ============================================================================

/**
 * Advance to the next step
 *
 * This is the CORE function that moves the conversation forward.
 * LLM has ZERO control here - all decisions are deterministic.
 *
 * @param {string} conversationId - Conversation ID
 * @param {string} userInput - What the user said
 * @returns {object} { success, text, validationError, isEnd }
 */
export function advanceStep(conversationId, userInput) {
  const state = getState(conversationId);
  if (!state) {
    throw new Error(`State not found: ${conversationId}`);
  }

  const step = getCurrentStep(state);
  if (!step) {
    throw new Error(`Step not found: ${state.currentStepId}`);
  }

  // Handle based on step type
  switch (step.type) {
    case "message":
      // Message steps auto-advance
      return transitionTo(conversationId, step.next);

    case "input":
      return handleInputStep(conversationId, state, step, userInput);

    case "confirm":
      return handleConfirmStep(conversationId, state, step, userInput);

    case "intent":
      return handleIntentStep(conversationId, state, step, userInput);

    case "action":
      // Action steps auto-advance after execution
      return transitionTo(conversationId, step.next);

    default:
      console.warn(`⚠️ Unknown step type: ${step.type}`);
      return transitionTo(conversationId, step.next);
  }
}

/**
 * Handle input collection step
 */
function handleInputStep(conversationId, state, step, userInput) {
  const field = step.field;
  const validationType = step.validation;

  // Validate input using inputValidator
  const validation = inputValidator.validateField(validationType, userInput);

  if (!validation.valid) {
    // Validation failed - increment retry
    state.retryCount++;
    saveState(conversationId, state);

    console.log(
      `❌ Validation failed for ${field}: ${validation.error} (retry ${state.retryCount})`
    );

    // Check max retries
    if (state.retryCount >= state.maxRetries) {
      console.log(`🚨 Max retries exceeded - escalating`);
      return transitionTo(conversationId, "escalate");
    }

    // Return retry response
    return {
      success: false,
      validationError: validation.error,
      retryCount: state.retryCount,
      text: getCurrentStepText(state, true), // Retry text
      stepId: state.currentStepId,
    };
  }

  // Validation passed - store data
  state.collectedData[field] = validation.value;
  state.retryCount = 0;
  saveState(conversationId, state);

  console.log(`✅ Collected ${field}: ${validation.value}`);

  // Advance to next step
  return transitionTo(conversationId, step.next);
}

/**
 * Handle confirmation step
 */
function handleConfirmStep(conversationId, state, step, userInput) {
  const inputLower = (userInput || "").toLowerCase();

  // Confirmation patterns (multi-language)
  const confirmPatterns = [
    "yes",
    "yeah",
    "yep",
    "correct",
    "right",
    "ok",
    "okay",
    "sure",
    "confirm",
    "yea",
    "हाँ",
    "हां",
    "जी",
    "जी हाँ",
    "सही",
    "ठीक",
    "बिल्कुल",
    "हो",
  ];

  const denyPatterns = [
    "no",
    "nope",
    "wrong",
    "incorrect",
    "change",
    "edit",
    "redo",
    "नहीं",
    "ना",
    "गलत",
    "बदलो",
  ];

  const isConfirmed = confirmPatterns.some((p) => inputLower.includes(p));
  const isDenied = denyPatterns.some((p) => inputLower.includes(p));

  if (isConfirmed) {
    console.log(`✅ User confirmed`);
    return transitionTo(conversationId, step.confirmNext);
  }

  if (isDenied) {
    console.log(`❌ User denied - resetting data`);
    state.collectedData = {};
    saveState(conversationId, state);
    return transitionTo(conversationId, step.denyNext);
  }

  // Unclear response - retry
  state.retryCount++;
  saveState(conversationId, state);

  if (state.retryCount >= state.maxRetries) {
    return transitionTo(conversationId, "escalate");
  }

  return {
    success: false,
    text:
      state.language === "hi"
        ? "मुझे समझ नहीं आया। कृपया हाँ या नहीं कहें।"
        : "I didn't understand. Please say yes or no.",
    retryCount: state.retryCount,
    stepId: state.currentStepId,
  };
}

/**
 * Handle intent detection step
 */
function handleIntentStep(conversationId, state, step, userInput) {
  const inputLower = (userInput || "").toLowerCase();
  const allowedIntents = step.allowedIntents || [];
  const nextSteps = step.next || {};

  // Detect intent from keywords
  for (const intent of allowedIntents) {
    const keywords = getIntentKeywords(intent);
    if (keywords.some((kw) => inputLower.includes(kw))) {
      console.log(`🎯 Intent detected: ${intent}`);
      return transitionTo(conversationId, nextSteps[intent]);
    }
  }

  // No intent matched - use default
  const defaultIntent = allowedIntents[0];
  console.log(`❓ No intent matched, using default: ${defaultIntent}`);
  return transitionTo(conversationId, nextSteps[defaultIntent] || step.next);
}

/**
 * Transition to a specific step
 *
 * @param {string} conversationId - Conversation ID
 * @param {string} nextStepId - Step to transition to
 * @returns {object} Transition result
 */
export function transitionTo(conversationId, nextStepId) {
  const state = getState(conversationId);

  // Check if flow is complete
  if (!nextStepId) {
    state.status = "complete";
    saveState(conversationId, state);

    console.log(`✅ Flow COMPLETE: ${conversationId}`);

    return {
      success: true,
      isEnd: true,
      text: null,
      stepId: null,
    };
  }

  // Check if escalating
  if (nextStepId === "escalate") {
    state.status = "escalated";
  }

  // Update state
  state.previousStepId = state.currentStepId;
  state.currentStepId = nextStepId;
  state.retryCount = 0;
  saveState(conversationId, state);

  console.log(`➡️ Transitioned: ${state.previousStepId} → ${nextStepId}`);

  // Get next step's text
  const step = getCurrentStep(state);
  const text = getCurrentStepText(state);

  return {
    success: true,
    text,
    stepId: nextStepId,
    stepType: step?.type,
    isEnd: step?.isEnd || false,
  };
}

// ============================================================================
// STATE UPDATES
// ============================================================================

/**
 * Set language for conversation
 */
export function setLanguage(conversationId, language) {
  const state = getState(conversationId);
  if (!state) return null;

  state.language = language;
  saveState(conversationId, state);

  console.log(`🌐 Language set: ${language}`);
  return state;
}

/**
 * Update collected data manually
 */
export function updateData(conversationId, data) {
  const state = getState(conversationId);
  if (!state) return null;

  state.collectedData = { ...state.collectedData, ...data };
  saveState(conversationId, state);

  return state;
}

/**
 * Reset conversation (start over)
 */
export function resetConversation(conversationId) {
  const state = getState(conversationId);
  if (!state) return null;

  const flow = flowRegistry.getFlow(state.useCase);
  if (!flow) return null;

  state.currentStepId = flow.startStep;
  state.previousStepId = null;
  state.collectedData = {};
  state.retryCount = 0;
  state.status = "active";
  saveState(conversationId, state);

  console.log(`🔄 Conversation reset: ${conversationId}`);
  return state;
}

// ============================================================================
// STATE QUERIES
// ============================================================================

/**
 * Get state summary (for API response)
 */
export function getStateSummary(conversationId) {
  const state = getState(conversationId);
  if (!state) return null;

  return {
    conversationId: state.conversationId,
    agentId: state.agentId,
    useCase: state.useCase,
    currentStepId: state.currentStepId,
    previousStepId: state.previousStepId,
    language: state.language,
    collectedData: state.collectedData,
    retryCount: state.retryCount,
    status: state.status,
    agentConfig: state.agentConfig,
  };
}

/**
 * Check if conversation is complete
 */
export function isComplete(conversationId) {
  const state = getState(conversationId);
  return state?.status === "complete";
}

/**
 * Check if conversation is escalated
 */
export function isEscalated(conversationId) {
  const state = getState(conversationId);
  return state?.status === "escalated";
}

// ============================================================================
// HIGH-LEVEL API
// ============================================================================

/**
 * Process a complete turn in the conversation
 *
 * This is the MAIN entry point for the state engine.
 *
 * ARCHITECTURE:
 * User Speech → [Intent + Slot] → [State Engine] → Response
 *
 * @param {string} conversationId - Unique conversation ID
 * @param {string} userInput - What the user said (null for first turn)
 * @param {object} options - { useCase, language, agentId }
 * @returns {object} { text, language, stepId, data, isEnd, intent }
 */
export function processTurn(conversationId, userInput, options = {}) {
  const {
    useCase = "automotive_sales",
    language = "en",
    agentId = null,
  } = options;

  try {
    // Get or create state
    const state = getOrCreateState(conversationId, useCase, {
      language,
      agentId,
    });

    // First turn - just return greeting text
    if (!userInput) {
      const text = getCurrentStepText(state);
      return {
        text,
        language: state.language,
        stepId: state.currentStepId,
        stepType: getCurrentStep(state)?.type,
        data: state.collectedData,
        agentConfig: state.agentConfig,
        status: state.status,
      };
    }

    // ====================================================================
    // LAYER 1: INTENT CLASSIFICATION
    // Detect what the user WANTS (not what they said)
    // Intent does NOT advance steps - only used for special handling
    // ====================================================================
    const currentStep = getCurrentStep(state);
    const intentResult = intentClassifier.classifyIntent(userInput, {
      currentStep,
      useCase: state.useCase,
      collectedData: state.collectedData,
    });

    console.log(
      `🎯 Intent: ${
        intentResult.intent
      } (confidence: ${intentResult.confidence.toFixed(2)})`
    );

    // Handle special intents that override normal flow
    if (intentClassifier.shouldEscalate(intentResult.intent)) {
      console.log(`🚨 Escalation intent detected`);
      return transitionTo(conversationId, "escalate");
    }

    if (intentClassifier.shouldCancel(intentResult.intent)) {
      console.log(`🛑 Cancel intent detected - resetting`);
      const resetState = resetConversation(conversationId);
      return {
        text:
          state.language === "hi"
            ? "ठीक है, मैं फिर से शुरू करती हूँ।"
            : "Okay, let me start over.",
        language: state.language,
        stepId: resetState.currentStepId,
        status: "active",
        wasReset: true,
      };
    }

    // ====================================================================
    // LAYER 2: SLOT EXTRACTION
    // Extract ONLY the data needed for the CURRENT step
    // ====================================================================
    const slotResult = slotExtractor.extractSlotsForStep(
      userInput,
      currentStep
    );

    if (slotResult.allFound && Object.keys(slotResult.slots).length > 0) {
      console.log(`📦 Slots extracted:`, slotResult.slots);

      // Store extracted data in state
      for (const [field, value] of Object.entries(slotResult.slots)) {
        state.collectedData[field] = value;
      }
      saveState(conversationId, state);
    }

    // ====================================================================
    // LAYER 3: STATE ENGINE (The Brain)
    // Process input and advance based on step type + validation
    // ====================================================================
    const result = advanceStep(conversationId, userInput);

    // Get updated state
    const updatedState = getState(conversationId);

    return {
      text: result.text,
      language: updatedState.language,
      stepId: updatedState.currentStepId,
      stepType: result.stepType,
      isEnd: result.isEnd || false,
      data: updatedState.collectedData,
      validationError: result.validationError,
      retryCount: result.retryCount,
      status: updatedState.status,
      agentConfig: updatedState.agentConfig,

      // Intent info (for debugging/analytics)
      intent: intentResult.intent,
      intentConfidence: intentResult.confidence,
    };
  } catch (error) {
    console.error("❌ State engine error:", error.message);
    throw error;
  }
}

/**
 * Process turn with intent-based flow selection
 * Use when activeUseCase is null and you need to detect which flow to use
 *
 * @param {string} conversationId - Conversation ID
 * @param {string} userInput - What the user said
 * @param {object} options - { language, agentId }
 * @returns {object} Result with detected useCase
 */
export function processTurnWithFlowSelection(
  conversationId,
  userInput,
  options = {}
) {
  const { language = "en", agentId = null } = options;

  // Classify intent to determine which flow to use
  const intentResult = intentClassifier.classifyIntent(userInput, {});
  const detectedUseCase = intentClassifier.mapIntentToUseCase(
    intentResult.intent
  );

  console.log(
    `🔍 Flow selection - Intent: ${intentResult.intent} → UseCase: ${detectedUseCase}`
  );

  // Use detected use case or default
  const useCase = detectedUseCase || "automotive_sales";

  // Now process with the selected flow
  return processTurn(conversationId, userInput, {
    useCase,
    language,
    agentId,
  });
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Replace placeholders in text with collected data
 */
function replacePlaceholders(text, data) {
  if (!text || !data) return text;

  let result = text;
  for (const [key, value] of Object.entries(data)) {
    const placeholder = new RegExp(`\\{${key}\\}`, "gi");
    result = result.replace(placeholder, value || "");
  }
  return result;
}

/**
 * Get keywords for intent detection
 */
function getIntentKeywords(intent) {
  const intentMap = {
    buy: ["buy", "purchase", "खरीदना", "लेना", "खरीद"],
    test_drive: ["test", "ride", "drive", "demo", "टेस्ट", "राइड", "देखना"],
    support: ["help", "issue", "problem", "support", "मदद", "समस्या"],
    query: ["information", "details", "know", "about", "जानकारी", "बताइए"],
  };
  return intentMap[intent] || [intent];
}

export default {
  // State management
  initializeState,
  getState,
  getOrCreateState,
  destroyState,

  // Step access
  getCurrentStep,
  getCurrentStepText,

  // Transitions
  advanceStep,
  transitionTo,

  // Updates
  setLanguage,
  updateData,
  resetConversation,

  // Queries
  getStateSummary,
  isComplete,
  isEscalated,

  // High-level API
  processTurn,
  processTurnWithFlowSelection,
};
