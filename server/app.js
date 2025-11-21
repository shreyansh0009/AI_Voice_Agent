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
import authRoutes from './routes/authRoutes.js';
import ragService from './services/ragService.js';
import { connectDB } from './config/database.js';

const app = express();

// CORS Configuration
const CLIENT_ORIGINS = [
  'http://localhost:5173',
  'https://ai-voice-agent-frcm.vercel.app'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (CLIENT_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('CORS policy: This origin is not allowed'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
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
app.use('/api/auth', authRoutes);
app.use('/api', routes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
// Initialize RAG service at module load time so serverless functions
// have the vector store warmed up (best-effort, runs in background)
// Connect to MongoDB and initialize RAG service on startup
(async () => {
  try {
    const dbConn = await connectDB();
    if (!dbConn) {
      console.warn('⚠️  Database not connected. Some features may be disabled.');
    }

    const ragInitialized = await ragService.initialize();
    if (ragInitialized) {
      console.log('🤖 RAG Service ready for vector search');
    } else {
      console.log('⚠️  RAG Service running in basic mode (no vector search)');
    }
  } catch (err) {
    console.error('Error during startup initialization:', err);
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

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

// Export the app for serverless platforms (Vercel, Netlify functions, etc.)
export default app;
