/**
 * Twilio Media Stream Bridge
 * Equivalent of asteriskBridge.service.js but for Twilio WebSocket Media Streams.
 * Manages TwilioCallSession instances keyed by Twilio Call SID.
 *
 * Audio flow:
 *   Twilio (mulaw base64 JSON) → decode → linear16 → Deepgram STT
 *   TTS output → convertToSlin16 → linear16ToMulaw → base64 → Twilio JSON
 */
import { createClient } from "@deepgram/sdk";
import { spawn } from "child_process";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import aiAgentService from "./aiAgent.service.js";
import flowLoader from "./flowLoader.js";
import stateEngine from "./stateEngine.js";
import ttsService from "./tts.service.js";
import recordingService from "./recording.service.js";
import { mulawToLinear16, linear16ToMulaw } from "./mulawCodec.js";
import Call from "../models/Call.js";
import Agent from "../models/Agent.js";
import Conversation from "../models/Conversation.js";
import OpenAI from "openai";
import { hasEnoughBalance, deductCallCost } from "./walletService.js";

const SAMPLE_RATE = 8000;
const ECHO_GUARD_MS = 1500;
const BARGE_IN_CONFIRM_WINDOW_MS = 500;
const MIN_BARGE_IN_CHARS = 8;
const MIN_STREAMING_CHUNK_CHARS = 40;
const STREAMING_CLAUSE_THRESHOLD = 60;
const STREAMING_HARD_LIMIT = 80;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function detectResponseLanguage(text) {
  if (!text || text.length < 10) return null;
  const devanagariPattern = /[\u0900-\u097F]/g;
  const latinPattern = /[a-zA-Z]/g;
  const devanagariMatches = text.match(devanagariPattern) || [];
  const latinMatches = text.match(latinPattern) || [];
  const totalChars = devanagariMatches.length + latinMatches.length;
  if (totalChars < 10) return null;
  return devanagariMatches.length / totalChars > 0.4 ? "hi" : "en";
}

function normalizeSpeechText(text = "") {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
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
  const prefixWordCount = Math.min(agentWords.length, Math.max(transcriptWords.length + 1, 4));
  const agentPrefix = agentWords.slice(0, prefixWordCount).join(" ");
  const transcript = transcriptWords.join(" ");
  return agentPrefix.startsWith(transcript) || transcript.startsWith(agentPrefix) || agentPrefix.includes(transcript);
}

async function generateCallSummary(transcript, customerContext = {}) {
  if (!transcript || transcript.length === 0) return null;
  try {
    const formattedTranscript = transcript.map(entry => `${entry.role}: ${entry.content}`).join('\n');
    const contextInfo = Object.keys(customerContext).length > 0
      ? `\nExtracted data: ${JSON.stringify(customerContext)}` : '';
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `You are a call summary generator. Create a brief, professional summary of the call in 100-150 words maximum. The summary should: - Describe who called and the purpose - Mention key points discussed - Include any important outcomes or data collected - Be written in third person, past tense - Be concise and professional. Do NOT include any headers or bullet points. Write as a single paragraph.` },
        { role: "user", content: `Generate a summary for this call:\n\n${formattedTranscript}${contextInfo}` }
      ],
      temperature: 0.3,
      max_tokens: 200,
    });
    return {
      summary: response.choices[0].message.content.trim(),
      tokens: { input: response.usage?.prompt_tokens || 0, output: response.usage?.completion_tokens || 0 }
    };
  } catch (error) {
    console.error(`Failed to generate call summary:`, error.message);
    return null;
  }
}

/**
 * Twilio Call Session — per-call state for Twilio Media Stream calls.
 * Mirrors CallSession from asteriskBridge.service.js but uses WebSocket + mulaw.
 */
class TwilioCallSession {
  constructor(callSid, ws, agentId) {
    this.callSid = callSid;
    this.ws = ws;
    this.agentId = agentId;
    this.streamSid = null; // Set when Twilio sends 'start' event

    // Agent configuration
    this.userId = null;
    this.flowId = null;
    this.startStepId = null;
    this.currentStepId = null;
    this.collectedData = {};
    this.retryCount = 0;
    this.agentConfig = {};
    this.analyticsConfig = {};
    this.knowledgeBaseFiles = [];
    this.welcomeMessage = null;
    this.systemPrompt = null;
    this.flow = null;
    this.language = "en";
    this.voice = "anushka";
    this.voiceProvider = "Sarvam";
    this.voiceModel = "bulbul:v2";
    this.agentName = null;

    // Audio
    this.deepgramConnection = null;
    this.transcript = "";
    this.isProcessing = false;
    this.silenceTimer = null;

    // Conversation
    this.conversationHistory = [];
    this.customerContext = {};

    // Speech queue
    this.audioQueue = [];
    this.isSpeaking = false;

    // Barge-in
    this.currentSpeechToken = 0;
    this.userIsSpeaking = false;
    this.currentSpeechText = "";
    this.speechStartedAt = null;
    this.pendingBargeIn = null;
    this.lastPlaybackEndedAt = 0;

    // Call tracking
    this.callDbId = null;
    this.callStartTime = Date.now();
    this.fullTranscript = [];
    this.callerNumber = null;
    this.calledNumber = null;

    // Cost tracking
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;

    // Recording
    this.recording = null;

    console.log(`[${callSid}] New Twilio call session created`);
  }

  // ── Agent initialization (same as asteriskBridge) ──────────────────

  async initializeAgent() {
    try {
      const agent = await Agent.findById(this.agentId);
      if (!agent) throw new Error(`Agent not found: ${this.agentId}`);

      this.agentName = agent.name;
      this.userId = agent.userId;
      console.log(`[${this.callSid}] Loaded agent: ${agent.name} (${this.agentId})`);

      const flow = await flowLoader.getFlowForAgent(agent);
      if (!flow || !flow.startStep) throw new Error(`Invalid flow for agent: ${this.agentId}`);

      this.flowId = agent.flowId;
      this.startStepId = flow.startStep;
      this.currentStepId = flow.startStep;
      this.flow = flow;
      this.agentConfig = agent.agentConfig || {};
      this.knowledgeBaseFiles = agent.knowledgeBaseFiles || [];
      this.analyticsConfig = agent.analyticsConfig || { summarization: false, extraction: false };
      this.welcomeMessage = agent.welcome || flow.steps?.greeting?.text?.en || "Hello! How can I help you today?";
      this.language = agent.supportedLanguages?.[0] || "en";
      this.voice = agent.voice || "anushka";
      this.voiceProvider = agent.voiceProvider || "Sarvam";
      this.voiceModel = agent.voiceModel || "bulbul:v2";
      this.systemPrompt = agent.prompt || "You are a helpful AI assistant.";

      // Wallet check
      if (this.userId) {
        const { allowed, balance, required } = await hasEnoughBalance(this.userId);
        if (!allowed) {
          const err = new Error('Insufficient wallet balance to connect this call.');
          err.code = 'INSUFFICIENT_BALANCE';
          throw err;
        }
        console.log(`[${this.callSid}] Wallet balance OK: $${balance.toFixed(4)}`);
      }

      return true;
    } catch (error) {
      console.error(`[${this.callSid}] Failed to initialize agent:`, error.message);
      throw error;
    }
  }

  // ── Call record ────────────────────────────────────────────────────

  async createCallRecord(conversationType = "twilio inbound") {
    try {
      const callRecord = await Call.create({
        callId: this.callSid,
        executionId: this.callSid.substring(0, 8),
        agentId: this.agentId,
        userId: this.userId,
        calledNumber: this.calledNumber,
        callerNumber: this.callerNumber || this.calledNumber,
        userNumber: this.callerNumber || this.calledNumber,
        status: "answered",
        startedAt: new Date(this.callStartTime),
        conversationType,
        provider: "Twilio",
        rawData: {
          callSid: this.callSid,
          agentId: this.agentId,
          flowId: this.flowId,
          language: this.language,
          voiceProvider: this.voiceProvider,
        },
      });
      this.callDbId = callRecord._id;
      console.log(`[${this.callSid}] Call record created: ${callRecord._id}`);

      this.recording = recordingService.startRecording(this.callSid);
      return callRecord;
    } catch (error) {
      console.error(`[${this.callSid}] Failed to create call record:`, error.message);
      return null;
    }
  }

  // ── Deepgram STT ──────────────────────────────────────────────────

  async initDeepgram() {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      console.error(`[${this.callSid}] DEEPGRAM_API_KEY not configured`);
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
        punctuate: true,
        interim_results: true,
        utterance_end_ms: 1000,
        vad_events: true,
        endpointing: 150,
      });

      this.deepgramConnection.on("Results", (data) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript || "";
        const isFinal = data.is_final;

        if (transcript) {
          const isRealSpeech = transcript.length >= 3 && /[a-zA-Z\u0900-\u097F]/.test(transcript);

          if (isRealSpeech && this.isSpeaking && !this.userIsSpeaking) {
            const bargeInDecision = this.evaluateBargeIn(transcript, isFinal);
            if (bargeInDecision.confirmed) {
              this.userIsSpeaking = true;
              this.currentSpeechToken++;
              this.audioQueue.length = 0;
              console.log(`[${this.callSid}] confirmed_barge_in`, { transcript });
            }
          }

          if (isFinal) {
            this.transcript += (this.transcript ? " " : "") + transcript;
            console.log(`🎤 [${this.callSid}] Final: "${transcript}"`);

            if (transcript.length > 5 && !this.isProcessing) {
              clearTimeout(this.silenceTimer);
              this.silenceTimer = setTimeout(() => {
                if (!this.isProcessing && this.transcript) {
                  console.log(`⚡ [${this.callSid}] Early trigger (isFinal)`);
                  this.processUserInput();
                }
              }, 150);
            }
          }
        }
      });

      this.deepgramConnection.on("UtteranceEnd", async () => {
        console.log(`🔇 [${this.callSid}] Utterance ended`);
        this.userIsSpeaking = false;
        this.clearPendingBargeIn();
        clearTimeout(this.silenceTimer);
        if (this.transcript && !this.isProcessing) {
          await this.processUserInput();
        }
      });

      this.deepgramConnection.on("Error", (error) => {
        console.error(`❌ [${this.callSid}] Deepgram error:`, error);
      });

      this.deepgramConnection.on("Close", () => {
        console.log(`🔌 [${this.callSid}] Deepgram connection closed`);
      });

      console.log(`[${this.callSid}] Deepgram real-time STT initialized`);
      return true;
    } catch (error) {
      console.error(`[${this.callSid}] Failed to init Deepgram:`, error.message);
      return false;
    }
  }

  sendAudioToSTT(audioData) {
    if (this.deepgramConnection && this.deepgramConnection.getReadyState() === 1) {
      this.deepgramConnection.send(audioData);
    }
  }

  // ── Twilio Media Stream handling ──────────────────────────────────

  handleMediaMessage(msg) {
    const data = JSON.parse(msg);

    switch (data.event) {
      case "connected":
        console.log(`[${this.callSid}] Twilio Media Stream connected`);
        break;

      case "start":
        this.streamSid = data.start.streamSid;
        this.callerNumber = data.start.customParameters?.callerNumber || null;
        this.calledNumber = data.start.customParameters?.calledNumber || null;
        console.log(`[${this.callSid}] Media stream started: ${this.streamSid}`);
        break;

      case "media": {
        // Decode mulaw base64 → linear16 → send to Deepgram
        const mulawBuffer = Buffer.from(data.media.payload, "base64");
        const pcmBuffer = mulawToLinear16(mulawBuffer);

        // Capture for recording
        if (this.recording) {
          this.recording.addUserAudio(pcmBuffer);
        }

        this.sendAudioToSTT(pcmBuffer);
        break;
      }

      case "stop":
        console.log(`[${this.callSid}] Media stream stopped`);
        this.cleanup();
        break;

      default:
        break;
    }
  }

  /**
   * Send linear16 PCM audio back to Twilio via Media Stream WebSocket
   * Converts linear16 → mulaw → base64 → JSON message
   */
  sendAudioToTwilio(pcmBuffer) {
    if (!this.ws || this.ws.readyState !== 1 || !this.streamSid) return;

    const mulawBuffer = linear16ToMulaw(pcmBuffer);
    const payload = mulawBuffer.toString("base64");

    this.ws.send(JSON.stringify({
      event: "media",
      streamSid: this.streamSid,
      media: { payload },
    }));
  }

  // ── Barge-in detection (same logic as asteriskBridge) ─────────────

  clearPendingBargeIn() { this.pendingBargeIn = null; }

  resetPlaybackTracking() {
    this.currentSpeechText = "";
    this.speechStartedAt = null;
    this.lastPlaybackEndedAt = Date.now();
    this.clearPendingBargeIn();
  }

  evaluateBargeIn(transcript, isFinal) {
    const normalizedTranscript = normalizeSpeechText(transcript);
    if (!normalizedTranscript || !this.isSpeaking) return { confirmed: false, reason: null };

    const playbackAgeMs = this.speechStartedAt ? Date.now() - this.speechStartedAt : Number.POSITIVE_INFINITY;
    const normalizedAgentText = normalizeSpeechText(this.currentSpeechText);

    if (playbackAgeMs <= ECHO_GUARD_MS && hasPrefixOverlap(normalizedAgentText, normalizedTranscript)) {
      this.clearPendingBargeIn();
      return { confirmed: false, reason: "ignored_echo" };
    }

    const compactLength = normalizedTranscript.replace(/\s+/g, "").length;
    const wordCount = countNormalizedWords(normalizedTranscript);

    if (isFinal) {
      this.clearPendingBargeIn();
      if (wordCount >= 2 || compactLength >= MIN_BARGE_IN_CHARS) return { confirmed: true, reason: "confirmed_barge_in" };
      return { confirmed: false, reason: "ignored_short_interim" };
    }

    if (compactLength < MIN_BARGE_IN_CHARS) {
      this.pendingBargeIn = { normalizedText: normalizedTranscript, seenAt: Date.now() };
      return { confirmed: false, reason: "ignored_short_interim" };
    }

    const now = Date.now();
    const previous = this.pendingBargeIn;
    const isGrowing = previous && now - previous.seenAt <= BARGE_IN_CONFIRM_WINDOW_MS
      && normalizedTranscript.length > previous.normalizedText.length
      && normalizedTranscript.startsWith(previous.normalizedText);

    this.pendingBargeIn = { normalizedText: normalizedTranscript, seenAt: now };
    return isGrowing ? { confirmed: true, reason: "confirmed_barge_in" } : { confirmed: false, reason: "ignored_short_interim" };
  }

  // ── Streaming chunk extraction (same as asteriskBridge) ───────────

  extractStreamingChunk(text, isFinal = false) {
    const buffer = text.trim();
    if (!buffer) return null;

    const sentenceMatch = buffer.match(/^(.*?[.!?।])(?:\s+|$)/s);
    if (sentenceMatch) {
      return { chunk: sentenceMatch[1].trim(), remainder: buffer.slice(sentenceMatch[0].length).trimStart() };
    }

    if (buffer.length >= STREAMING_CLAUSE_THRESHOLD) {
      const uptoClause = buffer.slice(0, STREAMING_HARD_LIMIT);
      const clauseMatches = [...uptoClause.matchAll(/[,;:](?=\s|$)/g)];
      const lastClause = clauseMatches.at(-1);
      if (lastClause && lastClause.index + 1 >= MIN_STREAMING_CHUNK_CHARS) {
        return { chunk: buffer.slice(0, lastClause.index + 1).trim(), remainder: buffer.slice(lastClause.index + 1).trimStart() };
      }
    }

    if (buffer.length >= STREAMING_HARD_LIMIT) {
      const splitAt = buffer.lastIndexOf(" ", STREAMING_HARD_LIMIT);
      const safeSplitAt = splitAt >= MIN_STREAMING_CHUNK_CHARS ? splitAt : STREAMING_HARD_LIMIT;
      return { chunk: buffer.slice(0, safeSplitAt).trim(), remainder: buffer.slice(safeSplitAt).trimStart() };
    }

    if (isFinal) return { chunk: buffer, remainder: "" };
    return null;
  }

  splitSpeechForQueue(text) {
    const normalized = text?.trim();
    if (!normalized) return [];
    const segments = [];
    let remainder = normalized;
    while (remainder.length > STREAMING_HARD_LIMIT) {
      const next = this.extractStreamingChunk(remainder, false);
      if (!next || !next.chunk) break;
      segments.push(next.chunk);
      remainder = next.remainder;
    }
    if (remainder.trim()) segments.push(remainder.trim());
    return segments;
  }

  // ── Speech queue (same as asteriskBridge) ──────────────────────────

  async enqueueSpeech(text) {
    if (!text || !text.trim()) return;
    const segments = this.splitSpeechForQueue(text);
    this.audioQueue.push(...segments);
    if (this.isSpeaking) return;
    this.isSpeaking = true;
    try {
      while (this.audioQueue.length > 0) {
        const nextChunk = this.audioQueue.shift();
        const token = this.currentSpeechToken;
        await this.speakResponse(nextChunk, token);
        if (this.audioQueue.length > 0 && token === this.currentSpeechToken) {
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      }
    } finally {
      this.isSpeaking = false;
    }
  }

  // ── Check-in & thinking phrases (same as asteriskBridge) ──────────

  isCheckInPhrase(message) {
    const lowerMessage = message.toLowerCase().trim();
    const checkInPhrases = [
      "hello", "hello?", "hello hello", "hi", "hi?", "hey", "hey?",
      "are you there", "are you there?", "you there", "you there?",
      "can you hear me", "can you hear me?", "anyone there", "anyone there?",
      "हेलो", "हैलो", "सुन रहे हो", "क्या आप सुन रहे हैं",
    ];
    return checkInPhrases.some(phrase =>
      lowerMessage === phrase || lowerMessage === phrase + "?" || lowerMessage.replace(/\?+/g, "") === phrase
    );
  }

  getThinkingPhrase() {
    const phrases = {
      en: ["Let me check that for you.", "One moment please.", "Sure, let me look into that.", "Hmm, let me think about that.", "Give me just a second.", "Let me find that out for you."],
      hi: ["एक मिनट, मैं देखती हूँ।", "जी, एक सेकंड।", "बिल्कुल, मैं चेक करती हूँ।", "रुकिए, मैं देखती हूँ।", "एक पल, मैं पता करती हूँ।", "जी हाँ, एक सेकंड दीजिए।"],
    };
    const pool = phrases[this.language] || phrases.en;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  resolveElevenLabsModel() {
    const configuredModel = this.voiceModel || "eleven_multilingual_v2";
    const isOldTurbo = configuredModel === "eleven_turbo_v2";
    const isNonEnglish = this.language && this.language !== "en";
    if (isOldTurbo && isNonEnglish) return "eleven_multilingual_v2";
    return configuredModel;
  }

  // ── Process user input (same flow engine + LLM logic) ─────────────

  async processUserInput() {
    if (this.isProcessing || !this.transcript) return;
    this.isProcessing = true;
    const userMessage = this.transcript.trim();
    this.transcript = "";

    console.log(`[${this.callSid}] Processing: "${userMessage}"`);

    try {
      if (this.isCheckInPhrase(userMessage)) {
        if (this.currentStepId) {
          const ack = this.language === "hi" ? "जी हाँ, मैं यहाँ हूँ। कृपया बताइए।" : "Yes, I'm here. Please go ahead.";
          await this.speakResponse(ack);
          this.isProcessing = false;
          return;
        }
      }

      this.conversationHistory.push({ role: "user", content: userMessage });
      this.fullTranscript.push({ role: "user", content: userMessage, timestamp: new Date() });
      if (this.conversationHistory.length > 12) this.conversationHistory = this.conversationHistory.slice(-12);

      // State engine
      let fallingThroughFromFlow = false;
      if (this.flow && this.currentStepId) {
        try {
          const conversation = {
            currentStepId: this.currentStepId, language: this.language,
            collectedData: this.collectedData || {}, retryCount: this.retryCount || 0,
            maxRetries: 2, status: 'active', flowId: this.flowId, agentConfig: this.agentConfig || {},
          };

          const turnResult = stateEngine.processTurn({ conversation, userInput: userMessage, flow: this.flow });

          if (turnResult) {
            if (turnResult.nextStepId) this.currentStepId = turnResult.nextStepId;
            if (turnResult.dataPatch && Object.keys(turnResult.dataPatch).length > 0) {
              this.collectedData = { ...this.collectedData, ...turnResult.dataPatch };
              this.customerContext = { ...this.customerContext, ...turnResult.dataPatch };
            }
            this.retryCount = turnResult.retryCount || 0;

            // Auto-skip steps with already collected data
            let advanceCount = 0;
            while (this.currentStepId && this.flow.steps?.[this.currentStepId] && advanceCount < 10) {
              const nextStep = this.flow.steps[this.currentStepId];
              const nextField = nextStep.field || nextStep.collect;
              if (nextField && nextStep.type === 'input' && this.collectedData[nextField]) {
                this.currentStepId = nextStep.onSuccess || nextStep.next || null;
                advanceCount++;
                continue;
              }
              break;
            }

            const isFlowEnding = turnResult.isEnd || turnResult.status === 'complete' || !this.currentStepId;

            if (isFlowEnding) {
              this.currentStepId = null;
              if (turnResult.text) {
                await this.enqueueSpeech(turnResult.text);
                this.conversationHistory.push({ role: 'assistant', content: turnResult.text });
                this.fullTranscript.push({ role: 'assistant', content: turnResult.text, timestamp: new Date() });
              }
              fallingThroughFromFlow = true;
            } else {
              if (turnResult.text) {
                await this.enqueueSpeech(turnResult.text);
                this.conversationHistory.push({ role: 'assistant', content: turnResult.text });
                this.fullTranscript.push({ role: 'assistant', content: turnResult.text, timestamp: new Date() });
              }

              // Auto-advance through message/action steps
              let autoAdvanceCount = 0;
              while (this.currentStepId && this.flow.steps?.[this.currentStepId] && autoAdvanceCount < 10) {
                const step = this.flow.steps[this.currentStepId];
                if (step.type !== 'message' && step.type !== 'action') break;
                if (step.isEnd || !step.next) {
                  this.currentStepId = null;
                  if (step.text) {
                    const endText = typeof step.text === 'object' ? (step.text[this.language] || step.text.en || '') : step.text;
                    if (endText) {
                      await this.enqueueSpeech(endText);
                      this.conversationHistory.push({ role: 'assistant', content: endText });
                      this.fullTranscript.push({ role: 'assistant', content: endText, timestamp: new Date() });
                    }
                  }
                  break;
                }
                const nextId = step.next;
                this.currentStepId = nextId;
                autoAdvanceCount++;
                const newStep = this.flow.steps[nextId];
                if (newStep) {
                  const tempConv = { ...conversation, currentStepId: nextId, collectedData: { ...this.collectedData } };
                  const stepText = stateEngine.getCurrentStepText(this.flow, tempConv);
                  if (stepText) {
                    await this.enqueueSpeech(stepText);
                    this.conversationHistory.push({ role: 'assistant', content: stepText });
                    this.fullTranscript.push({ role: 'assistant', content: stepText, timestamp: new Date() });
                  }
                }
              }

              if (this.currentStepId) { this.isProcessing = false; return; }
              fallingThroughFromFlow = true;
            }
          }
        } catch (stateError) {
          console.warn(`⚠️ [${this.callSid}] State engine failed, falling back to LLM: ${stateError.message}`);
        }
      }

      // LLM fallback
      const t0 = Date.now();
      if (!fallingThroughFromFlow) {
        await this.enqueueSpeech(this.getThinkingPhrase());
      }

      const stream = await aiAgentService.processMessageStream(
        userMessage, this.agentId, this.customerContext || {}, this.conversationHistory,
        { language: this.language, systemPrompt: this.systemPrompt, useRAG: this.knowledgeBaseFiles.length > 0, agentId: this.agentId },
      );

      let fullResponse = "";
      let streamBuffer = "";
      let updatedContext = null;

      for await (const chunk of stream) {
        if (chunk.type === "context") { updatedContext = chunk.customerContext; continue; }
        if (chunk.type === "content") {
          fullResponse += chunk.content;
          streamBuffer += chunk.content;
          let extracted = this.extractStreamingChunk(streamBuffer, false);
          while (extracted) {
            await this.enqueueSpeech(extracted.chunk);
            streamBuffer = extracted.remainder;
            extracted = this.extractStreamingChunk(streamBuffer, false);
          }
        }
        if (chunk.type === "done" || chunk.type === "error") break;
      }

      if (streamBuffer.trim()) await this.enqueueSpeech(streamBuffer.trim());

      const aiResponse = fullResponse || "I couldn't process that. Please try again.";
      if (updatedContext) this.customerContext = { ...this.customerContext, ...updatedContext };

      const detectedLang = detectResponseLanguage(aiResponse);
      if (detectedLang && detectedLang !== this.language) {
        this.language = detectedLang;
        if (this.deepgramConnection) { this.deepgramConnection.finish(); await this.initDeepgram(); }
      }

      this.conversationHistory.push({ role: "assistant", content: aiResponse });
      this.fullTranscript.push({ role: "assistant", content: aiResponse, timestamp: new Date() });
    } catch (error) {
      console.error(`[${this.callSid}] Processing error:`, error);
      await this.speakResponse("Sorry, I encountered an error. Please try again.");
    } finally {
      this.isProcessing = false;
    }
  }

  // ── TTS + audio streaming to Twilio ───────────────────────────────

  async speakResponse(text, token = this.currentSpeechToken) {
    const resolvedVoiceModel = this.voiceProvider === "ElevenLabs" ? this.resolveElevenLabsModel() : this.voiceModel;

    try {
      let audioBuffer;
      let inputFormat = null;

      if (this.voiceProvider === "ElevenLabs") {
        audioBuffer = await ttsService.speakWithElevenLabs(text, this.voice, resolvedVoiceModel || "eleven_multilingual_v2");
        inputFormat = { rawFormat: "s16le", sampleRate: 16000, channels: 1 };
      } else if (this.voiceProvider === "Tabbly") {
        audioBuffer = await ttsService.speakWithTabbly(text, this.voice, this.voiceModel || "tabbly-tts");
      } else {
        const audioBase64 = await ttsService.speak(text, this.language, this.voice, this.voiceModel);
        if (audioBase64) audioBuffer = Buffer.from(audioBase64, "base64");
        if (this.voiceModel?.includes("v3")) {
          inputFormat = { rawFormat: "wav", sampleRate: 8000, channels: 1 };
        }
      }

      if (!audioBuffer) {
        console.error(`[${this.callSid}] No audio from TTS (${this.voiceProvider})`);
        return;
      }

      await this.streamAudioToTwilio(audioBuffer, { token, text, provider: this.voiceProvider, model: resolvedVoiceModel, inputFormat });
    } catch (error) {
      console.error(`[${this.callSid}] TTS error (${this.voiceProvider}):`, error.message);
    }
  }

  /**
   * Convert provider audio to slin16 8kHz using ffmpeg (same as asteriskBridge)
   */
  async convertToSlin16(inputBuffer, inputFormat = null) {
    return new Promise((resolve, reject) => {
      const ffmpegArgs = ["-hide_banner", "-loglevel", "error"];
      if (inputFormat?.rawFormat) {
        ffmpegArgs.push("-f", inputFormat.rawFormat, "-ar", String(inputFormat.sampleRate || 16000), "-ac", String(inputFormat.channels || 1));
      }
      const isAlready8kHz = inputFormat?.sampleRate === SAMPLE_RATE;
      ffmpegArgs.push("-i", "pipe:0", "-af",
        isAlready8kHz ? "highpass=f=200, lowpass=f=3400"
          : "highpass=f=200, lowpass=f=3400, equalizer=f=2000:t=q:w=1:g=3, dynaudnorm, aresample=resampler=soxr:precision=28",
        "-ar", String(SAMPLE_RATE), "-ac", "1", "-acodec", "pcm_s16le", "-f", "s16le", "pipe:1");

      const ffmpeg = spawn(ffmpegPath.path, ffmpegArgs, { stdio: ["pipe", "pipe", "pipe"] });
      const chunks = [];
      ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
      ffmpeg.on("close", (code) => {
        if (code === 0) resolve(Buffer.concat(chunks));
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });
      ffmpeg.on("error", reject);
      ffmpeg.stdin.write(inputBuffer);
      ffmpeg.stdin.end();
    });
  }

  /**
   * Stream audio back to Twilio via Media Stream WebSocket.
   * Converts TTS audio → slin16 8kHz → mulaw → base64 → JSON.
   * Real-time pacing: 20ms per frame to match telephony clocking.
   */
  async streamAudioToTwilio(audioBuffer, playbackContext = {}) {
    const { token = this.currentSpeechToken, text = "", inputFormat = null } = playbackContext;
    const FRAME_SIZE = 320; // 20ms at 8kHz slin16
    const FRAME_DURATION_MS = 20;

    try {
      const slinData = await this.convertToSlin16(audioBuffer, inputFormat);

      // Split into 20ms frames
      const frames = [];
      for (let i = 0; i < slinData.length; i += FRAME_SIZE) {
        let frame = slinData.subarray(i, i + FRAME_SIZE);
        if (frame.length < FRAME_SIZE) {
          frame = Buffer.concat([frame, Buffer.alloc(FRAME_SIZE - frame.length, 0)]);
        }
        frames.push(frame);
      }

      if (this.recording) this.recording.markAISpeechStart();
      this.currentSpeechText = text;
      this.clearPendingBargeIn();
      const playbackStart = Date.now();
      this.speechStartedAt = playbackStart;

      for (let i = 0; i < frames.length; i++) {
        const targetAt = playbackStart + i * FRAME_DURATION_MS;
        const waitMs = targetAt - Date.now();
        if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));

        // Barge-in cancellation
        if (token !== this.currentSpeechToken) {
          console.log(`[${this.callSid}] playback cancelled (barge-in)`);
          break;
        }

        if (!this.ws || this.ws.readyState !== 1) break;

        // Convert this frame: linear16 → mulaw → base64 → send
        this.sendAudioToTwilio(frames[i]);

        if (this.recording) this.recording.addAIAudio(frames[i], i);
      }
    } catch (error) {
      console.error(`[${this.callSid}] Audio streaming to Twilio failed:`, error.message);
    } finally {
      this.resetPlaybackTracking();
    }
  }

  // ── Welcome message ───────────────────────────────────────────────

  async playWelcome() {
    const welcomeMessage = this.welcomeMessage || "Hello! I'm your AI assistant. How can I help you today?";
    console.log(`[${this.callSid}] Playing welcome message`);

    const detectedLang = detectResponseLanguage(welcomeMessage);
    if (detectedLang && detectedLang !== this.language) {
      this.language = detectedLang;
      if (this.deepgramConnection) { this.deepgramConnection.finish(); await this.initDeepgram(); }
    }

    await this.speakResponse(welcomeMessage);
  }

  // ── Cleanup & finalize ────────────────────────────────────────────

  async cleanup() {
    console.log(`[${this.callSid}] Cleaning up session`);

    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    if (this.deepgramConnection) {
      try { this.deepgramConnection.finish(); } catch (e) { /* ignore */ }
    }

    // Finalize call record
    if (this.callDbId) {
      const duration = Math.floor((Date.now() - this.callStartTime) / 1000);

      let estimatedInputTokens = 0;
      let estimatedOutputTokens = 0;
      for (const entry of this.fullTranscript) {
        const tokenCount = Math.ceil((entry.content?.length || 0) / 4);
        if (entry.role === "user") estimatedInputTokens += tokenCount;
        else if (entry.role === "assistant") estimatedOutputTokens += tokenCount;
      }
      estimatedInputTokens += 500;

      let callSummary = null;
      let summaryInputTokens = 0;
      let summaryOutputTokens = 0;
      if (this.analyticsConfig?.summarization) {
        const summaryResult = await generateCallSummary(this.fullTranscript, this.customerContext);
        if (summaryResult) {
          callSummary = summaryResult.summary;
          summaryInputTokens = summaryResult.tokens?.input || 0;
          summaryOutputTokens = summaryResult.tokens?.output || 0;
        }
      }

      const totalInputTokens = estimatedInputTokens + summaryInputTokens;
      const totalOutputTokens = estimatedOutputTokens + summaryOutputTokens;

      const telephonyCost = await Call.calculateTelephonyCost(duration);
      const llmCostUSD = Call.calculateLLMCost(totalInputTokens, totalOutputTokens);
      const totalCost = await Call.calculateTotalCost(duration, totalInputTokens, totalOutputTokens);

      let recordingUrl = null;
      if (this.recording) {
        const recordingResult = await recordingService.stopAndUpload(this.callSid);
        if (recordingResult) recordingUrl = recordingResult.url;
      }

      const rawData = {
        id: this.callSid,
        agent_id: this.agentId?.toString() || null,
        conversation_duration: duration,
        total_cost: totalCost,
        transcript: this.fullTranscript.map(e => `${e.role}: ${e.content}`).join('\n'),
        summary: callSummary,
        status: "completed",
        provider: "twilio",
        telephony_data: {
          duration: duration.toString(),
          to_number: this.callerNumber || this.calledNumber,
          from_number: this.calledNumber,
          recording_url: recordingUrl,
          provider_call_id: this.callSid,
          call_type: "inbound",
          provider: "twilio",
        },
      };

      Call.findByIdAndUpdate(this.callDbId, {
        status: "completed",
        endedAt: new Date(),
        duration,
        telephonyCost,
        llmTokens: { input: estimatedInputTokens, output: estimatedOutputTokens },
        llmCostUSD,
        cost: totalCost,
        hangupBy: "user",
        transcript: this.fullTranscript,
        transcriptCount: this.fullTranscript.length,
        customerContext: this.customerContext,
        rawData,
        recordingUrl,
      }).then(async () => {
        console.log(`[${this.callSid}] Call finalized: duration=${duration}s, cost=₹${totalCost.toFixed(2)}`);
        if (this.userId && totalCost > 0) {
          await deductCallCost(this.userId, totalCost, this.callSid,
            `Call ${this.callSid.substring(0, 8)} — ${duration}s, ₹${totalCost.toFixed(2)}`);
        }
      }).catch(err => console.error(`[${this.callSid}] Failed to finalize call:`, err.message));
    }
  }
}

/**
 * Twilio Bridge Server — manages TwilioCallSession instances
 */
class TwilioBridgeServer {
  constructor() {
    this.sessions = new Map(); // callSid → TwilioCallSession
    this.pendingCalls = new Map(); // callSid → { agentId, callerNumber, calledNumber, conversationType }
  }

  registerPendingCall(callSid, agentId, metadata = {}) {
    this.pendingCalls.set(callSid, { agentId, ...metadata });
    console.log(`[TwilioBridge] Registered pending call: ${callSid} → Agent ${agentId}`);
  }

  /**
   * Handle incoming Twilio Media Stream WebSocket connection
   */
  async handleWebSocket(ws, callSid) {
    const pending = this.pendingCalls.get(callSid);
    if (!pending) {
      console.error(`[TwilioBridge] No pending call found for ${callSid}`);
      ws.close(1008, "No pending call");
      return;
    }

    const session = new TwilioCallSession(callSid, ws, pending.agentId);
    session.callerNumber = pending.callerNumber || null;
    session.calledNumber = pending.calledNumber || null;
    this.sessions.set(callSid, session);
    this.pendingCalls.delete(callSid);

    try {
      await session.initializeAgent();
      await session.initDeepgram();
      await session.createCallRecord(pending.conversationType || "twilio inbound");

      // Play welcome once stream starts (handled on 'start' event completion)
      let welcomePlayed = false;

      ws.on("message", async (msg) => {
        session.handleMediaMessage(msg.toString());

        // Play welcome after stream starts
        if (!welcomePlayed && session.streamSid) {
          welcomePlayed = true;
          await session.playWelcome();
        }
      });

      ws.on("close", () => {
        console.log(`[TwilioBridge] WebSocket closed: ${callSid}`);
        session.cleanup();
        this.sessions.delete(callSid);
      });

      ws.on("error", (error) => {
        console.error(`[TwilioBridge] WebSocket error (${callSid}):`, error.message);
        session.cleanup();
        this.sessions.delete(callSid);
      });

    } catch (error) {
      console.error(`[TwilioBridge] Failed to initialize session ${callSid}:`, error.message);
      ws.close(1011, "Initialization failed");
      this.sessions.delete(callSid);
    }
  }

  getActiveCalls() {
    return Array.from(this.sessions.entries()).map(([callSid, session]) => ({
      callSid,
      agentId: session.agentId,
      agentName: session.agentName,
      startTime: session.callStartTime,
    }));
  }
}

const twilioBridgeServer = new TwilioBridgeServer();
export default twilioBridgeServer;
