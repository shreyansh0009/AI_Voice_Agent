import express from 'express';
import { upload } from '../config/multer.js';
import {
  uploadKnowledgeFiles,
  getKnowledgeFiles,
  deleteKnowledgeFile,
  searchKnowledgeFiles,
  updateFileTags,
  updateFileAgent,
} from '../controllers/knowledgeController.js';

const router = express.Router();

// Upload files
router.post('/upload-knowledge', upload.array('files', 10), uploadKnowledgeFiles);

// Get all files
router.get('/knowledge-files', getKnowledgeFiles);

// Search files
router.get('/knowledge-files/search', searchKnowledgeFiles);

// Delete file
router.delete('/knowledge-files/:filename', deleteKnowledgeFile);

// Update file tags
router.patch('/knowledge-files/:filename/tags', updateFileTags);

// Update file agent
router.patch('/knowledge-files/:filename/agent', updateFileAgent);

export default router;
