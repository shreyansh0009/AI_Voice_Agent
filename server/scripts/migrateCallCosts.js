/**
 * Migration Script: Recalculate Call Costs
 * 
 * Run this script to recalculate costs for existing calls with the correct rates:
 * - Telephony: ₹0.5 per minute (was ₹0.05)
 * 
 * Usage: node scripts/migrateCallCosts.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// Cost configuration (same as Call model)
const TELEPHONY_COST_PER_MINUTE = 0.05; // INR per minute

// Calculate telephony cost
function calculateTelephonyCost(durationSeconds) {
    const minutes = Math.ceil(durationSeconds / 60);
    return parseFloat((minutes * TELEPHONY_COST_PER_MINUTE).toFixed(3));
}

async function migrateCallCosts() {
    try {
        console.log("🔄 Starting call cost migration...");
        console.log(`📊 New rate: ₹${TELEPHONY_COST_PER_MINUTE}/minute`);

        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Connected to MongoDB");

        // Get the calls collection
        const Call = mongoose.connection.collection("calls");

        // Find all calls
        const calls = await Call.find({}).toArray();
        console.log(`📞 Found ${calls.length} calls to migrate`);

        let updated = 0;
        let errors = 0;

        for (const call of calls) {
            try {
                const duration = call.duration || 0;
                const newTelephonyCost = calculateTelephonyCost(duration);

                // For existing calls, no LLM token data available, so total = telephony only
                const newTotalCost = newTelephonyCost;

                // Old cost (for logging)
                const oldCost = call.cost || 0;

                // Update the call
                await Call.updateOne(
                    { _id: call._id },
                    {
                        $set: {
                            telephonyCost: newTelephonyCost,
                            cost: newTotalCost,
                            llmTokens: { input: 0, output: 0 },
                            llmCostUSD: 0,
                        },
                    }
                );

                if (oldCost !== newTotalCost) {
                    console.log(`  📝 Call ${call.callId?.substring(0, 8) || call._id}: ${duration}s | ₹${oldCost?.toFixed(2) || 0} → ₹${newTotalCost.toFixed(2)}`);
                    updated++;
                }
            } catch (error) {
                console.error(`  ❌ Error updating call ${call._id}:`, error.message);
                errors++;
            }
        }

        console.log("\n" + "=".repeat(50));
        console.log("✅ Migration complete!");
        console.log(`   Updated: ${updated} calls`);
        console.log(`   Errors: ${errors} calls`);
        console.log(`   Total: ${calls.length} calls`);
        console.log("=".repeat(50));

    } catch (error) {
        console.error("❌ Migration failed:", error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 Disconnected from MongoDB");
    }
}

// Run migration
migrateCallCosts();
