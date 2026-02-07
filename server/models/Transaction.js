import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['credit', 'debit'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'USD'
    },
    description: {
        type: String,
        required: true
    },
    // Razorpay specific fields
    razorpayOrderId: {
        type: String,
        index: true
    },
    razorpayPaymentId: {
        type: String,
        index: true
    },
    razorpaySignature: {
        type: String
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, { timestamps: true });

// Index for fetching user transactions
transactionSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Transaction', transactionSchema);
