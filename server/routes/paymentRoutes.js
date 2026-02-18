import express from 'express';
import {
    createOrder,
    verifyPayment,
    getWalletBalance,
    getTransactions,
    deductFromWallet
} from '../controllers/paymentController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(authenticate);

// Create Razorpay order for adding funds
router.post('/create-order', createOrder);

// Verify payment after Razorpay checkout
router.post('/verify', verifyPayment);
router.post('/verify-payment', verifyPayment); // alias used by client components

// Get wallet balance
router.get('/wallet', getWalletBalance);

// Get transaction history
router.get('/transactions', getTransactions);

// Deduct from wallet (for purchases)
router.post('/deduct', deductFromWallet);

export default router;
