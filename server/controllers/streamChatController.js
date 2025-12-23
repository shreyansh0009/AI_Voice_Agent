import aiAgentService from "../services/aiAgent.service.js";

/**
 * Streaming Chat Controller
 * Optimized for fluent TTS output with minimal pauses
 */

/**
 * Preprocess text for TTS to handle abbreviations, symbols, and numbers
 * Makes text more speakable
 */
function preprocessForTTS(text) {
  if (!text) return text;

  let processed = text;

  // Indian currency - ₹ symbol and amounts
  // ₹1.13 Cr → "1.13 crore rupees"
  // ₹50 Lakh → "50 lakh rupees"
  // ₹5,000 → "5000 rupees"
  processed = processed.replace(/₹\s*([\d,.]+)\s*Cr\.?/gi, "$1 crore rupees");
  processed = processed.replace(/₹\s*([\d,.]+)\s*Crore/gi, "$1 crore rupees");
  processed = processed.replace(/₹\s*([\d,.]+)\s*L\.?/gi, "$1 lakh rupees");
  processed = processed.replace(/₹\s*([\d,.]+)\s*Lakh/gi, "$1 lakh rupees");
  processed = processed.replace(/₹\s*([\d,.]+)\s*K/gi, "$1 thousand rupees");
  processed = processed.replace(/₹\s*([\d,.]+)/g, "$1 rupees");

  // Crore/Lakh without ₹
  processed = processed.replace(/([\d,.]+)\s*Cr\.?\b/gi, "$1 crore");
  processed = processed.replace(/([\d,.]+)\s*L\.?\b/gi, "$1 lakh");

  // Real estate abbreviations - spell out or expand
  processed = processed.replace(/\bBHK\b/gi, "B H K"); // Spell out
  processed = processed.replace(/\bsqft\b/gi, "square feet");
  processed = processed.replace(/\bsq\.?\s*ft\.?\b/gi, "square feet");
  processed = processed.replace(/\bsq\.?\s*m\.?\b/gi, "square meters");
  processed = processed.replace(/\bEMI\b/gi, "E M I");
  processed = processed.replace(/\bGST\b/gi, "G S T");
  processed = processed.replace(/\bOC\b/gi, "O C");
  processed = processed.replace(/\bCC\b/gi, "C C");
  processed = processed.replace(/\bRERA\b/gi, "RERA");

  // Common abbreviations
  processed = processed.replace(/\bkm\b/gi, "kilometers");
  processed = processed.replace(/\bmt\b/gi, "meters");
  processed = processed.replace(/\bmin\b/gi, "minutes");
  processed = processed.replace(/\bhrs?\b/gi, "hours");
  processed = processed.replace(/\bapprox\.?\b/gi, "approximately");
  processed = processed.replace(/\betc\.?\b/gi, "etcetera");
  processed = processed.replace(/\beg\.?\b/gi, "for example");
  processed = processed.replace(/\bie\.?\b/gi, "that is");

  // Remove special characters that cause issues
  processed = processed.replace(/[•◦▪▸►]/g, ""); // Bullets
  processed = processed.replace(/[–—]/g, "-"); // Dashes
  processed = processed.replace(/[""'']/g, '"'); // Smart quotes

  // Numbered lists - convert to natural speech (ONLY match actual list markers like "1. ", "2) ")
  // Do NOT strip standalone numbers like "3 crores"
  processed = processed.replace(/^\d+[.)]\s+/gm, ""); // Start of line: "1. " or "2) "
  processed = processed.replace(/\n\d+[.)]\s+/g, ", "); // Mid-text: newline + "1. " or "2) "

  // Remove markdown formatting
  processed = processed.replace(/\*\*/g, ""); // Bold
  processed = processed.replace(/\*/g, ""); // Italics
  processed = processed.replace(/`/g, ""); // Code
  processed = processed.replace(/#+\s*/g, ""); // Headers
  processed = processed.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); // Links

  // Clean up whitespace
  processed = processed.replace(/,\s*,/g, ",");
  processed = processed.replace(/\s+/g, " ");
  processed = processed.replace(/\s+([.,!?;:])/g, "$1");

  return processed.trim();
}

/**
 * Process chat message with streaming response
 * POST /api/chat/stream
 *
 * Strategy: Collect full response, then send in 2-3 batches for fluent speech
 */
export const streamChat = async (req, res) => {
  const {
    message,
    agentId = "default",
    customerContext = {},
    conversationHistory = [],
    options = {},
  } = req.body;

  // Validate required fields
  if (!message || typeof message !== "string") {
    return res.status(400).json({
      error: "Message is required and must be a string",
    });
  }

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  res.flushHeaders();

  try {
    console.log("💬 Stream Chat Request:", {
      message: message.substring(0, 50),
      agentId,
      historyLength: conversationHistory.length,
    });

    // Collect the full response from streaming
    const stream = await aiAgentService.processMessageStream(
      message,
      agentId,
      customerContext,
      conversationHistory,
      options
    );

    let fullResponse = "";
    let updatedContext = null;
    let languageSwitch = null;

    // Collect all content from stream first
    for await (const chunk of stream) {
      if (chunk.type === "context") {
        updatedContext = chunk.customerContext;
        continue;
      }

      if (chunk.type === "language") {
        languageSwitch = chunk.code;
        continue;
      }

      if (chunk.type === "content") {
        fullResponse += chunk.content;
      }

      if (chunk.type === "done" || chunk.type === "error") {
        break;
      }
    }

    // Preprocess the full response for TTS
    const cleanedResponse = preprocessForTTS(fullResponse);
    console.log("📝 Original:", fullResponse.substring(0, 100));
    console.log("🔊 Cleaned:", cleanedResponse.substring(0, 100));

    // Split into sentences for batching
    const sentencePattern = /[^.!?।॥]+[.!?।॥]?/g;
    const sentences = cleanedResponse.match(sentencePattern) || [
      cleanedResponse,
    ];

    // Filter out empty sentences
    const validSentences = sentences
      .map((s) => s.trim())
      .filter((s) => s.length > 1);

    console.log(`📤 Sending ${validSentences.length} sentence(s) in batches`);

    // Batch sentences: 2-3 sentences per batch for fluent speech
    const BATCH_SIZE = 2;
    const batches = [];

    for (let i = 0; i < validSentences.length; i += BATCH_SIZE) {
      const batch = validSentences.slice(i, i + BATCH_SIZE).join(" ");
      if (batch.trim()) {
        batches.push(batch.trim());
      }
    }

    // Send each batch as a "sentence" event
    for (let i = 0; i < batches.length; i++) {
      res.write(
        `data: ${JSON.stringify({
          type: "sentence",
          content: batches[i],
          index: i + 1,
          total: batches.length,
        })}\n\n`
      );
      console.log(
        `📤 Batch ${i + 1}/${batches.length}:`,
        batches[i].substring(0, 60)
      );
    }

    // Send completion
    res.write(
      `data: ${JSON.stringify({
        type: "done",
        fullResponse: cleanedResponse,
        customerContext: updatedContext,
        languageSwitch,
        batchCount: batches.length,
      })}\n\n`
    );

    console.log(`✅ Stream complete. ${batches.length} batches sent.`);
    res.end();
  } catch (error) {
    console.error("❌ Stream Chat Error:", error);

    res.write(
      `data: ${JSON.stringify({
        type: "error",
        message: error.message,
      })}\n\n`
    );

    res.end();
  }
};

/**
 * Quick response endpoint for simple queries
 * Uses response caching for common questions
 * POST /api/chat/quick
 */
export const quickChat = async (req, res) => {
  const {
    message,
    agentId = "default",
    customerContext = {},
    conversationHistory = [],
    options = {},
  } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({
      error: "Message is required and must be a string",
    });
  }

  try {
    const cachedResponse = aiAgentService.getCachedResponse(message, agentId);
    if (cachedResponse) {
      console.log("⚡ Cache hit for:", message.substring(0, 50));
      return res.json(cachedResponse);
    }

    const result = await aiAgentService.processMessage(
      message,
      agentId,
      customerContext,
      conversationHistory,
      {
        ...options,
        maxTokens: Math.min(options.maxTokens || 100, 100),
        temperature: 0.2,
      }
    );

    aiAgentService.cacheResponse(message, agentId, result);

    res.json({
      response: result.response,
      customerContext: result.customerContext,
      languageSwitch: result.languageSwitch || null,
    });
  } catch (error) {
    console.error("❌ Quick Chat Error:", error);
    res.status(500).json({
      error: "Failed to process message",
      details: error.message,
    });
  }
};
