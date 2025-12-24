/**
 * Intent Classifier Service
 *
 * PURPOSE: Detect what the user WANTS (not what they said)
 *
 * KEY PRINCIPLES:
 * ❌ Intent does NOT advance steps
 * ❌ Intent does NOT control flow
 * ❌ No LLM involved for classification
 *
 * Intent is ONLY used for:
 * 1. Flow selection (when activeUseCase is null)
 * 2. Explicit intent change ("something else", "cancel")
 * 3. Confirmation detection (yes/no)
 *
 * The LLM is the MOUTH, not the BRAIN.
 */

// ============================================================================
// INTENT DEFINITIONS
// ============================================================================

export const INTENTS = {
  // Flow selection intents
  BOOK_SITE_VISIT: "BOOK_SITE_VISIT",
  BOOK_TEST_RIDE: "BOOK_TEST_RIDE",
  CHECK_PRICE: "CHECK_PRICE",
  CHECK_AVAILABILITY: "CHECK_AVAILABILITY",
  ASK_LOCATION: "ASK_LOCATION",
  BUY_PRODUCT: "BUY_PRODUCT",
  GET_LOAN: "GET_LOAN",

  // Confirmation intents
  CONFIRM_YES: "CONFIRM_YES",
  CONFIRM_NO: "CONFIRM_NO",

  // Navigation intents
  GO_BACK: "GO_BACK",
  START_OVER: "START_OVER",
  CANCEL: "CANCEL",
  SOMETHING_ELSE: "SOMETHING_ELSE",

  // Support intents
  SPEAK_TO_HUMAN: "SPEAK_TO_HUMAN",
  HELP: "HELP",

  // Default
  UNKNOWN: "UNKNOWN",
  CONTINUE: "CONTINUE", // User is providing data, not changing intent
};

// ============================================================================
// INTENT PATTERNS (Multi-language keyword matching)
// ============================================================================

const INTENT_PATTERNS = {
  // Book site visit
  [INTENTS.BOOK_SITE_VISIT]: {
    keywords: [
      "site visit",
      "visit",
      "see property",
      "show flat",
      "show house",
      "visit the site",
      "see the place",
      "come and see",
      "देखना",
      "विजिट",
      "साइट विजिट",
      "जगह देखना",
      "फ्लैट देखना",
    ],
    priority: 10,
  },

  // Book test ride
  [INTENTS.BOOK_TEST_RIDE]: {
    keywords: [
      "test ride",
      "test drive",
      "try",
      "demo",
      "book ride",
      "टेस्ट राइड",
      "टेस्ट ड्राइव",
      "ट्राई",
      "डेमो",
      "राइड बुक",
    ],
    priority: 10,
  },

  // Check price
  [INTENTS.CHECK_PRICE]: {
    keywords: [
      "price",
      "cost",
      "how much",
      "rate",
      "pricing",
      "expensive",
      "कीमत",
      "प्राइस",
      "कितना",
      "रेट",
      "महंगा",
      "दाम",
    ],
    priority: 8,
  },

  // Check availability
  [INTENTS.CHECK_AVAILABILITY]: {
    keywords: [
      "available",
      "availability",
      "in stock",
      "ready",
      "when",
      "उपलब्ध",
      "अवेलेबल",
      "स्टॉक",
      "कब मिलेगा",
      "रेडी",
    ],
    priority: 8,
  },

  // Ask location
  [INTENTS.ASK_LOCATION]: {
    keywords: [
      "where",
      "location",
      "address",
      "directions",
      "near me",
      "showroom",
      "कहाँ",
      "लोकेशन",
      "पता",
      "एड्रेस",
      "शोरूम",
      "नजदीक",
    ],
    priority: 8,
  },

  // Buy product
  [INTENTS.BUY_PRODUCT]: {
    keywords: [
      "buy",
      "purchase",
      "want to buy",
      "interested",
      "book",
      "खरीदना",
      "लेना",
      "चाहिए",
      "इंटरेस्टेड",
      "बुक करना",
    ],
    priority: 9,
  },

  // Get loan
  [INTENTS.GET_LOAN]: {
    keywords: [
      "loan",
      "finance",
      "emi",
      "credit",
      "borrow",
      "लोन",
      "फाइनेंस",
      "emi",
      "किस्त",
      "उधार",
    ],
    priority: 9,
  },

  // Confirmation YES
  [INTENTS.CONFIRM_YES]: {
    keywords: [
      "yes",
      "yeah",
      "yep",
      "correct",
      "right",
      "ok",
      "okay",
      "sure",
      "confirm",
      "confirmed",
      "that's right",
      "exactly",
      "absolutely",
      "हाँ",
      "हां",
      "जी",
      "जी हाँ",
      "सही",
      "ठीक",
      "बिल्कुल",
      "हो",
      "करो",
    ],
    priority: 15, // High priority for confirmations
  },

  // Confirmation NO
  [INTENTS.CONFIRM_NO]: {
    keywords: [
      "no",
      "nope",
      "wrong",
      "incorrect",
      "not right",
      "change",
      "edit",
      "redo",
      "again",
      "different",
      "नहीं",
      "ना",
      "गलत",
      "बदलो",
      "फिर से",
      "अलग",
    ],
    priority: 15,
  },

  // Go back
  [INTENTS.GO_BACK]: {
    keywords: ["go back", "back", "previous", "before", "पीछे", "वापस", "पहले"],
    priority: 12,
  },

  // Start over
  [INTENTS.START_OVER]: {
    keywords: [
      "start over",
      "restart",
      "from beginning",
      "reset",
      "शुरू से",
      "फिर से शुरू",
      "रीस्टार्ट",
    ],
    priority: 12,
  },

  // Cancel
  [INTENTS.CANCEL]: {
    keywords: [
      "cancel",
      "stop",
      "quit",
      "exit",
      "leave",
      "bye",
      "goodbye",
      "रुको",
      "बंद करो",
      "छोड़ो",
      "बाय",
    ],
    priority: 14,
  },

  // Something else
  [INTENTS.SOMETHING_ELSE]: {
    keywords: [
      "something else",
      "other",
      "different thing",
      "not this",
      "कुछ और",
      "दूसरा",
      "अलग",
      "यह नहीं",
    ],
    priority: 11,
  },

  // Speak to human
  [INTENTS.SPEAK_TO_HUMAN]: {
    keywords: [
      "human",
      "agent",
      "person",
      "real person",
      "representative",
      "talk to someone",
      "speak to someone",
      "transfer",
      "operator",
      "इंसान",
      "असली व्यक्ति",
      "एजेंट",
      "कोई से बात",
      "ट्रांसफर",
    ],
    priority: 13,
  },

  // Help
  [INTENTS.HELP]: {
    keywords: [
      "help",
      "confused",
      "don't understand",
      "what",
      "how",
      "मदद",
      "समझ नहीं",
      "क्या",
      "कैसे",
      "हेल्प",
    ],
    priority: 7,
  },
};

// ============================================================================
// INTENT CLASSIFICATION
// ============================================================================

/**
 * Classify user intent from speech
 *
 * NO LLM INVOLVED - Pure keyword matching
 *
 * @param {string} userInput - What the user said
 * @param {object} context - { currentStep, useCase, collectedData }
 * @returns {object} { intent, confidence, isFlowChange }
 */
export function classifyIntent(userInput, context = {}) {
  if (!userInput || typeof userInput !== "string") {
    return {
      intent: INTENTS.UNKNOWN,
      confidence: 0,
      isFlowChange: false,
    };
  }

  const inputLower = userInput.toLowerCase().trim();
  const { currentStep } = context;

  // Track best match
  let bestMatch = {
    intent: INTENTS.CONTINUE,
    confidence: 0,
    priority: 0,
  };

  // Check each intent pattern
  for (const [intent, config] of Object.entries(INTENT_PATTERNS)) {
    const { keywords, priority } = config;

    for (const keyword of keywords) {
      if (inputLower.includes(keyword.toLowerCase())) {
        // Calculate confidence based on how much of the input matches
        const keywordWords = keyword.split(" ").length;
        const inputWords = inputLower.split(" ").length;
        const confidence = Math.min(1, keywordWords / inputWords + 0.3);

        // Use priority to break ties
        if (
          priority > bestMatch.priority ||
          (priority === bestMatch.priority && confidence > bestMatch.confidence)
        ) {
          bestMatch = {
            intent,
            confidence,
            priority,
          };
        }
        break; // Found a match for this intent, move to next
      }
    }
  }

  // Determine if this is a flow change intent
  const flowChangeIntents = [
    INTENTS.BOOK_SITE_VISIT,
    INTENTS.BOOK_TEST_RIDE,
    INTENTS.CHECK_PRICE,
    INTENTS.BUY_PRODUCT,
    INTENTS.GET_LOAN,
    INTENTS.SOMETHING_ELSE,
    INTENTS.CANCEL,
    INTENTS.START_OVER,
    INTENTS.SPEAK_TO_HUMAN,
  ];

  const isFlowChange = flowChangeIntents.includes(bestMatch.intent);

  // If we're on a confirm step and detected yes/no, that's primary
  if (currentStep?.type === "confirm") {
    if (
      bestMatch.intent === INTENTS.CONFIRM_YES ||
      bestMatch.intent === INTENTS.CONFIRM_NO
    ) {
      return {
        intent: bestMatch.intent,
        confidence: bestMatch.confidence,
        isFlowChange: false,
        isConfirmation: true,
      };
    }
  }

  // If no strong intent detected and we have prior context, assume CONTINUE
  if (bestMatch.confidence < 0.3 && context.currentStep) {
    return {
      intent: INTENTS.CONTINUE,
      confidence: 0.5,
      isFlowChange: false,
      isDataInput: true, // User is likely providing data
    };
  }

  return {
    intent: bestMatch.intent,
    confidence: bestMatch.confidence,
    isFlowChange,
  };
}

/**
 * Map intent to use case
 *
 * @param {string} intent - Detected intent
 * @returns {string|null} Use case identifier or null
 */
export function mapIntentToUseCase(intent) {
  const mapping = {
    [INTENTS.BOOK_TEST_RIDE]: "automotive_sales",
    [INTENTS.BUY_PRODUCT]: "automotive_sales",
    [INTENTS.BOOK_SITE_VISIT]: "real_estate_sales",
    [INTENTS.GET_LOAN]: "finance_leads",
    [INTENTS.CHECK_PRICE]: null, // Could be any use case
    [INTENTS.CHECK_AVAILABILITY]: null,
  };

  return mapping[intent] || null;
}

/**
 * Check if intent should trigger escalation
 */
export function shouldEscalate(intent) {
  const escalationIntents = [
    INTENTS.SPEAK_TO_HUMAN,
    INTENTS.HELP, // If help is requested multiple times
  ];
  return escalationIntents.includes(intent);
}

/**
 * Check if intent should cancel flow
 */
export function shouldCancel(intent) {
  return [INTENTS.CANCEL, INTENTS.START_OVER].includes(intent);
}

/**
 * Check if intent is a confirmation
 */
export function isConfirmationIntent(intent) {
  return [INTENTS.CONFIRM_YES, INTENTS.CONFIRM_NO].includes(intent);
}

// ============================================================================
// LLM-BASED CLASSIFICATION (MINIMAL PROMPT)
// Only called when keyword matching fails AND conditions are met
// ============================================================================

/**
 * Check if user utterance indicates an explicit interrupt
 * (e.g., "leave this", "something else", "no, I want to ask...")
 */
function isExplicitInterrupt(userInput) {
  const interruptPatterns = [
    /leave\s*(this|it)/i,
    /something else/i,
    /no,?\s*(I|i)\s*want/i,
    /wait,?\s*(I|i)/i,
    /actually,?\s*(I|i)/i,
    /not\s*this/i,
    /different/i,
    /कुछ और/i,
    /यह नहीं/i,
    /रुको/i,
  ];

  return interruptPatterns.some((pattern) => pattern.test(userInput));
}

/**
 * Classify intent using LLM with MINIMAL prompt
 *
 * WHEN TO CALL:
 * ✅ ONLY when:
 *    - ActiveUseCase is null (first turn, need to detect flow)
 *    - OR user explicitly interrupts
 *
 * ❌ NOT on every turn (saves cost)
 *
 * @param {string} utterance - User's speech
 * @param {object} openaiClient - OpenAI client instance
 * @returns {Promise<object>} { intent, confidence, source: "llm" }
 */
export async function classifyIntentWithLLM(utterance, openaiClient) {
  if (!utterance || !openaiClient) {
    return {
      intent: INTENTS.UNKNOWN,
      confidence: 0,
      source: "error",
    };
  }

  // MINIMAL PROMPT - 10-20 tokens only
  // No rules. No examples. No context.
  const prompt = `Classify intent into one of:
BOOK_SITE_VISIT
BOOK_TEST_RIDE
CHECK_PRICE
BUY_PRODUCT
GET_LOAN
CONFIRM_YES
CONFIRM_NO
SPEAK_TO_HUMAN
CANCEL
UNKNOWN

User: "${utterance}"

Return JSON only:
{"intent":"..."}`;

  try {
    const response = await openaiClient.chat.completions.create({
      model: "gpt-3.5-turbo", // Use cheaper model for classification
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 20,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);

    // Validate the intent
    const intent = parsed.intent?.toUpperCase() || INTENTS.UNKNOWN;
    const validIntent = Object.values(INTENTS).includes(intent)
      ? intent
      : INTENTS.UNKNOWN;

    console.log(`🤖 LLM classified: "${utterance}" → ${validIntent}`);

    return {
      intent: validIntent,
      confidence: 0.9, // LLM classification is high confidence
      source: "llm",
    };
  } catch (error) {
    console.error("❌ LLM intent classification error:", error.message);
    return {
      intent: INTENTS.UNKNOWN,
      confidence: 0,
      source: "error",
    };
  }
}

/**
 * Smart classifier - uses keyword first, falls back to LLM only when needed
 *
 * @param {string} userInput - User's speech
 * @param {object} context - { currentStep, useCase, openaiClient }
 * @returns {Promise<object>} { intent, confidence, source }
 */
export async function classifyIntentSmart(userInput, context = {}) {
  const { useCase, openaiClient } = context;

  // Step 1: Try keyword matching first (fast, free)
  const keywordResult = classifyIntent(userInput, context);

  // Step 2: Check if we need LLM classification
  const needsLLM =
    // UseCase is null - need to detect which flow
    useCase === null ||
    useCase === undefined ||
    // User explicitly interrupted
    isExplicitInterrupt(userInput) ||
    // Keyword matching returned UNKNOWN with low confidence
    (keywordResult.intent === INTENTS.UNKNOWN &&
      keywordResult.confidence < 0.3);

  // Step 3: If keyword match is good enough, use it
  if (!needsLLM || keywordResult.confidence >= 0.5) {
    return {
      ...keywordResult,
      source: "keyword",
    };
  }

  // Step 4: Fall back to LLM only if client is available
  if (openaiClient && needsLLM) {
    console.log(
      `🔍 Keyword match insufficient (${
        keywordResult.intent
      }, ${keywordResult.confidence.toFixed(2)}) - using LLM`
    );
    return await classifyIntentWithLLM(userInput, openaiClient);
  }

  // Step 5: Return keyword result if no LLM available
  return {
    ...keywordResult,
    source: "keyword",
  };
}

/**
 * Check if LLM classification is needed
 * (for pre-check to avoid unnecessary computation)
 */
export function needsLLMClassification(userInput, context = {}) {
  const { useCase } = context;

  // UseCase is null - need to detect flow
  if (useCase === null || useCase === undefined) {
    return true;
  }

  // User explicitly interrupted
  if (isExplicitInterrupt(userInput)) {
    return true;
  }

  return false;
}

export default {
  INTENTS,
  classifyIntent,
  classifyIntentWithLLM,
  classifyIntentSmart,
  mapIntentToUseCase,
  shouldEscalate,
  shouldCancel,
  isConfirmationIntent,
  needsLLMClassification,
};
