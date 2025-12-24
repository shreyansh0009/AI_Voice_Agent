/**
 * Flow Engine Service
 *
 * JSON-Driven State Machine Executor
 *
 * This is the CORE ENGINE that:
 * - Loads flow definitions from JSON files
 * - Executes flows step by step
 * - Manages conversation state
 * - Returns the EXACT text to speak (no LLM needed for flow text)
 *
 * KEY PRINCIPLE:
 * Flow is DATA, not code.
 * New agents = new JSON file.
 * No prompts, no LLM logic here.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import inputValidator from "./inputValidator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// FLOW STORAGE
// ============================================================================

// Cache loaded flows in memory
const loadedFlows = new Map();

// Conversation states (in production, use Redis/DB)
const conversationStates = new Map();

// ============================================================================
// FLOW LOADING
// ============================================================================

/**
 * Load a flow definition from JSON file
 *
 * @param {string} useCase - Use case identifier (filename without .json)
 * @returns {object|null} Flow definition or null if not found
 */
export function loadFlow(useCase) {
  // Check cache first
  if (loadedFlows.has(useCase)) {
    return loadedFlows.get(useCase);
  }

  // Try to load from file
  const flowPath = path.join(__dirname, "..", "flows", `${useCase}.json`);

  try {
    if (!fs.existsSync(flowPath)) {
      console.warn(`⚠️ Flow not found: ${useCase}`);
      return null;
    }

    const flowJson = fs.readFileSync(flowPath, "utf-8");
    const flow = JSON.parse(flowJson);

    // Validate flow structure
    if (!flow.steps || !flow.startStep) {
      console.error(`❌ Invalid flow structure: ${useCase}`);
      return null;
    }

    // Cache it
    loadedFlows.set(useCase, flow);
    console.log(
      `✅ Flow loaded: ${useCase} (${Object.keys(flow.steps).length} steps)`
    );

    return flow;
  } catch (error) {
    console.error(`❌ Error loading flow ${useCase}:`, error.message);
    return null;
  }
}

/**
 * Get list of available flows
 *
 * @returns {string[]} Array of use case identifiers
 */
export function getAvailableFlows() {
  const flowsDir = path.join(__dirname, "..", "flows");

  try {
    const files = fs.readdirSync(flowsDir);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
  } catch (error) {
    console.error("Error reading flows directory:", error.message);
    return [];
  }
}

/**
 * Reload a flow from disk (clear cache)
 */
export function reloadFlow(useCase) {
  loadedFlows.delete(useCase);
  return loadFlow(useCase);
}

// ============================================================================
// CONVERSATION STATE
// ============================================================================

/**
 * Initialize a new conversation state
 *
 * @param {string} sessionId - Unique session identifier
 * @param {string} useCase - Use case to load
 * @param {string} language - Initial language (en, hi, etc.)
 * @returns {object} Initial state
 */
export function initializeConversation(sessionId, useCase, language = "en") {
  const flow = loadFlow(useCase);

  if (!flow) {
    throw new Error(`Flow not found: ${useCase}`);
  }

  const state = {
    sessionId,
    useCase,
    flow,

    // Current position in flow
    currentStepId: flow.startStep,
    previousStepId: null,

    // Collected data
    data: {},

    // Language
    language: language || flow.defaultLanguage || "en",

    // Retry tracking
    retryCount: 0,
    maxRetries: 2,

    // Status
    isComplete: false,
    isEscalated: false,

    // Agent config from flow
    agentConfig: flow.agentConfig || {
      name: "Agent",
      tone: "professional",
      style: "short",
    },

    // Timestamps
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };

  conversationStates.set(sessionId, state);
  console.log(`🆕 Conversation initialized: ${sessionId} → ${useCase}`);

  return state;
}

/**
 * Get conversation state
 */
export function getConversation(sessionId) {
  return conversationStates.get(sessionId) || null;
}

/**
 * Get or create conversation
 */
export function getOrCreateConversation(sessionId, useCase, language = "en") {
  const existing = getConversation(sessionId);
  if (existing) {
    return existing;
  }
  return initializeConversation(sessionId, useCase, language);
}

/**
 * Save conversation state
 */
function saveState(sessionId, state) {
  state.lastUpdated = new Date().toISOString();
  conversationStates.set(sessionId, state);
  return state;
}

// ============================================================================
// FLOW EXECUTION
// ============================================================================

/**
 * Get the current step's text to speak
 *
 * @param {string} sessionId - Session identifier
 * @param {boolean} isRetry - Is this a retry after validation failure?
 * @returns {object} { text, stepId, stepType, isEnd }
 */
export function getCurrentStepText(sessionId, isRetry = false) {
  const state = getConversation(sessionId);
  if (!state) {
    throw new Error(`Conversation not found: ${sessionId}`);
  }

  const step = state.flow.steps[state.currentStepId];
  if (!step) {
    throw new Error(`Step not found: ${state.currentStepId}`);
  }

  // Get text in current language
  const lang = state.language;
  let text;

  if (isRetry && step.retryText) {
    text = step.retryText[lang] || step.retryText.en || step.retryText;
  } else {
    text = step.text[lang] || step.text.en || step.text;
  }

  // Replace placeholders with collected data
  text = replacePlaceholders(text, state.data);

  return {
    text,
    stepId: state.currentStepId,
    stepType: step.type,
    isEnd: step.isEnd || false,
    field: step.field || null,
    validation: step.validation || null,
  };
}

/**
 * Process user input and advance the flow
 *
 * @param {string} sessionId - Session identifier
 * @param {string} userInput - What the user said
 * @returns {object} { success, text, nextStepId, validationError, isEnd }
 */
export function processInput(sessionId, userInput) {
  const state = getConversation(sessionId);
  if (!state) {
    throw new Error(`Conversation not found: ${sessionId}`);
  }

  const step = state.flow.steps[state.currentStepId];
  if (!step) {
    throw new Error(`Step not found: ${state.currentStepId}`);
  }

  // Handle different step types
  switch (step.type) {
    case "message":
      // No input needed, just advance
      return advanceToNextStep(sessionId, step.next);

    case "input":
      return handleInputStep(sessionId, state, step, userInput);

    case "confirm":
      return handleConfirmStep(sessionId, state, step, userInput);

    case "intent":
      return handleIntentStep(sessionId, state, step, userInput);

    case "action":
      // Action steps just advance after displaying message
      return advanceToNextStep(sessionId, step.next);

    default:
      console.warn(`Unknown step type: ${step.type}`);
      return advanceToNextStep(sessionId, step.next);
  }
}

/**
 * Handle input collection step
 */
function handleInputStep(sessionId, state, step, userInput) {
  const field = step.field;
  const validationType = step.validation;

  // Validate input
  const validation = inputValidator.validateField(validationType, userInput);

  if (!validation.valid) {
    // Validation failed - retry
    state.retryCount++;
    saveState(sessionId, state);

    if (state.retryCount >= state.maxRetries) {
      // Max retries - escalate
      return advanceToNextStep(sessionId, "escalate");
    }

    return {
      success: false,
      validationError: validation.error,
      retryCount: state.retryCount,
      text: getRetryText(state, step),
    };
  }

  // Validation passed - store data and advance
  state.data[field] = validation.value;
  state.retryCount = 0;
  saveState(sessionId, state);

  console.log(`✅ Collected ${field}: ${validation.value}`);

  return advanceToNextStep(sessionId, step.next);
}

/**
 * Handle confirmation step
 */
function handleConfirmStep(sessionId, state, step, userInput) {
  const inputLower = userInput.toLowerCase();

  // Check for confirmation
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
    "हाँ",
    "हां",
    "जी",
    "जी हाँ",
    "सही",
    "ठीक",
    "बिल्कुल",
  ];

  const denyPatterns = [
    "no",
    "nope",
    "wrong",
    "incorrect",
    "change",
    "edit",
    "नहीं",
    "ना",
    "गलत",
  ];

  const isConfirmed = confirmPatterns.some((p) => inputLower.includes(p));
  const isDenied = denyPatterns.some((p) => inputLower.includes(p));

  if (isConfirmed) {
    return advanceToNextStep(sessionId, step.confirmNext);
  } else if (isDenied) {
    // Reset data and go back
    state.data = {};
    saveState(sessionId, state);
    return advanceToNextStep(sessionId, step.denyNext);
  } else {
    // Unclear response - ask again
    state.retryCount++;
    saveState(sessionId, state);

    if (state.retryCount >= state.maxRetries) {
      return advanceToNextStep(sessionId, "escalate");
    }

    return {
      success: false,
      text: "I didn't understand. Please say yes or no.",
      retryCount: state.retryCount,
    };
  }
}

/**
 * Handle intent detection step
 */
function handleIntentStep(sessionId, state, step, userInput) {
  const inputLower = userInput.toLowerCase();
  const allowedIntents = step.allowedIntents || [];
  const nextSteps = step.next || {};

  // Try to detect intent
  for (const intent of allowedIntents) {
    // Simple keyword matching (can be enhanced with NLP)
    const intentKeywords = getIntentKeywords(intent);
    if (intentKeywords.some((kw) => inputLower.includes(kw))) {
      return advanceToNextStep(sessionId, nextSteps[intent]);
    }
  }

  // No intent matched - use default or first intent
  const defaultIntent = allowedIntents[0];
  return advanceToNextStep(sessionId, nextSteps[defaultIntent] || step.next);
}

/**
 * Advance to the next step
 */
function advanceToNextStep(sessionId, nextStepId) {
  const state = getConversation(sessionId);

  // Check if flow is complete
  if (!nextStepId) {
    state.isComplete = true;
    saveState(sessionId, state);

    return {
      success: true,
      isEnd: true,
      text: null,
    };
  }

  // Check if escalating
  if (nextStepId === "escalate") {
    state.isEscalated = true;
  }

  // Move to next step
  state.previousStepId = state.currentStepId;
  state.currentStepId = nextStepId;
  state.retryCount = 0;
  saveState(sessionId, state);

  // Get next step's text
  const nextStepText = getCurrentStepText(sessionId);

  console.log(`➡️ Advanced to: ${nextStepId}`);

  return {
    success: true,
    text: nextStepText.text,
    stepId: nextStepId,
    stepType: nextStepText.stepType,
    isEnd: nextStepText.isEnd,
  };
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
 * Get retry text for a step
 */
function getRetryText(state, step) {
  const lang = state.language;

  if (step.retryText) {
    const text = step.retryText[lang] || step.retryText.en || step.retryText;
    return replacePlaceholders(text, state.data);
  }

  return "I didn't quite catch that. Could you please repeat?";
}

/**
 * Get keywords for intent detection
 */
function getIntentKeywords(intent) {
  const intentMap = {
    buy: ["buy", "purchase", "खरीदना", "लेना"],
    test_drive: ["test", "ride", "drive", "demo", "टेस्ट", "राइड"],
    support: ["help", "issue", "problem", "support", "मदद", "समस्या"],
    query: ["information", "details", "know", "जानकारी", "बताइए"],
  };

  return intentMap[intent] || [intent];
}

/**
 * Set language for conversation
 */
export function setLanguage(sessionId, language) {
  const state = getConversation(sessionId);
  if (!state) return null;

  state.language = language;
  return saveState(sessionId, state);
}

/**
 * Get conversation summary
 */
export function getConversationSummary(sessionId) {
  const state = getConversation(sessionId);
  if (!state) return null;

  return {
    sessionId: state.sessionId,
    useCase: state.useCase,
    currentStep: state.currentStepId,
    previousStep: state.previousStepId,
    language: state.language,
    data: state.data,
    isComplete: state.isComplete,
    isEscalated: state.isEscalated,
    retryCount: state.retryCount,
    agentConfig: state.agentConfig,
  };
}

/**
 * Destroy conversation
 */
export function destroyConversation(sessionId) {
  conversationStates.delete(sessionId);
  console.log(`🗑️ Conversation destroyed: ${sessionId}`);
}

// ============================================================================
// HIGH-LEVEL API
// ============================================================================

/**
 * Process a complete turn in the conversation
 *
 * This is the MAIN entry point:
 * 1. Get/create conversation
 * 2. Process user input (if any)
 * 3. Return the text to speak
 *
 * @param {string} sessionId - Session identifier
 * @param {string} userInput - What the user said (null for first turn)
 * @param {object} options - { useCase, language }
 * @returns {object} { text, language, stepId, isEnd, data }
 */
export function processTurn(sessionId, userInput, options = {}) {
  const { useCase = "automotive_sales", language = "en" } = options;

  try {
    // Get or create conversation
    const state = getOrCreateConversation(sessionId, useCase, language);

    // First turn - just return greeting
    if (!userInput) {
      const stepText = getCurrentStepText(sessionId);
      return {
        text: stepText.text,
        language: state.language,
        stepId: state.currentStepId,
        stepType: stepText.stepType,
        isEnd: stepText.isEnd,
        data: state.data,
        agentConfig: state.agentConfig,
      };
    }

    // Process input and advance
    const result = processInput(sessionId, userInput);

    // Get updated state
    const updatedState = getConversation(sessionId);

    return {
      text: result.text,
      language: updatedState.language,
      stepId: updatedState.currentStepId,
      stepType: result.stepType,
      isEnd: result.isEnd || false,
      data: updatedState.data,
      validationError: result.validationError,
      retryCount: result.retryCount,
      isComplete: updatedState.isComplete,
      isEscalated: updatedState.isEscalated,
      agentConfig: updatedState.agentConfig,
    };
  } catch (error) {
    console.error("❌ Flow engine error:", error.message);
    throw error;
  }
}

export default {
  // Flow management
  loadFlow,
  getAvailableFlows,
  reloadFlow,

  // Conversation management
  initializeConversation,
  getConversation,
  getOrCreateConversation,
  destroyConversation,

  // Flow execution
  getCurrentStepText,
  processInput,
  processTurn,

  // Helpers
  setLanguage,
  getConversationSummary,
};
