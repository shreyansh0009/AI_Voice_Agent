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
        temperature = 0.7,
        maxTokens = 150,
        provider = "openai", // 'openai' or 'agentforce'
      } = options;

      // If Agentforce is selected, route there (with translation wrapper)
      if (provider === "agentforce") {
        return await this.getAgentforceResponse(userMessage, language, {
          useRAG,
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

      // Build customer context summary for the prompt
      const contextSummary = [];
      if (customerContext.name)
        contextSummary.push(`Name: ${customerContext.name}`);
      if (customerContext.phone)
        contextSummary.push(`Phone: ${customerContext.phone}`);
      if (customerContext.email)
        contextSummary.push(`Email: ${customerContext.email}`);
      if (customerContext.address)
        contextSummary.push(`Address: ${customerContext.address}`);
      if (
        customerContext.orderDetails &&
        Object.keys(customerContext.orderDetails).length > 0
      ) {
        contextSummary.push(
          `Order: ${JSON.stringify(customerContext.orderDetails)}`
        );
      }

      const customerContextString =
        contextSummary.length > 0
          ? `\n\nCUSTOMER INFORMATION (Remember this throughout the conversation):\n${contextSummary.join(
              "\n"
            )}\n`
          : "";

      // Build enhanced system prompt with language instructions AND customer context
      const enhancedSystemPrompt = `${systemPrompt}
${customerContextString}
Current language: ${currentLanguageName}. Keep responses brief for voice chat (max 2-3 sentences).
To switch language, respond with "LANGUAGE_SWITCH:[code]" then your message.
Codes: en, hi, ta, te, kn, ml, bn, mr, gu, pa, es, fr, de, zh, ja, ko

IMPORTANT: This is a VOICE conversation. Do NOT use markdown formatting like **bold**, *italics*, or [links]. Write plain text that is easy to read aloud.
IMPORTANT: If customer provides personal details (name, address, phone, email, order info), acknowledge them and remember them for the entire conversation.`;

      // If RAG is enabled, try to use knowledge base
      if (useRAG && userMessage) {
        try {
          const ragResponse = await this.getRAGResponse(
            userMessage,
            conversationHistory,
            enhancedSystemPrompt,
            { temperature, maxTokens }
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
      const response = await ragService.chat(
        query,
        conversationHistory.slice(-6), // Last 3 exchanges
        systemPrompt,
        options
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
   * Extract customer information from text
   * Simple pattern matching - can be enhanced with AI extraction
   */
  extractCustomerInfo(text, existingContext = {}) {
    const updates = {};

    // Extract phone numbers (Indian format)
    const phoneMatch = text.match(/\b(\+?91[-\s]?)?[6-9]\d{9}\b/);
    if (phoneMatch) {
      updates.phone = phoneMatch[0];
    }

    // Extract email
    const emailMatch = text.match(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/
    );
    if (emailMatch) {
      updates.email = emailMatch[0];
    }

    // Extract name (if someone says "my name is..." or "I am...")
    const nameMatch = text.match(
      /(?:my name is|i am|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i
    );
    if (nameMatch) {
      updates.name = nameMatch[1];
    }

    // Extract address keywords
    if (
      text.toLowerCase().includes("address") ||
      text.toLowerCase().includes("deliver to")
    ) {
      const addressMatch = text.match(
        /(?:address is|deliver to|ship to)\s+(.+?)(?:\.|$)/i
      );
      if (addressMatch) {
        updates.address = addressMatch[1].trim();
      }
    }

    // If any updates found, merge with existing context
    if (Object.keys(updates).length > 0) {
      const newContext = {
        ...existingContext,
        ...updates,
        lastUpdated: new Date().toISOString(),
      };

      console.log("📝 Extracted customer info:", updates);
      return newContext;
    }

    return existingContext;
  }
}

// Export singleton instance
const aiAgentService = new AIAgentService();
export default aiAgentService;
