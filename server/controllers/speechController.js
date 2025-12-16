import sarvamService from "../services/sarvam.service.js";
import ttsService from "../services/tts.service.js";
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

  /**
   * Handle Text to Speech request using Tabbly
   * POST /api/speech/tts/tabbly
   */
  async ttsWithTabbly(req, res) {
    try {
      const { text, voice, model } = req.body;

      if (!text || text.trim() === "") {
        return res.status(400).json({
          success: false,
          error: "No text provided for TTS",
        });
      }

      console.log("🔊 Received TTS request for Tabbly:", {
        voice: voice || "Ashley",
        model: model || "tabbly-tts",
        textLength: text.length,
      });

      // Call TTS Service
      const audioBuffer = await ttsService.speakWithTabbly(
        text,
        voice,
        model
      );

      // Send audio buffer as WAV
      res.set({
        "Content-Type": "audio/wav",
        "Content-Length": audioBuffer.length,
      });
      res.send(audioBuffer);
    } catch (error) {
      console.error("Error in Tabbly TTS:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

export default new SpeechController();
