import React, { useState, useRef, useEffect } from 'react';
import { BiMicrophone, BiStop, BiVolumeFull, BiTrash } from 'react-icons/bi';
import { createClient } from '@deepgram/sdk';
import axios from 'axios';

const VoiceChat = ({ systemPrompt, agentName = "AI Agent", useRAG = true, agentId = 'default' }) => {
  // Initialize language from localStorage or default to 'en'
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    const saved = localStorage.getItem('voiceChat_selectedLanguage');
    return saved || 'en';
  });
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [conversation, setConversation] = useState([]);
  const [error, setError] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('anushka'); // Voice selector
  const [ragEnabled, setRagEnabled] = useState(useRAG); // RAG toggle
  
  // Continuous voice mode (auto-listen after speaking)
  const [continuousMode, setContinuousMode] = useState(() => {
    const saved = localStorage.getItem('voiceChat_continuousMode');
    return saved ? JSON.parse(saved) : false;
  });
  
  // Voice sensitivity for continuous mode (1-10 scale, higher = less sensitive)
  const [voiceSensitivity, setVoiceSensitivity] = useState(() => {
    const saved = localStorage.getItem('voiceChat_sensitivity');
    return saved ? parseInt(saved) : 5; // Default medium sensitivity
  });
  
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0); // Current audio level for visualization (0-100)
  
  // Persistent memory for important information (survives beyond chat history)
  const [customerContext, setCustomerContext] = useState(() => {
    const saved = localStorage.getItem('voiceChat_customerContext');
    return saved ? JSON.parse(saved) : {
      name: '',
      phone: '',
      email: '',
      address: '',
      preferences: {},
      orderDetails: {},
      lastUpdated: null
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
  // Initialize continuousModeRef with saved value
  const savedContinuousMode = localStorage.getItem('voiceChat_continuousMode');
  const continuousModeRef = useRef(savedContinuousMode ? JSON.parse(savedContinuousMode) : false);
  
  // Initialize currentLanguageRef from localStorage
  const savedLanguage = localStorage.getItem('voiceChat_selectedLanguage');
  const currentLanguageRef = useRef(savedLanguage || 'en');

  // Debug: Log every render with current ref value
  console.log(`🔄 VoiceChat render - currentLanguageRef.current: ${currentLanguageRef.current}, selectedLanguage state: ${selectedLanguage}`);

  // Update currentLanguageRef whenever selectedLanguage changes
  useEffect(() => {
    console.log(`🔄 useEffect triggered: Syncing currentLanguageRef from "${currentLanguageRef.current}" to "${selectedLanguage}"`);
    currentLanguageRef.current = selectedLanguage;
    
    // Persist to localStorage
    localStorage.setItem('voiceChat_selectedLanguage', selectedLanguage);
    console.log(`✅ useEffect complete: currentLanguageRef.current is now "${currentLanguageRef.current}" and saved to localStorage`);
  }, [selectedLanguage]);

  // Save customer context to localStorage whenever it changes
  useEffect(() => {
    // Keep ref in sync for immediate reads
    customerContextRef.current = customerContext;

    if (customerContext.lastUpdated) {
      localStorage.setItem('voiceChat_customerContext', JSON.stringify(customerContext));
      console.log('💾 Customer context saved:', customerContext);
    }
  }, [customerContext]);

  // Save continuous mode setting to localStorage
  useEffect(() => {
    localStorage.setItem('voiceChat_continuousMode', JSON.stringify(continuousMode));
    continuousModeRef.current = continuousMode; // Sync ref
  }, [continuousMode]);

  // Save voice sensitivity setting to localStorage
  useEffect(() => {
    localStorage.setItem('voiceChat_sensitivity', voiceSensitivity.toString());
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
    const voiceFrequencyStart = Math.floor((85 / (sampleRate / 2)) * bufferLength);
    const voiceFrequencyEnd = Math.floor((3000 / (sampleRate / 2)) * bufferLength);

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
    if (Math.random() < 0.01) { // Log ~1% of frames (about once per second)
      console.log('🎵 Audio level:', normalizedLevel.toFixed(1), '| Raw average:', average.toFixed(1));
    }

    // Continue animation loop
    audioLevelIntervalRef.current = requestAnimationFrame(updateAudioLevel);
  };

  // Initialize Deepgram client
  useEffect(() => {
    const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY;
    if (apiKey) {
      deepgramRef.current = createClient(apiKey);
    } else {
      setError('Deepgram API key not found. Please add VITE_DEEPGRAM_API_KEY to your .env file');
    }

    // Cleanup on unmount
    return () => {
      isRecordingRef.current = false;
      if (audioLevelIntervalRef.current) {
        cancelAnimationFrame(audioLevelIntervalRef.current);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  /**
   * Start listening to user's voice
   */
  const startListening = async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Store stream reference for cleanup
      mediaStreamRef.current = stream;
      
      // Set up audio analyser for visualization (shared with VAD in continuous mode)
      if (!continuousModeRef.current) {
        // Only create analyser in manual mode (continuous mode will create it in VAD setup)
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const audioSource = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        audioSource.connect(analyser);
        analyserRef.current = analyser;
        
        // Start audio level visualization for manual mode
        updateAudioLevel();
      }
      
      // Use audio/webm;codecs=opus for better Deepgram compatibility
      const mimeType = 'audio/webm;codecs=opus';
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: mimeType,
      });

      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        isRecordingRef.current = false;
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
        await processAudio(audioBlob);
        
        // In continuous mode, don't stop the stream - we'll restart listening
        if (!continuousModeRef.current) {
          // Stop all tracks only in manual mode
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
          }
        }
      };

      // Set recording flag BEFORE starting VAD (so VAD doesn't exit immediately)
      isRecordingRef.current = true;
      
      // In continuous mode, use timeslice to collect chunks periodically
      if (continuousModeRef.current) {
        console.log('🎙️ Starting continuous recording with 100ms timeslice');
        mediaRecorderRef.current.start(100); // Collect data every 100ms
        // Set up Voice Activity Detection AFTER starting recording
        setupVoiceActivityDetection(stream);
      } else {
        mediaRecorderRef.current.start(); // Collect all at once
      }
      setIsListening(true);
      setTranscript(continuousModeRef.current ? 'Listening continuously... Speak when ready' : 'Listening...');
      
      if (continuousModeRef.current) {
        console.log('✅ Continuous mode active - VAD will detect when you speak');
      }
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setError('Microphone access denied. Please allow microphone access in your browser.');
    }
  };

  /**
   * Setup Voice Activity Detection for continuous mode
   * Optimized for office environments with background noise
   */
  const setupVoiceActivityDetection = (stream) => {
    // Create audio context for analyzing audio levels
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioSource = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048; // Increased for better frequency resolution
    analyser.smoothingTimeConstant = 0.8; // Smooth out noise spikes
    audioSource.connect(analyser);

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
    // Higher sensitivity number = less sensitive (higher threshold)
    const SPEECH_THRESHOLD = 25 + (voiceSensitivity * 5); // Range: 30-75
    const SILENCE_DURATION = 2000; // 2 seconds of silence before stopping
    const MIN_SPEECH_DURATION = 300; // Minimum 300ms of speech to avoid false triggers
    
    // Calibration for background noise
    let backgroundNoiseLevel = 0;
    let calibrationSamples = [];
    let isCalibrated = false;

    const checkAudioLevel = () => {
      if (!continuousModeRef.current || !isRecordingRef.current) {
        console.log('⚠️ VAD stopped - continuousMode:', continuousModeRef.current, 'isRecording:', isRecordingRef.current);
        audioContext.close(); // Clean up audio context
        return; // Stop checking if continuous mode disabled or not recording
      }

      analyser.getByteFrequencyData(dataArray);
      
      // Debug: Log that we're in the loop
      if (!isCalibrated && calibrationSamples.length === 0) {
        console.log('🔍 First checkAudioLevel call - starting calibration...');
      }
      
      // Focus on human voice frequencies (85Hz - 3000Hz)
      // This helps filter out low-frequency noise (AC, fans) and high-frequency noise
      const voiceFrequencyStart = Math.floor((85 / (audioContext.sampleRate / 2)) * bufferLength);
      const voiceFrequencyEnd = Math.floor((3000 / (audioContext.sampleRate / 2)) * bufferLength);
      
      // Debug frequency range on first call
      if (!isCalibrated && calibrationSamples.length === 0) {
        console.log('🎵 Audio analysis setup:');
        console.log('  - Sample rate:', audioContext.sampleRate, 'Hz');
        console.log('  - Buffer length:', bufferLength);
        console.log('  - Voice frequency range:', voiceFrequencyStart, '-', voiceFrequencyEnd, 'bins');
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
        console.log(`🔍 Calibration sample ${calibrationSamples.length}/30: ${voiceAverage.toFixed(2)}`);
        if (calibrationSamples.length === 30) {
          backgroundNoiseLevel = calibrationSamples.reduce((a, b) => a + b) / 30;
          isCalibrated = true;
          setIsCalibrating(false);
          console.log('✅ Background noise calibrated:', backgroundNoiseLevel.toFixed(2));
          console.log('🎯 Speech detection threshold:', (backgroundNoiseLevel + SPEECH_THRESHOLD).toFixed(2));
          console.log('📊 Ready to detect speech! Speak now...');
        }
      }
      
      // Adaptive threshold based on background noise
      const adaptiveThreshold = isCalibrated ? backgroundNoiseLevel + SPEECH_THRESHOLD : SPEECH_THRESHOLD;
      
      // Debug: Log current levels every 50 frames (~1.5 seconds)
      if (isCalibrated && Math.random() < 0.02) {
        console.log('📊 Audio level:', voiceAverage.toFixed(2), '| Threshold:', adaptiveThreshold.toFixed(2), '| Speaking:', isSpeaking);
      }
      
      if (voiceAverage > adaptiveThreshold) {
        // Potential voice detected
        if (!isSpeaking && !speechStartTime) {
          speechStartTime = Date.now();
          console.log('👂 Potential speech detected, waiting for', MIN_SPEECH_DURATION, 'ms confirmation...');
        }
        
        // Confirm as speech only if it lasts longer than MIN_SPEECH_DURATION
        if (speechStartTime && Date.now() - speechStartTime > MIN_SPEECH_DURATION) {
          if (!isSpeaking) {
            console.log('✅ Speech CONFIRMED! (level:', voiceAverage.toFixed(2), ', threshold:', adaptiveThreshold.toFixed(2), ')');
            isSpeaking = true;
          }
          silenceStart = Date.now();
        }
      } else {
        // Below threshold - potential silence
        if (speechStartTime && !isSpeaking) {
          console.log('❌ False alarm - sound too short (was only', Date.now() - speechStartTime, 'ms)');
        }
        speechStartTime = null; // Reset speech start timer
        
        // Only process if we were actually speaking (not just noise spikes)
        if (isSpeaking && Date.now() - silenceStart > SILENCE_DURATION) {
          console.log('🔇 Silence detected after', SILENCE_DURATION, 'ms, processing speech...');
          console.log('📦 Audio chunks collected so far:', audioChunksRef.current.length);
          isSpeaking = false;
          
          // Stop current recording to process (with small delay for final chunks)
          if (isRecordingRef.current && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            setTimeout(() => {
              if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
              }
            }, 150); // Give 150ms for final chunks to arrive
          }
          audioContext.close(); // Clean up
          return; // Stop checking, will restart after processing
        }
      }

      // Continue checking
      console.log('🔁 Requesting next animation frame... (sample', calibrationSamples.length, ')');
      requestAnimationFrame(checkAudioLevel);
    };

    // Start checking audio levels
    console.log('🎙️ Voice Activity Detection started (calibrating background noise...)');
    console.log('🔧 Sensitivity level:', voiceSensitivity, '(threshold: +' + SPEECH_THRESHOLD + ')');
    console.log('🚀 About to call checkAudioLevel() for the first time...');
    checkAudioLevel();
  };

  /**
   * Stop listening
   */
  const stopListening = () => {
    if (isRecordingRef.current && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      isRecordingRef.current = false;
      setIsListening(false);
      setTranscript('Processing...');
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
    if (isRecordingRef.current && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
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
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    // Reset analyser
    analyserRef.current = null;
    
    // Reset states
    setIsListening(false);
    setIsProcessing(false);
    setAudioLevel(0);
    setTranscript('');
    
    console.log('⏹️ All recording stopped');
  };

  /**
   * Toggle continuous mode on/off
   */
  const toggleContinuousMode = async () => {
    const newMode = !continuousMode;
    
    if (newMode) {
      // Turning ON continuous mode
      console.log('🔄 Continuous mode enabled');
      setContinuousMode(true);
      continuousModeRef.current = true; // Set ref immediately
      // Start listening immediately (ref is already updated)
      setTimeout(() => {
        startListening();
      }, 50);
    } else {
      // Turning OFF continuous mode - stop everything
      console.log('⏸️ Continuous mode disabled');
      setContinuousMode(false);
      continuousModeRef.current = false; // Set ref immediately
      if (isRecordingRef.current) {
        stopListening();
      }
      // Close the media stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
    }
  };

  /**
   * Extract customer information from conversation
   * Simple pattern matching - can be enhanced with AI extraction
   */
  const extractCustomerInfo = (text) => {
    const updates = {};
    
    // Extract phone numbers (Indian format)
    const phoneMatch = text.match(/\b(\+?91[-\s]?)?[6-9]\d{9}\b/);
    if (phoneMatch) {
      updates.phone = phoneMatch[0];
    }
    
    // Extract email
    const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    if (emailMatch) {
      updates.email = emailMatch[0];
    }
    
    // Extract name (if someone says "my name is..." or "I am...")
    const nameMatch = text.match(/(?:my name is|i am|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    if (nameMatch) {
      updates.name = nameMatch[1];
    }
    
    // Extract address keywords
    if (text.toLowerCase().includes('address') || text.toLowerCase().includes('deliver to')) {
      // Store the full text if it mentions address (can be refined later)
      const addressMatch = text.match(/(?:address is|deliver to|ship to)\s+(.+?)(?:\.|$)/i);
      if (addressMatch) {
        updates.address = addressMatch[1].trim();
      }
    }
    
    // If any updates found, merge with existing context
    if (Object.keys(updates).length > 0) {
      // Build the new context synchronously using the ref so callers can read it immediately
      const newContext = {
        ...customerContextRef.current,
        ...updates,
        lastUpdated: new Date().toISOString()
      };
      // Update state and ref
      setCustomerContext(newContext);
      customerContextRef.current = newContext;
      console.log('📝 Extracted customer info (sync):', updates, newContext);
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
        console.warn('⚠️ Empty audio blob, skipping processing');
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
      
      console.log('🎵 Processing audio blob, size:', audioBlob.size, 'bytes');
      
      // Step 1: Convert speech to text using Deepgram
      setTranscript('Converting speech to text...');
      const userText = await speechToText(audioBlob);

      if (!userText || userText.trim().length === 0) {
        setTranscript('');
        console.warn('⚠️ No speech detected in audio');
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
      extractCustomerInfo(userText);
      
      // Add user message to conversation
      const userMessage = { role: 'user', content: userText };
      setConversation(prev => [...prev, userMessage]);
      conversationHistoryRef.current.push(userMessage);

      // Step 2: Get AI response from OpenAI
      setTranscript('Getting AI response...');
      const aiResponse = await getAIResponse();

      // Add AI message to conversation
      const aiMessage = { role: 'assistant', content: aiResponse };
      setConversation(prev => [...prev, aiMessage]);
      conversationHistoryRef.current.push(aiMessage);

      // Step 3: Speak the response using Sarvam AI
      setTranscript('');
      await speakTextWithSarvam(aiResponse);

      setIsProcessing(false);
      
      // In continuous mode, restart listening after AI finishes speaking
      if (continuousModeRef.current && mediaStreamRef.current) {
        console.log('🔄 Continuous mode: Restarting listening...');
        // Small delay to avoid overlap
        setTimeout(() => {
          if (continuousModeRef.current && !isRecordingRef.current) {
            startListening();
          }
        }, 500);
      }
    } catch (error) {
      console.error('Error processing audio:', error);
      setError('Error processing your request: ' + error.message);
      setIsProcessing(false);
      setTranscript('');
      
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
  const speechToText = async (audioBlob) => {
    try {
      if (!deepgramRef.current) {
        console.error('Deepgram client not initialized');
        throw new Error('Deepgram not initialized');
      }

      // Convert blob to array buffer
      const arrayBuffer = await audioBlob.arrayBuffer();

      return new Promise((resolve, reject) => {
        let transcriptText = '';
        
        // Use ref to get the most current language (might have been switched)
        const languageToUse = currentLanguageRef.current;
        console.log('🎤 Deepgram STT STARTING...');
        console.log('📊 selectedLanguage state:', selectedLanguage);
        console.log('📊 currentLanguageRef.current:', currentLanguageRef.current);
        console.log('🎤 Deepgram will use language:', languageToUse);
        
        const connection = deepgramRef.current.listen.live({
          model: 'nova-2',
          smart_format: true,
          punctuate: true,
          language: languageToUse, // Use ref instead of state
          encoding: 'opus',  // Match our audio codec
          // Note: sample_rate not needed for opus
        });

        connection.on('open', () => {
          // Send the audio data
          connection.send(arrayBuffer);
          
          // Close connection after sending (give it time to process)
          setTimeout(() => {
            connection.finish();
          }, 1500);
        });

        connection.on('Results', (data) => {
          // Try multiple ways to extract transcript
          let transcript = null;
          
          // Method 1: Check channel.alternatives[0].transcript
          if (data.channel?.alternatives?.[0]?.transcript) {
            transcript = data.channel.alternatives[0].transcript;
          }
          
          if (transcript && transcript.trim().length > 0) {
            transcriptText += transcript + ' ';
          }
        });

        connection.on('close', () => {
          const finalTranscript = transcriptText.trim();
          if (finalTranscript) {
            console.log('✅ Transcript:', finalTranscript);
            resolve(finalTranscript);
          } else {
            const languageNames = {
              'en': 'English', 'hi': 'Hindi', 'ta': 'Tamil', 'te': 'Telugu',
              'kn': 'Kannada', 'ml': 'Malayalam', 'bn': 'Bengali', 'mr': 'Marathi',
              'gu': 'Gujarati', 'pa': 'Punjabi', 'es': 'Spanish', 'fr': 'French',
              'de': 'German', 'zh': 'Chinese', 'ja': 'Japanese', 'ko': 'Korean'
            };
            const currentLangName = languageNames[languageToUse] || languageToUse;
            reject(new Error(`No speech detected. Please speak in ${currentLangName} or select a different language.`));
          }
        });

        connection.on('error', (error) => {
          console.error('Deepgram streaming error:', error);
          reject(error);
        });

        // Timeout after 15 seconds
        setTimeout(() => {
          if (!transcriptText.trim()) {
            connection.finish();
            reject(new Error('Transcription timeout - no speech detected'));
          }
        }, 15000);
      });
    } catch (error) {
      console.error('Speech-to-text error:', error);
      throw new Error('Failed to convert speech to text: ' + error.message);
    }
  };

  /**
   * Get AI response using OpenAI or RAG
   */
  const getAIResponse = async () => {
    try {
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OpenAI API key not found');
      }

      // Language mapping
      const languageNames = {
        'en': 'English',
        'hi': 'Hindi',
        'ta': 'Tamil',
        'te': 'Telugu',
        'kn': 'Kannada',
        'ml': 'Malayalam',
        'bn': 'Bengali',
        'mr': 'Marathi',
        'gu': 'Gujarati',
        'pa': 'Punjabi',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'zh': 'Chinese',
        'ja': 'Japanese',
        'ko': 'Korean'
      };

      const currentLanguageName = languageNames[selectedLanguage] || 'English';

      // Build customer context summary for the prompt (use ref for latest data)
      const latestCustomerContext = customerContextRef.current || {};
      const contextSummary = [];
      if (latestCustomerContext.name) contextSummary.push(`Name: ${latestCustomerContext.name}`);
      if (latestCustomerContext.phone) contextSummary.push(`Phone: ${latestCustomerContext.phone}`);
      if (latestCustomerContext.email) contextSummary.push(`Email: ${latestCustomerContext.email}`);
      if (latestCustomerContext.address) contextSummary.push(`Address: ${latestCustomerContext.address}`);
      if (Object.keys(latestCustomerContext.orderDetails || {}).length > 0) {
        contextSummary.push(`Order: ${JSON.stringify(latestCustomerContext.orderDetails)}`);
      }
      
      const customerContextString = contextSummary.length > 0 
        ? `\n\nCUSTOMER INFORMATION (Remember this throughout the conversation):\n${contextSummary.join('\n')}\n`
        : '';

      // Build enhanced system prompt with language instructions AND customer context
      const enhancedSystemPrompt = `${systemPrompt || 'You are a helpful AI assistant.'}
${customerContextString}
Current language: ${currentLanguageName}. Keep responses brief for voice chat.
To switch language, respond with "LANGUAGE_SWITCH:[code]" then your message.
Codes: en, hi, ta, te, kn, ml, bn, mr, gu, pa, es, fr, de, zh, ja, ko

IMPORTANT: If customer provides personal details (name, address, phone, email, order info), acknowledge them and remember them for the entire conversation.`;

      // Get the last user message
      const lastUserMessage = conversationHistoryRef.current[conversationHistoryRef.current.length - 1]?.content || '';

      // If RAG is enabled, use the RAG endpoint
      if (ragEnabled && lastUserMessage) {
        try {
          const ragResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/rag/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: lastUserMessage,
              conversationHistory: conversationHistoryRef.current.slice(-6),
              systemPrompt: enhancedSystemPrompt, // Pass full prompt with language instructions
              options: {
                temperature: 0.7,
                max_tokens: 500,
              }
            }),
          });

          if (ragResponse.ok) {
            const ragData = await ragResponse.json();
            if (ragData.success) {
              console.log('🤖 Using RAG response with knowledge base');
              console.log('📊 Tokens used:', ragData.tokensUsed);
              console.log('📚 Context used:', ragData.contextUsed);
              
              let aiResponse = ragData.response;
              
              // Log the AI response to debug language switching
              console.log('🤖 RAG AI Response:', aiResponse);
              console.log('🔍 Starts with LANGUAGE_SWITCH?', aiResponse.startsWith('LANGUAGE_SWITCH:'));

              // Check if AI wants to switch language (same logic as standard OpenAI)
              if (aiResponse.startsWith('LANGUAGE_SWITCH:')) {
                const match = aiResponse.match(/^LANGUAGE_SWITCH:([a-z]{2})[\s\n]/i);
                
                if (match) {
                  const newLanguageCode = match[1].toLowerCase();
                  
                  console.log(`🔍 Extracted language code: "${newLanguageCode}"`);
                  
                  if (languageNames[newLanguageCode]) {
                    console.log(`🌐 Language switching from ${currentLanguageRef.current} to ${newLanguageCode}`);
                    
                    // CRITICAL: Update ref FIRST (synchronous), then state (async)
                    currentLanguageRef.current = newLanguageCode;
                    setSelectedLanguage(newLanguageCode);
                    
                    console.log(`✅ Language switched!`);
                    console.log(`  - currentLanguageRef.current: ${currentLanguageRef.current}`);
                    console.log(`  - selectedLanguage state: updating to "${newLanguageCode}"`);
                    
                    // Remove the switch command from response
                    aiResponse = aiResponse.replace(/^LANGUAGE_SWITCH:[a-z]{2}[\s\n]+/i, '').trim();
                  }
                }
              }
              
              return aiResponse;
            }
          }
          console.log('⚠️ RAG failed, falling back to standard OpenAI');
        } catch (ragError) {
          console.warn('RAG error, using standard OpenAI:', ragError);
        }
      }

      // Standard OpenAI response (fallback or when RAG disabled)

      // Build messages array with LIMITED conversation history (last 6 messages = 3 exchanges)
      // This significantly reduces token usage while maintaining context
      const recentHistory = conversationHistoryRef.current.slice(-6);
      const messages = [
        {
          role: 'system',
          content: enhancedSystemPrompt,
        },
        ...recentHistory,
      ];

      // Call OpenAI API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', // Much cheaper than gpt-4 (15x cheaper!) and faster
          messages: messages,
          temperature: 0.7,
          max_tokens: 100, // Reduced from 150 - shorter responses for voice
        }),
      });

      if (!response.ok) {
        throw new Error('OpenAI API request failed');
      }

      const data = await response.json();
      let aiResponse = data.choices[0].message.content;

      // Log the AI response to debug language switching
      console.log('🤖 AI Response:', aiResponse);
      console.log('🔍 Starts with LANGUAGE_SWITCH?', aiResponse.startsWith('LANGUAGE_SWITCH:'));

      // Check if AI wants to switch language
      if (aiResponse.startsWith('LANGUAGE_SWITCH:')) {
        // Extract language code - it should be right after "LANGUAGE_SWITCH:" and before space or newline
        const match = aiResponse.match(/^LANGUAGE_SWITCH:([a-z]{2})[\s\n]/i);
        
        if (match) {
          const newLanguageCode = match[1].toLowerCase();
          
          console.log(`🔍 Extracted language code: "${newLanguageCode}"`);
          console.log(`🔍 Language code exists in map?`, languageNames[newLanguageCode]);
          
          // Update the language
          if (languageNames[newLanguageCode]) {
            console.log(`🌐 Language switching from ${currentLanguageRef.current} to ${newLanguageCode}`);
            
            // CRITICAL: Update ref FIRST (synchronous), then state (async)
            // This ensures the ref has the new value immediately for next recording
            currentLanguageRef.current = newLanguageCode;
            setSelectedLanguage(newLanguageCode);
            
            console.log(`✅ Language switched!`);
            console.log(`  - currentLanguageRef.current: ${currentLanguageRef.current} (updated synchronously)`);
            console.log(`  - selectedLanguage state: will update to "${newLanguageCode}" (async)`);
            
            // Remove the switch command from response (everything after "LANGUAGE_SWITCH:xx ")
            aiResponse = aiResponse.replace(/^LANGUAGE_SWITCH:[a-z]{2}[\s\n]+/i, '').trim();
          } else {
            console.log(`❌ Language code "${newLanguageCode}" not found in languageNames map`);
          }
        } else {
          console.log(`❌ Could not extract valid language code from response`);
        }
      }

      return aiResponse;
    } catch (error) {
      console.error('OpenAI error:', error);
      throw new Error('Failed to get AI response');
    }
  };

  /**
   * Text-to-Speech using Sarvam AI
   */
  const speakTextWithSarvam = async (text) => {
    try {
      setIsSpeaking(true);

      const apiKey = import.meta.env.VITE_SARVAM_API_KEY;
      if (!apiKey) {
        console.error('Sarvam API key not found');
        throw new Error('Sarvam API key not configured. Please add VITE_SARVAM_API_KEY to .env.local');
      }

      // Map our language codes to Sarvam's format
      const languageMap = {
        'en': 'en-IN',
        'hi': 'hi-IN',
        'ta': 'ta-IN',
        'te': 'te-IN',
        'kn': 'kn-IN',
        'ml': 'ml-IN',
        'bn': 'bn-IN',
        'mr': 'mr-IN',
        'gu': 'gu-IN',
        'pa': 'pa-IN',
      };

      const sarvamLanguage = languageMap[currentLanguageRef.current] || 'en-IN';
      
      const response = await axios.post(
        'https://api.sarvam.ai/text-to-speech',
        {
          inputs: [text],
          target_language_code: sarvamLanguage,
          speaker: selectedVoice,
          model: 'bulbul:v2'
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'api-subscription-key': apiKey // Try lowercase header
          }
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
      const audioBlob = new Blob([arrayBuffer], { type: 'audio/wav' });
      
      // Create audio URL and play
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      return new Promise((resolve, reject) => {
        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          resolve();
        };

        audio.onerror = (error) => {
          console.error('Audio playback error:', error);
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          reject(error);
        };

        audio.play().catch(error => {
          console.error('Error playing audio:', error);
          setIsSpeaking(false);
          reject(error);
        });
      });

    } catch (error) {
      console.error('Sarvam TTS error:', error);
      setIsSpeaking(false);
      
      // Show user-friendly error
      if (error.response) {
        console.error('Sarvam API error response:', error.response.data);
        console.error('Full error object:', JSON.stringify(error.response.data, null, 2));
        
        const errorMsg = error.response.data?.error?.message || error.response.data?.message || error.response.statusText;
        throw new Error(`Sarvam TTS failed: ${errorMsg}`);
      } else {
        throw new Error('Failed to generate speech: ' + error.message);
      }
    }
  };

  /**
   * Clear conversation history
   */
  const clearConversation = () => {
    setConversation([]);
    conversationHistoryRef.current = [];
    setTranscript('');
    setError('');
  };

  /**
   * Clear customer context (personal info)
   */
  const clearCustomerContext = () => {
    const emptyContext = {
      name: '',
      phone: '',
      email: '',
      address: '',
      preferences: {},
      orderDetails: {},
      lastUpdated: null
    };
    setCustomerContext(emptyContext);
    localStorage.removeItem('voiceChat_customerContext');
    console.log('🗑️ Customer context cleared');
  };

  /**
   * Stop speaking
   */
  const stopSpeaking = () => {
    // Stop any playing audio
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach(audio => {
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
            ? '🎤 Continuous mode is ON! Just speak naturally - the system will automatically detect when you start and stop talking. The AI will respond and then wait for you to speak again.'
            : 'Click the microphone to start speaking. Your conversation will be transcribed and the agent will respond with voice. Try saying "Switch to Hindi" or "Talk in Tamil" to change languages!'
          }
        </p>
      </div>

      {/* Customer Context Display */}
      {(customerContext.name || customerContext.phone || customerContext.email || customerContext.address) && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-blue-900 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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
            {customerContext.address && (
              <div className="flex items-start gap-2 col-span-2">
                <span className="text-blue-700 font-medium">Address:</span>
                <span className="text-blue-900">{customerContext.address}</span>
              </div>
            )}
          </div>
          <p className="text-xs text-blue-600 mt-2">
            💡 This information is remembered throughout the entire conversation, even after 10+ messages!
          </p>
        </div>
      )}

      {/* Language and Voice Selectors */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-700">Language:</label>
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

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-700">Voice:</label>
          <select 
            value={selectedVoice} 
            onChange={(e) => setSelectedVoice(e.target.value)}
            disabled={isListening || isProcessing}
            className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
          >
            <optgroup label="👩 Female Voices">
              <option value="anushka">Anushka</option>
              <option value="manisha">Manisha</option>
              <option value="vidya">Vidya</option>
              <option value="isha">Isha</option>
              <option value="ritu">Ritu</option>
              <option value="sakshi">Sakshi</option>
              <option value="priya">Priya</option>
              <option value="neha">Neha</option>
              <option value="pooja">Pooja</option>
              <option value="simran">Simran</option>
              <option value="kavya">Kavya</option>
              <option value="anjali">Anjali</option>
              <option value="sneha">Sneha</option>
              <option value="sunita">Sunita</option>
              <option value="tara">Tara</option>
              <option value="kriti">Kriti</option>
            </optgroup>
            <optgroup label="👨 Male Voices">
              <option value="abhilash">Abhilash</option>
              <option value="arya">Arya</option>
              <option value="karun">Karun</option>
              <option value="hitesh">Hitesh</option>
              <option value="aditya">Aditya</option>
              <option value="chirag">Chirag</option>
              <option value="harsh">Harsh</option>
              <option value="rahul">Rahul</option>
              <option value="rohan">Rohan</option>
              <option value="kiran">Kiran</option>
              <option value="vikram">Vikram</option>
              <option value="rajesh">Rajesh</option>
              <option value="anirudh">Anirudh</option>
              <option value="ishaan">Ishaan</option>
            </optgroup>
          </select>
        </div>

        {/* RAG Toggle */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
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
          <span className="text-xs text-slate-500">
            {ragEnabled ? '✓ Enhanced with uploaded documents' : '⚠ Basic mode only'}
          </span>
        </div>

        {/* Continuous Mode Toggle */}
        <div className="flex items-center gap-2">
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
            {continuousMode ? '🎤 Auto-detect speech' : '⏸️ Manual mode'}
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
                <span className="text-xs text-orange-600 animate-pulse">(Calibrating...)</span>
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
            <span>🔊 More Sensitive<br/>(picks up quieter sounds)</span>
            <span className="text-center">⚖️ Balanced<br/>(recommended for office)</span>
            <span className="text-right">🔇 Less Sensitive<br/>(ignores background noise)</span>
          </div>
          <p className="text-xs text-slate-600 mt-3 bg-white p-2 rounded border border-slate-200">
            💡 <strong>Tip:</strong> If background noise triggers false detections, increase the level. 
            If your voice isn't being detected, decrease the level. The system auto-calibrates on startup!
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
                  ? (isCalibrating ? '#f97316' : '#22c55e')
                  : '#ef4444'
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
                ? (continuousMode 
                    ? (isCalibrating ? 'bg-orange-500' : 'bg-green-500') 
                    : 'bg-red-500 hover:bg-red-600')
                : isProcessing
                ? 'bg-gray-400 cursor-not-allowed'
                : isSpeaking
                ? 'bg-blue-500'
                : 'bg-blue-500 hover:bg-blue-600'
            } ${(isProcessing || isSpeaking) ? 'opacity-75' : ''}`}
            style={{
              transform: isListening && audioLevel > 0 
                ? `scale(${1 + (audioLevel / 100) * 0.2})` 
                : 'scale(1)'
            }}
            title={isListening ? 'Listening...' : 'Start speaking'}
          >
            {isCalibrating ? '🔧' : isListening ? <BiMicrophone /> : isSpeaking ? <BiVolumeFull /> : isProcessing ? '⏳' : <BiMicrophone />}
          </button>
        </div>

        {/* Status Text */}
        <div className="text-center">
          <p className="text-lg font-medium text-slate-700">
            {isCalibrating
              ? '🔧 Calibrating noise levels...'
              : isListening
              ? (continuousMode ? '🎤 Listening... Speak naturally' : '🎤 Listening... Click stop when done')
              : isProcessing
              ? '⏳ Processing your request...'
              : isSpeaking
              ? '🔊 AI is responding...'
              : (continuousMode ? '💤 Click microphone to start' : '🎙️ Click microphone to start speaking')}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {isCalibrating 
              ? 'Please wait while we measure background noise...'
              : continuousMode
              ? 'Continuous mode - Auto-detects when you speak'
              : 'Manual mode - Click mic to start, stop when done'
            }
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
          <h3 className="text-lg font-semibold text-slate-700 mb-3">Conversation</h3>
          {conversation.map((msg, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-blue-50 border border-blue-200'
                  : 'bg-green-50 border border-green-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl">
                  {msg.role === 'user' ? '👤' : '🤖'}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium text-slate-500 mb-1">
                    {msg.role === 'user' ? 'You' : agentName}
                  </p>
                  <p className="text-slate-800">{msg.content}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Setup Instructions */}
      {!deepgramRef.current && (
        <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h4 className="font-semibold text-yellow-800 mb-2">Setup Required:</h4>
          <ol className="text-sm text-yellow-700 space-y-1 list-decimal list-inside">
            <li>Get your Deepgram API key from: https://console.deepgram.com/</li>
            <li>Add to your .env file: VITE_DEEPGRAM_API_KEY=your_key_here</li>
            <li>Restart the dev server</li>
          </ol>
        </div>
      )}
    </div>
  );
};

export default VoiceChat;
