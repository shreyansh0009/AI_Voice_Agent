/**
 * Text Normalizer Service
 *
 * PURPOSE: Normalize text for TTS to handle language-specific pronunciation
 *
 * CRITICAL FIXES:
 * - Convert numbers to words based on language
 * - Handle currency amounts properly
 * - Fix Hindi TTS pronunciation issues
 * - Handle mixed Hindi-English patterns like "75 rupees लाख"
 */

// ============================================================================
// NUMBER TO WORDS - ENGLISH
// ============================================================================

const ONES_EN = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
];
const TENS_EN = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];
const TEENS_EN = [
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

function numberToWordsEnglish(num) {
  if (num === 0) return "zero";
  if (num < 0) return "minus " + numberToWordsEnglish(-num);

  if (num < 10) return ONES_EN[num];
  if (num < 20) return TEENS_EN[num - 10];
  if (num < 100) {
    return (
      TENS_EN[Math.floor(num / 10)] +
      (num % 10 !== 0 ? " " + ONES_EN[num % 10] : "")
    );
  }
  if (num < 1000) {
    return (
      ONES_EN[Math.floor(num / 100)] +
      " hundred" +
      (num % 100 !== 0 ? " " + numberToWordsEnglish(num % 100) : "")
    );
  }

  // Handle lakhs and crores (Indian numbering)
  if (num < 100000) {
    // Less than 1 lakh
    return (
      numberToWordsEnglish(Math.floor(num / 1000)) +
      " thousand" +
      (num % 1000 !== 0 ? " " + numberToWordsEnglish(num % 1000) : "")
    );
  }
  if (num < 10000000) {
    // Less than 1 crore
    return (
      numberToWordsEnglish(Math.floor(num / 100000)) +
      " lakh" +
      (num % 100000 !== 0 ? " " + numberToWordsEnglish(num % 100000) : "")
    );
  }

  return (
    numberToWordsEnglish(Math.floor(num / 10000000)) +
    " crore" +
    (num % 10000000 !== 0 ? " " + numberToWordsEnglish(num % 10000000) : "")
  );
}

// ============================================================================
// NUMBER TO WORDS - HINDI
// ============================================================================

const ONES_HI = ["", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ"];
const TENS_HI = [
  "",
  "",
  "बीस",
  "तीस",
  "चालीस",
  "पचास",
  "साठ",
  "सत्तर",
  "अस्सी",
  "नब्बे",
];
const TEENS_HI = [
  "दस",
  "ग्यारह",
  "बारह",
  "तेरह",
  "चौदह",
  "पंद्रह",
  "सोलह",
  "सत्रह",
  "अठारह",
  "उन्नीस",
];

// Special cases for common numbers in Hindi

const SPECIAL_HI = {
  21: "इक्कीस",
  22: "बाईस",
  23: "तेईस",
  24: "चौबीस",
  25: "पच्चीस",
  26: "छब्बीस",
  27: "सत्ताईस",
  28: "अट्ठाईस",
  29: "उनतीस",
  31: "इकतीस",
  32: "बत्तीस",
  33: "तैंतीस",
  34: "चौंतीस",
  35: "पैंतीस",
  36: "छत्तीस",
  37: "सैंतीस",
  38: "अड़तीस",
  39: "उनतालीस",
  41: "इकतालीस",
  42: "बयालीस",
  43: "तैंतालीस",
  44: "चौंतालीस",
  45: "पैंतालीस",
  46: "छियालीस",
  47: "सैंतालीस",
  48: "अड़तालीस",
  49: "उनचास",
  51: "इक्यावन",
  52: "बावन",
  53: "तिरपन",
  54: "चौवन",
  55: "पचपन",
  56: "छप्पन",
  57: "सत्तावन",
  58: "अट्ठावन",
  59: "उनसठ",
  61: "इकसठ",
  62: "बासठ",
  63: "तिरसठ",
  64: "चौंसठ",
  65: "पैंसठ",
  66: "छियासठ",
  67: "सड़सठ",
  68: "अड़सठ",
  69: "उनहत्तर",
  71: "इकहत्तर",
  72: "बहत्तर",
  73: "तिहत्तर",
  74: "चौहत्तर",
  75: "पचहत्तर",
  76: "छिहत्तर",
  77: "सतहत्तर",
  78: "अठहत्तर",
  79: "उनासी",
  81: "इक्यासी",
  82: "बयासी",
  83: "तिरासी",
  84: "चौरासी",
  85: "पचासी",
  86: "छियासी",
  87: "सत्तासी",
  88: "अट्ठासी",
  89: "नवासी",
  91: "इक्यानवे",
  92: "बानवे",
  93: "तिरानवे",
  94: "चौरानवे",
  95: "पचानवे",
  96: "छियानवे",
  97: "सत्तानवे",
  98: "अट्ठानवे",
  99: "निन्यानवे",
};

function numberToWordsHindi(num) {
  if (num === 0) return "शून्य";
  if (num < 0) return "माइनस " + numberToWordsHindi(-num);

  if (num < 10) return ONES_HI[num];
  if (num < 20) return TEENS_HI[num - 10];

  // Use special cases for 21-99
  if (num >= 21 && num <= 99 && SPECIAL_HI[num]) {
    return SPECIAL_HI[num];
  }

  if (num < 100) {
    return (
      TENS_HI[Math.floor(num / 10)] +
      (num % 10 !== 0 ? " " + ONES_HI[num % 10] : "")
    );
  }
  if (num < 1000) {
    return (
      ONES_HI[Math.floor(num / 100)] +
      " सौ" +
      (num % 100 !== 0 ? " " + numberToWordsHindi(num % 100) : "")
    );
  }

  // Handle lakhs and crores (Indian numbering)
  if (num < 100000) {
    // Less than 1 lakh
    return (
      numberToWordsHindi(Math.floor(num / 1000)) +
      " हज़ार" +
      (num % 1000 !== 0 ? " " + numberToWordsHindi(num % 1000) : "")
    );
  }
  if (num < 10000000) {
    // Less than 1 crore
    return (
      numberToWordsHindi(Math.floor(num / 100000)) +
      " लाख" +
      (num % 100000 !== 0 ? " " + numberToWordsHindi(num % 100000) : "")
    );
  }

  return (
    numberToWordsHindi(Math.floor(num / 10000000)) +
    " करोड़" +
    (num % 10000000 !== 0 ? " " + numberToWordsHindi(num % 10000000) : "")
  );
}

// ============================================================================
// CURRENCY NORMALIZATION
// ============================================================================

/**
 * Normalize currency amounts for TTS
 *
 * Examples:
 * - "1 crore" → "one crore rupees" (en)
 * - "1 crore" → "ek crore rupey" (hi)
 * - "75 rupees लाख" → "पचहत्तर लाख रुपये" (hi)
 * - "80 लाख" → "अस्सी लाख रुपये" (hi)
 * - "50L" → "fifty lakh rupees" (en)
 */
export function normalizeCurrency(text, language = "en") {
  if (!text) return text;

  let normalized = text;

  // For Hindi, handle all currency patterns
  if (language === "hi") {
    // Pattern 1: "75 rupees लाख" → "पचहत्तर लाख रुपये"
    normalized = normalized.replace(
      /(\d+(?:\.\d+)?)\s*rupees\s*(लाख|करोड़|हज़ार|सौ)/gi,
      (match, number, unit) => {
        const num = parseFloat(number);
        const numWords = numberToWordsHindi(Math.floor(num));
        return `${numWords} ${unit} रुपये`;
      }
    );

    // Pattern 2: "80 लाख" → "अस्सी लाख रुपये"
    normalized = normalized.replace(
      /(\d+(?:\.\d+)?)\s*(लाख|करोड़|हज़ार|सौ)(?!\s*रुपये)/g,
      (match, number, unit) => {
        const num = parseFloat(number);
        const numWords = numberToWordsHindi(Math.floor(num));
        return `${numWords} ${unit} रुपये`;
      }
    );

    // Pattern 3: English patterns "1 crore", "2 lakh", etc.
    normalized = normalized.replace(
      /(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l|thousand|k|hundred)/gi,
      (match, number, unit) => {
        const num = parseFloat(number);
        const unitLower = unit.toLowerCase();

        // Convert to Hindi unit
        let unitHindi = unitLower;
        if (["cr", "crore"].includes(unitLower)) unitHindi = "करोड़";
        else if (["l", "lac", "lakh"].includes(unitLower)) unitHindi = "लाख";
        else if (["k", "thousand"].includes(unitLower)) unitHindi = "हज़ार";
        else if (["hundred"].includes(unitLower)) unitHindi = "सौ";

        const numWords = numberToWordsHindi(Math.floor(num));
        return `${numWords} ${unitHindi} रुपये`;
      }
    );

    // Pattern 4: Short forms "50L", "2Cr"
    normalized = normalized.replace(
      /(\d+(?:\.\d+)?)(Cr|L|K)/gi,
      (match, number, unit) => {
        const num = parseFloat(number);
        const unitUpper = unit.toUpperCase();

        let unitHindi = unitUpper;
        if (unitUpper === "CR") unitHindi = "करोड़";
        else if (unitUpper === "L") unitHindi = "लाख";
        else if (unitUpper === "K") unitHindi = "हज़ार";

        const numWords = numberToWordsHindi(Math.floor(num));
        return `${numWords} ${unitHindi} रुपये`;
      }
    );
  } else {
    // English patterns
    const patterns = [
      // "1 crore", "2 lakh", "50 thousand", etc.
      /(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l|thousand|k|hundred)/gi,
      // "50L", "2Cr", "100K", etc.
      /(\d+(?:\.\d+)?)(cr|l|k|lac)/gi,
    ];

    patterns.forEach((pattern) => {
      normalized = normalized.replace(pattern, (match, number, unit) => {
        const num = parseFloat(number);
        const unitLower = unit.toLowerCase();

        // Convert to full unit name
        let fullUnit = unitLower;
        if (["cr", "crore"].includes(unitLower)) fullUnit = "crore";
        else if (["l", "lac", "lakh"].includes(unitLower)) fullUnit = "lakh";
        else if (["k", "thousand"].includes(unitLower)) fullUnit = "thousand";
        else if (["hundred"].includes(unitLower)) fullUnit = "hundred";

        const numWords = numberToWordsEnglish(Math.floor(num));
        return `${numWords} ${fullUnit} rupees`;
      });
    });
  }

  return normalized;
}

/**
 * Normalize plain numbers in text
 *
 * Examples:
 * - "10" → "ten" (en)
 * - "10" → "दस" (hi)
 */
export function normalizeNumbers(text, language = "en") {
  if (!text) return text;

  // Replace standalone numbers (not part of currency)
  return text.replace(/\b(\d+)\b/g, (match, number) => {
    const num = parseInt(number);

    if (language === "hi") {
      return numberToWordsHindi(num);
    } else {
      return numberToWordsEnglish(num);
    }
  });
}

// ============================================================================
// MAIN NORMALIZATION
// ============================================================================

/**
 * Normalize text for TTS based on language
 *
 * @param {string} text - Text to normalize
 * @param {string} language - Language code (en, hi, etc.)
 * @returns {string} Normalized text ready for TTS
 */
export function normalizeForTTS(text, language = "en") {
  if (!text) return text;

  let normalized = text;

  // Step 1: Normalize currency amounts
  normalized = normalizeCurrency(normalized, language);

  // Step 2: Normalize remaining standalone numbers (optional - can be noisy)
  // Uncomment if you want ALL numbers converted to words
  // normalized = normalizeNumbers(normalized, language);

  return normalized.trim();
}

/**
 * Normalize text specifically for Hindi TTS
 * Handles common pronunciation issues
 */
export function normalizeForHindiTTS(text) {
  if (!text) return text;

  let normalized = text;

  // Fix currency amounts
  normalized = normalizeCurrency(normalized, "hi");

  // Fix common English words in Hindi context
  normalized = normalized
    // Replace English numbers with Hindi equivalents
    .replace(/\b1\b/g, "एक")
    .replace(/\b2\b/g, "दो")
    .replace(/\b3\b/g, "तीन")
    .replace(/\b4\b/g, "चार")
    .replace(/\b5\b/g, "पाँच")
    .replace(/\b10\b/g, "दस");

  return normalized.trim();
}

export default {
  normalizeForTTS,
  normalizeCurrency,
  normalizeNumbers,
  normalizeForHindiTTS,
  numberToWordsEnglish,
  numberToWordsHindi,
};
