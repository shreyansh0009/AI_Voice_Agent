import PhoneNumber from "../models/PhoneNumber.js";
import Agent from "../models/Agent.js";

/**
 * Get all phone numbers with their link status
 */
export const getAllPhoneNumbers = async (req, res) => {
  try {
    const phoneNumbers = await PhoneNumber.find()
      .sort({ displayNumber: 1 })
      .lean();

    res.json({
      success: true,
      phoneNumbers,
    });
  } catch (error) {
    console.error("Error fetching phone numbers:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch phone numbers",
    });
  }
};

/**
 * Get available (unlinked) phone numbers
 */
export const getAvailablePhoneNumbers = async (req, res) => {
  try {
    const phoneNumbers = await PhoneNumber.find({ status: "available" })
      .sort({ displayNumber: 1 })
      .lean();

    res.json({
      success: true,
      phoneNumbers,
    });
  } catch (error) {
    console.error("Error fetching available phone numbers:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch available phone numbers",
    });
  }
};

/**
 * Get phone number linked to a specific agent
 */
export const getAgentPhoneNumber = async (req, res) => {
  try {
    const { agentId } = req.params;

    const phoneNumber = await PhoneNumber.findOne({
      linkedAgentId: agentId,
    }).lean();

    res.json({
      success: true,
      phoneNumber: phoneNumber || null,
    });
  } catch (error) {
    console.error("Error fetching agent phone number:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch agent phone number",
    });
  }
};

/**
 * Link a phone number to an agent
 */
export const linkPhoneNumber = async (req, res) => {
  try {
    const { number } = req.params;
    const { agentId } = req.body;

    if (!agentId) {
      return res.status(400).json({
        success: false,
        error: "agentId is required",
      });
    }

    // Clean the number
    const cleanedNumber = PhoneNumber.cleanNumber(number);

    // Find the phone number
    const phoneNumber = await PhoneNumber.findOne({ number: cleanedNumber });

    if (!phoneNumber) {
      return res.status(404).json({
        success: false,
        error: "Phone number not found",
      });
    }

    // Check if already linked to another agent
    if (phoneNumber.status === "linked" && phoneNumber.linkedAgentId) {
      if (phoneNumber.linkedAgentId.toString() === agentId) {
        return res.status(400).json({
          success: false,
          error: "Phone number is already linked to this agent",
        });
      }
      return res.status(400).json({
        success: false,
        error: `Phone number is already linked to agent: ${phoneNumber.linkedAgentName}`,
      });
    }

    // Check if agent already has a linked number
    const existingLink = await PhoneNumber.findOne({ linkedAgentId: agentId });
    if (existingLink) {
      return res.status(400).json({
        success: false,
        error: `Agent already has a linked number: ${existingLink.displayNumber}. Unlink it first.`,
      });
    }

    // Get agent name for caching
    const agent = await Agent.findById(agentId).select("name");
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    // Link the number
    phoneNumber.linkedAgentId = agentId;
    phoneNumber.linkedAgentName = agent.name;
    phoneNumber.linkedAt = new Date();
    phoneNumber.status = "linked";
    await phoneNumber.save();

    console.log(
      `📞 Linked ${phoneNumber.displayNumber} → Agent ${agent.name} (${agentId})`,
    );

    res.json({
      success: true,
      message: `Phone number ${phoneNumber.displayNumber} linked to ${agent.name}`,
      phoneNumber,
    });
  } catch (error) {
    console.error("Error linking phone number:", error);
    res.status(500).json({
      success: false,
      error: "Failed to link phone number",
    });
  }
};

/**
 * Unlink a phone number from an agent
 */
export const unlinkPhoneNumber = async (req, res) => {
  try {
    const { number } = req.params;

    // Clean the number
    const cleanedNumber = PhoneNumber.cleanNumber(number);

    // Find the phone number
    const phoneNumber = await PhoneNumber.findOne({ number: cleanedNumber });

    if (!phoneNumber) {
      return res.status(404).json({
        success: false,
        error: "Phone number not found",
      });
    }

    if (phoneNumber.status !== "linked") {
      return res.status(400).json({
        success: false,
        error: "Phone number is not linked to any agent",
      });
    }

    const previousAgent = phoneNumber.linkedAgentName;

    // Unlink the number
    phoneNumber.linkedAgentId = null;
    phoneNumber.linkedAgentName = null;
    phoneNumber.linkedAt = null;
    phoneNumber.status = "available";
    await phoneNumber.save();

    console.log(
      `📞 Unlinked ${phoneNumber.displayNumber} from Agent ${previousAgent}`,
    );

    res.json({
      success: true,
      message: `Phone number ${phoneNumber.displayNumber} unlinked from ${previousAgent}`,
      phoneNumber,
    });
  } catch (error) {
    console.error("Error unlinking phone number:", error);
    res.status(500).json({
      success: false,
      error: "Failed to unlink phone number",
    });
  }
};
