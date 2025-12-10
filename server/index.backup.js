// import express from "express";
// import cors from "cors";
// import multer from "multer";
// import path from "path";
// import fs from "fs";
// import { fileURLToPath } from "url";
// import pdf from "pdf-parse";
// import mammoth from "mammoth";
// import dotenv from "dotenv";
// import ragService from "./services/ragService.js";
// import fileManagementService from "./services/fileManagementService.js";
// import { authenticate } from "./middleware/authMiddleware.js";
// import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
// import authRoutes from "./routes/authRoutes.js";
// import agentforceRoutes from "./routes/agentforceRoutes.js";
// import agentRoutes from "./routes/agentRoutes.js";
// import adminRoutes from "./routes/adminRoutes.js";
// import speechRoutes from "./routes/speechRoutes.js";

// dotenv.config();

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// const app = express();
// const PORT = process.env.PORT || 5000;

// // CORS Configuration
// app.use(
//   cors({
//     origin: true,
//     methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization"],
//     credentials: true,
//   })
// );

// console.log("🔓 CORS: Allowing all origins (DEBUG MODE)");

// // Middleware
// app.use(express.json());

// // Request logging
// app.use((req, res, next) => {
//   console.log(`📥 ${req.method} ${req.path}`, {
//     body: req.body,
//     headers: req.headers,
//     query: req.query,
//   });
//   next();
// });

// // Auth routes (public)
// app.use("/api/auth", authRoutes);
// app.use("/api/agentforce", agentforceRoutes);
// app.use("/api/admin", adminRoutes);
// app.use("/api/speech", speechRoutes);

// // Create uploads directory if it doesn't exist
// const uploadsDir = path.join(__dirname, "uploads");
// if (!fs.existsSync(uploadsDir)) {
//   fs.mkdirSync(uploadsDir, { recursive: true });
// }

// // Configure multer for file uploads
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, uploadsDir);
//   },
//   filename: (req, file, cb) => {
//     const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
//     cb(null, uniqueSuffix + "-" + file.originalname);
//   },
// });

// const fileFilter = (req, file, cb) => {
//   const allowedTypes = [
//     "application/pdf",
//     "application/msword",
//     "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
//   ];

//   if (allowedTypes.includes(file.mimetype)) {
//     cb(null, true);
//   } else {
//     cb(
//       new Error("Invalid file type. Only PDF, DOC, and DOCX are allowed."),
//       false
//     );
//   }
// };

// const upload = multer({
//   storage: storage,
//   fileFilter: fileFilter,
//   limits: {
//     fileSize: 10 * 1024 * 1024, // 10MB limit
//   },
// });

// // Function to extract text from PDF
// async function extractTextFromPDF(filePath) {
//   try {
//     const dataBuffer = fs.readFileSync(filePath);
//     const data = await pdf(dataBuffer);
//     return data.text;
//   } catch (error) {
//     console.error("Error extracting PDF text:", error);
//     throw new Error("Failed to extract text from PDF");
//   }
// }

// // Function to extract text from Word documents
// async function extractTextFromWord(filePath) {
//   try {
//     const result = await mammoth.extractRawText({ path: filePath });
//     return result.value;
//   } catch (error) {
//     console.error("Error extracting Word text:", error);
//     throw new Error("Failed to extract text from Word document");
//   }
// }

// // API Routes

// // Health check (public)
// app.get("/api/health", (req, res) => {
//   res.json({ status: "ok", message: "Server is running" });
// });

// // Upload files endpoint - PROTECTED
// app.post(
//   "/api/upload-knowledge",
//   authenticate,
//   upload.array("files", 10),
//   async (req, res) => {
//     console.log("🔵 UPLOAD: Handler started", {
//       userId: req.user?.id,
//       filesCount: req.files?.length,
//     });

//     try {
//       if (!req.files || req.files.length === 0) {
//         console.log("🔴 UPLOAD: No files uploaded");
//         return res
//           .status(400)
//           .json({ success: false, error: "No files uploaded" });
//       }

//       const { agentId = "default", tags = [] } = req.body;
//       const parsedTags = typeof tags === "string" ? JSON.parse(tags) : tags;
//       const userId = req.user.id;

//       console.log("🔵 UPLOAD: Processing files", {
//         agentId,
//         tagsCount: parsedTags.length,
//         userId,
//       });

//       const processedFiles = [];

//       for (const file of req.files) {
//         const fileInfo = {
//           originalName: file.originalname,
//           fileName: file.filename,
//           size: file.size,
//           mimetype: file.mimetype,
//           uploadedAt: new Date(),
//           uploadedBy: userId,
//           extractedText: null,
//           error: null,
//         };

//         try {
//           console.log("🔵 UPLOAD: Processing file", {
//             fileName: file.originalname,
//             mimetype: file.mimetype,
//           });

//           // Extract text based on file type
//           if (file.mimetype === "application/pdf") {
//             fileInfo.extractedText = await extractTextFromPDF(file.path);
//           } else if (
//             file.mimetype === "application/msword" ||
//             file.mimetype ===
//               "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
//           ) {
//             fileInfo.extractedText = await extractTextFromWord(file.path);
//           }

//           fileInfo.textLength = fileInfo.extractedText?.length || 0;
//           fileInfo.status = "processed";

//           console.log("🔵 UPLOAD: Text extracted", {
//             fileName: file.originalname,
//             textLength: fileInfo.textLength,
//           });

//           // Store in vector database
//           if (fileInfo.extractedText) {
//             const vectorResult = await ragService.storeDocument(
//               fileInfo,
//               fileInfo.extractedText
//             );
//             fileInfo.vectorStored = vectorResult?.success || false;
//             fileInfo.chunksStored = vectorResult?.chunksStored || 0;
//             console.log("🔵 UPLOAD: Stored in vector DB", {
//               fileName: file.originalname,
//               chunksStored: fileInfo.chunksStored,
//             });
//           }

//           fileManagementService.addFile(fileInfo, agentId, parsedTags);
//         } catch (error) {
//           console.error("❌ UPLOAD: File processing error", {
//             fileName: file.originalname,
//             error: error.message,
//           });
//           fileInfo.error = error.message;
//           fileInfo.status = "failed";
//         }

//         processedFiles.push(fileInfo);
//       }

//       console.log("✅ UPLOAD: Success", {
//         filesProcessed: processedFiles.length,
//         userId,
//       });

//       res.json({
//         success: true,
//         message: `${processedFiles.length} file(s) processed`,
//         file: processedFiles[0],
//         files: processedFiles,
//       });
//     } catch (error) {
//       console.error("❌ UPLOAD: Error", {
//         message: error.message,
//         stack: error.stack,
//       });
//       res.status(500).json({
//         success: false,
//         error: error.message || "Failed to upload files",
//       });
//     }
//   }
// );

// // Get all uploaded files - PROTECTED
// app.get("/api/knowledge-files", authenticate, (req, res) => {
//   console.log("🔵 GET FILES: Handler started", {
//     userId: req.user?.id,
//     query: req.query,
//   });

//   try {
//     const { agentId } = req.query;
//     const files = fileManagementService.getAllFiles(agentId);

//     console.log("✅ GET FILES: Success", {
//       filesCount: files.length,
//       userId: req.user.id,
//     });

//     res.json({
//       success: true,
//       files: files,
//     });
//   } catch (error) {
//     console.error("❌ GET FILES: Error", error);
//     res.status(500).json({
//       success: false,
//       error: "Failed to retrieve files",
//     });
//   }
// });

// // Delete a file - PROTECTED
// app.delete("/api/knowledge-files/:filename", authenticate, async (req, res) => {
//   console.log("🔵 DELETE FILE: Handler started", {
//     userId: req.user?.id,
//     filename: req.params.filename,
//   });

//   try {
//     const filename = req.params.filename;
//     const filePath = path.join(uploadsDir, filename);

//     if (fs.existsSync(filePath)) {
//       await ragService.deleteFileVectors(filename);
//       fs.unlinkSync(filePath);
//       fileManagementService.deleteFile(filename);

//       console.log("✅ DELETE FILE: Success", {
//         filename,
//         userId: req.user.id,
//       });

//       res.json({
//         success: true,
//         message: "File deleted successfully",
//       });
//     } else {
//       console.log("🔴 DELETE FILE: File not found", { filename });
//       res.status(404).json({
//         success: false,
//         error: "File not found",
//       });
//     }
//   } catch (error) {
//     console.error("❌ DELETE FILE: Error", {
//       filename: req.params.filename,
//       error: error.message,
//     });
//     res.status(500).json({
//       success: false,
//       error: "Failed to delete file",
//     });
//   }
// });

// // RAG Query endpoint - PROTECTED
// app.post("/api/rag/query", authenticate, async (req, res) => {
//   console.log("🔵 RAG QUERY: Handler started", {
//     userId: req.user?.id,
//     hasQuery: !!req.body.query,
//   });

//   try {
//     const { query, topK = 5 } = req.body;

//     if (!query) {
//       console.log("🔴 RAG QUERY: Query is required");
//       return res.status(400).json({
//         success: false,
//         error: "Query is required",
//       });
//     }

//     const result = await ragService.retrieveContext(query, topK);

//     console.log("✅ RAG QUERY: Success", {
//       userId: req.user.id,
//       resultsCount: result.results?.length,
//     });

//     res.json(result);
//   } catch (error) {
//     console.error("❌ RAG QUERY: Error", error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// });

// // RAG Chat endpoint - PROTECTED
// app.post("/api/rag/chat", authenticate, async (req, res) => {
//   console.log("🔵 RAG CHAT: Handler started", {
//     userId: req.user?.id,
//     hasQuery: !!req.body.query,
//   });

//   try {
//     const { query, conversationHistory = [], systemPrompt = "" } = req.body;

//     if (!query) {
//       console.log("🔴 RAG CHAT: Query is required");
//       return res.status(400).json({
//         success: false,
//         error: "Query is required",
//       });
//     }

//     const result = await ragService.generateRAGResponse(
//       query,
//       conversationHistory,
//       systemPrompt
//     );

//     console.log("✅ RAG CHAT: Success", { userId: req.user.id });

//     res.json(result);
//   } catch (error) {
//     console.error("❌ RAG CHAT: Error", error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// });

// // Search files endpoint - PROTECTED
// app.get("/api/knowledge-files/search", authenticate, (req, res) => {
//   console.log("🔵 SEARCH FILES: Handler started", {
//     userId: req.user?.id,
//     query: req.query.q,
//   });

//   try {
//     const { q, agentId } = req.query;

//     if (!q) {
//       return res.status(400).json({
//         success: false,
//         error: "Search query is required",
//       });
//     }

//     const results = fileManagementService.searchFiles(q, agentId);

//     console.log("✅ SEARCH FILES: Success", {
//       userId: req.user.id,
//       resultsCount: results.length,
//     });

//     res.json({
//       success: true,
//       results,
//       count: results.length,
//     });
//   } catch (error) {
//     console.error("❌ SEARCH FILES: Error", error);
//     res.status(500).json({
//       success: false,
//       error: "Search failed",
//     });
//   }
// });

// // Update file tags - PROTECTED
// app.patch("/api/knowledge-files/:filename/tags", authenticate, (req, res) => {
//   console.log("🔵 UPDATE TAGS: Handler started", {
//     userId: req.user?.id,
//     filename: req.params.filename,
//   });

//   try {
//     const { filename } = req.params;
//     const { tags } = req.body;

//     const updatedFile = fileManagementService.updateFileTags(filename, tags);

//     if (updatedFile) {
//       console.log("✅ UPDATE TAGS: Success", {
//         userId: req.user.id,
//         filename,
//       });
//       res.json({
//         success: true,
//         file: updatedFile,
//       });
//     } else {
//       console.log("🔴 UPDATE TAGS: File not found", { filename });
//       res.status(404).json({
//         success: false,
//         error: "File not found",
//       });
//     }
//   } catch (error) {
//     console.error("❌ UPDATE TAGS: Error", error);
//     res.status(500).json({
//       success: false,
//       error: "Failed to update tags",
//     });
//   }
// });

// // Update file agent - PROTECTED
// app.patch("/api/knowledge-files/:filename/agent", authenticate, (req, res) => {
//   console.log("🔵 UPDATE AGENT: Handler started", {
//     userId: req.user?.id,
//     filename: req.params.filename,
//   });

//   try {
//     const { filename } = req.params;
//     const { agentId } = req.body;

//     const updatedFile = fileManagementService.updateFileAgent(
//       filename,
//       agentId
//     );

//     if (updatedFile) {
//       console.log("✅ UPDATE AGENT: Success", {
//         userId: req.user.id,
//         filename,
//       });
//       res.json({
//         success: true,
//         file: updatedFile,
//       });
//     } else {
//       console.log("🔴 UPDATE AGENT: File not found", { filename });
//       res.status(404).json({
//         success: false,
//         error: "File not found",
//       });
//     }
//   } catch (error) {
//     console.error("❌ UPDATE AGENT: Error", error);
//     res.status(500).json({
//       success: false,
//       error: "Failed to update agent",
//     });
//   }
// });

// // Get agent statistics - PROTECTED
// app.get("/api/agents/:agentId/stats", authenticate, (req, res) => {
//   console.log("🔵 AGENT STATS: Handler started", {
//     userId: req.user?.id,
//     agentId: req.params.agentId,
//   });

//   try {
//     const { agentId } = req.params;
//     const stats = fileManagementService.getAgentStats(agentId);

//     console.log("✅ AGENT STATS: Success", {
//       userId: req.user.id,
//       agentId,
//     });

//     res.json({
//       success: true,
//       stats,
//     });
//   } catch (error) {
//     console.error("❌ AGENT STATS: Error", error);
//     res.status(500).json({
//       success: false,
//       error: "Failed to get stats",
//     });
//   }
// });

// // Agent routes
// app.use("/api/agents", agentRoutes);

// // Error handling middleware
// app.use(errorHandler);
// app.use(notFoundHandler);

// app.listen(PORT, async () => {
//   console.log("=".repeat(50));
//   console.log(`🚀 Server running on http://localhost:${PORT}`);
//   console.log(`📁 Uploads directory: ${uploadsDir}`);
//   console.log("=".repeat(50));

//   // Initialize RAG service
//   const ragInitialized = await ragService.initialize();
//   if (ragInitialized) {
//     console.log("🤖 RAG Service ready for vector search");
//   } else {
//     console.log("⚠️  RAG Service running in basic mode (no vector search)");
//   }
// });

// export default app;
