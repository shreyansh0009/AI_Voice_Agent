import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname);

dotenv.config({ path: path.resolve(__dirname, "../server/.env") });
dotenv.config({ path: path.resolve(__dirname, ".env"), override: true });

export const config = {
  port: parseInt(process.env.PORT || "5101", 10),
  env: process.env.NODE_ENV || "development",
  rootDir,
  sampleRate: parseInt(process.env.SPIKE_SAMPLE_RATE || "16000", 10),
  frameDurationMs: parseInt(process.env.SPIKE_FRAME_DURATION_MS || "20", 10),
  rtpHost: process.env.SPIKE_RTP_HOST || "0.0.0.0",
  rtpAdvertiseHost: process.env.SPIKE_RTP_ADVERTISE_HOST || "127.0.0.1",
  rtpPortStart: parseInt(process.env.SPIKE_RTP_PORT_START || "41000", 10),
  rtpPortEnd: parseInt(process.env.SPIKE_RTP_PORT_END || "41099", 10),
  rtpPayloadType: parseInt(process.env.SPIKE_RTP_PAYLOAD_TYPE || "118", 10),
  rtpSwap16: process.env.SPIKE_RTP_SWAP16 === "true",
  ari: {
    url: process.env.ARI_URL || "http://127.0.0.1:8088",
    username: process.env.ARI_USERNAME || "wideband",
    password: process.env.ARI_PASSWORD || "wideband",
    appName: process.env.ARI_APP_NAME || "ai-wideband-spike",
  },
  logging: {
    verboseRtp: process.env.SPIKE_VERBOSE_RTP === "true",
  },
};

config.frameSize = Math.floor(
  (config.sampleRate * 2 * config.frameDurationMs) / 1000,
);

export default config;
