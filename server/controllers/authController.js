import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // 7 days default
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10;

export const signup = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email and password required." });
    
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!emailRegex.test(email))
      return res.status(400).json({ message: "Invalid email format." });
    
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password))
      return res.status(400).json({ message: "Password must be at least 8 characters and include a letter and a number." });
    
    const existing = await User.findOne({ email });
    if (existing)
      return res.status(409).json({ message: "Email already registered." });
    
    const hashed = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const user = new User({ email, password: hashed, role: 'user' });
    await user.save();
    
    // Auto-login after signup
    const accessToken = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    res.status(201).json({ 
      message: "User created.", 
      accessToken, 
      role: user.role 
    });
  } catch (err) {
    res.status(500).json({ message: "Signup failed.", error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials." });
    
    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ message: "Invalid credentials." });
    
    const accessToken = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    res.json({ accessToken, role: user.role });
  } catch (err) {
    res.status(500).json({ message: "Login failed.", error: err.message });
  }
};

export const logout = async (req, res) => {
  // With JWT-only auth, logout is handled client-side by removing token
  res.json({ message: 'Logged out successfully.' });
};

export const verifyToken = async (req, res) => {
  // Endpoint to verify if current token is valid
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ message: 'No token provided.' });
    
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.id).select('-password');
    
    if (!user) return res.status(404).json({ message: 'User not found.' });
    
    res.json({ 
      valid: true, 
      role: user.role,
      id: user._id 
    });
  } catch (err) {
    res.status(403).json({ message: 'Invalid or expired token.' });
  }
};
