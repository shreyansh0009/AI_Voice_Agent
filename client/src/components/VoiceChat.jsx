import React, { useState, useRef, useEffect } from 'react';
import { BiMicrophone, BiStop, BiVolumeFull, BiTrash } from 'react-icons/bi';
import { createClient } from '@deepgram/sdk';
import axios from 'axios';

const VoiceChat = ({ systemPrompt, agentName = "AI Agent" }) => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [conversation, setConversation] = useState([]);
  const [error, setError] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en'); // Language selector
  const [selectedVoice, setSelectedVoice] = useState('anushka'); // Voice selector

  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const deepgramRef = useRef(null);
  const conversationHistoryRef = useRef([]);
  const isRecordingRef = useRef(false); // Track recording state immediately

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
      console.log('Start button clicked!');
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      console.log('Got media stream');
      
      // Store stream reference for cleanup
      mediaStreamRef.current = stream;
      
      // Use audio/webm;codecs=opus for better Deepgram compatibility
      const mimeType = 'audio/webm;codecs=opus';
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: mimeType,
      });

      console.log('Created MediaRecorder');

      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        console.log('MediaRecorder stopped, processing audio...');
        isRecordingRef.current = false; // Ensure ref is reset
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
        await processAudio(audioBlob);
        
        // Stop all tracks
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop());
          mediaStreamRef.current = null;
        }
      };

      isRecordingRef.current = true; // Set ref BEFORE starting
      mediaRecorderRef.current.start();
      console.log('MediaRecorder started, state:', mediaRecorderRef.current.state);
      console.log('isRecordingRef set to:', isRecordingRef.current);
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
    console.log('Stop button clicked!');
    console.log('isRecordingRef.current:', isRecordingRef.current);
    console.log('MediaRecorder state:', mediaRecorderRef.current?.state);
    console.log('isListening state:', isListening);
    
    if (isRecordingRef.current && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      console.log('Stopping recording...');
      mediaRecorderRef.current.stop();
      isRecordingRef.current = false; // Set ref immediately
      setIsListening(false);
      setTranscript('Processing...');
    } else {
      console.log('Not recording - isRecordingRef:', isRecordingRef.current, 'state:', mediaRecorderRef.current?.state);
    }
  };

  /**
   * Process recorded audio: STT → OpenAI → TTS
   */
  const processAudio = async (audioBlob) => {
    setIsProcessing(true);
    console.log('Processing audio blob, size:', audioBlob.size);
    
    try {
      // Step 1: Convert speech to text using Deepgram
      setTranscript('Converting speech to text...');
      console.log('Calling speechToText...');
      const userText = await speechToText(audioBlob);
      console.log('Transcript received:', userText);

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
      console.log('Calling OpenAI...');
      const aiResponse = await getAIResponse();
      console.log('AI response received:', aiResponse);

      // Add AI message to conversation
      const aiMessage = { role: 'assistant', content: aiResponse };
      setConversation(prev => [...prev, aiMessage]);
      conversationHistoryRef.current.push(aiMessage);

      // Step 3: Speak the response using Sarvam AI
      setTranscript('');
      console.log('Speaking response with Sarvam...');
      await speakTextWithSarvam(aiResponse);
      console.log('Speech completed');

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
      console.log('speechToText called');
      if (!deepgramRef.current) {
        console.error('Deepgram client not initialized');
        throw new Error('Deepgram not initialized');
      }

      console.log('Converting blob to array buffer...');
      // Convert blob to array buffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      console.log('Audio buffer size:', arrayBuffer.byteLength);

      // Use Deepgram's streaming connection for browser compatibility
      console.log('Creating Deepgram live connection...');
      
      return new Promise((resolve, reject) => {
        let transcriptText = '';
        let resultsReceived = 0;
        
        const connection = deepgramRef.current.listen.live({
          model: 'nova-2',
          smart_format: true,
          punctuate: true,
          language: selectedLanguage, // Use selected language
          encoding: 'opus',  // Match our audio codec
          // Note: sample_rate not needed for opus
        });

        connection.on('open', () => {
          console.log('Deepgram connection opened with language:', selectedLanguage);
          
          // Send the audio data
          connection.send(arrayBuffer);
          console.log('Audio data sent to Deepgram');
          
          // Close connection after sending (give it time to process)
          setTimeout(() => {
            console.log('Finishing Deepgram connection...');
            connection.finish();
          }, 1500);
        });

        connection.on('Results', (data) => {
          resultsReceived++;
          console.log(`Deepgram result #${resultsReceived} received:`, data);
          console.log('Full data structure:', JSON.stringify(data, null, 2));
          
          // Try multiple ways to extract transcript
          let transcript = null;
          
          // Method 1: Check channel.alternatives[0].transcript
          if (data.channel?.alternatives?.[0]?.transcript) {
            transcript = data.channel.alternatives[0].transcript;
            console.log('Method 1 (channel.alternatives) - Transcript:', transcript);
          }
          
          // Method 2: Check if it's in the first channel_index
          if (!transcript && data.channel_index && Array.isArray(data.channel_index)) {
            console.log('Trying channel_index method...');
          }
          
          if (transcript && transcript.trim().length > 0) {
            transcriptText += transcript + ' ';
            console.log('Added to transcript. Current full text:', transcriptText);
          } else {
            console.log('No transcript in this result or transcript is empty');
          }
        });

        connection.on('close', () => {
          console.log('Deepgram connection closed');
          console.log('Total results received:', resultsReceived);
          console.log('Final transcript:', transcriptText.trim());
          
          const finalTranscript = transcriptText.trim();
          if (finalTranscript) {
            resolve(finalTranscript);
          } else {
            reject(new Error('No transcript received. Please speak clearly and try again.'));
          }
        });

        connection.on('error', (error) => {
          console.error('Deepgram streaming error:', error);
          reject(error);
        });

        // Timeout after 15 seconds
        setTimeout(() => {
          console.log('Deepgram timeout check - transcript:', transcriptText);
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
   * Get AI response using OpenAI
   */
  const getAIResponse = async () => {
    try {
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OpenAI API key not found');
      }

      // Build messages array with conversation history
      const messages = [
        {
          role: 'system',
          content: systemPrompt || 'You are a helpful AI assistant. Keep your responses concise and conversational, suitable for voice interaction.',
        },
        ...conversationHistoryRef.current,
      ];

      // Call OpenAI API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: messages,
          temperature: 0.7,
          max_tokens: 150, // Keep responses short for voice
        }),
      });

      if (!response.ok) {
        throw new Error('OpenAI API request failed');
      }

      const data = await response.json();
      return data.choices[0].message.content;
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
      console.log('speakTextWithSarvam called with:', text);
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

      const sarvamLanguage = languageMap[selectedLanguage] || 'en-IN';
      console.log('Using Sarvam language:', sarvamLanguage);

      // Call Sarvam TTS API
      console.log('Calling Sarvam TTS API...');
      console.log('Request payload:', {
        inputs: [text],
        target_language_code: sarvamLanguage,
        speaker: selectedVoice,
        model: 'bulbul:v2'
      });
      
      const response = await axios.post(
        'https://api.sarvam.ai/text-to-speech',
        {
          inputs: [text],
          target_language_code: sarvamLanguage,
          speaker: selectedVoice, // Use selected voice
          model: 'bulbul:v2'
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'api-subscription-key': apiKey // Try lowercase header
          }
        }
      );

      console.log('Sarvam response received');

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
      
      console.log('Playing audio...');
      
      return new Promise((resolve, reject) => {
        audio.onended = () => {
          console.log('Audio playback ended');
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
          Click the microphone to start speaking. Your conversation will be transcribed and the agent will respond with voice.
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
              console.log('=== BUTTON CLICK ===');
              console.log('isRecordingRef.current:', isRecordingRef.current);
              console.log('isProcessing:', isProcessing);
              console.log('isSpeaking:', isSpeaking);
              
              // Don't do anything if processing or speaking
              if (isProcessing || isSpeaking) {
                console.log('Button disabled, ignoring click');
                return;
              }
              
              if (isRecordingRef.current) {
                console.log('STOPPING recording via onClick');
                stopListening();
              } else {
                console.log('STARTING recording via onClick');
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
