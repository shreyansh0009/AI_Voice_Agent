import Call from '../models/Call.js';
import CallLog from '../models/CallLog.js';

/**
 * Call Storage Service - MongoDB-backed implementation for serverless environments
 */
class CallStorageService {
  constructor() {
    // No filesystem operations in serverless; rely on MongoDB.
  }

  /**
   * Create a new call record
   */
  async createCall(callData) {
    const doc = new Call({
      exotelCallSid: callData.exotelCallSid || null,
      phoneNumber: callData.phoneNumber,
      direction: callData.direction || 'outbound',
      status: callData.status || 'initiated',
      agentId: callData.agentId || 'default',
      duration: callData.duration || 0,
      recordingUrl: callData.recordingUrl || null,
      transcript: callData.transcript || [],
      customerContext: callData.customerContext || {},
      metadata: callData.metadata || {},
      endedAt: callData.endedAt || null,
    });
    await doc.save();
    console.log(`💾 Call record created: ${doc.id}`);
    return doc.toObject();
  }

  /**
   * Update call record
   */
  async updateCall(callId, updates) {
    updates.updatedAt = new Date();
    const doc = await Call.findOneAndUpdate({ id: callId }, updates, { new: true });
    if (!doc) throw new Error(`Call not found: ${callId}`);
    return doc.toObject();
  }

  /**
   * Get call by ID
   */
  async getCall(callId) {
    const doc = await Call.findOne({ id: callId });
    return doc ? doc.toObject() : null;
  }

  /**
   * Get call by Exotel SID
   */
  async getCallByExotelSid(exotelCallSid) {
    if (!exotelCallSid) return null;
    const doc = await Call.findOne({ exotelCallSid });
    return doc ? doc.toObject() : null;
  }

  /**
   * Get all calls with optional filters
   */
  async getAllCalls(filters = {}) {
    const query = {};
    if (filters.phoneNumber) query.phoneNumber = filters.phoneNumber;
    if (filters.direction) query.direction = filters.direction;
    if (filters.status) query.status = filters.status;
    if (filters.agentId) query.agentId = filters.agentId;

    const docs = await Call.find(query).sort({ createdAt: -1 }).lean();
    return docs;
  }

  /**
   * Add message to call transcript (and store a CallLog entry)
   */
  async addCallLog(callId, logData) {
    const newLog = new CallLog({
      callId,
      type: logData.type,
      content: logData.content,
      audioUrl: logData.audioUrl || null,
      timestamp: logData.timestamp ? new Date(logData.timestamp) : new Date(),
    });
    await newLog.save();

    // Also push into Call.transcript for convenience
    const call = await Call.findOne({ id: callId });
    if (call) {
      call.transcript.push({
        type: newLog.type,
        content: newLog.content,
        audioUrl: newLog.audioUrl || undefined,
        timestamp: newLog.timestamp,
      });
      call.updatedAt = new Date();
      await call.save();
    }

    return newLog.toObject();
  }

  /**
   * Get call logs for a specific call
   */
  async getCallLogs(callId) {
    const logs = await CallLog.find({ callId }).sort({ timestamp: 1 }).lean();
    return logs;
  }

  /**
   * Delete call (for cleanup/testing)
   */
  async deleteCall(callId) {
    await Call.deleteOne({ id: callId });
    await CallLog.deleteMany({ callId });
    console.log(`🗑️  Call deleted: ${callId}`);
  }
}

// Export singleton instance
const callStorageService = new CallStorageService();
export default callStorageService;
