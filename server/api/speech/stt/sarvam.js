import dotenv from "dotenv";
import multer from "multer";
import path from "path";
import fs from "fs";
import speechController from "../../../controllers/speechController.js";
import { authenticate } from "../../../middleware/authMiddleware.js";

// Load environment variables
dotenv.config();

// Configure Multer for audio uploads in serverless environment
const uploadsDir = "/tmp/uploads";

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".webm";
    cb(null, `audio-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

/**
 * Serverless function for Sarvam STT
 * Vercel endpoint: /api/speech/stt/sarvam
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

    // Apply multer middleware for file upload
    await new Promise((resolve, reject) => {
      upload.single("audio")(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Call the STT controller
    await speechController.transcribeSarvam(req, res);
  } catch (error) {
    console.error("Error in Sarvam STT serverless function:", error);

    if (!res.headersSent) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }
}
