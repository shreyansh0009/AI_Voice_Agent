import mongoose from 'mongoose';

// Cache the connection for serverless environments
let cachedConnection = null;
let isConnecting = false;
let connectionPromise = null;

export async function connectDB() {
  // If we have a cached connection and it's connected, reuse it
  if (cachedConnection && mongoose.connection.readyState === 1) {
    console.log('✅ Using cached database connection');
    return cachedConnection;
  }

  // If we're already connecting, wait for that connection
  if (isConnecting && connectionPromise) {
    console.log('⏳ Waiting for existing connection attempt...');
    return connectionPromise;
  }

  try {
    isConnecting = true;
    
    // IMPORTANT: Set bufferCommands to true for serverless
    mongoose.set('bufferCommands', true);
    
    // Set strict query mode
    mongoose.set('strictQuery', true);

    console.log('🔄 Connecting to MongoDB...');
    
    connectionPromise = mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000, 
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 1,
    });

    const conn = await connectionPromise;

    cachedConnection = conn;
    isConnecting = false;
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    isConnecting = false;
    connectionPromise = null;
    cachedConnection = null;
    console.error('❌ MongoDB connection error:', error.message);
    throw error; // Throw in auth routes so they return proper errors
  }
}

export default connectDB;
