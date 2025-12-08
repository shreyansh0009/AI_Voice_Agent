import Agent from "../models/Agent.js";

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
