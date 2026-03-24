/**
 * Flow Generator Service
 *
 * PURPOSE: Automatically generate JSON flows from agent prompts/scripts
 *
 * This allows users to create 100s of agents without manually writing flows.
 * The LLM converts their script/prompt into a structured flow.
 *
 * CRITICAL: The generated flow MUST include EVERY step from the script.
 * No step can be skipped, merged, or reordered.
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
  const systemPrompt = `You are a conversation flow architect. Your job is to convert an agent's script into a structured JSON flow for a state engine.

CRITICAL RULES (VIOLATION = FAILURE):
1. EVERY sentence in the script becomes a step. NEVER skip, merge, or reorder any sentence.
2. Each question the agent asks = one step. NEVER combine multiple questions into one step.
3. Each piece of information to collect = one "input" step.
4. Each confirmation/checkpoint = one "confirm" step.
5. The flow must follow the EXACT order of the script — line by line.
6. Preserve the EXACT wording from the script in the "text" field. Do NOT paraphrase or rewrite.
7. If the script mentions "ask name, then ask phone, then ask pincode" → create 3 separate input steps.

STEP TEXT MUST MATCH STEP TYPE (CRITICAL — MOST COMMON ERROR):
8.  A step's "text" MUST ONLY contain content relevant to THAT step's purpose.
9.  confirm steps: text MUST be a yes/no question about ALREADY collected data. NEVER ask for NEW data in a confirm step.
10. input steps: text MUST ask for the SPECIFIC field being collected. Do NOT include "thank you" or transition phrases — put those in a separate message step.
11. message steps: text is for greetings, transitions, or acknowledgments. MUST have a "next" field pointing to the next step (never leave dangling).
12. NEVER combine "thank you" + "please provide X" in the same step. Split into: message step ("thank you") → input step ("please provide X").

WRONG EXAMPLE (VIOLATION):
  "confirm_name": { "type": "confirm", "text": "Thank you, please tell your vehicle number" }
  ↑ WRONG: confirm step asking for new data. Must split into message + input.

CORRECT EXAMPLE:
  "thank_name": { "type": "message", "text": "Thank you {{name}}", "next": "collect_vehicle" }
  "collect_vehicle": { "type": "input", "field": "vehicle_registration", "validation": "text", "text": "Please tell your vehicle number", ... }

STEP TYPES:
- "message": Agent speaks, no user input expected. Use for greetings, explanations, transitions, acknowledgments. MUST have "next" field.
- "input": Collect a specific piece of data. Requires "field" (the data field name) and "validation". Each input step collects EXACTLY ONE field.
- "choice": User picks from a list of options. Requires "options" array and "next" map.
- "confirm": Yes/No question ONLY about data already collected. Requires "confirmNext" and "denyNext".
- "handoff": Transfer to human agent.
- "end": Conversation complete. Mark with "isEnd": true.

VALIDATION TYPES for input steps:
- "name" → for person names
- "phone" or "mobile" → for 10-digit phone numbers
- "email" → for email addresses
- "pincode" → for 6-digit pincodes
- "text" → for ANY free text (vehicle numbers, order IDs, addresses, descriptions, etc.)
- "number" → for numeric values

TRANSITION RULES:
- message steps: use "next" field → string (REQUIRED — never omit)
- input steps: use "onSuccess" → next step ID, "onFailure" → handoff step ID
- choice steps: use "next" → object mapping options to step IDs, "defaultNext" → fallback
- confirm steps: use "confirmNext" → if yes, "denyNext" → if no

PLACEHOLDER RULES (VERY IMPORTANT):
- When the script says "Thank you [name]" or "Thanks {customer_name}", use {{fieldName}} format
- Example: "Thank you {{name}} sir" NOT "Thank you [Customer Name] sir"
- Example: "Your number {{mobile}} is confirmed" NOT "Your number [mobile number] is confirmed"
- The placeholders MUST match the "field" name defined in input steps
- Example: if an input step has "field": "name", use {{name}} in subsequent text

OUTPUT FORMAT (strict JSON):
{
  "flowId": "custom_flow_<agentId>",
  "startStep": "greeting",
  "steps": {
    "greeting": {
      "type": "message",
      "text": {
        "en": "Exact greeting text from script",
        "hi": "Hindi translation of greeting"
      },
      "next": "next_step_id"
    },
    "collect_name": {
      "type": "input",
      "field": "name",
      "validation": "name",
      "text": {
        "en": "Exact question from script for name",
        "hi": "Hindi translation"
      },
      "retryText": {
        "en": "I didn't catch that. Could you tell me your name?",
        "hi": "मुझे समझ नहीं आया। कृपया अपना नाम बताइए।"
      },
      "onSuccess": "next_step_id",
      "onFailure": "handoff"
    }
  }
}

ALWAYS include these system steps:
- "handoff" step (type: handoff)
- "end" step (type: end, isEnd: true)

ALWAYS provide BOTH English ("en") and Hindi ("hi") text for every step.
If the script is in English, translate to Hindi. If in Hindi, translate to English.`;

  const userPrompt = `Agent Name: ${agent.name}
Domain: ${agent.domain || "general"}
Agent Brand: ${agent.agentConfig?.brand || ""}
Agent Tone: ${agent.agentConfig?.tone || "friendly"}

=== AGENT SCRIPT (CONVERT LINE BY LINE — DO NOT SKIP ANY LINE) ===
${agent.prompt || agent.personaPrompt}
=== END OF SCRIPT ===

Instructions:
1. Read the script above carefully, line by line
2. Create ONE step for EACH line/sentence/question in the script
3. Preserve the EXACT wording from the script
4. Set the correct step type for each line
5. Set proper transitions between steps
6. Add handoff and end steps at the bottom

Output the complete flow as JSON.`;

  try {
    console.log(`🤖 Generating flow from script (${(agent.prompt || agent.personaPrompt || "").length} chars)...`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1, // Very low temperature for deterministic output
      response_format: { type: "json_object" },
      max_tokens: 4000,
    });

    const generatedFlow = JSON.parse(response.choices[0].message.content);

    // Validate the generated flow
    if (!generatedFlow.steps || Object.keys(generatedFlow.steps).length < 2) {
      console.error("❌ Generated flow has too few steps:", Object.keys(generatedFlow.steps || {}));
      throw new Error("Generated flow is too short — script may not have been parsed correctly");
    }

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

    // Ensure required system steps exist
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

    // Log the generated steps for debugging
    const stepIds = Object.keys(generatedFlow.steps);
    console.log(`✅ Generated flow with ${stepIds.length} steps:`, stepIds);

    return generatedFlow;
  } catch (error) {
    console.error("❌ Flow generation error:", error.message);
    throw new Error(`Failed to generate flow from prompt: ${error.message}`);
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

  agent.flowData = flow;
  agent.flowId = flow.flowId;
  agent.markModified("flowData"); // Required for Mixed type
  await agent.save();

  console.log(`✅ Generated and saved flow for agent: ${agent.name}`);

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
    console.log(`📋 Using stored flow for: ${agent.name}`);
    return agent.flowData;
  }

  // If flowId points to a static file, load it
  if (agent.flowId && !agent.flowId.startsWith("custom_flow_")) {
    try {
      const flow = await import(`../flows/${agent.flowId}.json`, {
        assert: { type: "json" },
      });
      console.log(`📋 Using static flow: ${agent.flowId}`);
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
  agent.markModified("flowData"); // Required for Mixed type
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
