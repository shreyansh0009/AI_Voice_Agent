/**
 * State Engine Service - REFACTORED
 *
 * PURPOSE: The REAL BRAIN of the system
 *
 * ARCHITECTURE CHANGE (CRITICAL):
 * - STATELESS - No in-memory Map storage
 * - MongoDB Conversation is the ONLY source of truth
 * - processTurn receives conversation document, not conversationId
 * - Returns PATCH (delta), not full state
 *
 * RESPONSIBILITIES:
 * - Execute step transitions
 * - Enforce step order
 * - Handle retries
 * - Manage branching
 * - Determine completion
 *
 * DOES NOT:
 * - Store state (MongoDB does)
 * - Load flows (Controller provides flow)
 * - Call LLM (LLM has ZERO control here)
 */

import inputValidator from "./inputValidator.js";
import intentClassifier from "./intentClassifier.js";
import slotExtractor from "./slotExtractor.js";
import textNormalizer from "./textNormalizer.js";

// ============================================================================
// NO IN-MEMORY STATE - REMOVED
// const conversationStates = new Map();  ← DELETED
// ============================================================================

// ============================================================================
// STEP ACCESS (Pure functions - no state dependency)
// ============================================================================

/**
 * Get current step from flow
 *
 * @param {object} flow - Flow definition (passed from controller)
 * @param {string} currentStepId - Current step ID
 * @returns {object|null} Current step definition
 */
export function getCurrentStep(flow, currentStepId) {
  if (!flow || !currentStepId) return null;
  return flow.steps?.[currentStepId] || null;
}

/**
 * Get current step text in current language
 * Automatically fills {{placeholders}} with agentConfig and collectedData
 * AND normalizes for TTS (fixes Hindi pronunciation issues)
 *
 * @param {object} flow - Flow definition
 * @param {object} conversation - MongoDB Conversation document
 * @param {boolean} isRetry - Use retry text if available
 * @returns {string|null} Text to speak with placeholders filled and normalized
 */
export function getCurrentStepText(flow, conversation, isRetry = false) {
  if (!flow || !conversation) return null;

  const step = getCurrentStep(flow, conversation.currentStepId);
  if (!step) return null;

  const lang = conversation.language || "en";

  // Get text based on language and retry status
  let text = null;
  if (isRetry && step.retryText) {
    text = step.retryText[lang] || step.retryText.en || step.retryText;
  }
  if (!text && step.text) {
    text = step.text[lang] || step.text.en || step.text;
  }

  if (!text) return null;

  // Replace {{placeholders}} with agentConfig and collectedData
  text = replacePlaceholders(text, {
    ...conversation.agentConfig,
    ...conversation.collectedData,
  });

  // Normalize text for TTS to fix pronunciation issues
  text = textNormalizer.normalizeForTTS(text, lang);

  return text;
}

// ============================================================================
// STATE ENGINE IS THE BOSS
// LLM NEVER decides what the next step is
// ============================================================================

/**
 * Advance state based on flow definition and collected slots
 *
 * GOLDEN RULE: LLM never decides what the next step is
 *
 * @param {object} flow - Flow definition from JSON
 * @param {object} conversation - MongoDB Conversation document
 * @param {object} slots - Extracted slots from user input
 * @returns {object} { nextStepId, shouldRepeat, reason }
 */
export function advanceState(flow, conversation, slots = {}) {
  const step = flow.steps[conversation.currentStepId];

  if (!step) {
    return {
      nextStepId: conversation.currentStepId,
      shouldRepeat: true,
      reason: "INVALID_STEP",
    };
  }

  // RULE 1: If step requires data collection, check if slot is provided
  if (step.field || step.collect) {
    const fieldName = step.field || step.collect;

    if (!slots[fieldName] && !conversation.collectedData?.[fieldName]) {
      return {
        nextStepId: conversation.currentStepId,
        shouldRepeat: true,
        reason: "SLOT_MISSING",
        missingField: fieldName,
      };
    }
  }

  // RULE 2: If step is confirmation type, check for yes/no
  if (step.type === "confirm") {
    const confirmation = slots.confirmation || slots.confirm;

    if (confirmation === "yes" && step.confirmNext) {
      return { nextStepId: step.confirmNext, shouldRepeat: false };
    }

    if (confirmation === "no" && step.denyNext) {
      return { nextStepId: step.denyNext, shouldRepeat: false };
    }

    if (!confirmation || confirmation === "unclear") {
      return {
        nextStepId: conversation.currentStepId,
        shouldRepeat: true,
        reason: "CONFIRMATION_UNCLEAR",
      };
    }
  }

  // RULE 3: Check for max retries
  const maxRetries = conversation.maxRetries || 2;
  if ((conversation.retryCount || 0) >= maxRetries) {
    return {
      nextStepId: "escalate",
      shouldRepeat: false,
      reason: "MAX_RETRIES_EXCEEDED",
    };
  }

  // RULE 4: If step is end step, mark complete
  if (step.isEnd || !step.next) {
    return {
      nextStepId: null,
      shouldRepeat: false,
      reason: "FLOW_COMPLETE",
      isComplete: true,
    };
  }

  // RULE 5: Advance to next step
  return {
    nextStepId: step.next,
    shouldRepeat: false,
    reason: "ADVANCED",
  };
}

// ============================================================================
// INPUT HANDLING (Pure functions)
// ============================================================================

/**
 * Handle input collection step
 *
 * @param {object} flow - Flow definition
 * @param {object} conversation - MongoDB Conversation document
 * @param {object} step - Current step definition
 * @param {string} userInput - User's input
 * @returns {object} { success, dataPatch, nextStepId, retryCount, validationError }
 */
function handleInputStep(flow, conversation, step, userInput) {
  const field = step.field;
  const validationType = step.validation;

  // Validate input
  const validation = inputValidator.validateField(validationType, userInput);

  if (!validation.valid) {
    // Validation failed - increment retry
    const newRetryCount = (conversation.retryCount || 0) + 1;
    const maxRetries = conversation.maxRetries || 2;

    console.log(
      `❌ Validation failed for ${field}: ${validation.error} (retry ${newRetryCount})`
    );

    // Check max retries
    if (newRetryCount >= maxRetries) {
      console.log(`🚨 Max retries exceeded - escalating`);
      return {
        success: false,
        nextStepId: "escalate",
        retryCount: newRetryCount,
        status: "escalated",
      };
    }

    return {
      success: false,
      validationError: validation.error,
      retryCount: newRetryCount,
      text: getCurrentStepText(flow, conversation, true),
      stepId: conversation.currentStepId,
    };
  }

  // Validation passed - return data patch (NOT full state)
  console.log(`✅ Collected ${field}: ${validation.value}`);

  return {
    success: true,
    dataPatch: { [field]: validation.value }, // ONLY the new slot
    nextStepId: step.next,
    retryCount: 0,
  };
}

/**
 * Handle confirmation step
 *
 * @param {object} flow - Flow definition
 * @param {object} conversation - MongoDB Conversation document
 * @param {object} step - Current step definition
 * @param {string} userInput - User's input
 * @returns {object} Result
 */
function handleConfirmStep(flow, conversation, step, userInput) {
  const inputLower = (userInput || "").toLowerCase();

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
    return {
      success: true,
      nextStepId: step.confirmNext,
      retryCount: 0,
    };
  }

  if (isDenied) {
    console.log(`❌ User denied - will clear only relevant field`);
    // Note: We return a signal to clear data, controller handles it
    return {
      success: true,
      nextStepId: step.denyNext,
      retryCount: 0,
      shouldClearData: true, // Signal to controller
      fieldToClear: step.field || null, // Only clear this field, not all
    };
  }

  // Unclear response - retry
  const newRetryCount = (conversation.retryCount || 0) + 1;
  const maxRetries = conversation.maxRetries || 2;

  if (newRetryCount >= maxRetries) {
    return {
      success: false,
      nextStepId: "escalate",
      retryCount: newRetryCount,
      status: "escalated",
    };
  }

  return {
    success: false,
    text:
      conversation.language === "hi"
        ? "मुझे समझ नहीं आया। कृपया हाँ या नहीं कहें।"
        : "I didn't understand. Please say yes or no.",
    retryCount: newRetryCount,
    stepId: conversation.currentStepId,
  };
}

/**
 * Handle intent detection step
 *
 * @param {object} flow - Flow definition
 * @param {object} conversation - MongoDB Conversation document
 * @param {object} step - Current step definition
 * @param {string} userInput - User's input
 * @returns {object} Result
 */
function handleIntentStep(flow, conversation, step, userInput) {
  const inputLower = (userInput || "").toLowerCase();
  const allowedIntents = step.allowedIntents || [];
  const nextSteps = step.next || {};

  for (const intent of allowedIntents) {
    const keywords = getIntentKeywords(intent);
    if (keywords.some((kw) => inputLower.includes(kw))) {
      console.log(`🎯 Intent detected: ${intent}`);
      return {
        success: true,
        nextStepId: nextSteps[intent],
        retryCount: 0,
      };
    }
  }

  // No intent matched - use default
  const defaultIntent = allowedIntents[0];
  console.log(`❓ No intent matched, using default: ${defaultIntent}`);
  return {
    success: true,
    nextStepId: nextSteps[defaultIntent] || step.next,
    retryCount: 0,
  };
}

// ============================================================================
// MAIN ENTRY POINT - processTurn (REFACTORED)
// ============================================================================

/**
 * Process a complete turn in the conversation
 *
 * ARCHITECTURE CHANGE:
 * - Receives conversation DOCUMENT, not just ID
 * - Receives flow DOCUMENT from controller
 * - Returns PATCH (delta), not full state
 * - Controller handles DB persistence
 *
 * @param {object} params - { conversation, userInput, flow }
 * @returns {object} { text, nextStepId, dataPatch, retryCount, status, intent }
 */
export function processTurn({ conversation, userInput, flow }) {
  if (!conversation || !flow) {
    throw new Error("processTurn requires conversation and flow");
  }

  try {
    const currentStep = getCurrentStep(flow, conversation.currentStepId);

    // First turn - just return greeting text
    if (!userInput) {
      const text = getCurrentStepText(flow, conversation);
      return {
        text,
        nextStepId: conversation.currentStepId,
        stepType: currentStep?.type,
        dataPatch: {}, // No changes
        retryCount: 0,
        status: conversation.status || "active",
      };
    }

    // ====================================================================
    // LAYER 1: INTENT CLASSIFICATION
    // Intent does NOT advance steps - only used for special handling
    // ====================================================================
    const intentResult = intentClassifier.classifyIntent(userInput, {
      currentStep,
      useCase: conversation.flowId,
      collectedData: conversation.collectedData,
    });

    console.log(
      `🎯 Intent: ${
        intentResult.intent
      } (confidence: ${intentResult.confidence.toFixed(2)})`
    );

    // Handle special intents
    if (intentClassifier.shouldEscalate(intentResult.intent)) {
      console.log(`🚨 Escalation intent detected`);
      return {
        text: getCurrentStepText(flow, {
          ...conversation,
          currentStepId: "escalate",
        }),
        nextStepId: "escalate",
        dataPatch: {},
        retryCount: 0,
        status: "escalated",
        intent: intentResult.intent,
      };
    }

    if (intentClassifier.shouldCancel(intentResult.intent)) {
      console.log(`🛑 Cancel intent detected - reset signal`);
      return {
        text:
          conversation.language === "hi"
            ? "ठीक है, मैं फिर से शुरू करती हूँ।"
            : "Okay, let me start over.",
        nextStepId: flow.startStep,
        dataPatch: {}, // Controller will clear data
        retryCount: 0,
        status: "active",
        wasReset: true,
        intent: intentResult.intent,
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
    const extractedSlots = slotResult.allFound ? slotResult.slots : {};

    if (Object.keys(extractedSlots).length > 0) {
      console.log(`📦 Slots extracted:`, extractedSlots);
    }

    // ====================================================================
    // LAYER 3: STATE ENGINE (The Brain)
    // Process input and advance based on step type + validation
    // ====================================================================
    let result;

    switch (currentStep?.type) {
      case "message":
        // Message steps auto-advance
        result = {
          success: true,
          nextStepId: currentStep.next,
          retryCount: 0,
          dataPatch: extractedSlots,
        };
        break;

      case "input":
        result = handleInputStep(flow, conversation, currentStep, userInput);
        // Merge extracted slots into dataPatch
        result.dataPatch = { ...extractedSlots, ...result.dataPatch };
        break;

      case "confirm":
        result = handleConfirmStep(flow, conversation, currentStep, userInput);
        result.dataPatch = extractedSlots;
        break;

      case "intent":
        result = handleIntentStep(flow, conversation, currentStep, userInput);
        result.dataPatch = extractedSlots;
        break;

      case "action":
        // Action steps auto-advance after execution
        result = {
          success: true,
          nextStepId: currentStep.next,
          retryCount: 0,
          dataPatch: extractedSlots,
        };
        break;

      default:
        console.warn(`⚠️ Unknown step type: ${currentStep?.type}`);
        result = {
          success: true,
          nextStepId: currentStep?.next,
          retryCount: 0,
          dataPatch: extractedSlots,
        };
    }

    // Get text for next step (if advancing)
    const nextStepId = result.nextStepId;
    const isEnd = !nextStepId || nextStepId === null;
    const isEscalated =
      nextStepId === "escalate" || result.status === "escalated";

    let text = result.text;
    if (!text && nextStepId && nextStepId !== "escalate") {
      // Get next step's text
      const tempConv = { ...conversation, currentStepId: nextStepId };
      text = getCurrentStepText(flow, tempConv);
    }

    // Determine status
    let status = conversation.status || "active";
    if (isEnd) status = "complete";
    if (isEscalated) status = "escalated";

    console.log(
      `➡️ Transition: ${conversation.currentStepId} → ${nextStepId || "END"}`
    );

    return {
      text,
      nextStepId: isEnd ? null : nextStepId,
      stepType: currentStep?.type,
      dataPatch: result.dataPatch || {},
      retryCount: result.retryCount || 0,
      status,
      isEnd,
      validationError: result.validationError,
      shouldClearData: result.shouldClearData,
      fieldToClear: result.fieldToClear,
      intent: intentResult.intent,
      intentConfidence: intentResult.confidence,
    };
  } catch (error) {
    console.error("❌ State engine error:", error.message);
    throw error;
  }
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
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "gi");
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

// ============================================================================
// EXPORTS (Simplified - no state management functions)
// ============================================================================

export default {
  // Step access (pure functions)
  getCurrentStep,
  getCurrentStepText,

  // State engine is THE BOSS (LLM never knows this)
  advanceState,

  // High-level API - ONLY entry point
  processTurn,
};
