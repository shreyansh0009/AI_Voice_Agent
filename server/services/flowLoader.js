/**
 * Flow Loader Helper
 *
 * Loads flows from agent (either static JSON or dynamically generated)
 */

import flowGenerator from "./flowGenerator.js";

/**
 * Get flow for an agent
 *
 * Priority:
 * 1. Check agent.flowData (dynamically generated and stored)
 * 2. Check static file (if flowId points to file)
 * 3. Generate from agent.prompt
 *
 * @param {object} agent - Agent document
 * @returns {object} Flow JSON
 */
export async function getFlowForAgent(agent) {
  // Option 1: Use stored flowData (already generated)
  if (agent.flowData && Object.keys(agent.flowData).length > 0) {
    console.log(`📋 Using stored flow for: ${agent.name}`);
    return agent.flowData;
  }

  // Option 2: Use static file
  if (agent.flowId && !agent.flowId.startsWith("custom_flow_")) {
    try {
      const flow = await import(`../flows/${agent.flowId}.json`, {
        assert: { type: "json" },
      });
      console.log(`📋 Using static flow: ${agent.flowId}`);
      return flow.default;
    } catch (err) {
      console.warn(`⚠️ Static flow not found: ${agent.flowId}, will generate`);
    }
  }

  // Option 3: Generate from prompt
  console.log(`🔄 Generating flow for: ${agent.name}`);
  return await flowGenerator.getOrGenerateFlow(agent);
}

export default {
  getFlowForAgent,
};
