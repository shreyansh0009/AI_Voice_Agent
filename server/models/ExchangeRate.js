import mongoose from "mongoose";

/**
 * ExchangeRate Model
 * 
 * Stores the latest USD exchange rates fetched from exchangerate-api.com.
 * Updated once daily at midnight by the exchange rate cron job.
 */
const exchangeRateSchema = new mongoose.Schema({
    baseCurrency: {
        type: String,
        default: "USD",
        required: true,
    },
    rates: {
        INR: { type: Number, required: true },
    },
    lastUpdated: {
        type: Date,
        default: Date.now,
        required: true,
    },
}, {
    timestamps: true,
});

// There should only ever be one document in this collection
exchangeRateSchema.index({ baseCurrency: 1 }, { unique: true });

/**
 * Get the current INR rate (USD → INR)
 * Falls back to 85 if no rate exists
 */
exchangeRateSchema.statics.getINRRate = async function () {
    const doc = await this.findOne({ baseCurrency: "USD" });
    return doc?.rates?.INR || 85;
};

/**
 * Convert INR amount to USD
 */
exchangeRateSchema.statics.inrToUsd = async function (inrAmount) {
    const rate = await this.getINRRate();
    return parseFloat((inrAmount / rate).toFixed(6));
};

/**
 * Convert USD amount to INR
 */
exchangeRateSchema.statics.usdToInr = async function (usdAmount) {
    const rate = await this.getINRRate();
    return parseFloat((usdAmount * rate).toFixed(2));
};

const ExchangeRate = mongoose.model("ExchangeRate", exchangeRateSchema);
export default ExchangeRate;
