import React, { useState, useRef, useEffect } from "react";
import { BiMicrophone, BiStop, BiVolumeFull, BiTrash } from "react-icons/bi";
import { createClient } from "@deepgram/sdk";
import axios from "axios";

const VoiceChat = ({
  systemPrompt,
  agentName = "AI Agent",
  agentId,
  welcomeMessage,
  useRAG = false,
  // LLM Configuration
  llmProvider = "Openai",
  llmModel = "gpt-4o-mini",
  maxTokens = 1007,
  temperature = 0.7,
  // Audio Configuration
  language = "English (India)",
  transcriberProvider = "Deepgram",
  transcriberModel = "nova-2",
  voiceProvider = "Sarvam",
  voiceModel = "bulbulv2",
  voice = "abhilash",
  bufferSize = 153,
  speedRate = 0.8,
}) => {
  /**
   * Maps human-readable language names to short language codes
   * Used for STT/TTS services that expect codes like "en", "hi", etc.
   */
  const languageNameToCode = (langName) => {
    const mapping = {
      "English (India)": "en",
      "English (US)": "en",
      "English (UK)": "en",
      English: "en",
      Hindi: "hi",
      Tamil: "ta",
      Telugu: "te",
      Kannada: "kn",
      Malayalam: "ml",
      Bengali: "bn",
      Marathi: "mr",
      Gujarati: "gu",
      Punjabi: "pa",
      Spanish: "es",
      French: "fr",
      German: "de",
    };
    // If it's already a short code (2 chars), return as-is
    if (langName && langName.length <= 3 && !langName.includes(" ")) {
      return langName.toLowerCase();
    }
    return mapping[langName] || "en"; // Default to English if unknown
  };

  // Initialize language from localStorage or default to prop (converted to code)
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    const saved = localStorage.getItem("voiceChat_selectedLanguage");
    // Convert saved value or language prop to short code
    return languageNameToCode(saved || language);
  });
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [conversation, setConversation] = useState([]);
  const [error, setError] = useState("");
  const [selectedVoice, setSelectedVoice] = useState(voice); // Voice selector from props
  const [ragEnabled, setRagEnabled] = useState(useRAG); // RAG toggle
  const [selectedLLM, setSelectedLLM] = useState(llmProvider.toLowerCase()); // 'openai' or 'agentforce'
  const [lastQuestion, setLastQuestion] = useState(null); // Track last question asked by agent
  const [silenceTimeoutId, setSilenceTimeoutId] = useState(null); // Timeout for silence detection

  // Update RAG enabled state when prop changes
  useEffect(() => {
    setRagEnabled(useRAG);
  }, [useRAG]);

  // Reset conversation when agent changes
  useEffect(() => {
    setConversation([]);
    setTranscript("");
    conversationHistoryRef.current = [];
  }, [agentId]);

  // Handle Welcome Message
  useEffect(() => {
    // Only set welcome message if conversation is empty
    if (
      welcomeMessage &&
      welcomeMessage.trim() &&
      conversation.length === 0 &&
      !isListening &&
      !isProcessing
    ) {
      // Add welcome message to conversation
      const welcomeMsg = { role: "assistant", content: welcomeMessage };
      setConversation([welcomeMsg]);
      conversationHistoryRef.current = [welcomeMsg];

      // Don't auto-speak - wait for user to say something first
      // The welcome message will be spoken as response to user's first message
    }
  }, [welcomeMessage, conversation.length, isListening, isProcessing]);

  // Continuous voice mode (auto-listen after speaking)
  const [continuousMode, setContinuousMode] = useState(() => {
    const saved = localStorage.getItem("voiceChat_continuousMode");
    return saved ? JSON.parse(saved) : false;
  });

  // Voice sensitivity for continuous mode (1-10 scale, higher = less sensitive)
  const [voiceSensitivity, setVoiceSensitivity] = useState(() => {
    const saved = localStorage.getItem("voiceChat_sensitivity");
    return saved ? parseInt(saved) : 5; // Default medium sensitivity
  });

  const [isCalibrating, setIsCalibrating] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0); // Current audio level for visualization (0-100)

  // Persistent memory for important information (survives beyond chat history)
  const [customerContext, setCustomerContext] = useState(() => {
    const saved = localStorage.getItem("voiceChat_customerContext");
    return saved
      ? JSON.parse(saved)
      : {
          name: "",
          phone: "",
          email: "",
          address: "",
          pincode: "",
          preferences: {},
          orderDetails: {},
          lastUpdated: null,
        };
  });
  // Synchronous ref for customer context to avoid race conditions when updating then immediately using it
  const customerContextRef = useRef(customerContext);

  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const deepgramRef = useRef(null);
  const conversationHistoryRef = useRef([]);
  const isRecordingRef = useRef(false); // Track recording state immediately
  const audioLevelIntervalRef = useRef(null); // For updating audio level visualization
  const analyserRef = useRef(null); // Store analyser for audio level updates
  const audioContextRef = useRef(null); // For mobile audio playback unlock
  const isAudioUnlockedRef = useRef(false); // Track if audio is unlocked for mobile
  // Initialize continuousModeRef with saved value
  const savedContinuousMode = localStorage.getItem("voiceChat_continuousMode");
  const continuousModeRef = useRef(
    savedContinuousMode ? JSON.parse(savedContinuousMode) : false
  );

  // Initialize currentLanguageRef from localStorage (convert to short code if needed)
  const savedLanguage = localStorage.getItem("voiceChat_selectedLanguage");
  const currentLanguageRef = useRef(
    languageNameToCode(savedLanguage || language)
  );

  // Debug: Log every render with current ref value
  // console.log(`🔄 VoiceChat render - currentLanguageRef.current: ${currentLanguageRef.current}, selectedLanguage state: ${selectedLanguage}`);

  // Update currentLanguageRef whenever selectedLanguage changes
  useEffect(() => {
    // console.log(`🔄 useEffect triggered: Syncing currentLanguageRef from "${currentLanguageRef.current}" to "${selectedLanguage}"`);
    currentLanguageRef.current = selectedLanguage;

    // Persist to localStorage
    localStorage.setItem("voiceChat_selectedLanguage", selectedLanguage);
    // console.log(`✅ useEffect complete: currentLanguageRef.current is now "${currentLanguageRef.current}" and saved to localStorage`);
  }, [selectedLanguage]);

  // Save customer context to localStorage whenever it changes
  useEffect(() => {
    // Keep ref in sync for immediate reads
    customerContextRef.current = customerContext;

    if (customerContext.lastUpdated) {
      localStorage.setItem(
        "voiceChat_customerContext",
        JSON.stringify(customerContext)
      );
      // console.log('💾 Customer context saved:', customerContext);
    }
  }, [customerContext]);

  // Save continuous mode setting to localStorage
  useEffect(() => {
    localStorage.setItem(
      "voiceChat_continuousMode",
      JSON.stringify(continuousMode)
    );
    continuousModeRef.current = continuousMode; // Sync ref
  }, [continuousMode]);

  // Save voice sensitivity setting to localStorage
  useEffect(() => {
    localStorage.setItem("voiceChat_sensitivity", voiceSensitivity.toString());
  }, [voiceSensitivity]);

  /**
   * Update audio level for visualization
   */
  const updateAudioLevel = () => {
    if (!analyserRef.current || !isRecordingRef.current) {
      setAudioLevel(0);
      if (audioLevelIntervalRef.current) {
        cancelAnimationFrame(audioLevelIntervalRef.current);
        audioLevelIntervalRef.current = null;
      }
      return;
    }

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Focus on human voice frequencies for better visualization (85Hz - 3000Hz)
    // This gives better response to speech vs background noise
    const sampleRate = analyserRef.current.context.sampleRate || 48000;
    const voiceFrequencyStart = Math.floor(
      (85 / (sampleRate / 2)) * bufferLength
    );
    const voiceFrequencyEnd = Math.floor(
      (3000 / (sampleRate / 2)) * bufferLength
    );

    // Calculate average volume in voice frequency range
    let sum = 0;
    for (let i = voiceFrequencyStart; i < voiceFrequencyEnd; i++) {
      sum += dataArray[i];
    }
    const average = sum / (voiceFrequencyEnd - voiceFrequencyStart);

    // Normalize to 0-100 range and amplify for better visibility
    // Average typically ranges 0-50, so we multiply by 3 to get good visual range
    const normalizedLevel = Math.min(100, (average / 255) * 300);

    setAudioLevel(normalizedLevel);

    // Debug: Log audio level occasionally
    if (Math.random() < 0.01) {
      // Log ~1% of frames (about once per second)
      // console.log('🎵 Audio level:', normalizedLevel.toFixed(1), '| Raw average:', average.toFixed(1));
    }

    // Continue animation loop
    audioLevelIntervalRef.current = requestAnimationFrame(updateAudioLevel);
  };

  // Initialize Deepgram client
  useEffect(() => {
    const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY;
    if (apiKey) {
      try {
        // Initialize with browser-compatible options
        deepgramRef.current = createClient(apiKey, {
          global: {
            url: "https://api.deepgram.com",
          },
        });
        console.log("✅ Deepgram client initialized");
      } catch (err) {
        console.error("❌ Failed to initialize Deepgram:", err);
        setError("Failed to initialize Deepgram client: " + err.message);
      }
    } else {
      setError(
        "Deepgram API key not found. Please add VITE_DEEPGRAM_API_KEY to your .env file"
      );
    }

    // Cleanup on unmount
    return () => {
      isRecordingRef.current = false;
      if (audioLevelIntervalRef.current) {
        cancelAnimationFrame(audioLevelIntervalRef.current);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  /**
   * Unlock audio playback for mobile browsers
   * Mobile browsers require a user gesture to enable audio playback.
   * This function should be called from a click/touch event handler.
   */
  const unlockAudio = async () => {
    if (isAudioUnlockedRef.current) {
      return; // Already unlocked
    }

    try {
      // Create and resume an AudioContext (required for mobile)
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext ||
          window.webkitAudioContext)();
      }

      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }

      // Play a silent audio to unlock autoplay
      const silentAudio = new Audio(
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="
      );
      silentAudio.volume = 0.01;

      try {
        await silentAudio.play();
        silentAudio.pause();
        silentAudio.currentTime = 0;
      } catch (e) {
        // Silent fail is okay - the AudioContext resume is the main unlock
        console.log("Silent audio play skipped:", e.message);
      }

      isAudioUnlockedRef.current = true;
      console.log("🔓 Audio playback unlocked for mobile");
    } catch (error) {
      console.error("Failed to unlock audio:", error);
    }
  };

  /**
   * Start listening to user's voice
   */
  const startListening = async () => {
    try {
      setError("");

      // Unlock audio playback for mobile browsers (must be done during user gesture)
      await unlockAudio();

      // Enhanced audio constraints for better fast-speech recognition AND low-volume detection
      const audioConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000, // Higher sample rate for better quality
          channelCount: 1, // Mono for speech
          // Request higher quality audio
          advanced: [
            { echoCancellation: { exact: true } },
            { noiseSuppression: { exact: true } },
            { autoGainControl: { exact: true } },
          ],
          // Enhanced for low-volume detection
          latency: 0.01, // Low latency for real-time processing
          sampleSize: 16, // 16-bit audio
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(
        audioConstraints
      );

      // Store stream reference for cleanup
      mediaStreamRef.current = stream;

      // Set up audio analyser for visualization (shared with VAD in continuous mode)
      if (!continuousModeRef.current) {
        // Only create analyser in manual mode (continuous mode will create it in VAD setup)
        const audioContext = new (window.AudioContext ||
          window.webkitAudioContext)();
        const audioSource = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512; // Increased for better frequency resolution
        analyser.smoothingTimeConstant = 0.7; // Reduced for faster response
        audioSource.connect(analyser);
        analyserRef.current = analyser;

        // Start audio level visualization for manual mode
        updateAudioLevel();
      }

      // Use audio/webm;codecs=opus for better Deepgram compatibility
      const mimeType = "audio/webm;codecs=opus";
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 128000, // Higher bitrate for clarity
      });

      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        isRecordingRef.current = false;
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm;codecs=opus",
        });
        await processAudio(audioBlob);

        // In continuous mode, don't stop the stream - we'll restart listening
        if (!continuousModeRef.current) {
          // Stop all tracks only in manual mode
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
          }
        }
      };

      // Set recording flag BEFORE starting VAD (so VAD doesn't exit immediately)
      isRecordingRef.current = true;

      // In continuous mode, use smaller timeslice for better fast-speech capture
      if (continuousModeRef.current) {
        // console.log('🎙️ Starting continuous recording with 50ms timeslice');
        mediaRecorderRef.current.start(50); // Reduced to 50ms for faster capture
        // Set up Voice Activity Detection AFTER starting recording
        setupVoiceActivityDetection(stream);
      } else {
        mediaRecorderRef.current.start(); // Collect all at once
      }
      setIsListening(true);
      setTranscript(
        continuousModeRef.current
          ? "Listening continuously... Speak when ready"
          : "Listening..."
      );

      if (continuousModeRef.current) {
        // console.log('✅ Continuous mode active - VAD will detect when you speak');
      }
    } catch (error) {
      console.error("Error accessing microphone:", error);
      setError(
        "Microphone access denied. Please allow microphone access in your browser."
      );
    }
  };

  /**
   * Setup Voice Activity Detection for continuous mode
   * Optimized for office environments with background noise AND whisper/low-volume detection
   */
  const setupVoiceActivityDetection = (stream) => {
    // Create audio context for analyzing audio levels
    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    const audioSource = audioContext.createMediaStreamSource(stream);

    // Add gain node for amplifying low-volume speech
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 2.5; // Amplify by 2.5x for better whisper detection

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048; // Increased for better frequency resolution
    analyser.smoothingTimeConstant = 0.7; // Reduced for faster response to whispers

    // Connect: source -> gain -> analyser
    audioSource.connect(gainNode);
    gainNode.connect(analyser);

    // Store analyser for visualization
    analyserRef.current = analyser;

    // Start audio level visualization
    updateAudioLevel();

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let silenceStart = Date.now();
    let isSpeaking = false;
    let speechStartTime = null;

    // Adaptive thresholds based on sensitivity setting (1-10 scale)
    // Lower thresholds for better whisper detection
    // Higher sensitivity number = less sensitive (higher threshold)
    const SPEECH_THRESHOLD = 15 + voiceSensitivity * 3; // Reduced range: 18-45 (was 30-75)
    const SILENCE_DURATION = 1500; // Reduced to 1.5 seconds for faster response
    const MIN_SPEECH_DURATION = 200; // Reduced to 200ms for better whisper detection

    // Calibration for background noise
    let backgroundNoiseLevel = 0;
    let calibrationSamples = [];
    let isCalibrated = false;

    const checkAudioLevel = () => {
      if (!continuousModeRef.current || !isRecordingRef.current) {
        // console.log('⚠️ VAD stopped - continuousMode:', continuousModeRef.current, 'isRecording:', isRecordingRef.current);
        audioContext.close(); // Clean up audio context
        return; // Stop checking if continuous mode disabled or not recording
      }

      analyser.getByteFrequencyData(dataArray);

      // Debug: Log that we're in the loop
      if (!isCalibrated && calibrationSamples.length === 0) {
        // console.log('🔍 First checkAudioLevel call - starting calibration...');
      }

      // Focus on human voice frequencies (85Hz - 3000Hz)
      // This helps filter out low-frequency noise (AC, fans) and high-frequency noise
      const voiceFrequencyStart = Math.floor(
        (85 / (audioContext.sampleRate / 2)) * bufferLength
      );
      const voiceFrequencyEnd = Math.floor(
        (3000 / (audioContext.sampleRate / 2)) * bufferLength
      );

      // Debug frequency range on first call
      if (!isCalibrated && calibrationSamples.length === 0) {
        // console.log('🎵 Audio analysis setup:');
        // console.log('  - Sample rate:', audioContext.sampleRate, 'Hz');
        // console.log('  - Buffer length:', bufferLength);
        // console.log('  - Voice frequency range:', voiceFrequencyStart, '-', voiceFrequencyEnd, 'bins');
      }

      // Calculate average volume in voice frequency range
      let sum = 0;
      for (let i = voiceFrequencyStart; i < voiceFrequencyEnd; i++) {
        sum += dataArray[i];
      }
      const voiceAverage = sum / (voiceFrequencyEnd - voiceFrequencyStart);

      // Calibrate background noise level (first 30 samples = ~1 second)
      if (!isCalibrated && calibrationSamples.length < 30) {
        calibrationSamples.push(voiceAverage);
        setIsCalibrating(true);
        // console.log(`🔍 Calibration sample ${calibrationSamples.length}/30: ${voiceAverage.toFixed(2)}`);
        if (calibrationSamples.length === 30) {
          backgroundNoiseLevel =
            calibrationSamples.reduce((a, b) => a + b) / 30;
          isCalibrated = true;
          setIsCalibrating(false);
          // console.log('✅ Background noise calibrated:', backgroundNoiseLevel.toFixed(2));
          // console.log('🎯 Speech detection threshold:', (backgroundNoiseLevel + SPEECH_THRESHOLD).toFixed(2));
          // console.log('📊 Ready to detect speech! Speak now...');
        }
      }

      // Adaptive threshold based on background noise
      const adaptiveThreshold = isCalibrated
        ? backgroundNoiseLevel + SPEECH_THRESHOLD
        : SPEECH_THRESHOLD;

      // Debug: Log current levels every 50 frames (~1.5 seconds)
      if (isCalibrated && Math.random() < 0.02) {
        // console.log('📊 Audio level:', voiceAverage.toFixed(2), '| Threshold:', adaptiveThreshold.toFixed(2), '| Speaking:', isSpeaking);
      }

      if (voiceAverage > adaptiveThreshold) {
        // Potential voice detected
        if (!isSpeaking && !speechStartTime) {
          speechStartTime = Date.now();
          // console.log('👂 Potential speech detected, waiting for', MIN_SPEECH_DURATION, 'ms confirmation...');
        }

        // Confirm as speech only if it lasts longer than MIN_SPEECH_DURATION
        if (
          speechStartTime &&
          Date.now() - speechStartTime > MIN_SPEECH_DURATION
        ) {
          if (!isSpeaking) {
            // console.log('✅ Speech CONFIRMED! (level:', voiceAverage.toFixed(2), ', threshold:', adaptiveThreshold.toFixed(2), ')');
            isSpeaking = true;
          }
          silenceStart = Date.now();
        }
      } else {
        // Below threshold - potential silence
        if (speechStartTime && !isSpeaking) {
          // console.log('❌ False alarm - sound too short (was only', Date.now() - speechStartTime, 'ms)');
        }
        speechStartTime = null; // Reset speech start timer

        // Only process if we were actually speaking (not just noise spikes)
        if (isSpeaking && Date.now() - silenceStart > SILENCE_DURATION) {
          // console.log('🔇 Silence detected after', SILENCE_DURATION, 'ms, processing speech...');
          // console.log('📦 Audio chunks collected so far:', audioChunksRef.current.length);
          isSpeaking = false;

          // Stop current recording to process (with small delay for final chunks)
          if (
            isRecordingRef.current &&
            mediaRecorderRef.current &&
            mediaRecorderRef.current.state === "recording"
          ) {
            setTimeout(() => {
              if (
                mediaRecorderRef.current &&
                mediaRecorderRef.current.state === "recording"
              ) {
                mediaRecorderRef.current.stop();
              }
            }, 150); // Give 150ms for final chunks to arrive
          }
          audioContext.close(); // Clean up
          return; // Stop checking, will restart after processing
        }
      }

      // Continue checking
      // console.log('🔁 Requesting next animation frame... (sample', calibrationSamples.length, ')');
      requestAnimationFrame(checkAudioLevel);
    };

    // Start checking audio levels
    // console.log('🎙️ Voice Activity Detection started (calibrating background noise...)');
    // console.log('🔧 Sensitivity level:', voiceSensitivity, '(threshold: +' + SPEECH_THRESHOLD + ')');
    // console.log('🚀 About to call checkAudioLevel() for the first time...');
    checkAudioLevel();
  };

  /**
   * Stop listening
   */
  const stopListening = () => {
    if (
      isRecordingRef.current &&
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
      isRecordingRef.current = false;
      setIsListening(false);
      setTranscript("Processing...");
    }

    // Stop audio level visualization
    if (audioLevelIntervalRef.current) {
      cancelAnimationFrame(audioLevelIntervalRef.current);
      audioLevelIntervalRef.current = null;
    }
    setAudioLevel(0);
  };

  /**
   * Completely stop all recording and close streams (for permanent stop button)
   */
  const stopAllRecording = () => {
    // Stop recording
    if (
      isRecordingRef.current &&
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
      isRecordingRef.current = false;
    }

    // Stop audio level visualization
    if (audioLevelIntervalRef.current) {
      cancelAnimationFrame(audioLevelIntervalRef.current);
      audioLevelIntervalRef.current = null;
    }

    // Close media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Reset analyser
    analyserRef.current = null;

    // Reset states
    setIsListening(false);
    setIsProcessing(false);
    setAudioLevel(0);
    setTranscript("");

    // console.log('⏹️ All recording stopped');
  };

  /**
   * Toggle continuous mode on/off
   */
  const toggleContinuousMode = async () => {
    const newMode = !continuousMode;

    if (newMode) {
      // Turning ON continuous mode
      // console.log('🔄 Continuous mode enabled');
      setContinuousMode(true);
      continuousModeRef.current = true; // Set ref immediately
      // Start listening immediately (ref is already updated)
      setTimeout(() => {
        startListening();
      }, 50);
    } else {
      // Turning OFF continuous mode - stop everything
      // console.log('⏸️ Continuous mode disabled');
      setContinuousMode(false);
      continuousModeRef.current = false; // Set ref immediately
      if (isRecordingRef.current) {
        stopListening();
      }
      // Close the media stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    }
  };

  /**
   * Process recorded audio: STT → OpenAI → TTS
   */
  const processAudio = async (audioBlob) => {
    setIsProcessing(true);

    try {
      // Check if we have actual audio data
      if (!audioBlob || audioBlob.size === 0) {
        // console.warn('⚠️ Empty audio blob, skipping processing');
        setIsProcessing(false);

        // In continuous mode, restart listening immediately
        if (continuousModeRef.current && mediaStreamRef.current) {
          setTimeout(() => {
            if (continuousModeRef.current && !isRecordingRef.current) {
              startListening();
            }
          }, 500);
        }
        return;
      }

      // console.log('🎵 Processing audio blob, size:', audioBlob.size, 'bytes');

      // Step 1: Convert speech to text using Deepgram
      setTranscript("Converting speech to text...");
      const userText = await speechToText(audioBlob);

      if (!userText || userText.trim().length === 0) {
        setTranscript("");
        // console.warn('⚠️ No speech detected in audio');
        setIsProcessing(false);

        // In continuous mode, restart listening
        if (continuousModeRef.current && mediaStreamRef.current) {
          setTimeout(() => {
            if (continuousModeRef.current && !isRecordingRef.current) {
              startListening();
            }
          }, 500);
        }
        return;
      }

      setTranscript(userText);

      // Extract customer information from user message
      // extractCustomerInfo(userText); // DEPRECATED: Now handled by AI response parsing for better robustness

      // Add user message to conversation
      const userMessage = { role: "user", content: userText };
      setConversation((prev) => [...prev, userMessage]);
      conversationHistoryRef.current.push(userMessage);

      // Clear any pending silence timeout since user responded
      if (silenceTimeoutId) {
        clearTimeout(silenceTimeoutId);
        setSilenceTimeoutId(null);
      }

      // Step 2: Get AI response from OpenAI
      setTranscript("Getting AI response...");
      const aiResponse = await getAIResponse();

      // Add AI message to conversation
      const aiMessage = { role: "assistant", content: aiResponse };
      setConversation((prev) => [...prev, aiMessage]);
      conversationHistoryRef.current.push(aiMessage);

      // Track if AI asked a question (for retry logic)
      const isQuestion = aiResponse.includes("?");
      if (isQuestion) {
        setLastQuestion(aiResponse);
      } else {
        setLastQuestion(null);
      }

      // NOTE: TTS is now handled progressively during streaming in getAIResponse()
      // No need to call speakText here - sentences are spoken as they arrive
      setTranscript("");

      setIsProcessing(false);

      // If AI asked a question, start silence timer (10 seconds)
      if (isQuestion && continuousModeRef.current) {
        const timeoutId = setTimeout(() => {
          console.log("⏰ Silence detected - user didn't respond");
          handleSilenceTimeout();
        }, 10000); // 10 seconds
        setSilenceTimeoutId(timeoutId);
      }

      // In continuous mode, restart listening after AI finishes speaking
      if (continuousModeRef.current && mediaStreamRef.current) {
        console.log(
          `🔄 Continuous mode: Restarting listening with language: ${currentLanguageRef.current}`
        );
        // Small delay to avoid overlap
        setTimeout(() => {
          if (continuousModeRef.current && !isRecordingRef.current) {
            console.log(
              `▶️ About to call startListening() with currentLanguageRef: ${currentLanguageRef.current}`
            );
            startListening();
          }
        }, 500);
      }
    } catch (error) {
      console.error("Error processing audio:", error);
      setError("Error processing your request: " + error.message);
      setIsProcessing(false);
      setTranscript("");

      // In continuous mode, restart listening even after error
      if (continuousModeRef.current && mediaStreamRef.current) {
        setTimeout(() => {
          if (continuousModeRef.current && !isRecordingRef.current) {
            startListening();
          }
        }, 1000);
      }
    }
  };

  /**
   * Convert speech to text using Deepgram Live Streaming (Browser compatible)
   */
  /**
   * Convert speech to text using Deepgram (English/Hindi) or Sarvam (Other Indian Languages)
   */
  const speechToText = async (audioBlob) => {
    // 1. Determine which service to use based on language
    const currentLang = currentLanguageRef.current;
    console.log(`🎯 speechToText called with currentLang: ${currentLang}`);

    // Define supported languages
    const deepgramLanguages = ["en", "hi"];
    const sarvamLanguages = ["ta", "te", "kn", "ml", "bn", "mr", "gu", "pa"];

    // Check if language is supported
    if (
      !deepgramLanguages.includes(currentLang) &&
      !sarvamLanguages.includes(currentLang)
    ) {
      const languageNames = {
        es: "Spanish",
        fr: "French",
        de: "German",
        zh: "Chinese",
        ja: "Japanese",
        ko: "Korean",
      };
      const langName = languageNames[currentLang] || currentLang;
      throw new Error(
        `Voice support not available for ${langName}. Please switch to an Indian language or English.`
      );
    }

    // 2. Use SARVAM for regional Indian languages
    if (sarvamLanguages.includes(currentLang)) {
      try {
        // console.log(`🇮🇳 Routing to Sarvam STT for language: ${currentLang}`);

        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.webm");
        formData.append("language", currentLang);

        const response = await axios.post(
          `${
            import.meta.env.VITE_API_URL || "http://localhost:5000"
          }/api/speech/stt/sarvam`,
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
              // Add auth token since the endpoint is protected by global/route middleware
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );

        if (response.data && response.data.success) {
          return response.data.transcript;
        } else {
          throw new Error(response.data?.error || "Transcription failed");
        }
      } catch (error) {
        console.error("Sarvam STT Error:", error);
        throw new Error(
          "Failed to transcribe with Sarvam: " +
            (error.response?.data?.error || error.message)
        );
      }
    }

    // 3. Use DEEPGRAM for English and Hindi (REST API for browser compatibility)
    try {
      // Use ref to get the most current language
      const languageToUse = currentLanguageRef.current;
      console.log("🎤 Deepgram STT STARTING with language:", languageToUse);

      // Use REST API instead of WebSocket for better browser compatibility
      const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY;

      // Build URL with query parameters
      const url = new URL("https://api.deepgram.com/v1/listen");
      url.searchParams.append("model", "nova-2");
      url.searchParams.append("language", languageToUse === "hi" ? "hi" : "en");
      url.searchParams.append("smart_format", "true");
      url.searchParams.append("punctuate", "true");
      url.searchParams.append("filler_words", "false");

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "audio/webm",
        },
        body: audioBlob,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Deepgram API error:", response.status, errorText);
        throw new Error(`Deepgram API error: ${response.status}`);
      }

      const data = await response.json();
      const transcript =
        data.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

      if (!transcript.trim()) {
        const languageNames = { en: "English", hi: "Hindi" };
        const currentLangName = languageNames[languageToUse] || languageToUse;
        throw new Error(
          `No speech detected. Please speak in ${currentLangName} or select a different language.`
        );
      }

      console.log("✅ Deepgram transcript:", transcript);
      return transcript;
    } catch (error) {
      console.error("Speech-to-text error:", error);
      throw new Error("Failed to convert speech to text: " + error.message);
    }
  };

  /**
   * Get AI response using streaming for lower latency
   * Starts TTS as soon as first sentence is complete
   */
  const getAIResponse = async () => {
    try {
      // Get the last user message
      const lastUserMessage =
        conversationHistoryRef.current[
          conversationHistoryRef.current.length - 1
        ]?.content || "";

      // Build recent history (last 6 messages = 3 exchanges)
      const recentHistory = conversationHistoryRef.current.slice(-6);

      console.log("🧠 VoiceChat: Sending to backend (streaming):", {
        message: lastUserMessage,
        historyLength: recentHistory.length,
        language: currentLanguageRef.current,
      });

      // Use streaming endpoint for lower latency
      const response = await fetch(
        `${
          import.meta.env.VITE_API_URL || "http://localhost:5000"
        }/api/chat/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
          body: JSON.stringify({
            message: lastUserMessage,
            agentId: agentId || "default",
            customerContext: customerContextRef.current,
            conversationHistory: recentHistory,
            options: {
              language: currentLanguageRef.current,
              useRAG: ragEnabled,
              systemPrompt: systemPrompt || "You are a helpful AI assistant.",
              temperature: temperature,
              maxTokens: Math.min(maxTokens, 100), // Cap for faster response
              provider: selectedLLM,
            },
          }),
        }
      );

      if (!response.ok) {
        // Fall back to regular endpoint if streaming fails
        console.warn("⚠️ Streaming failed, falling back to regular endpoint");
        return await getAIResponseFallback();
      }

      // Process Server-Sent Events
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let firstSentenceSpoken = false;
      const sentenceQueue = [];
      let isSpeakingQueue = false;
      let sseBuffer = ""; // Buffer for incomplete SSE data

      // Function to process sentence queue (speak sentences in order)
      const processSentenceQueue = async () => {
        if (isSpeakingQueue || sentenceQueue.length === 0) return;

        isSpeakingQueue = true;

        while (sentenceQueue.length > 0) {
          const sentence = sentenceQueue.shift();
          if (sentence && sentence.trim()) {
            console.log(
              "🔊 Speaking sentence:",
              sentence.substring(0, 50) + "..."
            );
            await speakText(sentence);
          }
        }

        isSpeakingQueue = false;
      };

      // Read the stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Accumulate data in buffer
        sseBuffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages (end with \n\n)
        const messages = sseBuffer.split("\n\n");

        // Keep the last incomplete message in buffer
        sseBuffer = messages.pop() || "";

        for (const message of messages) {
          const lines = message.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const jsonStr = line.slice(6);
                if (!jsonStr.trim()) continue;

                const data = JSON.parse(jsonStr);

                if (data.type === "sentence") {
                  // Got a complete sentence - queue for speaking
                  console.log(
                    "📝 Received sentence #" + (data.index || "?") + ":",
                    data.content.substring(0, 50)
                  );
                  fullResponse += data.content + " ";

                  // Start speaking immediately (in parallel with receiving more)
                  sentenceQueue.push(data.content);
                  if (!firstSentenceSpoken) {
                    firstSentenceSpoken = true;
                    setTranscript(""); // Clear "Getting AI response..."
                  }
                  processSentenceQueue(); // Non-blocking
                }

                if (data.type === "done") {
                  // Stream complete - use the cleaned full response from server
                  if (data.fullResponse) {
                    fullResponse = data.fullResponse;
                  }
                  if (data.customerContext) {
                    setCustomerContext(data.customerContext);
                    customerContextRef.current = data.customerContext;
                  }
                  if (data.languageSwitch) {
                    currentLanguageRef.current =
                      data.languageSwitch.toLowerCase();
                    setSelectedLanguage(data.languageSwitch.toLowerCase());
                  }
                  console.log(
                    "✅ Streaming complete.",
                    data.sentenceCount || "?",
                    "sentences"
                  );
                }

                if (data.type === "error") {
                  console.error("❌ Stream error:", data.message);
                  throw new Error(data.message);
                }
              } catch (parseError) {
                // Log but don't crash for parse errors
                console.warn(
                  "SSE parse warning:",
                  parseError.message,
                  "Line:",
                  line
                );
              }
            }
          }
        }
      }

      // Wait for all sentences to be spoken
      while (isSpeakingQueue || sentenceQueue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        await processSentenceQueue();
      }

      return fullResponse.trim();
    } catch (error) {
      console.error("❌ Streaming API error:", error);
      // Fall back to regular endpoint
      return await getAIResponseFallback();
    }
  };

  /**
   * Fallback to regular (non-streaming) AI response
   * This speaks the entire response at once (not progressively)
   */
  const getAIResponseFallback = async () => {
    const lastUserMessage =
      conversationHistoryRef.current[conversationHistoryRef.current.length - 1]
        ?.content || "";

    const recentHistory = conversationHistoryRef.current.slice(-6);

    const response = await fetch(
      `${
        import.meta.env.VITE_API_URL || "http://localhost:5000"
      }/api/chat/message`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
        body: JSON.stringify({
          message: lastUserMessage,
          agentId: agentId || "default",
          customerContext: customerContextRef.current,
          conversationHistory: recentHistory,
          options: {
            language: currentLanguageRef.current,
            useRAG: ragEnabled,
            systemPrompt: systemPrompt || "You are a helpful AI assistant.",
            temperature: temperature,
            maxTokens: maxTokens,
            provider: selectedLLM,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || errorData.details || "Backend API request failed"
      );
    }

    const data = await response.json();

    if (data.customerContext) {
      setCustomerContext(data.customerContext);
      customerContextRef.current = data.customerContext;
    }

    if (data.languageSwitch) {
      currentLanguageRef.current = data.languageSwitch.toLowerCase();
      setSelectedLanguage(data.languageSwitch.toLowerCase());
    }

    // In fallback mode, we need to speak the response here
    // since streaming didn't handle it
    if (data.response) {
      setTranscript("");
      await speakText(data.response);
    }

    return data.response;
  };

  /**
   * Preprocess text for TTS to handle abbreviations, symbols, and numbers
   */
  const preprocessForTTS = (text) => {
    if (!text) return text;

    let processed = text;

    // Indian currency - ₹ symbol and amounts
    processed = processed.replace(/₹\s*([\d,.]+)\s*Cr\.?/gi, "$1 crore rupees");
    processed = processed.replace(/₹\s*([\d,.]+)\s*Crore/gi, "$1 crore rupees");
    processed = processed.replace(/₹\s*([\d,.]+)\s*L\.?/gi, "$1 lakh rupees");
    processed = processed.replace(/₹\s*([\d,.]+)\s*Lakh/gi, "$1 lakh rupees");
    processed = processed.replace(/₹\s*([\d,.]+)\s*K/gi, "$1 thousand rupees");
    processed = processed.replace(/₹\s*([\d,.]+)/g, "$1 rupees");

    // Crore/Lakh without ₹
    processed = processed.replace(/([\d,.]+)\s*Cr\.?\b/gi, "$1 crore");
    processed = processed.replace(/([\d,.]+)\s*L\.?\b/gi, "$1 lakh");

    // Real estate abbreviations - spell out
    processed = processed.replace(/\bBHK\b/gi, "B H K");
    processed = processed.replace(/\bsqft\b/gi, "square feet");
    processed = processed.replace(/\bsq\.?\s*ft\.?\b/gi, "square feet");
    processed = processed.replace(/\bEMI\b/gi, "E M I");
    processed = processed.replace(/\bGST\b/gi, "G S T");

    // Common abbreviations
    processed = processed.replace(/\bkm\b/gi, "kilometers");
    processed = processed.replace(/\bmin\b/gi, "minutes");
    processed = processed.replace(/\bapprox\.?\b/gi, "approximately");
    processed = processed.replace(/\betc\.?\b/gi, "etcetera");

    // Remove special characters
    processed = processed.replace(/[•◦▪▸►]/g, "");
    processed = processed.replace(/[–—]/g, "-");

    // Numbered lists
    processed = processed.replace(/^\d+[.):\s]+/gm, "");
    processed = processed.replace(/\s+\d+[.):\s]+/g, ", ");

    // Remove markdown
    processed = processed.replace(/\*\*/g, "");
    processed = processed.replace(/\*/g, "");
    processed = processed.replace(/`/g, "");
    processed = processed.replace(/#+\s*/g, "");
    processed = processed.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

    // Clean up whitespace
    processed = processed.replace(/,\s*,/g, ",");
    processed = processed.replace(/\s+/g, " ");

    return processed.trim();
  };

  /**
   * Text-to-Speech - Routes to appropriate provider (Sarvam, Tabbly, or ElevenLabs)
   */
  const speakText = async (text) => {
    // Preprocess text for better TTS pronunciation
    const processedText = preprocessForTTS(text);

    // Route to appropriate TTS provider
    if (voiceProvider === "Tabbly") {
      return await speakWithTabbly(processedText);
    } else if (voiceProvider === "ElevenLabs") {
      return await speakWithElevenLabs(processedText);
    } else {
      // Default to Sarvam
      return await speakWithSarvam(processedText);
    }
  };

  /**
   * Text-to-Speech using Sarvam AI
   */
  const speakWithSarvam = async (text) => {
    try {
      setIsSpeaking(true);

      const apiKey = import.meta.env.VITE_SARVAM_API_KEY;
      if (!apiKey) {
        console.error("Sarvam API key not found");
        throw new Error(
          "Sarvam API key not configured. Please add VITE_SARVAM_API_KEY to .env.local"
        );
      }

      // Map our language codes to Sarvam's format
      const languageMap = {
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

      const sarvamLanguage = languageMap[currentLanguageRef.current] || "en-IN";

      // Sanitize text to remove markdown and system instructions
      const sanitizedText = text
        .replace(/\*\*/g, "") // Remove bold
        .replace(/\*/g, "") // Remove italics
        .replace(/`/g, "") // Remove code blocks
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove links but keep text
        .replace(/LANGUAGE_SWITCH:[^ ]+/g, "") // Remove language switch commands
        .replace(/\[MEMORY:.*\]/g, "") // Remove memory blocks
        .replace(/[#_]/g, "") // Remove dashes/underscores/hashes
        .replace(/\n\n/g, ". ") // Convert paragraph breaks to full stops for pauses
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();

      const response = await axios.post(
        "https://api.sarvam.ai/text-to-speech",
        {
          inputs: [sanitizedText],
          target_language_code: sarvamLanguage,
          speaker: voice, // Use voice prop directly
          model: voiceModel === "bulbulv2" ? "bulbul:v2" : "bulbul:v1", // Map model prop
          // Enhanced settings for better clarity
          enable_preprocessing: true,
          pace: speedRate || 1.0, // Use configured speed rate (default 1.0 for natural)
          pitch: 0, // Neutral pitch for clarity
          loudness: 1.5, // Slightly louder for better audibility
        },
        {
          headers: {
            "Content-Type": "application/json",
            "api-subscription-key": apiKey, // Try lowercase header
          },
        }
      );

      // Get the base64 audio from response
      const audioBase64 = response.data.audios[0];

      // Convert base64 to blob
      const audioData = atob(audioBase64);
      const arrayBuffer = new Uint8Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        arrayBuffer[i] = audioData.charCodeAt(i);
      }
      const audioBlob = new Blob([arrayBuffer], { type: "audio/wav" });

      // Create audio URL and play
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      // Enhanced audio settings for better clarity
      audio.volume = 1.0; // Full volume
      audio.preservesPitch = true; // Maintain pitch quality
      audio.playbackRate = speedRate || 1.0; // Use configured speed (default 1.0)

      return new Promise((resolve, reject) => {
        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          resolve();
        };

        audio.onerror = (error) => {
          console.error("Audio playback error:", error);
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          reject(error);
        };

        // Mobile-friendly audio playback
        const playAudio = async () => {
          try {
            // Ensure AudioContext is resumed for mobile
            if (
              audioContextRef.current &&
              audioContextRef.current.state === "suspended"
            ) {
              await audioContextRef.current.resume();
            }

            // Try to play
            await audio.play();
          } catch (playError) {
            console.error("Error playing audio:", playError);

            // If autoplay blocked, try with user interaction fallback
            if (playError.name === "NotAllowedError") {
              console.warn(
                "🔇 Autoplay blocked on mobile. Audio playback requires user interaction."
              );
              setIsSpeaking(false);
              reject(
                new Error(
                  "Audio playback blocked. Please tap the screen and try again."
                )
              );
            } else {
              setIsSpeaking(false);
              reject(playError);
            }
          }
        };

        playAudio();
      });
    } catch (error) {
      console.error("Sarvam TTS error:", error);
      setIsSpeaking(false);

      // Show user-friendly error
      if (error.response) {
        console.error("Sarvam API error response:", error.response.data);
        console.error(
          "Full error object:",
          JSON.stringify(error.response.data, null, 2)
        );

        const errorMsg =
          error.response.data?.error?.message ||
          error.response.data?.message ||
          error.response.statusText;
        throw new Error(`Sarvam TTS failed: ${errorMsg}`);
      } else {
        throw new Error("Failed to generate speech: " + error.message);
      }
    }
  };

  /**
   * Text-to-Speech using Tabbly AI (via backend)
   */
  const speakWithTabbly = async (text) => {
    try {
      setIsSpeaking(true);

      // Sanitize text to remove markdown and system instructions
      const sanitizedText = text
        .replace(/\*\*/g, "") // Remove bold
        .replace(/\*/g, "") // Remove italics
        .replace(/`/g, "") // Remove code blocks
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove links but keep text
        .replace(/LANGUAGE_SWITCH:[^ ]+/g, "") // Remove language switch commands
        .replace(/\[MEMORY:.*\]/g, "") // Remove memory blocks
        .replace(/[#_]/g, "") // Remove dashes/underscores/hashes
        .replace(/\n\n/g, ". ") // Convert paragraph breaks to full stops for pauses
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();

      const response = await axios.post(
        `${
          import.meta.env.VITE_API_URL || "http://localhost:5000"
        }/api/speech/tts/tabbly`,
        {
          text: sanitizedText,
          voice: voice, // Use voice prop (Ashley, Brian, Emma, etc.)
          model: voiceModel || "tabbly-tts",
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          responseType: "arraybuffer", // Important: Get binary WAV data
        }
      );

      console.log("✅ Tabbly TTS response received:", {
        dataSize: response.data.byteLength,
        contentType: response.headers["content-type"],
      });

      // Convert response to blob
      const audioBlob = new Blob([response.data], { type: "audio/wav" });
      console.log("🔊 Audio blob created:", {
        size: audioBlob.size,
        type: audioBlob.type,
      });

      // Create audio URL and play
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      console.log("🎵 Attempting to play audio from URL:", audioUrl);

      return new Promise((resolve, reject) => {
        audio.onended = () => {
          console.log("✅ Audio playback completed");
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          resolve();
        };

        audio.onerror = (error) => {
          console.error("Audio playback error:", error);
          console.error("Audio element:", audio);
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          reject(error);
        };

        audio.onloadedmetadata = () => {
          console.log("🎵 Audio metadata loaded:", {
            duration: audio.duration,
            readyState: audio.readyState,
          });
        };

        // Mobile-friendly audio playback
        const playAudio = async () => {
          try {
            // Ensure AudioContext is resumed for mobile
            if (
              audioContextRef.current &&
              audioContextRef.current.state === "suspended"
            ) {
              await audioContextRef.current.resume();
            }

            // Try to play
            await audio.play();
          } catch (playError) {
            console.error("Error playing audio:", playError);

            // If autoplay blocked, show user-friendly message
            if (playError.name === "NotAllowedError") {
              console.warn(
                "🔇 Autoplay blocked on mobile. Audio playback requires user interaction."
              );
              setIsSpeaking(false);
              reject(
                new Error(
                  "Audio playback blocked. Please tap the screen and try again."
                )
              );
            } else {
              setIsSpeaking(false);
              reject(playError);
            }
          }
        };

        playAudio();
      });
    } catch (error) {
      console.error("Tabbly TTS error:", error);
      setIsSpeaking(false);

      // Show user-friendly error
      if (error.response) {
        console.error("Tabbly API error response:", error.response.data);
        const errorMsg =
          error.response.data?.error?.message ||
          error.response.data?.message ||
          error.response.statusText;
        throw new Error(`Tabbly TTS failed: ${errorMsg}`);
      } else {
        throw new Error("Failed to generate speech: " + error.message);
      }
    }
  };

  /**
   * Text-to-Speech using ElevenLabs (via backend)
   */
  const speakWithElevenLabs = async (text) => {
    try {
      setIsSpeaking(true);

      // Sanitize text to remove markdown and system instructions
      const sanitizedText = text
        .replace(/\*\*/g, "") // Remove bold
        .replace(/\*/g, "") // Remove italics
        .replace(/`/g, "") // Remove code blocks
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove links but keep text
        .replace(/LANGUAGE_SWITCH:[^ ]+/g, "") // Remove language switch commands
        .replace(/\[MEMORY:.*\]/g, "") // Remove memory blocks
        .replace(/[#_]/g, "") // Remove dashes/underscores/hashes
        .replace(/\n\n/g, ". ") // Convert paragraph breaks to full stops for pauses
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();

      const response = await axios.post(
        `${
          import.meta.env.VITE_API_URL || "http://localhost:5000"
        }/api/speech/tts/elevenlabs`,
        {
          text: sanitizedText,
          voice: voice, // Use voice prop (ElevenLabs voice ID)
          model: voiceModel || "eleven_multilingual_v2",
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          responseType: "arraybuffer", // Important: Get binary MP3 data
        }
      );

      console.log("✅ ElevenLabs TTS response received:", {
        dataSize: response.data.byteLength,
        contentType: response.headers["content-type"],
      });

      // Convert response to blob (MP3 format)
      const audioBlob = new Blob([response.data], { type: "audio/mpeg" });
      console.log("🔊 Audio blob created:", {
        size: audioBlob.size,
        type: audioBlob.type,
      });

      // Create audio URL and play
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      console.log("🎵 Attempting to play ElevenLabs audio from URL:", audioUrl);

      return new Promise((resolve, reject) => {
        audio.onended = () => {
          console.log("✅ ElevenLabs audio playback completed");
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          resolve();
        };

        audio.onerror = (error) => {
          console.error("Audio playback error:", error);
          console.error("Audio element:", audio);
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          reject(error);
        };

        audio.onloadedmetadata = () => {
          console.log("🎵 ElevenLabs audio metadata loaded:", {
            duration: audio.duration,
            readyState: audio.readyState,
          });
        };

        // Mobile-friendly audio playback
        const playAudio = async () => {
          try {
            // Ensure AudioContext is resumed for mobile
            if (
              audioContextRef.current &&
              audioContextRef.current.state === "suspended"
            ) {
              await audioContextRef.current.resume();
            }

            // Try to play
            await audio.play();
          } catch (playError) {
            console.error("Error playing audio:", playError);

            // If autoplay blocked, show user-friendly message
            if (playError.name === "NotAllowedError") {
              console.warn(
                "🔇 Autoplay blocked on mobile. Audio playback requires user interaction."
              );
              setIsSpeaking(false);
              reject(
                new Error(
                  "Audio playback blocked. Please tap the screen and try again."
                )
              );
            } else {
              setIsSpeaking(false);
              reject(playError);
            }
          }
        };

        playAudio();
      });
    } catch (error) {
      console.error("ElevenLabs TTS error:", error);
      setIsSpeaking(false);

      // Show user-friendly error
      if (error.response) {
        console.error("ElevenLabs API error response:", error.response.data);
        const errorMsg =
          error.response.data?.error?.message ||
          error.response.data?.message ||
          error.response.statusText;
        throw new Error(`ElevenLabs TTS failed: ${errorMsg}`);
      } else {
        throw new Error("Failed to generate speech: " + error.message);
      }
    }
  };

  /**
   * Handle silence timeout - user didn't respond to a question
   */
  const handleSilenceTimeout = async () => {
    if (!lastQuestion) return;

    try {
      setIsProcessing(true);
      setTranscript("Processing silence timeout...");

      // Call AI with empty/unclear input flag to trigger retry logic
      const response = await axios.post(
        "/api/rag/chat",
        {
          query: "", // Empty query indicates silence
          conversationHistory: conversationHistoryRef.current,
          systemPrompt: systemPrompt || "You are a helpful assistant.",
          useRAG: ragEnabled,
          agentId: agentId,
          customerContext: customerContextRef.current,
          isRetry: true,
          lastQuestion: lastQuestion,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      const retryResponse =
        response.data.response || "Could you please respond?";

      // Add retry message to conversation
      const aiMessage = { role: "assistant", content: retryResponse };
      setConversation((prev) => [...prev, aiMessage]);
      conversationHistoryRef.current.push(aiMessage);

      // Speak the retry message
      setTranscript("");
      await speakText(retryResponse);

      setIsProcessing(false);

      // Restart listening if continuous mode is on
      if (continuousModeRef.current && mediaStreamRef.current) {
        setTimeout(() => {
          if (continuousModeRef.current && !isRecordingRef.current) {
            startListening();
          }
        }, 500);
      }

      // Set another timeout for this retry question
      const timeoutId = setTimeout(() => {
        console.log("⏰ Second silence timeout");
        handleSilenceTimeout();
      }, 10000);
      setSilenceTimeoutId(timeoutId);
    } catch (error) {
      console.error("Error handling silence timeout:", error);
      setIsProcessing(false);
    }
  };

  /**
   * Clear conversation history
   */
  const clearConversation = () => {
    setConversation([]);
    conversationHistoryRef.current = [];
    setTranscript("");
    setError("");
    setLastQuestion(null);
    if (silenceTimeoutId) {
      clearTimeout(silenceTimeoutId);
      setSilenceTimeoutId(null);
    }
  };

  /**
   * Clear customer context (personal info)
   */
  const clearCustomerContext = () => {
    const emptyContext = {
      name: "",
      phone: "",
      email: "",
      address: "",
      preferences: {},
      orderDetails: {},
      lastUpdated: null,
    };
    setCustomerContext(emptyContext);
    localStorage.removeItem("voiceChat_customerContext");
    // console.log('🗑️ Customer context cleared');
  };

  /**
   * Stop speaking
   */
  const stopSpeaking = () => {
    // Stop any playing audio
    const audioElements = document.querySelectorAll("audio");
    audioElements.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    setIsSpeaking(false);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Voice Chat with {agentName}</h2>
        <p className="text-sm text-slate-600">
          {continuousMode
            ? "🎤 Continuous mode is ON! Just speak naturally - the system will automatically detect when you start and stop talking. The AI will respond and then wait for you to speak again."
            : 'Click the microphone to start speaking. Your conversation will be transcribed and the agent will respond with voice. Try saying "Switch to Hindi" or "Talk in Tamil" to change languages!'}
        </p>
      </div>

      {/* Customer Context Display */}
      {(customerContext.name ||
        customerContext.phone ||
        customerContext.email ||
        customerContext.address ||
        customerContext.pincode ||
        customerContext.model ||
        (customerContext.orderDetails &&
          Object.keys(customerContext.orderDetails).length > 0)) && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-blue-900 flex items-center gap-2">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              Remembered Customer Information
            </h3>
            <button
              onClick={clearCustomerContext}
              className="text-xs text-red-600 hover:text-red-700 font-medium"
              title="Clear customer information"
            >
              Clear Info
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {customerContext.name && (
              <div className="flex items-center gap-2">
                <span className="text-blue-700 font-medium">Name:</span>
                <span className="text-blue-900">{customerContext.name}</span>
              </div>
            )}
            {customerContext.phone && (
              <div className="flex items-center gap-2">
                <span className="text-blue-700 font-medium">Phone:</span>
                <span className="text-blue-900">{customerContext.phone}</span>
              </div>
            )}
            {customerContext.email && (
              <div className="flex items-center gap-2">
                <span className="text-blue-700 font-medium">Email:</span>
                <span className="text-blue-900">{customerContext.email}</span>
              </div>
            )}
            {customerContext.pincode && (
              <div className="flex items-center gap-2">
                <span className="text-blue-700 font-medium">Pincode:</span>
                <span className="text-blue-900">{customerContext.pincode}</span>
              </div>
            )}
            {customerContext.model && (
              <div className="flex items-center gap-2">
                <span className="text-blue-700 font-medium">Model/Type:</span>
                <span className="text-blue-900">{customerContext.model}</span>
              </div>
            )}
            {customerContext.address && (
              <div className="flex items-start gap-2 col-span-2">
                <span className="text-blue-700 font-medium">Address:</span>
                <span className="text-blue-900">{customerContext.address}</span>
              </div>
            )}
            {/* Display orderDetails dynamically */}
            {customerContext.orderDetails &&
              Object.keys(customerContext.orderDetails).length > 0 && (
                <div className="col-span-2 mt-2 pt-2 border-t border-blue-300">
                  <span className="text-blue-700 font-medium text-xs uppercase">
                    Requirements:
                  </span>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {Object.entries(customerContext.orderDetails).map(
                      ([key, value]) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className="text-blue-600 font-medium capitalize">
                            {key}:
                          </span>
                          <span className="text-blue-900">
                            {typeof value === "object"
                              ? JSON.stringify(value)
                              : value}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
          </div>
          <p className="text-xs text-blue-600 mt-2">
            💡 This information is remembered throughout the entire
            conversation, even after 10+ messages!
          </p>
        </div>
      )}

      {/* Language Selector and Settings */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-700">
            Language:
          </label>
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            disabled={isListening || isProcessing}
            className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
          >
            <option value="en">🇬🇧 English</option>
            <option value="hi">🇮🇳 Hindi (हिंदी)</option>
            <option value="ta">🇮🇳 Tamil (தமிழ்)</option>
            <option value="te">🇮🇳 Telugu (తెలుగు)</option>
            <option value="kn">🇮🇳 Kannada (ಕನ್ನಡ)</option>
            <option value="ml">🇮🇳 Malayalam (മലയാളം)</option>
            <option value="bn">🇮🇳 Bengali (বাংলা)</option>
            <option value="mr">🇮🇳 Marathi (मराठी)</option>
            <option value="gu">🇮🇳 Gujarati (ગુજરાતી)</option>
            <option value="pa">🇮🇳 Punjabi (ਪੰਜਾਬੀ)</option>
            <option value="es">🇪🇸 Spanish</option>
            <option value="fr">🇫🇷 French</option>
            <option value="de">🇩🇪 German</option>
            <option value="zh">🇨🇳 Chinese</option>
            <option value="ja">🇯🇵 Japanese</option>
            <option value="ko">🇰🇷 Korean</option>
          </select>
        </div>

        {/* RAG Toggle */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer mt-6">
            <input
              type="checkbox"
              checked={ragEnabled}
              onChange={(e) => setRagEnabled(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-slate-700">
              Use Knowledge Base (RAG)
            </span>
          </label>
          <span className="text-xs text-slate-500 mt-6">
            {ragEnabled
              ? "✓ Enhanced with uploaded documents"
              : "⚠ Basic mode only"}
          </span>
        </div>

        {/* Continuous Mode Toggle */}
        <div className="flex items-center gap-2 col-span-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={continuousMode}
              onChange={toggleContinuousMode}
              disabled={isProcessing}
              className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500 disabled:cursor-not-allowed"
            />
            <span className="text-sm font-medium text-slate-700">
              Continuous Listening
            </span>
          </label>
          <span className="text-xs text-slate-500">
            {continuousMode ? "🎤 Auto-detect speech" : "⏸️ Manual mode"}
          </span>
        </div>
      </div>

      {/* Voice Sensitivity Slider (shown only in continuous mode) */}
      {continuousMode && (
        <div className="mb-6 p-4 bg-linear-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
              🎚️ Noise Filtering
              {isCalibrating && (
                <span className="text-xs text-orange-600 animate-pulse">
                  (Calibrating...)
                </span>
              )}
            </label>
            <span className="text-xs font-medium text-slate-600 bg-white px-2 py-1 rounded">
              Level: {voiceSensitivity}/10
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={voiceSensitivity}
            onChange={(e) => setVoiceSensitivity(parseInt(e.target.value))}
            disabled={isListening || isProcessing}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>
              🔊 More Sensitive
              <br />
              (picks up quieter sounds)
            </span>
            <span className="text-center">
              ⚖️ Balanced
              <br />
              (recommended for office)
            </span>
            <span className="text-right">
              🔇 Less Sensitive
              <br />
              (ignores background noise)
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-3 bg-white p-2 rounded border border-slate-200">
            💡 <strong>Tip:</strong> If background noise triggers false
            detections, increase the level. If your voice isn't being detected,
            decrease the level. The system auto-calibrates on startup!
          </p>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Voice Control */}
      <div className="flex flex-col items-center gap-4 mb-8">
        {/* Microphone with Audio-Reactive Animation */}
        <div className="relative">
          {/* Animated outer ring that syncs with audio */}
          {isListening && audioLevel > 0 && (
            <div
              className="absolute inset-0 rounded-full opacity-30 pointer-events-none transition-all duration-100"
              style={{
                transform: `scale(${1 + (audioLevel / 100) * 0.5})`,
                backgroundColor: continuousMode
                  ? isCalibrating
                    ? "#f97316"
                    : "#22c55e"
                  : "#ef4444",
              }}
            ></div>
          )}

          {/* Main microphone button */}
          <button
            onClick={(e) => {
              e.stopPropagation();

              // Don't do anything if processing or speaking
              if (isProcessing || isSpeaking) {
                return;
              }

              if (isRecordingRef.current) {
                stopListening();
              } else {
                startListening();
              }
            }}
            disabled={isProcessing || isSpeaking}
            className={`w-32 h-32 rounded-full flex items-center justify-center text-white text-5xl shadow-lg cursor-pointer transition-all duration-200 ${
              isListening
                ? continuousMode
                  ? isCalibrating
                    ? "bg-orange-500"
                    : "bg-green-500"
                  : "bg-red-500 hover:bg-red-600"
                : isProcessing
                ? "bg-gray-400 cursor-not-allowed"
                : isSpeaking
                ? "bg-blue-500"
                : "bg-blue-500 hover:bg-blue-600"
            } ${isProcessing || isSpeaking ? "opacity-75" : ""}`}
            style={{
              transform:
                isListening && audioLevel > 0
                  ? `scale(${1 + (audioLevel / 100) * 0.2})`
                  : "scale(1)",
            }}
            title={isListening ? "Listening..." : "Start speaking"}
          >
            {isCalibrating ? (
              "🔧"
            ) : isListening ? (
              <BiMicrophone />
            ) : isSpeaking ? (
              <BiVolumeFull />
            ) : isProcessing ? (
              "⏳"
            ) : (
              <BiMicrophone />
            )}
          </button>
        </div>

        {/* Status Text */}
        <div className="text-center">
          <p className="text-lg font-medium text-slate-700">
            {isCalibrating
              ? "🔧 Calibrating noise levels..."
              : isListening
              ? continuousMode
                ? "🎤 Listening... Speak naturally"
                : "🎤 Listening... Click stop when done"
              : isProcessing
              ? "⏳ Processing your request..."
              : isSpeaking
              ? "🔊 AI is responding..."
              : continuousMode
              ? "💤 Click microphone to start"
              : "🎙️ Click microphone to start speaking"}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {isCalibrating
              ? "Please wait while we measure background noise..."
              : continuousMode
              ? "Continuous mode - Auto-detects when you speak"
              : "Manual mode - Click mic to start, stop when done"}
          </p>
          {transcript && !isListening && !isProcessing && (
            <p className="text-sm text-slate-500 mt-2">"{transcript}"</p>
          )}
        </div>

        {/* Control Buttons */}
        <div className="flex gap-3">
          {/* Permanent Stop Button */}
          {isListening && (
            <button
              onClick={stopAllRecording}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium shadow-md flex items-center gap-2"
              title="Stop all recording"
            >
              <BiStop className="text-lg" /> Stop Listening
            </button>
          )}

          {isSpeaking && (
            <button
              onClick={stopSpeaking}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm"
            >
              Stop Speaking
            </button>
          )}
          {conversation.length > 0 && !isListening && !isProcessing && (
            <button
              onClick={clearConversation}
              className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors flex items-center gap-2 text-sm"
            >
              <BiTrash /> Clear Chat
            </button>
          )}
        </div>
      </div>

      {/* Conversation History */}
      {conversation.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-700 mb-3">
            Conversation
          </h3>
          {conversation.map((msg, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-lg ${
                msg.role === "user"
                  ? "bg-blue-50 border border-blue-200"
                  : "bg-green-50 border border-green-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl">
                  {msg.role === "user" ? "👤" : "🤖"}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium text-slate-500 mb-1">
                    {msg.role === "user" ? "You" : agentName}
                  </p>
                  <p className="text-slate-800">{msg.content}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VoiceChat;
