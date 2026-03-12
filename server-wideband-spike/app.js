import express from "express";
import { connectDB } from "../server/config/database.js";
import config from "./config.js";
import AriWidebandService from "./services/ariWidebandService.js";

const app = express();
const widebandService = new AriWidebandService(config);

app.get("/health", async (_req, res) => {
  res.json({
    success: true,
    status: "ok",
    service: "wideband-spike",
    sampleRate: config.sampleRate,
    ariApp: config.ari.appName,
    stats: widebandService.getStats(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/stats", (_req, res) => {
  res.json({
    success: true,
    ...widebandService.getStats(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (_req, res) => {
  res.type("text/plain").send("Asterisk 18 wideband ARI spike is running");
});

async function bootstrap() {
  await connectDB();
  await widebandService.start();
  app.listen(config.port, () => {
    console.log(`🚀 Wideband spike server listening on http://localhost:${config.port}`);
  });
}

bootstrap().catch((error) => {
  console.error("❌ Wideband spike bootstrap failed:", error);
  process.exit(1);
});
