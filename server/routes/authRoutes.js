import express from 'express';
import { signup, login, logout, verifyToken } from '../controllers/authController.js';

const router = express.Router();
router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', logout);
router.get('/verify', verifyToken);

export default router;
