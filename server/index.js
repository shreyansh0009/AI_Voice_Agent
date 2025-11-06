import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import dotenv from 'dotenv';
import ragService from './services/ragService.js';
import fileManagementService from './services/fileManagementService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, DOC, and DOCX are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Function to extract text from PDF
async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting PDF text:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

// Function to extract text from Word documents
async function extractTextFromWord(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (error) {
    console.error('Error extracting Word text:', error);
    throw new Error('Failed to extract text from Word document');
  }
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Upload files endpoint
app.post('/api/upload-knowledge', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
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
        error: null
      };

      try {
        // Extract text based on file type
        if (file.mimetype === 'application/pdf') {
          fileInfo.extractedText = await extractTextFromPDF(file.path);
        } else if (
          file.mimetype === 'application/msword' ||
          file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ) {
          fileInfo.extractedText = await extractTextFromWord(file.path);
        }

        // Store metadata (you can save this to a database)
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
      files: processedFiles
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload files'
    });
  }
});

// Get all uploaded files
app.get('/api/knowledge-files', (req, res) => {
  try {
    const { agentId } = req.query;
    const files = fileManagementService.getAllFiles(agentId);

    res.json({
      success: true,
      files: files
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve files'
    });
  }
});

// Delete a file
app.delete('/api/knowledge-files/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(uploadsDir, filename);

    if (fs.existsSync(filePath)) {
      // Delete from vector database
      await ragService.deleteFileVectors(filename);
      
      // Delete from file system
      fs.unlinkSync(filePath);
      
      // Delete metadata
      fileManagementService.deleteFile(filename);
      
      res.json({
        success: true,
        message: 'File deleted successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete file'
    });
  }
});

// RAG Query endpoint - retrieve context for a query
app.post('/api/rag/query', async (req, res) => {
  try {
    const { query, topK = 5 } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }

    const result = await ragService.retrieveContext(query, topK);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// RAG Chat endpoint - get AI response with knowledge base context
app.post('/api/rag/chat', async (req, res) => {
  try {
    const { query, conversationHistory = [], systemPrompt = '' } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }

    const result = await ragService.generateRAGResponse(
      query,
      conversationHistory,
      systemPrompt
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Search files endpoint
app.get('/api/knowledge-files/search', (req, res) => {
  try {
    const { q, agentId } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const results = fileManagementService.searchFiles(q, agentId);
    res.json({
      success: true,
      results,
      count: results.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Search failed'
    });
  }
});

// Update file tags
app.patch('/api/knowledge-files/:filename/tags', (req, res) => {
  try {
    const { filename } = req.params;
    const { tags } = req.body;

    const updatedFile = fileManagementService.updateFileTags(filename, tags);
    
    if (updatedFile) {
      res.json({
        success: true,
        file: updatedFile
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update tags'
    });
  }
});

// Update file agent
app.patch('/api/knowledge-files/:filename/agent', (req, res) => {
  try {
    const { filename } = req.params;
    const { agentId } = req.body;

    const updatedFile = fileManagementService.updateFileAgent(filename, agentId);
    
    if (updatedFile) {
      res.json({
        success: true,
        file: updatedFile
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update agent'
    });
  }
});

// Get agent statistics
app.get('/api/agents/:agentId/stats', (req, res) => {
  try {
    const { agentId } = req.params;
    const stats = fileManagementService.getAgentStats(agentId);
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get stats'
    });
  }
});

// Get all agents
app.get('/api/agents', (req, res) => {
  try {
    const agentIds = fileManagementService.getAllAgentIds();
    res.json({
      success: true,
      agents: agentIds
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get agents'
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File size too large. Maximum size is 10MB.'
      });
    }
  }
  res.status(500).json({
    success: false,
    error: error.message || 'Internal server error'
  });
});

app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Uploads directory: ${uploadsDir}`);
  
  // Initialize RAG service
  const ragInitialized = await ragService.initialize();
  if (ragInitialized) {
    console.log('🤖 RAG Service ready for vector search');
  } else {
    console.log('⚠️  RAG Service running in basic mode (no vector search)');
  }
});
