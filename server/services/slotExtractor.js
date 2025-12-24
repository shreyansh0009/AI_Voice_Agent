/**
 * Slot Extractor Service
 *
 * PURPOSE: Extract ONLY the data needed for the CURRENT step
 *
 * KEY PRINCIPLES:
 * ❌ Do NOT extract all possible data
 * ❌ Do NOT use LLM for extraction
 * ❌ Do NOT send full conversation history
 *
 * ✅ Extract ONLY what the current step needs
 * ✅ Use pattern matching (no LLM)
 * ✅ Validate extracted values
 *
 * This layer sits BETWEEN user speech and state engine.
 */

import inputValidator from "./inputValidator.js";

// ============================================================================
// SLOT DEFINITIONS
// ============================================================================

export const SLOTS = {
  NAME: "name",
  PHONE: "phone",
  MOBILE: "mobile", // Alias for phone
  PINCODE: "pincode",
  EMAIL: "email",
  ADDRESS: "address",
  MODEL: "model",
  BUDGET: "budget",
  LOAN_TYPE: "loanType",
  LOAN_AMOUNT: "loanAmount",
  MONTHLY_INCOME: "monthlyIncome",
  PROPERTY_TYPE: "propertyType",
  LOCATION: "location",
};

// ============================================================================
// EXTRACTION PATTERNS
// ============================================================================

const EXTRACTION_PATTERNS = {
  // Phone number (10 digits)
  [SLOTS.PHONE]: {
    patterns: [
      /(?:my|mera|phone|mobile|number|contact|nambr|nambar|नंबर|फोन)\s*(?:is|hai|h|:)?\s*(\d[\d\s\-]{8,14}\d)/i,
      /(\d{10})/, // Bare 10 digits
      /(?:91|0)?[\s\-]?(\d{10})/, // With country/STD code
    ],
    validator: "phone",
    aliases: ["mobile", "contact", "number"],
  },

  // Pincode (6 digits)
  [SLOTS.PINCODE]: {
    patterns: [
      /(?:pincode|pin|zip|code|पिनकोड|पिन)\s*(?:is|hai|h|:)?\s*(\d{6})/i,
      /(\d{6})/, // Bare 6 digits
    ],
    validator: "pincode",
    aliases: ["pin", "zip", "postal"],
  },

  // Email
  [SLOTS.EMAIL]: {
    patterns: [
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /(?:email|mail|ईमेल)\s*(?:is|hai|h|:)?\s*([a-zA-Z0-9._%+-]+\s*(?:at|@)\s*[a-zA-Z0-9.-]+\s*(?:dot|\.)\s*[a-zA-Z]{2,})/i,
    ],
    validator: "email",
    aliases: ["mail"],
  },

  // Name
  [SLOTS.NAME]: {
    patterns: [
      /(?:my name is|i am|this is|mera naam|naam|नाम)\s*(?:is|hai|h|:)?\s*([A-Za-z\s]+)/i,
      /(?:i'm|im)\s+([A-Za-z\s]+)/i,
      /^([A-Za-z\s]{2,30})$/i, // Just a name (nothing else)
    ],
    validator: "name",
    aliases: [],
  },

  // Address
  [SLOTS.ADDRESS]: {
    patterns: [
      /(?:address|location|पता|एड्रेस)\s*(?:is|hai|h|:)?\s*(.{10,})/i,
      /(?:i live|staying|stay|रहता|रहती)\s*(?:at|in|में|पर)?\s*(.{10,})/i,
    ],
    validator: "address",
    aliases: ["location"],
  },

  // Model/Product
  [SLOTS.MODEL]: {
    patterns: [
      /(?:interested in|want|looking for|model|मॉडल|चाहिए)\s*(?:is|hai|h|:)?\s*(.{2,50})/i,
    ],
    validator: "model",
    aliases: ["product", "vehicle", "car", "bike"],
  },

  // Budget
  [SLOTS.BUDGET]: {
    patterns: [
      /(?:budget|बजट)\s*(?:is|hai|h|:)?\s*([\d\s,]+(?:lakh|lac|crore|cr|k|हजार|लाख|करोड़)?)/i,
      /([\d,]+)\s*(?:to|से|-)\s*([\d,]+)\s*(?:lakh|lac|crore|cr|k|l)?/i,
    ],
    validator: "text",
    aliases: ["price range", "range"],
  },

  // Loan Type
  [SLOTS.LOAN_TYPE]: {
    patterns: [
      /(?:personal|home|business|car|education)\s*loan/i,
      /loan\s*(?:for|type)?\s*(personal|home|business|car|education)/i,
    ],
    validator: "text",
    aliases: ["loan"],
  },

  // Loan Amount
  [SLOTS.LOAN_AMOUNT]: {
    patterns: [
      /(?:amount|loan of|राशि)\s*(?:is|of|:)?\s*([\d\s,]+(?:lakh|lac|crore|cr|k|हजार|लाख|करोड़)?)/i,
    ],
    validator: "text",
    aliases: ["amount"],
  },

  // Monthly Income
  [SLOTS.MONTHLY_INCOME]: {
    patterns: [
      /(?:income|salary|earning|कमाई|सैलरी)\s*(?:is|of|:)?\s*([\d\s,]+(?:per month|monthly|महीना)?)/i,
    ],
    validator: "text",
    aliases: ["salary", "income"],
  },

  // Property Type
  [SLOTS.PROPERTY_TYPE]: {
    patterns: [
      /(1\s*bhk|2\s*bhk|3\s*bhk|4\s*bhk|villa|apartment|flat|house|plot)/i,
    ],
    validator: "text",
    aliases: ["flat type", "house type"],
  },
};

// ============================================================================
// SLOT EXTRACTION
// ============================================================================

/**
 * Extract a specific slot from user input
 *
 * @param {string} slotType - Type of slot to extract
 * @param {string} userInput - Raw user input
 * @returns {object} { found: boolean, value: string|null, raw: string|null }
 */
export function extractSlot(slotType, userInput) {
  if (!userInput || typeof userInput !== "string") {
    return { found: false, value: null, raw: null };
  }

  const config = EXTRACTION_PATTERNS[slotType];
  if (!config) {
    // Unknown slot type - try direct validation
    const validation = inputValidator.validateField(slotType, userInput);
    return {
      found: validation.valid,
      value: validation.value || null,
      raw: userInput,
    };
  }

  // Try each pattern
  for (const pattern of config.patterns) {
    const match = userInput.match(pattern);
    if (match) {
      const rawValue = match[1] || match[0];

      // Validate the extracted value
      const validation = inputValidator.validateField(
        config.validator,
        rawValue
      );

      if (validation.valid) {
        return {
          found: true,
          value: validation.value,
          raw: rawValue,
        };
      }
    }
  }

  // No pattern matched - try direct validation on full input
  const directValidation = inputValidator.validateField(
    config.validator,
    userInput
  );
  if (directValidation.valid) {
    return {
      found: true,
      value: directValidation.value,
      raw: userInput,
    };
  }

  return { found: false, value: null, raw: null };
}

/**
 * Extract slots for the CURRENT step only
 *
 * This is the main function - extracts ONLY what the step needs
 *
 * @param {string} userInput - Raw user input
 * @param {object} stepConfig - Current step configuration
 * @returns {object} { slots: {}, allFound: boolean, missing: [] }
 */
export function extractSlotsForStep(userInput, stepConfig) {
  if (!stepConfig || !stepConfig.field) {
    // Step doesn't need any slots
    return { slots: {}, allFound: true, missing: [] };
  }

  const requiredField = stepConfig.field;
  const slots = {};
  const missing = [];

  // Extract the required slot
  const extracted = extractSlot(requiredField, userInput);

  if (extracted.found) {
    slots[requiredField] = extracted.value;
  } else {
    missing.push(requiredField);
  }

  return {
    slots,
    allFound: missing.length === 0,
    missing,
  };
}

/**
 * Extract multiple slots from input (for opportunistic extraction)
 *
 * @param {string} userInput - Raw user input
 * @param {string[]} slotTypes - Types to try extracting
 * @returns {object} Extracted slots { slotType: value }
 */
export function extractMultipleSlots(userInput, slotTypes = []) {
  const slots = {};

  for (const slotType of slotTypes) {
    const extracted = extractSlot(slotType, userInput);
    if (extracted.found) {
      slots[slotType] = extracted.value;
    }
  }

  return slots;
}

/**
 * Opportunistically extract all recognizable data
 * Use sparingly - prefer step-specific extraction
 *
 * @param {string} userInput - Raw user input
 * @returns {object} All extracted slots
 */
export function extractAll(userInput) {
  return extractMultipleSlots(userInput, Object.values(SLOTS));
}

// ============================================================================
// SLOT VALIDATION
// ============================================================================

/**
 * Check if a slot value is valid
 */
export function isValidSlot(slotType, value) {
  const config = EXTRACTION_PATTERNS[slotType];
  if (!config) return true; // Unknown slots are assumed valid

  const validation = inputValidator.validateField(config.validator, value);
  return validation.valid;
}

/**
 * Get validation error for slot
 */
export function getSlotError(slotType) {
  const errorMessages = {
    [SLOTS.PHONE]: "Please provide a valid 10-digit mobile number.",
    [SLOTS.PINCODE]: "Please provide a valid 6-digit pincode.",
    [SLOTS.EMAIL]: "Please provide a valid email address.",
    [SLOTS.NAME]: "Please tell me your name.",
    [SLOTS.ADDRESS]: "Please provide your complete address.",
    [SLOTS.MODEL]: "Please specify the model you're interested in.",
    [SLOTS.BUDGET]: "Please share your budget range.",
  };

  return errorMessages[slotType] || "Please provide a valid response.";
}

// ============================================================================
// NUMERIC EXTRACTION HELPERS
// ============================================================================

/**
 * Extract numbers from text (handles lakhs, crores, etc.)
 */
export function extractNumber(text) {
  if (!text) return null;

  // Handle words
  const wordToNum = {
    lakh: 100000,
    lac: 100000,
    lakhs: 100000,
    crore: 10000000,
    cr: 10000000,
    crores: 10000000,
    thousand: 1000,
    k: 1000,
    हजार: 1000,
    लाख: 100000,
    करोड़: 10000000,
  };

  // Extract digits and multipliers
  let cleaned = text.toLowerCase().replace(/,/g, "").trim();
  let multiplier = 1;

  for (const [word, value] of Object.entries(wordToNum)) {
    if (cleaned.includes(word)) {
      multiplier = value;
      cleaned = cleaned.replace(word, "").trim();
      break;
    }
  }

  const digits = cleaned.match(/\d+/);
  if (digits) {
    return parseInt(digits[0]) * multiplier;
  }

  return null;
}

/**
 * Format number as Indian currency
 */
export function formatIndianNumber(num) {
  if (!num) return null;

  if (num >= 10000000) {
    return `${(num / 10000000).toFixed(1)} Cr`;
  } else if (num >= 100000) {
    return `${(num / 100000).toFixed(1)} Lakh`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }

  return num.toString();
}

// ============================================================================
// YES / NO HANDLING (STRICT - Backend decides, NOT LLM)
// This is where agents break if LLM decides
// ============================================================================

/**
 * Check if user input is a YES response
 * STRICT regex matching - no LLM inference
 *
 * @param {string} input - User's raw input
 * @returns {boolean} True if confirmed
 */
export function isYes(input) {
  if (!input) return false;
  const cleaned = input.toLowerCase().trim();

  // English patterns
  const enPatterns =
    /^(yes|yeah|yep|yea|ya|yup|ok|okay|sure|right|correct|confirm|confirmed|absolutely|definitely|of course|alright)$/i;

  // Hindi patterns
  const hiPatterns =
    /^(हाँ|हां|जी|जी हाँ|जी हां|सही|ठीक|बिल्कुल|हो|करो|कर दो|ठीक है|हा|han|haan|ha|ji)$/i;

  // Combined check
  return enPatterns.test(cleaned) || hiPatterns.test(cleaned);
}

/**
 * Check if user input is a NO response
 * STRICT regex matching - no LLM inference
 *
 * @param {string} input - User's raw input
 * @returns {boolean} True if denied
 */
export function isNo(input) {
  if (!input) return false;
  const cleaned = input.toLowerCase().trim();

  // English patterns
  const enPatterns =
    /^(no|nope|nah|wrong|incorrect|not right|change|edit|redo|cancel|negative)$/i;

  // Hindi patterns
  const hiPatterns = /^(नहीं|ना|गलत|बदलो|नही|nahi|na)$/i;

  // Combined check
  return enPatterns.test(cleaned) || hiPatterns.test(cleaned);
}

/**
 * Classify yes/no/unclear from input
 *
 * @param {string} input - User's raw input
 * @returns {string} "yes" | "no" | "unclear"
 */
export function classifyConfirmation(input) {
  if (isYes(input)) return "yes";
  if (isNo(input)) return "no";
  return "unclear";
}

// ============================================================================
// NORMALIZERS (No LLM needed)
// ============================================================================

/**
 * Normalize pincode from various input formats
 *
 * @param {string} input - Raw input
 * @returns {string|null} Normalized 6-digit pincode or null
 */
export function normalizePincode(input) {
  if (!input) return null;

  // Remove all non-digits
  const digits = input.replace(/\D/g, "");

  // Must be exactly 6 digits
  if (digits.length === 6 && /^[1-9]\d{5}$/.test(digits)) {
    return digits;
  }

  return null;
}

/**
 * Normalize phone number from various input formats
 *
 * @param {string} input - Raw input
 * @returns {string|null} Normalized 10-digit phone or null
 */
export function normalizePhone(input) {
  if (!input) return null;

  // Remove all non-digits
  let digits = input.replace(/\D/g, "");

  // Handle country code
  if (digits.startsWith("91") && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0") && digits.length === 11) {
    digits = digits.slice(1);
  }

  // Must be 10 digits starting with 6-9
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return digits;
  }

  return null;
}

/**
 * Normalize date from various input formats
 *
 * @param {string} input - Raw input like "25 December", "25/12", "tomorrow"
 * @returns {string|null} ISO date string or null
 */
export function normalizeDate(input) {
  if (!input) return null;

  const cleaned = input.toLowerCase().trim();
  const today = new Date();

  // Relative dates
  if (cleaned === "today" || cleaned === "आज") {
    return today.toISOString().split("T")[0];
  }

  if (cleaned === "tomorrow" || cleaned === "कल") {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  }

  // Try parsing explicit dates
  const datePatterns = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-]?(\d{2,4})?/, // 25/12 or 25/12/2024
    /(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*/i,
  ];

  for (const pattern of datePatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      // Basic date extraction (simplified)
      const day = parseInt(match[1]);
      const month = match[2];

      if (day >= 1 && day <= 31) {
        // Return in a parseable format
        const monthNum =
          typeof month === "string"
            ? [
                "jan",
                "feb",
                "mar",
                "apr",
                "may",
                "jun",
                "jul",
                "aug",
                "sep",
                "oct",
                "nov",
                "dec",
              ].indexOf(month.slice(0, 3).toLowerCase()) + 1
            : parseInt(month);

        if (monthNum >= 1 && monthNum <= 12) {
          const year = match[3] ? parseInt(match[3]) : today.getFullYear();
          const fullYear = year < 100 ? 2000 + year : year;
          return `${fullYear}-${String(monthNum).padStart(2, "0")}-${String(
            day
          ).padStart(2, "0")}`;
        }
      }
    }
  }

  return null;
}

/**
 * Normalize time from various input formats
 *
 * @param {string} input - Raw input like "2pm", "14:00", "2 o'clock"
 * @returns {string|null} 24-hour time string or null
 */
export function normalizeTime(input) {
  if (!input) return null;

  const cleaned = input.toLowerCase().trim();

  // Match patterns like "2pm", "2:30pm", "14:00"
  const timePatterns = [/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i];

  for (const pattern of timePatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      let hour = parseInt(match[1]);
      const minute = match[2] ? parseInt(match[2]) : 0;
      const meridian = match[3]?.toLowerCase();

      // Convert to 24-hour
      if (meridian === "pm" && hour < 12) hour += 12;
      if (meridian === "am" && hour === 12) hour = 0;

      if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
        return `${String(hour).padStart(2, "0")}:${String(minute).padStart(
          2,
          "0"
        )}`;
      }
    }
  }

  return null;
}

/**
 * Extract slots based on step's "expects" definition (JSON-driven)
 *
 * Example step:
 * {
 *   "id": "ask_pincode",
 *   "expects": { "pincode": "pincode" }
 * }
 *
 * @param {object} step - Step definition with expects
 * @param {string} userInput - Raw user input
 * @returns {object} Extracted slots
 */
export function extractSlotsByExpects(step, userInput) {
  if (!step?.expects || !userInput) {
    return {};
  }

  const slots = {};

  for (const [fieldName, slotType] of Object.entries(step.expects)) {
    // Use appropriate normalizer
    let value = null;

    switch (slotType) {
      case "pincode":
        value = normalizePincode(userInput);
        break;
      case "phone":
      case "mobile":
        value = normalizePhone(userInput);
        break;
      case "date":
        value = normalizeDate(userInput);
        break;
      case "time":
        value = normalizeTime(userInput);
        break;
      case "yes_no":
      case "confirmation":
        value = classifyConfirmation(userInput);
        break;
      default:
        // Generic extraction
        const extracted = extractSlot(slotType, userInput);
        value = extracted.found ? extracted.value : null;
    }

    if (value !== null) {
      slots[fieldName] = value;
    }
  }

  return slots;
}

export default {
  SLOTS,
  extractSlot,
  extractSlotsForStep,
  extractSlotsByExpects,
  extractMultipleSlots,
  extractAll,
  isValidSlot,
  getSlotError,
  extractNumber,
  formatIndianNumber,

  // Yes/No handling (STRICT)
  isYes,
  isNo,
  classifyConfirmation,

  // Normalizers
  normalizePincode,
  normalizePhone,
  normalizeDate,
  normalizeTime,
};
