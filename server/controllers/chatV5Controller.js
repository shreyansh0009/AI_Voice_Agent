import stateEngine from "../services/stateEngine.js";
import Conversation from "../models/Conversation.js";
import Agent from "../models/Agent.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * V5 State-Driven Chat Controller - REFACTORED
 *
 * ARCHITECTURE CHANGE:
 * - MongoDB Conversation is the ONLY source of truth
 * - No in-memory state - all state from DB
 * - Patch-based updates (merges, never overwrites)
 * - Flow loaded by controller, passed to stateEngine
 */

// Cache for loaded flows (performance optimization)
const flowCache = new Map();

/**
 * Load flow definition (with caching)
 * Uses fs.readFileSync for Vercel compatibility (dynamic import fails in serverless)
 */
function loadFlow(flowId) {
  if (flowCache.has(flowId)) {
    console.log(`📦 Flow cache hit: ${flowId}`);
    return flowCache.get(flowId);
  }

  try {
    // Use fs.readFileSync for reliable loading in serverless environments
    const flowPath = path.resolve(__dirname, `../flows/${flowId}.json`);
    console.log(`📂 Loading flow from: ${flowPath}`);

    const flowContent = fs.readFileSync(flowPath, "utf-8");
    const flow = JSON.parse(flowContent);

    flowCache.set(flowId, flow);
    console.log(`✅ Flow loaded successfully: ${flowId}`);
    return flow;
  } catch (error) {
    console.error(`❌ Failed to load flow: ${flowId}`, error.message);
    console.error(`❌ Full error:`, error);
    throw new Error(`Flow not found: ${flowId}`);
  }
}

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
    // STEP 1: Get or create conversation (DB is source of truth)
    // ========================================
    let conversation = await Conversation.findOne({
      externalId: conversationId,
      agentId,
    }).populate("agentId");

    const agent = conversation?.agentId || (await Agent.findById(agentId));
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    // Load flow (controller provides, not stateEngine)
    const flowId = agent.flowId || "automotive_sales";
    const flow = await loadFlow(flowId);

    if (!conversation) {
      // Create new conversation with initial state from flow
      conversation = new Conversation({
        externalId: conversationId,
        agentId: agent._id,
        flowId: flowId,
        flowVersion: agent.flowVersion || "v1",
        currentStepId: flow.startStep,
        language: language || "en",
        agentConfig: agent.agentConfig || {
          name: agent.name || "Agent",
          brand: agent.agentConfig?.brand || "Company",
          tone: "friendly",
          style: "concise",
        },
        collectedData: {}, // Empty - will be populated via patches
        retryCount: 0,
        maxRetries: 2,
        status: "active",
        channel: "web",
      });

      await conversation.save();
      console.log(`✨ New conversation created: ${conversation._id}`);
    }

    console.log(`📊 Current DB State:`, {
      stepId: conversation.currentStepId,
      collectedData: conversation.collectedData,
      retryCount: conversation.retryCount,
      status: conversation.status,
    });

    // ========================================
    // STEP 2: Process turn with stateEngine
    // Pass conversation document, NOT just ID
    // ========================================
    const result = stateEngine.processTurn({
      conversation: conversation.toObject(), // Pass document
      userInput: userMessage,
      flow: flow, // Controller provides flow
    });

    console.log(`🎯 Result:`, {
      nextStepId: result.nextStepId,
      dataPatch: result.dataPatch,
      retryCount: result.retryCount,
      status: result.status,
    });

    // ========================================
    // STEP 3: Apply PATCH to conversation (MERGE, not overwrite)
    // ========================================

    // Handle reset signal
    if (result.wasReset) {
      conversation.currentStepId = flow.startStep;
      conversation.collectedData = {};
      conversation.retryCount = 0;
      console.log(`🔄 Conversation reset`);
    } else {
      // Update step
      if (result.nextStepId !== undefined) {
        conversation.currentStepId = result.nextStepId;
      }

      // CRITICAL: MERGE data patch, never overwrite
      if (result.dataPatch && Object.keys(result.dataPatch).length > 0) {
        conversation.collectedData = {
          ...conversation.collectedData, // Keep existing data
          ...result.dataPatch, // Add new data
        };
        console.log(`✅ Data merged:`, conversation.collectedData);
      }

      // Handle field clearing (only specific field, not all)
      if (result.shouldClearData && result.fieldToClear) {
        delete conversation.collectedData[result.fieldToClear];
        console.log(`🗑️ Cleared field: ${result.fieldToClear}`);
      }

      // Update retry count
      if (result.retryCount !== undefined) {
        conversation.retryCount = result.retryCount;
      }
    }

    // Update status
    conversation.status = result.status;
    conversation.lastUserInput = userMessage;
    conversation.lastAgentResponse = result.text;

    // Record step in history
    if (conversation.recordStep) {
      conversation.recordStep(
        conversation.currentStepId,
        userMessage,
        result.text,
        conversation.collectedData
      );
    }

    // Handle completion/escalation
    if (result.status === "complete" && conversation.complete) {
      conversation.complete("flow_complete");
    } else if (result.status === "escalated" && conversation.handoff) {
      conversation.handoff("max_retries_or_user_request");
    }

    // SAVE to MongoDB (single source of truth)
    await conversation.save();
    console.log(`💾 Conversation saved to DB`);

    // ========================================
    // STEP 4: Stream response
    // ========================================
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

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
            currentStep: conversation.currentStepId,
            status: conversation.status,
            collectedData: conversation.collectedData, // Full data from DB
          },
        };

        res.write(`data: ${JSON.stringify(chunk)}\n\n`);

        if (i < sentences.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }

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
    // Get or create conversation (DB is source of truth)
    // ========================================
    let conversation = await Conversation.findOne({
      externalId: conversationId,
      agentId,
    }).populate("agentId");

    const agent = conversation?.agentId || (await Agent.findById(agentId));
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    // Load flow
    const flowId = agent.flowId || "automotive_sales";
    const flow = await loadFlow(flowId);

    if (!conversation) {
      conversation = new Conversation({
        externalId: conversationId,
        agentId: agent._id,
        flowId: flowId,
        flowVersion: agent.flowVersion || "v1",
        currentStepId: flow.startStep,
        language: language || "en",
        agentConfig: agent.agentConfig || {
          name: agent.name || "Agent",
          brand: agent.agentConfig?.brand || "Company",
        },
        collectedData: {},
        retryCount: 0,
        maxRetries: 2,
        status: "active",
        channel: "web",
      });

      await conversation.save();
    }

    // ========================================
    // Process turn with stateEngine
    // ========================================
    const result = stateEngine.processTurn({
      conversation: conversation.toObject(),
      userInput: userMessage,
      flow: flow,
    });

    // ========================================
    // Apply PATCH to conversation
    // ========================================
    if (result.wasReset) {
      conversation.currentStepId = flow.startStep;
      conversation.collectedData = {};
      conversation.retryCount = 0;
    } else {
      if (result.nextStepId !== undefined) {
        conversation.currentStepId = result.nextStepId;
      }

      // MERGE data patch
      if (result.dataPatch && Object.keys(result.dataPatch).length > 0) {
        conversation.collectedData = {
          ...conversation.collectedData,
          ...result.dataPatch,
        };
      }

      // Handle field clearing
      if (result.shouldClearData && result.fieldToClear) {
        delete conversation.collectedData[result.fieldToClear];
      }

      if (result.retryCount !== undefined) {
        conversation.retryCount = result.retryCount;
      }
    }

    conversation.status = result.status;
    conversation.lastUserInput = userMessage;
    conversation.lastAgentResponse = result.text;

    if (conversation.recordStep) {
      conversation.recordStep(
        conversation.currentStepId,
        userMessage,
        result.text,
        conversation.collectedData
      );
    }

    if (result.status === "complete" && conversation.complete) {
      conversation.complete();
    } else if (result.status === "escalated" && conversation.handoff) {
      conversation.handoff();
    }

    await conversation.save();

    // ========================================
    // Return response
    // ========================================
    res.json({
      response: result.text,
      conversationId: conversation.externalId,
      currentStep: conversation.currentStepId,
      status: conversation.status,
      collectedData: conversation.collectedData, // Full data from DB
      isComplete: conversation.status === "complete",
      isEscalated: conversation.status === "escalated",
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
 * Get conversation state from DB
 */
export async function getConversation(req, res) {
  try {
    const { conversationId } = req.params;

    // DB is the ONLY source of truth
    const conversation = await Conversation.findOne({
      externalId: conversationId,
    }).populate("agentId");

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json({
      conversationId: conversation.externalId,
      agentId: conversation.agentId?._id,
      currentStep: conversation.currentStepId,
      collectedData: conversation.collectedData,
      status: conversation.status,
      language: conversation.language,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    });
  } catch (error) {
    console.error("❌ Get conversation error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
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

    const result = await Conversation.deleteOne({
      externalId: conversationId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json({ success: true, message: "Conversation deleted" });
  } catch (error) {
    console.error("❌ Reset conversation error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
}

export default {
  streamChatV5,
  chatV5,
  getConversation,
  resetConversation,
};
