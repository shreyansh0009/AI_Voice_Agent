import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const API_KEY = process.env.TABBLY_API_KEY;

if (!API_KEY) {
    console.error("❌ TABBLY_API_KEY not found in .env");
    process.exit(1);
}

console.log("🔑 API Key found:", API_KEY.substring(0, 8) + "...");
console.log("📡 Calling https://api.tabbly.io/tts/stream ...\n");

try {
    const response = await axios.post(
        "https://api.tabbly.io/tts/stream",
        {
            text: "Hello, how are you? This is a test of the Tabbly TTS service.",
            voice_id: "Riya",
            model_id: "tabbly-tts",
        },
        {
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": API_KEY,
            },
            responseType: "arraybuffer",
            timeout: 15000,
        }
    );

    const outputPath = path.join(__dirname, "test_output.wav");
    fs.writeFileSync(outputPath, Buffer.from(response.data));

    console.log("✅ SUCCESS! Audio received.");
    console.log(`   Size: ${response.data.byteLength} bytes`);
    console.log(`   Content-Type: ${response.headers["content-type"]}`);
    console.log(`   Saved to: ${outputPath}`);
    console.log("\n▶️  Play it:  open " + outputPath);
} catch (err) {
    console.error("❌ FAILED:", err.message);
    if (err.code === "ENOTFOUND") {
        console.error("   → DNS resolution failed. api.tabbly.io is unreachable from this machine.");
    }
    if (err.response) {
        console.error("   → Status:", err.response.status);
        console.error("   → Body:", Buffer.from(err.response.data).toString("utf8"));
    }
}