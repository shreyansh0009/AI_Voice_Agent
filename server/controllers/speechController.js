import sarvamService from "../services/sarvam.service.js";
import fs from "fs";

class SpeechController {
  /**
   * Handle Speech to Text request using Sarvam
   * POST /api/speech/stt/sarvam
   */
  async transcribeSarvam(req, res) {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "No audio file provided" });
      }

      const { language } = req.body;
      const filePath = req.file.path;

      console.log("🎤 Received audio for Sarvam STT:", {
        language,
        filePath,
        mimetype: req.file.mimetype,
      });

      // Call Sarvam Service
      const transcript = await sarvamService.speechToText(filePath, language);

      // Clean up uploaded file
      fs.unlink(filePath, (err) => {
        if (err) console.error("Error deleting temp file:", err);
      });

      res.json({
        success: true,
        transcript: transcript,
      });
    } catch (error) {
      console.error("Error in Sarvam transcription:", error);

      // Clean up uploaded file if exists
      if (req.file && req.file.path) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error("Error deleting temp file:", err);
        });
      }

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

export default new SpeechController();
