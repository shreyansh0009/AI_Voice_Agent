/**
 * DID to Agent Mapping Configuration
 *
 * Maps phone numbers (DIDs) to specific Agent IDs
 * This allows different phone numbers to route to different agents
 */

/**
 * DID to Agent ID mapping
 * Format: "cleaned_phone_number": "agent_id"
 * Phone numbers without +, spaces, or dashes
 */
export const DID_AGENT_MAP = {
  // Greeves Mobility - Automotive Service
  917935459094: "6969e3e23631b686605e290d",

  // Add more mappings here as needed:
  // "917935459095": "another_agent_id",
  // "917935459096": "yet_another_agent_id",
};

/**
 * Get Agent ID for a given phone number
 * @param {string} phoneNumber - Phone number (any format: +91-xxx, 91xxx, etc.)
 * @returns {string|null} - Agent ID or null if not mapped
 */
export function getAgentIdForDID(phoneNumber) {
  if (!phoneNumber) return null;

  // Clean the phone number: remove +, spaces, dashes, parentheses
  const cleaned = phoneNumber.toString().replace(/[\+\s\-\(\)]/g, "");

  // Look up in mapping
  const agentId = DID_AGENT_MAP[cleaned];

  if (agentId) {
    console.log(`📞 DID ${phoneNumber} → Agent ${agentId}`);
  } else {
    console.warn(
      `⚠️ No agent mapped for DID: ${phoneNumber} (cleaned: ${cleaned})`
    );
  }

  return agentId || null;
}

/**
 * Get default agent ID (fallback when no mapping found)
 * @returns {string|null}
 */
export function getDefaultAgentId() {
  const defaultId = process.env.DEFAULT_PHONE_AGENT_ID || null;
  if (defaultId) {
    console.log(`📞 Using default agent: ${defaultId}`);
  }
  return defaultId;
}

export default {
  DID_AGENT_MAP,
  getAgentIdForDID,
  getDefaultAgentId,
};
