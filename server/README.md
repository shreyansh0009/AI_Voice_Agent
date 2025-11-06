# Knowledge Base Server

Backend server for handling file uploads and document processing for the AI Voice CRM.

## Features

- 📤 **File Upload**: Support for PDF, DOC, and DOCX files
- 📄 **Text Extraction**: Automatically extracts text from uploaded documents
- 🗑️ **File Management**: Delete uploaded files
- ✅ **Validation**: File type and size validation (10MB max)
- 🔒 **CORS Enabled**: Ready for frontend integration

## Installation

```bash
cd server
npm install
```

## Environment Variables

Create a `.env` file in the server directory:

```env
PORT=5000
```

## Running the Server

### Development mode (with auto-reload):
```bash
npm run dev
```

### Production mode:
```bash
npm start
```

The server will run on `http://localhost:5000`

## API Endpoints

### 1. Health Check
```
GET /api/health
```
Returns server status.

### 2. Upload Files
```
POST /api/upload-knowledge
Content-Type: multipart/form-data
Body: files[] (multiple files supported)
```

**Response:**
```json
{
  "success": true,
  "message": "2 file(s) uploaded successfully",
  "files": [
    {
      "originalName": "document.pdf",
      "fileName": "1699999999999-document.pdf",
      "size": 102400,
      "mimetype": "application/pdf",
      "uploadedAt": "2025-11-06T10:30:00.000Z",
      "extractedText": "...",
      "textLength": 5000,
      "status": "processed"
    }
  ]
}
```

### 3. Get All Files
```
GET /api/knowledge-files
```

### 4. Delete File
```
DELETE /api/knowledge-files/:filename
```

## Supported File Types

- **PDF**: `.pdf`
- **Word**: `.doc`, `.docx`

## File Size Limit

Maximum file size: **10MB per file**

## Dependencies

- `express`: Web server
- `multer`: File upload handling
- `pdf-parse`: PDF text extraction
- `mammoth`: Word document text extraction
- `cors`: Cross-origin resource sharing
- `dotenv`: Environment variables

## Error Handling

The server includes comprehensive error handling for:
- Invalid file types
- File size exceeded
- Text extraction failures
- Missing files

## Storage

Uploaded files are stored in the `uploads/` directory.

## Notes

- Files are processed immediately upon upload
- Text is extracted and metadata is returned
- Failed extractions are marked with error status
- Original files are kept for reference
