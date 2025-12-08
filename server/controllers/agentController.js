import Agent from "../models/Agent.js";
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
    res
      .status(500)
      .json({
        message: "Failed to generate agent configuration",
        error: error.message,
      });
  }
};

// Create a new agent
export const createAgent = async (req, res) => {
  try {
    const { name, welcome, prompt, status } = req.body;
    const userId = req.user.id;

    const newAgent = new Agent({
      userId,
      name,
      welcome,
      prompt,
      status: status || "draft",
    });

    const savedAgent = await newAgent.save();
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
    const { name, welcome, prompt, status } = req.body;

    const updatedAgent = await Agent.findOneAndUpdate(
      { _id: id, userId },
      { name, welcome, prompt, status },
      { new: true, runValidators: true }
    );

    if (!updatedAgent) {
      return res.status(404).json({ message: "Agent not found" });
    }

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
