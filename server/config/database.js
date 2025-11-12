import mongoose from 'mongoose';

// Cache the connection for serverless environments
let cachedConnection = null;

export async function connectDB() {
  // If we have a cached connection and it's connected, reuse it
  if (cachedConnection && mongoose.connection.readyState === 1) {
    console.log('✅ Using cached database connection');
    return cachedConnection;
  }

  try {
    // Set mongoose to not buffer commands if not connected
    mongoose.set('bufferCommands', false);
    
    // Set strict query mode
    mongoose.set('strictQuery', true);

    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s
      maxPoolSize: 10, // Maintain up to 10 socket connections
      minPoolSize: 1, // Maintain at least 1 socket connection
    });

    cachedConnection = conn;
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    // Don't throw in serverless - allow graceful degradation
    cachedConnection = null;
    return null;
  }
}

export default connectDB;
