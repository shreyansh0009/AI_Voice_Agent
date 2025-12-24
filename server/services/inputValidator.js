/**
 * Input Validation Service
 *
 * VALIDATES USER INPUT - NOT LLM OUTPUT
 *
 * The LLM:
 * - SPEAKS
 * - NEVER decides
 *
 * Backend:
 * - VALIDATES
 * - ADVANCES
 *
 * All validation happens on USER input, not on what LLM says.
 */

// ============================================================================
// VALIDATION RULES
// ============================================================================

const VALIDATION_RULES = {
  // Indian phone: 10 digits starting with 6-9
  phone: {
    pattern: /^[6-9]\d{9}$/,
    minLength: 10,
    maxLength: 10,
    errorMessage:
      "Please provide a valid 10-digit mobile number starting with 6, 7, 8, or 9.",
  },

  // Indian pincode: 6 digits, first digit 1-9
  pincode: {
    pattern: /^[1-9]\d{5}$/,
    minLength: 6,
    maxLength: 6,
    errorMessage: "Please provide a valid 6-digit pincode.",
  },

  // Email: basic email pattern
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    minLength: 5,
    maxLength: 100,
    errorMessage: "Please provide a valid email address.",
  },

  // Name: 2-50 characters, letters and spaces only
  name: {
    pattern: /^[\p{L}\s'-]{2,50}$/u, // Unicode letters, spaces, hyphens, apostrophes
    minLength: 2,
    maxLength: 50,
    errorMessage: "Please provide your name.",
  },

  // Address: 5-200 characters
  address: {
    pattern: /^.{5,200}$/,
    minLength: 5,
    maxLength: 200,
    errorMessage: "Please provide a complete address.",
  },

  // Model/Product: 2-50 characters
  model: {
    pattern: /^.{2,50}$/,
    minLength: 2,
    maxLength: 50,
    errorMessage: "Please specify the model or product.",
  },
};

// ============================================================================
// EXTRACTION FUNCTIONS
// Extract clean values from messy user input
// ============================================================================

/**
 * Extract phone number from user input
 * Handles: "9876543210", "98765 43210", "+91 9876543210", spoken digits
 */
export function extractPhone(input) {
  if (!input || typeof input !== "string") return null;

  // Remove all non-digits
  let digits = input.replace(/\D/g, "");

  // Handle spoken digits (basic patterns)
  const spokenDigits = {
    zero: "0",
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    शून्य: "0",
    एक: "1",
    दो: "2",
    तीन: "3",
    चार: "4",
    पांच: "5",
    छह: "6",
    सात: "7",
    आठ: "8",
    नौ: "9",
  };

  let processedInput = input.toLowerCase();
  for (const [word, digit] of Object.entries(spokenDigits)) {
    processedInput = processedInput.replace(new RegExp(word, "gi"), digit);
  }

  // Extract digits again after spoken conversion
  const spokenExtracted = processedInput.replace(/\D/g, "");
  if (spokenExtracted.length > digits.length) {
    digits = spokenExtracted;
  }

  // Remove country code if present (91, +91, 0)
  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  // Must be exactly 10 digits starting with 6-9
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return digits;
  }

  return null;
}

/**
 * Extract pincode from user input
 * Handles: "305001", "3 0 5 0 0 1", spoken digits
 */
export function extractPincode(input) {
  if (!input || typeof input !== "string") return null;

  // Remove all non-digits
  let digits = input.replace(/\D/g, "");

  // Handle spoken digits
  const spokenDigits = {
    zero: "0",
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    शून्य: "0",
    एक: "1",
    दो: "2",
    तीन: "3",
    चार: "4",
    पांच: "5",
    छह: "6",
    सात: "7",
    आठ: "8",
    नौ: "9",
  };

  let processedInput = input.toLowerCase();
  for (const [word, digit] of Object.entries(spokenDigits)) {
    processedInput = processedInput.replace(new RegExp(word, "gi"), digit);
  }

  const spokenExtracted = processedInput.replace(/\D/g, "");
  if (spokenExtracted.length > digits.length) {
    digits = spokenExtracted;
  }

  // Must be exactly 6 digits, first digit 1-9
  if (digits.length === 6 && /^[1-9]/.test(digits)) {
    return digits;
  }

  return null;
}

/**
 * Extract email from user input
 */
export function extractEmail(input) {
  if (!input || typeof input !== "string") return null;

  // Basic email extraction
  const emailMatch = input.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  if (emailMatch) {
    return emailMatch[0].toLowerCase();
  }

  // Handle spoken email (at = @, dot = .)
  let processed = input
    .toLowerCase()
    .replace(/\s+at\s+/g, "@")
    .replace(/\s+dot\s+/g, ".")
    .replace(/\s+/g, "");

  const spokenMatch = processed.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  return spokenMatch ? spokenMatch[0] : null;
}

/**
 * Extract name from user input
 * Filters out common noise words
 */
export function extractName(input) {
  if (!input || typeof input !== "string") return null;

  // Remove common prefixes
  let cleaned = input
    .replace(/^(my name is|i am|this is|i'm|hello|hi|hey)\s*/i, "")
    .replace(/^(मेरा नाम है|मैं हूँ|मैं|नमस्ते)\s*/i, "")
    .trim();

  // Remove anything after common suffixes
  cleaned = cleaned
    .replace(/\s+(here|speaking|calling|from|है|हूँ|बोल रहा|बोल रही).*$/i, "")
    .trim();

  // Must be 2+ characters and contain at least one letter
  if (cleaned.length >= 2 && /[\p{L}]/u.test(cleaned)) {
    // Capitalize first letter of each word
    return cleaned
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  return null;
}

/**
 * Extract address from user input
 */
export function extractAddress(input) {
  if (!input || typeof input !== "string") return null;

  const cleaned = input.trim();

  // Must be at least 5 characters
  if (cleaned.length >= 5) {
    return cleaned;
  }

  return null;
}

/**
 * Extract model/product from user input
 */
export function extractModel(input) {
  if (!input || typeof input !== "string") return null;

  const cleaned = input
    .replace(
      /^(i want|i need|interested in|looking for|चाहिए|देखना है)\s*/i,
      ""
    )
    .trim();

  if (cleaned.length >= 2) {
    return cleaned;
  }

  return null;
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate phone number
 */
export function validatePhone(value) {
  if (!value)
    return { valid: false, error: VALIDATION_RULES.phone.errorMessage };

  const extracted = extractPhone(value);
  if (!extracted) {
    return { valid: false, error: VALIDATION_RULES.phone.errorMessage };
  }

  return { valid: true, value: extracted };
}

/**
 * Validate pincode
 */
export function validatePincode(value) {
  if (!value)
    return { valid: false, error: VALIDATION_RULES.pincode.errorMessage };

  const extracted = extractPincode(value);
  if (!extracted) {
    return { valid: false, error: VALIDATION_RULES.pincode.errorMessage };
  }

  return { valid: true, value: extracted };
}

/**
 * Validate email
 */
export function validateEmail(value) {
  if (!value)
    return { valid: false, error: VALIDATION_RULES.email.errorMessage };

  const extracted = extractEmail(value);
  if (!extracted || !VALIDATION_RULES.email.pattern.test(extracted)) {
    return { valid: false, error: VALIDATION_RULES.email.errorMessage };
  }

  return { valid: true, value: extracted };
}

/**
 * Validate name
 */
export function validateName(value) {
  if (!value)
    return { valid: false, error: VALIDATION_RULES.name.errorMessage };

  const extracted = extractName(value);
  if (!extracted) {
    return { valid: false, error: VALIDATION_RULES.name.errorMessage };
  }

  return { valid: true, value: extracted };
}

/**
 * Validate address
 */
export function validateAddress(value) {
  if (!value)
    return { valid: false, error: VALIDATION_RULES.address.errorMessage };

  const extracted = extractAddress(value);
  if (!extracted) {
    return { valid: false, error: VALIDATION_RULES.address.errorMessage };
  }

  return { valid: true, value: extracted };
}

/**
 * Validate model/product
 */
export function validateModel(value) {
  if (!value)
    return { valid: false, error: VALIDATION_RULES.model.errorMessage };

  const extracted = extractModel(value);
  if (!extracted) {
    return { valid: false, error: VALIDATION_RULES.model.errorMessage };
  }

  return { valid: true, value: extracted };
}

// ============================================================================
// UNIFIED VALIDATION
// ============================================================================

/**
 * Validate user input for a specific field type
 *
 * @param {string} fieldType - Type of field (phone, pincode, email, name, address, model)
 * @param {string} userInput - Raw user input to validate
 * @returns {object} { valid: boolean, value?: string, error?: string }
 */
export function validateField(fieldType, userInput) {
  switch (fieldType) {
    case "phone":
      return validatePhone(userInput);
    case "pincode":
      return validatePincode(userInput);
    case "email":
      return validateEmail(userInput);
    case "name":
      return validateName(userInput);
    case "address":
      return validateAddress(userInput);
    case "model":
      return validateModel(userInput);
    default:
      // Unknown field type - accept any non-empty input
      return userInput && userInput.trim().length > 0
        ? { valid: true, value: userInput.trim() }
        : { valid: false, error: "Please provide a valid response." };
  }
}

/**
 * Try to extract any known data from user input
 * Used when we don't know what step we're on
 *
 * @param {string} userInput - Raw user input
 * @returns {object} Extracted data { name?, phone?, pincode?, email? }
 */
export function extractAllData(userInput) {
  const data = {};

  const phone = extractPhone(userInput);
  if (phone) data.phone = phone;

  const pincode = extractPincode(userInput);
  if (pincode) data.pincode = pincode;

  const email = extractEmail(userInput);
  if (email) data.email = email;

  const name = extractName(userInput);
  if (name) data.name = name;

  return data;
}

/**
 * Validate input for current step requirements
 *
 * @param {string[]} requiredFields - Fields the current step needs
 * @param {string} userInput - Raw user input
 * @param {object} existingData - Already collected data
 * @returns {object} { allValid: boolean, validatedData: {}, errors: {} }
 */
export function validateStepInput(
  requiredFields,
  userInput,
  existingData = {}
) {
  const result = {
    allValid: true,
    validatedData: {},
    errors: {},
    newData: {},
  };

  // If no specific requirements, try to extract any data
  if (!requiredFields || requiredFields.length === 0) {
    result.validatedData = extractAllData(userInput);
    result.newData = { ...result.validatedData };
    return result;
  }

  // Validate each required field
  for (const field of requiredFields) {
    // Skip if already have this data
    if (existingData[field]) {
      result.validatedData[field] = existingData[field];
      continue;
    }

    // Validate the input for this field
    const validation = validateField(field, userInput);

    if (validation.valid) {
      result.validatedData[field] = validation.value;
      result.newData[field] = validation.value;
    } else {
      result.allValid = false;
      result.errors[field] = validation.error;
    }
  }

  return result;
}

export default {
  // Extraction
  extractPhone,
  extractPincode,
  extractEmail,
  extractName,
  extractAddress,
  extractModel,
  extractAllData,

  // Validation
  validatePhone,
  validatePincode,
  validateEmail,
  validateName,
  validateAddress,
  validateModel,
  validateField,
  validateStepInput,

  // Rules (for reference)
  VALIDATION_RULES,
};
