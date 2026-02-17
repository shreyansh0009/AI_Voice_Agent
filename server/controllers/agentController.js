import Agent from "../models/Agent.js";
import File from "../models/File.js";
import { config } from "../config/index.js";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

// Generate agent configuration from user inputs
export const generateAgentConfig = async (req, res) => {
  try {
    const { name, languages, what, nextSteps, faqs, sample } = req.body;

    // Construct the prompt for the LLM
    const systemPrompt = `
    You are an expert AI agent builder. Your goal is to create a "System Prompt" and a "Welcome Message" for a new AI Voice Agent based on the user's requirements.

    USER REQUIREMENTS:
    - Agent Name: ${name}
    - Languages: ${JSON.stringify(languages)}
    - Goal: ${what}
    - Next Steps: ${nextSteps}
    - FAQs/Info: ${faqs || "None"}
    - Sample Transcript: ${sample || "None"}

    OUTPUT FORMAT (JSON ONLY):
    {
      "name": "Refined Name",
      "prompt": "The detailed system prompt for the agent...",
      "welcome": "The concise welcome message..."
    }

    GUIDELINES:
    1. The 'prompt' should be detailed, instructing the agent on its role, tone, constraints, and how to handle specific scenarios based on the user's input.
    2. The 'welcome' should be short, friendly, and invite the user to speak.
    3. If languages includes Hindi, ensure the prompt instructs the agent to be capable of speaking/understanding Hindi if spoken to, but default to English unless specified.
    4. Do not include markdown code blocks, just raw JSON.
    `;

    const completion = await openai.chat.completions.create({
      messages: [{ role: "system", content: systemPrompt }],
      model: config.chatModel || "gpt-3.5-turbo",
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(completion.choices[0].message.content);

    res.status(200).json(result);
  } catch (error) {
    console.error("Error generating agent config:", error);
    res.status(500).json({
      message: "Failed to generate agent configuration",
      error: error.message,
    });
  }
};

// Create a new agent
export const createAgent = async (req, res) => {
  try {
    const userId = req.user.id;

    // Extract all fields from request body (use spread to include everything)
    const agentData = {
      ...req.body,
      userId, // Ensure userId is from authenticated user
    };

    // ============================================================================
    // ANALYZE SCRIPT FOR DYNAMIC SLOTS (NEW - Hybrid Approach)
    // ============================================================================
    if (agentData.prompt) {
      try {
        const scriptAnalyzer = (await import("../services/scriptAnalyzer.js"))
          .default;
        const detectedSlots = scriptAnalyzer.analyzeScript(agentData.prompt);

        if (detectedSlots && detectedSlots.length > 0) {
          agentData.requiredSlots = detectedSlots;
          console.log(
            `📋 Detected ${detectedSlots.length} slots from script:`,
            detectedSlots.map((s) => s.name)
          );
        } else {
          console.log(
            "📋 No placeholders found in script, will use universal extraction"
          );
        }
      } catch (error) {
        console.warn("⚠️  Script analysis failed, skipping:", error.message);
      }
    }

    const newAgent = new Agent(agentData);
    const savedAgent = await newAgent.save();

    console.log(
      "✅ Agent created successfully:",
      savedAgent.name,
      "| Voice:",
      savedAgent.voice
    );
    res.status(201).json(savedAgent);
  } catch (error) {
    console.error("Error creating agent:", error);
    res
      .status(500)
      .json({ message: "Failed to create agent", error: error.message });
  }
};

// Get all agents for the authenticated user
export const getAgents = async (req, res) => {
  try {
    const userId = req.user.id;
    // Sort by createdAt descending (newest first)
    const agents = await Agent.find({ userId }).sort({ createdAt: -1 });
    res.status(200).json(agents);
  } catch (error) {
    console.error("Error fetching agents:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch agents", error: error.message });
  }
};

// Get a single agent by ID
export const getAgentById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const agent = await Agent.findOne({ _id: id, userId });

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    res.status(200).json(agent);
  } catch (error) {
    console.error("Error fetching agent:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch agent", error: error.message });
  }
};

// Update an agent
export const updateAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Destructure all possible fields from request body
    const {
      name,
      domain,
      status,
      welcome,
      prompt,
      personaPrompt,
      flowId,
      flowVersion,
      supportedLanguages,
      agentConfig,
      // LLM Configuration
      llmProvider,
      llmModel,
      maxTokens,
      temperature,
      // Audio Configuration
      language,
      transcriberProvider,
      transcriberModel,
      voiceProvider,
      voiceModel,
      voice,
      bufferSize,
      speedRate,
    } = req.body;

    // Build update object with only provided fields
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (domain !== undefined) updateData.domain = domain;
    if (status !== undefined) updateData.status = status;
    if (welcome !== undefined) updateData.welcome = welcome;
    if (prompt !== undefined) updateData.prompt = prompt;
    if (personaPrompt !== undefined) updateData.personaPrompt = personaPrompt;
    if (flowId !== undefined) updateData.flowId = flowId;
    if (flowVersion !== undefined) updateData.flowVersion = flowVersion;
    if (supportedLanguages !== undefined)
      updateData.supportedLanguages = supportedLanguages;
    if (agentConfig !== undefined) updateData.agentConfig = agentConfig;

    // LLM Configuration
    if (llmProvider !== undefined) updateData.llmProvider = llmProvider;
    if (llmModel !== undefined) updateData.llmModel = llmModel;
    if (maxTokens !== undefined) updateData.maxTokens = maxTokens;
    if (temperature !== undefined) updateData.temperature = temperature;

    // Audio Configuration
    if (language !== undefined) updateData.language = language;
    if (transcriberProvider !== undefined)
      updateData.transcriberProvider = transcriberProvider;
    if (transcriberModel !== undefined)
      updateData.transcriberModel = transcriberModel;
    if (voiceProvider !== undefined) updateData.voiceProvider = voiceProvider;
    if (voiceModel !== undefined) updateData.voiceModel = voiceModel;
    if (voice !== undefined) updateData.voice = voice;
    if (bufferSize !== undefined) updateData.bufferSize = bufferSize;
    if (speedRate !== undefined) updateData.speedRate = speedRate;

    // ============================================================================
    // RE-ANALYZE SCRIPT FOR DYNAMIC SLOTS (NEW - Hybrid Approach)
    // ============================================================================
    // If prompt is being updated, re-analyze it for new slots
    if (prompt !== undefined) {
      try {
        const scriptAnalyzer = (await import("../services/scriptAnalyzer.js"))
          .default;
        const detectedSlots = scriptAnalyzer.analyzeScript(prompt);

        if (detectedSlots && detectedSlots.length > 0) {
          updateData.requiredSlots = detectedSlots;
          console.log(
            `📋 Re-detected ${detectedSlots.length} slots from updated script:`,
            detectedSlots.map((s) => s.name)
          );
        } else {
          updateData.requiredSlots = []; // Clear slots if none found
          console.log("📋 No placeholders in updated script, cleared slots");
        }
      } catch (error) {
        console.warn("⚠️  Script re-analysis failed, skipping:", error.message);
      }
    }

    const updatedAgent = await Agent.findOneAndUpdate(
      { _id: id, userId },
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedAgent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    console.log(
      "✅ Agent updated successfully:",
      updatedAgent.name,
      "| Voice:",
      updatedAgent.voice
    );
    res.status(200).json(updatedAgent);
  } catch (error) {
    console.error("Error updating agent:", error);
    res
      .status(500)
      .json({ message: "Failed to update agent", error: error.message });
  }
};

// Delete an agent
export const deleteAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const deletedAgent = await Agent.findOneAndDelete({ _id: id, userId });

    if (!deletedAgent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    res.status(200).json({ message: "Agent deleted successfully" });
  } catch (error) {
    console.error("Error deleting agent:", error);
    res
      .status(500)
      .json({ message: "Failed to delete agent", error: error.message });
  }
};

// Link knowledge base files to an agent
export const linkKnowledgeFiles = async (req, res) => {
  try {
    const { id } = req.params;
    const { fileIds } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(fileIds)) {
      return res.status(400).json({ message: "fileIds must be an array" });
    }

    // Verify agent belongs to user
    const agent = await Agent.findOne({ _id: id, userId });
    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    // Verify all files exist, belong to user, and are processed
    const validFiles = await File.find({
      _id: { $in: fileIds },
      userId,
      status: "processed",
    });

    const validFileIds = validFiles.map(f => f._id);

    agent.knowledgeBaseFiles = validFileIds;
    await agent.save();

    // Populate file details for the response
    await agent.populate('knowledgeBaseFiles');

    res.status(200).json({
      message: "Knowledge base files linked successfully",
      knowledgeBaseFiles: agent.knowledgeBaseFiles,
    });
  } catch (error) {
    console.error("Error linking knowledge files:", error);
    res.status(500).json({ message: "Failed to link knowledge files", error: error.message });
  }
};

// Unlink a knowledge base file from an agent
export const unlinkKnowledgeFile = async (req, res) => {
  try {
    const { id, fileId } = req.params;
    const userId = req.user.id;

    const agent = await Agent.findOne({ _id: id, userId });
    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    agent.knowledgeBaseFiles = agent.knowledgeBaseFiles.filter(
      (fId) => fId.toString() !== fileId
    );
    await agent.save();

    await agent.populate('knowledgeBaseFiles');

    res.status(200).json({
      message: "Knowledge base file unlinked successfully",
      knowledgeBaseFiles: agent.knowledgeBaseFiles,
    });
  } catch (error) {
    console.error("Error unlinking knowledge file:", error);
    res.status(500).json({ message: "Failed to unlink knowledge file", error: error.message });
  }
};
