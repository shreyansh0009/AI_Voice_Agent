import { createClient } from '@deepgram/sdk';
import axios from 'axios';

class DeepgramService {
  constructor() {
    this.apiKey = process.env.DEEPGRAM_API_KEY;
    
    if (!this.apiKey) {
      console.warn('⚠️  DEEPGRAM_API_KEY not found in environment variables');
      this.client = null;
    } else {
      this.client = createClient(this.apiKey);
      console.log('✓ Deepgram service initialized');
    }
  }

  /**
   * Check if Deepgram is ready
   */
  isReady() {
    return !!this.client;
  }

  /**
   * Transcribe audio from a URL
   * @param {string} audioUrl - URL of the audio file to transcribe
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} - Transcription result
   */
  async transcribeFromUrl(audioUrl, options = {}) {
    if (!this.isReady()) {
      throw new Error('Deepgram service not initialized. Check DEEPGRAM_API_KEY.');
    }

    try {
      const defaultOptions = {
        model: 'nova-2',
        language: 'en',
        smart_format: true,
        punctuate: true,
        diarize: false,
        utterances: false,
      };

      const transcriptionOptions = { ...defaultOptions, ...options };

      console.log('🎙️  Transcribing audio from URL:', audioUrl);

      const { result, error } = await this.client.listen.prerecorded.transcribeUrl(
        { url: audioUrl },
        transcriptionOptions
      );

      if (error) {
        throw new Error(`Deepgram transcription error: ${error.message}`);
      }

      const transcript = result.results.channels[0].alternatives[0].transcript;
      const confidence = result.results.channels[0].alternatives[0].confidence;

      console.log('✓ Transcription completed:', {
        length: transcript.length,
        confidence: confidence.toFixed(2)
      });

      return {
        transcript,
        confidence,
        language: transcriptionOptions.language,
        metadata: {
          duration: result.metadata.duration,
          channels: result.metadata.channels,
        },
        raw: result,
      };
    } catch (error) {
      console.error('❌ Deepgram transcription failed:', error.message);
      throw error;
    }
  }

  /**
   * Transcribe audio from a buffer
   * @param {Buffer} audioBuffer - Audio data as buffer
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} - Transcription result
   */
  async transcribeFromBuffer(audioBuffer, options = {}) {
    if (!this.isReady()) {
      throw new Error('Deepgram service not initialized. Check DEEPGRAM_API_KEY.');
    }

    try {
      const defaultOptions = {
        model: 'nova-2',
        language: 'en',
        smart_format: true,
        punctuate: true,
        diarize: false,
        utterances: false,
      };

      const transcriptionOptions = { ...defaultOptions, ...options };

      console.log('🎙️  Transcribing audio from buffer:', audioBuffer.length, 'bytes');

      const { result, error } = await this.client.listen.prerecorded.transcribeFile(
        audioBuffer,
        transcriptionOptions
      );

      if (error) {
        throw new Error(`Deepgram transcription error: ${error.message}`);
      }

      const transcript = result.results.channels[0].alternatives[0].transcript;
      const confidence = result.results.channels[0].alternatives[0].confidence;

      console.log('✓ Transcription completed:', {
        length: transcript.length,
        confidence: confidence.toFixed(2)
      });

      return {
        transcript,
        confidence,
        language: transcriptionOptions.language,
        metadata: {
          duration: result.metadata.duration,
          channels: result.metadata.channels,
        },
        raw: result,
      };
    } catch (error) {
      console.error('❌ Deepgram transcription failed:', error.message);
      throw error;
    }
  }

  /**
   * Download audio file and transcribe it
   * @param {string} audioUrl - URL of the audio file
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} - Transcription result
   */
  async downloadAndTranscribe(audioUrl, options = {}) {
    try {
      console.log('📥 Downloading audio from:', audioUrl);

      // Download the audio file
      const response = await axios.get(audioUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 seconds timeout
      });

      const audioBuffer = Buffer.from(response.data);
      
      console.log('✓ Audio downloaded:', audioBuffer.length, 'bytes');

      // Transcribe the buffer
      return await this.transcribeFromBuffer(audioBuffer, options);
    } catch (error) {
      console.error('❌ Download and transcribe failed:', error.message);
      throw error;
    }
  }

  /**
   * Transcribe with language detection
   * @param {string} audioUrl - URL of the audio file
   * @returns {Promise<Object>} - Transcription result with detected language
   */
  async transcribeWithLanguageDetection(audioUrl) {
    try {
      // First, detect language
      const detectionResult = await this.transcribeFromUrl(audioUrl, {
        detect_language: true,
      });

      const detectedLanguage = detectionResult.raw.results.channels[0].detected_language;
      
      console.log('🌐 Detected language:', detectedLanguage);

      // If language detected is not English, transcribe again with correct language
      if (detectedLanguage && detectedLanguage !== 'en') {
        return await this.transcribeFromUrl(audioUrl, {
          language: detectedLanguage,
        });
      }

      return detectionResult;
    } catch (error) {
      console.error('❌ Language detection failed:', error.message);
      // Fallback to English
      return await this.transcribeFromUrl(audioUrl);
    }
  }

  /**
   * Transcribe audio for phone calls (optimized settings)
   * @param {string} audioUrl - URL of the recorded phone audio
   * @returns {Promise<Object>} - Transcription result
   */
  async transcribePhoneCall(audioUrl) {
    return await this.transcribeFromUrl(audioUrl, {
      model: 'nova-2-phonecall', // Optimized for phone audio
      language: 'en-IN', // Indian English
      smart_format: true,
      punctuate: true,
      diarize: false, // Single speaker (customer)
      utterances: false,
    });
  }

  /**
   * Transcribe with multiple language support
   * @param {string} audioUrl - URL of the audio file
   * @param {string} language - Language code (en, hi, ta, etc.)
   * @returns {Promise<Object>} - Transcription result
   */
  async transcribeWithLanguage(audioUrl, language = 'en') {
    const languageMap = {
      en: 'en-IN',
      hi: 'hi',
      ta: 'ta',
      te: 'te',
      kn: 'kn',
      ml: 'ml',
      mr: 'mr',
      gu: 'gu',
      bn: 'bn',
    };

    const deepgramLanguage = languageMap[language] || 'en-IN';

    return await this.transcribeFromUrl(audioUrl, {
      model: 'nova-2',
      language: deepgramLanguage,
      smart_format: true,
      punctuate: true,
    });
  }
}

// Create singleton instance
const deepgramService = new DeepgramService();

export default deepgramService;
