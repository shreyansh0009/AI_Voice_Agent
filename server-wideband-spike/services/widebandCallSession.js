import fs from "fs";
import { EventEmitter } from "events";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { createClient } from "@deepgram/sdk";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import Agent from "../../server/models/Agent.js";
import Call from "../../server/models/Call.js";
import PhoneNumber from "../../server/models/PhoneNumber.js";
import aiAgentService from "../../server/services/aiAgent.service.js";
import stateEngine from "../../server/services/stateEngine.js";
import ttsService from "../../server/services/tts.service.js";
import { hasEnoughBalance } from "../../server/services/walletService.js";
import RtpMediaSession from "./rtpMediaSession.js";
import { splitIntoFrames } from "../utils/rtp.js";

const MIN_STREAMING_CHUNK_CHARS = 40;
const STREAMING_CLAUSE_THRESHOLD = 180;
const STREAMING_HARD_LIMIT = 220;
const ECHO_GUARD_MS = 1500;
const BARGE_IN_CONFIRM_WINDOW_MS = 500;
const MIN_BARGE_IN_CHARS = 8;

function detectResponseLanguage(text) {
  if (!text || text.length < 10) return null;
  const devanagariMatches = text.match(/[\u0900-\u097F]/g) || [];
  const latinMatches = text.match(/[a-zA-Z]/g) || [];
  const totalChars = devanagariMatches.length + latinMatches.length;
  if (totalChars < 10) return null;
  return devanagariMatches.length / totalChars > 0.4 ? "hi" : "en";
}

function normalizeSpeechText(text = "") {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countNormalizedWords(text = "") {
  return text ? text.split(" ").filter(Boolean).length : 0;
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

class WidebandCallSession extends EventEmitter {
  constructor({ ari, inboundChannel, calledNumber, config, rtpPort }) {
    super();
    this.ari = ari;
    this.inboundChannel = inboundChannel;
    this.uuid = inboundChannel.id;
    this.calledNumber = calledNumber;
    this.config = config;
    this.rtpPort = rtpPort;
    this.rtpSession = new RtpMediaSession(this.uuid, {
      sampleRate: config.sampleRate,
      frameDurationMs: config.frameDurationMs,
      frameSize: config.frameSize,
      bindHost: config.rtpHost,
      bindPort: rtpPort,
      payloadType: config.rtpPayloadType,
      swap16: config.rtpSwap16,
      verbose: config.logging.verboseRtp,
    });
    this.deepgramConnection = null;
    this.audioQueue = [];
    this.isSpeaking = false;
    this.currentSpeechToken = 0;
    this.userIsSpeaking = false;
    this.currentSpeechText = "";
    this.speechStartedAt = null;
    this.pendingBargeIn = null;
    this.transcript = "";
    this.isProcessing = false;
    this.silenceTimer = null;
    this.conversationHistory = [];
    this.customerContext = {};
    this.fullTranscript = [];
    this.callStartTime = Date.now();
    this.callDbId = null;
    this.externalMediaChannelId = null;
    this.bridgeId = null;
    this.agentId = null;
    this.userId = null;
    this.flowId = null;
    this.startStepId = null;
    this.currentStepId = null;
    this.collectedData = {};
    this.retryCount = 0;
    this.agentConfig = {};
    this.welcomeMessage = null;
    this.systemPrompt = null;
    this.flow = null;
    this.language = "en";
    this.voice = "anushka";
    this.voiceProvider = "Sarvam";
    this.voiceModel = "bulbul:v2";
    this.analyticsConfig = { summarization: false, extraction: false };
    this.knowledgeBaseFiles = [];
    this.closed = false;
    this.rtpSession.on("audio", (payload) => this.handleInboundAudio(payload));
    this.rtpSession.on("error", (error) => {
      console.error(`[${this.uuid}] RTP error:`, error.message);
    });
  }

  async start() {
    console.log(`[${this.uuid}] Starting wideband spike session`, {
      calledNumber: this.calledNumber,
      rtpPort: this.rtpPort,
    });
    await this.initializeAgent();
    await this.attachMedia();
    await this.createCallRecord();
    await this.initDeepgram();
    await this.playWelcome();
  }

  async initializeAgent() {
    const cleanedNumber = PhoneNumber.cleanNumber(this.calledNumber);
    const phoneRecord = await PhoneNumber.findOne({ number: cleanedNumber });
    let agentId = phoneRecord?.linkedAgentId?.toString() || null;

    if (!agentId) {
      agentId = process.env.DEFAULT_PHONE_AGENT_ID || null;
    }
    if (!agentId) {
      throw new Error(`No agent configured for DID: ${this.calledNumber}`);
    }

    const agent = await Agent.findById(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const flowPath = new URL(`../../server/flows/${agent.flowId}.json`, import.meta.url);
    const flowContent = fs.readFileSync(flowPath, "utf-8");
    const flow = JSON.parse(flowContent);
    if (!flow?.startStep) {
      throw new Error(`Invalid flow: ${agent.flowId}`);
    }

    this.agentId = agentId;
    this.userId = agent.userId;
    this.flowId = agent.flowId;
    this.startStepId = flow.startStep;
    this.currentStepId = flow.startStep;
    this.flow = flow;
    this.agentConfig = agent.agentConfig || {};
    this.knowledgeBaseFiles = agent.knowledgeBaseFiles || [];
    this.analyticsConfig = agent.analyticsConfig || this.analyticsConfig;
    this.welcomeMessage =
      agent.welcome ||
      flow.steps?.greeting?.text?.en ||
      "Hello! How can I help you today?";
    this.language = agent.supportedLanguages?.[0] || "en";
    this.voice = agent.voice || "anushka";
    this.voiceProvider = agent.voiceProvider || "Sarvam";
    this.voiceModel = agent.voiceModel || "bulbul:v2";
    this.systemPrompt = agent.prompt || "You are a helpful AI assistant.";

    if (this.userId) {
      const { allowed, balance, required } = await hasEnoughBalance(this.userId);
      if (!allowed) {
        const err = new Error(
          `Insufficient wallet balance: ${balance.toFixed(4)} < ${required.toFixed(4)}`,
        );
        err.code = "INSUFFICIENT_BALANCE";
        throw err;
      }
    }

    console.log(`[${this.uuid}] Agent ready for wideband spike`, {
      agentId: this.agentId,
      voiceProvider: this.voiceProvider,
      voice: this.voice,
      model: this.voiceModel,
      language: this.language,
    });
  }

  async attachMedia() {
    await this.rtpSession.start();
    await this.ari.channels.answer({ channelId: this.inboundChannel.id });

    const bridge = this.ari.Bridge();
    bridge.type = "mixing";
    await bridge.create();
    this.bridgeId = bridge.id;
    await bridge.addChannel({ channel: this.inboundChannel.id });

    const externalMedia = await this.ari.channels.externalMedia({
      app: this.config.ari.appName,
      external_host: `${this.config.rtpAdvertiseHost}:${this.rtpSession.bindPort}`,
      format: "slin16",
      encapsulation: "rtp",
      transport: "udp",
      connection_type: "client",
      direction: "both",
    });

    this.externalMediaChannelId = externalMedia.id;
    await bridge.addChannel({ channel: externalMedia.id });

    const localAddress = await this.getChannelVar(
      externalMedia.id,
      "UNICASTRTP_LOCAL_ADDRESS",
    );
    const localPort = await this.getChannelVar(
      externalMedia.id,
      "UNICASTRTP_LOCAL_PORT",
    );

    if (localAddress && localPort) {
      this.rtpSession.setAsteriskTarget(localAddress, parseInt(localPort, 10));
    }

    console.log(`[${this.uuid}] Wideband media attached`, {
      bridgeId: this.bridgeId,
      externalMediaChannelId: this.externalMediaChannelId,
      localRtpPort: this.rtpSession.bindPort,
      asteriskTarget: `${localAddress}:${localPort}`,
    });
  }

  async getChannelVar(channelId, variable) {
    try {
      const response = await this.ari.channels.getChannelVar({
        channelId,
        variable,
      });
      return response?.value || null;
    } catch (error) {
      console.warn(`[${this.uuid}] Failed to read channel var ${variable}:`, error.message);
      return null;
    }
  }

  async createCallRecord() {
    const callRecord = await Call.create({
      callId: this.uuid,
      executionId: this.uuid.substring(0, 8),
      agentId: this.agentId,
      userId: this.userId,
      calledNumber: this.calledNumber,
      callerNumber:
        this.inboundChannel?.caller?.number ||
        this.inboundChannel?.connected?.number ||
        null,
      userNumber:
        this.inboundChannel?.caller?.number ||
        this.inboundChannel?.connected?.number ||
        null,
      status: "answered",
      startedAt: new Date(this.callStartTime),
      conversationType: "asterisk externalMedia spike",
      provider: "Asterisk-ARI-Spike",
      rawData: {
        uuid: this.uuid,
        bridgeId: this.bridgeId,
        externalMediaChannelId: this.externalMediaChannelId,
        calledNumber: this.calledNumber,
        sampleRate: this.config.sampleRate,
        format: "slin16",
      },
    });

    this.callDbId = callRecord._id;
  }

  async initDeepgram() {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error("DEEPGRAM_API_KEY not configured");
    }

    const deepgram = createClient(apiKey);
    this.deepgramConnection = deepgram.listen.live({
      model: "nova-2",
      language: this.language === "hi" ? "hi" : "en-IN",
      encoding: "linear16",
      sample_rate: this.config.sampleRate,
      channels: 1,
      smart_format: true,
      punctuate: true,
      interim_results: true,
      utterance_end_ms: 1200,
      vad_events: true,
      endpointing: 400,
    });

    this.deepgramConnection.on("Results", (data) => {
      const transcript = data.channel?.alternatives?.[0]?.transcript || "";
      const isFinal = data.is_final;

      if (!transcript) return;

      const isRealSpeech =
        transcript.length >= 3 && /[a-zA-Z\u0900-\u097F]/.test(transcript);

      if (isRealSpeech && this.isSpeaking && !this.userIsSpeaking) {
        const decision = this.evaluateBargeIn(transcript, isFinal);
        if (decision.confirmed) {
          this.userIsSpeaking = true;
          this.currentSpeechToken += 1;
          this.audioQueue.length = 0;
          console.log(`[${this.uuid}] confirmed_barge_in`, { transcript });
        } else if (decision.reason) {
          console.log(`[${this.uuid}] ${decision.reason}`, { transcript });
        }
      }

      if (isFinal) {
        this.transcript += (this.transcript ? " " : "") + transcript;
        if (transcript.length > 5 && !this.isProcessing) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = setTimeout(() => {
            if (!this.isProcessing && this.transcript) {
              this.processUserInput();
            }
          }, 300);
        }
      }
    });

    this.deepgramConnection.on("UtteranceEnd", async () => {
      this.userIsSpeaking = false;
      this.pendingBargeIn = null;
      clearTimeout(this.silenceTimer);
      if (this.transcript && !this.isProcessing) {
        await this.processUserInput();
      }
    });

    this.deepgramConnection.on("Error", (error) => {
      console.error(`[${this.uuid}] Deepgram error:`, error);
    });
  }

  clearPendingBargeIn() {
    this.pendingBargeIn = null;
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

    return isGrowing
      ? { confirmed: true, reason: "confirmed_barge_in" }
      : { confirmed: false, reason: "ignored_short_interim" };
  }

  handleInboundAudio(audioData) {
    if (
      this.deepgramConnection &&
      this.deepgramConnection.getReadyState() === 1
    ) {
      this.deepgramConnection.send(audioData);
    }
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
      if (!next?.chunk) break;
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
    return isTurboModel && isNonEnglish
      ? "eleven_multilingual_v2"
      : configuredModel;
  }

  async enqueueSpeech(text) {
    if (!text || !text.trim()) return;
    this.audioQueue.push(...this.splitSpeechForQueue(text));
    if (this.isSpeaking) return;

    this.isSpeaking = true;
    try {
      while (this.audioQueue.length > 0) {
        const nextChunk = this.audioQueue.shift();
        const token = this.currentSpeechToken;
        await this.speakResponse(nextChunk, token);
      }
    } finally {
      this.isSpeaking = false;
    }
  }

  isCheckInPhrase(message) {
    const lowerMessage = message.toLowerCase().trim();
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
      "can you hear me",
      "हेलो",
      "हैलो",
      "सुन रहे हो",
      "क्या आप सुन रहे हैं",
    ];
    return checkInPhrases.some(
      (phrase) =>
        lowerMessage === phrase ||
        lowerMessage === `${phrase}?` ||
        lowerMessage.replace(/\?+/g, "") === phrase,
    );
  }

  async processUserInput() {
    if (this.isProcessing || !this.transcript) return;

    this.isProcessing = true;
    const userMessage = this.transcript.trim();
    this.transcript = "";

    try {
      if (aiAgentService._pendingExtraction) {
        const prevCtx = await aiAgentService._pendingExtraction;
        if (prevCtx && typeof prevCtx === "object") {
          this.customerContext = { ...this.customerContext, ...prevCtx };
        }
        aiAgentService._pendingExtraction = null;
      }

      if (this.isCheckInPhrase(userMessage)) {
        await this.speakResponse("जी हाँ, मैं यहाँ हूँ। कृपया बताइए।");
        return;
      }

      this.conversationHistory.push({ role: "user", content: userMessage });
      this.fullTranscript.push({
        role: "user",
        content: userMessage,
        timestamp: new Date(),
      });

      if (this.conversationHistory.length > 12) {
        this.conversationHistory = this.conversationHistory.slice(-12);
      }

      if (this.flow && this.currentStepId) {
        try {
          const conversation = {
            currentStepId: this.currentStepId,
            language: this.language,
            collectedData: this.collectedData || {},
            retryCount: this.retryCount || 0,
            maxRetries: 2,
            status: "active",
            flowId: this.flowId,
            agentConfig: this.agentConfig || {},
          };

          const turnResult = stateEngine.processTurn({
            conversation,
            userInput: userMessage,
            flow: this.flow,
          });

          if (turnResult?.text) {
            if (turnResult.nextStepId) {
              this.currentStepId = turnResult.nextStepId;
            }
            if (turnResult.dataPatch && Object.keys(turnResult.dataPatch).length > 0) {
              this.collectedData = { ...this.collectedData, ...turnResult.dataPatch };
              this.customerContext = { ...this.customerContext, ...turnResult.dataPatch };
            }
            this.retryCount = turnResult.retryCount || 0;
            await this.enqueueSpeech(turnResult.text);
            this.conversationHistory.push({
              role: "assistant",
              content: turnResult.text,
            });
            this.fullTranscript.push({
              role: "assistant",
              content: turnResult.text,
              timestamp: new Date(),
            });
            return;
          }
        } catch (stateError) {
          console.warn(`[${this.uuid}] State engine fallback:`, stateError.message);
        }
      }

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

      let fullResponse = "";
      let updatedContext = null;
      let ttsBuffer = "";
      let flowTextSpoken = false;

      for await (const chunk of stream) {
        if (chunk.type === "flow_text") {
          flowTextSpoken = true;
          this.enqueueSpeech(chunk.content);
          continue;
        }

        if (chunk.type === "context") {
          updatedContext = chunk.customerContext;
          continue;
        }

        if (chunk.type === "content") {
          if (flowTextSpoken && fullResponse.length < 10) {
            fullResponse += chunk.content;
            continue;
          }

          fullResponse += chunk.content;
          ttsBuffer += chunk.content;

          let flushResult = this.extractStreamingChunk(ttsBuffer, false);
          while (flushResult?.chunk) {
            ttsBuffer = flushResult.remainder;
            this.enqueueSpeech(flushResult.chunk);
            flushResult = this.extractStreamingChunk(ttsBuffer, false);
          }
        }

        if (chunk.type === "done" || chunk.type === "error") {
          break;
        }
      }

      const remainingChunk = this.extractStreamingChunk(ttsBuffer, true);
      if (remainingChunk?.chunk) {
        this.enqueueSpeech(remainingChunk.chunk);
      }

      const aiResponse =
        fullResponse || "I couldn't process that. Please try again.";

      if (updatedContext) {
        this.customerContext = {
          ...this.customerContext,
          ...updatedContext,
        };
      }

      const detectedLang = detectResponseLanguage(aiResponse);
      if (detectedLang && detectedLang !== this.language) {
        this.language = detectedLang;
        if (this.deepgramConnection) {
          this.deepgramConnection.finish();
          await this.initDeepgram();
        }
      }

      this.conversationHistory.push({
        role: "assistant",
        content: aiResponse,
      });
      this.fullTranscript.push({
        role: "assistant",
        content: aiResponse,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error(`[${this.uuid}] Processing error:`, error);
      await this.speakResponse("Sorry, I encountered an error. Please try again.");
    } finally {
      this.isProcessing = false;
    }
  }

  async speakResponse(text, token = this.currentSpeechToken) {
    const resolvedVoiceModel =
      this.voiceProvider === "ElevenLabs"
        ? this.resolveElevenLabsModel()
        : this.voiceModel;

    console.log(`[${this.uuid}] Wideband TTS requested`, {
      provider: this.voiceProvider,
      model: resolvedVoiceModel,
      textLength: text.length,
    });

    try {
      let audioBuffer;
      let inputFormat = null;

      if (this.voiceProvider === "ElevenLabs") {
        audioBuffer = await ttsService.speakWithElevenLabs(
          text,
          this.voice,
          resolvedVoiceModel || "eleven_multilingual_v2",
        );
        inputFormat = {
          rawFormat: "s16le",
          sampleRate: 16000,
          channels: 1,
        };
      } else if (this.voiceProvider === "Tabbly") {
        audioBuffer = await ttsService.speakWithTabbly(
          text,
          this.voice,
          this.voiceModel || "tabbly-tts",
        );
      } else {
        const audioBase64 = await ttsService.speak(
          text,
          this.language,
          this.voice,
          this.voiceModel,
        );
        if (audioBase64) {
          audioBuffer = Buffer.from(audioBase64, "base64");
        }
      }

      if (!audioBuffer) return;

      await this.streamAudioToRtp(audioBuffer, {
        token,
        text,
        provider: this.voiceProvider,
        model: resolvedVoiceModel,
        inputFormat,
      });
    } catch (error) {
      console.error(`[${this.uuid}] Wideband TTS error:`, error.message);
      await this.sendSilence(10);
    }
  }

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
      ffmpegArgs.push(
        "-i",
        "pipe:0",
        "-ar",
        String(this.config.sampleRate),
        "-ac",
        "1",
        "-acodec",
        "pcm_s16le",
        "-f",
        "s16le",
        "pipe:1",
      );

      const ffmpeg = spawn(ffmpegPath.path, ffmpegArgs, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      const chunks = [];
      const stderrChunks = [];
      ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
      ffmpeg.stderr.on("data", (data) => stderrChunks.push(data.toString()));
      ffmpeg.on("close", (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(
            new Error(
              stderrChunks.join("").trim() || `ffmpeg exited with code ${code}`,
            ),
          );
        }
      });
      ffmpeg.on("error", reject);
      ffmpeg.stdin.write(inputBuffer);
      ffmpeg.stdin.end();
    });
  }

  async sendSilence(frameCount) {
    try {
      await this.rtpSession.sendSilence(frameCount);
    } catch (error) {
      console.warn(`[${this.uuid}] Failed to send RTP silence:`, error.message);
    }
  }

  async streamAudioToRtp(audioBuffer, playbackContext = {}) {
    const {
      token = this.currentSpeechToken,
      text = "",
      provider = this.voiceProvider,
      model = this.voiceModel,
      inputFormat = null,
    } = playbackContext;

    const conversionStart = Date.now();
    const slinData = await this.convertToSlin16(audioBuffer, inputFormat);
    const frames = splitIntoFrames(slinData, this.config.frameSize);
    const estimatedDurationMs = frames.length * this.config.frameDurationMs;

    console.log(`[${this.uuid}] wideband conversion finished`, {
      provider,
      model,
      inputBytes: audioBuffer.length,
      outputBytes: slinData.length,
      frameCount: frames.length,
      estimatedDurationMs,
      conversionMs: Date.now() - conversionStart,
    });

    this.currentSpeechText = text;
    this.clearPendingBargeIn();
    const playbackStart = Date.now();
    this.speechStartedAt = playbackStart;

    for (let i = 0; i < frames.length; i += 1) {
      if (token !== this.currentSpeechToken) {
        console.log(`[${this.uuid}] wideband playback cancelled`, {
          reason: "confirmed_barge_in",
        });
        break;
      }

      const targetAt = playbackStart + i * this.config.frameDurationMs;
      const waitMs = targetAt - Date.now();
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      await this.rtpSession.sendFrame(frames[i], i === 0);
    }

    if (token === this.currentSpeechToken) {
      console.log(`[${this.uuid}] wideband playback completed`, {
        provider,
        model,
        frameCount: frames.length,
      });
    }
  }

  async playWelcome() {
    const detectedLang = detectResponseLanguage(this.welcomeMessage);
    if (detectedLang && detectedLang !== this.language) {
      this.language = detectedLang;
      if (this.deepgramConnection) {
        this.deepgramConnection.finish();
        await this.initDeepgram();
      }
    }
    await this.speakResponse(this.welcomeMessage);
  }

  async cleanup(reason = "normal") {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.silenceTimer);

    try {
      if (this.deepgramConnection) {
        this.deepgramConnection.finish();
      }
    } catch (error) {
      console.warn(`[${this.uuid}] Deepgram cleanup warning:`, error.message);
    }

    try {
      if (this.bridgeId) {
        await this.ari.bridges.destroy({ bridgeId: this.bridgeId });
      }
    } catch (error) {
      console.warn(`[${this.uuid}] Bridge cleanup warning:`, error.message);
    }

    try {
      if (this.externalMediaChannelId) {
        await this.ari.channels.hangup({ channelId: this.externalMediaChannelId });
      }
    } catch (error) {
      console.warn(`[${this.uuid}] External media hangup warning:`, error.message);
    }

    await this.rtpSession.close();

    if (this.callDbId) {
      const duration = Math.floor((Date.now() - this.callStartTime) / 1000);
      await Call.findByIdAndUpdate(this.callDbId, {
        status: reason === "error" ? "failed" : "completed",
        endedAt: new Date(),
        duration,
        hangupBy: "system",
        transcript: this.fullTranscript,
        transcriptCount: this.fullTranscript.length,
        customerContext: this.customerContext,
        rawData: {
          provider: "Asterisk-ARI-Spike",
          sampleRate: this.config.sampleRate,
          reason,
          bridgeId: this.bridgeId,
          externalMediaChannelId: this.externalMediaChannelId,
        },
      });
    }

    this.emit("closed", this.uuid);
  }
}

export default WidebandCallSession;
