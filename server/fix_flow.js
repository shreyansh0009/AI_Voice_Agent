import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Agent from "./models/Agent.js";

async function fixFlow() {
  await mongoose.connect(process.env.MONGODB_URI);

  const agent = await Agent.findOne().sort({ createdAt: -1 });

  if (agent && agent.flowData && agent.flowData.steps) {
    // Remove the first step if it looks like a rule
    if (agent.flowData.steps[0].originalText.includes("Smart Listening")) {
      console.log("Removing rule step...");
      agent.flowData.steps.shift(); // Remove first

      // Re-index
      agent.flowData.steps = agent.flowData.steps.map((s, i) => ({
        ...s,
        index: i,
      }));

      agent.markModified("flowData");
      await agent.save();
      console.log("Fixed flow steps:", agent.flowData.steps.length);
    }
  }
  process.exit(0);
}

fixFlow();
