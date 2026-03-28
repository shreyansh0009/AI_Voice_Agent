/**
 * G.711 µ-law (mulaw) codec for Twilio Media Streams
 * Twilio sends/receives mulaw-encoded audio at 8kHz.
 * Deepgram and our TTS pipeline use signed 16-bit linear PCM (linear16).
 */

// µ-law decompression lookup table (256 entries → 16-bit signed PCM)
const MULAW_TO_LINEAR = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const mu = ~i & 0xff;
  const sign = mu & 0x80 ? -1 : 1;
  const exponent = (mu >> 4) & 0x07;
  const mantissa = mu & 0x0f;
  const magnitude = ((mantissa << 1) + 33) * (1 << exponent) - 33;
  MULAW_TO_LINEAR[i] = sign * magnitude;
}

/**
 * Convert G.711 µ-law buffer to signed 16-bit linear PCM
 * @param {Buffer} mulawBuffer - µ-law encoded audio
 * @returns {Buffer} - Linear16 PCM buffer (2x the size)
 */
export function mulawToLinear16(mulawBuffer) {
  const pcm = Buffer.alloc(mulawBuffer.length * 2);
  for (let i = 0; i < mulawBuffer.length; i++) {
    pcm.writeInt16LE(MULAW_TO_LINEAR[mulawBuffer[i]], i * 2);
  }
  return pcm;
}

/**
 * Convert signed 16-bit linear PCM to G.711 µ-law
 * @param {Buffer} pcmBuffer - Linear16 PCM buffer
 * @returns {Buffer} - µ-law encoded buffer (half the size)
 */
export function linear16ToMulaw(pcmBuffer) {
  const mulaw = Buffer.alloc(pcmBuffer.length / 2);
  for (let i = 0; i < mulaw.length; i++) {
    let sample = pcmBuffer.readInt16LE(i * 2);

    const sign = sample < 0 ? 0x80 : 0x00;
    if (sample < 0) sample = -sample;

    // Clip to 32635 (max µ-law magnitude)
    if (sample > 32635) sample = 32635;
    sample += 0x84; // bias

    let exponent = 7;
    const expMask = 0x4000;
    for (; exponent > 0; exponent--) {
      if (sample & (expMask >> (7 - exponent))) break;
    }

    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    const mulawByte = ~(sign | (exponent << 4) | mantissa) & 0xff;
    mulaw[i] = mulawByte;
  }
  return mulaw;
}
