/**
 * Audio Processor Utilities
 *
 * Handles PCM audio encoding/decoding for Asterisk AudioSocket
 * AudioSocket uses 16-bit signed linear PCM (slin16) at 8kHz or 16kHz
 */

/**
 * AudioSocket Protocol:
 * - 3-byte header: 1 byte type + 2 bytes length (big-endian)
 * - Types: 0x00 = UUID, 0x01 = audio, 0x02 = error/hangup
 */

// AudioSocket message types - per Asterisk protocol
// Type 0x10 (16 decimal) is AUDIO, not 0x01
export const MESSAGE_TYPES = {
  HANGUP: 0x00, // Connection closing
  UUID: 0x01, // First message with call UUID
  ERROR: 0x02, // Error occurred
  SILENCE: 0x03, // Silence indicator
  AUDIO: 0x10, // 16 decimal - Audio frames
};

/**
 * Parse an AudioSocket frame from buffer
 * @param {Buffer} buffer - Raw data from AudioSocket
 * @returns {{ type: number, length: number, data: Buffer, consumed: number } | null}
 */
export function parseFrame(buffer) {
  if (buffer.length < 3) {
    return null; // Need at least 3 bytes for header
  }

  const type = buffer.readUInt8(0);
  const length = buffer.readUInt16BE(1);

  if (buffer.length < 3 + length) {
    return null; // Incomplete frame
  }

  const data = buffer.slice(3, 3 + length);
  return {
    type,
    length,
    data,
    consumed: 3 + length,
  };
}

/**
 * Create an AudioSocket audio frame
 * @param {Buffer} audioData - PCM audio data
 * @returns {Buffer}
 */
export function createAudioFrame(audioData) {
  const header = Buffer.alloc(3);
  header.writeUInt8(MESSAGE_TYPES.AUDIO, 0);
  header.writeUInt16BE(audioData.length, 1);
  return Buffer.concat([header, audioData]);
}

/**
 * Create silence frame (20ms at 8kHz = 160 samples = 320 bytes)
 * @param {number} durationMs - Duration in milliseconds
 * @param {number} sampleRate - Sample rate (default 8000)
 * @returns {Buffer}
 */
export function createSilenceFrame(durationMs = 20, sampleRate = 8000) {
  const samples = Math.floor((sampleRate * durationMs) / 1000);
  const bytes = samples * 2; // 16-bit = 2 bytes per sample
  const silence = Buffer.alloc(bytes, 0);
  return createAudioFrame(silence);
}

/**
 * Convert base64 audio (from TTS) to PCM format for AudioSocket
 * @param {string} base64Audio - Base64 encoded audio
 * @param {string} sourceFormat - Source format (e.g., 'mp3', 'wav')
 * @returns {Promise<Buffer>} - PCM buffer
 */
export async function convertToPCM(base64Audio, sourceFormat = "wav") {
  // For WAV files, we can extract PCM directly
  // For other formats, we'd need ffmpeg or similar
  const audioBuffer = Buffer.from(base64Audio, "base64");

  if (sourceFormat === "wav") {
    // Skip WAV header (44 bytes typically) to get raw PCM
    // Note: This assumes standard WAV format
    return audioBuffer.slice(44);
  }

  // For mp3 or other formats, return as-is for now
  // In production, use ffmpeg for conversion
  return audioBuffer;
}

/**
 * Resample audio to target sample rate
 * Simple linear interpolation resampler
 * @param {Buffer} pcmBuffer - Input PCM buffer (16-bit signed)
 * @param {number} fromRate - Source sample rate
 * @param {number} toRate - Target sample rate
 * @returns {Buffer}
 */
export function resample(pcmBuffer, fromRate, toRate) {
  if (fromRate === toRate) {
    return pcmBuffer;
  }

  const samples = pcmBuffer.length / 2;
  const ratio = toRate / fromRate;
  const newSamples = Math.floor(samples * ratio);
  const output = Buffer.alloc(newSamples * 2);

  for (let i = 0; i < newSamples; i++) {
    const srcPos = i / ratio;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;

    if (srcIndex >= samples - 1) {
      output.writeInt16LE(pcmBuffer.readInt16LE((samples - 1) * 2), i * 2);
    } else {
      const sample1 = pcmBuffer.readInt16LE(srcIndex * 2);
      const sample2 = pcmBuffer.readInt16LE((srcIndex + 1) * 2);
      const interpolated = Math.round(sample1 + frac * (sample2 - sample1));
      output.writeInt16LE(interpolated, i * 2);
    }
  }

  return output;
}

/**
 * Split audio buffer into chunks for streaming
 * @param {Buffer} audioBuffer - Full audio buffer
 * @param {number} chunkSize - Size per chunk in bytes (default 320 = 20ms @ 8kHz)
 * @returns {Buffer[]}
 */
export function splitIntoChunks(audioBuffer, chunkSize = 320) {
  const chunks = [];
  for (let i = 0; i < audioBuffer.length; i += chunkSize) {
    chunks.push(audioBuffer.slice(i, i + chunkSize));
  }
  return chunks;
}

export default {
  MESSAGE_TYPES,
  parseFrame,
  createAudioFrame,
  createSilenceFrame,
  convertToPCM,
  resample,
  splitIntoChunks,
};
