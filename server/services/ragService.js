import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PineconeStore } from "@langchain/pinecone";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import { config } from "../config/index.js";

class RAGService {
  constructor() {
    this.pinecone = null;
    this.embeddings = null;
    this.index = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      // Initialize Pinecone
      if (config.pineconeApiKey) {
        this.pinecone = new Pinecone({
          apiKey: config.pineconeApiKey,
        });

        this.index = this.pinecone.index(config.pineconeIndex);

        console.log("✅ Pinecone initialized");
      } else {
        console.warn("⚠️  Pinecone API key not found. Vector search disabled.");
      }

      // Initialize OpenAI Embeddings
      if (config.openaiApiKey) {
        this.embeddings = new OpenAIEmbeddings({
          openAIApiKey: config.openaiApiKey,
          modelName: config.embeddingModel,
        });
        console.log("✅ OpenAI Embeddings initialized");
      } else {
        console.warn("⚠️  OpenAI API key not found. Embeddings disabled.");
      }

      this.initialized = this.embeddings && this.pinecone;
      return this.initialized;
    } catch (error) {
      console.error("❌ Failed to initialize RAG service:", error);
      return false;
    }
  }

  /**
   * Split text into chunks for better retrieval
   */
  async chunkText(text, metadata = {}) {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
      separators: ["\n\n", "\n", ".", "!", "?", ",", " ", ""],
    });

    const chunks = await splitter.splitText(text);

    return chunks.map((chunk, index) => ({
      pageContent: chunk,
      metadata: {
        ...metadata,
        chunkIndex: index,
        totalChunks: chunks.length,
      },
    }));
  }

  /**
   * Store document in vector database
   */
  async storeDocument(fileInfo, extractedText) {
    if (!this.initialized) {
      console.log("RAG not initialized, skipping vector storage");
      return null;
    }

    try {
      // Chunk the text
      const chunks = await this.chunkText(extractedText, {
        fileName: fileInfo.originalName,
        fileId: fileInfo.fileName,
        uploadedAt: fileInfo.uploadedAt,
        fileSize: fileInfo.size,
        mimeType: fileInfo.mimetype,
        agentId: fileInfo.agentId, // Add agentId to metadata
      });

      console.log(
        `📄 Chunked "${fileInfo.originalName}" into ${chunks.length} pieces`
      );

      // Create documents
      const documents = chunks.map((chunk) => new Document(chunk));

      // Store in Pinecone
      await PineconeStore.fromDocuments(documents, this.embeddings, {
        pineconeIndex: this.index,
        namespace: "knowledge-base",
      });

      console.log(`✅ Stored ${chunks.length} chunks in vector database`);

      return {
        success: true,
        chunksStored: chunks.length,
      };
    } catch (error) {
      console.error("❌ Error storing document:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Retrieve relevant context for a query
   */
  async retrieveContext(query, topK = 5, filter = {}) {
    if (!this.initialized) {
      return {
        success: false,
        error: "RAG service not initialized",
        context: "",
      };
    }

    try {
      const vectorStore = await PineconeStore.fromExistingIndex(
        this.embeddings,
        {
          pineconeIndex: this.index,
          namespace: "knowledge-base",
        }
      );

      // Perform similarity search with filter
      // If agentId is provided in filter, it ensures we only get context for that agent
      const results = await vectorStore.similaritySearch(query, topK, filter);

      const context = results
        .map((doc, idx) => {
          const source = doc.metadata.fileName || "Unknown";
          return `[Source ${idx + 1}: ${source}]\n${doc.pageContent}`;
        })
        .join("\n\n---\n\n");

      return {
        success: true,
        context,
        results: results.map((doc) => ({
          text: doc.pageContent,
          metadata: doc.metadata,
        })),
        sources: results.map((doc) => doc.metadata),
        numResults: results.length,
      };
    } catch (error) {
      console.error("❌ Error retrieving context:", error);
      return {
        success: false,
        error: error.message,
        context: "",
      };
    }
  }

  /**
   * Delete all vectors for a specific file
   */
  async deleteFileVectors(fileId) {
    if (!this.initialized) {
      return { success: false, error: "RAG not initialized" };
    }

    try {
      // Query all vectors with this fileId
      const queryResponse = await this.index.query({
        namespace: "knowledge-base",
        filter: { fileId: { $eq: fileId } },
        topK: 10000,
        includeMetadata: false,
      });

      if (queryResponse.matches && queryResponse.matches.length > 0) {
        const ids = queryResponse.matches.map((match) => match.id);
        await this.index.deleteMany(ids, "knowledge-base");
        console.log(`🗑️  Deleted ${ids.length} vectors for file ${fileId}`);
      }

      return {
        success: true,
        deletedCount: queryResponse.matches?.length || 0,
      };
    } catch (error) {
      console.error("❌ Error deleting vectors:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate enhanced response with RAG
   */
  async generateRAGResponse(
    query,
    conversationHistory = [],
    systemPrompt = "",
    options = {}
  ) {
    try {
      // Create filter if agentId is provided
      const filter = options.agentId ? { agentId: options.agentId } : {};

      // Retrieve relevant context from knowledge base with filter
      const retrieval = await this.retrieveContext(
        query,
        config.topK || 15,
        filter
      );

      if (!retrieval.success) {
        throw new Error("Failed to retrieve context");
      }

      // Build smart RAG prompt - only use KB when needed
      const contextSection =
        retrieval.context && retrieval.context.length > 50
          ? `\n\n--- KNOWLEDGE BASE REFERENCE (Use ONLY if your instructions don't cover this) ---\n${retrieval.context}\n--- END KNOWLEDGE BASE ---\n\n`
          : "";

      // Priority: Agent Prompt > Knowledge Base > General Knowledge
      // Priority: Agent Prompt > Knowledge Base > General Knowledge
      const enhancedSystemPrompt = `${systemPrompt}

${contextSection}INSTRUCTIONS:
1. You are an AI assistant representing the organization defined in the KNOWLEDGE BASE.
2. USE the "KNOWLEDGE BASE REFERENCE" above as your PRIMARY source of truth and behavior.
3. If the Knowledge Base contains a script, flow, or specific set of steps, you MUST FOLLOW THEM EXACTLY.
4. Do NOT use outside knowledge or generic AI responses if the answer or procedure is in the Knowledge Base.
5. Only use general knowledge if the user's query is completely unrelated to the Knowledge Base.
6. IMPORTANT: Preserve all language switching capabilities and formatting instructions from your main prompt.
7. KEEP RESPONSES SHORT (1-2 sentences). This is a voice conversation.
8. CRITICAL: If the Context contains a "Script", "Flow", "Sequence", or "Steps", you MUST perform the NEXT step in that sequence.
9. SKIPPING STEPS IS FORBIDDEN. You cannot book a visit or confirm an action until you have collected ALL required information defined in the flow (e.g., Pincode, Name, etc.).
10. If you are missing information required by the flow, ASK FOR IT. Do not hallucinate or assume values.
11. IGNORE any 'helpful assistant' behavior that contradicts the strict flow defined in the Knowledge Base.`;

      // Build messages with conversation history
      const messages = [
        { role: "system", content: enhancedSystemPrompt },
        ...conversationHistory,
        { role: "user", content: query },
      ];

      // Call OpenAI
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.openaiApiKey}`,
          },
          body: JSON.stringify({
            model: config.chatModel,
            messages: messages,
            temperature: options.temperature || config.temperature,
            max_tokens: options.max_tokens || 500, // Increased for better responses
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "OpenAI API error");
      }

      const data = await response.json();
      const aiResponse = data.choices[0].message.content;

      return {
        success: true,
        response: aiResponse,
        sources: retrieval.sources,
        contextUsed: retrieval.context.length > 0,
        tokensUsed: data.usage?.total_tokens || 0,
      };
    } catch (error) {
      console.error("❌ RAG generation error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  isInitialized() {
    return this.initialized;
  }

  async chat(query, conversationHistory = [], systemPrompt = "", options = {}) {
    return this.generateRAGResponse(
      query,
      conversationHistory,
      systemPrompt,
      options
    );
  }
}

// Create singleton instance
const ragService = new RAGService();

export default ragService;
