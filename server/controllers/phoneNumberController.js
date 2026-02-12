import PhoneNumber from "../models/PhoneNumber.js";
import Agent from "../models/Agent.js";

/**
 * Get all phone numbers for the current user
 * Returns: user's owned/linked numbers + available numbers for purchase
 */
export const getAllPhoneNumbers = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get numbers owned by this user OR available for purchase
    const phoneNumbers = await PhoneNumber.find({
      $or: [
        { ownerId: userId },  // User's owned numbers
        { status: "available" }  // Available for purchase
      ]
    })
      .sort({ status: 1, displayNumber: 1 })  // Sort: available first, then by number
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
 * Get available (unlinked) phone numbers - for admin/purchase view
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
 * Get user's owned phone numbers available for linking
 * Only returns numbers that:
 * 1. Are owned by the current user
 * 2. Have valid subscription (not expired)
 * 3. Are not already linked to an agent
 */
export const getUserOwnedNumbers = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    // Find numbers owned by user, not linked, and with valid subscription
    const phoneNumbers = await PhoneNumber.find({
      ownerId: userId,
      status: "owned",
      expiresAt: { $gt: now }
    })
      .sort({ displayNumber: 1 })
      .lean();

    res.json({
      success: true,
      phoneNumbers,
    });
  } catch (error) {
    console.error("Error fetching user's owned phone numbers:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch your phone numbers",
    });
  }
};

/**
 * Get phone number linked to a specific agent
 * Only returns if agent belongs to current user
 */
export const getAgentPhoneNumber = async (req, res) => {
  try {
    const { agentId } = req.params;
    const userId = req.user.id;

    // First verify the agent belongs to the current user
    const agent = await Agent.findOne({ _id: agentId, userId }).select("_id");

    if (!agent) {
      // Agent doesn't exist or doesn't belong to user - return null (not error)
      return res.json({
        success: true,
        phoneNumber: null,
      });
    }

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

    // If number has no owner yet (legacy data), set the current user as owner
    if (!phoneNumber.ownerId) {
      phoneNumber.ownerId = req.user.id;
      if (!phoneNumber.purchasedAt) {
        phoneNumber.purchasedAt = new Date();
      }
      if (!phoneNumber.expiresAt) {
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);
        phoneNumber.expiresAt = expiresAt;
      }
    }

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

    // Unlink the number - keep ownership if user owns it OR if subscription is still valid
    phoneNumber.linkedAgentId = null;
    phoneNumber.linkedAgentName = null;
    phoneNumber.linkedAt = null;

    // Check if ownership should be preserved (has owner OR valid subscription)
    const hasValidSubscription = phoneNumber.expiresAt && new Date(phoneNumber.expiresAt) > new Date();
    const hasOwner = !!phoneNumber.ownerId;

    if (hasOwner || hasValidSubscription) {
      phoneNumber.status = "owned";
    } else {
      phoneNumber.status = "available";
    }

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

/**
 * Purchase a phone number (set ownership)
 * Sets ownerId, purchasedAt, and expiresAt (1 month from now)
 */
export const purchasePhoneNumber = async (req, res) => {
  try {
    const { number } = req.params;
    const userId = req.user.id;

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

    if (phoneNumber.status !== "available") {
      return res.status(400).json({
        success: false,
        error: "Phone number is not available for purchase",
      });
    }

    // Set ownership and subscription details
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    phoneNumber.ownerId = userId;
    phoneNumber.purchasedAt = now;
    phoneNumber.expiresAt = expiresAt;
    phoneNumber.status = "owned";
    await phoneNumber.save();

    console.log(
      `📞 Phone number ${phoneNumber.displayNumber} purchased by user ${userId}, expires ${expiresAt.toISOString()}`,
    );

    res.json({
      success: true,
      message: `Phone number ${phoneNumber.displayNumber} purchased successfully`,
      phoneNumber,
    });
  } catch (error) {
    console.error("Error purchasing phone number:", error);
    res.status(500).json({
      success: false,
      error: "Failed to purchase phone number",
    });
  }
};

/**
 * Renew phone number subscription
 * Extends expiresAt by 1 month from current expiry (or from now if already expired)
 */
export const renewPhoneNumber = async (req, res) => {
  try {
    const { number } = req.params;
    const userId = req.user.id;

    const cleanedNumber = PhoneNumber.cleanNumber(number);
    const phoneNumber = await PhoneNumber.findOne({ number: cleanedNumber });

    if (!phoneNumber) {
      return res.status(404).json({
        success: false,
        error: "Phone number not found",
      });
    }

    if (phoneNumber.ownerId?.toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: "You do not own this phone number",
      });
    }

    // Extend from current expiry or from now
    const baseDate = phoneNumber.expiresAt > new Date()
      ? phoneNumber.expiresAt
      : new Date();
    const newExpiry = new Date(baseDate);
    newExpiry.setMonth(newExpiry.getMonth() + 1);

    phoneNumber.expiresAt = newExpiry;
    phoneNumber.status = phoneNumber.linkedAgentId ? "linked" : "owned";
    await phoneNumber.save();

    res.json({
      success: true,
      message: `Subscription renewed until ${newExpiry.toISOString()}`,
      phoneNumber,
    });
  } catch (error) {
    console.error("Error renewing phone number:", error);
    res.status(500).json({
      success: false,
      error: "Failed to renew phone number",
    });
  }
};

/**
 * Release (delete) a phone number from user's ownership
 * Clears ownership and returns number to available pool
 */
export const releasePhoneNumber = async (req, res) => {
  try {
    const { number } = req.params;
    const userId = req.user.id;

    const cleanedNumber = PhoneNumber.cleanNumber(number);
    const phoneNumber = await PhoneNumber.findOne({ number: cleanedNumber });

    if (!phoneNumber) {
      return res.status(404).json({
        success: false,
        error: "Phone number not found",
      });
    }

    // Check ownership
    if (phoneNumber.ownerId?.toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: "You do not own this phone number",
      });
    }

    // Clear all ownership and linking
    phoneNumber.ownerId = null;
    phoneNumber.linkedAgentId = null;
    phoneNumber.linkedAgentName = null;
    phoneNumber.linkedAt = null;
    phoneNumber.purchasedAt = null;
    phoneNumber.expiresAt = null;
    phoneNumber.status = "available";
    await phoneNumber.save();

    console.log(`📞 Phone number ${phoneNumber.displayNumber} released by user ${userId}`);

    res.json({
      success: true,
      message: `Phone number ${phoneNumber.displayNumber} has been released`,
      phoneNumber,
    });
  } catch (error) {
    console.error("Error releasing phone number:", error);
    res.status(500).json({
      success: false,
      error: "Failed to release phone number",
    });
  }
};
