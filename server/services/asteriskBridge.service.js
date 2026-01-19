/**
 * Asterisk AudioSocket Bridge Service
 *
 * TCP server that handles AudioSocket connections from Asterisk.
 * Routes audio through: STT → AI Agent → TTS pipeline
 *
 * Architecture:
 * ┌─────────┐    ┌───────────────┐    ┌─────────┐    ┌────────┐    ┌─────┐
 * │ Phone   │◄──►│ Asterisk PBX  │◄──►│ This    │◄──►│ Chat   │◄──►│ TTS │
 * │         │    │ AudioSocket   │    │ Service │    │ V5     │    │     │
 * └─────────┘    └───────────────┘    └─────────┘    └────────┘    └─────┘
 */

import net from "net";
import fs from "fs";
import { fileURLToPath } from "url";
import { createClient } from "@deepgram/sdk";
import aiAgentService from "./aiAgent.service.js";
import Conversation from "../models/Conversation.js";
import Agent from "../models/Agent.js";
import axios from "axios";
import ttsService from "./tts.service.js";
import { getAgentIdForDID, getDefaultAgentId } from "../config/didMapping.js";
import {
  MESSAGE_TYPES,
  parseFrame,
  createAudioFrame,
  createSilenceFrame,
  splitIntoChunks,
} from "./audioProcessor.js";

// Configuration
const AUDIOSOCKET_PORT = parseInt(process.env.AUDIOSOCKET_PORT || "9092", 10);
const AUDIOSOCKET_HOST = process.env.AUDIOSOCKET_HOST || "0.0.0.0";
const DEFAULT_AGENT_ID = process.env.DEFAULT_PHONE_AGENT_ID || null;

// Audio settings
const SAMPLE_RATE = 8000; // 8kHz for telephony
const FRAME_SIZE = 320; // 20ms at 8kHz (320 bytes = 160 samples × 2 bytes)
const SILENCE_THRESHOLD_MS = 1500; // Silence duration to trigger processing

/**
 * Detect language from response text (same as streamChatController)
 * Used to dynamically switch Deepgram language
 */
function detectResponseLanguage(text) {
  if (!text || text.length < 10) return null;

  // Count Devanagari characters (Hindi)
  const devanagariPattern = /[\u0900-\u097F]/g;
  const devanagariMatches = text.match(devanagariPattern) || [];

  // Count Latin characters (English)
  const latinPattern = /[a-zA-Z]/g;
  const latinMatches = text.match(latinPattern) || [];

  const totalChars = devanagariMatches.length + latinMatches.length;
  if (totalChars < 10) return null;

  const hindiRatio = devanagariMatches.length / totalChars;

  // If more than 40% Hindi characters, consider it Hindi
  if (hindiRatio > 0.4) {
    return "hi";
  }

  return "en";
}

/**
 * Call Session - manages state for a single phone call
 */
class CallSession {
  constructor(uuid, socket, calledNumber = null) {
    this.uuid = uuid;
    this.socket = socket;
    this.calledNumber = calledNumber; // DID that was called
    this.conversationId = null;

    // Agent configuration (to be loaded)
    this.agentId = null;
    this.flowId = null;
    this.startStepId = null;
    this.agentConfig = {};
    this.welcomeMessage = null;
    this.personaPrompt = null; // Agent's persona/system prompt
    this.flow = null; // Store loaded flow
    this.language = "en";
    this.voice = "anushka"; // Agent's configured voice

    // Audio buffering
    this.audioBuffer = [];
    this.lastAudioTime = Date.now();
    this.isProcessing = false;
    this.silenceTimer = null;

    // Deepgram real-time connection
    this.deepgramConnection = null;
    this.transcript = "";
    this.isFinal = false;

    // Conversation state (for AI Agent Service - same as web chat)
    this.conversationHistory = [];
    this.customerContext = {};

    console.log(
      `📞 [${uuid}] New call session created (DID: ${
        calledNumber || "unknown"
      })`,
    );
  }

  /**
   * Initialize agent from called number
   */
  async initializeAgent() {
    try {
      // 1. Get agent ID from DID mapping
      let agentId = getAgentIdForDID(this.calledNumber);

      // Fallback to default if no mapping found
      if (!agentId) {
        agentId = getDefaultAgentId();
      }

      if (!agentId) {
        throw new Error(`No agent configured for DID: ${this.calledNumber}`);
      }

      // 2. Load agent from database
      const agent = await Agent.findById(agentId);

      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      console.log(`✅ [${this.uuid}] Loaded agent: ${agent.name} (${agentId})`);

      // 3. Load flow using fs.readFileSync (same as chatV5Controller)
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = import("path").then((p) => p.dirname(__filename));
      const flowPath = new URL(
        `../flows/${agent.flowId}.json`,
        import.meta.url,
      );
      const flowContent = fs.readFileSync(flowPath, "utf-8");
      const flow = JSON.parse(flowContent);

      if (!flow || !flow.startStep) {
        throw new Error(`Invalid flow: ${agent.flowId}`);
      }

      // 4. Store agent configuration and flow
      this.agentId = agentId;
      this.flowId = agent.flowId;
      this.startStepId = flow.startStep;
      this.flow = flow; // Store flow for processTurn
      this.agentConfig = agent.agentConfig || {};
      this.welcomeMessage =
        agent.welcome ||
        flow.steps?.greeting?.text?.en ||
        "Hello! How can I help you today?";
      this.language = agent.supportedLanguages?.[0] || "en";
      this.voice = agent.voice || "anushka"; // Use agent's configured voice
      this.personaPrompt = agent.personaPrompt || null; // Agent's persona/system prompt

      console.log(
        `📋 [${this.uuid}] Flow: ${this.flowId}, Start: ${this.startStepId}`,
      );

      return true;
    } catch (error) {
      console.error(
        `❌ [${this.uuid}] Failed to initialize agent:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Initialize Deepgram real-time STT connection
   */
  async initDeepgram() {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      console.error(`❌ [${this.uuid}] DEEPGRAM_API_KEY not configured`);
      return false;
    }

    try {
      const deepgram = createClient(apiKey);

      // Enhanced Deepgram settings for telephony with noise handling
      this.deepgramConnection = deepgram.listen.live({
        model: "nova-2", // Best model for noisy environments
        language: this.language === "hi" ? "hi" : "en-IN",
        encoding: "linear16",
        sample_rate: SAMPLE_RATE,
        channels: 1,
        // Noise handling & accuracy
        smart_format: true, // Better formatting
        punctuate: true, // Add punctuation
        filler_words: false, // Remove "um", "uh" etc
        profanity_filter: true, // Filter profanity
        numerals: true, // Convert numbers to digits
        // VAD and timing for telephony
        interim_results: true,
        utterance_end_ms: 1200, // Slightly longer for phone latency
        vad_events: true,
        endpointing: 400, // Longer endpointing for phone delays
      });

      // Handle transcription results
      this.deepgramConnection.on("Results", (data) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript || "";
        const isFinal = data.is_final;

        if (transcript) {
          if (isFinal) {
            this.transcript += (this.transcript ? " " : "") + transcript;
            console.log(`🎤 [${this.uuid}] Final: "${transcript}"`);
          } else {
            console.log(`🎤 [${this.uuid}] Interim: "${transcript}"`);
          }
        }
      });

      // Handle utterance end (user stopped speaking)
      this.deepgramConnection.on("UtteranceEnd", async () => {
        console.log(`🔇 [${this.uuid}] Utterance ended`);
        if (this.transcript && !this.isProcessing) {
          await this.processUserInput();
        }
      });

      this.deepgramConnection.on("Error", (error) => {
        console.error(`❌ [${this.uuid}] Deepgram error:`, error);
      });

      this.deepgramConnection.on("Close", () => {
        console.log(`🔌 [${this.uuid}] Deepgram connection closed`);
      });

      console.log(`✅ [${this.uuid}] Deepgram real-time STT initialized`);
      return true;
    } catch (error) {
      console.error(
        `❌ [${this.uuid}] Failed to init Deepgram:`,
        error.message,
      );
      return false;
    }
  }

  /**
   * Send audio to Deepgram for real-time transcription
   */
  sendAudioToSTT(audioData) {
    if (
      this.deepgramConnection &&
      this.deepgramConnection.getReadyState() === 1
    ) {
      this.deepgramConnection.send(audioData);
    }
  }

  /**
   * Process user input through AI agent (SAME as web chat)
   */
  async processUserInput() {
    if (this.isProcessing || !this.transcript) return;

    this.isProcessing = true;
    const userMessage = this.transcript.trim();
    this.transcript = "";

    console.log(`🧠 [${this.uuid}] Processing: "${userMessage}"`);

    try {
      // Add user message to conversation history
      this.conversationHistory.push({
        role: "user",
        content: userMessage,
      });

      // Keep history manageable (last 6 turns = 12 messages)
      if (this.conversationHistory.length > 12) {
        this.conversationHistory = this.conversationHistory.slice(-12);
      }

      // Process through AI Agent Service (SAME as web chat)
      const result = await aiAgentService.processMessage(
        userMessage,
        this.agentId,
        this.customerContext || {},
        this.conversationHistory,
        {
          // Pass same options as web chat
          language: this.language,
          systemPrompt: this.personaPrompt || "You are a helpful AI assistant.",
        },
      );

      // Get AI response
      const aiResponse =
        result.response ||
        result.text ||
        "I couldn't process that. Please try again.";

      console.log(
        `🤖 [${this.uuid}] AI Response: "${aiResponse.substring(0, 100)}..."`,
      );

      // Update customer context if returned
      if (result.customerContext) {
        this.customerContext = {
          ...this.customerContext,
          ...result.customerContext,
        };
      }

      // Auto-detect language from AI response (same as VoiceChat.jsx)
      const detectedLang = detectResponseLanguage(aiResponse);
      if (detectedLang && detectedLang !== this.language) {
        console.log(
          `🌐 [${this.uuid}] Language switch detected: ${this.language} → ${detectedLang}`,
        );
        this.language = detectedLang;

        // Reinitialize Deepgram with new language
        if (this.deepgramConnection) {
          this.deepgramConnection.finish();
          await this.initDeepgram();
        }
      }

      // Add AI response to conversation history
      this.conversationHistory.push({
        role: "assistant",
        content: aiResponse,
      });

      // Convert response to speech and send back
      await this.speakResponse(aiResponse);
    } catch (error) {
      console.error(`❌ [${this.uuid}] Processing error:`, error);
      await this.speakResponse(
        "Sorry, I encountered an error. Please try again.",
      );
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Convert text to speech and stream to Asterisk
   */
  async speakResponse(text) {
    console.log(`🔊 [${this.uuid}] TTS: "${text.substring(0, 50)}..."`);

    try {
      // Use existing TTS service with agent's configured voice
      const audioBase64 = await ttsService.speak(
        text,
        this.language,
        this.voice, // Use agent's configured voice
      );

      if (!audioBase64) {
        console.error(`❌ [${this.uuid}] No audio from TTS`);
        return;
      }

      // Convert base64 to buffer and send to Asterisk
      const audioBuffer = Buffer.from(audioBase64, "base64");
      await this.streamAudioToAsterisk(audioBuffer);
    } catch (error) {
      console.error(`❌ [${this.uuid}] TTS error:`, error.message);

      // Send silence instead of crashing
      const silence = createSilenceFrame(500);
      this.socket.write(silence);
    }
  }

  /**
   * Stream audio back to Asterisk via AudioSocket
   */
  async streamAudioToAsterisk(audioBuffer) {
    // TTS returns WAV - need to extract PCM and resample
    // Sarvam returns 22050Hz WAV, we need 8000Hz PCM for telephony

    // Skip WAV header (44 bytes) to get PCM data
    const pcmData = audioBuffer.slice(44);

    // Resample from 22050Hz to 8000Hz
    const resampledPCM = this.resampleAudio(pcmData, 22050, 8000);

    // Split into 20ms chunks (320 bytes at 8kHz = 160 samples × 2 bytes)
    const chunks = splitIntoChunks(resampledPCM, FRAME_SIZE);

    for (const chunk of chunks) {
      if (this.socket.writable) {
        const frame = createAudioFrame(chunk);
        this.socket.write(frame);

        // Pace the audio to real-time (20ms per frame)
        await new Promise((resolve) => setTimeout(resolve, 18));
      } else {
        console.log(
          `⚠️ [${this.uuid}] Socket not writable, stopping audio stream`,
        );
        break;
      }
    }

    console.log(
      `✅ [${this.uuid}] Audio stream complete (${chunks.length} chunks)`,
    );
  }

  /**
   * Resample PCM audio using linear interpolation
   * @param {Buffer} pcmBuffer - Input 16-bit PCM
   * @param {number} fromRate - Source sample rate (e.g., 22050)
   * @param {number} toRate - Target sample rate (e.g., 8000)
   * @returns {Buffer}
   */
  resampleAudio(pcmBuffer, fromRate, toRate) {
    if (fromRate === toRate) return pcmBuffer;

    const inputSamples = pcmBuffer.length / 2;
    const ratio = toRate / fromRate;
    const outputSamples = Math.floor(inputSamples * ratio);
    const output = Buffer.alloc(outputSamples * 2);

    for (let i = 0; i < outputSamples; i++) {
      const srcPos = i / ratio;
      const srcIndex = Math.floor(srcPos);
      const frac = srcPos - srcIndex;

      if (srcIndex >= inputSamples - 1) {
        output.writeInt16LE(
          pcmBuffer.readInt16LE((inputSamples - 1) * 2),
          i * 2,
        );
      } else {
        const sample1 = pcmBuffer.readInt16LE(srcIndex * 2);
        const sample2 = pcmBuffer.readInt16LE((srcIndex + 1) * 2);
        const interpolated = Math.round(sample1 + frac * (sample2 - sample1));
        output.writeInt16LE(
          Math.max(-32768, Math.min(32767, interpolated)),
          i * 2,
        );
      }
    }

    return output;
  }

  /**
   * Handle incoming audio from Asterisk
   */
  handleAudio(audioData) {
    this.lastAudioTime = Date.now();
    this.sendAudioToSTT(audioData);

    // Reset silence timer
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }

    this.silenceTimer = setTimeout(async () => {
      if (this.transcript && !this.isProcessing) {
        console.log(`⏱️ [${this.uuid}] Silence timeout, processing...`);
        await this.processUserInput();
      }
    }, SILENCE_THRESHOLD_MS);
  }

  /**
   * Play welcome message when call connects
   */
  async playWelcome() {
    const welcomeMessage =
      this.welcomeMessage ||
      "Hello! I'm your AI assistant. How can I help you today?";

    console.log(`👋 [${this.uuid}] Playing welcome message`);

    // Auto-detect language from welcome message (same as VoiceChat.jsx)
    const detectedLang = detectResponseLanguage(welcomeMessage);
    if (detectedLang && detectedLang !== this.language) {
      console.log(
        `🌐 [${this.uuid}] Welcome in ${detectedLang}, switching Deepgram language`,
      );
      this.language = detectedLang;

      // Reinitialize Deepgram with detected language
      if (this.deepgramConnection) {
        this.deepgramConnection.finish();
        await this.initDeepgram();
      }
    }

    await this.speakResponse(welcomeMessage);
  }

  /**
   * Clean up session
   */
  cleanup() {
    console.log(`🧹 [${this.uuid}] Cleaning up session`);

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }

    if (this.deepgramConnection) {
      try {
        this.deepgramConnection.finish();
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    // Log call end
    if (this.conversationId) {
      Conversation.findByIdAndUpdate(this.conversationId, {
        $set: {
          "metadata.callEndTime": new Date(),
          "metadata.callStatus": "completed",
        },
      }).catch((e) => console.error(`Failed to update conversation:`, e));
    }
  }
}

/**
 * AudioSocket Server
 */
class AudioSocketServer {
  constructor() {
    this.server = null;
    this.sessions = new Map(); // uuid -> CallSession
  }

  /**
   * Start the TCP server
   */
  start() {
    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    this.server.on("error", (error) => {
      console.error("❌ AudioSocket server error:", error);
    });

    this.server.listen(AUDIOSOCKET_PORT, AUDIOSOCKET_HOST, () => {
      console.log("═".repeat(50));
      console.log(
        `📞 AudioSocket Server listening on ${AUDIOSOCKET_HOST}:${AUDIOSOCKET_PORT}`,
      );
      console.log("═".repeat(50));
    });

    return this.server;
  }

  /**
   * Handle new connection from Asterisk
   */
  handleConnection(socket) {
    console.log(
      `🔗 New connection from ${socket.remoteAddress}:${socket.remotePort}`,
    );

    let session = null;
    let buffer = Buffer.alloc(0);

    socket.on("data", async (data) => {
      buffer = Buffer.concat([buffer, data]);

      // Parse frames from buffer
      while (true) {
        const frame = parseFrame(buffer);
        if (!frame) break;

        buffer = buffer.slice(frame.consumed);

        switch (frame.type) {
          case MESSAGE_TYPES.UUID:
            // First message: call UUID (format: uuid:calledNumber)
            const uuidData = frame.data.toString("utf8");
            const parts = uuidData.split(":");
            const uuid = parts[0];
            const calledNumber = parts[1] || null; // DID that was called

            console.log(
              `📞 Call connected: ${uuid} (DID: ${calledNumber || "unknown"})`,
            );

            session = new CallSession(uuid, socket, calledNumber);
            this.sessions.set(uuid, session);

            // Initialize agent from DID mapping
            try {
              await session.initializeAgent();

              // Initialize STT and play welcome
              await session.initDeepgram();
              await session.playWelcome();
            } catch (error) {
              console.error(`❌ Failed to initialize call: ${error.message}`);
              // Send error message and hang up
              socket.end();
              this.sessions.delete(uuid);
            }
            break;

          case MESSAGE_TYPES.AUDIO:
            // Audio frame from caller
            if (session) {
              session.handleAudio(frame.data);
            }
            break;

          case MESSAGE_TYPES.ERROR:
            console.error(
              `❌ AudioSocket error from Asterisk:`,
              frame.data.toString(),
            );
            break;

          default:
            console.warn(`⚠️ Unknown frame type: ${frame.type}`);
        }
      }
    });

    socket.on("close", () => {
      console.log(`📴 Connection closed`);
      if (session) {
        session.cleanup();
        this.sessions.delete(session.uuid);
      }
    });

    socket.on("error", (error) => {
      console.error(`❌ Socket error:`, error.message);
      if (session) {
        session.cleanup();
        this.sessions.delete(session.uuid);
      }
    });
  }

  /**
   * Stop the server
   */
  stop() {
    if (this.server) {
      this.server.close();
      console.log("📞 AudioSocket server stopped");
    }
  }

  /**
   * Get active call count
   */
  getActiveCallCount() {
    return this.sessions.size;
  }
}

// Singleton instance
const audioSocketServer = new AudioSocketServer();

export default audioSocketServer;
