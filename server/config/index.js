import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
  // Server
  port: process.env.PORT || 5000,
  env: process.env.NODE_ENV || "development",

  // API Keys
  openaiApiKey: process.env.OPENAI_API_KEY,
  pineconeApiKey: process.env.PINECONE_API_KEY,

  // Pinecone
  pineconeIndex: process.env.PINECONE_INDEX || "voice-crm-knowledge",
  pineconeEnvironment: process.env.PINECONE_ENVIRONMENT || "gcp-starter",

  // Paths
  rootDir: path.resolve(__dirname, ".."),
  uploadsDir: path.resolve(__dirname, "../uploads"),
  dataDir: path.resolve(__dirname, "../data"),

  // Upload limits
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 10,
  allowedMimeTypes: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],

  // RAG settings
  chunkSize: 1000,
  chunkOverlap: 200,
  topK: 15,

  // OpenAI settings
  embeddingModel: "text-embedding-3-small",
  chatModel: "gpt-4o-mini",
  maxTokens: 100,
  temperature: 0.7,
};
