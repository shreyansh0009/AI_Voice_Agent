/**
 * Migration Script: Convert existing call costs from INR to USD
 * 
 * This script converts all existing call records' cost fields from INR to USD
 * using the current exchange rate from the API.
 * 
 * Run with: node --experimental-modules scripts/migrateCallCostsToUSD.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const MONGODB_URI = process.env.MONGODB_URI;
const EXCHANGE_RATE_API_KEY = process.env.EXCHANGE_RATE_API_KEY;

async function getExchangeRate() {
    try {
        const response = await fetch(
            `https://v6.exchangerate-api.com/v6/${EXCHANGE_RATE_API_KEY}/latest/USD`
        );
        const data = await response.json();
        if (data.result === "success" && data.conversion_rates?.INR) {
            return data.conversion_rates.INR;
        }
    } catch (err) {
        console.error("Failed to fetch exchange rate:", err.message);
    }
    return 85; // Fallback
}

async function migrate() {
    console.log("🔄 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Get current exchange rate
    const rate = await getExchangeRate();
    console.log(`💱 Exchange rate: 1 USD = ₹${rate}`);

    const callCollection = mongoose.connection.collection("calls");

    // Find all calls with cost > 0
    const calls = await callCollection.find({
        cost: { $gt: 0 }
    }).toArray();

    console.log(`📊 Found ${calls.length} calls with costs to convert`);

    if (calls.length === 0) {
        console.log("No calls to migrate.");
        await mongoose.disconnect();
        return;
    }

    let converted = 0;
    let skipped = 0;

    for (const call of calls) {
        const oldCost = call.cost;
        const oldTelephonyCost = call.telephonyCost || 0;

        // Skip if cost looks like it's already in USD (very small number)
        // INR costs are typically > 0.05, USD equivalent would be < 0.001
        if (oldCost < 0.005 && oldCost > 0) {
            console.log(`  ⏭️  Call ${call.callId}: $${oldCost} (already looks like USD, skipping)`);
            skipped++;
            continue;
        }

        // Convert INR to USD
        const newCost = parseFloat((oldCost / rate).toFixed(6));
        const newTelephonyCost = parseFloat((oldTelephonyCost / rate).toFixed(6));

        await callCollection.updateOne(
            { _id: call._id },
            {
                $set: {
                    cost: newCost,
                    telephonyCost: newTelephonyCost,
                    _costMigratedToUSD: true,
                    _originalCostINR: oldCost,
                    _migrationRate: rate,
                    _migratedAt: new Date(),
                },
            }
        );

        console.log(
            `  ✅ Call ${call.callId || call._id}: ₹${oldCost} → $${newCost} (telephony: ₹${oldTelephonyCost} → $${newTelephonyCost})`
        );
        converted++;
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`   Converted: ${converted}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Rate used: 1 USD = ₹${rate}`);

    // Also store the exchange rate in the ExchangeRate collection
    await mongoose.connection.collection("exchangerates").updateOne(
        { baseCurrency: "USD" },
        {
            $set: {
                baseCurrency: "USD",
                rates: { INR: rate },
                lastUpdated: new Date(),
            },
        },
        { upsert: true }
    );
    console.log(`💱 Exchange rate stored in database`);

    await mongoose.disconnect();
    console.log("✅ Migration complete!");
}

migrate().catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
});
