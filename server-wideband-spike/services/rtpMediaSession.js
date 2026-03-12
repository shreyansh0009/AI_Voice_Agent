import dgram from "dgram";
import { EventEmitter } from "events";
import {
  buildRtpPacket,
  createRtpState,
  parseRtpPacket,
  swap16Buffer,
} from "../utils/rtp.js";

class RtpMediaSession extends EventEmitter {
  constructor(sessionId, options) {
    super();
    this.sessionId = sessionId;
    this.sampleRate = options.sampleRate;
    this.frameDurationMs = options.frameDurationMs;
    this.frameSize = options.frameSize;
    this.bindHost = options.bindHost;
    this.bindPort = options.bindPort;
    this.payloadType = options.payloadType;
    this.swap16 = options.swap16;
    this.verbose = options.verbose;
    this.socket = null;
    this.targetHost = null;
    this.targetPort = null;
    this.rtpState = createRtpState(this.sampleRate, this.payloadType);
    this.started = false;
  }

  async start() {
    if (this.started) return;

    this.socket = dgram.createSocket("udp4");
    this.socket.on("error", (error) => {
      this.emit("error", error);
    });

    this.socket.on("message", (message, remoteInfo) => {
      const packet = parseRtpPacket(message);
      if (!packet) {
        return;
      }

      if (!this.targetHost || !this.targetPort) {
        this.targetHost = remoteInfo.address;
        this.targetPort = remoteInfo.port;
      }

      this.rtpState.payloadType = packet.payloadType;
      const payload = this.swap16 ? swap16Buffer(packet.payload) : packet.payload;
      this.emit("audio", payload, {
        remoteAddress: remoteInfo.address,
        remotePort: remoteInfo.port,
        payloadType: packet.payloadType,
        timestamp: packet.timestamp,
        sequenceNumber: packet.sequenceNumber,
      });
    });

    await new Promise((resolve, reject) => {
      this.socket.once("error", reject);
      this.socket.bind(this.bindPort, this.bindHost, () => {
        this.socket.off("error", reject);
        this.started = true;
        resolve();
      });
    });

    const address = this.socket.address();
    this.bindPort = address.port;
  }

  setAsteriskTarget(host, port) {
    this.targetHost = host;
    this.targetPort = port;
  }

  async sendFrame(frame, marker = false) {
    if (!this.socket || !this.targetHost || !this.targetPort) {
      throw new Error("RTP target is not ready");
    }

    const payload = this.swap16 ? swap16Buffer(frame) : frame;
    const packet = buildRtpPacket({
      payload,
      payloadType: this.rtpState.payloadType,
      sequenceNumber: this.rtpState.sequenceNumber,
      timestamp: this.rtpState.timestamp,
      ssrc: this.rtpState.ssrc,
      marker,
    });

    await new Promise((resolve, reject) => {
      this.socket.send(
        packet,
        this.targetPort,
        this.targetHost,
        (error) => (error ? reject(error) : resolve()),
      );
    });

    this.rtpState.sequenceNumber = (this.rtpState.sequenceNumber + 1) & 0xffff;
    this.rtpState.timestamp =
      (this.rtpState.timestamp +
        (this.sampleRate * this.frameDurationMs) / 1000) >>> 0;
  }

  async sendSilence(frameCount = 1) {
    const silence = Buffer.alloc(this.frameSize, 0);
    for (let i = 0; i < frameCount; i += 1) {
      await this.sendFrame(silence, i === 0);
    }
  }

  async close() {
    if (!this.socket) return;

    await new Promise((resolve) => {
      this.socket.close(() => resolve());
    });
    this.socket = null;
    this.started = false;
  }
}

export default RtpMediaSession;
