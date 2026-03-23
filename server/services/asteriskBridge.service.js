import net from "net";
import fs from "fs";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { createClient } from "@deepgram/sdk";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import aiAgentService from "./aiAgent.service.js";
import Conversation from "../models/Conversation.js";
import Call from "../models/Call.js";
import Agent from "../models/Agent.js";
import axios from "axios";
import OpenAI from "openai";
import ttsService from "./tts.service.js";
import recordingService from "./recording.service.js";
import PhoneNumber from "../models/PhoneNumber.js";
import { hasEnoughBalance, deductCallCost } from "./walletService.js";
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

// Audio settings for AudioSocket telephony
const SAMPLE_RATE = 8000; // AudioSocket() app expects 8kHz PCM
const FRAME_SIZE = 320; // 20ms at 8kHz slin16 (320 bytes = 160 samples × 2 bytes)
const SILENCE_THRESHOLD_MS = 1500; // Silence duration to trigger processing
const FRAME_DURATION_MS = 20;
const ECHO_GUARD_MS = 1500;
const BARGE_IN_CONFIRM_WINDOW_MS = 500;
const MIN_BARGE_IN_CHARS = 8;
const MIN_STREAMING_CHUNK_CHARS = 40;
const STREAMING_CLAUSE_THRESHOLD = 60;
const STREAMING_HARD_LIMIT = 80;

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

function normalizeSpeechText(text = "") {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countNormalizedWords(text = "") {
  if (!text) return 0;
  return text.split(" ").filter(Boolean).length;
}

function hasPrefixOverlap(agentText = "", transcriptText = "") {
  if (!agentText || !transcriptText) return false;

  const agentWords = agentText.split(" ").filter(Boolean);
  const transcriptWords = transcriptText.split(" ").filter(Boolean);

  if (transcriptWords.length < 2) return false;

  const prefixWordCount = Math.min(
    agentWords.length,
    Math.max(transcriptWords.length + 1, 4),
  );
  const agentPrefix = agentWords.slice(0, prefixWordCount).join(" ");
  const transcript = transcriptWords.join(" ");

  return (
    agentPrefix.startsWith(transcript) ||
    transcript.startsWith(agentPrefix) ||
    agentPrefix.includes(transcript)
  );
}

// Initialize OpenAI client for summary generation
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate a concise call summary using GPT-4o-mini
 * @param {Array} transcript - Array of {role, content} objects
 * @param {Object} customerContext - Extracted customer data
 * @returns {Promise<{summary: string, tokens: {input: number, output: number}} | null>}
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

    // Return both summary and token usage for cost tracking
    return {
      summary: response.choices[0].message.content.trim(),
      tokens: {
        input: response.usage?.prompt_tokens || 0,
        output: response.usage?.completion_tokens || 0
      }
    };
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
    this.currentStepId = null; // State engine: current step in the flow
    this.collectedData = {};   // State engine: slots collected so far
    this.retryCount = 0;       // State engine: retry counter
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
    this.currentSpeechText = "";
    this.speechStartedAt = null;
    this.pendingBargeIn = null;
    this.lastPlaybackEndedAt = 0;

    //Call tracking for database
    this.callDbId = null; // MongoDB _id for this call
    this.callStartTime = Date.now();
    this.fullTranscript = []; // Full conversation transcript
    this.callerNumber = null; // Caller's phone number (from SIP headers)

    // 💰 LLM token tracking for cost calculation
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;

    //Call recording
    this.recording = null;

    // 🔊 Live spy listeners (WebSocket connections listening to this call)
    this.spyListeners = new Set();
    this.agentName = null; // populated in initializeAgent

    console.log(
      `[${uuid}] New call session created (DID: ${calledNumber || "unknown"
      })`,
    );
  }

  /**
   * Broadcast raw PCM audio to all spy WebSocket listeners
   * @param {Buffer} audioData - Raw slin16 PCM data
   * @param {string} source - 'caller' or 'agent'
   */
  broadcastToSpies(audioData, source) {
    if (this.spyListeners.size === 0) return;
    // Prefix: 1 byte source marker (0x01=caller, 0x02=agent) + audio data
    const marker = Buffer.alloc(1);
    marker[0] = source === 'caller' ? 0x01 : 0x02;
    const frame = Buffer.concat([marker, audioData]);
    for (const ws of this.spyListeners) {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(frame);
      } else {
        this.spyListeners.delete(ws);
      }
    }
  }

  clearPendingBargeIn() {
    this.pendingBargeIn = null;
  }

  resetPlaybackTracking() {
    this.currentSpeechText = "";
    this.speechStartedAt = null;
    this.lastPlaybackEndedAt = Date.now();
    this.clearPendingBargeIn();
  }

  evaluateBargeIn(transcript, isFinal) {
    const normalizedTranscript = normalizeSpeechText(transcript);
    if (!normalizedTranscript || !this.isSpeaking) {
      return { confirmed: false, reason: null };
    }

    const playbackAgeMs = this.speechStartedAt
      ? Date.now() - this.speechStartedAt
      : Number.POSITIVE_INFINITY;
    const normalizedAgentText = normalizeSpeechText(this.currentSpeechText);

    if (
      playbackAgeMs <= ECHO_GUARD_MS &&
      hasPrefixOverlap(normalizedAgentText, normalizedTranscript)
    ) {
      this.clearPendingBargeIn();
      return { confirmed: false, reason: "ignored_echo" };
    }

    const compactLength = normalizedTranscript.replace(/\s+/g, "").length;
    const wordCount = countNormalizedWords(normalizedTranscript);

    if (isFinal) {
      this.clearPendingBargeIn();
      if (wordCount >= 2 || compactLength >= MIN_BARGE_IN_CHARS) {
        return { confirmed: true, reason: "confirmed_barge_in" };
      }

      return { confirmed: false, reason: "ignored_short_interim" };
    }

    if (compactLength < MIN_BARGE_IN_CHARS) {
      this.pendingBargeIn = {
        normalizedText: normalizedTranscript,
        seenAt: Date.now(),
      };
      return { confirmed: false, reason: "ignored_short_interim" };
    }

    const now = Date.now();
    const previous = this.pendingBargeIn;
    const isGrowing =
      previous &&
      now - previous.seenAt <= BARGE_IN_CONFIRM_WINDOW_MS &&
      normalizedTranscript.length > previous.normalizedText.length &&
      normalizedTranscript.startsWith(previous.normalizedText);

    this.pendingBargeIn = {
      normalizedText: normalizedTranscript,
      seenAt: now,
    };

    if (isGrowing) {
      return { confirmed: true, reason: "confirmed_barge_in" };
    }

    return { confirmed: false, reason: "ignored_short_interim" };
  }

  extractStreamingChunk(text, isFinal = false) {
    const buffer = text.trim();
    if (!buffer) return null;

    const sentenceMatch = buffer.match(/^(.*?[.!?।])(?:\s+|$)/s);
    if (sentenceMatch) {
      return {
        chunk: sentenceMatch[1].trim(),
        remainder: buffer.slice(sentenceMatch[0].length).trimStart(),
      };
    }

    if (buffer.length >= STREAMING_CLAUSE_THRESHOLD) {
      const uptoClause = buffer.slice(0, STREAMING_HARD_LIMIT);
      const clauseMatches = [...uptoClause.matchAll(/[,;:](?=\s|$)/g)];
      const lastClause = clauseMatches.at(-1);
      if (lastClause && lastClause.index + 1 >= MIN_STREAMING_CHUNK_CHARS) {
        return {
          chunk: buffer.slice(0, lastClause.index + 1).trim(),
          remainder: buffer.slice(lastClause.index + 1).trimStart(),
        };
      }
    }

    if (buffer.length >= STREAMING_HARD_LIMIT) {
      const splitAt = buffer.lastIndexOf(" ", STREAMING_HARD_LIMIT);
      const safeSplitAt =
        splitAt >= MIN_STREAMING_CHUNK_CHARS ? splitAt : STREAMING_HARD_LIMIT;
      return {
        chunk: buffer.slice(0, safeSplitAt).trim(),
        remainder: buffer.slice(safeSplitAt).trimStart(),
      };
    }

    if (isFinal) {
      return { chunk: buffer, remainder: "" };
    }

    return null;
  }

  splitSpeechForQueue(text) {
    const normalized = text?.trim();
    if (!normalized) return [];

    const segments = [];
    let remainder = normalized;

    while (remainder.length > STREAMING_HARD_LIMIT) {
      const next = this.extractStreamingChunk(remainder, false);
      if (!next || !next.chunk) {
        break;
      }
      segments.push(next.chunk);
      remainder = next.remainder;
    }

    if (remainder.trim()) {
      segments.push(remainder.trim());
    }

    return segments;
  }

  resolveElevenLabsModel() {
    const configuredModel = this.voiceModel || "eleven_multilingual_v2";
    const isTurboModel = configuredModel.startsWith("eleven_turbo");
    const isNonEnglish = this.language && this.language !== "en";

    if (isTurboModel && isNonEnglish) {
      console.log(`[${this.uuid}] ElevenLabs model override`, {
        reason: "multilingual_phone_quality",
        configuredModel,
        resolvedModel: "eleven_multilingual_v2",
        language: this.language,
      });
      return "eleven_multilingual_v2";
    }

    return configuredModel;
  }

  async waitForSocketDrain() {
    if (!this.socket?.writable) return;

    await new Promise((resolve, reject) => {
      const onDrain = () => {
        cleanup();
        resolve();
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      const onClose = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        this.socket.off("drain", onDrain);
        this.socket.off("error", onError);
        this.socket.off("close", onClose);
      };

      this.socket.once("drain", onDrain);
      this.socket.once("error", onError);
      this.socket.once("close", onClose);
    });
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
          `⚠️No agent mapped for DID: ${this.calledNumber} (cleaned: ${cleanedNumber})`,
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

      this.agentName = agent.name;
      console.log(`[${this.uuid}] Loaded agent: ${agent.name} (${agentId})`);

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
      this.userId = agent.userId;  // ← needed to associate call with the agent's owner
      this.flowId = agent.flowId;
      this.startStepId = flow.startStep;
      this.currentStepId = flow.startStep; // State engine: start at first step
      this.flow = flow; // Store flow for processTurn
      this.agentConfig = agent.agentConfig || {};
      this.knowledgeBaseFiles = agent.knowledgeBaseFiles || [];
      this.analyticsConfig = agent.analyticsConfig || { summarization: false, extraction: false };
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
        `[${this.uuid}] TTS Config: Provider=${this.voiceProvider}, Voice=${this.voice}, Model=${this.voiceModel}`,
      );

      console.log(
        `[${this.uuid}] Flow: ${this.flowId}, Start: ${this.startStepId}`,
      );

      // 5. Pre-call wallet balance check
      if (this.userId) {
        const { allowed, balance, required } = await hasEnoughBalance(this.userId);
        if (!allowed) {
          console.warn(`[${this.uuid}] Insufficient wallet balance: $${balance.toFixed(4)} < $${required.toFixed(4)}`);
          // Attach flag so the outer catch can play a TTS message
          const err = new Error('Insufficient wallet balance to connect this call.');
          err.code = 'INSUFFICIENT_BALANCE';
          throw err;
        }
        console.log(`[${this.uuid}] Wallet balance OK: $${balance.toFixed(4)}`);
      }

      return true;
    } catch (error) {
      console.error(
        `[${this.uuid}] Failed to initialize agent:`,
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
        userId: this.userId,          // ← associate call with agent owner
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

      // Start recording
      this.recording = recordingService.startRecording(this.uuid);

      return callRecord;
    } catch (error) {
      console.error(`[${this.uuid}] Failed to create call record:`, error.message);
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
      console.error(`[${this.uuid}] DEEPGRAM_API_KEY not configured`);
      return false;
    }

    try {
      const deepgram = createClient(apiKey);

      // Deepgram settings for AudioSocket telephony
      this.deepgramConnection = deepgram.listen.live({
        model: "nova-2",
        language: this.language === "hi" ? "hi" : "en-IN",
        encoding: "linear16",
        sample_rate: SAMPLE_RATE,
        channels: 1,
        smart_format: true,
        punctuate: true,
        interim_results: true,
        utterance_end_ms: 1000, // Triggers UtteranceEnd event
        vad_events: true,
        endpointing: 150,
      });

      // Handle transcription results
      this.deepgramConnection.on("Results", (data) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript || "";
        const isFinal = data.is_final;

        if (transcript) {
          //Phase 4: Check if this is real speech (not noise/fillers)
          const isRealSpeech =
            transcript.length >= 3 && /[a-zA-Z\u0900-\u097F]/.test(transcript);

          if (isRealSpeech && this.isSpeaking && !this.userIsSpeaking) {
            const bargeInDecision = this.evaluateBargeIn(transcript, isFinal);
            if (bargeInDecision.reason && !bargeInDecision.confirmed) {
              console.log(
                `[${this.uuid}] ${bargeInDecision.reason}`,
                {
                  provider: this.voiceProvider,
                  model: this.voiceModel,
                  transcript,
                },
              );
            }

            if (bargeInDecision.confirmed) {
              this.userIsSpeaking = true;
              this.currentSpeechToken++;
              this.audioQueue.length = 0;
              console.log(
                `[${this.uuid}] confirmed_barge_in`,
                {
                  provider: this.voiceProvider,
                  model: this.voiceModel,
                  transcript,
                },
              );
            }
          }

          if (isFinal) {
            this.transcript += (this.transcript ? " " : "") + transcript;
            console.log(`🎤 [${this.uuid}] Final: "${transcript}"`);

            // FIX 3: Early trigger on isFinal instead of waiting for UtteranceEnd
            // This saves ~700-900ms latency
            if (transcript.length > 5 && !this.isProcessing) {
              clearTimeout(this.silenceTimer);
              this.silenceTimer = setTimeout(() => {
                if (!this.isProcessing && this.transcript) {
                  console.log(`⚡ [${this.uuid}] Early trigger (isFinal)`);
                  this.processUserInput();
                }
              }, 150); // 150ms instead of waiting for UtteranceEnd
            }
          } else {
            console.log(`🎤 [${this.uuid}] Interim: "${transcript}"`);
          }
        }
      });

      // Handle utterance end (user stopped speaking) - fallback for edge cases
      this.deepgramConnection.on("UtteranceEnd", async () => {
        console.log(`🔇 [${this.uuid}] Utterance ended`);
        this.userIsSpeaking = false; //Phase 4: Reset speech flag
        this.clearPendingBargeIn();
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

      console.log(`[${this.uuid}] Deepgram real-time STT initialized`);
      return true;
    } catch (error) {
      console.error(
        `[${this.uuid}] Failed to init Deepgram:`,
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

    const segments = this.splitSpeechForQueue(text);
    this.audioQueue.push(...segments);

    // Single consumer guarantee - only one speech at a time
    if (this.isSpeaking) return;

    this.isSpeaking = true;

    try {
      while (this.audioQueue.length > 0) {
        const nextChunk = this.audioQueue.shift();
        const token = this.currentSpeechToken; // ⚡ Phase 4: Read token (increment only on barge-in)
        await this.speakResponse(nextChunk, token);

        // Brief pause between segments for natural pacing (prevents "speaks fast" issue)
        if (this.audioQueue.length > 0 && token === this.currentSpeechToken) {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
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

    console.log(`[${this.uuid}] Processing: "${userMessage}"`);

    try {
      // 🚀 LATENCY OPT: Resolve any pending background extraction from previous turn.
      // Because we no longer await it in aiAgent, we pick up the result here.
      // Usually instant because it ran in the background while the user was listening/speaking.
      if (aiAgentService._pendingExtraction) {
        const prevCtx = await aiAgentService._pendingExtraction;
        if (prevCtx && typeof prevCtx === 'object') {
          this.customerContext = { ...this.customerContext, ...prevCtx };
        }
        aiAgentService._pendingExtraction = null;
      }

      // Check for "check-in" phrases (hello? are you there? etc.)
      // These should get a quick acknowledgment, not restart the flow
      if (this.isCheckInPhrase(userMessage)) {
        console.log(
          `[${this.uuid}] Check-in phrase detected, quick response`,
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

      // Save to full transcript for database
      this.fullTranscript.push({
        role: "user",
        content: userMessage,
        timestamp: new Date(),
      });

      // Keep history manageable (last 6 turns = 12 messages)
      if (this.conversationHistory.length > 12) {
        this.conversationHistory = this.conversationHistory.slice(-12);
      }

      // ========================================================================
      // Process through AI Agent Service - USE STREAMING
      // The user's script (agent.prompt) is the system prompt — it is the law.
      // ========================================================================

      // Start timer BEFORE stream call to measure full latency
      const t0 = Date.now();

      // Process through AI Agent Service - USE STREAMING
      const stream = await aiAgentService.processMessageStream(
        userMessage,
        this.agentId,
        this.customerContext || {},
        this.conversationHistory,
        {
          language: this.language,
          systemPrompt: this.systemPrompt,
          useRAG: this.knowledgeBaseFiles.length > 0,
          agentId: this.agentId,
        },
      );

      // True streaming TTS - with character threshold
      let fullResponse = "";
      let updatedContext = null;
      let ttsBuffer = "";
      let firstContentLogged = false;

      for await (const chunk of stream) {
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

          fullResponse += chunk.content;
          ttsBuffer += chunk.content;

          let flushResult = this.extractStreamingChunk(ttsBuffer, false);
          while (flushResult?.chunk) {
            ttsBuffer = flushResult.remainder;

            console.log(
              `[${this.uuid}] Streaming chunk: "${flushResult.chunk.substring(0, 50)}..."`,
            );
            this.enqueueSpeech(flushResult.chunk);
            flushResult = this.extractStreamingChunk(ttsBuffer, false);
          }
        }

        if (chunk.type === "done" || chunk.type === "error") {
          break;
        }
      }

      // Flush any remaining text that didn't end with a sentence boundary
      if (ttsBuffer.trim()) {
        const remainingChunk = this.extractStreamingChunk(ttsBuffer, true);
        if (remainingChunk?.chunk) {
          console.log(
            `[${this.uuid}] Final sentence: "${remainingChunk.chunk.substring(0, 50)}..."`,
          );
          this.enqueueSpeech(remainingChunk.chunk);
        } else {
          // Safety net: if extractStreamingChunk returned null, send the raw buffer
          console.log(
            `[${this.uuid}] Flushing remaining buffer: "${ttsBuffer.trim().substring(0, 50)}..."`,
          );
          this.enqueueSpeech(ttsBuffer.trim());
        }
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

      // Save to full transcript for database
      this.fullTranscript.push({
        role: "assistant",
        content: aiResponse,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error(` [${this.uuid}] Processing error:`, error);
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
    const resolvedVoiceModel =
      this.voiceProvider === "ElevenLabs"
        ? this.resolveElevenLabsModel()
        : this.voiceModel;

    console.log(`[${this.uuid}] TTS requested`, {
      provider: this.voiceProvider,
      model: resolvedVoiceModel,
      textLength: text.length,
      preview: text.substring(0, 50),
    });

    try {
      let audioBuffer;
      let inputFormat = null;

      // Route to appropriate TTS provider based on agent configuration
      if (this.voiceProvider === "ElevenLabs") {
        // Use ElevenLabs TTS
        audioBuffer = await ttsService.speakWithElevenLabs(
          text,
          this.voice, // ElevenLabs voice ID
          resolvedVoiceModel || "eleven_multilingual_v2",
        );
        inputFormat = {
          rawFormat: "s16le",
          sampleRate: 16000,
          channels: 1,
        };
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
          this.voiceModel,
        );
        if (audioBase64) {
          audioBuffer = Buffer.from(audioBase64, "base64");
        }

        // Sarvam v3 outputs 8kHz WAV directly — tell ffmpeg to skip resampling
        if (this.voiceModel?.includes("v3")) {
          inputFormat = {
            rawFormat: "wav",
            sampleRate: 8000,
            channels: 1,
          };
        }
      }

      if (!audioBuffer) {
        console.error(
          ` [${this.uuid}] No audio from TTS (${this.voiceProvider})`,
        );
        return;
      }

      await this.streamAudioToAsterisk(audioBuffer, {
        token,
        text,
        provider: this.voiceProvider,
        model: resolvedVoiceModel,
        inputFormat,
      });
    } catch (error) {
      console.error(
        ` [${this.uuid}] TTS error (${this.voiceProvider}):`,
        error.message,
      );

      // Send µ-law silence instead of crashing
      this.sendSilence(500);
    }
  }

  /**
   * Convert provider audio to slin16 8kHz using ffmpeg
   *
   * Telephony-optimized resampling pipeline for improved PSTN voice quality:
   *   - highpass=200        → removes low-frequency rumble / hum
   *   - lowpass=3400        → matches PSTN narrowband bandwidth (300-3400 Hz)
   *   - equalizer=f=2000:g=3 → +3dB speech presence boost for intelligibility
   *   - dynaudnorm           → dynamic audio normalization for consistent volume
   *   - soxr resampler       → high-quality downsampling (precision=28 ≈ 24-bit)
   * This produces noticeably cleaner, crisper, and more intelligible voice on phone calls.
   *
   * @param {Buffer} inputBuffer - Input audio buffer (TTS output, typically 16kHz+)
   * @param {Object|null} inputFormat - Optional raw format descriptor
   * @returns {Promise<Buffer>} - Raw signed 16-bit PCM data at 8kHz mono
   */
  async convertToSlin16(inputBuffer, inputFormat = null) {
    return new Promise((resolve, reject) => {
      const ffmpegArgs = ["-hide_banner", "-loglevel", "error"];

      if (inputFormat?.rawFormat) {
        ffmpegArgs.push(
          "-f",
          inputFormat.rawFormat,
          "-ar",
          String(inputFormat.sampleRate || 16000),
          "-ac",
          String(inputFormat.channels || 1),
        );
      }

      const isAlready8kHz = inputFormat?.sampleRate === SAMPLE_RATE;

      ffmpegArgs.push(
        "-i",
        "pipe:0", // Input from stdin
        // For 8kHz inputs, use minimal filter chain (skip expensive resampling)
        // For higher sample rates, use full PSTN-optimized filter chain
        "-af",
        isAlready8kHz
          ? "highpass=f=200, lowpass=f=3400"
          : "highpass=f=200, lowpass=f=3400, equalizer=f=2000:t=q:w=1:g=3, dynaudnorm, aresample=resampler=soxr:precision=28",
        "-ar",
        String(SAMPLE_RATE), // Resample to AudioSocket telephony rate (8kHz)
        "-ac",
        "1", // Mono
        "-acodec",
        "pcm_s16le", // Signed 16-bit little-endian (slin16)
        "-f",
        "s16le", // Raw s16le output (no container)
        "pipe:1", // Output to stdout
      );

      const ffmpeg = spawn(
        ffmpegPath.path,
        ffmpegArgs,
        {
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      const chunks = [];
      const stderrChunks = [];

      ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
      ffmpeg.stderr.on("data", (data) => {
        stderrChunks.push(data.toString());
      });

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          const stderr = stderrChunks.join("").trim();
          reject(
            new Error(
              stderr
                ? `FFmpeg exited with code ${code}: ${stderr}`
                : `FFmpeg exited with code ${code}`,
            ),
          );
        }
      });

      ffmpeg.on("error", (err) => {
        reject(err);
      });

      // Write provider audio to ffmpeg stdin
      ffmpeg.stdin.write(inputBuffer);
      ffmpeg.stdin.end();
    });
  }

  /**
   * Send slin16 silence frames
   * @param {number} ms - Duration in milliseconds
   */
  sendSilence(ms = 200) {
    const frames = Math.ceil(ms / FRAME_DURATION_MS);
    const silenceFrame = Buffer.alloc(FRAME_SIZE, 0x00); // 0x00 is slin16 silence

    for (let i = 0; i < frames; i++) {
      if (this.socket.writable) {
        this.socket.write(createAudioFrame(silenceFrame, SAMPLE_RATE));
      }
    }
  }

  /**
   * Stream audio back to Asterisk via AudioSocket
   * Uses ffmpeg to convert provider audio → slin16 8kHz
   * REAL-TIME pacing: 20ms per frame (matches telephony clocking)
   * ⚡ Phase 4: Supports barge-in cancellation via token
   */
  async streamAudioToAsterisk(audioBuffer, playbackContext = {}) {
    const {
      token = this.currentSpeechToken,
      text = "",
      provider = this.voiceProvider,
      model = this.voiceModel,
      inputFormat = null,
    } = playbackContext;

    try {
      const conversionStart = Date.now();
      const slinData = await this.convertToSlin16(audioBuffer, inputFormat);
      const chunks = splitIntoChunks(slinData, FRAME_SIZE).map((chunk) =>
        chunk.length === FRAME_SIZE
          ? chunk
          : Buffer.concat([chunk, Buffer.alloc(FRAME_SIZE - chunk.length, 0)]),
      );
      const estimatedDurationMs = chunks.length * FRAME_DURATION_MS;

      console.log(`[${this.uuid}] conversion finished`, {
        provider,
        model,
        inputBytes: audioBuffer.length,
        outputBytes: slinData.length,
        frameCount: chunks.length,
        estimatedDurationMs,
        conversionMs: Date.now() - conversionStart,
      });

      // Mark when AI speech starts for timeline-based recording
      if (this.recording) {
        this.recording.markAISpeechStart();
      }

      this.currentSpeechText = text;
      this.clearPendingBargeIn();
      const playbackStart = Date.now();
      this.speechStartedAt = playbackStart;
      console.log(`[${this.uuid}] playback started`, {
        provider,
        model,
        frameCount: chunks.length,
      });

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const targetAt = playbackStart + i * FRAME_DURATION_MS;
        const waitMs = targetAt - Date.now();

        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }

        // Phase 4: Stop immediately if barge-in occurred
        if (token !== this.currentSpeechToken) {
          console.log(
            `[${this.uuid}] playback cancelled`,
            {
              reason: "confirmed_barge_in",
              provider,
              model,
            },
          );
          break;
        }

        if (!this.socket.writable) break;

        const canContinue = this.socket.write(
          createAudioFrame(chunk, SAMPLE_RATE),
        );

        // 🔊 Broadcast AI audio to spy listeners
        this.broadcastToSpies(chunk, 'agent');

        // Capture AI audio with chunk index for timeline positioning
        if (this.recording) {
          this.recording.addAIAudio(chunk, i);
        }

        if (!canContinue) {
          await this.waitForSocketDrain();
        }
      }

      // Only log completion if not cancelled
      if (token === this.currentSpeechToken) {
        console.log(`[${this.uuid}] playback completed`, {
          provider,
          model,
          frameCount: chunks.length,
          estimatedDurationMs,
        });
      }
    } catch (error) {
      console.error(` [${this.uuid}] Audio streaming failed:`, error.message);
      this.sendSilence(200);
    } finally {
      this.resetPlaybackTracking();
    }
  }

  /**
   * Handle incoming audio from Asterisk
   */
  handleAudio(audioData) {
    this.lastAudioTime = Date.now();

    // Capture user audio for recording
    if (this.recording) {
      this.recording.addUserAudio(audioData);
    }

    // 🔊 Broadcast caller audio to spy listeners
    this.broadcastToSpies(audioData, 'caller');

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

    // 🔊 Close all spy listeners
    for (const ws of this.spyListeners) {
      try {
        ws.close(1000, 'Call ended');
      } catch (e) { /* ignore */ }
    }
    this.spyListeners.clear();

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

    // Finalize call record in database
    if (this.callDbId) {
      const duration = Math.floor((Date.now() - this.callStartTime) / 1000);

      // Estimate tokens from transcript (~4 characters = 1 token)
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

      // Generate AI summary of the call ONLY if summarization is enabled
      let callSummary = null;
      let summaryInputTokens = 0;
      let summaryOutputTokens = 0;

      if (this.analyticsConfig?.summarization) {
        const summaryResult = await generateCallSummary(this.fullTranscript, this.customerContext);
        if (summaryResult) {
          callSummary = summaryResult.summary;
          summaryInputTokens = summaryResult.tokens?.input || 0;
          summaryOutputTokens = summaryResult.tokens?.output || 0;
          console.log(`[${this.uuid}] Call summary generated (${summaryInputTokens}+${summaryOutputTokens} tokens)`);
        }
      } else {
        console.log(`[${this.uuid}] Summarization disabled, skipping summary generation`);
      }

      // Add summary tokens to total LLM usage
      const totalInputTokens = estimatedInputTokens + summaryInputTokens;
      const totalOutputTokens = estimatedOutputTokens + summaryOutputTokens;

      // Calculate all costs (now includes conversation + summary tokens)
      const telephonyCost = await Call.calculateTelephonyCost(duration);
      const llmCostUSD = Call.calculateLLMCost(totalInputTokens, totalOutputTokens);
      const totalCost = await Call.calculateTotalCost(duration, totalInputTokens, totalOutputTokens);

      // Upload recording to Cloudinary
      let recordingUrl = null;
      if (this.recording) {
        const recordingResult = await recordingService.stopAndUpload(this.uuid);
        if (recordingResult) {
          recordingUrl = recordingResult.url;
          console.log(`[${this.uuid}] Recording uploaded: ${recordingUrl}`);
        }
      }

      // Build comprehensive rawData JSON for detailed analytics
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
              input: totalInputTokens,
              output: totalOutputTokens,
            },
          },
          voice_id: this.voice || null,
          llmTokens: totalInputTokens + totalOutputTokens,
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
        extracted_data: this.analyticsConfig?.extraction ? (this.customerContext || {}) : {},
        summary: callSummary, // AI-generated summary (null if disabled)
        error_message: null,
        status: "completed",
        user_number: this.callerNumber || this.calledNumber,
        agent_number: this.calledNumber,
        initiated_at: new Date(this.callStartTime).toISOString(),
        telephony_data: {
          duration: duration.toString(),
          to_number: this.callerNumber || this.calledNumber,
          from_number: this.calledNumber,
          recording_url: recordingUrl,
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
        recordingUrl: recordingUrl,
      }).then(async () => {
        console.log(`[${this.uuid}] Call record finalized: duration=${duration}s, telephony=₹${telephonyCost.toFixed(2)}, LLM=$${llmCostUSD.toFixed(4)} (${totalInputTokens}+${totalOutputTokens} tokens), total=₹${totalCost.toFixed(2)}`);

        // 💰 Deduct call cost from user wallet
        if (this.userId && totalCost > 0) {
          const durationStr = `${duration}s`;
          await deductCallCost(
            this.userId,
            totalCost,
            this.uuid,
            `Call ${this.uuid.substring(0, 8)} — ${durationStr}, ₹${totalCost.toFixed(2)}`
          );
        }
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
    console.log(`Pending call registered: ${uuid} → ${did}`);

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
      console.error("AudioSocket server error:", error);
    });

    this.server.listen(AUDIOSOCKET_PORT, AUDIOSOCKET_HOST, () => {
      console.log("═".repeat(50));
      console.log(
        `AudioSocket Server listening on ${AUDIOSOCKET_HOST}:${AUDIOSOCKET_PORT}`,
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
      `New connection from ${socket.remoteAddress}:${socket.remotePort}`,
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

            console.log(`Parsed UUID: ${uuid} (${frame.data.length} bytes)`);

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

              // Create call record in database
              await session.createCallRecord();

              // Initialize STT and play welcome
              await session.initDeepgram();
              await session.playWelcome();
            } catch (error) {
              console.error(`Failed to initialize call: ${error.message}`);
              // If insufficient balance, save a failed call record and play a neutral message
              if (error.code === 'INSUFFICIENT_BALANCE') {
                // Save a failed call record so it appears in Call History
                try {
                  await Call.create({
                    callId: session.uuid,
                    executionId: session.uuid.substring(0, 8),
                    agentId: session.agentId || null,
                    userId: session.userId || null,
                    calledNumber: session.calledNumber,
                    callerNumber: session.callerNumber || session.calledNumber,
                    userNumber: session.callerNumber || session.calledNumber,
                    status: 'failed',
                    startedAt: new Date(session.callStartTime),
                    endedAt: new Date(),
                    duration: 0,
                    hangupBy: 'system',
                    conversationType: 'asterisk inbound',
                    provider: 'Asterisk',
                    rawData: {
                      uuid: session.uuid,
                      status: 'failed',
                      error_message: 'Call failed: insufficient wallet balance',
                      summary: 'Call could not be connected — insufficient wallet balance. Please top up your account.',
                      created_at: new Date(session.callStartTime).toISOString(),
                    },
                  });
                  console.log(`[${session.uuid}] Failed call record saved (insufficient balance)`);
                } catch (dbErr) {
                  console.error(`Failed to save failed call record:`, dbErr.message);
                }

                // Play a neutral message — caller should not know about internal billing
                try {
                  if (!session.voiceProvider) session.voiceProvider = 'Sarvam';
                  if (!session.voice) session.voice = 'anushka';
                  if (!session.voiceModel) session.voiceModel = 'bulbul:v2';
                  if (!session.language) session.language = 'en';
                  await session.speakResponse(
                    'We are unable to connect your call at this time. Please try again later.'
                  );
                  await new Promise(r => setTimeout(r, 1500));
                } catch (ttsErr) {
                  console.error(`Failed to play rejection message:`, ttsErr.message);
                }
              }
              socket.end();
              this.sessions.delete(uuid);
            }
            break;

          case MESSAGE_TYPES.AUDIO:
          case MESSAGE_TYPES.SLIN_12K:
          case MESSAGE_TYPES.SLIN_16K:
          case MESSAGE_TYPES.SLIN_24K:
          case MESSAGE_TYPES.SLIN_32K:
          case MESSAGE_TYPES.SLIN_44K:
          case MESSAGE_TYPES.SLIN_48K:
          case MESSAGE_TYPES.SLIN_96K:
          case MESSAGE_TYPES.SLIN_192K:
            // Audio frame from caller
            if (session) {
              session.handleAudio(frame.data);
            }
            break;

          case MESSAGE_TYPES.ERROR:
            console.error(
              `AudioSocket error from Asterisk:`,
              frame.data.toString(),
            );
            break;

          default:
            console.warn(`Unknown frame type: ${frame.type}`);
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
      console.error(`Socket error:`, error.message);
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
      console.log("AudioSocket server stopped");
    }
  }

  /**
   * Get active call count
   */
  getActiveCallCount() {
    return this.sessions.size;
  }

  /**
   * Get active calls for a specific user (for spy API)
   * @param {string} userId - Filter by user ID (so users only see their own calls)
   * @returns {Array} Active call info objects
   */
  getActiveCalls(userId) {
    const calls = [];
    for (const [uuid, session] of this.sessions) {
      // Filter by userId so users only see their own agents' calls
      if (userId && session.userId && session.userId.toString() !== userId.toString()) {
        continue;
      }
      calls.push({
        callId: uuid,
        callerNumber: session.callerNumber || 'Unknown',
        calledNumber: session.calledNumber || 'Unknown',
        agentName: session.agentName || 'Unknown Agent',
        agentId: session.agentId || null,
        startTime: session.callStartTime,
        spyCount: session.spyListeners.size,
      });
    }
    return calls;
  }
}

// Singleton instance
const audioSocketServer = new AudioSocketServer();

export default audioSocketServer;
