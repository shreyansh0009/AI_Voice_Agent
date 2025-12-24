/**
 * Response Contract Service
 *
 * PURPOSE: Enforce HARD output contracts between backend ↔ LLM
 *
 * THIS IS NON-NEGOTIABLE.
 *
 * Even with minimal prompts, LLM can still:
 * ❌ Add extra sentences
 * ❌ Rephrase questions
 * ❌ Accidentally ask the next step
 * ❌ Reintroduce greetings
 * ❌ Close early
 *
 * This service ensures:
 * ✅ LLM can ONLY respond using strict JSON schema
 * ✅ No greetings
 * ✅ No explanations
 * ✅ No extra text
 * ✅ No markdown
 *
 * If validation fails → retry LLM with stricter instruction
 * NEVER accept malformed output
 */

// ============================================================================
// RESPONSE SCHEMA
// ============================================================================

export const ResponseType = {
  SPEAK: "SPEAK", // Normal speech output
  SILENCE: "SILENCE", // No response needed (rare)
};

/**
 * Required response structure:
 * {
 *   "type": "SPEAK",
 *   "text": "Please share your pincode."
 * }
 */
export const ResponseSchema = {
  type: {
    required: true,
    enum: Object.values(ResponseType),
  },
  text: {
    required: true,
    maxLength: 300, // Limit response length
    minLength: 1,
    type: "string",
  },
};

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate LLM response against the contract
 *
 * @param {object|string} response - LLM response (JSON or string)
 * @returns {object} { valid: boolean, errors: string[], sanitized: object|null }
 */
export function validateResponse(response) {
  const errors = [];
  let parsed = null;

  // Step 1: Parse if string
  if (typeof response === "string") {
    try {
      parsed = JSON.parse(response);
    } catch (e) {
      // Try to extract JSON from string
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          errors.push("Response is not valid JSON");
        }
      } else {
        errors.push("Response does not contain JSON");
      }
    }
  } else {
    parsed = response;
  }

  if (!parsed) {
    return { valid: false, errors, sanitized: null };
  }

  // Step 2: Validate type field
  if (!parsed.type) {
    errors.push("Missing 'type' field");
  } else if (!Object.values(ResponseType).includes(parsed.type)) {
    errors.push(
      `Invalid type: ${parsed.type}. Must be one of: ${Object.values(
        ResponseType
      ).join(", ")}`
    );
  }

  // Step 3: Validate text field (required for SPEAK)
  if (parsed.type === ResponseType.SPEAK) {
    if (!parsed.text) {
      errors.push("Missing 'text' field for SPEAK response");
    } else if (typeof parsed.text !== "string") {
      errors.push("'text' must be a string");
    } else if (parsed.text.length > ResponseSchema.text.maxLength) {
      errors.push(
        `Text exceeds max length of ${ResponseSchema.text.maxLength}`
      );
    } else if (parsed.text.trim().length < ResponseSchema.text.minLength) {
      errors.push("Text cannot be empty");
    }
  }

  // Step 4: Sanitize if valid
  if (errors.length === 0) {
    return {
      valid: true,
      errors: [],
      sanitized: {
        type: parsed.type,
        text: sanitizeText(parsed.text),
      },
    };
  }

  return { valid: false, errors, sanitized: null };
}

/**
 * Sanitize text to remove unwanted content
 */
function sanitizeText(text) {
  if (!text) return "";

  let cleaned = text
    // Remove markdown
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, "")
    // Remove URLs
    .replace(/https?:\/\/[^\s]+/g, "")
    // Remove special characters that cause TTS issues
    .replace(/[#@$%^&*{}[\]|\\<>]/g, "")
    // Remove numbered lists
    .replace(/^\d+\.\s*/gm, "")
    // Remove bullet points
    .replace(/^[-•]\s*/gm, "")
    // Collapse multiple spaces
    .replace(/\s+/g, " ")
    // Trim
    .trim();

  return cleaned;
}

// ============================================================================
// CONTRACT VIOLATIONS
// ============================================================================

/**
 * Check for common contract violations
 *
 * @param {string} text - LLM text output
 * @returns {string[]} Array of violations
 */
export function checkViolations(text) {
  if (!text) return [];

  const violations = [];
  const textLower = text.toLowerCase();

  // Check for greeting injection
  const greetingPatterns = [
    /^(hi|hello|hey|good morning|good afternoon|good evening)/i,
    /^(namaste|namaskar)/i,
    /^(welcome|greetings)/i,
  ];
  if (greetingPatterns.some((p) => p.test(text.trim()))) {
    violations.push("Contains greeting (not allowed)");
  }

  // Check for closing injection
  const closingPatterns = [
    /(thank you|thanks|goodbye|bye|have a nice day)/i,
    /धन्यवाद|शुभ दिन/i,
  ];
  if (closingPatterns.some((p) => p.test(text))) {
    violations.push("Contains closing phrase (not allowed)");
  }

  // Check for question jumping (asking multiple things)
  const questionCount = (text.match(/\?/g) || []).length;
  if (questionCount > 1) {
    violations.push("Contains multiple questions (only 1 allowed)");
  }

  // Check for explanation patterns
  const explanationPatterns = [
    /let me explain/i,
    /as i mentioned/i,
    /to summarize/i,
    /in summary/i,
    /first.*then.*finally/i,
  ];
  if (explanationPatterns.some((p) => p.test(text))) {
    violations.push("Contains explanation (not allowed)");
  }

  // Check for markdown remnants
  if (/\*|_|#|`|\[|\]/.test(text)) {
    violations.push("Contains markdown formatting");
  }

  // Check for excessive length (likely rambling)
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length > 2) {
    violations.push("Contains more than 2 sentences (too verbose)");
  }

  return violations;
}

/**
 * Strict validation with violation checking
 */
export function validateStrict(response) {
  const validation = validateResponse(response);

  if (!validation.valid) {
    return validation;
  }

  // Additional violation checking
  const violations = checkViolations(validation.sanitized.text);

  if (violations.length > 0) {
    return {
      valid: false,
      errors: violations,
      sanitized: validation.sanitized, // Still return sanitized for fallback
    };
  }

  return validation;
}

// ============================================================================
// PROMPT ENFORCEMENT
// ============================================================================

/**
 * Get the system prompt that enforces the contract
 * This is MINIMAL and STRICT
 */
export function getContractPrompt() {
  return `You are a voice bot. You MUST respond with this JSON only:
{"type":"SPEAK","text":"your sentence here"}

Rules:
- ONLY output JSON
- No greetings
- No explanations
- No extra text
- Max 1 sentence`;
}

/**
 * Get the strict retry prompt (when first attempt fails)
 */
export function getStrictRetryPrompt() {
  return `STRICT: Respond ONLY with this format:
{"type":"SPEAK","text":"..."}

NO other output allowed.`;
}

/**
 * Build the complete prompt for LLM with contract enforcement
 *
 * @param {string} instruction - What to say
 * @param {boolean} isRetry - Is this a retry after failure?
 * @returns {string} Complete prompt
 */
export function buildContractPrompt(instruction, isRetry = false) {
  const basePrompt = isRetry ? getStrictRetryPrompt() : getContractPrompt();

  return `${basePrompt}

Speak this:
"${instruction}"`;
}

// ============================================================================
// RESPONSE EXTRACTION
// ============================================================================

/**
 * Extract valid response from LLM output
 * Handles messy outputs and extracts only what we need
 *
 * @param {string} rawOutput - Raw LLM output
 * @returns {object} { success: boolean, text: string, type: string }
 */
export function extractResponse(rawOutput) {
  // Try strict validation first
  const strict = validateStrict(rawOutput);
  if (strict.valid) {
    return {
      success: true,
      text: strict.sanitized.text,
      type: strict.sanitized.type,
    };
  }

  // Try lenient extraction
  const lenient = validateResponse(rawOutput);
  if (lenient.valid) {
    // Apply additional sanitization
    const text = sanitizeText(lenient.sanitized.text);

    // Remove violations
    const violations = checkViolations(text);
    if (violations.length === 0) {
      return {
        success: true,
        text,
        type: lenient.sanitized.type,
      };
    }

    // Try to fix violations
    let fixedText = text;

    // Remove greetings
    fixedText = fixedText.replace(
      /^(hi|hello|hey|namaste|namaskar|welcome)[,!\s.]*/i,
      ""
    );

    // Remove closings
    fixedText = fixedText.replace(
      /(thank you|thanks|goodbye|bye|have a nice day)[.!]?$/i,
      ""
    );

    // Keep only first question
    const questionMatch = fixedText.match(/[^.!?]*\?/);
    if (questionMatch) {
      fixedText = questionMatch[0].trim();
    }

    if (fixedText.trim().length > 0) {
      return {
        success: true,
        text: fixedText.trim(),
        type: ResponseType.SPEAK,
        wasFixed: true,
      };
    }
  }

  // If rawOutput looks like plain text, try to use it
  if (typeof rawOutput === "string" && rawOutput.trim().length > 0) {
    const plainText = sanitizeText(rawOutput);
    if (plainText.length > 0 && plainText.length < 300) {
      return {
        success: true,
        text: plainText,
        type: ResponseType.SPEAK,
        wasPlainText: true,
      };
    }
  }

  // Complete failure
  return {
    success: false,
    text: null,
    type: null,
    errors: strict.errors,
  };
}

// ============================================================================
// CONSTANTS FOR EXTERNAL USE
// ============================================================================

export const CONTRACT = {
  MAX_TEXT_LENGTH: 300,
  MAX_SENTENCES: 2,
  MAX_QUESTIONS: 1,
  ALLOWED_TYPES: Object.values(ResponseType),
};

export default {
  // Types
  ResponseType,
  ResponseSchema,
  CONTRACT,

  // Validation
  validateResponse,
  validateStrict,
  checkViolations,

  // Extraction
  extractResponse,

  // Prompts
  getContractPrompt,
  getStrictRetryPrompt,
  buildContractPrompt,
};
