import Razorpay from 'razorpay';
import crypto from 'crypto';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// USD to INR conversion rate (Razorpay accepts INR)
const USD_TO_INR = 83;

/**
 * Create a Razorpay order for adding funds
 */
export const createOrder = async (req, res) => {
    try {
        const { amount } = req.body; // Amount in USD
        const userId = req.user.id;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid amount'
            });
        }

        // Convert USD to INR (paise)
        const amountInPaise = Math.round(amount * USD_TO_INR * 100);

        const options = {
            amount: amountInPaise,
            currency: 'INR',
            receipt: `w_${Date.now()}`,
            notes: {
                userId: userId,
                amountUSD: amount,
                type: 'wallet_topup'
            }
        };

        const order = await razorpay.orders.create(options);

        // Create pending transaction
        await Transaction.create({
            userId,
            type: 'credit',
            amount,
            currency: 'USD',
            description: 'Wallet top-up',
            razorpayOrderId: order.id,
            status: 'pending'
        });

        res.json({
            success: true,
            order: {
                id: order.id,
                amount: order.amount,
                currency: order.currency,
                amountUSD: amount
            },
            key: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create payment order'
        });
    }
};

/**
 * Verify payment and credit wallet
 */
export const verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        const userId = req.user.id;

        // Verify signature
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            // Update transaction as failed
            await Transaction.findOneAndUpdate(
                { razorpayOrderId: razorpay_order_id },
                { status: 'failed' }
            );

            return res.status(400).json({
                success: false,
                error: 'Invalid payment signature'
            });
        }

        // Find and update transaction
        const transaction = await Transaction.findOne({ razorpayOrderId: razorpay_order_id });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found'
            });
        }

        if (transaction.status === 'completed') {
            return res.status(400).json({
                success: false,
                error: 'Payment already processed'
            });
        }

        // Update transaction
        transaction.razorpayPaymentId = razorpay_payment_id;
        transaction.razorpaySignature = razorpay_signature;
        transaction.status = 'completed';
        await transaction.save();

        // Credit user wallet
        const user = await User.findByIdAndUpdate(
            userId,
            { $inc: { walletBalance: transaction.amount } },
            { new: true }
        );

        res.json({
            success: true,
            message: 'Payment verified successfully',
            walletBalance: user.walletBalance
        });
    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to verify payment'
        });
    }
};

/**
 * Get wallet balance
 */
export const getWalletBalance = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('walletBalance walletCurrency');

        res.json({
            success: true,
            balance: user.walletBalance,
            currency: user.walletCurrency
        });
    } catch (error) {
        console.error('Error fetching wallet:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch wallet balance'
        });
    }
};

/**
 * Get transaction history
 */
export const getTransactions = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;

        const transactions = await Transaction.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .lean();

        const total = await Transaction.countDocuments({ userId: req.user.id });

        res.json({
            success: true,
            transactions,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch transactions'
        });
    }
};

/**
 * Deduct from wallet (for purchases)
 */
export const deductFromWallet = async (req, res) => {
    try {
        const { amount, description } = req.body;
        const userId = req.user.id;

        const user = await User.findById(userId);

        if (user.walletBalance < amount) {
            return res.status(400).json({
                success: false,
                error: 'Insufficient wallet balance'
            });
        }

        // Deduct from wallet
        user.walletBalance -= amount;
        await user.save();

        // Create debit transaction
        await Transaction.create({
            userId,
            type: 'debit',
            amount,
            currency: 'USD',
            description: description || 'Purchase',
            status: 'completed'
        });

        res.json({
            success: true,
            message: 'Amount deducted successfully',
            walletBalance: user.walletBalance
        });
    } catch (error) {
        console.error('Error deducting from wallet:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to deduct from wallet'
        });
    }
};
