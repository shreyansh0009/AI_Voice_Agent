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

  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const deepgramRef = useRef(null);
  const conversationHistoryRef = useRef([]);
  const isRecordingRef = useRef(false); // Track recording state immediately
  
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
        
        // Stop all tracks
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop());
          mediaStreamRef.current = null;
        }
      };

      isRecordingRef.current = true;
      mediaRecorderRef.current.start();
      setIsListening(true);
      setTranscript('Listening...');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setError('Microphone access denied. Please allow microphone access in your browser.');
    }
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
  };

  /**
   * Process recorded audio: STT → OpenAI → TTS
   */
  const processAudio = async (audioBlob) => {
    setIsProcessing(true);
    
    try {
      // Step 1: Convert speech to text using Deepgram
      setTranscript('Converting speech to text...');
      const userText = await speechToText(audioBlob);

      if (!userText || userText.trim().length === 0) {
        setTranscript('');
        setError('No speech detected. Please speak clearly and try again.');
        setIsProcessing(false);
        return;
      }

      setTranscript(userText);
      
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
    } catch (error) {
      console.error('Error processing audio:', error);
      setError('Error processing your request: ' + error.message);
      setIsProcessing(false);
      setTranscript('');
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

      // Build enhanced system prompt with language instructions
      const enhancedSystemPrompt = `${systemPrompt || 'You are a helpful AI assistant.'}

Current language: ${currentLanguageName}. Keep responses brief for voice chat.
To switch language, respond with "LANGUAGE_SWITCH:[code]" then your message.
Codes: en, hi, ta, te, kn, ml, bn, mr, gu, pa, es, fr, de, zh, ja, ko`;

      // Get the last user message
      const lastUserMessage = conversationHistoryRef.current[conversationHistoryRef.current.length - 1]?.content || '';

      // If RAG is enabled, use the RAG endpoint
      if (ragEnabled && lastUserMessage) {
        try {
          const ragResponse = await fetch('http://localhost:5000/api/rag/chat', {
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
```   */
  const clearConversation = () => {
    setConversation([]);
    conversationHistoryRef.current = [];
    setTranscript('');
    setError('');
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
          Click the microphone to start speaking. Your conversation will be transcribed and the agent will respond with voice. Try saying "Switch to Hindi" or "Talk in Tamil" to change languages!
        </p>
      </div>

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
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Voice Control */}
      <div className="flex flex-col items-center gap-4 mb-8">
        <div className="relative">
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
            style={{ pointerEvents: (isProcessing || isSpeaking) ? 'none' : 'auto' }}
            className={`w-32 h-32 rounded-full flex items-center justify-center text-white text-5xl transition-all shadow-lg cursor-pointer ${
              isListening
                ? 'bg-red-500 hover:bg-red-600'
                : isProcessing
                ? 'bg-gray-400 cursor-not-allowed'
                : isSpeaking
                ? 'bg-green-500'
                : 'bg-blue-500 hover:bg-blue-600'
            } ${(isProcessing || isSpeaking) ? 'opacity-75' : ''}`}
            title={isListening ? 'Stop recording' : 'Start speaking'}
          >
            {isListening ? <BiStop /> : isSpeaking ? <BiVolumeFull /> : <BiMicrophone />}
          </button>
          
          {/* Pulsing ring effect when listening */}
          {isListening && (
            <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-25 pointer-events-none"></div>
          )}
        </div>

        {/* Status Text */}
        <div className="text-center">
          <p className="text-lg font-medium text-slate-700">
            {isListening
              ? '🎤 Listening... Click to stop'
              : isProcessing
              ? '⏳ Processing...'
              : isSpeaking
              ? '🔊 Speaking...'
              : '🎙️ Click to start speaking'}
          </p>
          {transcript && !isListening && !isProcessing && (
            <p className="text-sm text-slate-500 mt-2">"{transcript}"</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
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
