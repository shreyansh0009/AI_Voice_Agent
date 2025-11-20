import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // hashed with bcrypt
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  refreshToken: { type: String },
}, { timestamps: true });

export default mongoose.model('User', userSchema);
