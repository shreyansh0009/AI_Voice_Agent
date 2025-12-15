import OpenAI from "openai";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import ragService from "./ragService.js";
import translationService from "./translationService.js";
import agentforceService from "./agentforce.service.js";

// Ensure we load the server/.env regardless of cwd or import order
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

/**
 * AI Agent Service - Handles conversation logic for both web voice chat and phone calls
 * Reuses the same AI logic from VoiceChat component but on the server side
 */
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

  /**
   * Process user message and get AI response
   * @param {string} userMessage - User's spoken text
   * @param {string} agentId - Agent configuration ID
   * @param {object} customerContext - Customer information (name, email, phone, etc.)
   * @param {array} conversationHistory - Recent conversation messages
   * @param {object} options - Additional options (language, useRAG, etc.)
   * @returns {Promise<string>} AI response text
   */
  async processMessage(
    userMessage,
    agentId = "default",
    customerContext = {},
    conversationHistory = [],
    options = {}
  ) {
    try {
      const {
        language = "en",
        useRAG = false,
        systemPrompt = "You are a helpful AI assistant for a CRM system.",
        temperature = 0.4,
        maxTokens = 150,
        provider = "openai", // 'openai' or 'agentforce'
      } = options;

      // If Agentforce is selected, route there (with translation wrapper)
      if (provider === "agentforce") {
        return await this.getAgentforceResponse(userMessage, language, {
          useRAG,
          customerContext,
          agentId,
          conversationHistory,
          systemPrompt,
        });
      }

      // Language mapping
      const languageNames = {
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

      const currentLanguageName = languageNames[language] || "English";

      // Extract customer info from the current message FIRST
      const updatedContext = await this.extractCustomerInfo(userMessage, customerContext);
      
      // Build customer context summary for the prompt
      const contextSummary = [];
      if (updatedContext.name)
        contextSummary.push(`Name: ${updatedContext.name}`);
      if (updatedContext.phone)
        contextSummary.push(`Phone: ${updatedContext.phone}`);
      if (updatedContext.pincode)
        contextSummary.push(`Pincode: ${updatedContext.pincode}`);
      if (updatedContext.email)
        contextSummary.push(`Email: ${updatedContext.email}`);
      if (updatedContext.address)
        contextSummary.push(`Address: ${updatedContext.address}`);
      if (
        updatedContext.orderDetails &&
        Object.keys(updatedContext.orderDetails).length > 0
      ) {
        contextSummary.push(
          `Order: ${JSON.stringify(updatedContext.orderDetails)}`
        );
      }

      const customerContextString =
        contextSummary.length > 0
          ? `\n\nCUSTOMER INFORMATION (Remember this throughout the conversation):\n${contextSummary.join(
              "\n"
            )}\n`
          : "";

      console.log("📋 Server: Current customer context:", updatedContext);

      // Build enhanced system prompt with language instructions AND customer context
      const enhancedSystemPrompt = `${systemPrompt}
${customerContextString}
Current language: ${currentLanguageName}. Keep responses brief for voice chat (max 2-3 sentences).
To switch language, respond with "LANGUAGE_SWITCH:[code]" then your message.
Codes: en, hi, ta, te, kn, ml, bn, mr, gu, pa, es, fr, de, zh, ja, ko

IMPORTANT: This is a VOICE conversation. Do NOT use markdown formatting like **bold**, *italics*, or [links]. Write plain text that is easy to read aloud.
IMPORTANT: If customer provides personal details (name, address, phone, email, pincode, order info), acknowledge them and remember them for the entire conversation.
CRITICAL: Never invent or guess personal details. Use ONLY the values present in CUSTOMER INFORMATION or explicitly provided by the user in this conversation.
CRITICAL: If the user asks for their phone number, email, address, pincode or order details, read them EXACTLY from CUSTOMER INFORMATION. If they are missing, say you do not have them yet and ask the user to provide or confirm, instead of guessing.
CRITICAL: When your script or knowledge base contains placeholders in curly braces like {Name}, {Mobile}, {Pincode}, {Email}, {Address} or {Model}, you MUST replace each placeholder with the real value from CUSTOMER INFORMATION / customerContext or the conversation. Never speak the curly-brace tokens literally. If a value is missing, ask the user for it instead of saying the placeholder.`;

      // If RAG is enabled, try to use knowledge base
      if (useRAG && userMessage) {
        try {
          const ragResponse = await this.getRAGResponse(
            userMessage,
            conversationHistory,
            enhancedSystemPrompt,
            { temperature, maxTokens, agentId }
          );

          if (ragResponse) {
            console.log("🤖 Using RAG response with knowledge base");
            return this.processLanguageSwitch(ragResponse, languageNames);
          }
        } catch (ragError) {
          console.warn(
            "⚠️  RAG failed, falling back to standard OpenAI:",
            ragError.message
          );
        }
      }

      // Standard OpenAI response (fallback or when RAG disabled)
      return await this.getStandardResponse(
        userMessage,
        conversationHistory,
        enhancedSystemPrompt,
        { temperature, maxTokens, languageNames }
      );
    } catch (error) {
      console.error("❌ Error processing message:", error);
      throw new Error(`Failed to process message: ${error.message}`);
    }
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
        }
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
    options
  ) {
    const { temperature, maxTokens, languageNames } = options;

    // Build messages array with LIMITED conversation history (last 6 messages = 3 exchanges)
    const recentHistory = conversationHistory.slice(-6);
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

    // Call OpenAI API
    const response = await this.openai.chat.completions.create({
      model: "gpt-4o-mini", // Cheaper and faster
      messages: messages,
      temperature: temperature || 0.7,
      max_tokens: maxTokens || 150,
    });

    let aiResponse = response.choices[0].message.content;

    // Process language switching
    return this.processLanguageSwitch(aiResponse, languageNames);
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
          "English"
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
        options
      );
      console.log("   -> Agentforce Response:", agentResponse);

      // Step 3: Translate back to target language if needed
      let finalResponse = agentResponse;

      if (!isEnglish) {
        console.log(`🔤 Translating response from English to ${language}...`);
        finalResponse = await translationService.translate(
          agentResponse,
          language
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
   * Extract customer information from text using AI
   * Much more reliable than regex patterns
   */
  async extractCustomerInfo(text, existingContext = {}) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              `Extract customer information and requirements from the text. Return ONLY a valid JSON object.

STANDARD CUSTOMER FIELDS (extract if present):
- name: Customer's name
- phone: Mobile number (10 digits for India, starting with 6-9)
- email: Email address
- address: Physical address or location
- pincode: Postal/ZIP code
- model: Product/service identifier (car model, property type, course name, etc.)
- orderDetails: Any domain-specific requirements (budget, preferences, specifications)

PHONE NUMBER EXTRACTION:
- Extract 10-digit Indian mobile numbers (starting with 6-9)
- Handle formats: "9876543210", "98765 43210", "987-654-3210", "+91 9876543210"
- Handle spoken digits: "nine eight seven six five four three two one zero" → "9876543210"
- Remove all spaces, hyphens, and country codes to get clean 10 digits

EXAMPLES:

E-Commerce:
Input: "I'm Priya, need red dress size M, my number is 9876543210"
Output: {"name": "Priya", "phone": "9876543210", "orderDetails": {"product": "red dress", "size": "M"}}

Real Estate:
Input: "Looking for 3 BHK flat in Pune under 80 lakhs"
Output: {"orderDetails": {"propertyType": "flat", "bedrooms": "3 BHK", "location": "Pune", "budget": "80 lakhs"}}

Automotive:
Input: "I am Rahul, want to test ride Magnus EX, pincode 305001"
Output: {"name": "Rahul", "pincode": "305001", "model": "Magnus EX"}

Healthcare:
Input: "Book appointment for Dr. Sharma, my email is john@email.com"
Output: {"email": "john@email.com", "orderDetails": {"doctor": "Dr. Sharma", "type": "appointment"}}

If no info found, return {}
Be flexible - extract whatever information is relevant to the user's request.`,
          },
          {
            role: "user",
            content: text,
          },
        ],
        temperature: 0,
        max_tokens: 150,
      });

      const jsonStr = response.choices[0].message.content.trim();
      // Handle markdown code blocks if AI returns them
      const cleanJson = jsonStr.replace(/```json\n?|```\n?/g, '').trim();
      
      if (cleanJson && cleanJson !== "{}") {
        const updates = JSON.parse(cleanJson);
        
        // Clean phone number if extracted
        if (updates.phone) {
          // Remove all non-digits
          let cleanPhone = updates.phone.replace(/\D/g, '');
          // Remove country code if present (91 prefix)
          if (cleanPhone.startsWith('91') && cleanPhone.length === 12) {
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
          const newContext = {
            ...existingContext,
            ...updates,
            lastUpdated: new Date().toISOString(),
          };

          console.log("📝 AI Extracted customer info:", updates);
          return newContext;
        }
      }
    } catch (error) {
      console.error("❌ AI extraction failed, using regex fallback:", error.message);
      
      // Fallback to regex patterns
      const updates = {};

      // Extract phone numbers (Indian format) - Multiple patterns
      const phonePatterns = [
        /\b(\+?91[-\s]?)?([6-9]\d{9})\b/,           // Standard format
        /\b([6-9]\d{4}[\s-]?\d{5})\b/,              // With space/dash in middle
        /\b([6-9]\d{2}[\s-]?\d{3}[\s-]?\d{4})\b/,  // Multiple separators
      ];
      
      for (const pattern of phonePatterns) {
        const phoneMatch = text.match(pattern);
        if (phoneMatch) {
          // Extract just the digits
          const cleanPhone = phoneMatch[0].replace(/\D/g, '');
          // Remove country code if present
          const phone = cleanPhone.startsWith('91') && cleanPhone.length === 12 
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
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/
      );
      if (emailMatch) {
        updates.email = emailMatch[0];
      }

      // Extract pincode (6 digits)
      const pincodeMatch = text.match(/\b[1-9]\d{5}\b/);
      if (pincodeMatch) {
        updates.pincode = pincodeMatch[0];
      }

      // Extract name (if someone says "my name is..." or "I am...")
      const nameMatch = text.match(
        /(?:my name is|i am|this is|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i
      );
      if (nameMatch) {
        updates.name = nameMatch[1];
      }

      if (Object.keys(updates).length > 0) {
        const newContext = {
          ...existingContext,
          ...updates,
          lastUpdated: new Date().toISOString(),
        };
        console.log("📝 Regex extracted customer info:", updates);
        return newContext;
      }
    }

    return existingContext;
  }
}

// Export singleton instance
const aiAgentService = new AIAgentService();
export default aiAgentService;
