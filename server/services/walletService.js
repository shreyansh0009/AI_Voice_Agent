/**
 * walletService.js
 *
 * Reusable wallet utility for server-side code (WebSocket handlers, cron jobs, etc.)
 * Does NOT depend on HTTP context — operates directly on the DB.
 *
 * All amounts are in USD (same as User.walletBalance).
 */

import User from '../models/User.js';
import Transaction from '../models/Transaction.js';

// Minimum balance required to start a call (in USD).
// ~$0.10 covers ~2 minutes of telephony + LLM tokens.
const MIN_BALANCE_USD = parseFloat(process.env.MIN_WALLET_BALANCE_USD || '0.10');

/**
 * Check if a user has enough wallet balance to start a call.
 *
 * @param {string} userId - MongoDB ObjectId string
 * @param {number} [minimum] - Override minimum balance (USD). Defaults to MIN_BALANCE_USD.
 * @returns {Promise<{ allowed: boolean, balance: number, required: number }>}
 */
export async function hasEnoughBalance(userId, minimum = MIN_BALANCE_USD) {
    if (!userId) {
        // No userId → can't check → allow (fail-open for unconfigured agents)
        return { allowed: true, balance: 0, required: minimum };
    }

    try {
        const user = await User.findById(userId).select('walletBalance').lean();
        if (!user) {
            console.warn(`[walletService] User not found: ${userId}`);
            return { allowed: false, balance: 0, required: minimum };
        }

        const balance = user.walletBalance || 0;
        const allowed = balance >= minimum;

        if (!allowed) {
            console.warn(
                `[walletService] Insufficient balance for user ${userId}: $${balance.toFixed(4)} < $${minimum.toFixed(4)}`
            );
        }

        return { allowed, balance, required: minimum };
    } catch (error) {
        console.error(`[walletService] Error checking balance:`, error.message);
        // Fail-open: don't block calls due to DB errors
        return { allowed: true, balance: 0, required: minimum };
    }
}

/**
 * Deduct call cost from user's wallet and create a Transaction debit record.
 * Safe to call even if cost is 0 (no-op).
 *
 * @param {string} userId   - MongoDB ObjectId string
 * @param {number} amountUSD - Cost in USD (from Call.calculateTotalCost)
 * @param {string} callId   - UUID of the call (for the transaction description)
 * @param {string} [description] - Human-readable description for the invoice
 * @returns {Promise<{ success: boolean, newBalance: number }>}
 */
export async function deductCallCost(userId, amountUSD, callId, description) {
    if (!userId || !amountUSD || amountUSD <= 0) {
        return { success: true, newBalance: null };
    }

    try {
        // Atomic increment to avoid race conditions
        const user = await User.findByIdAndUpdate(
            userId,
            { $inc: { walletBalance: -amountUSD } },
            { new: true }
        ).select('walletBalance');

        if (!user) {
            console.error(`[walletService] User not found for deduction: ${userId}`);
            return { success: false, newBalance: null };
        }

        // Create a debit Transaction so it appears in the Invoices tab
        await Transaction.create({
            userId,
            type: 'debit',
            amount: amountUSD,
            currency: 'USD',
            description: description || `Call ${callId?.substring(0, 8) || 'unknown'}`,
            status: 'completed',
            metadata: { callId },
        });

        console.log(
            `[walletService] Deducted $${amountUSD.toFixed(6)} for call ${callId?.substring(0, 8)}. New balance: $${user.walletBalance.toFixed(4)}`
        );

        return { success: true, newBalance: user.walletBalance };
    } catch (error) {
        console.error(`[walletService] Error deducting call cost:`, error.message);
        return { success: false, newBalance: null };
    }
}
