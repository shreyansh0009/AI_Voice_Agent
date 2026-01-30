/**
 * Recording Service
 * Handles call audio recording, encoding to MP3, and upload to Cloudinary
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

/**
 * Recording Manager - handles audio capture and processing for a single call
 */
class CallRecording {
    constructor(callId) {
        this.callId = callId;
        this.audioBuffers = []; // Array of {timestamp, type: 'user'|'ai', data: Buffer}
        this.isRecording = false;
        this.startTime = null;
    }

    /**
     * Start recording
     */
    start() {
        this.isRecording = true;
        this.startTime = Date.now();
        console.log(`🎙️ [${this.callId}] Recording started`);
    }

    /**
     * Add user audio (from Asterisk)
     * @param {Buffer} pcmData - Raw PCM audio (16-bit signed, 8kHz, mono)
     */
    addUserAudio(pcmData) {
        if (!this.isRecording) return;

        this.audioBuffers.push({
            timestamp: Date.now() - this.startTime,
            type: "user",
            data: Buffer.from(pcmData),
        });
    }

    /**
     * Add AI audio (TTS output)
     * @param {Buffer} pcmData - Raw PCM audio (16-bit signed, 8kHz, mono)
     */
    addAIAudio(pcmData) {
        if (!this.isRecording) return;

        this.audioBuffers.push({
            timestamp: Date.now() - this.startTime,
            type: "ai",
            data: Buffer.from(pcmData),
        });
    }

    /**
     * Stop recording and return the total duration
     */
    stop() {
        this.isRecording = false;
        const duration = Date.now() - this.startTime;
        console.log(`🎙️ [${this.callId}] Recording stopped, ${this.audioBuffers.length} chunks, ${Math.round(duration / 1000)}s`);
        return duration;
    }

    /**
     * Process and upload recording to Cloudinary
     * @returns {Promise<{url: string, duration: number} | null>}
     */
    async processAndUpload() {
        if (this.audioBuffers.length === 0) {
            console.log(`🎙️ [${this.callId}] No audio captured, skipping upload`);
            return null;
        }

        const tempDir = os.tmpdir();
        const rawPath = path.join(tempDir, `${this.callId}-raw.pcm`);
        const mp3Path = path.join(tempDir, `${this.callId}.mp3`);

        try {
            // Combine audio buffers
            // Note: We only use USER audio for now because AI audio chunks 
            // come in bursts with similar timestamps which breaks interleaving.
            // For proper stereo recording, we'd need to track audio position
            // rather than wall-clock time.
            const userBuffers = this.audioBuffers
                .filter(chunk => chunk.type === "user")
                .map(chunk => chunk.data);

            const combinedBuffer = Buffer.concat(userBuffers);

            // Write raw PCM to temp file
            fs.writeFileSync(rawPath, combinedBuffer);
            console.log(`🎙️ [${this.callId}] Raw PCM written: ${combinedBuffer.length} bytes`);

            // Convert PCM to MP3 using ffmpeg
            await new Promise((resolve, reject) => {
                ffmpeg(rawPath)
                    .inputOptions([
                        "-f s16le",      // Signed 16-bit little-endian
                        "-ar 8000",      // 8kHz sample rate
                        "-ac 1",         // Mono
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
                resource_type: "video", // Cloudinary uses 'video' for audio files
                folder: "call-recordings",
                public_id: this.callId,
                format: "mp3",
            });

            console.log(`☁️ [${this.callId}] Uploaded to Cloudinary: ${uploadResult.secure_url}`);

            // Calculate duration from audio
            const sampleRate = 8000;
            const bytesPerSample = 2; // 16-bit
            const durationMs = (combinedBuffer.length / (sampleRate * bytesPerSample)) * 1000;

            return {
                url: uploadResult.secure_url,
                duration: Math.round(durationMs / 1000),
                publicId: uploadResult.public_id,
            };
        } catch (error) {
            console.error(`🎙️ [${this.callId}] Recording processing failed:`, error.message);
            return null;
        } finally {
            // Cleanup temp files
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
        this.audioBuffers = [];
    }
}

/**
 * Recording Service Singleton
 */
class RecordingService {
    constructor() {
        this.recordings = new Map(); // callId -> CallRecording
    }

    /**
     * Start recording for a call
     */
    startRecording(callId) {
        const recording = new CallRecording(callId);
        recording.start();
        this.recordings.set(callId, recording);
        return recording;
    }

    /**
     * Get recording instance for a call
     */
    getRecording(callId) {
        return this.recordings.get(callId);
    }

    /**
     * Stop and process recording, upload to Cloudinary
     */
    async stopAndUpload(callId) {
        const recording = this.recordings.get(callId);
        if (!recording) {
            console.log(`🎙️ [${callId}] No recording found`);
            return null;
        }

        recording.stop();
        const result = await recording.processAndUpload();

        // Cleanup
        recording.clear();
        this.recordings.delete(callId);

        return result;
    }
}

// Export singleton instance
const recordingService = new RecordingService();
export default recordingService;
export { CallRecording };
