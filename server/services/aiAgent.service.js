import OpenAI from "openai";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import ragService from "./ragService.js";
import translationService from "./translationService.js";
import agentforceService from "./agentforce.service.js";

// ============================================================================
// NEW ARCHITECTURE IMPORTS (Refactored for clarity)
// ============================================================================
import flowRegistry from "./flowRegistry.js"; // Loads JSON flows
import stateEngine from "./stateEngine.js"; // Executes steps + transitions
import promptBuilder from "./promptBuilder.js"; // Builds minimal LLM prompts
import inputValidator from "./inputValidator.js"; // Validates user input
import outputParser from "./outputParser.js"; // Parses LLM output (DEPRECATED - use responseContract)
import responseContract from "./responseContract.js"; // Enforces HARD output contracts
import intentClassifier from "./intentClassifier.js"; // Intent classification
import slotExtractor from "./slotExtractor.js"; // Slot extraction

// DEPRECATED: Old services (kept for backwards compatibility)
import stateMachine from "./stateMachine.js"; // @deprecated - use stateEngine
import flowEngine from "./flowEngine.js"; // @deprecated - use stateEngine + flowRegistry

// Ensure we load the server/.env regardless of cwd or import order
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

/**
 * AI Agent Service - Handles conversation logic for both web voice chat and phone calls
 *
 * Architecture:
 * - Dynamic flow extraction from user's agent prompt (no hardcoded state machines)
 * - Automatic customer info extraction and validation
 * - Multi-language support with translation layer
 * - RAG-enabled knowledge base integration
 * - Conversation state tracking to prevent loops and repetition
 *
 * Configuration:
 * - All AI parameters centralized in AI_CONFIG
 * - System prompts defined as constants for reusability
 * - Language codes mapped in LANGUAGE_CODES
 */

// Configuration constants
const AI_CONFIG = {
  MODEL: "gpt-4o-mini",
  EXTRACTION_MODEL: "gpt-4o-mini",
  DEFAULT_TEMPERATURE: 0.3,
  DEFAULT_MAX_TOKENS: 150,
  EXTRACTION_MAX_TOKENS: 200,
  CONVERSATION_HISTORY_LIMIT: 20, // messages to keep (10 exchanges)
  PRESENCE_PENALTY: 0.6,
  FREQUENCY_PENALTY: 0.8,
};

const LANGUAGE_CODES = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  bn: "Bengali",
  mr: "Marathi",
  gu: "Gujarati",
  pa: "Punjabi",
  es: "Spanish",
  fr: "French",
  de: "German",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
};

const RETRY_PHRASES = [
  "I didn't catch that. Could you please repeat?",
  "Sorry, I couldn't hear you clearly. Can you say that again?",
  "I'm having trouble hearing you. Could you repeat your answer?",
  "Pardon me, could you please say that again?",
];

// System prompts as constants for reusability
const EXTRACTION_SYSTEM_PROMPT = `Extract customer information and requirements from the text. Return ONLY a valid JSON object.

STANDARD CUSTOMER FIELDS (extract if present):
- name: Customer's name (first name, last name, or full name)
- phone: Mobile number (10 digits for India, starting with 6-9)
- email: Email address
- address: Physical address or location
- pincode: Postal/ZIP code (6 digits in India)
- model: Product/service identifier (car model, property type, course name, etc.)
- orderDetails: Any domain-specific requirements (budget, preferences, specifications)

CRITICAL RULES:
1. Even if the user provides ONLY a name like "John" or "Rahul" → extract it as {"name": "John"}
2. Even if the user provides ONLY a number like "9876543210" → extract as {"phone": "9876543210"}
3. Even if the user provides ONLY a pincode like "305001" → extract as {"pincode": "305001"}
4. If user says just a product name like "Magnus EX" → extract as {"model": "Magnus EX"}
5. In conversation, users often answer questions with short responses - extract them!
6. Extract names from greetings: "Hello I'm Rahul" → {"name": "Rahul"}
7. Extract names from introductions: "Hi, this is John" → {"name": "John"}
8. Extract names from "My name is X" or "I am X" patterns

NAME EXTRACTION PATTERNS:
- "Hello I'm Rahul" → {"name": "Rahul"}
- "Hi this is John speaking" → {"name": "John"}
- "My name is Priya" → {"name": "Priya"}
- "I am Kumar" → {"name": "Kumar"}
- Just "Rahul" (if it's a response to name question) → {"name": "Rahul"}

PHONE NUMBER EXTRACTION:
- Extract 10-digit Indian mobile numbers (starting with 6-9)
- Handle formats: "9876543210", "98765 43210", "987-654-3210", "+91 9876543210"
- **IMPORTANT**: Handle speech-to-text artifacts where spaces are added between digits
- Remove all spaces, hyphens, and country codes to get clean 10 digits

PINCODE EXTRACTION:
- Extract 6-digit Indian pincodes (starting with 1-9)
- **IMPORTANT**: Handle speech-to-text artifacts where spaces are added: "3 05001" should extract as "305001"
- Remove all spaces before validation

EXAMPLES:
Full sentence: "I'm Priya, need red dress size M, my number is 9876543210" → {"name": "Priya", "phone": "9876543210", "orderDetails": {"product": "red dress", "size": "M"}}
Short answer: "John" → {"name": "John"}
Short answer: "John Doe" → {"name": "John Doe"}
Short answer: "9876543210" → {"phone": "9876543210"}
Short answer: "305001" → {"pincode": "305001"}
Short answer: "Magnus EX" → {"model": "Magnus EX"}
Full sentence: "I am Rahul, want to test ride Magnus EX, pincode 305001" → {"name": "Rahul", "pincode": "305001", "model": "Magnus EX"}
No info: "Yes" → {}
No info: "Okay" → {}
No info: "I want to book a test ride" → {}

If no customer-specific info found, return {}
Be flexible - extract whatever information is relevant to the user's identity or requirements.`;

// ============================================================================
// MEMORY BLOCK BUILDER
// ============================================================================

/**
 * Build memory block from collected data
 * This is injected into the system prompt to prevent the LLM from forgetting information
 *
 * @param {object} collectedData - Data collected from previous conversation turns
 * @returns {string} Formatted memory block or empty string
 */
function buildMemoryBlock(collectedData) {
  if (!collectedData || Object.keys(collectedData).length === 0) {
    return "";
  }

  const lines = Object.entries(collectedData).map(
    ([key, value]) => `- ${key}: ${value}`,
  );

  return `
COLLECTED INFORMATION (Authoritative – DO NOT ASK AGAIN):
${lines.join("\n")}

Rules:
- These values are CONFIRMED
- Never ask for them again
- If user repeats them, acknowledge briefly and continue
`;
}

// ============================================================================
// AI AGENT SERVICE CLASS
// ============================================================================

class AIAgentService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.isConfigured = !!process.env.OPENAI_API_KEY;

    if (!this.isConfigured) {
      console.warn("⚠️  OpenAI not configured. Add OPENAI_API_KEY to .env");
    }
  }

  // ============================================================================
  // V5: COMPLETE FLOW WITH RESPONSE CONTRACT (FINAL PRODUCTION VERSION)
  // This eliminates script jumping by enforcing HARD output contracts
  // ============================================================================

  /**
   * Process message with COMPLETE flow + response contract enforcement
   *
   * FLOW:
   * User input
   *   ↓
   * intentClassifier (only if ActiveUseCase == NULL)
   *   ↓
   * slotExtractor
   *   ↓
   * inputValidator
   *   ↓
   * stateEngine.advance() OR repeatStep()
   *   ↓
   * responseContract.validate()
   *   ↓
   * TTS
   *
   * If contract validation fails → retry LLM with stricter instruction
   * NEVER accept malformed output
   *
   * @param {string} userMessage - User's spoken text (null for first turn)
   * @param {string} conversationId - Unique conversation ID
   * @param {object} options - { useCase, language, agentId }
   * @returns {Promise<object>} Contract-validated response
   */
  async processMessageV5(userMessage, conversationId, options = {}) {
    const {
      useCase = null, // null = auto-detect via intent
      language = "en",
      agentId = null,
    } = options;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🚀 V5 COMPLETE FLOW | Conversation: ${conversationId}`);
    console.log(`📝 User: "${userMessage || "(first turn)"}"`);
    console.log(`${"=".repeat(60)}`);

    try {
      // ========================================
      // STEP 1: INTENT CLASSIFICATION
      // Only if useCase is null (need to detect flow)
      // ========================================
      let effectiveUseCase = useCase;

      if (!effectiveUseCase && userMessage) {
        const intentResult = await intentClassifier.classifyIntentSmart(
          userMessage,
          {
            useCase: null,
            openaiClient: this.openai,
          },
        );

        console.log(
          `🎯 Intent: ${intentResult.intent} (source: ${intentResult.source})`,
        );

        effectiveUseCase = intentClassifier.mapIntentToUseCase(
          intentResult.intent,
        );

        // Handle special intents
        if (intentClassifier.shouldEscalate(intentResult.intent)) {
          return {
            response:
              language === "hi"
                ? "मैं आपको एक एजेंट से जोड़ती हूँ।"
                : "Let me connect you with an agent.",
            language,
            status: "escalated",
            conversationId,
            _source: "intent_escalation",
          };
        }
      }

      // Default use case
      effectiveUseCase = effectiveUseCase || "automotive_sales";

      // ========================================
      // STEP 2: SLOT EXTRACTION + VALIDATION
      // Extract ONLY what current step needs
      // ========================================
      const state = stateEngine.getOrCreateState(
        conversationId,
        effectiveUseCase,
        { language, agentId },
      );
      const currentStep = stateEngine.getCurrentStep(state);

      if (userMessage && currentStep) {
        // Extract slots for current step
        const slots = slotExtractor.extractSlotsByExpects(
          currentStep,
          userMessage,
        );

        if (Object.keys(slots).length > 0) {
          console.log(`📦 Slots extracted:`, slots);
          stateEngine.updateData(conversationId, slots);
        }

        // Handle yes/no for confirm steps
        if (currentStep.type === "confirm") {
          const confirmation = slotExtractor.classifyConfirmation(userMessage);
          console.log(`✅ Confirmation: ${confirmation}`);
        }
      }

      // ========================================
      // STEP 3: STATE ENGINE ADVANCE
      // This returns the text from JSON - no LLM yet
      // ========================================
      const result = stateEngine.processTurn(conversationId, userMessage, {
        useCase: effectiveUseCase,
        language,
        agentId,
      });

      console.log(`🎯 Step: ${result.stepId} | Status: ${result.status}`);

      // ========================================
      // STEP 4: RESPONSE CONTRACT VALIDATION
      // Ensure the text passes our strict contract
      // ========================================
      if (result.text) {
        // For JSON flow text, validate against contract
        const contractResult = responseContract.extractResponse(
          JSON.stringify({ type: "SPEAK", text: result.text }),
        );

        if (contractResult.success) {
          console.log(
            `✅ Contract validated: "${contractResult.text.substring(
              0,
              50,
            )}..."`,
          );

          return {
            response: contractResult.text,
            language: result.language,

            // State
            conversationId,
            currentStepId: result.stepId,
            stepType: result.stepType,
            useCase: effectiveUseCase,
            status: result.status,

            // Data
            customerContext: result.data,

            // Validation
            validationError: result.validationError,
            retryCount: result.retryCount,

            // Flags
            isEnd: result.isEnd,
            isComplete: result.status === "complete",
            isEscalated: result.status === "escalated",

            // Agent
            agentConfig: result.agentConfig,

            // Contract info
            _contract: {
              validated: true,
              source: "state_engine",
              llmUsed: false,
            },
          };
        } else {
          // Contract failed - this shouldn't happen with JSON flow text
          // but handle it gracefully
          console.warn(`⚠️ Contract validation failed:`, contractResult.errors);

          // Use sanitized text if available
          const fallbackText =
            responseContract.validateResponse(
              JSON.stringify({ type: "SPEAK", text: result.text }),
            ).sanitized?.text || result.text;

          return {
            response: fallbackText,
            language: result.language,
            conversationId,
            currentStepId: result.stepId,
            status: result.status,
            _contract: {
              validated: false,
              errors: contractResult.errors,
            },
          };
        }
      }

      // ========================================
      // STEP 5: FLOW COMPLETE - Handle dynamic
      // ========================================
      return {
        response:
          language === "hi"
            ? "धन्यवाद! क्या मैं आपकी और कोई मदद कर सकती हूँ?"
            : "Thank you! Is there anything else I can help you with?",
        language,
        conversationId,
        currentStepId: "flow_complete",
        status: "complete",
        customerContext: result.data,
        _contract: {
          validated: true,
          source: "default_closing",
        },
      };
    } catch (error) {
      console.error("❌ V5 error:", error.message);

      return {
        response:
          language === "hi"
            ? "माफ़ कीजिए, कुछ समस्या हुई।"
            : "I apologize, something went wrong.",
        language,
        conversationId,
        status: "escalated",
        _contract: {
          validated: false,
          error: error.message,
        },
      };
    }
  }

  /**
   * Call LLM with contract enforcement (simple version)
   * Used only for dynamic/RAG responses
   *
   * @param {string} instruction - What to say
   * @param {boolean} isRetry - Is this a retry?
   * @returns {Promise<string>} Contract-validated text
   */
  async callLLMWithContract(instruction, isRetry = false) {
    const prompt = responseContract.buildContractPrompt(instruction, isRetry);

    const response = await this.openai.chat.completions.create({
      model: AI_CONFIG.MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 100,
      response_format: { type: "json_object" },
    });

    const rawOutput = response.choices[0].message.content;
    const extracted = responseContract.extractResponse(rawOutput);

    if (extracted.success) {
      return extracted.text;
    }

    // Retry with stricter prompt
    if (!isRetry) {
      console.log(`⚠️ Contract failed, retrying with strict prompt...`);
      return await this.callLLMWithContract(instruction, true);
    }

    // Return the instruction as fallback
    console.error(`❌ Contract failed twice, using fallback`);
    return instruction;
  }

  /**
   * Get LLM response with CONTROLLED RETRY STRATEGY
   *
   * RETRY RULES:
   * - Max retries: 2
   * - Retry only if: JSON parse fails OR schema validation fails
   * - Never infinite retries
   * - Never fallback to free text
   *
   * @param {string} prompt - The prompt to send
   * @returns {Promise<object>} Validated response { type, text }
   * @throws {Error} After max retries exceeded
   */
  async getLLMResponseWithRetry(prompt) {
    const MAX_RETRIES = 2;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`🤖 LLM attempt ${attempt}/${MAX_RETRIES}`);

        // Call LLM
        const response = await this.openai.chat.completions.create({
          model: AI_CONFIG.MODEL,
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          max_tokens: 100,
          response_format: { type: "json_object" },
        });

        const rawOutput = response.choices[0].message.content;

        // Parse (throws on failure)
        const parsed = outputParser.parseLLMOutput(rawOutput);

        // Validate (throws on failure)
        const validated = responseContract.validateLLMResponse(parsed);

        console.log(
          `✅ LLM response validated: "${validated.text?.substring(0, 40)}..."`,
        );
        return validated;
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ Attempt ${attempt} failed: ${error.message}`);

        // Modify prompt for retry with stricter instruction
        if (attempt < MAX_RETRIES) {
          prompt = `STRICT: ${prompt}\n\nPrevious attempt failed. Output ONLY valid JSON.`;
        }
      }
    }

    // Max retries exceeded - throw the error
    console.error(
      `❌ LLM failed after ${MAX_RETRIES} attempts: ${lastError?.message}`,
    );
    throw lastError;
  }

  /**
   * Get LLM response for a specific step text
   * Uses minimal prompt + retry strategy
   *
   * @param {string} stepText - The text the agent should speak
   * @returns {Promise<string>} Validated spoken text
   */
  async getStepResponse(stepText) {
    const prompt = promptBuilder.buildStepPromptV2(stepText);

    try {
      const response = await this.getLLMResponseWithRetry(prompt);
      return response.text;
    } catch (error) {
      // On complete failure, return the original step text
      console.error(`❌ LLM completely failed, using original text`);
      return stepText;
    }
  }

  // ============================================================================
  // V4: CLEAN ORCHESTRATOR (Refactored Architecture - LEGACY)
  // Uses: flowRegistry + stateEngine + promptBuilder + inputValidator + outputParser
  // ============================================================================

  /**
   * Process message using the CLEAN ORCHESTRATED architecture
   *
   * ARCHITECTURE:
   * - flowRegistry: Loads JSON flows (data, not code)
   * - stateEngine: Executes steps, transitions, retries (LLM has ZERO control)
   * - promptBuilder: Builds minimal prompts (only if LLM needed)
   * - inputValidator: Validates user input in backend
   * - outputParser: Parses LLM output strictly
   *
   * LLM is ONLY used for:
   * - Dynamic queries after flow complete
   * - RAG-based knowledge queries
   * - NOT for flow text - that comes from JSON
   *
   * @param {string} userMessage - User's spoken text (null for first turn)
   * @param {string} conversationId - Unique conversation ID
   * @param {object} options - { useCase, language, agentId, useRAG }
   * @returns {Promise<object>} { response, language, stepId, data, status }
   */
  async processMessageV4(userMessage, conversationId, options = {}) {
    const {
      useCase = "automotive_sales",
      language = "en",
      agentId = null,
      useRAG = false,
    } = options;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🚀 V4 ORCHESTRATOR | Conversation: ${conversationId}`);
    console.log(`📝 User: "${userMessage || "(first turn)"}"`);
    console.log(`📋 UseCase: ${useCase} | Lang: ${language}`);
    console.log(`${"=".repeat(60)}`);

    try {
      // ========================================
      // STEP 1: Execute state engine turn
      // This returns text from JSON - NO LLM CALL
      // ========================================
      const result = stateEngine.processTurn(conversationId, userMessage, {
        useCase,
        language,
        agentId,
      });

      console.log(`🎯 Step: ${result.stepId} | Status: ${result.status}`);
      console.log(`📝 Text: "${result.text?.substring(0, 50)}..."`);

      // ========================================
      // STEP 2: If flow provided text, return directly
      // NO LLM CALL NEEDED
      // ========================================
      if (result.text) {
        return {
          response: result.text,
          language: result.language,

          // State
          conversationId,
          currentStepId: result.stepId,
          stepType: result.stepType,
          useCase,
          status: result.status,

          // Data
          customerContext: result.data,

          // Validation
          validationError: result.validationError,
          retryCount: result.retryCount,

          // Flags
          isEnd: result.isEnd,
          isComplete: result.status === "complete",
          isEscalated: result.status === "escalated",

          // Agent
          agentConfig: result.agentConfig,

          // Debug
          _source: "state_engine",
          _llmUsed: false,
        };
      }

      // ========================================
      // STEP 3: Flow complete - handle dynamic queries
      // ========================================
      if (result.status === "complete" && useRAG && userMessage) {
        console.log(`🔍 Flow complete - using RAG for dynamic query`);

        const ragResponse = await this.getRAGResponse(
          userMessage,
          [],
          `You are ${result.agentConfig?.name || "an assistant"
          }. Answer briefly.`,
          { agentId },
        );

        if (ragResponse) {
          return {
            response: ragResponse,
            language: result.language,
            conversationId,
            currentStepId: "rag_response",
            useCase,
            status: "complete",
            customerContext: result.data,
            agentConfig: result.agentConfig,
            _source: "rag",
            _llmUsed: true,
          };
        }
      }

      // ========================================
      // STEP 4: Default response for completed flow
      // ========================================
      return {
        response:
          language === "hi"
            ? "धन्यवाद! क्या मैं आपकी और कोई मदद कर सकती हूँ?"
            : "Thank you! Is there anything else I can help you with?",
        language: result.language || language,
        conversationId,
        currentStepId: "flow_complete",
        useCase,
        status: "complete",
        customerContext: result.data,
        agentConfig: result.agentConfig,
        _source: "default_closing",
        _llmUsed: false,
      };
    } catch (error) {
      console.error("❌ V4 Orchestrator error:", error.message);

      return {
        response:
          language === "hi"
            ? "माफ़ कीजिए, कुछ समस्या हुई। मैं आपको किसी से जोड़ती हूँ।"
            : "I apologize, something went wrong. Let me connect you with someone.",
        language,
        conversationId,
        currentStepId: "error",
        status: "escalated",
        _source: "error_fallback",
        _error: error.message,
      };
    }
  }

  /**
   * Get available use cases (flows)
   */
  getAvailableUseCases() {
    return flowRegistry.getAvailableFlows();
  }

  /**
   * Get flow metadata
   */
  getFlowMetadata(useCase) {
    return flowRegistry.getFlowMetadata(useCase);
  }

  /**
   * Get all flows metadata
   */
  getAllFlowsMetadata() {
    return flowRegistry.getAllFlowsMetadata();
  }

  // ============================================================================
  // V3: JSON-DRIVEN FLOW ENGINE (DEPRECATED - Use V4)
  // NO LLM NEEDED FOR FLOW TEXT - Everything comes from JSON
  // ============================================================================

  /**
   * Process message using JSON-driven flow engine
   *
   * KEY DIFFERENCE FROM V2:
   * - V2: Uses LLM to generate response text
   * - V3: Uses pre-defined JSON flow text (NO LLM for flows!)
   *
   * LLM is ONLY used for:
   * - Dynamic queries not covered by flow
   * - RAG-based knowledge queries
   *
   * @param {string} userMessage - User's spoken text (null for first turn)
   * @param {string} sessionId - Unique session identifier
   * @param {object} options - { useCase, language, useRAG, agentId }
   * @returns {Promise<object>} { response, language, stepId, data, isEnd }
   */
  async processMessageV3(userMessage, sessionId, options = {}) {
    try {
      const {
        useCase = "automotive_sales",
        language = "en",
        useRAG = false,
        agentId = null,
      } = options;

      console.log(`\n${"=".repeat(60)}`);
      console.log(`🚀 processMessageV3 (JSON Flow) | Session: ${sessionId}`);
      console.log(`📝 User: "${userMessage || "(first turn)"}"`);
      console.log(`📋 UseCase: ${useCase}`);
      console.log(`${"=".repeat(60)}`);

      // ========================================
      // STEP 1: Execute flow turn
      // This returns the EXACT text from JSON - no LLM needed!
      // ========================================
      const flowResult = flowEngine.processTurn(sessionId, userMessage, {
        useCase,
        language,
      });

      console.log(`🎯 Step: ${flowResult.stepId} (${flowResult.stepType})`);
      console.log(`📝 Flow text: "${flowResult.text?.substring(0, 50)}..."`);

      // ========================================
      // STEP 2: Check if flow handled it
      // ========================================
      if (flowResult.text) {
        // Flow provided the response - return directly
        // NO LLM CALL NEEDED!

        return {
          response: flowResult.text,
          language: flowResult.language,

          // State
          currentStepId: flowResult.stepId,
          stepType: flowResult.stepType,
          useCase,

          // Data
          customerContext: flowResult.data,

          // Status
          isFlowComplete: flowResult.isComplete || false,
          isEscalated: flowResult.isEscalated || false,
          isEnd: flowResult.isEnd || false,

          // Validation
          validationError: flowResult.validationError,
          retryCount: flowResult.retryCount,

          // Agent
          agentConfig: flowResult.agentConfig,

          // Debug
          _debug: {
            source: "flow_engine",
            llmUsed: false,
          },
        };
      }

      // ========================================
      // STEP 3: Flow complete or needs dynamic response
      // Use LLM for RAG/dynamic queries
      // ========================================
      if (useRAG && userMessage) {
        console.log(`🔍 Flow complete/dynamic - using RAG`);

        const ragResponse = await this.getRAGResponse(
          userMessage,
          [], // No history needed
          `You are ${flowResult.agentConfig?.name || "an assistant"
          }. Answer briefly.`,
          { agentId },
        );

        if (ragResponse) {
          return {
            response: ragResponse,
            language,
            currentStepId: "rag_response",
            stepType: "dynamic",
            useCase,
            customerContext: flowResult.data,
            isFlowComplete: true,
            _debug: {
              source: "rag",
              llmUsed: true,
            },
          };
        }
      }

      // ========================================
      // STEP 4: Default closing
      // ========================================
      return {
        response:
          "Thank you for your time. Is there anything else I can help you with?",
        language,
        currentStepId: "flow_complete",
        stepType: "closing",
        useCase,
        customerContext: flowResult.data,
        isFlowComplete: true,
        _debug: {
          source: "default_closing",
          llmUsed: false,
        },
      };
    } catch (error) {
      console.error("❌ processMessageV3 error:", error);

      // Graceful fallback
      return {
        response:
          "I apologize for the inconvenience. Let me connect you with someone who can help.",
        language: options.language || "en",
        currentStepId: "error",
        isEscalated: true,
        _debug: {
          source: "error_fallback",
          error: error.message,
        },
      };
    }
  }

  /**
   * Get available use cases (flows)
   */
  getAvailableUseCases() {
    return flowEngine.getAvailableFlows();
  }

  // ============================================================================
  // V2: 3-PROMPT ARCHITECTURE (Bolna.ai style)
  // ALL RULES ENFORCED IN BACKEND - LLM NEVER SEES RULES
  // ============================================================================

  /**
   * Process user message using 3-Prompt Architecture
   *
   * KEY PRINCIPLES:
   * 1. ALL RULES enforced in backend BEFORE LLM is called
   * 2. State is EXPLICIT, never inferred from data
   * 3. LLM only sees: System prompt + Persona + ONE step instruction
   * 4. LLM never gets a chance to violate rules
   *
   * @param {string} userMessage - User's spoken text
   * @param {string} sessionId - Unique session identifier (for state machine)
   * @param {object} options - Configuration options
   * @returns {Promise<object>} Response with state updates
   */
  async processMessageV2(userMessage, sessionId, options = {}) {
    try {
      const {
        agentScript = "",
        agentConfig = {},
        language = "en",
        temperature = 0.3,
        maxTokens = 100,
        model = AI_CONFIG.MODEL,
      } = options;

      console.log(`\n${"=".repeat(60)}`);
      console.log(`🚀 processMessageV2 | Session: ${sessionId}`);
      console.log(`📝 User: "${userMessage}"`);
      console.log(`${"=".repeat(60)}`);

      // ========================================
      // STEP 1: Initialize or retrieve state
      // ========================================
      const state = stateMachine.getOrCreateState(sessionId, agentScript, {
        ...agentConfig,
        language,
        useCase: agentConfig.useCase || "general",
      });

      console.log(
        `📊 State: Step ${state.stepIndex + 1}/${state.totalSteps} | ${state.currentStepId
        }`,
      );
      console.log(`🔒 Forbidden steps: [${state.forbiddenSteps.join(", ")}]`);

      // ========================================
      // STEP 2: Handle unclear/empty input
      // RULE: Max 2 retries, then escalate
      // ========================================
      if (this.isUnclearInput(userMessage)) {
        const { maxRetriesExceeded, retryCount } =
          stateMachine.incrementRetry(sessionId);

        if (maxRetriesExceeded) {
          // RULE ENFORCED: Escalate after max retries
          console.log(`🚨 RULE ENFORCED: Max retries exceeded → Escalating`);
          return {
            response:
              "I'm having trouble understanding. Let me connect you with a human agent who can help.",
            state: stateMachine.getStateSummary(sessionId),
            isEscalated: true,
            currentStep: "escalated",
          };
        }

        console.log(`🔄 Retry ${retryCount}/${stateMachine.RULES.MAX_RETRIES}`);
        return {
          response: "I didn't catch that clearly. Could you please repeat?",
          state: stateMachine.getStateSummary(sessionId),
          isRetry: true,
          retryCount,
        };
      }

      // ========================================
      // STEP 3: Detect language switch request
      // RULE: Only switch if not locked
      // ========================================
      const requestedLanguage = this.detectLanguageSwitchRequest(userMessage);

      // ========================================
      // STEP 4: ENFORCE ALL RULES BEFORE LLM
      // This is where backend takes control
      // ========================================
      const enforcement = stateMachine.enforceRulesBeforeLLM(
        sessionId,
        userMessage,
        requestedLanguage,
      );

      // If rules say don't proceed, return immediately (LLM never called)
      if (!enforcement.proceed) {
        console.log(`🛑 RULE ENFORCED: ${enforcement.action}`);
        return {
          response: enforcement.response,
          state: stateMachine.getStateSummary(sessionId),
          action: enforcement.action,
          isEscalated: enforcement.action.includes("escalate"),
        };
      }

      const effectiveLanguage = enforcement.effectiveLanguage || state.language;
      console.log(`🌐 Effective language: ${effectiveLanguage}`);

      // ========================================
      // STEP 5: VALIDATE USER INPUT (NOT LLM OUTPUT)
      // Backend validates, backend decides
      // ========================================
      const currentRequirements =
        stateMachine.getCurrentStepRequirements(sessionId);

      let validationResult = { allValid: true, validatedData: {}, errors: {} };
      let shouldRepeatStep = false;
      let validationError = null;

      if (currentRequirements.length > 0) {
        // This is a data collection step - VALIDATE USER INPUT
        console.log(
          `🔍 Validating input for: ${currentRequirements.join(", ")}`,
        );

        validationResult = inputValidator.validateStepInput(
          currentRequirements,
          userMessage,
          state.customerData,
        );

        if (!validationResult.allValid) {
          // ❌ VALIDATION FAILED - Repeat same step
          shouldRepeatStep = true;
          validationError = Object.values(validationResult.errors)[0];
          console.log(`❌ Validation FAILED: ${validationError}`);

          // Increment retry for this step
          const { maxRetriesExceeded } = stateMachine.incrementRetry(sessionId);
          if (maxRetriesExceeded) {
            console.log(`🚨 Max retries on validation → Escalating`);
            return {
              response:
                "I'm having trouble getting the right information. Let me connect you with someone who can help.",
              state: stateMachine.getStateSummary(sessionId),
              isEscalated: true,
            };
          }
        } else {
          // ✅ VALIDATION PASSED - Update data
          if (Object.keys(validationResult.newData).length > 0) {
            stateMachine.updateCustomerData(
              sessionId,
              validationResult.newData,
            );
            console.log(
              `✅ Validated data: ${JSON.stringify(validationResult.newData)}`,
            );
          }
        }
      } else {
        // Non-data step - try to extract any data anyway (opportunistic)
        const opportunisticData = inputValidator.extractAllData(userMessage);
        if (Object.keys(opportunisticData).length > 0) {
          stateMachine.updateCustomerData(sessionId, opportunisticData);
          console.log(
            `📦 Opportunistic data: ${JSON.stringify(opportunisticData)}`,
          );
        }
      }

      // ========================================
      // STEP 6: DECIDE: Advance or Repeat?
      // Backend makes this decision, not LLM
      // ========================================
      let stepComplete = false;

      if (shouldRepeatStep) {
        // Stay on same step - validation failed
        stepComplete = false;
        console.log(`🔄 Repeating step: ${state.currentStepId}`);
      } else if (currentRequirements.length > 0) {
        // Data collection step - check if all required data is NOW collected
        const updatedState = stateMachine.getState(sessionId);
        stepComplete = currentRequirements.every(
          (field) => updatedState.customerData[field],
        );

        if (stepComplete) {
          console.log(
            `✅ Step requirements VALIDATED: ${currentRequirements.join(", ")}`,
          );
        }
      } else {
        // Non-data step (greeting, confirmation, etc.) - advance on valid response
        stepComplete = true;
      }

      // ========================================
      // STEP 7: EXPLICITLY advance state
      // ❌ NEVER infer state from data
      // ✅ ALWAYS advance explicitly after VALIDATION passes
      // ========================================
      if (stepComplete && !stateMachine.isFlowComplete(sessionId)) {
        stateMachine.advanceStep(sessionId);
        console.log(`➡️ State EXPLICITLY advanced (validation passed)`);
      }

      // ========================================
      // STEP 8: Check for confirmation step
      // RULE: Only confirm once
      // ========================================
      const finalState = stateMachine.getState(sessionId);
      if (finalState.currentStepId === "confirm_details") {
        if (!stateMachine.canConfirm(sessionId)) {
          // RULE ENFORCED: Skip confirmation if already done
          console.log(`🚫 RULE ENFORCED: Confirmation already done → Skipping`);
          stateMachine.advanceStep(sessionId);
        } else {
          // Mark that we're doing confirmation
          stateMachine.markConfirmationDone(sessionId);
        }
      }

      // ========================================
      // STEP 9: Build minimal prompt (3-prompt architecture)
      // LLM only sees: System + Persona + Current Step
      // ❌ NO future steps, NO past steps, NO collected data
      // ========================================
      const postAdvanceState = stateMachine.getState(sessionId);

      // Determine what instruction to send
      let stepInstruction;
      if (shouldRepeatStep && validationError) {
        // Validation failed - use retry prompt with error
        const failedField = currentRequirements[0];
        stepInstruction = promptBuilder.getRetryPrompt(
          failedField,
          validationError,
        );
        console.log(`🔄 Using retry prompt for: ${failedField}`);
      } else {
        // Normal step instruction
        stepInstruction = promptBuilder.getStepInstruction(
          postAdvanceState.currentStepId,
          postAdvanceState.stepDetails?.[postAdvanceState.stepIndex]
            ?.instruction,
        );
      }

      // Build MINIMAL prompt - only current instruction
      const promptConfig = promptBuilder.buildConversationPrompt({
        agentConfig: postAdvanceState.agentConfig,
        stepConfig: {
          instruction: stepInstruction,
          language: effectiveLanguage,
          customerName: postAdvanceState.customerData?.name || null, // Only name for personalization
        },
      });

      console.log(`🎯 Step: ${postAdvanceState.currentStepId}`);
      console.log(`📝 Instruction: "${stepInstruction.substring(0, 50)}..."`);
      console.log(`📊 Prompt tokens: ~${promptConfig.metadata.totalTokens}`);

      // ========================================
      // STEP 10: Call LLM with JSON output format
      // LLM MUST return: {"spoken_text": "...", "language": "..."}
      // ========================================
      const response = await this.openai.chat.completions.create({
        model,
        messages: promptConfig.messages,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" }, // Force JSON output
      });

      const rawResponse = response.choices[0].message.content;
      console.log(`🤖 Raw LLM output: ${rawResponse.substring(0, 100)}...`);

      // ========================================
      // STEP 11: PARSE WITH STRICT OUTPUT CONTRACT
      // Extract spoken_text, discard everything else
      // ========================================
      const parsed = outputParser.parseResponse(
        rawResponse,
        effectiveLanguage,
        stepInstruction, // Fallback if parsing fails
      );

      console.log(
        `✅ Parsed: "${parsed.spoken_text.substring(0, 50)}..." (${parsed.language
        })`,
      );

      if (!parsed.parsed) {
        console.log(`⚠️ JSON parsing failed - used extraction/fallback`);
      }

      // ========================================
      // STEP 12: Return response with EXPLICIT state
      // ========================================
      const stateForResponse = stateMachine.getStateSummary(sessionId);

      return {
        // STRICT OUTPUT - Only spoken_text matters
        response: parsed.spoken_text,

        // EXPLICIT STATE (Non-Negotiable)
        state: stateForResponse,
        currentStepId: stateForResponse.currentStepId,
        stepIndex: stateForResponse.stepIndex,
        useCase: stateForResponse.useCase,
        language: parsed.language || effectiveLanguage,

        // Data
        customerContext: postAdvanceState.customerData,

        // Status
        isFlowComplete: stateMachine.isFlowComplete(sessionId),
        isEscalated: stateMachine.isEscalated(sessionId),

        // Language switch (if happened)
        languageSwitch:
          requestedLanguage && stateMachine.canSwitchLanguage(sessionId)
            ? requestedLanguage
            : null,

        // Debug info
        _debug: {
          rawResponse: rawResponse.substring(0, 200),
          jsonParsed: parsed.parsed,
          fallbackUsed: parsed.fallback || false,
        },
      };
    } catch (error) {
      console.error("❌ processMessageV2 error:", error);
      throw new Error(`Failed to process message: ${error.message}`);
    }
  }

  /**
   * Check if user input is unclear/empty
   */
  isUnclearInput(message) {
    if (!message || typeof message !== "string") return true;
    const trimmed = message.trim();
    if (trimmed.length < 2) return true;
    if (/^[\s\p{P}]+$/u.test(trimmed)) return true; // Only punctuation
    if (/^(um|uh|hmm|err|ah|huh)+$/i.test(trimmed)) return true; // Filler words
    return false;
  }

  /**
   * Detect if user is requesting a language switch
   */
  detectLanguageSwitchRequest(message) {
    const messageLower = message.toLowerCase();

    // English patterns
    if (
      messageLower.includes("switch to hindi") ||
      messageLower.includes("speak hindi") ||
      messageLower.includes("in hindi")
    ) {
      return "hi";
    }
    if (
      messageLower.includes("switch to english") ||
      messageLower.includes("speak english") ||
      messageLower.includes("in english")
    ) {
      return "en";
    }

    // Hindi patterns
    if (
      messageLower.includes("हिंदी में") ||
      messageLower.includes("हिन्दी में")
    ) {
      return "hi";
    }
    if (
      messageLower.includes("अंग्रेजी में") ||
      messageLower.includes("english में")
    ) {
      return "en";
    }

    // Tamil
    if (messageLower.includes("தமிழில்") || messageLower.includes("in tamil")) {
      return "ta";
    }

    // Telugu
    if (
      messageLower.includes("తెలుగులో") ||
      messageLower.includes("in telugu")
    ) {
      return "te";
    }

    return null;
  }

  // ============================================================================
  // LEGACY METHOD - DEPRECATED
  // ============================================================================

  /**
   * @deprecated ⚠️ LEGACY - Use processMessageV2() instead
   *
   * This method uses the old "monster prompt" architecture that sends
   * the FULL script to the LLM. It does not follow flows correctly.
   *
   * Keeping for backward compatibility during migration.
   *
   * @param {string} userMessage - User's spoken text
   * @param {string} agentId - Agent configuration ID
   * @param {object} customerContext - Customer information (name, email, phone, etc.)
   * @param {array} conversationHistory - Recent conversation messages
   * @param {object} options - Additional options (language, useRAG, etc.)
   * @returns {Promise<object>} Object containing response text and updated customer context
   */
  async processMessage(
    userMessage,
    agentId = "default",
    customerContext = {},
    conversationHistory = [],
    options = {},
  ) {
    try {
      const {
        language = "en",
        useRAG = false,
        systemPrompt = "You are a helpful AI assistant for a CRM system.",
        temperature = 0.4,
        maxTokens = 150,
        provider = "openai", // 'openai' or 'agentforce'
        isRetry = false, // Flag to indicate if this is a retry after no/unclear response
        lastQuestion = null, // The last question that was asked
      } = options;

      // ============================================================================
      // LOAD AGENT SLOTS FOR DYNAMIC EXTRACTION (NEW - Hybrid Approach)
      // ============================================================================
      let agentSlots = [];
      if (agentId && agentId !== "default") {
        try {
          const Agent = (await import("../models/Agent.js")).default;
          const agent = await Agent.findById(agentId);
          if (agent && agent.requiredSlots && agent.requiredSlots.length > 0) {
            agentSlots = agent.requiredSlots;
            console.log(
              `📋 Loaded ${agentSlots.length} dynamic slots for agent ${agentId}`,
            );
          }
        } catch (error) {
          console.warn(
            "⚠️  Could not load agent slots, using universal extraction:",
            error.message,
          );
        }
      }

      // Handle empty/unclear user input (silence, distortion, STT failure)
      // Note: Accept Unicode for multi-language support (Hindi, Tamil, etc.)
      const isEmptyOrUnclear =
        !userMessage ||
        userMessage.trim().length < 2 ||
        /^[\s\p{P}]+$/u.test(userMessage) || // Only whitespace/punctuation (Unicode-aware)
        userMessage.toLowerCase().match(/^(um|uh|hmm|err|ah)+$/); // Just filler words

      if (isEmptyOrUnclear && lastQuestion) {
        // User didn't respond clearly - re-ask the question
        const retryPrompt =
          RETRY_PHRASES[Math.floor(Math.random() * RETRY_PHRASES.length)];

        return {
          response: `${retryPrompt} ${lastQuestion}`,
          customerContext: customerContext, // Return unchanged context
          languageSwitch: null,
          isRetry: true,
        };
      }

      if (isEmptyOrUnclear && !lastQuestion) {
        // No clear input and no previous question - generic prompt
        return {
          response:
            "I'm sorry, I didn't catch that. Could you please speak clearly?",
          customerContext: customerContext, // Return unchanged context
          languageSwitch: null,
          isRetry: true,
        };
      }

      // If Agentforce is selected, route there (with translation wrapper)
      if (provider === "agentforce") {
        // Extract customer info even for Agentforce
        const updatedContext = await this.extractCustomerInfo(
          userMessage,
          customerContext,
          agentSlots, // Pass dynamic slots
        );

        const agentforceResponse = await this.getAgentforceResponse(
          userMessage,
          language,
          {
            useRAG,
            customerContext: updatedContext,
            agentId,
            conversationHistory,
            systemPrompt,
          },
        );

        return {
          ...agentforceResponse,
          customerContext: updatedContext,
        };
      }

      const currentLanguageName = LANGUAGE_CODES[language] || "English";

      // Extract customer info from the current message FIRST
      const updatedContext = await this.extractCustomerInfo(
        userMessage,
        customerContext,
        agentSlots, // Pass dynamic slots
      );

      // Preserve originalQuery and conversationIntent if they already exist
      if (customerContext.originalQuery && !updatedContext.originalQuery) {
        updatedContext.originalQuery = customerContext.originalQuery;
      }
      if (
        customerContext.conversationIntent &&
        !updatedContext.conversationIntent
      ) {
        updatedContext.conversationIntent = customerContext.conversationIntent;
      }

      // Extract and remember the user's original query/problem from first/early messages
      // Check for problem statements even in first few exchanges
      if (!updatedContext.originalQuery && conversationHistory.length <= 3) {
        const isProblemStatement = userMessage
          .toLowerCase()
          .match(
            /\b(not working|broken|issue|problem|charging|starting|error|need|want|buy|purchase|book|interested)\b/,
          );
        if (isProblemStatement && userMessage.trim().length > 10) {
          updatedContext.originalQuery = userMessage;
          updatedContext.conversationIntent =
            await this.extractUserIntent(userMessage);
          console.log(
            "🎯 Captured original query:",
            updatedContext.originalQuery,
          );
        }
      }

      // Determine conversation stage and next required field
      const conversationState = this.determineConversationState(
        updatedContext,
        systemPrompt,
      );

      // Build customer context summary for the prompt
      const contextSummary = [];

      // Add original query/intent at the top so AI never forgets it
      if (updatedContext.originalQuery) {
        contextSummary.push(
          `🎯 ORIGINAL USER REQUEST: "${updatedContext.originalQuery}"`,
        );
      }
      if (updatedContext.conversationIntent) {
        contextSummary.push(
          `📌 USER'S INTENT: ${updatedContext.conversationIntent}`,
        );
      }

      if (updatedContext.name)
        contextSummary.push(
          `✅ Name: ${updatedContext.name} (ALREADY COLLECTED - DO NOT ASK AGAIN)`,
        );
      if (updatedContext.phone)
        contextSummary.push(
          `✅ Phone: ${updatedContext.phone} (ALREADY COLLECTED - DO NOT ASK AGAIN)`,
        );
      if (updatedContext.pincode)
        contextSummary.push(
          `✅ Pincode: ${updatedContext.pincode} (ALREADY COLLECTED - DO NOT ASK AGAIN)`,
        );
      if (updatedContext.email)
        contextSummary.push(
          `✅ Email: ${updatedContext.email} (ALREADY COLLECTED - DO NOT ASK AGAIN)`,
        );
      if (updatedContext.address)
        contextSummary.push(
          `✅ Address: ${updatedContext.address} (ALREADY COLLECTED - DO NOT ASK AGAIN)`,
        );
      if (
        updatedContext.orderDetails &&
        Object.keys(updatedContext.orderDetails).length > 0
      ) {
        contextSummary.push(
          `Order: ${JSON.stringify(updatedContext.orderDetails)}`,
        );
      }

      const customerContextString =
        contextSummary.length > 0
          ? `\n\nCUSTOMER INFORMATION (Already collected - DO NOT ask again):\n${contextSummary.join(
            "\n",
          )}\n`
          : "";

      // Build memory block from all collected data (NEW: Cleaner approach)
      const memoryBlock = buildMemoryBlock(updatedContext);

      // Analyze conversation history to track what was already asked
      const alreadyAsked = this.analyzeConversationHistory(conversationHistory);
      const trackingInfo =
        alreadyAsked.length > 0
          ? `\n\nQUESTIONS ALREADY ASKED (Never repeat these):\n${alreadyAsked.join(
            "\n",
          )}\n`
          : "";

      // Add conversation stage guidance
      const stageGuidance = conversationState.nextAction
        ? `\n\n🎯 CURRENT STEP (${conversationState.currentStep}/${conversationState.totalSteps
        }): ${conversationState.nextAction}
📋 COMPLETED: ${conversationState.completedSteps?.join(", ") || "None"}
⏭️  REMAINING: ${conversationState.remainingSteps?.slice(0, 3).join(", ") || "None"
        }

CRITICAL: You MUST complete the current step before proceeding. Follow your numbered flow exactly.\n`
        : `\n\n✅ All flow steps completed. ${conversationState.nextAction}\n`;

      console.log("📋 Server: Current customer context:", updatedContext);
      console.log("🎯 Conversation state:", conversationState);

      // Detect intent and route to appropriate script section (for multi-section scripts)
      const intentSection = this.detectIntentAndSection(
        userMessage,
        conversationHistory,
        systemPrompt,
      );

      // Build enhanced system prompt - add context and guidance to user's script
      const enhancedSystemPrompt = this.buildEnhancedPrompt({
        basePrompt: systemPrompt,
        memoryBlock: memoryBlock, // NEW: Injected memory block
        stageGuidance: stageGuidance,
        trackingInfo: trackingInfo,
        language: currentLanguageName,
        intentSection: intentSection,
      });

      // If RAG is enabled, try to use knowledge base
      if (useRAG && userMessage) {
        try {
          const ragResponse = await this.getRAGResponse(
            userMessage,
            conversationHistory,
            enhancedSystemPrompt,
            { temperature, maxTokens, agentId },
          );

          if (ragResponse) {
            console.log("🤖 Using RAG response with knowledge base");

            // Remove numbered lists for voice output
            const cleanedResponse = this.removeNumberedLists(ragResponse);

            const processedResponse = this.processLanguageSwitch(
              cleanedResponse,
              LANGUAGE_CODES,
            );
            return {
              ...processedResponse,
              customerContext: updatedContext, // Include updated context
            };
          }
        } catch (ragError) {
          console.warn(
            "⚠️  RAG failed, falling back to standard OpenAI:",
            ragError.message,
          );
        }
      }

      // Standard OpenAI response (fallback or when RAG disabled)
      const aiResponse = await this.getStandardResponse(
        userMessage,
        conversationHistory,
        enhancedSystemPrompt,
        { temperature, maxTokens, languageNames: LANGUAGE_CODES },
      );

      return {
        ...aiResponse,
        customerContext: updatedContext, // Include updated context
      };
    } catch (error) {
      console.error("❌ Error processing message:", error);
      throw new Error(`Failed to process message: ${error.message}`);
    }
  }

  /**
   * Detect user intent and extract relevant script section
   * Dynamically routes to the appropriate flow (sales, support, info, etc.)
   */
  detectIntentAndSection(userMessage, conversationHistory, systemPrompt) {
    // If conversation already started, don't re-detect intent
    if (conversationHistory && conversationHistory.length > 2) {
      return { section: null, intent: null }; // Continue with current flow
    }

    // Extract sections from script (Section 0, 1, 1.1, SALES:, SUPPORT:, etc.)
    const sections = this.extractScriptSections(systemPrompt);

    if (sections.length === 0) {
      return { section: null, intent: null }; // No sections found, use full script
    }

    // Detect intent from user's first message
    const messageLower = userMessage.toLowerCase();

    // Intent keywords mapping (dynamic, not hardcoded for specific domains)
    const intentKeywords = {
      sales: [
        "buy",
        "purchase",
        "interested",
        "looking for",
        "want to buy",
        "price",
        "cost",
        "afford",
        "budget",
        "models",
        "variants",
        "booking",
        "book",
        "test ride",
        "demo",
        "खरीदना",
        "खरीदूंगा",
        "लेना है",
      ],
      support: [
        "issue",
        "problem",
        "not working",
        "broken",
        "repair",
        "service",
        "complaint",
        "help",
        "fix",
        "error",
        "charging",
        "battery",
        "समस्या",
        "ठीक करो",
        "खराब",
      ],
      query: [
        "information",
        "details",
        "tell me about",
        "what is",
        "features",
        "specifications",
        "specs",
        "warranty",
        "जानकारी",
        "बताइए",
      ],
      service: [
        "service center",
        "appointment",
        "booking",
        "schedule",
        "visit",
        "mechanic",
        "technician",
        "सर्विस सेंटर",
      ],
    };

    // Find matching intent
    let detectedIntent = null;
    let maxMatches = 0;

    for (const [intent, keywords] of Object.entries(intentKeywords)) {
      const matches = keywords.filter((keyword) =>
        messageLower.includes(keyword),
      ).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        detectedIntent = intent;
      }
    }

    if (!detectedIntent) {
      return { section: null, intent: null }; // No clear intent, use full script
    }

    // Find matching section in script
    const matchingSection = sections.find(
      (sec) =>
        sec.title.toLowerCase().includes(detectedIntent) ||
        sec.title.toLowerCase().includes(detectedIntent + "s"), // plural
    );

    if (matchingSection) {
      console.log(
        `🎯 Intent detected: ${detectedIntent}, routing to section: ${matchingSection.title}`,
      );
      return {
        section: matchingSection.content,
        intent: detectedIntent,
        sectionTitle: matchingSection.title,
      };
    }

    return { section: null, intent: detectedIntent };
  }

  /**
   * Extract sections from script
   * Supports: "SECTION 1:", "## Sales Flow", "SUPPORT:", etc.
   */
  extractScriptSections(systemPrompt) {
    const sections = [];

    // Pattern 1: "SECTION 0:", "SECTION 1:", "SECTION 1.1:", etc.
    const sectionPattern =
      /(?:^|\n)(SECTION\s+[\d.]+[:\s]+[^\n]+)([\s\S]*?)(?=\n(?:SECTION\s+[\d.]+|$))/gi;

    // Pattern 2: "## Sales Flow", "## Support Flow", etc. (Markdown headings)
    const markdownPattern = /(?:^|\n)(##\s+[^\n]+)([\s\S]*?)(?=\n##|$)/gi;

    // Pattern 3: "SALES:", "SUPPORT:", "QUERY:", etc.
    const labelPattern = /(?:^|\n)([A-Z]+\s*:)([\s\S]*?)(?=\n[A-Z]+\s*:|$)/g;

    let match;

    // Try pattern 1
    while ((match = sectionPattern.exec(systemPrompt)) !== null) {
      sections.push({
        title: match[1].trim(),
        content: match[2].trim(),
      });
    }

    // Try pattern 2 if no sections found
    if (sections.length === 0) {
      while ((match = markdownPattern.exec(systemPrompt)) !== null) {
        sections.push({
          title: match[1].replace(/^##\s*/, "").trim(),
          content: match[2].trim(),
        });
      }
    }

    // Try pattern 3 if still no sections
    if (sections.length === 0) {
      while ((match = labelPattern.exec(systemPrompt)) !== null) {
        sections.push({
          title: match[1].replace(":", "").trim(),
          content: match[2].trim(),
        });
      }
    }

    return sections;
  }

  /**
   * @deprecated ⚠️ DEPRECATED - DO NOT USE
   *
   * This is the "monster prompt" that sends the FULL script + all rules to the LLM.
   * This approach DOES NOT WORK because:
   * 1. LLM sees full flow and decides on its own what to do
   * 2. Rules are unenforceable by LLM
   * 3. State is implicit (inferred) not explicit (tracked)
   *
   * USE INSTEAD: processMessageV2() with 3-prompt architecture
   * - System prompt (static, short)
   * - Persona prompt (per-agent tone/style)
   * - Step prompt (dynamic, ONE step only)
   *
   * Keeping for backward compatibility only.
   */
  buildEnhancedPrompt({
    basePrompt,
    memoryBlock, // NEW: Memory block from buildMemoryBlock()
    stageGuidance,
    trackingInfo,
    language,
    intentSection,
  }) {
    // If intent-based section detected, use that instead of full script
    const scriptToUse = intentSection?.section || basePrompt;
    const intentGuidance = intentSection?.sectionTitle
      ? `\n🎯 DETECTED INTENT: ${intentSection.intent} - Following "${intentSection.sectionTitle}" flow\n`
      : "";

    return `${scriptToUse}

${memoryBlock}${stageGuidance}${trackingInfo}${intentGuidance}

SYSTEM INSTRUCTIONS (Auto-added for voice chat):
- Current language: ${language}
- Keep responses brief (max 2-3 sentences)
- NO markdown formatting (**bold**, *italics*, [links]) - plain text only
- Replace placeholders {Name}, {Mobile}, {Pincode}, {Email}, {Address}, {Model} with actual values
- Never invent customer details - use ONLY from CUSTOMER INFORMATION

🌐 LANGUAGE SWITCHING - CRITICAL:
When user asks to switch language (e.g., "Can we switch to Hindi?", "हिंदी में बात करें"), you MUST:
1. Prefix your ENTIRE response with: LANGUAGE_SWITCH:[code] 
2. Available codes: en, hi, ta, te, kn, ml, bn, mr, gu, pa, es, fr, de, zh, ja, ko
3. Then respond in the requested language
Example: "LANGUAGE_SWITCH:hi बिल्कुल! मैं हिंदी में बात कर सकती हूँ।"
Example: "LANGUAGE_SWITCH:en Sure! I can speak in English."

⚠️ STRICT SCRIPT ADHERENCE - MANDATORY RESPONSE FORMAT:
You must ALWAYS follow this exact pattern:
1. Brief acknowledgment (max 5 words) - ONLY if user provided information
2. Immediately ask the EXACT next question from your script
3. NO explanations, NO generalizations, NO advice, NO elaboration

🚫 ABSOLUTE PROHIBITIONS - NEVER DO THESE:
1. NEVER ask for information already in CUSTOMER INFORMATION section
2. NEVER ask again what's already in QUESTIONS ALREADY ASKED section
3. NEVER forget the user's ORIGINAL REQUEST - it's the reason for this conversation
4. NEVER ask "What's your problem/query/issue?" if ORIGINAL USER REQUEST is present
5. If user says "I already told you X" - CHECK CUSTOMER INFORMATION and acknowledge it

⚠️ HANDLING "I ALREADY TOLD YOU":
When user says "I already told you my name/number/etc.":
1. IMMEDIATELY check CUSTOMER INFORMATION section above
2. If the info IS there (✅ Name: John) → Say "You're right, {Name}. [proceed to next question]"
3. If info is NOT there → Apologize and ask again politely
4. NEVER argue or ask again if data is clearly present

📚 EXAMPLES OF CORRECT vs INCORRECT RESPONSES:

❌ WRONG (Re-asking when info already collected):
CUSTOMER INFORMATION shows: ✅ Name: John
Agent: "May I have your name please?"
WRONG! Name is already collected!

✅ CORRECT (Using collected info):
CUSTOMER INFORMATION shows: ✅ Name: John
Agent: "Thank you John. What's your mobile number?"

❌ WRONG (Forgetting original query):
ORIGINAL USER REQUEST: "My scooter isn't starting"
Agent after 3 messages: "How can I help you today?"
WRONG! User already said their problem!

✅ CORRECT (Remembering context):
ORIGINAL USER REQUEST: "My scooter isn't starting"  
Agent: "I'll help you with that. May I have your name first?"

❌ WRONG (Ignoring "already told you"):
User: "I already told my name"
CUSTOMER INFORMATION shows: ✅ Name: Rahul
Agent: "Sorry, I don't have your name. Can you please share it again?"
WRONG! Name is right there!

✅ CORRECT (Acknowledging collected data):
User: "I already told my name"
CUSTOMER INFORMATION shows: ✅ Name: Rahul
Agent: "You're right, Rahul. What's your mobile number?"

📚 EXAMPLES OF CORRECT vs INCORRECT RESPONSES:

❌ WRONG (Too generalized, not following script):
User: "My scooter isn't starting"
Agent: "I understand your concern. Vehicle issues can be frustrating. There could be several reasons like battery, motor, or electrical issues. Let me help you troubleshoot this problem."

✅ CORRECT (Acknowledges + asks next script question):
User: "My scooter isn't starting"  
Agent: "I'll help you with that. May I have your name first?"

❌ WRONG (Giving advice instead of following script):
User: "I want to buy an electric scooter"
Agent: "Great choice! Electric scooters are eco-friendly and cost-effective. They have low maintenance and are perfect for city commuting."

✅ CORRECT (Acknowledges + asks next script question):
User: "I want to buy an electric scooter"
Agent: "Perfect! Which model interests you - Magnus EX, Nexus, or Eltra?"

❌ WRONG (Explaining instead of asking):
User: "John"
Agent: "Thank you John! That's a nice name. Now I need to collect some more information from you to proceed with your request."

✅ CORRECT (Brief acknowledgment + next question):
User: "John"
Agent: "Thank you John. What's your mobile number?"

CRITICAL RULES:
1. FOLLOW YOUR SCRIPT EXACTLY in order
2. NEVER SKIP STEPS - complete current before next
3. NEVER REPEAT - check CUSTOMER INFORMATION and QUESTIONS ALREADY ASKED
4. ONE QUESTION AT A TIME
5. ACKNOWLEDGE then PROCEED to next step
6. DO NOT LOOP after completing all steps
7. STAY ON SCRIPT unless user asks off-topic
8. RE-ASK politely if response unclear
9. NO GENERALIZED ANSWERS - only script questions
10. NO UNSOLICITED ADVICE - stick to information gathering`;
  }

  /**
   * Get response using RAG (Retrieval-Augmented Generation)
   */
  async getRAGResponse(query, conversationHistory, systemPrompt, options) {
    // This would call your RAG endpoint (similar to your frontend)
    // For now, we'll integrate with ragService directly

    if (!ragService.isInitialized()) {
      return null;
    }

    try {
      const { temperature, maxTokens, agentId } = options || {};

      const response = await ragService.chat(
        query,
        conversationHistory.slice(-6), // Last 3 exchanges
        systemPrompt,
        {
          temperature,
          max_tokens: maxTokens,
          agentId,
        },
      );

      return response.response;
    } catch (error) {
      console.error("RAG error:", error);
      return null;
    }
  }

  /**
   * Get standard OpenAI response
   */
  async getStandardResponse(
    userMessage,
    conversationHistory,
    systemPrompt,
    options,
  ) {
    const { temperature, maxTokens, languageNames, model } = options;

    // Use model from options, fallback to config
    const selectedModel = model || AI_CONFIG.MODEL;
    console.log(`🤖 Using LLM model: ${selectedModel}`);

    // Build messages array with FULL conversation history for better context
    const recentHistory = conversationHistory.slice(
      -AI_CONFIG.CONVERSATION_HISTORY_LIMIT,
    );
    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...recentHistory,
      {
        role: "user",
        content: userMessage,
      },
    ];

    // Call OpenAI API with stricter parameters to follow script
    const response = await this.openai.chat.completions.create({
      model: selectedModel,
      messages: messages,
      temperature: temperature || AI_CONFIG.DEFAULT_TEMPERATURE,
      max_tokens: maxTokens || AI_CONFIG.DEFAULT_MAX_TOKENS,
      presence_penalty: AI_CONFIG.PRESENCE_PENALTY,
      frequency_penalty: AI_CONFIG.FREQUENCY_PENALTY,
    });

    let aiResponse = response.choices[0].message.content;

    // Remove numbered lists for voice output (but AI keeps them mentally)
    aiResponse = this.removeNumberedLists(aiResponse);

    // Process language switching
    return this.processLanguageSwitch(aiResponse, languageNames);
  }

  /**
   * Remove numbered lists from voice output
   * Converts "1. Scooter 2. Bike 3. Car" to "Scooter, Bike, or Car"
   * Converts "1) First option 2) Second option" to "First option or Second option"
   */
  removeNumberedLists(text) {
    // Pattern 1: "1. Item1 2. Item2 3. Item3" → "Item1, Item2, or Item3"
    // Pattern 2: "1) Item1 2) Item2" → "Item1 or Item2"
    // Pattern 3: Multiline numbered lists

    let processed = text;

    // Handle inline numbered lists (all on one line)
    // Match: "1. Item1 2. Item2 3. Item3" or "1) Item1 2) Item2 3) Item3"
    const inlinePattern = /(?:^|\s)(\d+[.)]\s*[^0-9\n]+?)(?=\s*\d+[.)]|\s*$)/g;
    const matches = [...processed.matchAll(inlinePattern)];

    if (matches.length >= 2) {
      // Extract items without numbers
      const items = matches.map((match) =>
        match[1].replace(/^\d+[.)]\s*/, "").trim(),
      );

      // Join with commas and "or" for last item
      let replacement;
      if (items.length === 2) {
        replacement = `${items[0]} or ${items[1]}`;
      } else {
        const lastItem = items.pop();
        replacement = `${items.join(", ")}, or ${lastItem}`;
      }

      // Replace the entire numbered list with the natural language version
      const fullMatch = matches[0].index;
      const lastMatch = matches[matches.length - 1];
      const endIndex = lastMatch.index + lastMatch[0].length;

      processed =
        processed.slice(0, fullMatch) + replacement + processed.slice(endIndex);
    }

    // Handle multiline numbered lists
    // Match lines starting with "1. ", "2. ", etc.
    const lines = processed.split("\n");
    const listItems = [];
    let inList = false;
    let listStartIndex = -1;
    let listEndIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const numberedLineMatch = line.match(/^(\d+)[.)]\s*(.+)$/);

      if (numberedLineMatch) {
        if (!inList) {
          inList = true;
          listStartIndex = i;
        }
        listItems.push(numberedLineMatch[2].trim());
        listEndIndex = i;
      } else if (inList && line.length > 0) {
        // End of list
        break;
      }
    }

    if (listItems.length >= 2) {
      // Convert to natural language
      let replacement;
      if (listItems.length === 2) {
        replacement = `${listItems[0]} or ${listItems[1]}`;
      } else {
        const lastItem = listItems.pop();
        replacement = `${listItems.join(", ")}, or ${lastItem}`;
      }

      // Replace the list lines with natural language version
      lines.splice(
        listStartIndex,
        listEndIndex - listStartIndex + 1,
        replacement,
      );
      processed = lines.join("\n");
    }

    // Clean up any remaining standalone numbers at start of sentences
    // "1. " → "", "2) " → "" (if somehow missed above)
    processed = processed.replace(/(?:^|\n)\d+[.)]\s+/g, "");

    return processed.trim();
  }

  /**
   * Process language switch commands in AI response
   */
  processLanguageSwitch(aiResponse, languageNames) {
    // Check if AI wants to switch language
    if (aiResponse.startsWith("LANGUAGE_SWITCH:")) {
      const match = aiResponse.match(/^LANGUAGE_SWITCH:([a-z]{2})[\s\n]/i);

      if (match) {
        const newLanguageCode = match[1].toLowerCase();

        if (languageNames[newLanguageCode]) {
          console.log(`🌐 Language switching to ${newLanguageCode}`);

          // Remove the switch command from response
          aiResponse = aiResponse
            .replace(/^LANGUAGE_SWITCH:[a-z]{2}[\s\n]+/i, "")
            .trim();

          // Return both response and new language
          return {
            response: aiResponse,
            languageSwitch: newLanguageCode,
          };
        }
      }
    }

    return {
      response: aiResponse,
      languageSwitch: null,
    };
  }

  /**
   * Get response from Agentforce causing translation if needed
   */
  async getAgentforceResponse(userMessage, language, options) {
    try {
      console.log(`🤖 Agentforce Request (Lang: ${language}):`, userMessage);

      let englishMessage = userMessage;

      // Step 1: Translate to English if needed
      // We also handle 'en-IN' etc as just English
      const isEnglish = !language || language.startsWith("en");

      if (!isEnglish) {
        console.log(`🔤 Translating input from ${language} to English...`);
        englishMessage = await translationService.translate(
          userMessage,
          "English",
        );
        console.log(`   -> English: ${englishMessage}`);
      }

      // Step 2: Prepare message for Agentforce with System Context
      // This "tricks" Agentforce into answering even if it thinks it only speaks English
      let messageToSend = englishMessage;

      if (!isEnglish) {
        messageToSend = `[SYSTEM NOTE: The user is speaking ${language}. I am acting as a translator. The user asked: "${englishMessage}". You (Agentforce) must answer their query in English naturally. Do NOT apologize for language. Do NOT say you only speak English. Just answer the question.]`;
      }

      console.log("📡 Calling Agentforce...");

      const agentResponse = await agentforceService.processMessage(
        messageToSend,
        options,
      );
      console.log("   -> Agentforce Response:", agentResponse);

      // Step 3: Translate back to target language if needed
      let finalResponse = agentResponse;

      if (!isEnglish) {
        console.log(`🔤 Translating response from English to ${language}...`);
        finalResponse = await translationService.translate(
          agentResponse,
          language,
        );
        console.log(`   -> Translated (${language}): ${finalResponse}`);
      }

      // Step 4: Prepend LANGUAGE_SWITCH tag so client updates UI
      // The client looks for "LANGUAGE_SWITCH:xx" at start of string
      if (language && language.length === 2 && !isEnglish) {
        finalResponse = `LANGUAGE_SWITCH:${language} ${finalResponse}`;
      }

      // Return consistent format
      return {
        response: finalResponse,
        language: language,
        originalResponse: agentResponse,
      };
    } catch (error) {
      console.error("❌ Agentforce processing failed:", error);
      return "I'm having trouble connecting to my brain right now. Please try again.";
    }
  }

  /**
   * Determine conversation stage and next required field
   * DYNAMIC state tracking - works for ANY agent/script
   */
  determineConversationState(customerContext, systemPrompt) {
    // Extract numbered flow steps from script (supports any format)
    const flowSteps = this.extractFlowSteps(systemPrompt);

    if (flowSteps.length === 0) {
      // Fallback: Auto-detect required fields from script
      return this.autoDetectRequiredFields(customerContext, systemPrompt);
    }

    // Check which steps are completed based on collected info
    const completedSteps = [];
    const pendingSteps = [];

    for (let i = 0; i < flowSteps.length; i++) {
      const step = flowSteps[i];
      const isCompleted = this.isStepCompleted(step, customerContext);

      if (isCompleted) {
        completedSteps.push({ index: i + 1, text: step });
      } else {
        pendingSteps.push({ index: i + 1, text: step });
      }
    }

    // Determine next step
    if (pendingSteps.length > 0) {
      const nextStep = pendingSteps[0];
      return {
        stage: `Step ${nextStep.index}/${flowSteps.length}`,
        currentStep: nextStep.index,
        totalSteps: flowSteps.length,
        nextAction: nextStep.text,
        completedSteps: completedSteps.map((s) => s.text),
        remainingSteps: pendingSteps.map((s) => s.text),
        isComplete: false,
      };
    }

    // All steps completed
    return {
      stage: "Flow Complete",
      currentStep: flowSteps.length,
      totalSteps: flowSteps.length,
      nextAction: "Proceed to conclusion (booking, transfer, etc.)",
      isComplete: true,
    };
  }

  /**
   * Extract flow steps from script
   * Supports multiple formats:
   * - "1. Step one"
   * - "Step 1: Do this"
   * - "After X is given" (conversational templates)
   * - "FLOW: 1) First step"
   */
  extractFlowSteps(systemPrompt) {
    const steps = [];
    const lines = systemPrompt.split("\n");

    // Pattern 1: "1. Step" or "1) Step"
    const numberedPattern = /^\s*(\d+)[.)]\s+(.+)/;

    // Pattern 2: "Step 1:" or "STEP 1:"
    const stepPattern = /^\s*(?:step|STEP)\s*(\d+)[:\-]\s*(.+)/i;

    // Pattern 3: "After X is given" or "If user says"
    const conversationalPattern =
      /^\s*(?:After|If|When)\s+(.+?)(?:\s+is given|\s+says|\s+confirms?|\s+selects?)/i;

    for (const line of lines) {
      const match1 = line.match(numberedPattern);
      const match2 = line.match(stepPattern);
      const match3 = line.match(conversationalPattern);

      if (match1) {
        steps.push(match1[2].trim());
      } else if (match2) {
        steps.push(match2[2].trim());
      } else if (match3) {
        // Convert "After name is given" → "Ask for name"
        const extracted = match3[1].trim();
        if (extracted.includes("name")) {
          steps.push("Ask for customer name");
        } else if (
          extracted.includes("mobile") ||
          extracted.includes("phone")
        ) {
          steps.push("Ask for mobile number");
        } else if (
          extracted.includes("pincode") ||
          extracted.includes("pin code")
        ) {
          steps.push("Ask for pincode");
        } else if (extracted.includes("email")) {
          steps.push("Ask for email");
        } else if (
          extracted.includes("model") ||
          extracted.includes("product")
        ) {
          steps.push("Ask for preferred model/product");
        } else if (
          extracted.includes("location") ||
          extracted.includes("address")
        ) {
          steps.push("Ask for location/address");
        } else {
          steps.push(`Complete: ${extracted}`);
        }
      }
    }

    // If no numbered steps found, try to extract bullet points or dashed lists
    if (steps.length === 0) {
      const bulletPattern = /^\s*[-•*]\s+(.+)/;
      for (const line of lines) {
        const match = line.match(bulletPattern);
        if (match && match[1].trim().length > 10) {
          // Ignore short bullets
          steps.push(match[1].trim());
        }
      }
    }

    // If still nothing, look for FLOW/STEPS/CONVERSATION FLOW sections
    if (steps.length === 0) {
      const sectionPattern =
        /(?:FLOW|STEPS|CONVERSATION FLOW|SCRIPT):\s*\n([\s\S]*?)(?:\n\n|\n[A-Z]|$)/i;
      const sectionMatch = systemPrompt.match(sectionPattern);

      if (sectionMatch) {
        const sectionText = sectionMatch[1];
        const sectionLines = sectionText.split("\n");

        for (const line of sectionLines) {
          if (line.trim().length > 10) {
            steps.push(line.replace(/^[-•*\d.)]\s*/, "").trim());
          }
        }
      }
    }

    return steps;
  }

  /**
   * Check if a conversation step is completed
   */
  isStepCompleted(stepText, customerContext) {
    const stepLower = stepText.toLowerCase();

    // Check for name collection
    if (
      (stepLower.includes("name") || stepLower.includes("introduce")) &&
      !stepLower.includes("greet")
    ) {
      return !!customerContext.name;
    }

    // Check for phone collection
    if (
      stepLower.includes("phone") ||
      stepLower.includes("mobile") ||
      stepLower.includes("number") ||
      stepLower.includes("contact")
    ) {
      return !!customerContext.phone;
    }

    // Check for location/address
    if (
      stepLower.includes("location") ||
      stepLower.includes("address") ||
      stepLower.includes("area") ||
      stepLower.includes("city")
    ) {
      return !!customerContext.address;
    }

    // Check for pincode
    if (
      stepLower.includes("pincode") ||
      stepLower.includes("pin code") ||
      stepLower.includes("zip")
    ) {
      return !!customerContext.pincode;
    }

    // Check for email
    if (stepLower.includes("email")) {
      return !!customerContext.email;
    }

    // Check for budget/preference in orderDetails
    if (
      stepLower.includes("budget") ||
      stepLower.includes("price") ||
      stepLower.includes("range")
    ) {
      return customerContext.orderDetails?.budget !== undefined;
    }

    // Check for property type / model / product
    if (
      stepLower.includes("type") ||
      stepLower.includes("model") ||
      stepLower.includes("bhk") ||
      stepLower.includes("product")
    ) {
      return (
        customerContext.orderDetails?.propertyType !== undefined ||
        customerContext.orderDetails?.model !== undefined ||
        customerContext.orderDetails?.product !== undefined
      );
    }

    // Greeting steps are always "completed" after first exchange
    if (
      stepLower.includes("greet") ||
      stepLower.includes("introduce yourself")
    ) {
      return true; // Always move past greeting
    }

    // Unknown step type - assume not completed
    return false;
  }

  /**
   * Fallback: Auto-detect required fields when no explicit flow
   */
  autoDetectRequiredFields(customerContext, systemPrompt) {
    // Parse script to understand required fields (simple approach)
    const scriptLower = systemPrompt.toLowerCase();

    // Common required fields for most scripts
    const fieldChecks = [
      { key: "name", patterns: ["name", "{name}"], label: "customer name" },
      {
        key: "phone",
        patterns: ["phone", "mobile", "number", "{mobile}"],
        label: "phone number",
      },
      {
        key: "pincode",
        patterns: ["pincode", "pin code", "{pincode}"],
        label: "pincode",
      },
      {
        key: "address",
        patterns: ["address", "location", "{address}"],
        label: "address",
      },
      { key: "email", patterns: ["email", "{email}"], label: "email" },
    ];

    // Check which fields are mentioned in script and missing from context
    const requiredFields = [];
    for (const field of fieldChecks) {
      const isInScript = field.patterns.some((pattern) =>
        scriptLower.includes(pattern),
      );
      const isMissing = !customerContext[field.key];

      if (isInScript && isMissing) {
        requiredFields.push(field);
      }
    }

    // Determine next field to ask
    if (requiredFields.length > 0) {
      const nextField = requiredFields[0];
      return {
        stage: `Collecting Info (${requiredFields.length} fields remaining)`,
        nextField: nextField.label,
        nextFieldKey: nextField.key,
        remainingFields: requiredFields.map((f) => f.label),
        isComplete: false,
      };
    }

    // All required fields collected
    return {
      stage: "Information Complete",
      nextField: null,
      nextAction: "your script's next steps (qualification, booking, etc.)",
      isComplete: true,
    };
  }

  /**
   * Extract user's intent/purpose from their message
   * Returns a brief summary of what the user wants
   */
  async extractUserIntent(userMessage) {
    try {
      // Simple keyword-based extraction for common intents
      const messageLower = userMessage.toLowerCase();

      // Purchase/Sales intents
      if (
        messageLower.match(
          /\b(buy|purchase|book|test ride|demo|interested|looking for|want to buy)\b/,
        )
      ) {
        return "Purchase/Booking inquiry";
      }

      // Support/Issue intents
      if (
        messageLower.match(
          /\b(not working|broken|issue|problem|repair|service|complaint|fix|error)\b/,
        )
      ) {
        return "Technical support/Issue resolution";
      }

      // Information/Query intents
      if (
        messageLower.match(
          /\b(information|details|tell me|what is|features|specs|warranty|price)\b/,
        )
      ) {
        return "Information request";
      }

      // Service center intents
      if (
        messageLower.match(
          /\b(service center|appointment|schedule|visit|location)\b/,
        )
      ) {
        return "Service center inquiry";
      }

      // Generic fallback - just return the original message (trimmed)
      return userMessage.length > 50
        ? userMessage.substring(0, 47) + "..."
        : userMessage;
    } catch (error) {
      console.error("Intent extraction error:", error);
      return userMessage;
    }
  }

  /**
   * Analyze conversation history to track what questions were already asked
   */
  analyzeConversationHistory(conversationHistory) {
    const askedQuestions = [];

    for (const msg of conversationHistory) {
      if (msg.role === "assistant") {
        const content = msg.content.toLowerCase();

        // Detect if assistant asked for specific information
        if (content.includes("name") && content.includes("?")) {
          askedQuestions.push("- Asked for name");
        }
        if (
          (content.includes("phone") ||
            content.includes("mobile") ||
            content.includes("number")) &&
          content.includes("?")
        ) {
          askedQuestions.push("- Asked for phone/mobile number");
        }
        if (content.includes("email") && content.includes("?")) {
          askedQuestions.push("- Asked for email");
        }
        if (content.includes("address") && content.includes("?")) {
          askedQuestions.push("- Asked for address");
        }
        if (content.includes("pincode") && content.includes("?")) {
          askedQuestions.push("- Asked for pincode");
        }
        if (content.includes("location") && content.includes("?")) {
          askedQuestions.push("- Asked for location");
        }
      }
    }

    // Remove duplicates
    return [...new Set(askedQuestions)];
  }

  /**
   * Extract customer information from text using AI
   * Much more reliable than regex patterns
   */
  async extractCustomerInfo(text, existingContext = {}, agentSlots = []) {
    try {
      console.log("🔍 Extracting customer info from:", text);

      // HYBRID APPROACH: Use dynamic extraction prompt
      // If agentSlots provided, use them; otherwise fallback to universal extraction
      let extractionPrompt;

      if (agentSlots && agentSlots.length > 0) {
        // Import scriptAnalyzer dynamically to avoid circular dependency
        const { default: scriptAnalyzer } = await import("./scriptAnalyzer.js");
        extractionPrompt =
          scriptAnalyzer.buildDynamicExtractionPrompt(agentSlots);
        console.log(
          `📋 Using DYNAMIC extraction for ${agentSlots.length} slots:`,
          agentSlots.map((s) => s.name),
        );
      } else {
        // Fallback to universal extraction
        extractionPrompt = EXTRACTION_SYSTEM_PROMPT;
        console.log("📋 Using UNIVERSAL extraction (no agent slots detected)");
      }

      const response = await this.openai.chat.completions.create({
        model: AI_CONFIG.EXTRACTION_MODEL,
        messages: [
          {
            role: "system",
            content: extractionPrompt, // DYNAMIC PROMPT!
          },
          {
            role: "user",
            content: text,
          },
        ],
        temperature: 0,
        max_tokens: AI_CONFIG.EXTRACTION_MAX_TOKENS,
      });
      const jsonStr = response.choices[0].message.content.trim();
      console.log("🤖 AI extraction raw response:", jsonStr);

      // Handle markdown code blocks if AI returns them
      const cleanJson = jsonStr.replace(/```json\n?|```\n?/g, "").trim();
      console.log("🧹 Cleaned JSON:", cleanJson);

      if (cleanJson && cleanJson !== "{}") {
        const updates = JSON.parse(cleanJson);
        console.log("📦 Parsed updates:", updates);

        // Clean phone number if extracted
        if (updates.phone) {
          // Remove all non-digits
          let cleanPhone = updates.phone.replace(/\D/g, "");
          // Remove country code if present (91 prefix)
          if (cleanPhone.startsWith("91") && cleanPhone.length === 12) {
            cleanPhone = cleanPhone.substring(2);
          }
          // Validate it's a 10-digit number starting with 6-9
          if (/^[6-9]\d{9}$/.test(cleanPhone)) {
            updates.phone = cleanPhone;
            console.log("✅ Cleaned phone number:", cleanPhone);
          } else {
            console.warn("⚠️ Invalid phone format, discarding:", updates.phone);
            delete updates.phone;
          }
        }

        if (Object.keys(updates).length > 0) {
          // Merge with existing context, but don't overwrite with empty values
          const newContext = { ...existingContext };

          // Only update fields that have actual values (not empty strings)
          Object.keys(updates).forEach((key) => {
            const value = updates[key];
            if (value !== "" && value !== null && value !== undefined) {
              // For objects, merge them
              if (typeof value === "object" && !Array.isArray(value)) {
                newContext[key] = { ...newContext[key], ...value };
              } else {
                newContext[key] = value;
              }
            }
          });

          newContext.lastUpdated = new Date().toISOString();

          console.log("📝 AI Extracted customer info:", updates);
          console.log("✅ Merged context:", newContext);
          return newContext;
        }
      }

      console.log("ℹ️ No customer info extracted from AI (empty response)");
    } catch (error) {
      console.error(
        "❌ AI extraction failed, using regex fallback:",
        error.message,
      );

      // Fallback to regex patterns
      const updates = {};

      // Extract phone numbers (Indian format) - Multiple patterns
      const phonePatterns = [
        /\b(\+?91[-\s]?)?([6-9]\d{9})\b/, // Standard format
        /\b([6-9]\d{4}[\s-]?\d{5})\b/, // With space/dash in middle
        /\b([6-9]\d{2}[\s-]?\d{3}[\s-]?\d{4})\b/, // Multiple separators
      ];

      for (const pattern of phonePatterns) {
        const phoneMatch = text.match(pattern);
        if (phoneMatch) {
          // Extract just the digits
          const cleanPhone = phoneMatch[0].replace(/\D/g, "");
          // Remove country code if present
          const phone =
            cleanPhone.startsWith("91") && cleanPhone.length === 12
              ? cleanPhone.substring(2)
              : cleanPhone;

          if (/^[6-9]\d{9}$/.test(phone)) {
            updates.phone = phone;
            break;
          }
        }
      }

      // Extract email
      const emailMatch = text.match(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
      );
      if (emailMatch) {
        updates.email = emailMatch[0];
      }

      // Extract pincode (6 digits) - Remove spaces first (STT often adds spaces)
      const cleanedForPincode = text.replace(/\s+/g, ""); // Remove all spaces
      const pincodeMatch = cleanedForPincode.match(/\b[1-9]\d{5}\b/);
      if (pincodeMatch) {
        updates.pincode = pincodeMatch[0];
      }

      // Extract name - multiple patterns
      let nameMatch = text.match(
        /(?:my name is|i am|this is|i'm|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      );

      // If no explicit name pattern, try to extract capitalized words (likely names)
      // Only if text is short (1-3 words) and starts with capital letter
      if (!nameMatch && text.trim().split(/\s+/).length <= 3) {
        const capitalizedMatch = text.match(
          /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\.?$/,
        );
        if (capitalizedMatch) {
          updates.name = capitalizedMatch[1];
        }
      } else if (nameMatch) {
        updates.name = nameMatch[1];
      }

      // Extract model/product names (capitalized words with potential alphanumeric)
      // Examples: "Magnus EX", "Primus", "iPhone 15", "Model 3"
      if (
        !updates.name &&
        !updates.phone &&
        !updates.pincode &&
        !updates.email
      ) {
        const modelMatch = text.match(/^([A-Z][a-zA-Z0-9\s]+?)(?:\s*[,.])?$/);
        if (modelMatch && modelMatch[1].trim().split(/\s+/).length <= 4) {
          updates.model = modelMatch[1].trim();
        }
      }

      if (Object.keys(updates).length > 0) {
        // Merge with existing context, but don't overwrite with empty values
        const newContext = { ...existingContext };

        // Only update fields that have actual values (not empty strings)
        Object.keys(updates).forEach((key) => {
          const value = updates[key];
          if (value !== "" && value !== null && value !== undefined) {
            // For objects, merge them
            if (typeof value === "object" && !Array.isArray(value)) {
              newContext[key] = { ...newContext[key], ...value };
            } else {
              newContext[key] = value;
            }
          }
        });

        newContext.lastUpdated = new Date().toISOString();

        console.log("📝 Regex extracted customer info:", updates);
        console.log("✅ Merged context:", newContext);
        return newContext;
      }
    }

    console.log(
      "ℹ️ No customer info found in text, returning existing context",
    );
    return existingContext;
  }

  /**
   * Process message with streaming response (for lower latency)
   * Yields chunks as they arrive from OpenAI
   * @yields {object} Chunks with type: 'content', 'context', 'language', 'done'
   */
  async *processMessageStream(
    userMessage,
    agentId = "default",
    customerContext = {},
    conversationHistory = [],
    options = {},
  ) {
    try {
      const {
        language = "en",
        useRAG = false,
        systemPrompt = "You are a helpful AI assistant.",
        temperature = 0.3,
        maxTokens = 200, // Default for streaming - enough for complete responses
        provider = "openai",
        model = AI_CONFIG.MODEL, // Add model selection
      } = options;

      // Log selected model
      console.log(`🤖 Streaming with model: ${model}`);

      // ============================================================================
      // LOAD AGENT SLOTS FOR DYNAMIC EXTRACTION (NEW - Hybrid Approach)
      // ============================================================================
      let agentSlots = [];
      if (agentId && agentId !== "default") {
        try {
          const Agent = (await import("../models/Agent.js")).default;
          const agent = await Agent.findById(agentId);
          if (agent && agent.requiredSlots && agent.requiredSlots.length > 0) {
            agentSlots = agent.requiredSlots;
            console.log(
              `📋 Loaded ${agentSlots.length} dynamic slots for streaming`,
            );
          }
        } catch (error) {
          console.warn(
            "⚠️  Could not load agent slots for streaming:",
            error.message,
          );
        }
      }

      // Quick validation
      const isEmptyOrUnclear = !userMessage || userMessage.trim().length < 2;

      if (isEmptyOrUnclear) {
        yield {
          type: "content",
          content: "I didn't catch that. Could you please repeat?",
        };
        yield { type: "done" };
        return;
      }

      // ========================================================================
      // FAST PATH: Try state engine FIRST for immediate flow text
      // This MUST happen before slot extraction or LLM
      // ========================================================================
      let flowText = null;
      const conversationId = options.conversationId || `stream-${Date.now()}`;
      const useCase = options.useCase || "default";

      try {
        const turnResult = stateEngine.processTurn(
          conversationId,
          userMessage,
          {
            useCase,
            language,
            agentId,
          },
        );

        // If state engine returned text, emit it IMMEDIATELY
        if (turnResult?.text) {
          flowText = turnResult.text;
          console.log(`⚡ FAST PATH: Emitting flow text immediately`);
          yield {
            type: "flow_text",
            content: turnResult.text,
          };
        }
      } catch (flowError) {
        // State engine failed - continue with LLM-only path
        console.warn(
          `⚠️ State engine failed, using LLM-only:`,
          flowError.message,
        );
      }

      // ========================================================================
      // FIRE-AND-FORGET: Slot extraction runs in parallel, does NOT block LLM
      // ========================================================================
      let updatedContext = { ...customerContext };
      const extractionPromise = this.extractCustomerInfo(userMessage, customerContext, agentSlots)
        .then((ctx) => {
          updatedContext = ctx;
          return ctx;
        })
        .catch((err) => {
          console.error("Slot extraction failed:", err.message);
          return customerContext;
        });

      // Note: Context will be yielded AFTER LLM completes, when extraction is done

      const currentLanguageName = LANGUAGE_CODES[language] || "English";

      // Build memory block from collected data (prevents re-asking)
      const memoryBlock = buildMemoryBlock(updatedContext);

      // Simplified prompt for speed
      const enhancedSystemPrompt = `${systemPrompt}

${memoryBlock}
VOICE OUTPUT RULES:
- Keep responses BRIEF (2-3 sentences max)
- ALWAYS complete your sentences - never stop mid-sentence
- Respond in ${currentLanguageName}
- ALWAYS include actual numbers and prices (e.g., "1 crore", "13 crores", "2 BHK")
- NO markdown formatting
- Speak naturally without bullet points

INPUT VALIDATION RULES (CRITICAL):
- NEVER acknowledge receiving information that was NOT actually provided
- If user says "My name is" WITHOUT an actual name → ask "I didn't catch your name. Could you please tell me your name?"
- If user says "My number is" WITHOUT digits → ask "I didn't hear your phone number. Could you please share it?"
- If user says "My pincode is" WITHOUT a 6-digit number → ask "Could you please share your pincode?"
- ONLY confirm receiving info when you have the ACTUAL VALUE (e.g., "My name is Rahul" OR "I am Priya")
- Incomplete sentences like "My name is", "I am", "It's" without content = NO information received

CRITICAL LANGUAGE INSTRUCTION:
- When responding in Hindi (or any non-English language), you MUST follow the EXACT SAME script/flow as you would in English
- ONLY translate the script responses - do NOT generate new content or search for information
- Your knowledge is LIMITED to the script and RAG context provided above - do NOT use external knowledge
- If the user asks something outside the script, politely redirect them back to the script flow
- Example: English script says "What is your name?" → Hindi should be "आपका नाम क्या है?" (just translation, same flow)`;

      // Build messages
      const recentHistory = conversationHistory.slice(-10);
      const messages = [
        { role: "system", content: enhancedSystemPrompt },
        ...recentHistory,
        { role: "user", content: userMessage },
      ];

      // Stream from OpenAI with selected model
      const stream = await this.openai.chat.completions.create({
        model: model, // Use model from options
        messages: messages,
        temperature: temperature,
        max_tokens: maxTokens,
        stream: true, // Enable streaming
      });

      let fullResponse = "";
      let detectedLanguageSwitch = null;

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          fullResponse += content;

          // Check for language switch at start
          if (
            fullResponse.startsWith("LANGUAGE_SWITCH:") &&
            !detectedLanguageSwitch
          ) {
            const match = fullResponse.match(/^LANGUAGE_SWITCH:([a-z]{2})/i);
            if (match) {
              detectedLanguageSwitch = match[1].toLowerCase();
              yield { type: "language", code: detectedLanguageSwitch };
              // Remove the prefix from what we're yielding
              const cleanContent = content.replace(
                /^LANGUAGE_SWITCH:[a-z]{2}\s*/i,
                "",
              );
              if (cleanContent) {
                yield { type: "content", content: cleanContent };
              }
              continue;
            }
          }

          yield { type: "content", content };
        }
      }

      // Wait for extraction to complete and yield final context
      await extractionPromise;
      yield { type: "context", customerContext: updatedContext };

      yield { type: "done" };
    } catch (error) {
      console.error("❌ Stream processing error:", error);
      yield { type: "error", message: error.message };
    }
  }

  /**
   * Response cache for common queries (simple in-memory cache)
   */
  responseCache = new Map();
  cacheMaxAge = 5 * 60 * 1000; // 5 minutes

  /**
   * Get cached response if available and fresh
   */
  getCachedResponse(message, agentId) {
    const key = `${agentId}:${message.toLowerCase().trim().substring(0, 100)}`;
    const cached = this.responseCache.get(key);

    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return cached.data;
    }

    // Clean up stale entry
    if (cached) {
      this.responseCache.delete(key);
    }

    return null;
  }

  /**
   * Cache a response for quick retrieval
   */
  cacheResponse(message, agentId, response) {
    // Only cache short, common queries
    const normalizedMessage = message.toLowerCase().trim();

    // Don't cache personalized responses
    if (
      normalizedMessage.length > 100 ||
      response.customerContext?.name ||
      response.customerContext?.phone
    ) {
      return;
    }

    const key = `${agentId}:${normalizedMessage.substring(0, 100)}`;

    this.responseCache.set(key, {
      data: response,
      timestamp: Date.now(),
    });

    // Limit cache size
    if (this.responseCache.size > 100) {
      const firstKey = this.responseCache.keys().next().value;
      this.responseCache.delete(firstKey);
    }
  }

  /**
   * Clear response cache
   */
  clearCache() {
    this.responseCache.clear();
    console.log("🗑️ Response cache cleared");
  }
}

// Export singleton instance
const aiAgentService = new AIAgentService();
export default aiAgentService;
