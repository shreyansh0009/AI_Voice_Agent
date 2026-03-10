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
  SLIN_8K: 0x10,
  SLIN_12K: 0x11,
  SLIN_16K: 0x12,
  SLIN_24K: 0x13,
  SLIN_32K: 0x14,
  SLIN_44K: 0x15,
  SLIN_48K: 0x16,
  SLIN_96K: 0x17,
  SLIN_192K: 0x18,
  AUDIO: 0x10, // Backward-compatible alias for 8kHz
};

const SAMPLE_RATE_TO_TYPE = {
  8000: MESSAGE_TYPES.SLIN_8K,
  12000: MESSAGE_TYPES.SLIN_12K,
  16000: MESSAGE_TYPES.SLIN_16K,
  24000: MESSAGE_TYPES.SLIN_24K,
  32000: MESSAGE_TYPES.SLIN_32K,
  44100: MESSAGE_TYPES.SLIN_44K,
  48000: MESSAGE_TYPES.SLIN_48K,
  96000: MESSAGE_TYPES.SLIN_96K,
  192000: MESSAGE_TYPES.SLIN_192K,
};

export function getAudioMessageType(sampleRate = 8000) {
  return SAMPLE_RATE_TO_TYPE[sampleRate] || MESSAGE_TYPES.SLIN_8K;
}

export function isAudioMessageType(type) {
  return Object.values(SAMPLE_RATE_TO_TYPE).includes(type);
}

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
 * @param {number} sampleRate - PCM sample rate
 * @returns {Buffer}
 */
export function createAudioFrame(audioData, sampleRate = 8000) {
  const header = Buffer.alloc(3);
  header.writeUInt8(getAudioMessageType(sampleRate), 0);
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
  getAudioMessageType,
  isAudioMessageType,
  parseFrame,
  createAudioFrame,
  createSilenceFrame,
  convertToPCM,
  resample,
  splitIntoChunks,
};
