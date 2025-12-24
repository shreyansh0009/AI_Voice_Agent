/**
 * Output Parser Service
 *
 * STRICT OUTPUT CONTRACT
 *
 * The LLM MUST return:
 * {
 *   "spoken_text": "कृपया अपना पिनकोड बताइए",
 *   "language": "hi"
 * }
 *
 * EVERYTHING ELSE IS DISCARDED.
 *
 * If LLM adds extra text → strip it
 * If LLM doesn't return JSON → extract the text anyway
 * If LLM returns gibberish → use fallback
 */

// ============================================================================
// OUTPUT CONTRACT
// ============================================================================

const OUTPUT_CONTRACT = {
  required: ["spoken_text"],
  optional: ["language"],
  maxLength: 200, // Max characters for spoken_text
};

// ============================================================================
// JSON EXTRACTION
// ============================================================================

/**
 * Extract JSON from LLM response
 * Handles: pure JSON, JSON with surrounding text, markdown code blocks
 *
 * @param {string} rawResponse - Raw LLM response
 * @returns {object|null} Parsed JSON or null
 */
function extractJSON(rawResponse) {
  if (!rawResponse || typeof rawResponse !== "string") {
    return null;
  }

  // Try 1: Direct JSON parse
  try {
    const parsed = JSON.parse(rawResponse.trim());
    if (typeof parsed === "object" && parsed !== null) {
      return parsed;
    }
  } catch (e) {
    // Not pure JSON, continue
  }

  // Try 2: Extract JSON from markdown code block
  const codeBlockMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (e) {
      // Invalid JSON in code block
    }
  }

  // Try 3: Find JSON object in text
  const jsonMatch = rawResponse.match(/\{[\s\S]*?"spoken_text"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      // Invalid JSON pattern
    }
  }

  // Try 4: Find any JSON object
  const anyJsonMatch = rawResponse.match(/\{[^{}]*\}/);
  if (anyJsonMatch) {
    try {
      return JSON.parse(anyJsonMatch[0]);
    } catch (e) {
      // Invalid JSON
    }
  }

  return null;
}

/**
 * Extract spoken text from non-JSON response
 * Last resort - just use the text as-is
 *
 * @param {string} rawResponse - Raw LLM response
 * @returns {string} Extracted text
 */
function extractPlainText(rawResponse) {
  if (!rawResponse || typeof rawResponse !== "string") {
    return "";
  }

  let text = rawResponse.trim();

  // Remove common LLM artifacts
  text = text
    // Remove markdown
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    // Remove JSON attempts
    .replace(/\{[\s\S]*?\}/g, "")
    // Remove URLs
    .replace(/https?:\/\/[^\s]+/g, "")
    // Remove special tokens
    .replace(/\[MEMORY:.*?\]/g, "")
    .replace(/\[.*?\]/g, "")
    // Remove excessive whitespace
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

// ============================================================================
// MAIN PARSER
// ============================================================================

/**
 * Parse LLM response according to STRICT OUTPUT CONTRACT
 *
 * @param {string} rawResponse - Raw LLM response
 * @param {string} expectedLanguage - Expected language code
 * @param {string} fallbackText - Fallback if parsing fails
 * @returns {object} { spoken_text: string, language: string }
 */
export function parseResponse(
  rawResponse,
  expectedLanguage = "en",
  fallbackText = null
) {
  // Step 1: Try to extract JSON
  const json = extractJSON(rawResponse);

  if (json && json.spoken_text) {
    // ✅ Valid JSON with spoken_text
    return {
      spoken_text: sanitizeSpokenText(json.spoken_text),
      language: json.language || expectedLanguage,
      raw: rawResponse,
      parsed: true,
    };
  }

  // Step 2: Extract plain text
  const plainText = extractPlainText(rawResponse);

  if (plainText && plainText.length > 0) {
    // ⚠️ No JSON, but got text
    return {
      spoken_text: sanitizeSpokenText(plainText),
      language: expectedLanguage,
      raw: rawResponse,
      parsed: false,
    };
  }

  // Step 3: Use fallback
  return {
    spoken_text: fallbackText || "I'm sorry, could you repeat that?",
    language: expectedLanguage,
    raw: rawResponse,
    parsed: false,
    fallback: true,
  };
}

/**
 * Sanitize spoken text for TTS
 *
 * @param {string} text - Raw text
 * @returns {string} Cleaned text
 */
function sanitizeSpokenText(text) {
  if (!text || typeof text !== "string") {
    return "";
  }

  let cleaned = text
    // Remove markdown formatting
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    // Remove code formatting
    .replace(/`([^`]+)`/g, "$1")
    // Remove URLs (not speakable)
    .replace(/https?:\/\/[^\s]+/g, "")
    // Remove special characters that cause TTS issues
    .replace(/[#@$%^&*(){}[\]|\\<>]/g, "")
    // Replace multiple spaces with single
    .replace(/\s+/g, " ")
    // Trim
    .trim();

  // Enforce max length
  if (cleaned.length > OUTPUT_CONTRACT.maxLength) {
    // Cut at last complete sentence
    const truncated = cleaned.substring(0, OUTPUT_CONTRACT.maxLength);
    const lastPeriod = truncated.lastIndexOf(".");
    const lastQuestion = truncated.lastIndexOf("?");
    const lastExclaim = truncated.lastIndexOf("!");
    const lastSentence = Math.max(lastPeriod, lastQuestion, lastExclaim);

    if (lastSentence > OUTPUT_CONTRACT.maxLength / 2) {
      cleaned = truncated.substring(0, lastSentence + 1);
    } else {
      cleaned = truncated + "...";
    }
  }

  return cleaned;
}

/**
 * Validate parsed output against contract
 *
 * @param {object} parsed - Parsed response
 * @returns {object} { valid: boolean, errors: string[] }
 */
export function validateOutput(parsed) {
  const errors = [];

  if (!parsed.spoken_text) {
    errors.push("Missing spoken_text");
  } else if (typeof parsed.spoken_text !== "string") {
    errors.push("spoken_text must be a string");
  } else if (parsed.spoken_text.length === 0) {
    errors.push("spoken_text cannot be empty");
  }

  if (parsed.language && typeof parsed.language !== "string") {
    errors.push("language must be a string");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get the JSON output schema to include in prompt
 * This tells the LLM exactly what format to return
 *
 * @returns {string} Schema instruction
 */
export function getOutputSchemaInstruction() {
  return `Respond ONLY with this JSON format:
{"spoken_text": "your response here", "language": "en"}`;
}

/**
 * Detect language from text (simple detection)
 *
 * @param {string} text - Text to analyze
 * @returns {string} Detected language code
 */
export function detectLanguage(text) {
  if (!text) return "en";

  // Hindi detection (Devanagari script)
  if (/[\u0900-\u097F]/.test(text)) return "hi";

  // Tamil detection
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta";

  // Telugu detection
  if (/[\u0C00-\u0C7F]/.test(text)) return "te";

  // Kannada detection
  if (/[\u0C80-\u0CFF]/.test(text)) return "kn";

  // Malayalam detection
  if (/[\u0D00-\u0D7F]/.test(text)) return "ml";

  // Bengali detection
  if (/[\u0980-\u09FF]/.test(text)) return "bn";

  // Gujarati detection
  if (/[\u0A80-\u0AFF]/.test(text)) return "gu";

  // Punjabi detection (Gurmukhi)
  if (/[\u0A00-\u0A7F]/.test(text)) return "pa";

  return "en";
}

export default {
  parseResponse,
  validateOutput,
  getOutputSchemaInstruction,
  detectLanguage,
  sanitizeSpokenText,
  OUTPUT_CONTRACT,
};
