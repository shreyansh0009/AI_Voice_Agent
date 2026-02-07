import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  walletBalance: { type: Number, default: 0 },
  walletCurrency: { type: String, default: 'USD' },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('User', userSchema);
