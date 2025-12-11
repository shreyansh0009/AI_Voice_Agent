import AgentApiClient from "salesforce-agent-api-client";
import dotenv from "dotenv";
import ragService from "./ragService.js";

dotenv.config();

class AgentforceService {
  constructor() {
    this.config = {
      instanceUrl: process.env.SF_INSTANCE_URL,
      clientId: process.env.SF_CLIENT_ID,
      clientSecret: process.env.SF_CLIENT_SECRET,
      agentId: process.env.SF_AGENT_ID,
    };

    this.client = null;
    this.isAuthenticated = false;
  }

  async initialize() {
    if (this.client && this.isAuthenticated) return;

    if (
      !this.config.instanceUrl ||
      !this.config.clientId ||
      !this.config.clientSecret ||
      !this.config.agentId
    ) {
      throw new Error("Agentforce configuration is missing");
    }

    this.client = new AgentApiClient(this.config);
    await this.client.authenticate();
    this.isAuthenticated = true;
    console.log("AgentforceService: Authenticated");
  }

  /**
   * Process a message through Agentforce
   * @param {string} message - The user's message (English)
   * @param {Object} options - Options like useRAG
   * @returns {Promise<string>} The agent's response
   */
  async processMessage(message, options = {}) {
    try {
      await this.initialize();
      const { useRAG = false, systemPrompt, agentId } = options;

      let finalMessage = message;

      // RAG Integration
      if (useRAG) {
        console.log("AgentforceService: RAG enabled, retrieving context...");
        try {
          // Use topK from config or default to 15 for better context
          // Filter by agentId to ensure we only get relevant knowledge
          const filter = agentId ? { agentId } : {};
          const ragResult = await ragService.retrieveContext(
            message,
            15,
            filter
          );

          if (ragResult && ragResult.results && ragResult.results.length > 0) {
            const contextText = ragResult.results
              .map((r) => r.text)
              .join("\n\n");

            // Incorporate System Prompt + Context + Query
            finalMessage = `
${systemPrompt ? "SYSTEM INSTRUCTIONS:\n" + systemPrompt : ""}

--- KNOWLEDGE BASE CONTEXT (STRICTLY FOLLOW THIS) ---
${contextText}
--- END CONTEXT ---

CRITICAL INSTRUCTIONS:
1. The KNOWLEDGE BASE CONTEXT above is your PRIMARY script.
2. If it defines a "Flow", "Script", or "Steps", you MUST follow them sequentially.
3. SKIPPING STEPS IS FORBIDDEN. Do not skip to booking/confirmation until you have asked for and received ALL required details (e.g. Pincode) as per the script.
4. If the user answers a question, look at the script to see what the NEXT question is.
5. Keep responses short (1-2 sentences) for voice.
6. TONE: Be warm, professional, and conversational. Use natural fillers (e.g., "Got it," "Sure") to sound more human, while STRICTLY following the flow.

User Query: ${message}`;
          }
        } catch (ragError) {
          console.error("AgentforceService: RAG retrieval failed:", ragError);
        }
      } else if (systemPrompt) {
        // If no RAG but System Prompt exists
        finalMessage = `SYSTEM INSTRUCTIONS:\n${systemPrompt}\n\nUser Query: ${message}`;
      }

      const sessionId = await this.client.createSession();
      console.log("AgentforceService: Session created", sessionId);

      let fullResponse = "";
      const processedMessageIds = new Set();
      const variables = [];

      await new Promise((resolve, reject) => {
        const streamEventHandler = ({ data, event }) => {
          try {
            const eventData = JSON.parse(data);

            if (event === "INFORM" && eventData) {
              const messageId = eventData.message?.id;
              if (messageId && processedMessageIds.has(messageId)) return;
              if (messageId) processedMessageIds.add(messageId);

              if (eventData.message?.message)
                fullResponse += eventData.message.message;
              else if (eventData.message?.content)
                fullResponse += eventData.message.content;
              else if (eventData.message?.text)
                fullResponse += eventData.message.text;
              else if (typeof eventData.message === "string")
                fullResponse += eventData.message;
              else if (eventData.content) fullResponse += eventData.content;
              else if (eventData.text) fullResponse += eventData.text;
            }
          } catch (e) {
            console.error("Error processing event data:", e);
          }
        };

        const streamDisconnectHandler = async () => {
          try {
            await this.client.closeSession(sessionId);
          } catch (e) {
            console.error("Error closing session:", e);
          }
          resolve();
        };

        try {
          this.client.sendStreamingMessage(
            sessionId,
            finalMessage,
            variables,
            streamEventHandler,
            streamDisconnectHandler
          );
        } catch (err) {
          reject(err);
        }
      });

      return fullResponse || "I apologize, I didn't get a response.";
    } catch (error) {
      console.error("AgentforceService Error:", error);
      throw error;
    }
  }
}

export default new AgentforceService();
