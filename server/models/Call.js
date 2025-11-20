import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const transcriptSchema = new mongoose.Schema({
  type: { type: String, enum: ['user', 'assistant', 'system', 'error'], required: true },
  content: { type: String, required: true },
  audioUrl: { type: String },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const callSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4(), index: true },
  exotelCallSid: { type: String, default: null },
  phoneNumber: { type: String, required: true },
  direction: { type: String, enum: ['inbound', 'outbound'], default: 'outbound' },
  status: { type: String, default: 'initiated' },
  agentId: { type: String, default: 'default' },
  duration: { type: Number, default: 0 },
  recordingUrl: { type: String, default: null },
  transcript: { type: [transcriptSchema], default: [] },
  customerContext: { type: mongoose.Schema.Types.Mixed, default: {} },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.models.Call || mongoose.model('Call', callSchema);
