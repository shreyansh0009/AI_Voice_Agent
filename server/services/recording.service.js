/**
 * Recording Service
 * Handles call audio recording, encoding to MP3, and upload to Cloudinary
 * 
 * APPROACH: Timeline-based recording
 * - Track audio by wall-clock time
 * - Build timeline with proper gaps
 * - Combine into single audio file with correct pacing
 */
import fs from "fs";
import path from "path";
import os from "os";
import { v2 as cloudinary } from "cloudinary";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath.path);

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Constants
const SAMPLE_RATE = 8000;
const BYTES_PER_MS = (SAMPLE_RATE * 2) / 1000; // 16 bytes per ms at 8kHz 16-bit

/**
 * Recording Manager - handles audio capture and processing for a single call
 * Uses separate tracks for user and AI audio, then mixes with proper timing
 */
class CallRecording {
    constructor(callId) {
        this.callId = callId;
        this.userChunks = [];  // {startMs, data}
        this.aiChunks = [];    // {startMs, data}
        this.isRecording = false;
        this.startTime = null;
        this.aiSpeechStartMs = null;  // Track when current AI speech started
    }

    /**
     * Start recording
     */
    start() {
        this.isRecording = true;
        this.startTime = Date.now();
        console.log(`[${this.callId}] Recording started`);
    }

    /**
     * Add user audio (from Asterisk) - arrives in real-time
     */
    addUserAudio(pcmData) {
        if (!this.isRecording) return;

        const nowMs = Date.now() - this.startTime;
        this.userChunks.push({
            startMs: nowMs,
            data: Buffer.from(pcmData),
        });
    }

    /**
     * Mark start of AI speech (call before streaming TTS)
     */
    markAISpeechStart() {
        if (!this.isRecording) return;
        this.aiSpeechStartMs = Date.now() - this.startTime;
    }

    /**
     * Add AI audio chunk - arrives in bursts during TTS playback
     * Uses sequential position within the current speech block
     */
    addAIAudio(pcmData, chunkIndex = 0) {
        if (!this.isRecording) return;

        // If no speech start marked, use current time
        if (this.aiSpeechStartMs === null) {
            this.aiSpeechStartMs = Date.now() - this.startTime;
        }

        // Calculate position based on chunk index (20ms per frame)
        const chunkDurationMs = 20;
        const startMs = this.aiSpeechStartMs + (chunkIndex * chunkDurationMs);

        this.aiChunks.push({
            startMs,
            data: Buffer.from(pcmData),
        });
    }

    /**
     * Stop recording
     */
    stop() {
        this.isRecording = false;
        const duration = Date.now() - this.startTime;
        const totalChunks = this.userChunks.length + this.aiChunks.length;
        console.log(`🎙️ [${this.callId}] Recording stopped, ${totalChunks} chunks (user: ${this.userChunks.length}, ai: ${this.aiChunks.length}), ${Math.round(duration / 1000)}s`);
        return duration;
    }

    /**
     * Build timeline and create combined audio
     */
    buildTimeline() {
        // Combine all chunks with their timestamps
        const allEvents = [
            ...this.userChunks.map(c => ({ ...c, type: 'user' })),
            ...this.aiChunks.map(c => ({ ...c, type: 'ai' })),
        ].sort((a, b) => a.startMs - b.startMs);

        if (allEvents.length === 0) return null;

        // Find total duration
        const lastEvent = allEvents[allEvents.length - 1];
        const totalDurationMs = lastEvent.startMs + (lastEvent.data.length / BYTES_PER_MS);
        const totalBytes = Math.ceil(totalDurationMs * BYTES_PER_MS);

        // Create output buffer filled with silence
        const output = Buffer.alloc(totalBytes, 0);

        // Write each audio chunk at its correct position
        for (const event of allEvents) {
            const bytePosition = Math.floor(event.startMs * BYTES_PER_MS);
            const endPosition = bytePosition + event.data.length;

            if (endPosition <= totalBytes) {
                // Mix audio (add samples, clamping to prevent overflow)
                for (let i = 0; i < event.data.length; i += 2) {
                    const pos = bytePosition + i;
                    if (pos + 1 < totalBytes) {
                        const existing = output.readInt16LE(pos);
                        const newSample = event.data.readInt16LE(i);
                        // Add and clamp to 16-bit range
                        const mixed = Math.max(-32768, Math.min(32767, existing + newSample));
                        output.writeInt16LE(mixed, pos);
                    }
                }
            }
        }

        return output;
    }

    /**
     * Process and upload recording to Cloudinary
     */
    async processAndUpload() {
        if (this.userChunks.length === 0 && this.aiChunks.length === 0) {
            console.log(`🎙️ [${this.callId}] No audio captured, skipping upload`);
            return null;
        }

        const tempDir = os.tmpdir();
        const rawPath = path.join(tempDir, `${this.callId}-raw.pcm`);
        const mp3Path = path.join(tempDir, `${this.callId}.mp3`);

        try {
            // Build timeline-based audio
            const combinedBuffer = this.buildTimeline();

            if (!combinedBuffer || combinedBuffer.length === 0) {
                console.log(`🎙️ [${this.callId}] No audio in timeline`);
                return null;
            }

            // Write raw PCM to temp file
            fs.writeFileSync(rawPath, combinedBuffer);
            console.log(`🎙️ [${this.callId}] Raw PCM written: ${combinedBuffer.length} bytes`);

            // Convert PCM to MP3 using ffmpeg
            await new Promise((resolve, reject) => {
                ffmpeg(rawPath)
                    .inputOptions([
                        "-f s16le",
                        "-ar 8000",
                        "-ac 1",
                    ])
                    .audioCodec("libmp3lame")
                    .audioBitrate("64k")
                    .output(mp3Path)
                    .on("end", resolve)
                    .on("error", reject)
                    .run();
            });

            console.log(`🎙️ [${this.callId}] MP3 encoded successfully`);

            // Upload to Cloudinary
            const uploadResult = await cloudinary.uploader.upload(mp3Path, {
                resource_type: "video",
                folder: "call-recordings",
                public_id: this.callId,
                format: "mp3",
            });

            console.log(`☁️ [${this.callId}] Uploaded to Cloudinary: ${uploadResult.secure_url}`);

            // Calculate duration
            const durationMs = combinedBuffer.length / BYTES_PER_MS;

            return {
                url: uploadResult.secure_url,
                duration: Math.round(durationMs / 1000),
                publicId: uploadResult.public_id,
            };
        } catch (error) {
            console.error(`🎙️ [${this.callId}] Recording processing failed:`, error.message);
            return null;
        } finally {
            try {
                if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
                if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
            } catch (e) {
                console.error(`Cleanup failed:`, e.message);
            }
        }
    }

    /**
     * Clear buffers to free memory
     */
    clear() {
        this.userChunks = [];
        this.aiChunks = [];
    }
}

/**
 * Recording Service Singleton
 */
class RecordingService {
    constructor() {
        this.recordings = new Map();
    }

    startRecording(callId) {
        const recording = new CallRecording(callId);
        recording.start();
        this.recordings.set(callId, recording);
        return recording;
    }

    getRecording(callId) {
        return this.recordings.get(callId);
    }

    async stopAndUpload(callId) {
        const recording = this.recordings.get(callId);
        if (!recording) {
            console.log(`🎙️ [${callId}] No recording found`);
            return null;
        }

        recording.stop();
        const result = await recording.processAndUpload();

        recording.clear();
        this.recordings.delete(callId);

        return result;
    }
}

const recordingService = new RecordingService();
export default recordingService;
export { CallRecording };
