import crypto from "crypto";

export function swap16Buffer(buffer) {
  const output = Buffer.from(buffer);
  for (let i = 0; i + 1 < output.length; i += 2) {
    const hi = output[i];
    output[i] = output[i + 1];
    output[i + 1] = hi;
  }
  return output;
}

export function createRtpState(sampleRate, payloadType = 118) {
  return {
    sequenceNumber: Math.floor(Math.random() * 65535),
    timestamp: Math.floor(Math.random() * 0xffffffff),
    ssrc: crypto.randomBytes(4).readUInt32BE(0),
    sampleRate,
    payloadType,
  };
}

export function buildRtpPacket({
  payload,
  payloadType = 118,
  sequenceNumber,
  timestamp,
  ssrc,
  marker = 0,
}) {
  const header = Buffer.alloc(12);
  header[0] = 0x80;
  header[1] = (marker ? 0x80 : 0x00) | (payloadType & 0x7f);
  header.writeUInt16BE(sequenceNumber & 0xffff, 2);
  header.writeUInt32BE(timestamp >>> 0, 4);
  header.writeUInt32BE(ssrc >>> 0, 8);
  return Buffer.concat([header, payload]);
}

export function parseRtpPacket(packet) {
  if (!packet || packet.length < 12) {
    return null;
  }

  const version = packet[0] >> 6;
  if (version !== 2) {
    return null;
  }

  const cc = packet[0] & 0x0f;
  const extension = (packet[0] & 0x10) !== 0;
  let headerLength = 12 + cc * 4;

  if (packet.length < headerLength) {
    return null;
  }

  if (extension) {
    if (packet.length < headerLength + 4) {
      return null;
    }
    const extensionWords = packet.readUInt16BE(headerLength + 2);
    headerLength += 4 + extensionWords * 4;
  }

  if (packet.length < headerLength) {
    return null;
  }

  return {
    version,
    marker: (packet[1] & 0x80) !== 0,
    payloadType: packet[1] & 0x7f,
    sequenceNumber: packet.readUInt16BE(2),
    timestamp: packet.readUInt32BE(4),
    ssrc: packet.readUInt32BE(8),
    payload: packet.slice(headerLength),
  };
}

export function splitIntoFrames(audioBuffer, frameSize) {
  const frames = [];
  for (let i = 0; i < audioBuffer.length; i += frameSize) {
    const chunk = audioBuffer.slice(i, i + frameSize);
    frames.push(
      chunk.length === frameSize
        ? chunk
        : Buffer.concat([chunk, Buffer.alloc(frameSize - chunk.length, 0)]),
    );
  }
  return frames;
}
