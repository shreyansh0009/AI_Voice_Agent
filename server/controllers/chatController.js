import aiAgentService from "../services/aiAgent.service.js";
import asyncHandler from "../middleware/asyncHandler.js";

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
