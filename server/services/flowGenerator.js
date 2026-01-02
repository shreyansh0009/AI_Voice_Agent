/**
 * Flow Generator Service
 *
 * PURPOSE: Automatically generate JSON flows from agent prompts
 *
 * This allows users to create 100s of agents without manually writing flows.
 * The LLM converts their script/prompt into a structured flow.
 */

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate a JSON flow from an agent's prompt/script
 *
 * @param {object} agent - Agent document with prompt
 * @returns {object} Generated flow JSON
 */
export async function generateFlowFromPrompt(agent) {
  const systemPrompt = `You are a conversation flow designer.

Convert the user's agent script/prompt into a structured JSON flow.

RULES:
1. Extract what information the agent needs to collect
2. Determine the sequence of questions
3. Identify confirmation points
4. Create proper flow structure

OUTPUT FORMAT (strict JSON):
{
  "flowId": "custom_flow_<agentId>",
  "startStep": "greeting",
  "steps": {
    "greeting": {
      "type": "message",
      "text": {
        "en": "...",
        "hi": "..."
      },
      "next": "next_step_id"
    },
    "step_id": {
      "type": "input|choice|confirm|message",
      "field": "fieldName",
      "validation": "name|mobile|email|text",
      "text": { "en": "...", "hi": "..." },
      "onSuccess": "next_step",
      "onFailure": "handoff"
    }
  }
}

STEP TYPES (only use these):
- message: Agent speaks, no input needed
- input: Collect data (name, phone, email, etc.)
- choice: User picks from options
- confirm: Yes/No question
- handoff: Transfer to human
- end: Conversation complete

VALIDATION TYPES:
- name, mobile, email, pincode, text, number

Always include:
- greeting step
- handoff step (for escalation)
- end step
- Both English and Hindi text`;

  const userPrompt = `Agent Name: ${agent.name}
Domain: ${agent.domain || "general"}

Agent Script/Prompt:
${agent.prompt || agent.personaPrompt}

Generate a complete conversation flow that:
1. Greets the user
2. Collects necessary information
3. Confirms details
4. Completes the task
5. Has error handling

Make it conversational and match the agent's tone.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const generatedFlow = JSON.parse(response.choices[0].message.content);

    // Add metadata
    generatedFlow.flowId = `custom_flow_${agent._id}`;
    generatedFlow.domain = agent.domain || "general";
    generatedFlow.version = "1.0";
    generatedFlow.agentConfig = {
      name: agent.name,
      brand: agent.agentConfig?.brand || "",
      tone: agent.agentConfig?.tone || "friendly",
      style: agent.agentConfig?.style || "concise",
    };

    // Ensure required steps exist
    if (!generatedFlow.steps.handoff) {
      generatedFlow.steps.handoff = {
        type: "handoff",
        text: {
          en: "Let me connect you with a human agent.",
          hi: "मैं आपको एक एजेंट से जोड़ती हूँ।",
        },
        action: "transfer_to_human",
      };
    }

    if (!generatedFlow.steps.end) {
      generatedFlow.steps.end = {
        type: "end",
        text: {
          en: "Thank you!",
          hi: "धन्यवाद!",
        },
        isEnd: true,
      };
    }

    return generatedFlow;
  } catch (error) {
    console.error("❌ Flow generation error:", error);
    throw new Error("Failed to generate flow from prompt");
  }
}

/**
 * Generate and save flow for an agent
 *
 * @param {object} agent - Agent document
 * @returns {object} { flowId, flow }
 */
export async function generateAndSaveFlow(agent) {
  const flow = await generateFlowFromPrompt(agent);

  // Store in agent's flowData field (or save to file)
  agent.flowData = flow;
  agent.flowId = flow.flowId;
  await agent.save();

  console.log(`✅ Generated flow for agent: ${agent.name}`);

  return {
    flowId: flow.flowId,
    flow,
  };
}

/**
 * Get flow for an agent (from DB or generate if missing)
 *
 * @param {object} agent - Agent document
 * @returns {object} Flow JSON
 */
export async function getOrGenerateFlow(agent) {
  // If flow already exists in agent.flowData, use it
  if (agent.flowData && Object.keys(agent.flowData).length > 0) {
    return agent.flowData;
  }

  // If flowId points to a static file, load it
  if (agent.flowId && !agent.flowId.startsWith("custom_flow_")) {
    try {
      const flow = await import(`../flows/${agent.flowId}.json`, {
        assert: { type: "json" },
      });
      return flow.default;
    } catch (err) {
      console.warn(`⚠️ Static flow not found: ${agent.flowId}`);
    }
  }

  // Generate new flow from prompt
  console.log(`🔄 Generating flow for agent: ${agent.name}`);
  const result = await generateAndSaveFlow(agent);
  return result.flow;
}

/**
 * Regenerate flow from updated prompt
 *
 * @param {object} agent - Agent document
 * @returns {object} New flow
 */
export async function regenerateFlow(agent) {
  console.log(`🔄 Regenerating flow for agent: ${agent.name}`);

  const flow = await generateFlowFromPrompt(agent);

  agent.flowData = flow;
  agent.flowId = flow.flowId;
  await agent.save();

  console.log(`✅ Flow regenerated for agent: ${agent.name}`);

  return flow;
}

export default {
  generateFlowFromPrompt,
  generateAndSaveFlow,
  getOrGenerateFlow,
  regenerateFlow,
};
