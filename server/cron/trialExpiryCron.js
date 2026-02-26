import cron from "node-cron";
import { releaseExpiredTrials } from "../services/trialNumberService.js";

export const startTrialExpiryCron = () => {
  // Every minute
  cron.schedule("* * * * *", async () => {
    try {
      const result = await releaseExpiredTrials();
      if (result.releasedCount > 0) {
        console.log(
          `📞 Released ${result.releasedCount} expired trial number(s) at ${new Date().toISOString()}`,
        );
      }
    } catch (error) {
      console.error("📞 Trial expiry job failed:", error.message);
    }
  });

  console.log("📞 Trial expiry cron job scheduled (every minute)");
};
