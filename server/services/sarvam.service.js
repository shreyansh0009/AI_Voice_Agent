import { SarvamAIClient } from "sarvamai";
import axios from "axios"; // Keeping axios for TTS if needed, or if SDK doesn't cover it yet
import fs from "fs";

class SarvamService {
  constructor() {
    this.apiKey = process.env.SARVAM_API_KEY;

    if (!this.apiKey) {
      console.warn("⚠️  SARVAM_API_KEY not configured");
    } else {
      this.client = new SarvamAIClient({
        apiSubscriptionKey: this.apiKey,
      });
    }
  }

  /**
   * Transcribe audio using Sarvam AI SDK
   * @param {string} filePath - Path to the audio file
   * @param {string} languageCode - Language code (e.g., 'hi-IN', 'bn-IN')
   */
  async speechToText(filePath, languageCode) {
    if (!this.client) {
      throw new Error("Sarvam Client not initialized. Check API Key.");
    }

    try {
      console.log(`🎙️ Sending to Sarvam STT (SDK) (Lang: ${languageCode})...`);

      // Ensure format is like 'hi-IN'
      const code =
        languageCode && !languageCode.includes("-")
          ? `${languageCode}-IN`
          : languageCode || "hi-IN";

      // Read audio file
      // The SDK example shows passing a ReadStream.
      // Note: fs.createReadStream returns a ReadStream.
      const audioFile = fs.createReadStream(filePath);

      const response = await this.client.speechToText.transcribe({
        file: audioFile,
        language_code: code,
        model: "saarika:v2.5", // Updated model as per user snippet
      });

      console.log("✅ Sarvam STT Response:", response);

      // The response structure usually contains 'transcript' or 'results'.
      // Based on typical Sarvam API/SDK, it returns an object with 'transcript'.
      // If the SDK returns the raw API response body directly:
      return response.transcript || response;
    } catch (error) {
      console.error("❌ Sarvam STT Error:", error);
      throw new Error("Sarvam STT failed: " + (error.message || error));
    }
  }

  /**
   * Text to Speech
   * Keeping axios implementation for now as SDK snippet was only for STT
   */
  async textToSpeech(text, languageCode, speaker = "meera") {
    if (!this.apiKey) throw new Error("Sarvam API key not configured");

    try {
      const targetLang = languageCode.includes("-")
        ? languageCode
        : `${languageCode}-IN`;

      const response = await axios.post(
        "https://api.sarvam.ai/text-to-speech",
        {
          inputs: [text],
          target_language_code: targetLang,
          speaker: speaker,
          model: "bulbul:v1",
        },
        {
          headers: {
            "Content-Type": "application/json",
            "api-subscription-key": this.apiKey,
          },
        }
      );

      return response.data.audios[0];
    } catch (error) {
      console.error(
        "❌ Sarvam TTS Error:",
        error.response?.data || error.message
      );
      throw error;
    }
  }
}

export default new SarvamService();
