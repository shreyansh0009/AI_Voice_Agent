import stateEngine from "../services/stateEngine.js";
import flowGenerator from "../services/flowGenerator.js";
import Conversation from "../models/Conversation.js";
import Agent from "../models/Agent.js";

/**
 * V5 State-Driven Chat Controller
 *
 * ARCHITECTURE:
 * - Uses stateEngine for FULL backend control
 * - Persists state in Conversation model
 * - NO LLM involved in flow control
 * - Text normalization applied automatically
 *
 * This fixes:
 * ✅ Forgetting information (persisted in DB)
 * ✅ Flow loops (deterministic state machine)
 * ✅ Hindi pronunciation (text normalizer)
 * ✅ Flow jumping (backend-controlled)
 */

/**
 * POST /api/chat/v5/stream
 *
 * State-driven streaming chat
 */
export async function streamChatV5(req, res) {
  try {
    const {
      message: userMessage,
      conversationId,
      agentId,
      language,
    } = req.body;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🚀 V5 STREAM | Conv: ${conversationId}`);
    console.log(`📝 User: "${userMessage || "(first turn)"}"`);
    console.log(`🤖 Agent: ${agentId}`);
    console.log(`${"=".repeat(60)}`);

    // ========================================
    // STEP 1: Get or create conversation
    // ========================================
    let conversation = await Conversation.findOne({
      externalId: conversationId,
      agentId,
    }).populate("agentId");

    const agent = conversation?.agentId || (await Agent.findById(agentId));
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    if (!conversation) {
      // Create new conversation
      const flow = await import(
        `../flows/${agent.flowId || "automotive_sales"}.json`,
        {
          assert: { type: "json" },
        }
      );

      conversation = new Conversation({
        externalId: conversationId,
        agentId: agent._id,
        flowId: agent.flowId || "automotive_sales",
        flowVersion: agent.flowVersion || "v1",
        currentStepId: flow.default.startStep,
        language: language || "en",
        agentConfig: agent.agentConfig || {
          name: agent.name || "Agent",
          brand: agent.agentConfig?.brand || "Company",
          tone: "friendly",
          style: "concise",
        },
        collectedData: {},
        channel: "web",
      });

      await conversation.save();
      console.log(`✨ New conversation created: ${conversation._id}`);
    }

    // ========================================
    // STEP 2: Process turn with stateEngine
    // ========================================
    const result = stateEngine.processTurn(
      conversation.externalId,
      userMessage,
      {
        useCase: conversation.flowId,
        language: conversation.language,
        agentId: agent._id.toString(),
      }
    );

    console.log(`🎯 Step: ${result.stepId} | Status: ${result.status}`);
    console.log(`📦 Data:`, result.data);

    // ========================================
    // STEP 3: Update conversation in DB
    // ========================================
    conversation.currentStepId = result.stepId;
    conversation.collectedData = result.data || {};
    conversation.status = result.status;
    conversation.lastUserInput = userMessage;
    conversation.lastAgentResponse = result.text;
    conversation.recordStep(
      result.stepId,
      userMessage,
      result.text,
      result.data
    );

    if (result.status === "complete") {
      conversation.complete("flow_complete");
    } else if (result.status === "escalated") {
      conversation.handoff("max_retries_or_user_request");
    }

    await conversation.save();

    // ========================================
    // STEP 4: Stream response
    // ========================================
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send response text
    const responseText = result.text || "I'm sorry, I didn't understand that.";

    // Split into sentences for streaming
    const sentences = responseText.match(/[^.!?]+[.!?]+/g) || [responseText];

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (sentence) {
        const chunk = {
          type: "text",
          content: sentence,
          isLast: i === sentences.length - 1,
          metadata: {
            conversationId: conversation.externalId,
            currentStep: result.stepId,
            status: result.status,
            collectedData: result.data,
          },
        };

        res.write(`data: ${JSON.stringify(chunk)}\n\n`);

        // Small delay between sentences
        if (i < sentences.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();

    console.log(`✅ V5 Stream complete`);
  } catch (error) {
    console.error("❌ V5 Stream error:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    } else {
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: error.message,
        })}\n\n`
      );
      res.end();
    }
  }
}

/**
 * POST /api/chat/v5
 *
 * State-driven non-streaming chat
 */
export async function chatV5(req, res) {
  try {
    const {
      message: userMessage,
      conversationId,
      agentId,
      language,
    } = req.body;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🚀 V5 CHAT | Conv: ${conversationId}`);
    console.log(`📝 User: "${userMessage || "(first turn)"}"`);
    console.log(`🤖 Agent: ${agentId}`);
    console.log(`${"=".repeat(60)}`);

    // ========================================
    // Get or create conversation
    // ========================================
    let conversation = await Conversation.findOne({
      externalId: conversationId,
      agentId,
    }).populate("agentId");

    const agent = conversation?.agentId || (await Agent.findById(agentId));
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    if (!conversation) {
      const flow = await import(
        `../flows/${agent.flowId || "automotive_sales"}.json`,
        {
          assert: { type: "json" },
        }
      );

      conversation = new Conversation({
        externalId: conversationId,
        agentId: agent._id,
        flowId: agent.flowId || "automotive_sales",
        flowVersion: agent.flowVersion || "v1",
        currentStepId: flow.default.startStep,
        language: language || "en",
        agentConfig: agent.agentConfig || {
          name: agent.name || "Agent",
          brand: agent.agentConfig?.brand || "Company",
        },
        collectedData: {},
        channel: "web",
      });

      await conversation.save();
    }

    // ========================================
    // Process turn with stateEngine
    // ========================================
    const result = stateEngine.processTurn(
      conversation.externalId,
      userMessage,
      {
        useCase: conversation.flowId,
        language: conversation.language,
        agentId: agent._id.toString(),
      }
    );

    // ========================================
    // Update conversation
    // ========================================
    conversation.currentStepId = result.stepId;
    conversation.collectedData = result.data || {};
    conversation.status = result.status;
    conversation.lastUserInput = userMessage;
    conversation.lastAgentResponse = result.text;
    conversation.recordStep(
      result.stepId,
      userMessage,
      result.text,
      result.data
    );

    if (result.status === "complete") {
      conversation.complete();
    } else if (result.status === "escalated") {
      conversation.handoff();
    }

    await conversation.save();

    // ========================================
    // Return response
    // ========================================
    res.json({
      response: result.text,
      conversationId: conversation.externalId,
      currentStep: result.stepId,
      status: result.status,
      collectedData: result.data,
      isComplete: result.status === "complete",
      isEscalated: result.status === "escalated",
    });
  } catch (error) {
    console.error("❌ V5 Chat error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
}

/**
 * GET /api/conversations/:conversationId
 *
 * Get conversation state
 */
export async function getConversation(req, res) {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findOne({
      externalId: conversationId,
    }).populate("agentId");

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json({
      conversationId: conversation.externalId,
      currentStep: conversation.currentStepId,
      status: conversation.status,
      collectedData: conversation.collectedData,
      language: conversation.language,
      turnCount: conversation.turnCount,
      history: conversation.stepHistory.slice(-10), // Last 10 steps
    });
  } catch (error) {
    console.error("❌ Get conversation error:", error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * DELETE /api/conversations/:conversationId
 *
 * Reset/delete conversation
 */
export async function resetConversation(req, res) {
  try {
    const { conversationId } = req.params;

    await Conversation.deleteOne({ externalId: conversationId });

    res.json({ success: true, message: "Conversation reset" });
  } catch (error) {
    console.error("❌ Reset conversation error:", error);
    res.status(500).json({ error: error.message });
  }
}

export default {
  streamChatV5,
  chatV5,
  getConversation,
  resetConversation,
};
