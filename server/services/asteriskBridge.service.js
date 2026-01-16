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
import { createClient } from "@deepgram/sdk";
import stateEngine from "./stateEngine.js";
import Conversation from "../models/Conversation.js";
import Agent from "../models/Agent.js";
import axios from "axios";
import ttsService from "./tts.service.js";
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
 * Call Session - manages state for a single phone call
 */
class CallSession {
  constructor(uuid, socket) {
    this.uuid = uuid;
    this.socket = socket;
    this.conversationId = null;
    this.agentId = DEFAULT_AGENT_ID;
    this.language = "en";

    // Audio buffering
    this.audioBuffer = [];
    this.lastAudioTime = Date.now();
    this.isProcessing = false;
    this.silenceTimer = null;

    // Deepgram real-time connection
    this.deepgramConnection = null;
    this.transcript = "";
    this.isFinal = false;

    console.log(`📞 [${uuid}] New call session created`);
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

      this.deepgramConnection = deepgram.listen.live({
        model: "nova-2",
        language: this.language === "hi" ? "hi" : "en-IN",
        encoding: "linear16",
        sample_rate: SAMPLE_RATE,
        channels: 1,
        smart_format: true,
        interim_results: true,
        utterance_end_ms: 1000,
        vad_events: true,
        endpointing: 300,
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
        error.message
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
   * Process user input through AI agent
   */
  async processUserInput() {
    if (this.isProcessing || !this.transcript) return;

    this.isProcessing = true;
    const userMessage = this.transcript.trim();
    this.transcript = "";

    console.log(`🧠 [${this.uuid}] Processing: "${userMessage}"`);

    try {
      // Get or create conversation
      let conversation = this.conversationId
        ? await Conversation.findById(this.conversationId)
        : null;

      if (!conversation) {
        // Create new conversation for phone call
        conversation = new Conversation({
          agentId: this.agentId,
          phoneCallId: this.uuid,
          channel: "phone",
          metadata: {
            phoneNumber: "unknown", // Could be passed from Asterisk
            callStartTime: new Date(),
          },
        });
        await conversation.save();
        this.conversationId = conversation._id;
        console.log(
          `📝 [${this.uuid}] Created conversation: ${this.conversationId}`
        );
      }

      // Load agent configuration
      const agent = this.agentId ? await Agent.findById(this.agentId) : null;

      // Process through state engine
      const result = await stateEngine.processTurn({
        conversation,
        flow: agent?.flow || null,
        userMessage,
        agentConfig: agent?.config || {},
      });

      // Get AI response
      const aiResponse =
        result.response || "I couldn't process that. Please try again.";
      console.log(
        `🤖 [${this.uuid}] AI Response: "${aiResponse.substring(0, 100)}..."`
      );

      // Apply patches to conversation
      if (result.patches) {
        await Conversation.findByIdAndUpdate(
          this.conversationId,
          { $set: result.patches },
          { new: true }
        );
      }

      // Convert response to speech and send back
      await this.speakResponse(aiResponse);
    } catch (error) {
      console.error(`❌ [${this.uuid}] Processing error:`, error);
      await this.speakResponse(
        "Sorry, I encountered an error. Please try again."
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
      // Use existing TTS service (works with Sarvam)
      const audioBase64 = await ttsService.speak(text, this.language, "meera");

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
    // TTS returns WAV - need to extract PCM and potentially resample
    // Sarvam returns 22050Hz WAV, we need 8000Hz PCM for telephony

    // Skip WAV header (44 bytes) to get PCM data
    const pcmData = audioBuffer.slice(44);

    // Split into 20ms chunks (320 bytes at 8kHz)
    const chunks = splitIntoChunks(pcmData, FRAME_SIZE);

    for (const chunk of chunks) {
      if (this.socket.writable) {
        const frame = createAudioFrame(chunk);
        this.socket.write(frame);

        // Pace the audio to real-time (20ms per frame)
        await new Promise((resolve) => setTimeout(resolve, 18)); // Slightly less than 20ms for network
      } else {
        console.log(
          `⚠️ [${this.uuid}] Socket not writable, stopping audio stream`
        );
        break;
      }
    }

    console.log(
      `✅ [${this.uuid}] Audio stream complete (${chunks.length} chunks)`
    );
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
    const agent = this.agentId ? await Agent.findById(this.agentId) : null;
    const welcomeMessage =
      agent?.welcomeMessage ||
      "Hello! I'm your AI assistant. How can I help you today?";

    console.log(`👋 [${this.uuid}] Playing welcome message`);
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
        `📞 AudioSocket Server listening on ${AUDIOSOCKET_HOST}:${AUDIOSOCKET_PORT}`
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
      `🔗 New connection from ${socket.remoteAddress}:${socket.remotePort}`
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
            // First message: call UUID
            const uuid = frame.data.toString("utf8");
            console.log(`📞 Call connected: ${uuid}`);

            session = new CallSession(uuid, socket);
            this.sessions.set(uuid, session);

            // Initialize STT and play welcome
            await session.initDeepgram();
            await session.playWelcome();
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
              frame.data.toString()
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
