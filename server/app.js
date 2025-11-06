import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables FIRST
dotenv.config();

// Then import config and other modules
import { config } from './config/index.js';
import { requestLogger } from './middleware/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';
import ragService from './services/ragService.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
if (config.env === 'development') {
  app.use(requestLogger);
}

// Create required directories
[config.uploadsDir, config.dataDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// API routes
app.use('/api', routes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(config.port, async () => {
  console.log('='.repeat(50));
  console.log(`🚀 Server running on http://localhost:${config.port}`);
  console.log(`📁 Uploads directory: ${config.uploadsDir}`);
  console.log(`📊 Environment: ${config.env}`);
  console.log('='.repeat(50));
  
  // Initialize RAG service
  const ragInitialized = await ragService.initialize();
  if (ragInitialized) {
    console.log('🤖 RAG Service ready for vector search');
  } else {
    console.log('⚠️  RAG Service running in basic mode (no vector search)');
  }
  console.log('='.repeat(50));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});
