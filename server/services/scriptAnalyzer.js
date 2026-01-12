/**
 * Script Analyzer Service
 *
 * PURPOSE: Parse agent scripts to detect required information fields
 *
 * FEATURES:
 * - Detects placeholders: {Name}, {Mobile}, {VehicleRegistration}, etc.
 * - Infers field types (phone, email, number, text, date)
 * - Generates validation patterns
 * - Works with multiple placeholder formats
 */

/**
 * Analyze script to detect required slots
 *
 * @param {string} scriptText - The agent's script/prompt
 * @returns {Array} Array of detected slots with metadata
 */
function analyzeScript(scriptText) {
  if (!scriptText || typeof scriptText !== "string") {
    return [];
  }

  const slots = [];
  const seenSlots = new Set(); // Prevent duplicates

  // ============================================================================
  // METHOD 1: PLACEHOLDER DETECTION (Original)
  // ============================================================================

  // Pattern 1: {FieldName} or {Field Name}
  const curlyBracePattern = /\{([^}]+)\}/g;

  // Pattern 2: {{FieldName}} (double braces)
  const doubleCurlyPattern = /\{\{([^}]+)\}\}/g;

  // Pattern 3: [FieldName] (square brackets - alternative)
  const squareBracketPattern = /\[([A-Z][a-zA-Z0-9_\s]*)\]/g;

  // Extract using all patterns
  const patterns = [
    curlyBracePattern,
    doubleCurlyPattern,
    squareBracketPattern,
  ];

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(scriptText)) !== null) {
      const rawFieldName = match[1].trim();

      // Normalize: "Vehicle Registration" -> "VehicleRegistration"
      const normalizedName = rawFieldName
        .replace(/\s+/g, "") // Remove spaces
        .replace(/[^a-zA-Z0-9]/g, ""); // Remove special chars

      // Skip if already seen or empty
      if (!normalizedName || seenSlots.has(normalizedName.toLowerCase())) {
        continue;
      }

      seenSlots.add(normalizedName.toLowerCase());

      // Infer field type and pattern based on field name
      const slotMetadata = inferFieldType(normalizedName);

      slots.push({
        name: normalizedName,
        displayName: rawFieldName, // Original name with spaces
        type: slotMetadata.type,
        pattern: slotMetadata.pattern,
        required: true, // Assume all detected fields are required
        detectedFrom: "placeholder",
        description: slotMetadata.description,
      });
    }
  });

  // ============================================================================
  // METHOD 2: NATURAL LANGUAGE DETECTION (NEW - Enhanced)
  // ============================================================================
  // Detects fields from phrases like "your name", "mobile number", etc.

  const scriptLower = scriptText.toLowerCase();

  // Natural language patterns for common fields
  const naturalLanguagePatterns = [
    // Name patterns
    {
      patterns: [
        /\b(?:your|customer|user|caller)\s+name\b/i,
        /\bmay\s+i\s+(?:know|have|get)\s+your\s+name\b/i,
        /\b(?:what|tell|share|provide)\s+(?:is\s+)?(?:your\s+)?name\b/i,
      ],
      field: "Name",
      type: "name",
    },

    // Mobile/Phone patterns
    {
      patterns: [
        /\b(?:mobile|phone|contact)\s+(?:number)?\b/i,
        /\bregistered\s+mobile\b/i,
        /\b(?:your|customer)\s+(?:mobile|phone|contact)\b/i,
        /\b10[\s-]?digit\s+(?:mobile|phone|number)\b/i,
      ],
      field: "Mobile",
      type: "phone",
    },

    // Vehicle Registration patterns
    {
      patterns: [
        /\bvehicle\s+registration\s+(?:number)?\b/i,
        /\breg(?:istration)?\s+(?:number|no)\b/i,
        /\b(?:rc|registration\s+certificate)\s+number\b/i,
      ],
      field: "VehicleRegistration",
      type: "vehicle_registration",
    },

    // Pincode patterns
    {
      patterns: [
        /\b(?:6[\s-]?digit\s+)?pincode\b/i,
        /\bpin\s+code\b/i,
        /\bpostal\s+code\b/i,
        /\bzip\s+code\b/i,
      ],
      field: "Pincode",
      type: "pincode",
    },

    // Email patterns
    {
      patterns: [/\bemail\s+(?:address|id)?\b/i, /\byour\s+email\b/i],
      field: "Email",
      type: "email",
    },

    // Aadhar patterns
    {
      patterns: [
        /\baad?haar\s+(?:number|card)?\b/i,
        /\b12[\s-]?digit\s+(?:aadhar|aadhaar)\b/i,
      ],
      field: "AadharNumber",
      type: "aadhar",
    },

    // Address patterns
    {
      patterns: [
        /\b(?:your|customer)\s+address\b/i,
        /\bdelivery\s+address\b/i,
        /\bresidence(?:ntial)?\s+address\b/i,
      ],
      field: "Address",
      type: "address",
    },
  ];

  // Check each pattern
  naturalLanguagePatterns.forEach(({ patterns: patternList, field, type }) => {
    const normalizedField = field.toLowerCase();

    // Skip if already detected via placeholder
    if (seenSlots.has(normalizedField)) {
      return;
    }

    // Check if any pattern matches
    const matched = patternList.some((pattern) => pattern.test(scriptLower));

    if (matched) {
      seenSlots.add(normalizedField);

      const slotMetadata = inferFieldType(field);

      slots.push({
        name: field,
        displayName: field,
        type: slotMetadata.type,
        pattern: slotMetadata.pattern,
        required: true,
        detectedFrom: "natural_language",
        description: slotMetadata.description,
      });
    }
  });

  console.log(
    `📋 Script Analyzer: Detected ${slots.length} slots`,
    slots.map((s) => s.name)
  );

  return slots;
}

/**
 * Infer field type and validation pattern from field name
 *
 * @param {string} fieldName - Normalized field name
 * @returns {object} Type, pattern, and description
 */
function inferFieldType(fieldName) {
  const lowerName = fieldName.toLowerCase();

  // Phone/Mobile patterns
  if (
    lowerName.includes("phone") ||
    lowerName.includes("mobile") ||
    lowerName.includes("contact")
  ) {
    return {
      type: "phone",
      pattern: "^[6-9]\\d{9}$", // Indian mobile
      description: "Mobile number (10 digits, starting with 6-9)",
    };
  }

  // Email patterns
  if (lowerName.includes("email") || lowerName.includes("mail")) {
    return {
      type: "email",
      pattern: "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}$",
      description: "Email address",
    };
  }

  // Pincode patterns
  if (
    lowerName.includes("pincode") ||
    lowerName.includes("pin") ||
    lowerName.includes("zipcode") ||
    lowerName.includes("zip")
  ) {
    return {
      type: "pincode",
      pattern: "^[1-9]\\d{5}$", // Indian pincode
      description: "Pincode (6 digits)",
    };
  }

  // Aadhar number patterns
  if (lowerName.includes("aadhar") || lowerName.includes("aadhaar")) {
    return {
      type: "aadhar",
      pattern: "^\\d{12}$",
      description: "Aadhar number (12 digits)",
    };
  }

  // PAN card patterns
  if (lowerName.includes("pan")) {
    return {
      type: "pan",
      pattern: "^[A-Z]{5}\\d{4}[A-Z]$",
      description: "PAN card (e.g., ABCDE1234F)",
    };
  }

  // Vehicle registration patterns
  if (
    lowerName.includes("vehicle") ||
    lowerName.includes("registration") ||
    lowerName.includes("reg")
  ) {
    return {
      type: "vehicle_registration",
      pattern: "^[A-Z]{2}\\d{2}[A-Z]{1,2}\\d{4}$",
      description: "Vehicle registration (e.g., MH12AB1234)",
    };
  }

  // Date patterns
  if (
    lowerName.includes("date") ||
    lowerName.includes("dob") ||
    lowerName.includes("birth")
  ) {
    return {
      type: "date",
      pattern: "^\\d{2}/\\d{2}/\\d{4}$", // DD/MM/YYYY
      description: "Date (DD/MM/YYYY)",
    };
  }

  // Age/Number patterns
  if (
    lowerName.includes("age") ||
    lowerName.includes("year") ||
    lowerName.includes("count")
  ) {
    return {
      type: "number",
      pattern: "^\\d+$",
      description: "Numeric value",
    };
  }

  // Amount/Price patterns
  if (
    lowerName.includes("amount") ||
    lowerName.includes("price") ||
    lowerName.includes("budget") ||
    lowerName.includes("cost")
  ) {
    return {
      type: "amount",
      pattern: "^\\d+(\\.\\d{1,2})?$",
      description: "Amount/Price (numeric with optional decimals)",
    };
  }

  // Policy/ID number patterns
  if (
    lowerName.includes("policy") ||
    lowerName.includes("id") ||
    lowerName.includes("number")
  ) {
    return {
      type: "identifier",
      pattern: "^[A-Z0-9]+$",
      description: "Alphanumeric identifier",
    };
  }

  // Address patterns
  if (
    lowerName.includes("address") ||
    lowerName.includes("location") ||
    lowerName.includes("city")
  ) {
    return {
      type: "address",
      pattern: null, // Flexible, no strict pattern
      description: "Address or location",
    };
  }

  // Name patterns (default for anything with "name")
  if (lowerName.includes("name")) {
    return {
      type: "name",
      pattern: "^[A-Za-z\\s]+$",
      description: "Name (alphabets and spaces only)",
    };
  }

  // Default: Generic text field
  return {
    type: "text",
    pattern: null, // No strict pattern
    description: "Text input",
  };
}

/**
 * Get default/universal slots for fallback
 * Used when script has no placeholders
 *
 * @returns {Array} Default slots
 */
function getDefaultSlots() {
  return [
    {
      name: "name",
      displayName: "Name",
      type: "name",
      pattern: "^[A-Za-z\\s]+$",
      required: false,
      detectedFrom: "default",
      description: "Customer name",
    },
    {
      name: "phone",
      displayName: "Phone",
      type: "phone",
      pattern: "^[6-9]\\d{9}$",
      required: false,
      detectedFrom: "default",
      description: "Mobile number",
    },
    {
      name: "email",
      displayName: "Email",
      type: "email",
      pattern: "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}$",
      required: false,
      detectedFrom: "default",
      description: "Email address",
    },
    {
      name: "pincode",
      displayName: "Pincode",
      type: "pincode",
      pattern: "^[1-9]\\d{5}$",
      required: false,
      detectedFrom: "default",
      description: "Pincode",
    },
  ];
}

/**
 * Build dynamic extraction prompt based on detected slots
 *
 * @param {Array} slots - Detected or default slots
 * @returns {string} Extraction prompt for LLM
 */
function buildDynamicExtractionPrompt(slots) {
  if (!slots || slots.length === 0) {
    slots = getDefaultSlots();
  }

  const fieldsDescription = slots
    .map((slot) => {
      return `- ${slot.name}: ${slot.description || slot.type}${
        slot.pattern ? ` (format: ${slot.pattern})` : ""
      }`;
    })
    .join("\n");

  return `Extract customer information from the text. Return ONLY a valid JSON object.

FIELDS TO EXTRACT:
${fieldsDescription}

CRITICAL RULES:
1. Extract even single-word responses (e.g., just "John" → {"name": "John"})
2. Extract even single numbers (e.g., "9876543210" → {"phone": "9876543210"})
3. Extract from greetings: "Hello I'm Rahul" → {"name": "Rahul"}
4. **CRITICAL FOR STT**: Remove ALL spaces from numeric inputs before extraction
   - "8 45101" → {"Pincode": "845101"} (remove spaces first!)
   - "9 47 29 56 565" → {"Mobile": "9472956565"} (remove spaces first!)
5. If user provides information that matches ANY field above, extract it
6. Also extract any OTHER relevant customer information not listed above

EXAMPLES:
- "John Doe" → {"name": "John Doe"}
- "9876543210" → {"phone": "9876543210"}
- "9 87 65 43 210" → {"phone": "9876543210"} (spaces removed)
- "8 45101" → {"Pincode": "845101"} (spaces removed)
- "305001" → {"Pincode": "305001"}
- "My vehicle is MH12AB1234" → {"VehicleRegistration": "MH12AB1234"}
- "Aadhar is 123456789012" → {"AadharNumber": "123456789012"}
- "I am Priya, 9876543210, pincode 305001" → {"name": "Priya", "phone": "9876543210", "pincode": "305001"}
- "Yes" → {}
- "Okay" → {}

If no customer-specific info found, return {}
Be flexible and extract whatever information is relevant.`;
}

export default {
  analyzeScript,
  getDefaultSlots,
  buildDynamicExtractionPrompt,
  inferFieldType,
};
