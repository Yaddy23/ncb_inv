const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  loginUser,
  getUserProfile,
  registerUser,
  changePassword,
  adminResetUserPassword,
  updateProfile,
  getAllUsers,
  updateUser,
  deleteUser,
  logoutUser,
  refreshToken,
  getSessions,
  getAllSessions,
  revokeSession,
  revokeAllSessions,
  revokeUserSessions,
} = require('../controllers/authController');

// Login rate limiter: 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many login attempts from this IP. Try again in 15 minutes.' }
});

// Register rate limiter: 5 attempts per 15 minutes per IP
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many registration attempts from this IP. Try again in 15 minutes.' }
});

// Refresh rate limiter: 30 attempts per 15 minutes per IP
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many token refresh attempts from this IP. Try again in 15 minutes.' }
});

// Public routes
router.post('/login', loginLimiter, loginUser);
router.post('/refresh', refreshLimiter, refreshToken);
router.post('/register', protect, admin, registerLimiter, registerUser);

// Protected routes
router.get('/me', protect, getUserProfile);
router.post('/register', protect, admin, registerUser);
router.put('/change-password', protect, changePassword);
router.put('/profile', protect, updateProfile);
router.post('/logout', protect, logoutUser);

// Session management
router.get('/sessions', protect, getSessions);
router.delete('/sessions', protect, revokeAllSessions);
router.delete('/sessions/:sessionId', protect, revokeSession);

// Admin only routes - User Management
router.get('/users', protect, admin, getAllUsers);
router.put('/users/:id', protect, admin, updateUser);
router.put('/users/:id/password', protect, admin, adminResetUserPassword);
router.delete('/users/:id', protect, admin, deleteUser);
router.delete('/users/:id/sessions', protect, admin, revokeUserSessions);
router.get('/admin/sessions', protect, admin, getAllSessions);

module.exports = router;