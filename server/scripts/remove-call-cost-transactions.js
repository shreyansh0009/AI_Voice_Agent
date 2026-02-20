/**
 * Migration: Remove call-cost debit transactions from the database.
 *
 * Call-cost records have `metadata.callId` set. These should not appear
 * in invoices — invoices should only contain purchases, subscriptions,
 * and wallet top-ups.
 *
 * Usage:
 *   cd server
 *   node scripts/remove-call-cost-transactions.js
 *
 * The script is idempotent — running it multiple times is safe.
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set in env. Aborting.');
    process.exit(1);
}

async function run() {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected.');

    // Count matching docs first
    const count = await Transaction.countDocuments({
        'metadata.callId': { $exists: true },
    });

    if (count === 0) {
        console.log('ℹ️  No call-cost transactions found. Nothing to delete.');
    } else {
        console.log(`🗑️  Found ${count} call-cost transaction(s). Deleting...`);
        const result = await Transaction.deleteMany({
            'metadata.callId': { $exists: true },
        });
        console.log(`✅ Deleted ${result.deletedCount} transaction(s).`);
    }

    await mongoose.disconnect();
    console.log('🔌 Disconnected. Done.');
}

run().catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
