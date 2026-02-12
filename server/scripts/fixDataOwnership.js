/**
 * Migration Script: Fix Data Ownership for Multi-Tenant Isolation
 * 
 * This script:
 * 1. Assigns userId to Calls that are missing it (from agentId.userId)
 * 2. Verifies phone number ownership is correctly set
 * 
 * Run with: node scripts/fixDataOwnership.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import Call from "../models/Call.js";
import Agent from "../models/Agent.js";
import PhoneNumber from "../models/PhoneNumber.js";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function fixCallOwnership() {
    console.log("\n📞 Fixing Call Ownership...");

    // Find calls without userId but with agentId
    const callsWithoutUser = await Call.find({
        $or: [
            { userId: null },
            { userId: { $exists: false } }
        ],
        agentId: { $exists: true, $ne: null }
    });

    console.log(`   Found ${callsWithoutUser.length} call(s) without userId`);

    let fixed = 0;
    let skipped = 0;

    for (const call of callsWithoutUser) {
        const agent = await Agent.findById(call.agentId).select("userId");

        if (agent && agent.userId) {
            call.userId = agent.userId;
            await call.save();
            fixed++;
        } else {
            skipped++;
        }
    }

    console.log(`   ✅ Fixed: ${fixed}, Skipped: ${skipped}`);
    return fixed;
}

async function fixPhoneNumberOwnership() {
    console.log("\n📱 Fixing Phone Number Ownership...");

    // Find phone numbers linked to agents but without ownerId
    const numbersWithoutOwner = await PhoneNumber.find({
        $or: [
            { ownerId: null },
            { ownerId: { $exists: false } }
        ],
        linkedAgentId: { $exists: true, $ne: null }
    });

    console.log(`   Found ${numbersWithoutOwner.length} phone number(s) without ownerId`);

    let fixed = 0;
    let skipped = 0;
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    for (const phone of numbersWithoutOwner) {
        const agent = await Agent.findById(phone.linkedAgentId).select("userId");

        if (agent && agent.userId) {
            phone.ownerId = agent.userId;

            // Also set subscription dates if missing
            if (!phone.purchasedAt) {
                phone.purchasedAt = now;
            }
            if (!phone.expiresAt) {
                phone.expiresAt = expiresAt;
            }

            await phone.save();
            console.log(`   ✅ Fixed: ${phone.displayNumber} → Owner: ${agent.userId}`);
            fixed++;
        } else {
            console.log(`   ⚠️  Skipped: ${phone.displayNumber} - no agent/user found`);
            skipped++;
        }
    }

    console.log(`   ✅ Fixed: ${fixed}, Skipped: ${skipped}`);
    return fixed;
}

async function generateOwnershipReport() {
    console.log("\n📊 Ownership Report...");

    // Calls by user
    const callsByUser = await Call.aggregate([
        { $match: { userId: { $exists: true, $ne: null } } },
        { $group: { _id: "$userId", count: { $sum: 1 } } }
    ]);

    // Calls without user
    const callsWithoutUser = await Call.countDocuments({
        $or: [
            { userId: null },
            { userId: { $exists: false } }
        ]
    });

    // Phones by owner
    const phonesByOwner = await PhoneNumber.aggregate([
        { $match: { ownerId: { $exists: true, $ne: null } } },
        { $group: { _id: "$ownerId", count: { $sum: 1 } } }
    ]);

    // Available phones
    const availablePhones = await PhoneNumber.countDocuments({ status: "available" });

    console.log(`\n   Calls:`);
    console.log(`   - Assigned to users: ${callsByUser.reduce((sum, u) => sum + u.count, 0)}`);
    console.log(`   - Without user (ORPHANED): ${callsWithoutUser}`);

    console.log(`\n   Phone Numbers:`);
    console.log(`   - Owned by users: ${phonesByOwner.reduce((sum, u) => sum + u.count, 0)}`);
    console.log(`   - Available for purchase: ${availablePhones}`);
}

async function main() {
    try {
        console.log("🔌 Connecting to MongoDB...");
        await mongoose.connect(MONGODB_URI);
        console.log("✅ Connected to MongoDB");

        const callsFixed = await fixCallOwnership();
        const phonesFixed = await fixPhoneNumberOwnership();

        await generateOwnershipReport();

        console.log("\n🎉 Migration Complete!");
        console.log(`   Calls fixed: ${callsFixed}`);
        console.log(`   Phone numbers fixed: ${phonesFixed}`);

    } catch (error) {
        console.error("❌ Migration failed:", error);
    } finally {
        await mongoose.disconnect();
        console.log("\n🔌 Disconnected from MongoDB");
    }
}

main();
