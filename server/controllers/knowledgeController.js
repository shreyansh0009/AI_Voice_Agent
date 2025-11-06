import { asyncHandler } from '../middleware/asyncHandler.js';
import { extractText } from '../utils/textExtraction.js';
import ragService from '../services/ragService.js';
import fileManagementService from '../services/fileManagementService.js';
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';

/**
 * Upload and process knowledge base files
 */
export const uploadKnowledgeFiles = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ 
      success: false,
      error: 'No files uploaded' 
    });
  }

  const { agentId = 'default', tags = [] } = req.body;
  const parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
  const processedFiles = [];

  for (const file of req.files) {
    const fileInfo = {
      originalName: file.originalname,
      fileName: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      uploadedAt: new Date(),
      extractedText: null,
      error: null,
    };

    try {
      // Extract text
      fileInfo.extractedText = await extractText(file.path, file.mimetype);
      fileInfo.textLength = fileInfo.extractedText?.length || 0;
      fileInfo.status = 'processed';

      // Store in vector database
      if (fileInfo.extractedText) {
        const vectorResult = await ragService.storeDocument(fileInfo, fileInfo.extractedText);
        fileInfo.vectorStored = vectorResult?.success || false;
        fileInfo.chunksStored = vectorResult?.chunksStored || 0;
      }

      // Add to file management system
      fileManagementService.addFile(fileInfo, agentId, parsedTags);
    } catch (error) {
      fileInfo.error = error.message;
      fileInfo.status = 'failed';
    }

    processedFiles.push(fileInfo);
  }

  res.json({
    success: true,
    message: `${processedFiles.length} file(s) uploaded successfully`,
    files: processedFiles,
  });
});

/**
 * Get all knowledge files
 */
export const getKnowledgeFiles = asyncHandler(async (req, res) => {
  const { agentId } = req.query;
  const files = fileManagementService.getAllFiles(agentId);

  res.json({
    success: true,
    files,
  });
});

/**
 * Delete knowledge file
 */
export const deleteKnowledgeFile = asyncHandler(async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(config.uploadsDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      error: 'File not found',
    });
  }

  // Delete from vector database
  await ragService.deleteFileVectors(filename);

  // Delete from file system
  fs.unlinkSync(filePath);

  // Delete metadata
  fileManagementService.deleteFile(filename);

  res.json({
    success: true,
    message: 'File deleted successfully',
  });
});

/**
 * Search knowledge files
 */
export const searchKnowledgeFiles = asyncHandler(async (req, res) => {
  const { q, agentId } = req.query;

  if (!q) {
    return res.status(400).json({
      success: false,
      error: 'Search query is required',
    });
  }

  const results = fileManagementService.searchFiles(q, agentId);

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
  const { filename } = req.params;
  const { tags } = req.body;

  const updatedFile = fileManagementService.updateFileTags(filename, tags);

  if (!updatedFile) {
    return res.status(404).json({
      success: false,
      error: 'File not found',
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
  const { filename } = req.params;
  const { agentId } = req.body;

  const updatedFile = fileManagementService.updateFileAgent(filename, agentId);

  if (!updatedFile) {
    return res.status(404).json({
      success: false,
      error: 'File not found',
    });
  }

  res.json({
    success: true,
    file: updatedFile,
  });
});
