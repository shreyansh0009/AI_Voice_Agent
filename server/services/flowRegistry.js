/**
 * Flow Registry Service
 *
 * PURPOSE: Load and expose flow definitions from JSON files
 *
 * RESPONSIBILITIES:
 * - Load JSON flow files from /flows directory
 * - Cache flows in memory
 * - Validate flow structure
 * - Expose flow definitions
 *
 * DOES NOT:
 * - Execute flows
 * - Track conversation state
 * - Make decisions
 *
 * EFFECT:
 * - Flow logic becomes DATA, not code
 * - No conditionals in code
 * - New use case = new JSON file
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// FLOW CACHE
// ============================================================================

// In-memory cache for loaded flows
const flowCache = new Map();

// Path to flows directory
const FLOWS_DIR = path.join(__dirname, "..", "flows");

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
  if (flowCache.has(useCase)) {
    return flowCache.get(useCase);
  }

  const flowPath = path.join(FLOWS_DIR, `${useCase}.json`);

  try {
    if (!fs.existsSync(flowPath)) {
      console.warn(`⚠️ Flow not found: ${useCase}`);
      return null;
    }

    const flowJson = fs.readFileSync(flowPath, "utf-8");
    const flow = JSON.parse(flowJson);

    // Validate flow structure
    const validation = validateFlowStructure(flow);
    if (!validation.valid) {
      console.error(
        `❌ Invalid flow structure [${useCase}]: ${validation.error}`
      );
      return null;
    }

    // Cache it
    flowCache.set(useCase, flow);
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
 * Get a flow (from cache or load from disk)
 */
export function getFlow(useCase) {
  return loadFlow(useCase);
}

/**
 * Reload a flow from disk (clear cache)
 */
export function reloadFlow(useCase) {
  flowCache.delete(useCase);
  return loadFlow(useCase);
}

/**
 * Clear all cached flows
 */
export function clearCache() {
  flowCache.clear();
  console.log("🗑️ Flow cache cleared");
}

// ============================================================================
// FLOW DISCOVERY
// ============================================================================

/**
 * Get list of all available flows (use cases)
 *
 * @returns {string[]} Array of use case identifiers
 */
export function getAvailableFlows() {
  try {
    if (!fs.existsSync(FLOWS_DIR)) {
      console.warn(`⚠️ Flows directory not found: ${FLOWS_DIR}`);
      return [];
    }

    const files = fs.readdirSync(FLOWS_DIR);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
  } catch (error) {
    console.error("❌ Error reading flows directory:", error.message);
    return [];
  }
}

/**
 * Get flow metadata (without loading full flow)
 */
export function getFlowMetadata(useCase) {
  const flow = getFlow(useCase);
  if (!flow) return null;

  return {
    useCase: flow.useCase,
    name: flow.name,
    description: flow.description,
    startStep: flow.startStep,
    defaultLanguage: flow.defaultLanguage,
    supportedLanguages: flow.supportedLanguages,
    stepCount: Object.keys(flow.steps).length,
    agentConfig: flow.agentConfig,
  };
}

/**
 * Get all flows metadata
 */
export function getAllFlowsMetadata() {
  const useCases = getAvailableFlows();
  return useCases.map((uc) => getFlowMetadata(uc)).filter(Boolean);
}

// ============================================================================
// FLOW VALIDATION (v1 Schema)
// ============================================================================

// Allowed step types (ONLY THESE)
const ALLOWED_STEP_TYPES = [
  "message",
  "input",
  "choice",
  "confirm",
  "end",
  "handoff",
];

/**
 * Validate flow structure (v1 schema)
 */
function validateFlowStructure(flow) {
  if (!flow) {
    return { valid: false, error: "Flow is null or undefined" };
  }

  // Support both old (useCase) and new (flowId) schemas
  if (!flow.useCase && !flow.flowId) {
    return { valid: false, error: "Missing 'flowId' or 'useCase' field" };
  }

  if (!flow.startStep) {
    return { valid: false, error: "Missing 'startStep' field" };
  }

  if (!flow.steps || typeof flow.steps !== "object") {
    return { valid: false, error: "Missing or invalid 'steps' object" };
  }

  if (!flow.steps[flow.startStep]) {
    return {
      valid: false,
      error: `Start step '${flow.startStep}' not found in steps`,
    };
  }

  // Validate each step
  for (const [stepId, step] of Object.entries(flow.steps)) {
    // Check required type field
    if (!step.type) {
      return { valid: false, error: `Step '${stepId}' missing 'type' field` };
    }

    // Validate step type
    if (!ALLOWED_STEP_TYPES.includes(step.type)) {
      return {
        valid: false,
        error: `Step '${stepId}' has invalid type '${
          step.type
        }'. Allowed: ${ALLOWED_STEP_TYPES.join(", ")}`,
      };
    }

    // Check text field (required except for some types)
    if (!step.text && !["action"].includes(step.type)) {
      return { valid: false, error: `Step '${stepId}' missing 'text' field` };
    }

    // Validate input steps
    if (step.type === "input") {
      if (!step.field) {
        return {
          valid: false,
          error: `Input step '${stepId}' missing 'field'`,
        };
      }
      if (!step.onSuccess && !step.next) {
        return {
          valid: false,
          error: `Input step '${stepId}' missing 'onSuccess' or 'next'`,
        };
      }
    }

    // Validate choice steps
    if (step.type === "choice") {
      if (!step.options || !Array.isArray(step.options)) {
        return {
          valid: false,
          error: `Choice step '${stepId}' missing 'options' array`,
        };
      }
      if (!step.next || typeof step.next !== "object") {
        return {
          valid: false,
          error: `Choice step '${stepId}' missing 'next' object for branching`,
        };
      }
    }

    // Validate confirm steps
    if (step.type === "confirm") {
      if (!step.confirmNext) {
        return {
          valid: false,
          error: `Confirm step '${stepId}' missing 'confirmNext'`,
        };
      }
      if (!step.denyNext) {
        return {
          valid: false,
          error: `Confirm step '${stepId}' missing 'denyNext'`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Get interruption handler for a flow
 *
 * @param {string} useCase - Flow identifier
 * @param {string} interruptType - Type of interruption (HELP, STOP, etc.)
 * @returns {string|null} Step to jump to or null
 */
export function getInterruptionHandler(useCase, interruptType) {
  const flow = getFlow(useCase);
  if (!flow || !flow.interruptions) return null;

  return flow.interruptions[interruptType] || null;
}

/**
 * Check if flow supports resume after interruption
 *
 * @param {string} useCase - Flow identifier
 * @param {string} stepId - Step to check
 * @returns {boolean} Whether resume is enabled
 */
export function canResumeFrom(useCase, stepId) {
  const step = getStep(useCase, stepId);
  if (!step) return false;

  return step.resumeEnabled === true;
}

/**
 * Validate a specific step exists in flow
 */
export function hasStep(useCase, stepId) {
  const flow = getFlow(useCase);
  if (!flow) return false;
  return !!flow.steps[stepId];
}

/**
 * Get a specific step from flow
 */
export function getStep(useCase, stepId) {
  const flow = getFlow(useCase);
  if (!flow) return null;
  return flow.steps[stepId] || null;
}

/**
 * Get all step IDs from flow
 */
export function getStepIds(useCase) {
  const flow = getFlow(useCase);
  if (!flow) return [];
  return Object.keys(flow.steps);
}

// ============================================================================
// FLOW TEXT HELPERS
// ============================================================================

/**
 * Replace {{placeholders}} in text with actual values
 *
 * Supports:
 * - {{agentName}} - from agentConfig
 * - {{companyName}} / {{brand}} - from agentConfig
 * - {{name}}, {{mobile}}, {{pincode}}, etc. - from collectedData
 *
 * @param {string} text - Text with {{placeholders}}
 * @param {object} context - { agentConfig, collectedData }
 * @returns {string} Text with placeholders filled
 */
export function fillPlaceholders(text, context = {}) {
  if (!text || typeof text !== "string") return text;

  const { agentConfig = {}, collectedData = {} } = context;

  // Build replacement map
  const replacements = {
    // Agent config
    agentName: agentConfig.name || "Agent",
    companyName: agentConfig.brand || agentConfig.company || "Company",
    brand: agentConfig.brand || "Brand",
    tone: agentConfig.tone || "friendly",
    style: agentConfig.style || "concise",

    // Collected data
    ...collectedData,
  };

  // Replace all {{placeholder}} patterns
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return replacements[key] !== undefined ? replacements[key] : match;
  });
}

/**
 * Get step text in specific language with placeholders filled
 *
 * @param {string} useCase - Flow identifier
 * @param {string} stepId - Step identifier
 * @param {string} language - Language code (en, hi, etc.)
 * @param {boolean} isRetry - Use retry text if available
 * @param {object} context - { agentConfig, collectedData } for placeholder replacement
 * @returns {string|null} Text with placeholders filled or null
 */
export function getStepTextWithContext(
  useCase,
  stepId,
  language = "en",
  isRetry = false,
  context = {}
) {
  const step = getStep(useCase, stepId);
  if (!step) return null;

  // Get raw text
  let text;
  if (isRetry && step.retryText) {
    text = step.retryText[language] || step.retryText.en || step.retryText;
  } else {
    text = step.text?.[language] || step.text?.en || step.text;
  }

  if (!text) return null;

  // Get agent config from flow if not provided
  const flow = getFlow(useCase);
  const agentConfig = context.agentConfig || flow?.agentConfig || {};

  // Fill placeholders
  return fillPlaceholders(text, {
    agentConfig,
    collectedData: context.collectedData || {},
  });
}

/**
 * Get step text in specific language (legacy - without context)
 *
 * @param {string} useCase - Flow identifier
 * @param {string} stepId - Step identifier
 * @param {string} language - Language code (en, hi, etc.)
 * @param {boolean} isRetry - Use retry text if available
 * @returns {string|null} Text or null
 */
export function getStepText(useCase, stepId, language = "en", isRetry = false) {
  // Use getStepTextWithContext with default context
  return getStepTextWithContext(useCase, stepId, language, isRetry, {});
}

/**
 * Get agent config from flow
 */
export function getAgentConfig(useCase) {
  const flow = getFlow(useCase);
  if (!flow) {
    return {
      name: "Agent",
      tone: "professional",
      style: "short",
    };
  }
  return (
    flow.agentConfig || {
      name: "Agent",
      tone: "professional",
      style: "short",
    }
  );
}

export default {
  // Loading
  loadFlow,
  getFlow,
  reloadFlow,
  clearCache,

  // Discovery
  getAvailableFlows,
  getFlowMetadata,
  getAllFlowsMetadata,

  // Step access
  hasStep,
  getStep,
  getStepIds,
  getStepText,
  getStepTextWithContext,
  getAgentConfig,

  // Placeholder handling
  fillPlaceholders,

  // Interruptions & Resume
  getInterruptionHandler,
  canResumeFrom,

  // Constants
  ALLOWED_STEP_TYPES,
};
