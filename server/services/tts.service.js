import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

class TTSService {
  constructor() {
    this.apiKey = process.env.SARVAM_API_KEY;
    this.model = "bulbul:v2";

    if (!this.apiKey) {
      console.error("❌ SARVAM_API_KEY not configured");
    }
  }

  // Language mapping (same as your frontend)
  languageMap = {
    en: "en-IN",
    hi: "hi-IN",
    ta: "ta-IN",
    te: "te-IN",
    kn: "kn-IN",
    ml: "ml-IN",
    bn: "bn-IN",
    mr: "mr-IN",
    gu: "gu-IN",
    pa: "pa-IN",
  };

  async speak(text, language = "en", voice = "aarti") {
    if (!text || text.trim() === "") return null;

    try {
      const targetLang =
        this.languageMap[language] || this.languageMap["en"];

      const response = await axios.post(
        "https://api.sarvam.ai/text-to-speech",
        {
          inputs: [text],
          target_language_code: targetLang,
          speaker: voice, // you were using selectedVoice
          model: this.model,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "api-subscription-key": this.apiKey,
          },
        }
      );

      // Return the raw base64 audio (this is what Exotel needs)
      const base64Audio = response.data.audios[0];

      return base64Audio;
    } catch (err) {
      console.error("❌ Sarvam TTS Error:", err.response?.data || err.message);
      throw new Error(
        err.response?.data?.message || "Sarvam TTS generation failed"
      );
    }
  }
}

export default new TTSService();
