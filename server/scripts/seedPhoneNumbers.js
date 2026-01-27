/**
 * Seed Phone Numbers Script
 *
 * Initializes 16 phone numbers in the database:
 * - +91-7935459094 to +91-7935459109
 * - First number linked to Greeves Mobility agent
 *
 * Run: node server/scripts/seedPhoneNumbers.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

// Import models
import PhoneNumber from "../models/PhoneNumber.js";
import Agent from "../models/Agent.js";

// Configuration
const PHONE_NUMBERS = [
  { number: "917935459094", displayNumber: "+91-7935459094" },
  { number: "917935459095", displayNumber: "+91-7935459095" },
  { number: "917935459096", displayNumber: "+91-7935459096" },
  { number: "917935459097", displayNumber: "+91-7935459097" },
  { number: "917935459098", displayNumber: "+91-7935459098" },
  { number: "917935459099", displayNumber: "+91-7935459099" },
  { number: "917935459100", displayNumber: "+91-7935459100" },
  { number: "917935459101", displayNumber: "+91-7935459101" },
  { number: "917935459102", displayNumber: "+91-7935459102" },
  { number: "917935459103", displayNumber: "+91-7935459103" },
  { number: "917935459104", displayNumber: "+91-7935459104" },
  { number: "917935459105", displayNumber: "+91-7935459105" },
  { number: "917935459106", displayNumber: "+91-7935459106" },
  { number: "917935459107", displayNumber: "+91-7935459107" },
  { number: "917935459108", displayNumber: "+91-7935459108" },
  { number: "917935459109", displayNumber: "+91-7935459109" },
];

// Greeves Mobility agent ID (from didMapping.js)
const GREEVES_MOBILITY_AGENT_ID = "6969e3e23631b686605e290d";

async function seedPhoneNumbers() {
  console.log("═".repeat(50));
  console.log("📞 Phone Number Seeding Script");
  console.log("═".repeat(50));

  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI not found in environment variables");
    }

    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Check if Greeves Mobility agent exists
    let greevesAgent = null;
    try {
      greevesAgent = await Agent.findById(GREEVES_MOBILITY_AGENT_ID);
      if (greevesAgent) {
        console.log(`✅ Found Greeves Mobility agent: ${greevesAgent.name}`);
      }
    } catch (e) {
      console.log(
        "⚠️ Greeves Mobility agent not found, first number will remain unlinked",
      );
    }

    // Seed phone numbers
    console.log("\n📱 Seeding phone numbers...\n");

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < PHONE_NUMBERS.length; i++) {
      const { number, displayNumber } = PHONE_NUMBERS[i];

      // Check if already exists
      const existing = await PhoneNumber.findOne({ number });

      if (existing) {
        console.log(`⏭️  ${displayNumber} already exists (${existing.status})`);
        skipped++;
        continue;
      }

      // Create new phone number record
      const phoneData = {
        number,
        displayNumber,
        status: "available",
        linkedAgentId: null,
        linkedAgentName: null,
      };

      // Link first number to Greeves Mobility (if agent exists)
      if (i === 0 && greevesAgent) {
        phoneData.linkedAgentId = GREEVES_MOBILITY_AGENT_ID;
        phoneData.linkedAgentName = greevesAgent.name;
        phoneData.linkedAt = new Date();
        phoneData.status = "linked";
      }

      const newPhone = new PhoneNumber(phoneData);
      await newPhone.save();

      if (phoneData.status === "linked") {
        console.log(
          `✅ ${displayNumber} → Linked to ${phoneData.linkedAgentName}`,
        );
      } else {
        console.log(`✅ ${displayNumber} → Available`);
      }

      created++;
    }

    console.log("\n" + "═".repeat(50));
    console.log("📊 Summary:");
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped}`);
    console.log("═".repeat(50));

    // Display all phone numbers
    console.log("\n📋 All Phone Numbers:");
    const allNumbers = await PhoneNumber.find().sort({ number: 1 });
    for (const phone of allNumbers) {
      const status =
        phone.status === "linked"
          ? `🔗 ${phone.linkedAgentName}`
          : "✓ Available";
      console.log(`   ${phone.displayNumber} - ${status}`);
    }

    console.log("\n✅ Seeding complete!");
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
    process.exit(0);
  }
}

// Run the seed script
seedPhoneNumbers();
