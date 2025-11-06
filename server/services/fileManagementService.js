import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FileManagementService {
  constructor() {
    this.metadataFile = path.join(__dirname, '../data/file-metadata.json');
    this.ensureDataDirectory();
    this.metadata = this.loadMetadata();
  }

  ensureDataDirectory() {
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  loadMetadata() {
    try {
      if (fs.existsSync(this.metadataFile)) {
        const data = fs.readFileSync(this.metadataFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading metadata:', error);
    }
    return { files: [], agents: {} };
  }

  saveMetadata() {
    try {
      fs.writeFileSync(this.metadataFile, JSON.stringify(this.metadata, null, 2));
    } catch (error) {
      console.error('Error saving metadata:', error);
    }
  }

  /**
   * Add file metadata
   */
  addFile(fileInfo, agentId = 'default', tags = []) {
    const fileData = {
      id: fileInfo.fileName,
      originalName: fileInfo.originalName,
      fileName: fileInfo.fileName,
      size: fileInfo.size,
      mimetype: fileInfo.mimetype,
      uploadedAt: fileInfo.uploadedAt,
      textLength: fileInfo.textLength,
      status: fileInfo.status,
      agentId,
      tags,
      searchable: true,
    };

    this.metadata.files.push(fileData);

    // Organize by agent
    if (!this.metadata.agents[agentId]) {
      this.metadata.agents[agentId] = [];
    }
    this.metadata.agents[agentId].push(fileInfo.fileName);

    this.saveMetadata();
    return fileData;
  }

  /**
   * Get all files
   */
  getAllFiles(agentId = null) {
    if (agentId) {
      return this.metadata.files.filter(f => f.agentId === agentId);
    }
    return this.metadata.files;
  }

  /**
   * Get file by ID
   */
  getFileById(fileId) {
    return this.metadata.files.find(f => f.id === fileId);
  }

  /**
   * Search files by name or tags
   */
  searchFiles(query, agentId = null) {
    const lowerQuery = query.toLowerCase();
    let results = this.metadata.files.filter(file => {
      const nameMatch = file.originalName.toLowerCase().includes(lowerQuery);
      const tagMatch = file.tags?.some(tag => tag.toLowerCase().includes(lowerQuery));
      return nameMatch || tagMatch;
    });

    if (agentId) {
      results = results.filter(f => f.agentId === agentId);
    }

    return results;
  }

  /**
   * Update file tags
   */
  updateFileTags(fileId, tags) {
    const file = this.metadata.files.find(f => f.id === fileId);
    if (file) {
      file.tags = tags;
      this.saveMetadata();
      return file;
    }
    return null;
  }

  /**
   * Update file agent
   */
  updateFileAgent(fileId, newAgentId) {
    const file = this.metadata.files.find(f => f.id === fileId);
    if (file) {
      const oldAgentId = file.agentId;
      
      // Remove from old agent
      if (this.metadata.agents[oldAgentId]) {
        this.metadata.agents[oldAgentId] = this.metadata.agents[oldAgentId].filter(
          id => id !== fileId
        );
      }

      // Add to new agent
      if (!this.metadata.agents[newAgentId]) {
        this.metadata.agents[newAgentId] = [];
      }
      this.metadata.agents[newAgentId].push(fileId);

      file.agentId = newAgentId;
      this.saveMetadata();
      return file;
    }
    return null;
  }

  /**
   * Delete file metadata
   */
  deleteFile(fileId) {
    const fileIndex = this.metadata.files.findIndex(f => f.id === fileId);
    if (fileIndex !== -1) {
      const file = this.metadata.files[fileIndex];
      
      // Remove from agent
      if (this.metadata.agents[file.agentId]) {
        this.metadata.agents[file.agentId] = this.metadata.agents[file.agentId].filter(
          id => id !== fileId
        );
      }

      this.metadata.files.splice(fileIndex, 1);
      this.saveMetadata();
      return true;
    }
    return false;
  }

  /**
   * Get file statistics by agent
   */
  getAgentStats(agentId) {
    const files = this.getAllFiles(agentId);
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const totalChars = files.reduce((sum, f) => sum + (f.textLength || 0), 0);

    return {
      agentId,
      fileCount: files.length,
      totalSize,
      totalCharacters: totalChars,
      fileTypes: this.groupByType(files),
    };
  }

  groupByType(files) {
    return files.reduce((acc, file) => {
      const type = file.mimetype.split('/')[1] || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
  }

  /**
   * Get all agent IDs
   */
  getAllAgentIds() {
    return Object.keys(this.metadata.agents);
  }
}

// Create singleton instance
const fileManagementService = new FileManagementService();

export default fileManagementService;
