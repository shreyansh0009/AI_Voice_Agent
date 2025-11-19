import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../data');
const CALLS_FILE = path.join(DATA_DIR, 'calls.json');
const CALL_LOGS_FILE = path.join(DATA_DIR, 'call_logs.json');

/**
 * Call Storage Service - Simple JSON-based storage for calls
 * Can be upgraded to PostgreSQL/MongoDB later
 */
class CallStorageService {
  constructor() {
    this.ensureDataFiles();
  }

  /**
   * Ensure data directory and files exist
   */
  ensureDataFiles() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(CALLS_FILE)) {
      fs.writeFileSync(CALLS_FILE, JSON.stringify([], null, 2));
    }

    if (!fs.existsSync(CALL_LOGS_FILE)) {
      fs.writeFileSync(CALL_LOGS_FILE, JSON.stringify([], null, 2));
    }
  }

  /**
   * Create a new call record
   */
  async createCall(callData) {
    const calls = this.readCalls();
    
    const newCall = {
      id: uuidv4(),
      exotelCallSid: callData.exotelCallSid || null,
      phoneNumber: callData.phoneNumber,
      direction: callData.direction, // 'inbound' or 'outbound'
      status: callData.status || 'initiated', // initiated, ringing, in_progress, completed, failed
      agentId: callData.agentId || 'default',
      duration: 0,
      recordingUrl: null,
      transcript: [],
      customerContext: callData.customerContext || {},
      metadata: callData.metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      endedAt: null
    };

    calls.push(newCall);
    this.writeCalls(calls);

    console.log(`💾 Call record created: ${newCall.id}`);
    return newCall;
  }

  /**
   * Update call record
   */
  async updateCall(callId, updates) {
    const calls = this.readCalls();
    const index = calls.findIndex(c => c.id === callId);

    if (index === -1) {
      throw new Error(`Call not found: ${callId}`);
    }

    calls[index] = {
      ...calls[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.writeCalls(calls);
    return calls[index];
  }

  /**
   * Get call by ID
   */
  async getCall(callId) {
    const calls = this.readCalls();
    return calls.find(c => c.id === callId) || null;
  }

  /**
   * Get call by Exotel SID
   */
  async getCallByExotelSid(exotelCallSid) {
    const calls = this.readCalls();
    return calls.find(c => c.exotelCallSid === exotelCallSid) || null;
  }

  /**
   * Get all calls
   */
  async getAllCalls(filters = {}) {
    let calls = this.readCalls();

    // Apply filters
    if (filters.phoneNumber) {
      calls = calls.filter(c => c.phoneNumber === filters.phoneNumber);
    }
    if (filters.direction) {
      calls = calls.filter(c => c.direction === filters.direction);
    }
    if (filters.status) {
      calls = calls.filter(c => c.status === filters.status);
    }
    if (filters.agentId) {
      calls = calls.filter(c => c.agentId === filters.agentId);
    }

    // Sort by most recent first
    calls.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return calls;
  }

  /**
   * Add message to call transcript
   */
  async addCallLog(callId, logData) {
    const callLogs = this.readCallLogs();
    
    const newLog = {
      id: uuidv4(),
      callId: callId,
      type: logData.type, // 'user', 'assistant', 'system'
      content: logData.content,
      audioUrl: logData.audioUrl || null,
      timestamp: new Date().toISOString()
    };

    callLogs.push(newLog);
    this.writeCallLogs(callLogs);

    // Also update call's transcript
    const call = await this.getCall(callId);
    if (call) {
      call.transcript.push({
        type: newLog.type,
        content: newLog.content,
        timestamp: newLog.timestamp
      });
      await this.updateCall(callId, { transcript: call.transcript });
    }

    return newLog;
  }

  /**
   * Get call logs for a specific call
   */
  async getCallLogs(callId) {
    const callLogs = this.readCallLogs();
    return callLogs.filter(log => log.callId === callId);
  }

  /**
   * Delete call (for cleanup/testing)
   */
  async deleteCall(callId) {
    let calls = this.readCalls();
    calls = calls.filter(c => c.id !== callId);
    this.writeCalls(calls);

    // Also delete call logs
    let callLogs = this.readCallLogs();
    callLogs = callLogs.filter(log => log.callId !== callId);
    this.writeCallLogs(callLogs);

    console.log(`🗑️  Call deleted: ${callId}`);
  }

  /**
   * Read calls from file
   */
  readCalls() {
    try {
      const data = fs.readFileSync(CALLS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading calls file:', error);
      return [];
    }
  }

  /**
   * Write calls to file
   */
  writeCalls(calls) {
    try {
      fs.writeFileSync(CALLS_FILE, JSON.stringify(calls, null, 2));
    } catch (error) {
      console.error('Error writing calls file:', error);
    }
  }

  /**
   * Read call logs from file
   */
  readCallLogs() {
    try {
      const data = fs.readFileSync(CALL_LOGS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading call logs file:', error);
      return [];
    }
  }

  /**
   * Write call logs to file
   */
  writeCallLogs(callLogs) {
    try {
      fs.writeFileSync(CALL_LOGS_FILE, JSON.stringify(callLogs, null, 2));
    } catch (error) {
      console.error('Error writing call logs file:', error);
    }
  }
}

// Export singleton instance
const callStorageService = new CallStorageService();
export default callStorageService;
