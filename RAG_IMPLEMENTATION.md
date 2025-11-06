# 🎉 Complete RAG Implementation Guide

## ✅ What's Been Implemented

### 1. **Vector Database Integration** (Pinecone)
- ✅ Automatic document embedding
- ✅ Semantic search for relevant context
- ✅ Namespace organization (`knowledge-base`)
- ✅ Vector deletion when files are removed

### 2. **Intelligent Chunking Strategy**
- ✅ RecursiveCharacterTextSplitter
- ✅ 1000 characters per chunk
- ✅ 200 characters overlap for context continuity
- ✅ Smart separators (paragraphs, sentences, words)
- ✅ Metadata tracking (file name, chunk index, etc.)

### 3. **RAG Integration**
- ✅ Retrieval Augmented Generation
- ✅ Context-aware AI responses
- ✅ Source attribution
- ✅ Fallback to standard OpenAI if RAG fails
- ✅ Toggle to enable/disable RAG

### 4. **File Management System**
- ✅ Agent-based file organization
- ✅ File tagging system
- ✅ File search functionality
- ✅ Statistics tracking (size, character count, file types)
- ✅ Metadata persistence (JSON file)

## 📁 New Files Created

### Backend Services

1. **`server/services/ragService.js`**
   - Pinecone initialization
   - Text chunking
   - Document storage in vector DB
   - Context retrieval
   - RAG response generation
   - Vector deletion

2. **`server/services/fileManagementService.js`**
   - File metadata management
   - Agent organization
   - Tag management
   - Search functionality
   - Statistics generation

### Server Updates

3. **`server/index.js`** (Updated)
   - RAG service integration
   - New API endpoints for RAG queries
   - File management endpoints
   - Enhanced upload with vector storage
   - Enhanced delete with vector cleanup

## 🚀 New API Endpoints

### RAG Endpoints

#### 1. **Query Knowledge Base**
```http
POST /api/rag/query
Content-Type: application/json

{
  "query": "What is our return policy?",
  "topK": 5
}
```

**Response:**
```json
{
  "success": true,
  "context": "[Source 1: policy.pdf]\nOur return policy allows...",
  "sources": [...],
  "numResults": 3
}
```

#### 2. **RAG Chat** (Integrated AI Response)
```http
POST /api/rag/chat
Content-Type: application/json

{
  "query": "Tell me about shipping times",
  "conversationHistory": [],
  "systemPrompt": "You are a helpful assistant"
}
```

**Response:**
```json
{
  "success": true,
  "response": "Based on our shipping policy, standard delivery takes 3-5 business days...",
  "sources": [...],
  "contextUsed": true
}
```

### File Management Endpoints

#### 3. **Search Files**
```http
GET /api/knowledge-files/search?q=shipping&agentId=default
```

#### 4. **Update File Tags**
```http
PATCH /api/knowledge-files/:filename/tags
Content-Type: application/json

{
  "tags": ["policy", "shipping", "important"]
}
```

#### 5. **Update File Agent**
```http
PATCH /api/knowledge-files/:filename/agent
Content-Type: application/json

{
  "agentId": "support-agent"
}
```

#### 6. **Get Agent Statistics**
```http
GET /api/agents/:agentId/stats
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "agentId": "default",
    "fileCount": 5,
    "totalSize": 2048000,
    "totalCharacters": 50000,
    "fileTypes": {
      "pdf": 3,
      "docx": 2
    }
  }
}
```

#### 7. **Get All Agents**
```http
GET /api/agents
```

## 🔧 Setup Instructions

### 1. Install Dependencies
```bash
cd server
npm install
```

New packages installed:
- `@pinecone-database/pinecone` - Vector database
- `openai` - OpenAI API client
- `langchain` - LangChain framework
- `@langchain/openai` - OpenAI integration for LangChain
- `@langchain/pinecone` - Pinecone integration for LangChain

### 2. Environment Variables

Update `server/.env`:
```env
PORT=5000

# OpenAI API Key (Required for embeddings and RAG)
OPENAI_API_KEY=your_openai_api_key_here

# Pinecone Configuration (Optional - system works without it)
PINECONE_API_KEY=your_pinecone_api_key_here
PINECONE_INDEX=voice-crm-knowledge
PINECONE_ENVIRONMENT=gcp-starter
```

**Note:** If you don't have a Pinecone API key:
1. Sign up at https://www.pinecone.io/ (free tier available)
2. Create an index named `voice-crm-knowledge`
3. Use dimension: 1536 (for text-embedding-3-small)
4. Or leave it blank - system will work in basic mode without vector search

### 3. Start the Server

```bash
cd server
node index.js
```

You should see:
```
🚀 Server running on http://localhost:5000
📁 Uploads directory: /path/to/uploads
✅ Pinecone initialized
✅ OpenAI Embeddings initialized
🤖 RAG Service ready for vector search
```

Or if Pinecone is not configured:
```
⚠️  Pinecone API key not found. Vector search disabled.
⚠️  RAG Service running in basic mode (no vector search)
```

## 🎯 How It Works

### Document Upload Flow

1. **Upload File** → Frontend sends file to `/api/upload-knowledge`
2. **Text Extraction** → PDF/Word text extracted
3. **Chunking** → Text split into 1000-char chunks with 200-char overlap
4. **Embedding** → Each chunk converted to vector (OpenAI text-embedding-3-small)
5. **Storage** → Vectors stored in Pinecone with metadata
6. **Metadata** → File info saved to JSON database

### RAG Query Flow

1. **User Question** → "What is the return policy?"
2. **Embedding** → Question converted to vector
3. **Similarity Search** → Find top 5 most relevant chunks in Pinecone
4. **Context Building** → Combine chunks into context string
5. **AI Generation** → OpenAI generates answer using context + question
6. **Response** → Answer with source attribution

### Frontend Integration

The VoiceChat component now:
- ✅ Has a RAG toggle checkbox
- ✅ Automatically uses RAG when enabled
- ✅ Falls back to standard OpenAI if RAG fails
- ✅ Shows "Enhanced with uploaded documents" status

## 📊 Features Breakdown

### Vector Search (Pinecone)
```javascript
// Automatically happens on upload
await ragService.storeDocument(fileInfo, extractedText);

// Retrieve relevant context
const result = await ragService.retrieveContext("user question", 5);
```

### Chunking
```javascript
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ['\n\n', '\n', '.', '!', '?', ',', ' ', '']
});
```

### File Management
```javascript
// Add file with tags and agent
fileManagementService.addFile(fileInfo, 'sales-agent', ['policy', 'returns']);

// Search files
const results = fileManagementService.searchFiles('shipping', 'support-agent');

// Get statistics
const stats = fileManagementService.getAgentStats('default');
```

### RAG Generation
```javascript
const response = await ragService.generateRAGResponse(
  query,
  conversationHistory,
  systemPrompt
);
```

## 💡 Usage Examples

### Example 1: Upload and Query

```bash
# Upload a policy document
curl -X POST http://localhost:5000/api/upload-knowledge \
  -F "files=@policy.pdf" \
  -F "agentId=support" \
  -F "tags=[\"policy\",\"customer-service\"]"

# Query the knowledge base
curl -X POST http://localhost:5000/api/rag/chat \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is your refund policy?",
    "systemPrompt": "You are a customer support agent"
  }'
```

### Example 2: Voice Chat with RAG

1. Go to Voice tab
2. Upload your documents (PDF/Word)
3. Enable "Use Knowledge Base (RAG)" toggle
4. Start voice conversation
5. Ask questions about uploaded documents
6. AI will answer using document content!

## 🎨 UI Updates

### VoiceChat Component

Added RAG toggle:
```jsx
<label className="flex items-center gap-2">
  <input
    type="checkbox"
    checked={ragEnabled}
    onChange={(e) => setRagEnabled(e.target.checked)}
  />
  Use Knowledge Base (RAG)
</label>
```

Status indicator shows:
- ✅ "Enhanced with uploaded documents" when RAG enabled
- ⚠️ "Basic mode only" when RAG disabled

## 📈 Performance & Costs

### Token Usage Reduction
- ✅ Limited conversation history (6 messages)
- ✅ Concise system prompts
- ✅ max_tokens: 100
- ✅ Using gpt-4o-mini (15x cheaper than GPT-4)

### Embedding Costs
- Model: text-embedding-3-small
- Cost: $0.02 per 1M tokens
- Average document (5000 words) ≈ $0.0001

### Vector Storage
- Pinecone free tier: 1M vectors
- Sufficient for ~10,000 documents

## 🔍 Testing

### Test RAG Endpoint
```javascript
// Test context retrieval
const response = await fetch('http://localhost:5000/api/rag/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: "What is the shipping policy?",
    topK: 3
  })
});
```

### Test File Management
```javascript
// Search files
const response = await fetch('http://localhost:5000/api/knowledge-files/search?q=policy');

// Get agent stats
const response = await fetch('http://localhost:5000/api/agents/default/stats');
```

## 🎯 Next Steps (Optional Enhancements)

1. **Add file preview** - Show document content in UI
2. **Add batch upload** - Upload multiple files at once
3. **Add file categories** - Organize by type (policy, FAQ, manual)
4. **Add version control** - Track document updates
5. **Add analytics** - Track which documents are most used
6. **Add multi-tenant support** - Separate agents completely
7. **Add caching** - Cache frequent queries
8. **Add feedback loop** - Users rate answer quality

## 🐛 Troubleshooting

### RAG not working?
- Check Pinecone API key in .env
- Verify OpenAI API key is set
- Check server console for errors
- Try with RAG toggle OFF to test basic mode

### Vectors not storing?
- Check Pinecone index exists
- Verify index dimension is 1536
- Check server logs for embedding errors

### Files not uploading?
- Ensure server is running on port 5000
- Check file size < 10MB
- Verify file type is PDF, DOC, or DOCX

## 📚 Documentation Links

- [Pinecone Docs](https://docs.pinecone.io/)
- [LangChain Docs](https://js.langchain.com/)
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)

## 🎉 You're All Set!

Your AI Voice CRM now has:
- ✅ Full RAG implementation
- ✅ Vector search with Pinecone
- ✅ Intelligent document chunking
- ✅ File management system
- ✅ Agent-based organization
- ✅ Search and tagging
- ✅ Statistics tracking
- ✅ Complete API

**Start uploading documents and watch your AI agent become smarter!** 🚀
