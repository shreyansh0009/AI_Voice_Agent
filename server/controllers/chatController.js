import aiAgentService from "../services/aiAgent.service.js";
import asyncHandler from "../middleware/asyncHandler.js";
import Agent from "../models/Agent.js";

/**
 * Process chat message using AI Agent Service
 * Handles customer info extraction, conversation state tracking, and AI response
 */
export const processChat = asyncHandler(async (req, res) => {
  const {
    message,
    agentId = "default",
    customerContext = {},
    conversationHistory = [],
    options = {},
  } = req.body;

  // Validate required fields
  if (!message || typeof message !== "string") {
    return res.status(400).json({
      error: "Message is required and must be a string",
    });
  }

  try {
    console.log("💬 Chat Request:", {
      message,
      agentId,
      customerContext,
      historyLength: conversationHistory.length,
      options,
    });

    // Process message through AI Agent Service
    const result = await aiAgentService.processMessage(
      message,
      agentId,
      customerContext,
      conversationHistory,
      options
    );

    console.log("✅ Chat Response:", {
      responseLength: result?.response?.length || 0,
      updatedContext: result?.customerContext,
    });

    // Return response with updated context from the service
    res.json({
      response: result.response,
      customerContext: result.customerContext,
      languageSwitch: result?.languageSwitch || null,
    });
  } catch (error) {
    console.error("❌ Chat processing error:", error);
    res.status(500).json({
      error: "Failed to process chat message",
      details: error.message,
    });
  }
});

/**
 * Chat with agent — uses the SAME LLM pipeline as phone calls
 * (processMessageStream) so the responses are identical to telephony.
 *
 * POST /api/chat/agent-chat
 * Body: { message, agentId, conversationHistory, customerContext }
 */
export const agentChat = asyncHandler(async (req, res) => {
  const {
    message,
    agentId,
    conversationHistory = [],
    customerContext = {},
  } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message is required" });
  }
  if (!agentId) {
    return res.status(400).json({ error: "agentId is required" });
  }

  try {
    // Load agent to get its prompt / knowledge-base config (same as phone call)
    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const systemPrompt = agent.prompt || "You are a helpful AI assistant.";
    const language = agent.supportedLanguages?.[0] || "en";
    const useRAG = (agent.knowledgeBaseFiles?.length || 0) > 0;

    // Call the SAME streaming method as phone calls (asteriskBridge)
    const stream = await aiAgentService.processMessageStream(
      message,
      agentId,
      customerContext,
      conversationHistory,
      {
        language,
        systemPrompt,
        useRAG,
        agentId,
      },
    );

    // Collect all chunks into a single response
    let fullResponse = "";
    let updatedContext = null;

    for await (const chunk of stream) {
      if (chunk.type === "content" || chunk.type === "flow_text") {
        fullResponse += chunk.content;
      } else if (chunk.type === "context") {
        updatedContext = chunk.customerContext;
      }
      // ignore 'done', 'language', etc.
    }

    res.json({
      success: true,
      response: fullResponse.trim(),
      customerContext: updatedContext || customerContext,
    });
  } catch (error) {
    console.error("❌ Agent chat error:", error);
    res.status(500).json({
      error: "Failed to process agent chat message",
      details: error.message,
    });
  }
});
