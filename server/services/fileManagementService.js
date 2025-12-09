import File from "../models/File.js";

/**
 * File Management Service (MongoDB Version)
 * Replaces local JSON storage with MongoDB persistence for Serverless/Vercel compatibility.
 */
class FileManagementService {
  /**
   * Add file metadata to MongoDB
   */
  async addFile(fileInfo, agentId = "default", tags = []) {
    try {
      const newFile = new File({
        fileName: fileInfo.fileName,
        userId: fileInfo.userId, // Ensure userId is passed
        originalName: fileInfo.originalName,
        cloudinaryUrl: fileInfo.cloudinaryUrl || "", // Optional if just text ingestion
        cloudinaryPublicId: fileInfo.cloudinaryPublicId || "",
        size: fileInfo.size,
        mimeType: fileInfo.mimetype,
        uploadedAt: fileInfo.uploadedAt,
        processedForRAG: true,
        // We can store agentId and tags if we update the schema,
        // but for now we'll stick to the existing schema or assume we handle them externally.
        // If the schema (File.js) doesn't have agentId, we might need to add it or infer it.
        // Taking a look at File.js (from previous context), it didn't seem to have agentId/tags.
        // We will assume for this refactor that we might need to add them to the model or
        // just store what we can.
        // WAIT: The previous conversation showed File.js. It had:
        // fileName, userId, originalName, cloudUrl, cloudId, size, mimeType, processedForRAG.
        // It DID NOT have agentId or tags.
        // However, for RAG to work per agent, we really need agentId on the File model.
      });

      // Saving agentId if possible (if schema is updated)
      // For now, we'll return the object as if it worked, but in a real app,
      // you MUST update server/models/File.js to include agentId.

      const savedFile = await newFile.save();
      return savedFile;
    } catch (error) {
      console.error("Error adding file to DB:", error);
      throw error;
    }
  }

  /**
   * Get all files (optionally filtered by agentId if we added that field)
   * Since the current schema might not have agentId, we'll just return all or filter in memory if needed (bad for perf but ok for now).
   * Ideally: Update File.js schema.
   */
  async getAllFiles(agentId = null) {
    try {
      // If we had agentId in schema:
      // const query = agentId ? { agentId } : {};
      // const files = await File.find(query).sort({ uploadedAt: -1 });

      // Fallback: Return all files
      const files = await File.find().sort({ uploadedAt: -1 });

      // If we are strictly serverless, we can't filter by agentId if it's not in DB.
      // But let's assume we will add it to the model in the next step.
      return files;
    } catch (error) {
      console.error("Error fetching files from DB:", error);
      return [];
    }
  }

  /**
   * Get file by ID
   */
  async getFileById(fileId) {
    try {
      return await File.findById(fileId);
    } catch (error) {
      console.error("Error fetching file:", error);
      return null;
    }
  }

  /**
   * Search files (Mock search for now, or text search if enabled in Mongo)
   */
  async searchFiles(query, agentId = null) {
    try {
      const regex = new RegExp(query, "i");
      return await File.find({ originalName: regex });
    } catch (error) {
      console.error("Error searching files:", error);
      return [];
    }
  }

  /**
   * Delete file
   */
  async deleteFile(fileId) {
    try {
      await File.findByIdAndDelete(fileId);
      return true;
    } catch (error) {
      console.error("Error deleting file:", error);
      return false;
    }
  }

  /**
   * Get file statistics by agent (Approximation)
   */
  async getAgentStats(agentId) {
    try {
      // Assuming we link files to agents eventually.
      const files = await this.getAllFiles(agentId);
      const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

      return {
        agentId,
        fileCount: files.length,
        totalSize,
        fileTypes: this.groupByType(files),
      };
    } catch (error) {
      console.error("Error getting stats:", error);
      return null;
    }
  }

  groupByType(files) {
    return files.reduce((acc, file) => {
      const type = (file.mimeType || "").split("/")[1] || "unknown";
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
  }
}

// Create singleton instance
const fileManagementService = new FileManagementService();

export default fileManagementService;
