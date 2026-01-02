import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Agent from "./models/Agent.js";
import promptBuilder from "./services/promptBuilder.js";
import { config } from "./config/index.js";

async function regenerateFlow() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to DB");

  // Find the most recent agent
  const agent = await Agent.findOne().sort({ createdAt: -1 });

  if (!agent) {
    console.log("No agents found");
    process.exit(1);
  }

  console.log(`Found agent: ${agent.name} (${agent._id})`);
  console.log("Parsing prompt...");

  const steps = promptBuilder.parseAgentScriptToSteps(agent.prompt);
  console.log(`Generated ${steps.length} steps:`);
  steps.forEach((s) =>
    console.log(`- [${s.id}] ${s.originalText.substring(0, 50)}...`)
  );

  agent.flowData = {
    flowId: `custom_${agent._id}`,
    steps: steps,
    generatedAt: new Date(),
  };

  await agent.save();
  console.log("✅ Flow updated in DB");
  process.exit(0);
}

regenerateFlow().catch(console.error);
