# Knowledge Base Upload - Setup Guide

## Overview

The knowledge base upload feature allows you to upload PDF and Word documents that will be processed and used to enhance your AI agent's knowledge.

## Setup Complete ✅

### Backend Server
- ✅ Express server created (`server/index.js`)
- ✅ File upload with Multer
- ✅ PDF text extraction (pdf-parse)
- ✅ Word document extraction (mammoth)
- ✅ CORS enabled for frontend
- ✅ Dependencies installed
- ✅ Server running on http://localhost:5000

### Frontend Integration
- ✅ File upload UI in Voice tab
- ✅ API integration with backend
- ✅ Upload status indicators
- ✅ File list with metadata
- ✅ Delete functionality
- ✅ Error handling

## How to Use

### 1. Start the Backend Server (if not running)

```bash
cd server
node index.js
```

You should see:
```
🚀 Server running on http://localhost:5000
📁 Uploads directory: /home/shreyansh0009/CRM_Landing/dashboard/AI_voice_crm/server/uploads
```

### 2. Upload Files

1. Navigate to the **Voice** tab in your application
2. Click **"Choose Files"** button in the Knowledge Base section
3. Select PDF, DOC, or DOCX files (max 10MB each)
4. Files will be uploaded and processed automatically
5. See upload status with green checkmark when complete

### 3. View Uploaded Files

Each uploaded file shows:
- ✅ File name
- ✅ File size
- ✅ Number of characters extracted
- ✅ Processing status (Ready/Failed)
- ✅ Delete button

### 4. Remove Files

Click the trash icon (🗑️) next to any file to remove it.

## Features

### File Support
- **PDF**: Full text extraction
- **DOC/DOCX**: Microsoft Word documents
- **Size Limit**: 10MB per file
- **Multiple Files**: Upload multiple files at once

### Processing
- ⚡ Automatic text extraction
- 📊 Character count display
- ✅ Status indicators
- ❌ Error messages for failed uploads

### UI Feedback
- 🟢 Success messages (green)
- 🔴 Error messages (red)
- ⏳ Loading state during upload
- 📈 Real-time progress

## API Endpoints

### Upload Files
```
POST http://localhost:5000/api/upload-knowledge
```

### Get All Files
```
GET http://localhost:5000/api/knowledge-files
```

### Delete File
```
DELETE http://localhost:5000/api/knowledge-files/:filename
```

## File Storage

Uploaded files are stored in:
```
/server/uploads/
```

Each file is renamed with a timestamp to prevent conflicts:
```
1699999999999-document.pdf
```

## Error Handling

The system handles:
- ❌ Invalid file types
- ❌ Files too large (>10MB)
- ❌ Server connection errors
- ❌ Text extraction failures
- ❌ Missing files

## Next Steps (Optional Enhancements)

1. **Vector Database Integration**
   - Store extracted text in a vector database (Pinecone, Weaviate)
   - Enable semantic search

2. **Chunking Strategy**
   - Split large documents into chunks
   - Better context retrieval

3. **RAG Integration**
   - Use extracted text in agent responses
   - Retrieval Augmented Generation

4. **File Management**
   - Organize files by agent
   - Tag files by category
   - Search functionality

## Troubleshooting

### Server Not Running
```bash
cd server
node index.js
```

### CORS Errors
Check that server CORS is enabled for your client URL.

### Upload Fails
- Verify file size is under 10MB
- Check file type is PDF, DOC, or DOCX
- Ensure server is running on port 5000

### Text Extraction Fails
- Check PDF is not scanned/image-based
- Verify Word document is not corrupted
- Look at server console for error details

## Testing

To test the upload:

1. **Prepare test files**:
   - Create a simple PDF with text
   - Create a Word document with content

2. **Upload via UI**:
   - Go to Voice tab
   - Click "Choose Files"
   - Select your test files
   - Watch for success message

3. **Verify**:
   - File appears in uploaded files list
   - Character count is displayed
   - Status shows "Ready" with green checkmark

## Server Logs

Watch the server console for:
```
🚀 Server running on http://localhost:5000
📁 Uploads directory: /path/to/uploads
```

When files are uploaded, you'll see processing logs.

## Complete! 🎉

Your knowledge base upload system is fully functional and ready to use!
