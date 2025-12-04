import AgentApiClient from "salesforce-agent-api-client";
import dotenv from "dotenv";
import ragService from "../services/ragService.js";

dotenv.config();

const config = {
  instanceUrl: process.env.SF_INSTANCE_URL,
  clientId: process.env.SF_CLIENT_ID,
  clientSecret: process.env.SF_CLIENT_SECRET,
  agentId: process.env.SF_AGENT_ID,
};

export const chatWithAgentforce = async (req, res) => {
  try {
    const { message, useRAG } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    console.log("Agentforce: Initializing client...");

    // Validate config
    if (
      !config.instanceUrl ||
      !config.clientId ||
      !config.clientSecret ||
      !config.agentId
    ) {
      console.error("Agentforce: Missing configuration", config);
      return res
        .status(500)
        .json({ error: "Agentforce configuration is missing" });
    }

    const client = new AgentApiClient(config);
    await client.authenticate();
    console.log("Agentforce: Authenticated");

    const sessionId = await client.createSession();
    console.log("Agentforce: Session created", sessionId);

    let fullResponse = "";

    let finalMessage = message;

    // RAG Integration
    if (useRAG) {
      console.log(
        "Agentforce: RAG enabled, retrieving context for query:",
        message
      );
      try {
        const ragResult = await ragService.retrieveContext(message, 3); // Get top 3 chunks
        console.log(
          "Agentforce: RAG result:",
          JSON.stringify(ragResult, null, 2)
        );

        if (ragResult && ragResult.results && ragResult.results.length > 0) {
          const contextText = ragResult.results.map((r) => r.text).join("\n\n");
          console.log(
            "Agentforce: Context retrieved, length:",
            contextText.length
          );

          // Augment the message with context
          finalMessage = `Context information is below.
---------------------
${contextText}
---------------------
Given the context information and not prior knowledge, answer the query.
Query: ${message}`;
        } else {
          console.log(
            "Agentforce: No relevant context found in local knowledge base."
          );
        }
      } catch (ragError) {
        console.error("Agentforce: RAG retrieval failed:", ragError);
        // Continue without RAG if it fails
      }
    } else {
      console.log("Agentforce: RAG disabled");
    }

    const variables = [];

    const processedMessageIds = new Set();

    // We need to wrap the streaming in a promise to await it
    await new Promise((resolve, reject) => {
      function streamEventHandler({ data, event }) {
        try {
          const eventData = JSON.parse(data);

          // Debug logging
          console.log(`Agentforce Event: ${event}`);
          // console.log('Agentforce Data:', JSON.stringify(eventData, null, 2));

          // Only process INFORM events which contain the actual chat content
          if (event === "INFORM" && eventData) {
            // Avoid processing the same message ID twice
            const messageId = eventData.message?.id;
            if (messageId && processedMessageIds.has(messageId)) {
              console.log(`Skipping duplicate message ID: ${messageId}`);
              return;
            }

            if (messageId) {
              processedMessageIds.add(messageId);
            }

            // Prioritize the most specific content field
            if (eventData.message && eventData.message.message) {
              fullResponse += eventData.message.message;
            } else if (eventData.message && eventData.message.content) {
              fullResponse += eventData.message.content;
            } else if (eventData.message && eventData.message.text) {
              fullResponse += eventData.message.text;
            } else if (typeof eventData.message === "string") {
              fullResponse += eventData.message;
            } else if (eventData.content) {
              fullResponse += eventData.content;
            } else if (eventData.text) {
              fullResponse += eventData.text;
            }
          }

          // Handle specific event types if known
        } catch (e) {
          console.error("Error processing event data:", e);
        }
      }

      async function streamDisconnectHandler() {
        console.log("Agentforce: Stream disconnected");
        try {
          await client.closeSession(sessionId);
        } catch (e) {
          console.error("Error closing session:", e);
        }
        resolve();
      }

      try {
        client.sendStreamingMessage(
          sessionId,
          finalMessage,
          variables,
          streamEventHandler,
          streamDisconnectHandler
        );
      } catch (err) {
        console.error("Agentforce Streaming Error:", err);
        reject(err);
      }
    });

    console.log("Agentforce: Full response length:", fullResponse.length);
    res.json({ response: fullResponse || "No response content received." });
  } catch (error) {
    console.error("Agentforce Controller Error:", error);
    res.status(500).json({
      error: "Failed to communicate with Agentforce",
      details: error.message,
    });
  }
};
