import aiAgentService from "../services/aiAgent.service.js";
import translationService from "../services/translationService.js";
import Agent from "../models/Agent.js";

export const chatWithAgentforce = async (req, res) => {
  try {
    const { message, useRAG, agentId } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Fetch agent prompt if agentId is provided
    let systemPrompt = "";
    if (agentId) {
      try {
        const agent = await Agent.findById(agentId);
        if (agent && agent.prompt) {
          systemPrompt = agent.prompt;
        }
      } catch (err) {
        console.warn("Error fetching agent prompt:", err);
      }
    }

    // 1. Detect language
    const detectedLanguage = await translationService.detectLanguage(message);
    console.log(
      `Agentforce Controller: Detected language '${detectedLanguage}' for message '${message}'`
    );

    // 2. Process via AI Service (which handles translation to/from Agentforce)
    // We strictly force provider='agentforce' here
    const result = await aiAgentService.processMessage(
      message,
      agentId || "default", // agentId
      {}, // context
      [], // history
      {
        provider: "agentforce",
        language: detectedLanguage,
        useRAG: useRAG,
        systemPrompt: systemPrompt,
      }
    );

    // aiAgentService returns { response, language, ... } or just string/object
    const finalResponse = typeof result === "string" ? result : result.response;

    res.json({ response: finalResponse });
  } catch (error) {
    console.error("Agentforce Controller Error:", error);
    res.status(500).json({
      error: "Failed to communicate with Agentforce",
      details: error.message,
    });
  }
};
