import stateMachine from "../services/stateMachine.js";
import promptBuilder from "../services/promptBuilder.js";
import textNormalizer from "../services/textNormalizer.js";
import Agent from "../models/Agent.js";

/**
 * 100% Backend-Controlled Chat
 *
 * NO LLM FOR LOGIC OR TEXT GENERATION
 * LLM is ONLY for TTS (text-to-speech) which happens client-side
 *
 * Flow: Agent Prompt → Parse Steps → State Machine → Predefined Text → Client TTS
 */

// Predefined response templates (NO LLM)
const RESPONSE_TEMPLATES = {
  en: {
    greeting: "Hello! I'm {agentName}. How can I help you today?",
    collect_name: "May I know your name please?",
    collect_phone: "Please share your 10-digit mobile number.",
    collect_pincode: "What's your area pincode?",
    collect_email: "Could you please share your email address?",
    collect_address: "What's your address?",
    collect_model: "Which model are you interested in?",
    collect_issue: "What issue are you facing?",
    confirm_details:
      "Let me confirm: Name - {name}, Phone - {phone}, Pincode - {pincode}. Is this correct?",
    book_appointment:
      "Great! Your service visit is confirmed. Our team will contact you soon.",
    transfer_agent: "Let me connect you with a human agent. Please hold.",
    closing: "Thank you for reaching out! Have a great day!",
    retry_invalid: "I didn't catch that. Could you please repeat?",
    retry_phone:
      "That doesn't seem like a valid phone number. Please share 10 digits.",
    retry_pincode: "Please share a valid 6-digit pincode.",
  },
  hi: {
    greeting:
      "नमस्ते! मैं {agentName} बोल रही हूँ। मैं आपकी कैसे मदद कर सकती हूँ?",
    collect_name: "क्या मैं आपका नाम जान सकती हूँ?",
    collect_phone: "कृपया अपना 10 अंकों का मोबाइल नंबर बताइए।",
    collect_pincode: "आपका पिनकोड क्या है?",
    collect_email: "कृपया अपना ईमेल बताइए।",
    collect_address: "आपका पता क्या है?",
    collect_model: "आप किस मॉडल में रुचि रखते हैं?",
    collect_issue: "आप किस समस्या का सामना कर रहे हैं?",
    confirm_details:
      "मैं कन्फर्म करती हूँ: नाम - {name}, मोबाइल - {phone}, पिनकोड - {pincode}। क्या यह सही है?",
    book_appointment:
      "बढ़िया! आपकी सर्विस विज़िट कन्फर्म हो गई है। हमारी टीम जल्द संपर्क करेगी।",
    transfer_agent: "मैं आपको एक एजेंट से जोड़ती हूँ। कृपया रुकिए।",
    closing: "संपर्क करने के लिए धन्यवाद! शुभ दिन!",
    retry_invalid: "मुझे समझ नहीं आया। कृपया दोबारा बताइए।",
    retry_phone: "यह सही नंबर नहीं लग रहा। कृपया 10 अंकों का नंबर बताइए।",
    retry_pincode: "कृपया सही 6 अंकों का पिनकोड बताइए।",
  },
};

/**
 * POST /api/chat/dynamic/stream
 *
 * 100% backend-controlled, zero LLM dependency
 */
export async function streamDynamicChat(req, res) {
  try {
    const {
      message: userMessage,
      agentId,
      sessionId,
      language = "en",
    } = req.body;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🎬 DYNAMIC FLOW (100% Backend) | Session: ${sessionId}`);
    console.log(`📝 User: "${userMessage || "(first turn)"}"`);
    console.log(`🤖 Agent: ${agentId}`);
    console.log(`${"=".repeat(60)}`);

    // Get agent
    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    // Get or initialize state
    let state = stateMachine.getState(sessionId);
    if (!state) {
      // Use stored steps if available, otherwise parse prompt (fallback)
      const flowSource =
        agent.flowData &&
        agent.flowData.steps &&
        agent.flowData.steps.length > 0
          ? agent.flowData.steps
          : agent.prompt;

      state = stateMachine.initializeState(sessionId, flowSource, {
        name: agent.name,
        language: language,
        useCase: agent.domain || "general",
      });
      console.log(`✨ State initialized with ${state.steps.length} steps`);
    }

    // Set up SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Enforce backend rules FIRST
    const enforcement = stateMachine.enforceRulesBeforeLLM(
      sessionId,
      userMessage,
      language
    );

    if (!enforcement.proceed) {
      // Backend blocked - use predefined response
      const responseText = enforcement.response;
      res.write(
        `data: ${JSON.stringify({
          type: "content",
          content: responseText,
        })}\n\n`
      );
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
      return;
    }

    // Extract data from user message (backend validation)
    const stepConfig = stateMachine.getCurrentStepConfig(
      sessionId,
      userMessage
    );
    const expectedFields = stateMachine.getCurrentStepRequirements(sessionId);

    console.log(`🎯 Current Step: ${stepConfig.stepId}`);
    console.log(`📋 Expected Data: ${expectedFields.join(", ")}`);

    const extractedData = extractDataFromMessage(userMessage, expectedFields);

    if (Object.keys(extractedData).length > 0) {
      stateMachine.updateCustomerData(sessionId, extractedData);
      console.log(`📦 Extracted:`, extractedData);

      // Advance to next step
      stateMachine.advanceStep(sessionId);
      state = stateMachine.getState(sessionId);
      console.log(`➡️ Advanced to: ${state.currentStepId}`);
    }

    // Get response text from predefined templates OR step instruction
    const currentStepDetail = state.stepDetails[state.stepIndex];
    const stepInstruction =
      currentStepDetail?.originalText || currentStepDetail?.instruction || "";

    const responseText = getResponseText(
      state.currentStepId,
      state.language,
      {
        agentName: agent.name,
        ...state.customerData,
      },
      stepInstruction
    );

    // Apply text normalization for TTS
    const normalizedText = textNormalizer.normalizeForTTS(
      responseText,
      state.language
    );

    console.log(`📝 Response: ${normalizedText}`);

    // Stream response
    res.write(
      `data: ${JSON.stringify({
        type: "sentence",
        content: normalizedText,
      })}\n\n`
    );

    // Send metadata
    res.write(
      `data: ${JSON.stringify({
        type: "metadata",
        step: state.currentStepId,
        customerData: state.customerData,
        language: state.language,
      })}\n\n`
    );

    res.write(
      `data: ${JSON.stringify({
        type: "done",
        fullResponse: normalizedText,
        customerContext: state.customerData,
        language: state.language,
      })}\n\n`
    );
    res.end();

    console.log(`✅ Turn complete (0% LLM)`);
  } catch (error) {
    console.error("❌ Dynamic flow error:", error);

    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(
        `data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`
      );
      res.end();
    }
  }
}

/**
 * Get response text from predefined templates OR use provided instruction directly
 * NO LLM - just string replacement
 */
function getResponseText(stepId, language, data, fallbackText = "") {
  const templates = RESPONSE_TEMPLATES[language] || RESPONSE_TEMPLATES.en;

  // 1. Try exact match in templates
  let template = templates[stepId];

  // 2. If not found, use the fallback text from the step itself
  if (!template) {
    if (fallbackText) {
      // If fallback text looks like a SECTION header, clean it up or use it
      // For now, we assume the prompt text is what should be spoken
      template = fallbackText;
    } else {
      // 3. Last result: generic greeting
      template = templates.greeting;
    }
  }

  // Replace placeholders
  for (const [key, value] of Object.entries(data)) {
    if (value) {
      template = template.replace(`{${key}}`, value);
    }
  }

  return template;
}

/**
 * Extract data using backend regex (NO LLM)
 */
function extractDataFromMessage(message, expectedFields) {
  const extracted = {};

  if (!message || !expectedFields || expectedFields.length === 0) {
    return extracted;
  }

  for (const field of expectedFields) {
    if (field === "name") {
      const nameMatch = message.match(
        /(?:name is|i am|i'm|this is|मेरा नाम|मैं)\s+([a-zA-Z\u0900-\u097F\s]+)/i
      );
      if (nameMatch) {
        extracted.name = nameMatch[1].trim();
      }
    }

    if (field === "phone") {
      const phoneMatch = message.match(/(\d{10})/);
      if (phoneMatch) {
        extracted.phone = phoneMatch[1];
      }
    }

    if (field === "pincode") {
      const pincodeMatch = message.match(/(\d{6})/);
      if (pincodeMatch) {
        extracted.pincode = pincodeMatch[1];
      }
    }

    if (field === "email") {
      const emailMatch = message.match(
        /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
      );
      if (emailMatch) {
        extracted.email = emailMatch[1];
      }
    }
  }

  return extracted;
}

export default {
  streamDynamicChat,
};
