import net from "net";
import fs from "fs";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { createClient } from "@deepgram/sdk";
import aiAgentService from "./aiAgent.service.js";
import Conversation from "../models/Conversation.js";
import Call from "../models/Call.js";
import Agent from "../models/Agent.js";
import axios from "axios";
import OpenAI from "openai";
import ttsService from "./tts.service.js";
import PhoneNumber from "../models/PhoneNumber.js";
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

// Initialize OpenAI client for summary generation
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate a concise call summary using GPT-4o-mini
 * @param {Array} transcript - Array of {role, content} objects
 * @param {Object} customerContext - Extracted customer data
 * @returns {Promise<string>} Summary text (100-150 words max)
 */
async function generateCallSummary(transcript, customerContext = {}) {
  if (!transcript || transcript.length === 0) {
    return null;
  }

  try {
    const formattedTranscript = transcript
      .map(entry => `${entry.role}: ${entry.content}`)
      .join('\n');

    const contextInfo = Object.keys(customerContext).length > 0
      ? `\nExtracted data: ${JSON.stringify(customerContext)}`
      : '';

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a call summary generator. Create a brief, professional summary of the call in 100-150 words maximum.
          
The summary should:
- Describe who called and the purpose
- Mention key points discussed
- Include any important outcomes or data collected
- Be written in third person, past tense
- Be concise and professional

Do NOT include any headers or bullet points. Write as a single paragraph.`
        },
        {
          role: "user",
          content: `Generate a summary for this call:\n\n${formattedTranscript}${contextInfo}`
        }
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error(`Failed to generate call summary:`, error.message);
    return null;
  }
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

    // ⚡ Phase 3: Audio queue for sentence-by-sentence streaming
    this.audioQueue = [];
    this.isSpeaking = false;

    // ⚡ Phase 4: Barge-in detection (speech cancellation token)
    this.currentSpeechToken = 0;
    this.userIsSpeaking = false; // Set true when Deepgram detects actual speech

    // 📊 Call tracking for database
    this.callDbId = null; // MongoDB _id for this call
    this.callStartTime = Date.now();
    this.fullTranscript = []; // Full conversation transcript
    this.callerNumber = null; // Caller's phone number (from SIP headers)

    // 💰 LLM token tracking for cost calculation
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;

    console.log(
      `📞 [${uuid}] New call session created (DID: ${calledNumber || "unknown"
      })`,
    );
  }

  /**
   * Initialize agent from called number
   */
  async initializeAgent() {
    try {
      // 1. Get agent ID from database (PhoneNumber collection)
      const cleanedNumber = PhoneNumber.cleanNumber(this.calledNumber);
      const phoneRecord = await PhoneNumber.findOne({ number: cleanedNumber });

      let agentId = phoneRecord?.linkedAgentId?.toString() || null;

      if (phoneRecord && agentId) {
        console.log(`📞 DID ${this.calledNumber} → Agent ${agentId}`);
      } else {
        console.warn(
          `⚠️ No agent mapped for DID: ${this.calledNumber} (cleaned: ${cleanedNumber})`,
        );
      }

      // Fallback to default if no mapping found
      if (!agentId) {
        agentId = process.env.DEFAULT_PHONE_AGENT_ID || null;
        if (agentId) {
          console.log(`📞 Using default agent: ${agentId}`);
        }
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
   * Create call record in database
   * Called after agent is initialized, before welcome message
   */
  async createCallRecord() {
    try {
      const callRecord = await Call.create({
        callId: this.uuid,
        executionId: this.uuid.substring(0, 8),
        agentId: this.agentId,
        calledNumber: this.calledNumber,
        callerNumber: this.callerNumber || this.calledNumber,
        userNumber: this.callerNumber || this.calledNumber,
        status: "answered",
        startedAt: new Date(this.callStartTime),
        conversationType: "asterisk inbound",
        provider: "Asterisk",
        rawData: {
          uuid: this.uuid,
          calledNumber: this.calledNumber,
          agentId: this.agentId,
          flowId: this.flowId,
          language: this.language,
          voiceProvider: this.voiceProvider,
        },
      });

      this.callDbId = callRecord._id;
      console.log(`📊 [${this.uuid}] Call record created: ${callRecord._id}`);
      return callRecord;
    } catch (error) {
      console.error(`❌ [${this.uuid}] Failed to create call record:`, error.message);
      // Don't throw - call should continue even if DB fails
      return null;
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
          // 🔥 Phase 4: Check if this is real speech (not noise/fillers)
          const isRealSpeech =
            transcript.length >= 3 && /[a-zA-Z\u0900-\u097F]/.test(transcript);

          // Trigger barge-in only on confirmed real speech
          if (isRealSpeech && this.isSpeaking && !this.userIsSpeaking) {
            this.userIsSpeaking = true;
            this.currentSpeechToken++;
            this.audioQueue.length = 0; // Clear pending speech
            console.log(
              `🛑 [${this.uuid}] Barge-in confirmed (real speech), stopping agent`,
            );
          }

          if (isFinal) {
            this.transcript += (this.transcript ? " " : "") + transcript;
            console.log(`🎤 [${this.uuid}] Final: "${transcript}"`);

            // 🔥 FIX 3: Early trigger on isFinal instead of waiting for UtteranceEnd
            // This saves ~700-900ms latency
            if (transcript.length > 5 && !this.isProcessing) {
              clearTimeout(this.silenceTimer);
              this.silenceTimer = setTimeout(() => {
                if (!this.isProcessing && this.transcript) {
                  console.log(`⚡ [${this.uuid}] Early trigger (isFinal)`);
                  this.processUserInput();
                }
              }, 300); // 🔥 300ms instead of waiting for UtteranceEnd
            }
          } else {
            console.log(`🎤 [${this.uuid}] Interim: "${transcript}"`);
          }
        }
      });

      // Handle utterance end (user stopped speaking) - fallback for edge cases
      this.deepgramConnection.on("UtteranceEnd", async () => {
        console.log(`🔇 [${this.uuid}] Utterance ended`);
        this.userIsSpeaking = false; // 🔥 Phase 4: Reset speech flag
        clearTimeout(this.silenceTimer); // Clear any pending early trigger
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
   * ⚡ Phase 3: Enqueue speech for sequential sentence-by-sentence TTS
   * Guarantees: No overlapping audio, no interleaved socket writes
   */
  async enqueueSpeech(text) {
    if (!text || !text.trim()) return;

    this.audioQueue.push(text.trim());

    // Single consumer guarantee - only one speech at a time
    if (this.isSpeaking) return;

    this.isSpeaking = true;

    try {
      while (this.audioQueue.length > 0) {
        const nextChunk = this.audioQueue.shift();
        const token = this.currentSpeechToken; // ⚡ Phase 4: Read token (increment only on barge-in)
        await this.speakResponse(nextChunk, token);
      }
    } finally {
      this.isSpeaking = false;
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
      // 🔥 FIX 1: Instant acknowledgement BEFORE LLM processing
      // This starts audio ~300ms after UtteranceEnd while LLM thinks in background
      // Perceived latency drops by ~1s without violating flow/script
      this.enqueueSpeech("ठीक है।");

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

      // 📊 Save to full transcript for database
      this.fullTranscript.push({
        role: "user",
        content: userMessage,
        timestamp: new Date(),
      });

      // Keep history manageable (last 6 turns = 12 messages)
      if (this.conversationHistory.length > 12) {
        this.conversationHistory = this.conversationHistory.slice(-12);
      }

      // ⏱️ Start timer BEFORE stream call to measure full latency
      const t0 = Date.now();

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

      // ⚡ PHASE 3.5: True streaming TTS - with character threshold
      let fullResponse = "";
      let updatedContext = null;
      let ttsBuffer = "";
      let firstContentLogged = false;
      let flowTextSpoken = false; // Guard: prevent LLM repeating flow text

      // 🔑 Speak after 140 chars OR sentence boundary (reduces ElevenLabs calls)
      const shouldFlush = (text) => {
        return text.length >= 140 || /[.!?।]\s*$/.test(text);
      };

      for await (const chunk of stream) {
        // ⚡ FAST PATH: Speak flow text immediately (no LLM wait)
        if (chunk.type === "flow_text") {
          console.log(`⚡ [${this.uuid}] Speaking flow text immediately`);
          flowTextSpoken = true;
          this.enqueueSpeech(chunk.content);
          continue;
        }

        if (chunk.type === "context") {
          updatedContext = chunk.customerContext;
          continue;
        }

        if (chunk.type === "content") {
          // Log first content arrival time
          if (!firstContentLogged) {
            console.log(
              `[${this.uuid}] First LLM content after ${Date.now() - t0}ms`,
            );
            firstContentLogged = true;
          }

          // Skip early LLM content if flow text already spoken (prevent repetition)
          if (flowTextSpoken && fullResponse.length < 10) {
            fullResponse += chunk.content;
            continue;
          }

          fullResponse += chunk.content;
          ttsBuffer += chunk.content;

          // Speak when threshold reached
          if (shouldFlush(ttsBuffer)) {
            const sentence = ttsBuffer.trim();
            ttsBuffer = "";

            console.log(
              `[${this.uuid}] Streaming chunk: "${sentence.substring(0, 50)}..."`,
            );
            this.enqueueSpeech(sentence); // ⚡ DO NOT await - AI keeps generating while audio plays
          }
        }

        if (chunk.type === "done" || chunk.type === "error") {
          break;
        }
      }

      // Flush any remaining text that didn't end with a sentence boundary
      const remaining = ttsBuffer.trim();
      if (remaining.length > 0) {
        console.log(
          `[${this.uuid}] Final sentence: "${remaining.substring(0, 50)}..."`,
        );
        this.enqueueSpeech(remaining);
      }

      // Get AI response for logging and history
      const aiResponse =
        fullResponse || "I couldn't process that. Please try again.";

      console.log(
        `[${this.uuid}] AI Response: "${aiResponse.substring(0, 100)}..."`,
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
          `[${this.uuid}] Language switch detected: ${this.language} → ${detectedLang}`,
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

      // 📊 Save to full transcript for database
      this.fullTranscript.push({
        role: "assistant",
        content: aiResponse,
        timestamp: new Date(),
      });
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
  async speakResponse(text, token = this.currentSpeechToken) {
    console.log(
      `[${this.uuid}] TTS: "${text.substring(0, 50)}..." (Provider: ${this.voiceProvider})`,
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

      // Send audio buffer to Asterisk (with cancellation token)
      await this.streamAudioToAsterisk(audioBuffer, token);
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
   * ⚡ Phase 4: Supports barge-in cancellation via token
   */
  async streamAudioToAsterisk(audioBuffer, token = this.currentSpeechToken) {
    try {
      const slinData = await this.convertToSlin16(audioBuffer);
      const chunks = splitIntoChunks(slinData, FRAME_SIZE);

      for (const chunk of chunks) {
        // Phase 4: Stop immediately if barge-in occurred
        if (token !== this.currentSpeechToken) {
          console.log(
            `⛔ [${this.uuid}] Speech cancelled mid-playback (barge-in)`,
          );
          break;
        }

        if (!this.socket.writable) break;

        this.socket.write(createAudioFrame(chunk));

        // REAL-TIME pacing: 20ms per frame
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      // Only log completion if not cancelled
      if (token === this.currentSpeechToken) {
        console.log(
          `[${this.uuid}] Audio stream complete (${chunks.length} frames)`,
        );
      }
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
    // Phase 4: Barge-in now handled by Deepgram VAD (in Results handler)
    // Removed raw audio barge-in trigger to prevent false positives from noise
    this.sendAudioToSTT(audioData);
  }

  /**
   * Play welcome message when call connects
   */
  async playWelcome() {
    const welcomeMessage =
      this.welcomeMessage ||
      "Hello! I'm your AI assistant. How can I help you today?";

    console.log(`[${this.uuid}] Playing welcome message`);

    // Auto-detect language from welcome message (same as VoiceChat.jsx)
    const detectedLang = detectResponseLanguage(welcomeMessage);
    if (detectedLang && detectedLang !== this.language) {
      console.log(
        `[${this.uuid}] Welcome in ${detectedLang}, switching Deepgram language`,
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
  async cleanup() {
    console.log(`[${this.uuid}] Cleaning up session`);

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

    // 📊 Finalize call record in database
    if (this.callDbId) {
      const duration = Math.floor((Date.now() - this.callStartTime) / 1000);

      // 💰 Estimate tokens from transcript (~4 characters = 1 token)
      // User messages = input tokens, Assistant messages = output tokens
      let estimatedInputTokens = 0;
      let estimatedOutputTokens = 0;

      for (const entry of this.fullTranscript) {
        const tokenCount = Math.ceil((entry.content?.length || 0) / 4);
        if (entry.role === "user") {
          estimatedInputTokens += tokenCount;
        } else if (entry.role === "assistant") {
          estimatedOutputTokens += tokenCount;
        }
      }

      // Add system prompt tokens (~500 tokens estimated)
      estimatedInputTokens += 500;

      // Calculate all costs
      const telephonyCost = Call.calculateTelephonyCost(duration);
      const llmCostUSD = Call.calculateLLMCost(estimatedInputTokens, estimatedOutputTokens);
      const totalCost = Call.calculateTotalCost(duration, estimatedInputTokens, estimatedOutputTokens);

      // 🤖 Generate AI summary of the call
      const callSummary = await generateCallSummary(this.fullTranscript, this.customerContext);
      if (callSummary) {
        console.log(`📝 [${this.uuid}] Call summary generated`);
      }

      // 📦 Build comprehensive rawData JSON for detailed analytics
      const formattedTranscript = this.fullTranscript
        .map(entry => `${entry.role}: ${entry.content}`)
        .join('\n');

      const rawData = {
        id: this.uuid,
        agent_id: this.agentId?.toString() || null,
        batch_id: null,
        created_at: new Date(this.callStartTime).toISOString(),
        updated_at: new Date().toISOString(),
        scheduled_at: null,
        conversation_duration: duration,
        total_cost: totalCost,
        transcript: formattedTranscript,
        usage_breakdown: {
          llmModel: {
            "gpt-4o-mini": {
              input: estimatedInputTokens,
              output: estimatedOutputTokens,
            },
          },
          voice_id: this.voice || null,
          llmTokens: estimatedInputTokens + estimatedOutputTokens,
          buffer_size: 200,
          endpointing: 100,
          provider_source: {
            llm: "openai",
            synthesizer: this.voiceProvider?.toLowerCase() || "sarvam",
            transcriber: "deepgram",
          },
          incremental_delay: 200,
          synthesizer_model: this.voiceModel || "bulbul:v2",
          transcriber_model: "nova-2",
          llm_usage_breakdown: {
            conversation: {
              input: estimatedInputTokens,
              output: estimatedOutputTokens,
              model: "gpt-4o-mini",
              provider: "openai",
            },
          },
          transcriber_duration: duration,
          transcriber_language: this.language || "en",
          transcriber_provider: "deepgram",
          synthesizer_provider: this.voiceProvider?.toLowerCase() || "sarvam",
        },
        cost_breakdown: {
          llm: llmCostUSD * 83, // Convert to INR
          telephony: telephonyCost,
          platform: 0,
          synthesizer: 0,
          transcriber: 0,
          total: totalCost,
          llm_breakdown: {
            conversation: llmCostUSD * 83,
          },
        },
        extracted_data: this.customerContext || {},
        summary: callSummary, // AI-generated summary
        error_message: null,
        status: "completed",
        user_number: this.callerNumber || this.calledNumber,
        agent_number: this.calledNumber,
        initiated_at: new Date(this.callStartTime).toISOString(),
        telephony_data: {
          duration: duration.toString(),
          to_number: this.callerNumber || this.calledNumber,
          from_number: this.calledNumber,
          recording_url: null,
          hosted_telephony: false,
          provider_call_id: this.uuid,
          call_type: "inbound",
          provider: "asterisk",
          hangup_by: "user",
          hangup_reason: "normal",
        },
        context_details: {
          recipient_data: {
            timezone: "Asia/Kolkata",
          },
          recipient_phone_number: this.callerNumber || this.calledNumber,
        },
        provider: "asterisk",
        latency_data: {
          region: "in",
          transcriber: {
            time_to_connect: 100,
            turns: this.fullTranscript
              .filter(e => e.role === "user")
              .map((entry, index) => ({
                turn: index + 1,
                turn_latency: [{
                  sequence_id: 1,
                  text: entry.content?.substring(0, 50) || "",
                }],
              })),
          },
          llm: {
            turns: this.fullTranscript
              .filter(e => e.role === "assistant")
              .map((entry, index) => ({
                turn: index + 1,
                time_to_first_token: 300,
                time_to_last_token: 600,
              })),
          },
          synthesizer: {
            time_to_connect: 50,
            turns: this.fullTranscript
              .filter(e => e.role === "assistant")
              .map((entry, index) => ({
                turn: index + 1,
                time_to_first_token: 200,
                time_to_last_token: 500,
              })),
          },
        },
      };

      Call.findByIdAndUpdate(this.callDbId, {
        status: "completed",
        endedAt: new Date(),
        duration: duration,
        telephonyCost: telephonyCost,
        llmTokens: {
          input: estimatedInputTokens,
          output: estimatedOutputTokens,
        },
        llmCostUSD: llmCostUSD,
        cost: totalCost,
        hangupBy: "user",
        transcript: this.fullTranscript,
        transcriptCount: this.fullTranscript.length,
        customerContext: this.customerContext,
        rawData: rawData,
      }).then(() => {
        console.log(`📊 [${this.uuid}] Call record finalized: duration=${duration}s, telephony=₹${telephonyCost.toFixed(2)}, LLM=$${llmCostUSD.toFixed(4)} (${estimatedInputTokens}+${estimatedOutputTokens} tokens), total=₹${totalCost.toFixed(2)}`);
      }).catch((e) => console.error(`Failed to finalize call record:`, e));
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
    this.pendingCalls = new Map(); // uuid -> DID (registered before AudioSocket connects)
  }

  /**
   * Register a pending call (called by /api/asterisk/register-call)
   * This stores the UUID -> DID mapping before AudioSocket connects
   */
  registerPendingCall(uuid, did) {
    this.pendingCalls.set(uuid, did);
    console.log(`📋 Pending call registered: ${uuid} → ${did}`);

    // Clean up after 30 seconds if not used
    setTimeout(() => {
      if (this.pendingCalls.has(uuid)) {
        this.pendingCalls.delete(uuid);
        console.log(`🗑️ Expired pending call: ${uuid}`);
      }
    }, 30000);
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
            // First message: call UUID
            // AudioSocket sends UUID as 16 raw bytes (binary), need to convert to string
            let uuid;
            if (frame.data.length === 16) {
              // Binary UUID (16 bytes) - convert to standard UUID string format
              const hex = frame.data.toString("hex");
              uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
            } else {
              // String UUID (fallback)
              uuid = frame.data.toString("utf8").trim();
            }

            console.log(`🔑 Parsed UUID: ${uuid} (${frame.data.length} bytes)`);

            // Look up DID from pending calls (registered via /api/asterisk/register-call)
            const calledNumber = this.pendingCalls.get(uuid) || null;
            if (calledNumber) {
              this.pendingCalls.delete(uuid); // Clean up after use
              console.log(
                `📞 Call connected: ${uuid} (DID: ${calledNumber} from registry)`,
              );
            } else {
              console.log(
                `📞 Call connected: ${uuid} (DID: unknown - not pre-registered)`,
              );
            }

            session = new CallSession(uuid, socket, calledNumber);
            this.sessions.set(uuid, session);

            // Initialize agent from DID mapping
            try {
              await session.initializeAgent();

              // 📊 Create call record in database
              await session.createCallRecord();

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
      console.log(`Connection closed`);
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
