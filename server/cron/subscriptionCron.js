/**
 * Subscription Expiry Cron Job
 * 
 * Runs daily to check for expired phone number subscriptions.
 * Expired numbers are unlinked from agents and returned to available pool.
 */

import cron from "node-cron";
import PhoneNumber from "../models/PhoneNumber.js";

/**
 * Process expired subscriptions
 * - Unlink from agent if linked
 * - Clear ownership fields
 * - Set status to available
 */
const processExpiredSubscriptions = async () => {
    try {
        const now = new Date();

        // Find all expired numbers (owned or linked with past expiry date)
        const expiredNumbers = await PhoneNumber.find({
            expiresAt: { $lt: now },
            status: { $in: ["owned", "linked"] }
        });

        if (expiredNumbers.length === 0) {
            console.log("📞 Subscription check: No expired numbers found");
            return;
        }

        console.log(`📞 Found ${expiredNumbers.length} expired phone number(s)`);

        for (const phone of expiredNumbers) {
            const previousOwner = phone.ownerId;
            const previousAgent = phone.linkedAgentName;

            // Clear all ownership and linking
            phone.ownerId = null;
            phone.linkedAgentId = null;
            phone.linkedAgentName = null;
            phone.linkedAt = null;
            phone.purchasedAt = null;
            phone.expiresAt = null;
            phone.status = "available";

            await phone.save();

            console.log(
                `📞 Expired: ${phone.displayNumber} ` +
                `(Owner: ${previousOwner || 'N/A'}, Agent: ${previousAgent || 'N/A'}) → Available`
            );
        }

        console.log(`📞 Processed ${expiredNumbers.length} expired subscription(s)`);
    } catch (error) {
        console.error("📞 Error processing expired subscriptions:", error);
    }
};

/**
 * Start the subscription expiry cron job
 * Runs daily at 00:00 (midnight)
 */
export const startSubscriptionCron = () => {
    // Run at midnight every day
    cron.schedule("0 0 * * *", async () => {
        console.log("📞 Running daily subscription expiry check...");
        await processExpiredSubscriptions();
    });

    console.log("📞 Subscription expiry cron job scheduled (daily at midnight)");
};

// Export for manual testing
export { processExpiredSubscriptions };
