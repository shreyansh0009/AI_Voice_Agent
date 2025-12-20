import dotenv from "dotenv";
import speechController from "../../../controllers/speechController.js";
import { authenticate } from "../../../middleware/authMiddleware.js";

// Load environment variables
dotenv.config();

/**
 * Serverless function for Tabbly TTS
 * Vercel endpoint: /api/speech/tts/tabbly
 */
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST method
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed. Use POST.",
    });
  }

  try {
    // Apply authentication middleware
    await new Promise((resolve, reject) => {
      authenticate(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Call the TTS controller
    await speechController.ttsWithTabbly(req, res);
  } catch (error) {
    console.error("Error in Tabbly TTS serverless function:", error);

    if (!res.headersSent) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }
}
