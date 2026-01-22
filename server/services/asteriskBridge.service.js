import net from "net";
import fs from "fs";
import { spawn } from "child_process";
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
  splitIntoChunks,
} from "./audioProcessor.js";

// Configuration
const AUDIOSOCKET_PORT = parseInt(process.env.AUDIOSOCKET_PORT || "9092", 10);
const AUDIOSOCKET_HOST = process.env.AUDIOSOCKET_HOST || "0.0.0.0";
const DEFAULT_AGENT_ID = process.env.DEFAULT_PHONE_AGENT_ID || null;

// Audio settings for 8kHz telephony (standard)
const SAMPLE_RATE = 8000; // 8kHz for telephony
const FRAME_SIZE = 320; // 20ms at 8kHz slin16 (320 bytes = 160 samples × 2 bytes)
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
    this.systemPrompt = null; // Agent's full script (same as web)
    this.flow = null; // Store loaded flow
    this.language = "en";
    this.voice = "anushka"; // Agent's configured voice
    this.voiceProvider = "Sarvam"; // Default TTS provider (Sarvam, ElevenLabs, Tabbly)
    this.voiceModel = "bulbul:v2"; // Default voice model

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
      this.voiceProvider = agent.voiceProvider || "Sarvam"; // TTS provider from agent config
      this.voiceModel = agent.voiceModel || "bulbul:v2"; // Voice model from agent config
      // Use agent.prompt (FULL SCRIPT) - same as web chat passes to VoiceChat
      this.systemPrompt = agent.prompt || "You are a helpful AI assistant.";

      console.log(
        `🔊 [${this.uuid}] TTS Config: Provider=${this.voiceProvider}, Voice=${this.voice}, Model=${this.voiceModel}`,
      );

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

      // Deepgram settings for 8kHz telephony
      this.deepgramConnection = deepgram.listen.live({
        model: "nova-2",
        language: this.language === "hi" ? "hi" : "en-IN",
        encoding: "linear16",
        sample_rate: 8000, // 8kHz for standard telephony
        channels: 1,
        smart_format: true,
        punctuate: true,
        interim_results: true,
        utterance_end_ms: 1200, // Triggers UtteranceEnd event
        vad_events: true,
        endpointing: 400,
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
   * Check if message is a "check-in" phrase (hello? are you there?)
   * User is checking if agent is still listening, not asking a new question
   */
  isCheckInPhrase(message) {
    const lowerMessage = message.toLowerCase().trim();

    // Check-in phrases in English and Hindi
    const checkInPhrases = [
      "hello",
      "hello?",
      "hello hello",
      "hi",
      "hi?",
      "hey",
      "hey?",
      "are you there",
      "are you there?",
      "you there",
      "you there?",
      "can you hear me",
      "can you hear me?",
      "anyone there",
      "anyone there?",
      "हेलो",
      "हैलो",
      "सुन रहे हो",
      "क्या आप सुन रहे हैं",
    ];

    // Check if message matches any check-in phrase
    return checkInPhrases.some(
      (phrase) =>
        lowerMessage === phrase ||
        lowerMessage === phrase + "?" ||
        lowerMessage.replace(/\?+/g, "") === phrase,
    );
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
      // Check for "check-in" phrases (hello? are you there? etc.)
      // These should get a quick acknowledgment, not restart the flow
      if (this.isCheckInPhrase(userMessage)) {
        console.log(
          `👋 [${this.uuid}] Check-in phrase detected, quick response`,
        );
        await this.speakResponse("जी हाँ, मैं यहाँ हूँ। कृपया बताइए।");
        this.isProcessing = false;
        return;
      }

      // Add user message to conversation history
      this.conversationHistory.push({
        role: "user",
        content: userMessage,
      });

      // Keep history manageable (last 6 turns = 12 messages)
      if (this.conversationHistory.length > 12) {
        this.conversationHistory = this.conversationHistory.slice(-12);
      }

      // Process through AI Agent Service - USE STREAMING (SAME as web chat!)
      // This is the key fix: web uses processMessageStream, so phone must too
      const stream = await aiAgentService.processMessageStream(
        userMessage,
        this.agentId,
        this.customerContext || {},
        this.conversationHistory,
        {
          // Pass same options as web chat
          language: this.language,
          systemPrompt: this.systemPrompt, // Full script (same as web)
        },
      );

      // ⚡ PHASE 2: Speak first sentence immediately while LLM continues
      let fullResponse = "";
      let updatedContext = null;
      let firstSentenceSpoken = false;
      let buffer = "";

      // Sentence boundary pattern (English: . ? ! and Hindi: ।)
      const sentenceBoundary = /[.?!।]/;

      for await (const chunk of stream) {
        if (chunk.type === "context") {
          updatedContext = chunk.customerContext;
          continue;
        }

        if (chunk.type === "content") {
          fullResponse += chunk.content;
          buffer += chunk.content;

          // ⚡ LATENCY OPTIMIZATION: Speak first sentence immediately
          if (!firstSentenceSpoken) {
            const match = buffer.match(sentenceBoundary);

            // Fire TTS if: sentence boundary found OR buffer > 60 chars
            if (match || buffer.length > 60) {
              let firstSentence;

              if (match) {
                // Extract first complete sentence
                const boundaryIndex = buffer.search(sentenceBoundary);
                firstSentence = buffer.substring(0, boundaryIndex + 1).trim();
              } else {
                // No sentence boundary, but buffer is long enough
                // Find a natural break point (space after 40+ chars)
                const breakPoint = buffer.indexOf(" ", 40);
                if (breakPoint > 0) {
                  firstSentence = buffer.substring(0, breakPoint).trim();
                }
              }

              if (firstSentence && firstSentence.length > 10) {
                console.log(
                  `⚡ [${this.uuid}] Speaking first sentence immediately: "${firstSentence.substring(0, 50)}..."`,
                );

                // Fire TTS without awaiting - let it run in parallel
                this.speakResponse(firstSentence).catch((err) => {
                  console.error(
                    `❌ [${this.uuid}] First sentence TTS error:`,
                    err.message,
                  );
                });

                firstSentenceSpoken = true;
              }
            }
          }
        }

        if (chunk.type === "done" || chunk.type === "error") {
          break;
        }
      }

      // Get AI response
      const aiResponse =
        fullResponse || "I couldn't process that. Please try again.";

      console.log(
        `🤖 [${this.uuid}] AI Response: "${aiResponse.substring(0, 100)}..."`,
      );

      // Update customer context if returned
      if (updatedContext) {
        this.customerContext = {
          ...this.customerContext,
          ...updatedContext,
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

      // ⚡ If first sentence was already spoken, speak remaining text
      // Otherwise speak the full response
      if (firstSentenceSpoken && buffer.length > 0) {
        // Find where we stopped speaking
        const match = buffer.match(sentenceBoundary);
        if (match) {
          const boundaryIndex = buffer.search(sentenceBoundary);
          const remaining = buffer.substring(boundaryIndex + 1).trim();
          if (remaining.length > 5) {
            console.log(
              `🔊 [${this.uuid}] Speaking remaining text: "${remaining.substring(0, 50)}..."`,
            );
            await this.speakResponse(remaining);
          }
        }
      } else if (!firstSentenceSpoken) {
        // No first sentence was spoken, speak full response
        await this.speakResponse(aiResponse);
      }
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
    console.log(
      `🔊 [${this.uuid}] TTS: "${text.substring(0, 50)}..." (Provider: ${this.voiceProvider})`,
    );

    try {
      let audioBuffer;

      // Route to appropriate TTS provider based on agent configuration
      if (this.voiceProvider === "ElevenLabs") {
        // Use ElevenLabs TTS
        audioBuffer = await ttsService.speakWithElevenLabs(
          text,
          this.voice, // ElevenLabs voice ID
          this.voiceModel || "eleven_multilingual_v2",
        );
      } else if (this.voiceProvider === "Tabbly") {
        // Use Tabbly TTS
        audioBuffer = await ttsService.speakWithTabbly(
          text,
          this.voice,
          this.voiceModel || "tabbly-tts",
        );
      } else {
        // Default to Sarvam TTS (returns base64)
        const audioBase64 = await ttsService.speak(
          text,
          this.language,
          this.voice,
        );
        if (audioBase64) {
          audioBuffer = Buffer.from(audioBase64, "base64");
        }
      }

      if (!audioBuffer) {
        console.error(
          `❌ [${this.uuid}] No audio from TTS (${this.voiceProvider})`,
        );
        return;
      }

      // Send audio buffer to Asterisk
      await this.streamAudioToAsterisk(audioBuffer);
    } catch (error) {
      console.error(
        `❌ [${this.uuid}] TTS error (${this.voiceProvider}):`,
        error.message,
      );

      // Send µ-law silence instead of crashing
      this.sendSilence(500);
    }
  }

  /**
   * Convert WAV to slin16 8kHz using ffmpeg
   * @param {Buffer} wavBuffer - Input WAV audio
   * @returns {Promise<Buffer>} - Raw signed 16-bit PCM data
   */
  async convertToSlin16(wavBuffer) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(
        "ffmpeg",
        [
          "-i",
          "pipe:0", // Input from stdin
          "-ar",
          "8000", // Resample to 8kHz for telephony
          "-ac",
          "1", // Mono
          "-acodec",
          "pcm_s16le", // Signed 16-bit little-endian (slin16)
          "-f",
          "s16le", // Raw s16le output (no container)
          "pipe:1", // Output to stdout
        ],
        {
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      const chunks = [];

      ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
      ffmpeg.stderr.on("data", (data) => {
        // FFmpeg logs to stderr, ignore unless error
      });

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      ffmpeg.on("error", (err) => {
        reject(err);
      });

      // Write WAV data to ffmpeg stdin
      ffmpeg.stdin.write(wavBuffer);
      ffmpeg.stdin.end();
    });
  }

  /**
   * Send µ-law silence frames
   * @param {number} ms - Duration in milliseconds
   */
  sendSilence(ms = 200) {
    const frames = Math.ceil(ms / 20);
    const silenceFrame = Buffer.alloc(FRAME_SIZE, 0x00); // 0x00 is slin16 silence

    for (let i = 0; i < frames; i++) {
      if (this.socket.writable) {
        this.socket.write(createAudioFrame(silenceFrame));
      }
    }
  }

  /**
   * Stream audio back to Asterisk via AudioSocket
   * Uses ffmpeg to convert WAV → slin16 8kHz
   * REAL-TIME pacing: 20ms per frame (matches telephony clocking)
   */
  async streamAudioToAsterisk(audioBuffer) {
    try {
      const slinData = await this.convertToSlin16(audioBuffer);
      const chunks = splitIntoChunks(slinData, FRAME_SIZE);

      for (const chunk of chunks) {
        if (!this.socket.writable) break;

        this.socket.write(createAudioFrame(chunk));

        // REAL-TIME pacing: 20ms per frame
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      console.log(
        `✅ [${this.uuid}] Audio stream complete (${chunks.length} frames)`,
      );
    } catch (error) {
      console.error(`❌ [${this.uuid}] Audio streaming failed:`, error.message);
      this.sendSilence(200);
    }
  }

  /**
   * Handle incoming audio from Asterisk
   */
  handleAudio(audioData) {
    this.lastAudioTime = Date.now();
    this.sendAudioToSTT(audioData);
    // ⚡ LATENCY FIX: Removed local silence timer
    // Only Deepgram's UtteranceEnd event triggers processing now
    // This eliminates ~1.5s of double-wait latency
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
