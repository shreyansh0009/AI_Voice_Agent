import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true,
  },
  originalName: {
    type: String,
    required: true,
  },
  cloudinaryUrl: {
    type: String,
    required: true,
  },
  cloudinaryPublicId: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    required: true,
  },
  mimeType: {
    type: String,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  processedForRAG: {
    type: Boolean,
    default: false,
  },
});

const File = mongoose.model('File', fileSchema);

export default File;
