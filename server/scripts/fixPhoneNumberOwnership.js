/**
 * Migration Script: Fix Phone Number Ownership
 * 
 * This script updates existing phone numbers that are linked to agents
 * but don't have ownership fields set (ownerId, purchasedAt, expiresAt).
 * 
 * Run with: node scripts/fixPhoneNumberOwnership.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import PhoneNumber from "../models/PhoneNumber.js";
import Agent from "../models/Agent.js";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function fixPhoneNumberOwnership() {
    try {
        console.log("🔌 Connecting to MongoDB...");
        await mongoose.connect(MONGODB_URI);
        console.log("✅ Connected to MongoDB");

        // Find all linked phone numbers without ownership
        const numbersToFix = await PhoneNumber.find({
            status: "linked",
            $or: [
                { ownerId: null },
                { ownerId: { $exists: false } }
            ]
        }).populate("linkedAgentId");

        console.log(`📞 Found ${numbersToFix.length} phone number(s) to fix`);

        if (numbersToFix.length === 0) {
            console.log("✅ All phone numbers already have ownership set!");
            return;
        }

        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setMonth(expiresAt.getMonth() + 1);

        for (const phone of numbersToFix) {
            // Get the user who owns the agent
            const agent = await Agent.findById(phone.linkedAgentId).select("userId");

            if (!agent || !agent.userId) {
                console.log(`⚠️  Skipping ${phone.displayNumber} - no agent/user found`);
                continue;
            }

            // Update ownership fields
            phone.ownerId = agent.userId;
            phone.purchasedAt = now;
            phone.expiresAt = expiresAt;
            await phone.save();

            console.log(`✅ Fixed: ${phone.displayNumber} → Owner: ${agent.userId}, Expires: ${expiresAt.toISOString()}`);
        }

        console.log("\n🎉 Migration complete!");
        console.log(`   Fixed ${numbersToFix.length} phone number(s)`);
        console.log(`   All numbers now expire on: ${expiresAt.toDateString()}`);

    } catch (error) {
        console.error("❌ Migration failed:", error);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 Disconnected from MongoDB");
    }
}

// Run the migration
fixPhoneNumberOwnership();
