import axios from "axios";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import dotenv from "dotenv";
dotenv.config();

class TTSService {
  constructor() {
    this.sarvamApiKey = process.env.SARVAM_API_KEY;
    this.tabblyApiKey = process.env.TABBLY_API_KEY;
    this.tabblyMemberId = process.env.TABBLY_MEMBER_ID;
    this.tabblyOrgId = process.env.TABBLY_ORGANIZATION_ID;
    this.elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    this.model = "bulbul:v3";
    this.defaultSarvamSpeaker = "shruti";
    this.defaultSarvamTemperature = 0.7;
    this.defaultSarvamPace = 1.0;
    this.defaultSarvamSampleRate = "16000";
    this.defaultSarvamCodec = "mp3";

    // Initialize ElevenLabs client if API key is available
    if (this.elevenLabsApiKey) {
      this.elevenLabsClient = new ElevenLabsClient({
        apiKey: this.elevenLabsApiKey,
      });
      console.log("✅ ElevenLabs client initialized");
    } else {
      console.error("❌ ELEVENLABS_API_KEY not configured");
    }

    if (!this.sarvamApiKey) {
      console.error("❌ SARVAM_API_KEY not configured");
    }
    if (!this.tabblyApiKey) {
      console.error("❌ TABBLY_API_KEY not configured");
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

  getOutputCodec() {
    return this.defaultSarvamCodec || "wav";
  }

  // Sarvam v2 voices (legacy)
  v2SupportedSpeakers = new Set([
    "anushka", "abhilash", "manisha", "vidya", "arya", "karun", "hitesh",
  ]);

  // Sarvam v3 voices (expanded set)
  v3SupportedSpeakers = new Set([
    "aditya", "ritu", "priya", "neha", "rahul", "pooja", "rohan", "simran", "kavya", "amit", "dev",
    "ishita", "shreya", "ratan", "varun", "manan", "sumit", "roopa", "kabir", "aayan", "shubh",
    "ashutosh", "advait", "amelia", "sophia", "anand", "tanya", "tarun", "sunny", "mani", "gokul",
    "vijay", "shruti", "suhani", "mohit", "kavitha", "rehan", "soham", "rupali",
  ]);

  async speak(text, language = "en", voice = null, model = null) {
    if (!text || text.trim() === "") return null;

    try {
      const targetLang = this.languageMap[language] || this.languageMap["en"];
      const normalizedText = text.trim();

      // Resolve model: use passed model, fall back to default
      const resolvedModel = model || this.model;
      const isV3 = resolvedModel.includes("v3");

      // Validate voice against the correct speaker set for the chosen model
      const supportedSpeakers = isV3 ? this.v3SupportedSpeakers : this.v2SupportedSpeakers;
      const defaultVoice = isV3 ? "shubh" : this.defaultSarvamSpeaker;
      const requestedVoice = (voice || defaultVoice).toLowerCase();
      const speaker = supportedSpeakers.has(requestedVoice)
        ? requestedVoice
        : defaultVoice;
      if (requestedVoice && speaker !== requestedVoice) {
        console.warn(`⚠️ Sarvam ${resolvedModel} speaker "${voice}" not supported. Falling back to "${speaker}".`);
      }

      console.log(`🔊 Sarvam TTS: model=${resolvedModel}, speaker=${speaker}, lang=${targetLang}`);

      const response = await axios.post(
        "https://api.sarvam.ai/text-to-speech",
        {
          text: normalizedText,
          target_language_code: targetLang,
          speaker,
          model: resolvedModel,
          pace: this.defaultSarvamPace,
          temperature: this.defaultSarvamTemperature,
          speech_sample_rate: this.defaultSarvamSampleRate,
          output_audio_codec: this.defaultSarvamCodec,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "api-subscription-key": this.sarvamApiKey,
          },
        },
      );

      // Return the raw base64 audio
      const base64Audio = response?.data?.audios?.[0] || null;
      if (!base64Audio) {
        throw new Error("Sarvam TTS returned no audio");
      }

      return base64Audio;
    } catch (err) {
      console.error("❌ Sarvam TTS Error:", err.response?.data || err.message);
      throw new Error(
        err.response?.data?.message || "Sarvam TTS generation failed",
      );
    }
  }

  /**
   * Generate speech using Tabbly AI
   * @param {string} text - Text to convert to speech
   * @param {string} voice - Voice ID (Ashley, Brian, Emma, James, Olivia, William)
   * @param {string} model - Model ID (default: tabbly-tts)
   * @returns {Buffer} Audio buffer (WAV format)
   */
  async speakWithTabbly(text, voice = "Ashley", model = "tabbly-tts") {
    if (!text || text.trim() === "") return null;

    try {
      if (!this.tabblyApiKey) {
        throw new Error("Tabbly API key not configured");
      }

      console.log(
        `🔊 Generating Tabbly TTS (Voice: ${voice}, Model: ${model})...`,
      );
      console.log(`📝 Text to convert: "${text.substring(0, 100)}..."`);

      // Prepare request body - DON'T send model_id, let API use default
      const requestBody = {
        text: text,
        voice_id: voice,
      };

      // Add member_id and organization_id if available
      if (this.tabblyMemberId) {
        requestBody.member_id = this.tabblyMemberId;
      }
      if (this.tabblyOrgId) {
        requestBody.organization_id = this.tabblyOrgId;
      }

      console.log("📤 Tabbly request body:", requestBody);

      const response = await axios.post(
        "https://api.tabbly.io/tts/stream",
        requestBody,
        {
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.tabblyApiKey,
          },
          responseType: "arraybuffer", // Get complete buffer for Express response
        },
      );

      const bufferSize = response.data.byteLength || response.data.length;
      console.log("✅ Tabbly TTS generated successfully", {
        bufferSize,
        contentType: response.headers["content-type"],
        status: response.status,
        statusText: response.statusText,
      });

      // If buffer is suspiciously small, log it as text to see if it's an error
      if (bufferSize < 1000) {
        console.warn("⚠️ Suspicious small audio buffer, converting to text:");
        const textResponse = Buffer.from(response.data).toString("utf8");
        console.warn(textResponse);
      }

      // Return the audio buffer
      return response.data;
    } catch (err) {
      console.error("❌ Tabbly TTS Error:", err.response?.data || err.message);
      throw new Error(
        err.response?.data?.message || "Tabbly TTS generation failed",
      );
    }
  }

  /**
   * Generate speech using ElevenLabs Official SDK
   * @param {string} text - Text to convert to speech
   * @param {string} voiceId - ElevenLabs Voice ID
   * @param {string} modelId - Model ID (eleven_multilingual_v2, eleven_turbo_v2, etc.)
   * @returns {Buffer} Audio buffer (MP3 format)
   */
  async speakWithElevenLabs(
    text,
    voiceId = "21m00Tcm4TlvDq8ikWAM",
    modelId = "eleven_multilingual_v2",
  ) {
    if (!text || text.trim() === "") return null;

    try {
      if (!this.elevenLabsClient) {
        throw new Error("ElevenLabs API key not configured");
      }

      console.log(
        `🔊 Generating ElevenLabs TTS (Voice: ${voiceId}, Model: ${modelId})...`,
      );
      console.log(`📝 Text to convert: "${text.substring(0, 100)}..."`);

      // Use official ElevenLabs SDK
      const audioStream = await this.elevenLabsClient.textToSpeech.convert(
        voiceId,
        {
          text: text,
          modelId: modelId,
          outputFormat: "mp3_44100_128",
        },
      );

      // Convert ReadableStream to Buffer
      const chunks = [];
      const reader = audioStream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      // Combine all chunks into a single Buffer
      const audioBuffer = Buffer.concat(
        chunks.map((chunk) => Buffer.from(chunk)),
      );

      console.log("✅ ElevenLabs TTS generated successfully", {
        bufferSize: audioBuffer.length,
        format: "mp3_44100_128",
      });

      return audioBuffer;
    } catch (err) {
      console.error("❌ ElevenLabs TTS Error:", err.message || err);
      throw new Error(err.message || "ElevenLabs TTS generation failed");
    }
  }
}

export default new TTSService();
