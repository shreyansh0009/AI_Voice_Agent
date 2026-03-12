import AriClient from "ari-client";
import WidebandCallSession from "./widebandCallSession.js";

class AriWidebandService {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.sessions = new Map();
    this.activeRtpPorts = new Set();
  }

  async start() {
    this.client = await AriClient.connect(
      this.config.ari.url,
      this.config.ari.username,
      this.config.ari.password,
    );

    this.client.on("StasisStart", async (event, channel) => {
      await this.handleStasisStart(event, channel);
    });

    this.client.on("StasisEnd", async (event, channel) => {
      await this.handleStasisEnd(event, channel);
    });

    this.client.start(this.config.ari.appName);
    console.log("📡 Wideband ARI app started", {
      url: this.config.ari.url,
      appName: this.config.ari.appName,
    });
  }

  allocateRtpPort() {
    for (
      let port = this.config.rtpPortStart;
      port <= this.config.rtpPortEnd;
      port += 2
    ) {
      if (!this.activeRtpPorts.has(port)) {
        this.activeRtpPorts.add(port);
        return port;
      }
    }
    throw new Error("No free RTP ports in spike range");
  }

  releaseRtpPort(port) {
    if (port) {
      this.activeRtpPorts.delete(port);
    }
  }

  async handleStasisStart(event, channel) {
    if (!channel?.id) return;
    if (channel.name?.startsWith("UnicastRTP/")) {
      return;
    }
    if (this.sessions.has(channel.id)) {
      return;
    }

    const calledNumber =
      event.args?.[0] ||
      channel.dialplan?.exten ||
      channel.connected?.number ||
      channel.caller?.number ||
      null;
    const rtpPort = this.allocateRtpPort();
    const session = new WidebandCallSession({
      ari: this.client,
      inboundChannel: channel,
      calledNumber,
      config: this.config,
      rtpPort,
    });

    session.on("closed", () => {
      this.sessions.delete(channel.id);
      this.releaseRtpPort(rtpPort);
    });

    this.sessions.set(channel.id, session);

    try {
      await session.start();
    } catch (error) {
      console.error(`[${channel.id}] Wideband session start failed:`, error);
      await session.cleanup("error");
    }
  }

  async handleStasisEnd(_event, channel) {
    const session = this.sessions.get(channel?.id);
    if (!session) return;
    await session.cleanup("stasis_end");
  }

  getStats() {
    return {
      appName: this.config.ari.appName,
      activeSessions: this.sessions.size,
      rtpPortsInUse: [...this.activeRtpPorts].sort((a, b) => a - b),
    };
  }
}

export default AriWidebandService;
