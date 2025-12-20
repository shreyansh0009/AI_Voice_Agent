import express from "express";
import multer from "multer";
import path from "path";
import speechController from "../controllers/speechController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Configure Multer for audio uploads
// Ensure uploads dir exists
import fs from "fs";
const uploadsDir =
  process.env.NODE_ENV === "production" || process.env.VERCEL
    ? "/tmp/uploads"
    : path.join(process.cwd(), "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Keep extension if possible, or default to .webm or .wav
    const ext = path.extname(file.originalname) || ".webm";
    cb(null, `audio-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// STT endpoint
// We intentionally don't require strict 'authenticate' if the client doesn't send token for public voice chat,
// but usually it should. Given VoiceChat.jsx sends other requests with token if available, we can make it optional or protected.
// For now, let's keep it open or check how VoiceChat.jsx handles auth.
// VoiceChat.jsx usually has Authorization header in fetch calls.
router.post(
  "/stt/sarvam",
  authenticate,
  upload.single("audio"),
  (req, res, next) => {
    speechController.transcribeSarvam(req, res).catch(next);
  }
);

// TTS endpoint for Tabbly
router.post("/tts/tabbly", authenticate, (req, res, next) => {
  console.log("🎯 Tabbly TTS route hit!", {
    method: req.method,
    path: req.path,
    body: req.body,
  });
  speechController.ttsWithTabbly(req, res).catch(next);
});

export default router;
