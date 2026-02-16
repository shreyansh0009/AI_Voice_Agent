// Pricing configuration based on actual API costs per minute
// All base costs are in INR (Indian Rupees) - EXACT values from cost analysis
// They are converted to USD using the exchange rate from the API

export const PRICING_CONFIG = {
    // LLM Costs (INR per minute of conversation)
    // Based on 750-900 chars/min (~225 tokens/min)
    llm: {
        Openai: {
            "gpt-4o-mini": { inr: 0.04 },      // $0.15/1M input, $0.60/1M output
            "gpt-4.1-mini": { inr: 0.08 },     // $0.40/1M input, $1.60/1M output
            "gpt-3.5-turbo": { inr: 0.02 },    // Legacy model
        },
        Agentforce: {
            default: { inr: 0.05 },
        },
    },

    // STT (Speech-to-Text) Costs per minute (INR)
    stt: {
        Deepgram: {
            "nova-2": { inr: 0.40 },   // ₹0.40-0.42/min
            "nova-3": { inr: 0.70 },   // ₹0.70-0.73/min
            nova: { inr: 0.40 },
            base: { inr: 0.30 },
        },
        AssemblyAI: {
            default: { inr: 0.50 },
        },
        Google: {
            default: { inr: 0.60 },
        },
    },

    // TTS (Text-to-Speech) Costs per minute (INR)
    tts: {
        Sarvam: {
            bulbulv2: { inr: 0.55 },  // ₹0.55-1.20/min
            bulbulv1: { inr: 0.55 },
        },
        Tabbly: {
            "tabbly-tts": { inr: 0.81 },  // ₹0.81-0.85/min
        },
        ElevenLabs: {
            eleven_flash_v2_5: { inr: 4.95 },     // ₹4.95-5.98/min
            eleven_turbo_v2_5: { inr: 4.95 },
            eleven_turbo_v2: { inr: 5.98 },
            eleven_multilingual_v2: { inr: 19.80 }, // ₹19.80-23.76/min
            eleven_monolingual_v1: { inr: 13.76 },
        },
        Google: {
            standard: { inr: 0.40 },
            wavenet: { inr: 1.60 },
            neural2: { inr: 1.60 },
        },
        Azure: {
            neural: { inr: 1.60 },
            standard: { inr: 0.40 },
        },
    },

    // Fixed costs (INR per minute) - EXACT from spreadsheet
    telephony: { inr: 0.007 },       // ₹0.007/min (Telephony Cost)
    platform: { inr: 0.05 },         // ₹0.05/min (Server/VPS Cost)
    sentimentAnalysis: { inr: 0.015 }, // ₹0.015-0.018/min (Sentiment Analysis Cost)
    callSummary: { inr: 0.009 },      // ₹0.009/min (Call Summary Cost)
};

// Default fallback exchange rate
const FALLBACK_RATE = 85;

/**
 * Convert INR to USD
 */
function inrToUsd(inrAmount, exchangeRate) {
    return inrAmount / (exchangeRate || FALLBACK_RATE);
}

/**
 * Calculate total cost per minute based on selected configuration
 * @param {Object} config - Configuration object with provider/model selections
 * @param {number} exchangeRate - Current INR per USD exchange rate
 * @returns {Object} - Breakdown of costs in USD
 */
export function calculateCostPerMinute(config, exchangeRate = FALLBACK_RATE) {
    const {
        llmProvider,
        llmModel,
        transcriberProvider,
        transcriberModel,
        voiceProvider,
        voiceModel,
    } = config;

    // Get INR costs
    const llmInr =
        PRICING_CONFIG.llm[llmProvider]?.[llmModel]?.inr ||
        PRICING_CONFIG.llm[llmProvider]?.default?.inr ||
        0.04;

    const sttInr =
        PRICING_CONFIG.stt[transcriberProvider]?.[transcriberModel]?.inr ||
        PRICING_CONFIG.stt[transcriberProvider]?.default?.inr ||
        0.40;

    const ttsInr =
        PRICING_CONFIG.tts[voiceProvider]?.[voiceModel]?.inr ||
        PRICING_CONFIG.tts[voiceProvider]?.default?.inr ||
        0.55;

    const telephonyInr = PRICING_CONFIG.telephony.inr;
    const platformInr = PRICING_CONFIG.platform.inr;
    const sentimentInr = PRICING_CONFIG.sentimentAnalysis.inr;
    const summaryInr = PRICING_CONFIG.callSummary.inr;

    // Convert all to USD
    const stt = inrToUsd(sttInr, exchangeRate);
    const llm = inrToUsd(llmInr, exchangeRate);
    const tts = inrToUsd(ttsInr, exchangeRate);
    const telephony = inrToUsd(telephonyInr, exchangeRate);
    const platform = inrToUsd(platformInr, exchangeRate);
    const sentiment = inrToUsd(sentimentInr, exchangeRate);
    const summary = inrToUsd(summaryInr, exchangeRate);

    const total = stt + llm + tts + telephony + platform + sentiment + summary;

    return {
        stt,
        llm,
        tts,
        telephony,
        platform,
        sentiment,
        summary,
        total,
        // INR values for reference
        totalInr: sttInr + llmInr + ttsInr + telephonyInr + platformInr + sentimentInr + summaryInr,
        exchangeRate,
        // Calculate percentages for progress bar
        percentages: {
            stt: (stt / total) * 100,
            llm: (llm / total) * 100,
            tts: (tts / total) * 100,
            telephony: (telephony / total) * 100,
            platform: (platform / total) * 100,
            other: ((sentiment + summary) / total) * 100,
        },
    };
}
