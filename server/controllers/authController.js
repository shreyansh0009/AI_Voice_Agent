import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { connectDB } from "../config/database.js";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // 7 days default
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10;

export const signup = async (req, res) => {
  console.log('🔵 SIGNUP: Handler started', { body: req.body });
  
  try {
    // Ensure database connection before any DB operations
    console.log('🔵 SIGNUP: Ensuring database connection...');
    await connectDB();
    console.log('✅ SIGNUP: Database connected');
    
    const { email, password } = req.body;
    console.log('🔵 SIGNUP: Extracted credentials', { email: email ? 'present' : 'missing', password: password ? 'present' : 'missing' });
    
    if (!email || !password) {
      console.log('🔴 SIGNUP: Missing credentials');
      return res.status(400).json({ message: "Email and password required." });
    }
    
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!emailRegex.test(email)) {
      console.log('🔴 SIGNUP: Invalid email format', { email });
      return res.status(400).json({ message: "Invalid email format." });
    }
    
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      console.log('🔴 SIGNUP: Weak password');
      return res.status(400).json({ message: "Password must be at least 8 characters and include a letter and a number." });
    }
    
    console.log('🔵 SIGNUP: Checking for existing user');
    const existing = await User.findOne({ email });
    if (existing) {
      console.log('🔴 SIGNUP: Email already registered', { email });
      return res.status(409).json({ message: "Email already registered." });
    }
    
    console.log('🔵 SIGNUP: Hashing password');
    const hashed = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    
    console.log('🔵 SIGNUP: Creating user');
    const user = new User({ email, password: hashed, role: 'user' });
    await user.save();
    
    console.log('🔵 SIGNUP: User created, generating token', { userId: user._id });
    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    console.log('✅ SIGNUP: Success', { userId: user._id, role: user.role });
    res.status(201).json({ 
      message: "User created.", 
      token, 
      role: user.role 
    });
  } catch (err) {
    console.error('❌ SIGNUP: Error', {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    res.status(500).json({ message: "Signup failed.", error: err.message });
  }
};

export const login = async (req, res) => {
  console.log('🔵 LOGIN: Handler started', { 
    body: req.body,
    headers: req.headers,
    JWT_SECRET: JWT_SECRET ? 'present' : 'MISSING',
    BCRYPT_SALT_ROUNDS
  });
  
  try {
    // Ensure database connection before any DB operations
    console.log('🔵 LOGIN: Ensuring database connection...');
    await connectDB();
    console.log('✅ LOGIN: Database connected');
    
    const { email, password } = req.body;
    console.log('🔵 LOGIN: Extracted credentials', { 
      email: email ? email : 'missing', 
      password: password ? 'present' : 'missing',
      passwordLength: password ? password.length : 0,
      passwordType: typeof password
    });
    
    if (!email || !password) {
      console.log('🔴 LOGIN: Missing credentials');
      return res.status(400).json({ message: "Email and password required." });
    }
    
    console.log('🔵 LOGIN: Searching for user in database', { email });
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log('🔴 LOGIN: User not found', { email });
      return res.status(401).json({ message: "Invalid credentials." });
    }
    
    console.log('🔵 LOGIN: User found', { 
      userId: user._id,
      email: user.email,
      hashedPasswordLength: user.password ? user.password.length : 0,
      hashedPasswordStart: user.password ? user.password.substring(0, 10) : 'none'
    });
    
    console.log('🔵 LOGIN: Starting password comparison', {
      plainPasswordLength: password.length,
      hashedPasswordLength: user.password.length,
      plainPasswordSample: password.substring(0, 3) + '***',
      hashedPasswordSample: user.password.substring(0, 10) + '...'
    });
    
    const match = await bcrypt.compare(password, user.password);
    
    console.log('🔵 LOGIN: Password comparison result', { 
      match,
      userId: user._id 
    });
    
    if (!match) {
      console.log('🔴 LOGIN: Password mismatch', { 
        userId: user._id,
        attemptedEmail: email
      });
      return res.status(401).json({ message: "Invalid credentials." });
    }
    
    console.log('🔵 LOGIN: Password matched, generating token', { 
      userId: user._id, 
      role: user.role 
    });
    
    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    console.log('✅ LOGIN: Success', { userId: user._id, role: user.role });
    res.json({ token, role: user.role });
  } catch (err) {
    console.error('❌ LOGIN: Error caught', {
      message: err.message,
      stack: err.stack,
      name: err.name,
      code: err.code
    });
    res.status(500).json({ 
      message: "Login failed.", 
      error: err.message,
      errorName: err.name 
    });
  }
};

export const logout = async (req, res) => {
  console.log('🔵 LOGOUT: Handler called');
  res.json({ message: 'Logged out successfully.' });
};

export const verifyToken = async (req, res) => {
  console.log('🔵 VERIFY: Handler started', { 
    headers: req.headers,
    JWT_SECRET: JWT_SECRET ? 'present' : 'MISSING'
  });
  
  try {
    // Ensure database connection
    await connectDB();
    
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    console.log('🔵 VERIFY: Token extracted', { token: token ? 'present' : 'missing' });
    
    if (!token) {
      console.log('🔴 VERIFY: No token provided');
      return res.status(401).json({ message: 'No token provided.' });
    }
    
    console.log('🔵 VERIFY: Verifying token');
    const payload = jwt.verify(token, JWT_SECRET);
    console.log('🔵 VERIFY: Token verified', { payload });
    
    console.log('🔵 VERIFY: Finding user', { userId: payload.id });
    const user = await User.findById(payload.id).select('-password');
    
    if (!user) {
      console.log('🔴 VERIFY: User not found', { userId: payload.id });
      return res.status(404).json({ message: 'User not found.' });
    }
    
    console.log('✅ VERIFY: Success', { userId: user._id, role: user.role });
    res.json({ 
      valid: true, 
      role: user.role,
      id: user._id 
    });
  } catch (err) {
    console.error('❌ VERIFY: Error', {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    res.status(403).json({ message: 'Invalid or expired token.' });
  }
};
