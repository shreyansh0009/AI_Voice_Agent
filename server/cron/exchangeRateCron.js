/**
 * Exchange Rate Cron Job
 * 
 * Fetches USD→INR exchange rate from exchangerate-api.com once daily at midnight.
 * Also runs once on server startup if rate is missing or stale (>24h old).
 * 
 * API Key: Free tier, 1500 requests/month. Rate updates once per 24h.
 */

import cron from "node-cron";
import ExchangeRate from "../models/ExchangeRate.js";

const API_KEY = process.env.EXCHANGE_RATE_API_KEY;
const API_URL = `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/USD`;

/**
 * Fetch and store the latest exchange rate
 */
const fetchExchangeRate = async () => {
    try {
        if (!API_KEY) {
            console.warn("⚠️  EXCHANGE_RATE_API_KEY not set. Using fallback rate.");
            return;
        }

        console.log("💱 Fetching latest exchange rate...");

        const response = await fetch(API_URL);
        const data = await response.json();

        if (data.result !== "success") {
            console.error("💱 API error:", data["error-type"] || "Unknown error");
            return;
        }

        const inrRate = data.conversion_rates?.INR;
        if (!inrRate) {
            console.error("💱 INR rate not found in API response");
            return;
        }

        // Upsert the exchange rate document
        await ExchangeRate.findOneAndUpdate(
            { baseCurrency: "USD" },
            {
                baseCurrency: "USD",
                rates: { INR: inrRate },
                lastUpdated: new Date(),
            },
            { upsert: true, new: true }
        );

        console.log(`💱 Exchange rate updated: 1 USD = ₹${inrRate}`);
    } catch (error) {
        console.error("💱 Error fetching exchange rate:", error.message);
    }
};

/**
 * Check if rate needs refresh (missing or >24h old)
 */
const shouldRefreshRate = async () => {
    const doc = await ExchangeRate.findOne({ baseCurrency: "USD" });
    if (!doc) return true;

    const hoursSinceUpdate = (Date.now() - doc.lastUpdated.getTime()) / (1000 * 60 * 60);
    return hoursSinceUpdate >= 24;
};

/**
 * Start the exchange rate cron job
 * - Runs daily at midnight (00:00)
 * - Also fetches on startup if stale
 */
export const startExchangeRateCron = async () => {
    // Fetch on startup if needed
    if (await shouldRefreshRate()) {
        await fetchExchangeRate();
    } else {
        const doc = await ExchangeRate.findOne({ baseCurrency: "USD" });
        console.log(`💱 Exchange rate cached: 1 USD = ₹${doc.rates.INR} (updated ${doc.lastUpdated.toISOString()})`);
    }

    // Schedule daily at midnight
    cron.schedule("0 0 * * *", async () => {
        console.log("💱 Running daily exchange rate update...");
        await fetchExchangeRate();
    });

    console.log("💱 Exchange rate cron job scheduled (daily at midnight)");
};

// Export for manual testing
export { fetchExchangeRate };
