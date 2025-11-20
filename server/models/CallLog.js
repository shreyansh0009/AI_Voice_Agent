import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const callLogSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4(), index: true },
  callId: { type: String, required: true, index: true },
  type: { type: String, enum: ['user', 'assistant', 'system', 'error'], required: true },
  content: { type: String, required: true },
  audioUrl: { type: String, default: null },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: false });

export default mongoose.models.CallLog || mongoose.model('CallLog', callLogSchema);
