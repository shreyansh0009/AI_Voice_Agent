import { asyncHandler } from "../middleware/asyncHandler.js";
import { extractText } from "../utils/textExtraction.js";
import ragService from "../services/ragService.js";
import File from "../models/File.js";
import { connectDB } from "../config/database.js";
import { cloudinary } from "../config/multer.js";

/**
 * Upload and process knowledge base files
 */
export const uploadKnowledgeFiles = asyncHandler(async (req, res) => {
  const dbConnection = await connectDB();

  if (!dbConnection) {
    return res.status(503).json({
      success: false,
      error: "Database connection unavailable. Please try again later.",
    });
  }

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: "No file uploaded. Please select a PDF, DOC, or DOCX file.",
    });
  }

  const { agentId = "default", tags = [] } = req.body;
  const parsedTags = typeof tags === "string" ? JSON.parse(tags) : tags;
  // Use .id from the JWT payload
  const userId = req.user.id;

  // Check if a file already exists for this agent AND user
  const existingFiles = await File.find({ agentId, userId });
  if (existingFiles.length > 0) {
    // Delete the uploaded temp file since we're rejecting the upload
    const fs = await import("fs");
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return res.status(400).json({
      success: false,
      error:
        "A file is already uploaded for this agent. Please delete the existing file before uploading a new one.",
      existingFile: {
        originalName: existingFiles[0].originalName,
        fileName: existingFiles[0].fileName,
        uploadedAt: existingFiles[0].uploadedAt,
      },
    });
  }

  const file = req.file;
  console.log("📁 Processing file:", file.originalname);

  let cloudinaryResult = null;
  const fileInfo = {
    originalName: file.originalname,
    fileName: file.filename,
    cloudinaryUrl: null,
    cloudinaryPublicId: null,
    size: file.size,
    mimeType: file.mimetype,
    uploadedAt: new Date(),
    agentId,
    tags: parsedTags,
    extractedText: null,
    error: null,
  };

  try {
    // Step 1: Extract text from local temp file
    console.log("📄 Extracting text from local file:", file.path);
    const textContent = await extractText(
      file.path,
      file.mimetype,
      false,
      null
    );
    fileInfo.extractedText = textContent;
    fileInfo.textLength = textContent?.length || 0;
    fileInfo.status = "processed";
    console.log(`✅ Extracted ${fileInfo.textLength} characters`);

    // Step 2: Upload to Cloudinary
    console.log("☁️  Uploading to Cloudinary...");
    const uniquePublicId = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${
      file.originalname
    }`;
    cloudinaryResult = await cloudinary.uploader.upload(file.path, {
      folder: "ai-voice-crm/knowledge-base",
      resource_type: "raw",
      public_id: uniquePublicId,
    });

    fileInfo.cloudinaryUrl = cloudinaryResult.secure_url;
    fileInfo.cloudinaryPublicId = cloudinaryResult.public_id;
    console.log("✅ Uploaded to Cloudinary:", cloudinaryResult.secure_url);

    // Step 3: Store in vector database
    if (textContent) {
      console.log("🔍 Storing in vector database...");
      const vectorResult = await ragService.storeDocument(
        fileInfo,
        textContent
      );
      fileInfo.vectorStored = vectorResult?.success || false;
      fileInfo.chunksStored = vectorResult?.chunksStored || 0;
      console.log(`✅ Stored ${fileInfo.chunksStored} chunks in vector DB`);
    }

    // Step 4: Save metadata to MongoDB
    console.log("💾 Saving to MongoDB...");
    const fileDoc = new File({
      fileName: fileInfo.fileName,
      originalName: fileInfo.originalName,
      cloudinaryUrl: fileInfo.cloudinaryUrl,
      cloudinaryPublicId: fileInfo.cloudinaryPublicId,
      size: fileInfo.size,
      mimeType: fileInfo.mimeType,
      agentId,
      userId,
      tags: parsedTags,
      processedForRAG: !!textContent,
    });

    await fileDoc.save();
    fileInfo._id = fileDoc._id;
    console.log("✅ Saved to MongoDB with ID:", fileDoc._id);

    // Step 5: Delete temp file
    const fs = await import("fs");
    fs.unlinkSync(file.path);
    console.log("🗑️  Deleted temp file");
  } catch (error) {
    console.error("❌ Error processing file:", error);
    fileInfo.error = error.message;
    fileInfo.status = "failed";

    // Clean up temp file on error
    try {
      const fs = await import("fs");
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (cleanupError) {
      console.error("Error cleaning up temp file:", cleanupError);
    }
  }

  res.json({
    success: true,
    message: "File uploaded successfully",
    file: {
      originalName: fileInfo.originalName,
      fileName: fileInfo.fileName,
      uploadedAt: fileInfo.uploadedAt,
      size: fileInfo.size,
      mimeType: fileInfo.mimeType,
    },
  });
});

/**
 * Get all knowledge files
 */
export const getKnowledgeFiles = asyncHandler(async (req, res) => {
  const dbConnection = await connectDB();

  if (!dbConnection) {
    return res.status(503).json({
      success: false,
      error: "Database connection unavailable. Please try again later.",
    });
  }

  const { agentId } = req.query;
  const userId = req.user.id;
  const query = { userId };

  if (agentId) {
    query.agentId = agentId;
  }
  const files = await File.find(query).sort({ uploadedAt: -1 });

  res.json({
    success: true,
    files,
  });
});

/**
 * Delete knowledge file
 */
export const deleteKnowledgeFile = asyncHandler(async (req, res) => {
  const dbConnection = await connectDB();

  if (!dbConnection) {
    return res.status(503).json({
      success: false,
      error: "Database connection unavailable. Please try again later.",
    });
  }

  const { filename } = req.params;
  const userId = req.user.id;

  console.log("🗑️  Deleting file:", filename);

  // Find file in MongoDB belonging to user
  const fileDoc = await File.findOne({ fileName: filename, userId });

  if (!fileDoc) {
    return res.status(404).json({
      success: false,
      error: "File not found",
    });
  }

  // Step 1: Delete from vector database (Pinecone)
  console.log("🔍 Deleting from vector database...");
  const vectorDeleteResult = await ragService.deleteFileVectors(filename);
  if (vectorDeleteResult.success) {
    console.log(
      `✅ Deleted ${vectorDeleteResult.deletedCount || 0} vectors from Pinecone`
    );
  }

  // Step 2: Delete from Cloudinary
  console.log("☁️  Deleting from Cloudinary...");
  try {
    const cloudinaryResult = await cloudinary.uploader.destroy(
      fileDoc.cloudinaryPublicId,
      {
        resource_type: "raw",
      }
    );
    console.log("✅ Deleted from Cloudinary:", cloudinaryResult.result);
  } catch (error) {
    console.error("❌ Error deleting from Cloudinary:", error);
    // Continue even if Cloudinary deletion fails
  }

  // Step 3: Delete from MongoDB
  console.log("💾 Deleting from MongoDB...");
  await File.deleteOne({ fileName: filename });
  console.log("✅ Deleted from MongoDB");

  res.json({
    success: true,
    message:
      "File deleted successfully from all storage locations (MongoDB, Cloudinary, and Vector DB)",
  });
});

/**
 * Search knowledge files
 */
export const searchKnowledgeFiles = asyncHandler(async (req, res) => {
  await connectDB();

  const { q, agentId } = req.query;
  const userId = req.user.id;

  if (!q) {
    return res.status(400).json({
      success: false,
      error: "Search query is required",
    });
  }

  const query = {
    userId,
    $or: [
      { originalName: { $regex: q, $options: "i" } },
      { fileName: { $regex: q, $options: "i" } },
      { tags: { $regex: q, $options: "i" } },
    ],
  };

  if (agentId) {
    query.agentId = agentId;
  }

  const results = await File.find(query).sort({ uploadedAt: -1 });

  res.json({
    success: true,
    results,
    count: results.length,
  });
});

/**
 * Update file tags
 */
export const updateFileTags = asyncHandler(async (req, res) => {
  await connectDB();

  const { filename } = req.params;
  const { tags } = req.body;

  const updatedFile = await File.findOneAndUpdate(
    { fileName: filename },
    { tags },
    { new: true }
  );

  if (!updatedFile) {
    return res.status(404).json({
      success: false,
      error: "File not found",
    });
  }

  res.json({
    success: true,
    file: updatedFile,
  });
});

/**
 * Update file agent
 */
export const updateFileAgent = asyncHandler(async (req, res) => {
  await connectDB();

  const { filename } = req.params;
  const { agentId } = req.body;

  const updatedFile = await File.findOneAndUpdate(
    { fileName: filename },
    { agentId },
    { new: true }
  );

  if (!updatedFile) {
    return res.status(404).json({
      success: false,
      error: "File not found",
    });
  }

  res.json({
    success: true,
    file: updatedFile,
  });
});
