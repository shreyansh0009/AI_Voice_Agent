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

PHONE NUMBER EXTRACTION:
- Extract 10-digit Indian mobile numbers (starting with 6-9)
- Handle formats: "9876543210", "98765 43210", "987-654-3210", "+91 9876543210"
- Handle spoken digits: "nine eight seven six five four three two one zero" → "9876543210"
- Remove all spaces, hyphens, and country codes to get clean 10 digits

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
   * @returns {Promise<object>} Object containing response text and updated customer context
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
        isRetry = false, // Flag to indicate if this is a retry after no/unclear response
        lastQuestion = null, // The last question that was asked
      } = options;

      // Handle empty/unclear user input (silence, distortion, STT failure)
      // Note: Accept Unicode for multi-language support (Hindi, Tamil, etc.)
      const isEmptyOrUnclear = !userMessage || 
                               userMessage.trim().length < 2 || 
                               /^[\s\p{P}]+$/u.test(userMessage) || // Only whitespace/punctuation (Unicode-aware)
                               userMessage.toLowerCase().match(/^(um|uh|hmm|err|ah)+$/); // Just filler words

      if (isEmptyOrUnclear && lastQuestion) {
        // User didn't respond clearly - re-ask the question
        const retryPrompt = RETRY_PHRASES[Math.floor(Math.random() * RETRY_PHRASES.length)];
        
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
          response: "I'm sorry, I didn't catch that. Could you please speak clearly?",
          customerContext: customerContext, // Return unchanged context
          languageSwitch: null,
          isRetry: true,
        };
      }

      // If Agentforce is selected, route there (with translation wrapper)
      if (provider === "agentforce") {
        // Extract customer info even for Agentforce
        const updatedContext = await this.extractCustomerInfo(userMessage, customerContext);
        
        const agentforceResponse = await this.getAgentforceResponse(userMessage, language, {
          useRAG,
          customerContext: updatedContext,
          agentId,
          conversationHistory,
          systemPrompt,
        });
        
        return {
          ...agentforceResponse,
          customerContext: updatedContext,
        };
      }

      const currentLanguageName = LANGUAGE_CODES[language] || "English";

      // Extract customer info from the current message FIRST
      const updatedContext = await this.extractCustomerInfo(userMessage, customerContext);
      
      // Determine conversation stage and next required field
      const conversationState = this.determineConversationState(updatedContext, systemPrompt);
      
      // Build customer context summary for the prompt
      const contextSummary = [];
      if (updatedContext.name)
        contextSummary.push(`✅ Name: ${updatedContext.name}`);
      if (updatedContext.phone)
        contextSummary.push(`✅ Phone: ${updatedContext.phone}`);
      if (updatedContext.pincode)
        contextSummary.push(`✅ Pincode: ${updatedContext.pincode}`);
      if (updatedContext.email)
        contextSummary.push(`✅ Email: ${updatedContext.email}`);
      if (updatedContext.address)
        contextSummary.push(`✅ Address: ${updatedContext.address}`);
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
          ? `\n\nCUSTOMER INFORMATION (Already collected - DO NOT ask again):\n${contextSummary.join(
              "\n"
            )}\n`
          : "";

      // Analyze conversation history to track what was already asked
      const alreadyAsked = this.analyzeConversationHistory(conversationHistory);
      const trackingInfo = alreadyAsked.length > 0 
        ? `\n\nQUESTIONS ALREADY ASKED (Never repeat these):\n${alreadyAsked.join('\n')}\n`
        : '';

      // Add conversation stage guidance
      const stageGuidance = conversationState.nextAction
        ? `\n\n🎯 CURRENT STEP (${conversationState.currentStep}/${conversationState.totalSteps}): ${conversationState.nextAction}
📋 COMPLETED: ${conversationState.completedSteps?.join(', ') || 'None'}
⏭️  REMAINING: ${conversationState.remainingSteps?.slice(0, 3).join(', ') || 'None'}

CRITICAL: You MUST complete the current step before proceeding. Follow your numbered flow exactly.\n`
        : `\n\n✅ All flow steps completed. ${conversationState.nextAction}\n`;

      console.log("📋 Server: Current customer context:", updatedContext);
      console.log("🎯 Conversation state:", conversationState);

      // Detect intent and route to appropriate script section (for multi-section scripts)
      const intentSection = this.detectIntentAndSection(userMessage, conversationHistory, systemPrompt);

      // Build enhanced system prompt - add context and guidance to user's script
      const enhancedSystemPrompt = this.buildEnhancedPrompt({
        basePrompt: systemPrompt,
        customerContext: customerContextString,
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
            { temperature, maxTokens, agentId }
          );

          if (ragResponse) {
            console.log("🤖 Using RAG response with knowledge base");
            const processedResponse = this.processLanguageSwitch(ragResponse, LANGUAGE_CODES);
            return {
              ...processedResponse,
              customerContext: updatedContext, // Include updated context
            };
          }
        } catch (ragError) {
          console.warn(
            "⚠️  RAG failed, falling back to standard OpenAI:",
            ragError.message
          );
        }
      }

      // Standard OpenAI response (fallback or when RAG disabled)
      const aiResponse = await this.getStandardResponse(
        userMessage,
        conversationHistory,
        enhancedSystemPrompt,
        { temperature, maxTokens, languageNames: LANGUAGE_CODES }
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
      sales: ['buy', 'purchase', 'interested', 'looking for', 'want to buy', 'price', 'cost', 'afford', 'budget', 'models', 'variants', 'booking', 'book', 'test ride', 'demo', 'खरीदना', 'खरीदूंगा', 'लेना है'],
      support: ['issue', 'problem', 'not working', 'broken', 'repair', 'service', 'complaint', 'help', 'fix', 'error', 'charging', 'battery', 'समस्या', 'ठीक करो', 'खराब'],
      query: ['information', 'details', 'tell me about', 'what is', 'features', 'specifications', 'specs', 'warranty', 'जानकारी', 'बताइए'],
      service: ['service center', 'appointment', 'booking', 'schedule', 'visit', 'mechanic', 'technician', 'सर्विस सेंटर'],
    };

    // Find matching intent
    let detectedIntent = null;
    let maxMatches = 0;

    for (const [intent, keywords] of Object.entries(intentKeywords)) {
      const matches = keywords.filter(keyword => messageLower.includes(keyword)).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        detectedIntent = intent;
      }
    }

    if (!detectedIntent) {
      return { section: null, intent: null }; // No clear intent, use full script
    }

    // Find matching section in script
    const matchingSection = sections.find(sec => 
      sec.title.toLowerCase().includes(detectedIntent) ||
      sec.title.toLowerCase().includes(detectedIntent + 's') // plural
    );

    if (matchingSection) {
      console.log(`🎯 Intent detected: ${detectedIntent}, routing to section: ${matchingSection.title}`);
      return { 
        section: matchingSection.content, 
        intent: detectedIntent,
        sectionTitle: matchingSection.title 
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
    const sectionPattern = /(?:^|\n)(SECTION\s+[\d.]+[:\s]+[^\n]+)([\s\S]*?)(?=\n(?:SECTION\s+[\d.]+|$))/gi;
    
    // Pattern 2: "## Sales Flow", "## Support Flow", etc. (Markdown headings)
    const markdownPattern = /(?:^|\n)(##\s+[^\n]+)([\s\S]*?)(?=\n##|$)/gi;
    
    // Pattern 3: "SALES:", "SUPPORT:", "QUERY:", etc.
    const labelPattern = /(?:^|\n)([A-Z]+\s*:)([\s\S]*?)(?=\n[A-Z]+\s*:|$)/g;

    let match;
    
    // Try pattern 1
    while ((match = sectionPattern.exec(systemPrompt)) !== null) {
      sections.push({
        title: match[1].trim(),
        content: match[2].trim()
      });
    }

    // Try pattern 2 if no sections found
    if (sections.length === 0) {
      while ((match = markdownPattern.exec(systemPrompt)) !== null) {
        sections.push({
          title: match[1].replace(/^##\s*/, '').trim(),
          content: match[2].trim()
        });
      }
    }

    // Try pattern 3 if still no sections
    if (sections.length === 0) {
      while ((match = labelPattern.exec(systemPrompt)) !== null) {
        sections.push({
          title: match[1].replace(':', '').trim(),
          content: match[2].trim()
        });
      }
    }

    return sections;
  }

  /**
   * Build enhanced system prompt by adding context to base prompt
   * Keeps hardcoded rules separate and reusable
   */
  buildEnhancedPrompt({ basePrompt, customerContext, stageGuidance, trackingInfo, language, intentSection }) {
    // If intent-based section detected, use that instead of full script
    const scriptToUse = intentSection?.section || basePrompt;
    const intentGuidance = intentSection?.sectionTitle 
      ? `\n🎯 DETECTED INTENT: ${intentSection.intent} - Following "${intentSection.sectionTitle}" flow\n`
      : '';

    return `${scriptToUse}
${customerContext}${stageGuidance}${trackingInfo}${intentGuidance}

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

    // Build messages array with FULL conversation history for better context
    const recentHistory = conversationHistory.slice(-AI_CONFIG.CONVERSATION_HISTORY_LIMIT);
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
      model: AI_CONFIG.MODEL,
      messages: messages,
      temperature: temperature || AI_CONFIG.DEFAULT_TEMPERATURE,
      max_tokens: maxTokens || AI_CONFIG.DEFAULT_MAX_TOKENS,
      presence_penalty: AI_CONFIG.PRESENCE_PENALTY,
      frequency_penalty: AI_CONFIG.FREQUENCY_PENALTY,
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
        completedSteps: completedSteps.map(s => s.text),
        remainingSteps: pendingSteps.map(s => s.text),
        isComplete: false,
      };
    }

    // All steps completed
    return {
      stage: 'Flow Complete',
      currentStep: flowSteps.length,
      totalSteps: flowSteps.length,
      nextAction: 'Proceed to conclusion (booking, transfer, etc.)',
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
    const lines = systemPrompt.split('\n');

    // Pattern 1: "1. Step" or "1) Step"
    const numberedPattern = /^\s*(\d+)[.)]\s+(.+)/;
    
    // Pattern 2: "Step 1:" or "STEP 1:"
    const stepPattern = /^\s*(?:step|STEP)\s*(\d+)[:\-]\s*(.+)/i;

    // Pattern 3: "After X is given" or "If user says"
    const conversationalPattern = /^\s*(?:After|If|When)\s+(.+?)(?:\s+is given|\s+says|\s+confirms?|\s+selects?)/i;

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
        if (extracted.includes('name')) {
          steps.push('Ask for customer name');
        } else if (extracted.includes('mobile') || extracted.includes('phone')) {
          steps.push('Ask for mobile number');
        } else if (extracted.includes('pincode') || extracted.includes('pin code')) {
          steps.push('Ask for pincode');
        } else if (extracted.includes('email')) {
          steps.push('Ask for email');
        } else if (extracted.includes('model') || extracted.includes('product')) {
          steps.push('Ask for preferred model/product');
        } else if (extracted.includes('location') || extracted.includes('address')) {
          steps.push('Ask for location/address');
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
        if (match && match[1].trim().length > 10) { // Ignore short bullets
          steps.push(match[1].trim());
        }
      }
    }

    // If still nothing, look for FLOW/STEPS/CONVERSATION FLOW sections
    if (steps.length === 0) {
      const sectionPattern = /(?:FLOW|STEPS|CONVERSATION FLOW|SCRIPT):\s*\n([\s\S]*?)(?:\n\n|\n[A-Z]|$)/i;
      const sectionMatch = systemPrompt.match(sectionPattern);
      
      if (sectionMatch) {
        const sectionText = sectionMatch[1];
        const sectionLines = sectionText.split('\n');
        
        for (const line of sectionLines) {
          if (line.trim().length > 10) {
            steps.push(line.replace(/^[-•*\d.)]\s*/, '').trim());
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
    if ((stepLower.includes('name') || stepLower.includes('introduce')) && 
        !stepLower.includes('greet')) {
      return !!customerContext.name;
    }

    // Check for phone collection
    if (stepLower.includes('phone') || stepLower.includes('mobile') || 
        stepLower.includes('number') || stepLower.includes('contact')) {
      return !!customerContext.phone;
    }

    // Check for location/address
    if (stepLower.includes('location') || stepLower.includes('address') || 
        stepLower.includes('area') || stepLower.includes('city')) {
      return !!customerContext.address;
    }

    // Check for pincode
    if (stepLower.includes('pincode') || stepLower.includes('pin code') || 
        stepLower.includes('zip')) {
      return !!customerContext.pincode;
    }

    // Check for email
    if (stepLower.includes('email')) {
      return !!customerContext.email;
    }

    // Check for budget/preference in orderDetails
    if (stepLower.includes('budget') || stepLower.includes('price') || 
        stepLower.includes('range')) {
      return customerContext.orderDetails?.budget !== undefined;
    }

    // Check for property type / model / product
    if (stepLower.includes('type') || stepLower.includes('model') || 
        stepLower.includes('bhk') || stepLower.includes('product')) {
      return customerContext.orderDetails?.propertyType !== undefined ||
             customerContext.orderDetails?.model !== undefined ||
             customerContext.orderDetails?.product !== undefined;
    }

    // Greeting steps are always "completed" after first exchange
    if (stepLower.includes('greet') || stepLower.includes('introduce yourself')) {
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
      { key: 'name', patterns: ['name', '{name}'], label: 'customer name' },
      { key: 'phone', patterns: ['phone', 'mobile', 'number', '{mobile}'], label: 'phone number' },
      { key: 'pincode', patterns: ['pincode', 'pin code', '{pincode}'], label: 'pincode' },
      { key: 'address', patterns: ['address', 'location', '{address}'], label: 'address' },
      { key: 'email', patterns: ['email', '{email}'], label: 'email' },
    ];

    // Check which fields are mentioned in script and missing from context
    const requiredFields = [];
    for (const field of fieldChecks) {
      const isInScript = field.patterns.some(pattern => scriptLower.includes(pattern));
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
        remainingFields: requiredFields.map(f => f.label),
        isComplete: false,
      };
    }

    // All required fields collected
    return {
      stage: 'Information Complete',
      nextField: null,
      nextAction: 'your script\'s next steps (qualification, booking, etc.)',
      isComplete: true,
    };
  }

  /**
   * Analyze conversation history to track what questions were already asked
   */
  analyzeConversationHistory(conversationHistory) {
    const askedQuestions = [];
    
    for (const msg of conversationHistory) {
      if (msg.role === 'assistant') {
        const content = msg.content.toLowerCase();
        
        // Detect if assistant asked for specific information
        if (content.includes('name') && content.includes('?')) {
          askedQuestions.push('- Asked for name');
        }
        if ((content.includes('phone') || content.includes('mobile') || content.includes('number')) && content.includes('?')) {
          askedQuestions.push('- Asked for phone/mobile number');
        }
        if (content.includes('email') && content.includes('?')) {
          askedQuestions.push('- Asked for email');
        }
        if (content.includes('address') && content.includes('?')) {
          askedQuestions.push('- Asked for address');
        }
        if (content.includes('pincode') && content.includes('?')) {
          askedQuestions.push('- Asked for pincode');
        }
        if (content.includes('location') && content.includes('?')) {
          askedQuestions.push('- Asked for location');
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
  async extractCustomerInfo(text, existingContext = {}) {
    try {
      console.log("🔍 Extracting customer info from:", text);
      
      const response = await this.openai.chat.completions.create({
        model: AI_CONFIG.EXTRACTION_MODEL,
        messages: [
          {
            role: "system",
            content: EXTRACTION_SYSTEM_PROMPT,
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
      const cleanJson = jsonStr.replace(/```json\n?|```\n?/g, '').trim();
      console.log("🧹 Cleaned JSON:", cleanJson);
      
      if (cleanJson && cleanJson !== "{}") {
        const updates = JSON.parse(cleanJson);
        console.log("📦 Parsed updates:", updates);
        
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
          // Merge with existing context, but don't overwrite with empty values
          const newContext = { ...existingContext };
          
          // Only update fields that have actual values (not empty strings)
          Object.keys(updates).forEach(key => {
            const value = updates[key];
            if (value !== '' && value !== null && value !== undefined) {
              // For objects, merge them
              if (typeof value === 'object' && !Array.isArray(value)) {
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

      // Extract name - multiple patterns
      let nameMatch = text.match(
        /(?:my name is|i am|this is|i'm|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i
      );
      
      // If no explicit name pattern, try to extract capitalized words (likely names)
      // Only if text is short (1-3 words) and starts with capital letter
      if (!nameMatch && text.trim().split(/\s+/).length <= 3) {
        const capitalizedMatch = text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\.?$/);
        if (capitalizedMatch) {
          updates.name = capitalizedMatch[1];
        }
      } else if (nameMatch) {
        updates.name = nameMatch[1];
      }
      
      // Extract model/product names (capitalized words with potential alphanumeric)
      // Examples: "Magnus EX", "Primus", "iPhone 15", "Model 3"
      if (!updates.name && !updates.phone && !updates.pincode && !updates.email) {
        const modelMatch = text.match(/^([A-Z][a-zA-Z0-9\s]+?)(?:\s*[,.])?$/);
        if (modelMatch && modelMatch[1].trim().split(/\s+/).length <= 4) {
          updates.model = modelMatch[1].trim();
        }
      }

      if (Object.keys(updates).length > 0) {
        // Merge with existing context, but don't overwrite with empty values
        const newContext = { ...existingContext };
        
        // Only update fields that have actual values (not empty strings)
        Object.keys(updates).forEach(key => {
          const value = updates[key];
          if (value !== '' && value !== null && value !== undefined) {
            // For objects, merge them
            if (typeof value === 'object' && !Array.isArray(value)) {
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

    console.log("ℹ️ No customer info found in text, returning existing context");
    return existingContext;
  }
}

// Export singleton instance
const aiAgentService = new AIAgentService();
export default aiAgentService;
