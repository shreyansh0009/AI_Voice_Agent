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

// CORS Configuration - Allow all origins
app.use(cors({
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false, // Set to false when using origin: '*'
}));

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
// Initialize RAG service at module load time so serverless functions
// have the vector store warmed up (best-effort, runs in background)
(async () => {
  try {
    const ragInitialized = await ragService.initialize();
    if (ragInitialized) {
      console.log('🤖 RAG Service ready for vector search');
    } else {
      console.log('⚠️  RAG Service running in basic mode (no vector search)');
    }
  } catch (err) {
    console.error('Error initializing RAG service:', err);
  }
})();

// Start server only for local / non-production runs. In serverless
// deployments (e.g. Vercel), the platform will import this module and
// handle requests — so we export the app instead of always listening.
if (config.env !== 'production') {
  const PORT = config.port || 5000;
  app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 Uploads directory: ${config.uploadsDir}`);
    console.log(`📊 Environment: ${config.env}`);
    console.log('='.repeat(50));
  });
}

// Export the app for serverless platforms (Vercel, Netlify functions, etc.)
export default app;
