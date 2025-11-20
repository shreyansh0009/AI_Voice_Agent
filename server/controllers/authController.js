import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { cookieOptions } from '../middleware/cookieConfig.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN;
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10;

export const signup = async (req, res) => {
  try {
    // TODO: Add rate limiting here for production
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email and password required." });
    // Basic email format validation
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!emailRegex.test(email))
      return res.status(400).json({ message: "Invalid email format." });
    // Password policy: min 8 chars, at least 1 letter and 1 number
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password))
      return res.status(400).json({ message: "Password must be at least 8 characters and include a letter and a number." });
    const existing = await User.findOne({ email });
    if (existing)
      return res.status(409).json({ message: "Email already registered." });
    // Always create public signups as 'user' to prevent role escalation
    const safeRole = 'user';
    const hashed = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const user = new User({ email, password: hashed, role: safeRole });
    await user.save();
    res.status(201).json({ message: "User created." });
  } catch (err) {
    res.status(500).json({ message: "Signup failed.", error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    // TODO: Add rate limiting here for production
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
    const refreshToken = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, {
      expiresIn: JWT_REFRESH_EXPIRES_IN,
    });
    user.refreshToken = refreshToken;
    await user.save();
    res
      .cookie('refreshToken', refreshToken, cookieOptions)
      .json({ accessToken, role: user.role });
  } catch (err) {
    res.status(500).json({ message: "Login failed.", error: err.message });
  }
};

export const refreshToken = async (req, res) => {
  try {
    // Accept refresh token from cookie (httpOnly) or request body
    const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken;
    if (!refreshToken) return res.status(400).json({ message: 'Refresh token required.' });

    let payload;
    try {
      payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(403).json({ message: 'Invalid or expired refresh token.' });
    }
    const user = await User.findById(payload.id);
    if (!user || user.refreshToken !== refreshToken)
      return res.status(403).json({ message: "Invalid refresh token." });
    const newAccessToken = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    const newRefreshToken = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, {
      expiresIn: JWT_REFRESH_EXPIRES_IN,
    });
    user.refreshToken = newRefreshToken;
    await user.save();
    res
      .cookie('refreshToken', newRefreshToken, cookieOptions)
      .json({ accessToken: newAccessToken });
  } catch (err) {
    res
      .status(401)
      .json({ message: "Token refresh failed.", error: err.message });
  }
};

export const logout = async (req, res) => {
  try {
    // Accept refresh token from cookie (httpOnly) or request body
    const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken;
    if (!refreshToken) return res.status(400).json({ message: 'Refresh token required.' });

    let payload;
    try {
      payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(403).json({ message: 'Invalid or expired refresh token.' });
    }

    const user = await User.findById(payload.id);
    if (user) {
      user.refreshToken = null;
      await user.save();
    }
    res
      .clearCookie('refreshToken', cookieOptions)
      .json({ message: 'Logged out.' });
  } catch (err) {
    res.status(401).json({ message: "Logout failed.", error: err.message });
  }
};
