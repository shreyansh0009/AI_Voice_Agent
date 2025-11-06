import { asyncHandler } from '../middleware/asyncHandler.js';
import ragService from '../services/ragService.js';

/**
 * Query knowledge base
 */
export const queryKnowledgeBase = asyncHandler(async (req, res) => {
  const { query, topK = 5 } = req.body;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: 'Query is required',
    });
  }

  const result = await ragService.retrieveContext(query, topK);
  res.json(result);
});

/**
 * RAG chat endpoint
 */
export const ragChat = asyncHandler(async (req, res) => {
  const { query, conversationHistory = [], systemPrompt = '', options = {} } = req.body;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: 'Query is required',
    });
  }

  const result = await ragService.generateRAGResponse(
    query,
    conversationHistory,
    systemPrompt,
    options
  );

  res.json(result);
});
